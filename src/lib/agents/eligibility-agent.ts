/**
 * Agent 1: Eligibility Agent
 *
 * SCOPE: Verify patient eligibility, coverage, COB, and authorization status
 * HANDLES: CO-27, CO-109, PR-1, PR-2, OA-23, CO-50, CO-197
 * FORBIDDEN: Cannot suggest coding changes, cannot modify CPT/ICD codes
 *
 * Anti-Hallucination:
 * - Only works with eligibility-related denial codes
 * - Never invents patient coverage data
 * - If eligibility cannot be verified, flags for human review
 * - All "strategies" are rule-based, not AI-generated
 */

import { z } from 'zod';
import { BaseAgentV2, AgentTaskResult } from './base-agent-v2';
import { denialDataTool, payerRulesTool, eligibilityTool } from './tool-registry';

// ─── OUTPUT SCHEMA ────────────────────────────────────────────────────────────

export const EligibilityOutputSchema = z.object({
  eligibilityStatus: z.enum(['verified', 'not_covered', 'coverage_lapsed', 'cob_issue', 'patient_responsibility', 'auth_required', 'unknown']),
  coverageVerified: z.boolean(),
  coverageDetails: z.object({
    wasCoveredOnDOS: z.boolean(),
    coverageDates: z.object({
      start: z.string().nullable(),
      end: z.string().nullable(),
    }),
    planType: z.string().nullable(),
  }),
  cobAnalysis: z.object({
    hasCOBIssue: z.boolean(),
    primaryPayer: z.string().nullable(),
    secondaryPayer: z.string().nullable(),
    resolutionStrategy: z.string().nullable(),
  }),
  authorizationStatus: z.object({
    authRequired: z.boolean(),
    authObtained: z.boolean(),
    retroAuthEligible: z.boolean(),
    retroAuthSteps: z.array(z.string()),
  }),
  recommendedAction: z.enum(['resubmit_with_verification', 'resubmit_correct_payer', 'pursue_retro_auth', 'bill_patient', 'appeal_coverage', 'human_review']),
  actionSteps: z.array(z.object({
    step: z.string(),
    reason: z.string(),
    priority: z.enum(['immediate', 'high', 'normal']),
  })),
  confidenceScore: z.number().min(0).max(1),
  requiresHumanReview: z.boolean(),
  humanReviewReason: z.string().nullable(),
});

export type EligibilityOutput = z.infer<typeof EligibilityOutputSchema>;

// ─── AGENT ─────────────────────────────────────────────────────────────────────

export class EligibilityAgent extends BaseAgentV2 {
  constructor() {
    super(
      'eligibility-agent',
      'Verifies patient eligibility, coverage status, COB resolution, and prior authorization requirements',
      {
        allowedDenialCodes: ['CO-27', 'CO-109', 'PR-1', 'PR-2', 'OA-23', 'CO-50', 'CO-197'],
        allowedOperations: ['eligibility_check', 'cob_analysis', 'auth_verification', 'coverage_verification'],
        forbiddenActions: [
          'suggest_coding_changes',
          'modify_cpt_codes',
          'modify_icd_codes',
          'generate_appeal_letters',
          'suggest_modifiers',
        ],
        requiredInputFields: ['denialId'],
      },
      EligibilityOutputSchema,
    );
    this.registerTool(denialDataTool);
    this.registerTool(payerRulesTool);
    this.registerTool(eligibilityTool);
  }

  async execute(taskType: string, input: Record<string, unknown>, taskId?: string): Promise<AgentTaskResult> {
    return this.executeWithGuardrails(taskType, input, taskId, async () => {
      const denialId = input.denialId as string;
      const denial = await this.useTool('denial_data', { action: 'get', denialId }) as Record<string, unknown> | null;
      if (!denial) {
        return { success: false, output: { error: 'Denial not found' }, confidence: 0, toolsUsed: ['denial_data'] };
      }

      const carcCode = denial.carcCode as string;
      const payerName = denial.payerName as string;

      // Get payer rules for this payer
      const payerRules = await this.useTool('payer_rules', {
        payerName,
        ruleType: 'filing_deadline',
      }) as Record<string, unknown>;

      // Get eligibility resolution strategies
      const eligibilityInfo = await this.useTool('eligibility_resolver', {
        denialId,
        payerName,
        patientMemberId: denial.patientMemberId as string | undefined,
        carcCode,
      }) as Record<string, unknown>;

      // Determine eligibility status (rule-based, no AI)
      const status = this.determineEligibilityStatus(carcCode);
      const coverageDetails = this.buildCoverageDetails(denial);
      const cobAnalysis = this.analyzeCOB(denial);
      const authStatus = this.checkAuthorization(denial, payerRules);
      const action = this.determineRecommendedAction(carcCode, status, cobAnalysis, authStatus);
      const steps = this.generateActionSteps(action, carcCode, cobAnalysis, authStatus);

      // Calculate confidence based on data completeness
      const confidence = this.calculateConfidence(denial, eligibilityInfo);

      // Determine if human review needed
      const requiresHumanReview = !coverageDetails.wasCoveredOnDOS || confidence < 0.6;

      const result: EligibilityOutput = {
        eligibilityStatus: status,
        coverageVerified: coverageDetails.wasCoveredOnDOS,
        coverageDetails,
        cobAnalysis,
        authorizationStatus: authStatus,
        recommendedAction: action,
        actionSteps: steps,
        confidenceScore: confidence,
        requiresHumanReview,
        humanReviewReason: requiresHumanReview
          ? coverageDetails.wasCoveredOnDOS
            ? 'Low confidence in eligibility determination — human verification needed'
            : 'Coverage could not be verified on date of service — human review required'
          : null,
      };

      // Remember eligibility patterns
      await this.remember(
        `eligibility:${carcCode}:${payerName}`,
        { status, action, successRate: null },
        'pattern',
        confidence,
      );

      return {
        success: true,
        output: result as unknown as Record<string, unknown>,
        confidence,
        toolsUsed: ['denial_data', 'payer_rules', 'eligibility_resolver'],
        requiresHumanApproval: requiresHumanReview,
        humanApprovalReason: requiresHumanReview ? 'Eligibility could not be automatically verified' : undefined,
        nextActions: action === 'resubmit_correct_payer'
          ? [{ agent: 'scrubber-agent', task: 'pre_submission_check', input: { denialId, correctionType: 'payer_change' } }]
          : action === 'pursue_retro_auth' || action === 'appeal_coverage'
          ? [{ agent: 'appeal-agent', task: 'generate_appeal_strategy', input: { denialId, appealType: 'first_level', denialCategory: 'eligibility' } }]
          : [],
      };
    });
  }

  // ─── RULE-BASED METHODS (NO AI, NO HALLUCINATION) ────────────────────

  private determineEligibilityStatus(
    carcCode: string,
  ): EligibilityOutput['eligibilityStatus'] {
    const statusMap: Record<string, EligibilityOutput['eligibilityStatus']> = {
      'CO-109': 'not_covered',
      'CO-27': 'coverage_lapsed',
      'PR-1': 'patient_responsibility',
      'PR-2': 'patient_responsibility',
      'OA-23': 'cob_issue',
      'CO-50': 'auth_required',
      'CO-197': 'auth_required',
    };
    return statusMap[carcCode] || 'unknown';
  }

  private buildCoverageDetails(denial: Record<string, unknown>): EligibilityOutput['coverageDetails'] {
    // We cannot invent coverage data — only state what we know
    const hasCoverageInfo = denial.patientMemberId || denial.insuranceId;
    return {
      wasCoveredOnDOS: hasCoverageInfo ? null : false, // null = unknown, not false
      coverageDates: {
        start: null, // We don't have this data — flag for human
        end: null,
      },
      planType: (denial.planType as string) || null,
    };
  }

  private analyzeCOB(denial: Record<string, unknown>): EligibilityOutput['cobAnalysis'] {
    const carcCode = denial.carcCode as string;
    if (carcCode === 'OA-23' || denial.adjustmentGroupCode === 'OA') {
      return {
        hasCOBIssue: true,
        primaryPayer: null, // Unknown — human must verify
        secondaryPayer: null,
        resolutionStrategy: 'Verify primary/secondary payer order with patient and resubmit to correct payer',
      };
    }
    return { hasCOBIssue: false, primaryPayer: null, secondaryPayer: null, resolutionStrategy: null };
  }

  private checkAuthorization(
    denial: Record<string, unknown>,
    payerRules: Record<string, unknown>,
  ): EligibilityOutput['authorizationStatus'] {
    const carcCode = denial.carcCode as string;
    const authRequired = carcCode === 'CO-50' || carcCode === 'CO-197' || payerRules.authRequired === true;

    const retroAuthEligible = authRequired && (denial.deniedAmount as number) > 500;

    return {
      authRequired,
      authObtained: false, // We don't know — this must be verified by human
      retroAuthEligible,
      retroAuthSteps: authRequired ? [
        'Contact payer to confirm retro-authorization process',
        'Gather clinical documentation supporting medical necessity',
        'Document emergent/urgent circumstances (if applicable)',
        'Submit retro-auth request through payer portal',
        'If retro-auth denied, prepare first-level appeal',
      ] : [],
    };
  }

  private determineRecommendedAction(
    carcCode: string,
    status: EligibilityOutput['eligibilityStatus'],
    cob: EligibilityOutput['cobAnalysis'],
    auth: EligibilityOutput['authorizationStatus'],
  ): EligibilityOutput['recommendedAction'] {
    if (cob.hasCOBIssue) return 'resubmit_correct_payer';
    if (status === 'auth_required' && auth.retroAuthEligible) return 'pursue_retro_auth';
    if (status === 'patient_responsibility') return 'bill_patient';
    if (status === 'not_covered') return 'human_review';
    if (status === 'coverage_lapsed') return 'appeal_coverage';
    return 'human_review';
  }

  private generateActionSteps(
    action: EligibilityOutput['recommendedAction'],
    carcCode: string,
    cob: EligibilityOutput['cobAnalysis'],
    auth: EligibilityOutput['authorizationStatus'],
  ): EligibilityOutput['actionSteps'] {
    const stepsMap: Record<string, Array<{ step: string; reason: string; priority: 'immediate' | 'high' | 'normal' }>> = {
      resubmit_with_verification: [
        { step: 'Verify patient eligibility with payer for date of service', reason: 'Confirm coverage was active', priority: 'immediate' },
        { step: 'Obtain written eligibility verification', reason: 'Document proof of coverage', priority: 'high' },
        { step: 'Resubmit claim with verification documentation', reason: 'Support claim with proof of coverage', priority: 'normal' },
      ],
      resubmit_correct_payer: [
        { step: 'Contact patient to verify insurance information', reason: 'Identify primary and secondary payers', priority: 'immediate' },
        { step: 'Determine correct primary/secondary payer order', reason: 'Resolve COB issue', priority: 'high' },
        { step: 'Resubmit claim to correct primary payer', reason: 'Route claim to proper payer', priority: 'high' },
      ],
      pursue_retro_auth: [
        { step: 'Contact payer for retro-authorization process', reason: 'CO-50/CO-197 requires auth', priority: 'immediate' },
        { step: 'Gather clinical documentation for medical necessity', reason: 'Support retro-auth application', priority: 'high' },
        { step: 'Submit retro-auth request via payer portal', reason: 'Formal retro-auth submission', priority: 'high' },
      ],
      bill_patient: [
        { step: 'Verify patient deductible and coinsurance status', reason: 'Confirm patient responsibility amount', priority: 'normal' },
        { step: 'Check if secondary insurance covers balance', reason: 'Maximize reimbursement', priority: 'normal' },
        { step: 'Bill patient for responsibility portion', reason: 'Collect patient share', priority: 'normal' },
      ],
      appeal_coverage: [
        { step: 'Gather coverage verification documents', reason: 'Prove coverage was active on DOS', priority: 'immediate' },
        { step: 'Prepare appeal letter citing coverage terms', reason: 'Formal appeal of coverage denial', priority: 'high' },
      ],
      human_review: [
        { step: 'Flag for human review — cannot determine eligibility automatically', reason: 'Insufficient data for automated resolution', priority: 'immediate' },
      ],
    };
    return stepsMap[action] || stepsMap.human_review;
  }

  private calculateConfidence(
    denial: Record<string, unknown>,
    eligibilityInfo: Record<string, unknown>,
  ): number {
    let confidence = 0.5; // Start neutral

    // Boost: Have patient member ID
    if (denial.patientMemberId) confidence += 0.1;
    // Boost: Have insurance ID
    if (denial.insuranceId) confidence += 0.1;
    // Boost: Have eligibility strategies from tool
    if (eligibilityInfo.strategies) confidence += 0.15;
    // Boost: Known CARC code
    if (['CO-109', 'PR-1', 'PR-2', 'OA-23', 'CO-50', 'CO-197'].includes(denial.carcCode as string)) confidence += 0.15;

    // Cap at 0.95
    return Math.min(confidence, 0.95);
  }
}

export const eligibilityAgent = new EligibilityAgent();
