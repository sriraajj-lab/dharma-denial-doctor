/**
 * Agent 2: Demographics Agent
 *
 * SCOPE: Validate patient demographics — name, DOB, insurance ID, group number, address
 * HANDLES: All denial codes that might have demographic root causes (CO-16, CO-15, CO-4 partial)
 * FORBIDDEN: Cannot suggest coding changes, cannot INVENT demographic data
 *
 * Anti-Hallucination:
 * - Pure validation — checks data completeness and format
 * - If data is missing, flags it — NEVER invents patient info
 * - No AI generation — all rule-based checks
 * - Outputs exact fields that need correction, not suggestions for new values
 */

import { z } from 'zod';
import { BaseAgentV2, AgentTaskResult } from './base-agent-v2';
import { denialDataTool } from './tool-registry';

// ─── OUTPUT SCHEMA ────────────────────────────────────────────────────────────

export const DemographicsOutputSchema = z.object({
  validationResult: z.enum(['pass', 'fail', 'warning']),
  fieldValidations: z.array(z.object({
    field: z.string(),
    status: z.enum(['valid', 'missing', 'invalid_format', 'mismatch']),
    currentValue: z.string().nullable(),
    issue: z.string().nullable(),
    // NOTE: No "suggestedValue" — we NEVER invent patient data
    actionRequired: z.enum(['none', 'verify_with_patient', 'verify_with_payer', 'correct_format', 'obtain_from_source']),
  })),
  missingFields: z.array(z.string()),
  formatIssues: z.array(z.object({
    field: z.string(),
    expectedFormat: z.string(),
    actualFormat: z.string().nullable(),
  })),
  completenessScore: z.number().min(0).max(1),
  recommendedAction: z.enum(['no_action', 'verify_demographics', 'correct_and_resubmit', 'obtain_missing_info']),
  confidenceScore: z.number().min(0).max(1),
  requiresHumanReview: z.boolean(),
  humanReviewReason: z.string().nullable(),
});

export type DemographicsOutput = z.infer<typeof DemographicsOutputSchema>;

// ─── VALIDATION RULES ─────────────────────────────────────────────────────────

interface FieldValidationRule {
  field: string;
  label: string;
  required: boolean;
  formatCheck?: (value: string) => { valid: boolean; expectedFormat: string };
}

const DEMOGRAPHICS_FIELDS: FieldValidationRule[] = [
  {
    field: 'patientFirstName',
    label: 'Patient First Name',
    required: true,
  },
  {
    field: 'patientLastName',
    label: 'Patient Last Name',
    required: true,
  },
  {
    field: 'patientDOB',
    label: 'Patient Date of Birth',
    required: true,
    formatCheck: (v) => ({
      valid: /^\d{4}-\d{2}-\d{2}$|^\d{2}\/\d{2}\/\d{4}$/.test(v),
      expectedFormat: 'YYYY-MM-DD or MM/DD/YYYY',
    }),
  },
  {
    field: 'patientMemberId',
    label: 'Member ID',
    required: true,
  },
  {
    field: 'insuranceId',
    label: 'Insurance ID / Policy Number',
    required: true,
  },
  {
    field: 'groupNumber',
    label: 'Group Number',
    required: false,
  },
  {
    field: 'payerName',
    label: 'Payer Name',
    required: true,
  },
  {
    field: 'payerId',
    label: 'Payer ID',
    required: true,
    formatCheck: (v) => ({
      valid: v.length >= 3 && v.length <= 10,
      expectedFormat: '3-10 character payer identifier',
    }),
  },
  {
    field: 'patientAddress1',
    label: 'Patient Address Line 1',
    required: false,
  },
  {
    field: 'patientCity',
    label: 'Patient City',
    required: false,
  },
  {
    field: 'patientState',
    label: 'Patient State',
    required: false,
    formatCheck: (v) => ({
      valid: v.length === 2,
      expectedFormat: '2-letter state code (e.g., NY, CA)',
    }),
  },
  {
    field: 'patientZip',
    label: 'Patient ZIP Code',
    required: false,
    formatCheck: (v) => ({
      valid: /^\d{5}(-\d{4})?$/.test(v),
      expectedFormat: '5-digit or 9-digit ZIP (e.g., 10001 or 10001-1234)',
    }),
  },
  {
    field: 'patientGender',
    label: 'Patient Gender',
    required: false,
    formatCheck: (v) => ({
      valid: ['M', 'F', 'U', 'O'].includes(v.toUpperCase()),
      expectedFormat: 'M, F, U, or O',
    }),
  },
  {
    field: 'subscriberRelationship',
    label: 'Subscriber Relationship',
    required: false,
    formatCheck: (v) => ({
      valid: ['self', 'spouse', 'child', 'other'].includes(v.toLowerCase()),
      expectedFormat: 'self, spouse, child, or other',
    }),
  },
];

// ─── AGENT ─────────────────────────────────────────────────────────────────────

export class DemographicsAgent extends BaseAgentV2 {
  constructor() {
    super(
      'demographics-agent',
      'Validates patient demographic data completeness and format. Flags missing/invalid fields. Never invents patient data.',
      {
        allowedDenialCodes: [], // All codes — demographics issues can cause any denial
        allowedOperations: ['demographics_validation', 'field_check', 'format_validation'],
        forbiddenActions: [
          'invent_patient_data',
          'suggest_coding_changes',
          'modify_cpt_codes',
          'modify_icd_codes',
          'generate_appeal_letters',
        ],
        requiredInputFields: ['denialId'],
      },
      DemographicsOutputSchema,
    );
    this.registerTool(denialDataTool);
  }

  async execute(taskType: string, input: Record<string, unknown>, taskId?: string): Promise<AgentTaskResult> {
    return this.executeWithGuardrails(taskType, input, taskId, async () => {
      const denialId = input.denialId as string;
      const denial = await this.useTool('denial_data', { action: 'get', denialId }) as Record<string, unknown> | null;
      if (!denial) {
        return { success: false, output: { error: 'Denial not found' }, confidence: 0, toolsUsed: ['denial_data'] };
      }

      // Validate each demographics field
      const fieldValidations: DemographicsOutput['fieldValidations'] = [];
      const missingFields: string[] = [];
      const formatIssues: DemographicsOutput['formatIssues'] = [];

      for (const rule of DEMOGRAPHICS_FIELDS) {
        const value = denial[rule.field] as string | undefined | null;
        const stringValue = value ? String(value).trim() : '';

        if (!stringValue) {
          // Field is missing
          fieldValidations.push({
            field: rule.field,
            status: rule.required ? 'missing' : 'valid', // Optional fields are ok if missing
            currentValue: null,
            issue: rule.required ? `${rule.label} is required but missing` : null,
            actionRequired: rule.required ? 'obtain_from_source' : 'none',
          });
          if (rule.required) missingFields.push(rule.field);
        } else if (rule.formatCheck) {
          // Check format
          const formatResult = rule.formatCheck(stringValue);
          if (!formatResult.valid) {
            fieldValidations.push({
              field: rule.field,
              status: 'invalid_format',
              currentValue: stringValue,
              issue: `${rule.label} format is invalid`,
              actionRequired: 'correct_format',
            });
            formatIssues.push({
              field: rule.field,
              expectedFormat: formatResult.expectedFormat,
              actualFormat: stringValue,
            });
          } else {
            fieldValidations.push({
              field: rule.field,
              status: 'valid',
              currentValue: stringValue,
              issue: null,
              actionRequired: 'none',
            });
          }
        } else {
          // Field present, no format check needed
          fieldValidations.push({
            field: rule.field,
            status: 'valid',
            currentValue: stringValue,
            issue: null,
            actionRequired: 'none',
          });
        }
      }

      // Calculate completeness score
      const totalRequired = DEMOGRAPHICS_FIELDS.filter(f => f.required).length;
      const validRequired = fieldValidations.filter(
        f => f.status === 'valid' && DEMOGRAPHICS_FIELDS.find(r => r.field === f.field)?.required
      ).length;
      const completenessScore = totalRequired > 0 ? validRequired / totalRequired : 1;

      // Determine overall result
      let validationResult: DemographicsOutput['validationResult'] = 'pass';
      if (missingFields.length > 0) validationResult = 'fail';
      else if (formatIssues.length > 0) validationResult = 'warning';

      // Recommended action
      let recommendedAction: DemographicsOutput['recommendedAction'] = 'no_action';
      if (missingFields.length > 0) recommendedAction = 'obtain_missing_info';
      else if (formatIssues.length > 0) recommendedAction = 'correct_and_resubmit';
      else if (completenessScore < 0.8) recommendedAction = 'verify_demographics';

      // Confidence is based on data completeness
      const confidence = Math.min(completenessScore + 0.1, 0.95);

      // Human review if critical fields missing
      const requiresHumanReview = missingFields.length > 0 || completenessScore < 0.5;

      const result: DemographicsOutput = {
        validationResult,
        fieldValidations,
        missingFields,
        formatIssues,
        completenessScore,
        recommendedAction,
        confidenceScore: confidence,
        requiresHumanReview,
        humanReviewReason: requiresHumanReview
          ? `${missingFields.length} required demographic field(s) missing: ${missingFields.join(', ')}`
          : null,
      };

      return {
        success: validationResult !== 'fail',
        output: result as unknown as Record<string, unknown>,
        confidence,
        toolsUsed: ['denial_data'],
        requiresHumanApproval: requiresHumanReview,
        humanApprovalReason: requiresHumanReview ? 'Missing critical demographic data — human must obtain' : undefined,
        nextActions: recommendedAction === 'correct_and_resubmit'
          ? [{ agent: 'scrubber-agent', task: 'pre_submission_check', input: { denialId } }]
          : [],
      };
    });
  }
}

export const demographicsAgent = new DemographicsAgent();
