/**
 * Agent 3: Coding Agent (Generates Corrected Codes)
 *
 * SCOPE: Validate CPT/ICD-10 pairing, modifiers, NCCI edits, medical necessity, unbundling
 *        AND generate corrected codes when the old codes are wrong
 * HANDLES: CO-4, CO-11, CO-22, CO-27 (coding-related), CO-97
 * FORBIDDEN: Cannot change patient demographics, cannot generate appeal letters
 *
 * Anti-Hallucination Guardrails (ENHANCED with Brain):
 * - First tries rule-based corrections from NCCI edit tables and coverage rules (highest confidence)
 * - When rule-based corrections are insufficient, uses BRAIN for AI code generation
 * - Brain cross-validates between GPT and Claude for code generation (high-stakes)
 * - AI-generated corrections are ALWAYS marked as 'ai_generated' source with riskLevel: 'high'
 * - AI-generated corrections ALWAYS require human review before use
 * - Deterministic validation: CPT format (4-5 digits), ICD-10 format (letter+digits), NCCI cross-reference
 * - If Brain models disagree, both opinions shown and flagged for human decision
 * - Confidence is capped at 0.75 when any AI-generated correction is present
 */

import { z } from 'zod';
import { BaseAgentV2, AgentTaskResult } from './base-agent-v2';
import { denialDataTool, codingIntelligenceTool, resubmissionIntelligenceTool } from './tool-registry';
import { getBrain, generateCorrectedCodes as brainGenerateCorrectedCodes, analyzeDenial as brainAnalyzeDenial, type BrainResult } from '../brain';
import { parseJSONResponse } from '../azure-openai';
import { DenialAnalysis, CorrectionSuggestion } from '../types';
import { db } from '../db';

// ─── OUTPUT SCHEMA ────────────────────────────────────────────────────────────

export const CodingOutputSchema = z.object({
  analysisResult: z.enum(['coding_error_confirmed', 'coding_may_be_correct', 'medical_necessity_issue', 'bundling_issue', 'modifier_issue', 'unknown']),
  codingFindings: z.array(z.object({
    finding: z.string(),
    severity: z.enum(['critical', 'high', 'medium', 'low']),
    source: z.enum(['ncci_edit', 'coverage_rule', 'modifier_rule', 'coding_guideline', 'ai_analysis', 'ai_generated']),
    correctionAvailable: z.boolean(),
  })),
  ncciEdits: z.array(z.object({
    column1Code: z.string(),
    column2Code: z.string(),
    modifierAllowed: z.boolean(),
    recommendation: z.string(),
  })),
  coverageCheck: z.object({
    isCovered: z.boolean().nullable(),
    lcdReference: z.string().nullable(),
    suggestedDiagnoses: z.array(z.string()),
  }),
  proposedCorrections: z.array(z.object({
    type: z.enum(['code_change', 'modifier_add', 'unbundle', 'diagnosis_change', 'resubmission']),
    field: z.string(),
    currentValue: z.string(),
    proposedValue: z.string(),
    reason: z.string(),
    riskLevel: z.enum(['low', 'medium', 'high']),
    source: z.enum(['ncci_edit', 'coverage_rule', 'modifier_rule', 'coding_guideline', 'ai_generated']),
  })),
  confidenceScore: z.number().min(0).max(1),
  hasAIGeneratedCorrections: z.boolean(),
  requiresHumanReview: z.boolean(),
  humanReviewReason: z.string().nullable(),
  crossValidationResult: z.object({
    performed: z.boolean(),
    agreement: z.enum(['full', 'partial', 'disagreement', 'not_performed']).nullable(),
    providersUsed: z.array(z.string()),
    providerOpinions: z.array(z.object({
      provider: z.string(),
      opinion: z.string(),
    })).nullable(),
  }).optional(),
});

export type CodingOutput = z.infer<typeof CodingOutputSchema>;

// ─── AGENT ─────────────────────────────────────────────────────────────────────

export class CodingAgent extends BaseAgentV2 {
  constructor() {
    super(
      'coding-agent',
      'Validates CPT/ICD-10 coding, NCCI edits, modifier compliance, and medical necessity. Generates corrected codes when original codes are wrong — rule-based first, AI-generated as fallback (always flagged for human review). Uses Brain for cross-validated AI code generation (GPT + Claude).',
      {
        allowedDenialCodes: ['CO-4', 'CO-11', 'CO-22', 'CO-27', 'CO-97'],
        allowedOperations: [
          'coding_validation',
          'code_generation',
          'ncci_edit_check',
          'modifier_validation',
          'coverage_check',
          'medical_necessity_check',
          'correction_suggestion',
          'analyze',
          'correct',
        ],
        forbiddenActions: [
          'change_patient_demographics',
          'generate_appeal_letters',
          'verify_eligibility',
          'check_timely_filing',
          'invent_coding_without_context',
        ],
        requiredInputFields: ['denialId'],
      },
      CodingOutputSchema,
    );
    this.registerTool(denialDataTool);
    this.registerTool(codingIntelligenceTool);
    this.registerTool(resubmissionIntelligenceTool);
  }

  async execute(taskType: string, input: Record<string, unknown>, taskId?: string): Promise<AgentTaskResult> {
    return this.executeWithGuardrails(taskType, input, taskId, async () => {
      const denialId = input.denialId as string;
      const denial = await this.useTool('denial_data', { action: 'get', denialId }) as any;
      if (!denial) {
        return { success: false, output: { error: 'Denial not found' }, confidence: 0, toolsUsed: ['denial_data'] };
      }

      const carcCode = denial.carcCode as string;
      const cptCode = denial.cptCode as string;
      const modifier = denial.modifier as string | undefined;
      const diagnosisCode = denial.diagnosisCode as string;

      // ─── STEP 1: Rule-based coding intelligence (NO AI) ────────────────
      const codingInfo = await this.useTool('coding_intelligence', {
        denialId,
        cptCode,
        modifier,
        diagnosisCode,
        carcCode,
      }) as any;

      // ─── STEP 2: Resubmission intelligence (historical data) ───────────
      const prediction = await this.useTool('resubmission_intelligence', {
        payerName: denial.payerName,
        carcCode,
        cptCode,
        deniedAmount: denial.deniedAmount,
      }) as any;

      // ─── STEP 3: Build findings from rule-based analysis ───────────────
      const findings: CodingOutput['codingFindings'] = [];
      const ncciEdits: CodingOutput['ncciEdits'] = [];
      const proposedCorrections: CodingOutput['proposedCorrections'] = [];

      // NCCI findings
      if (codingInfo?.ncciFindings?.length > 0) {
        for (const ncci of codingInfo.ncciFindings) {
          ncciEdits.push({
            column1Code: ncci.column1Code,
            column2Code: ncci.column2Code,
            modifierAllowed: ncci.modifierAllowed,
            recommendation: ncci.recommendation,
          });
          findings.push({
            finding: `NCCI edit: ${ncci.column1Code} bundles ${ncci.column2Code}`,
            severity: ncci.modifierAllowed ? 'medium' : 'critical',
            source: 'ncci_edit',
            correctionAvailable: ncci.modifierAllowed,
          });
        }
      }

      // Coverage check
      const coverageCheck: CodingOutput['coverageCheck'] = {
        isCovered: codingInfo?.coverage?.isCovered ?? null,
        lcdReference: codingInfo?.coverage?.lcdReference ?? null,
        suggestedDiagnoses: codingInfo?.coverage?.suggestedDiagnoses || [],
      };

      if (coverageCheck.isCovered === false) {
        findings.push({
          finding: `CPT ${cptCode} not covered with diagnosis ${diagnosisCode}`,
          severity: 'high',
          source: 'coverage_rule',
          correctionAvailable: coverageCheck.suggestedDiagnoses.length > 0,
        });
      }

      // Modifier issues
      if (codingInfo?.modifierSuggestions?.length > 0) {
        for (const ms of codingInfo.modifierSuggestions) {
          findings.push({
            finding: `Modifier issue: ${ms.reason}`,
            severity: 'medium',
            source: 'modifier_rule',
            correctionAvailable: true,
          });
        }
      }

      // ─── STEP 4: Build corrections from rule-based sources ─────────────
      if (codingInfo?.corrections?.length > 0) {
        for (const c of codingInfo.corrections) {
          proposedCorrections.push({
            type: c.type === 'unbundle' ? 'unbundle' : c.type === 'modifier_add' ? 'modifier_add' : c.type === 'diagnosis_change' ? 'diagnosis_change' : 'code_change',
            field: c.field,
            currentValue: c.current,
            proposedValue: c.suggested,
            reason: c.riskLevel === 'high'
              ? 'Requires clinical documentation support — verify with provider'
              : 'Based on coding rules and NCCI edit analysis',
            riskLevel: c.riskLevel || 'medium',
            source: c.type === 'unbundle' || c.type === 'modifier_add'
              ? 'ncci_edit'
              : c.type === 'diagnosis_change'
              ? 'coverage_rule'
              : 'coding_guideline',
          });
        }
      }

      // ─── STEP 5: Determine overall result (before AI code gen) ─────────
      let analysisResult: CodingOutput['analysisResult'] = 'unknown';
      if (carcCode === 'CO-4' || carcCode === 'CO-11') analysisResult = findings.some(f => f.source === 'modifier_rule') ? 'modifier_issue' : 'coding_error_confirmed';
      else if (carcCode === 'CO-22') analysisResult = 'bundling_issue';
      else if (carcCode === 'CO-27') analysisResult = coverageCheck.isCovered === false ? 'medical_necessity_issue' : 'coding_may_be_correct';
      else if (carcCode === 'CO-97') analysisResult = 'coding_error_confirmed';

      // ─── STEP 6: AI CODE GENERATION VIA BRAIN (cross-validated) ────────
      // Only triggered if: (a) no rule-based corrections found AND (b) analysis confirms coding error
      let hasAIGeneratedCorrections = false;
      let crossValidationResult: CodingOutput['crossValidationResult'] = {
        performed: false,
        agreement: null,
        providersUsed: [],
        providerOpinions: null,
      };

      if (proposedCorrections.length === 0 &&
          ['coding_error_confirmed', 'modifier_issue', 'bundling_issue', 'medical_necessity_issue'].includes(analysisResult)) {
        try {
          const claimData = {
            claimNumber: denial.claimNumber,
            payerName: denial.payerName,
            dateOfService: denial.dateOfService,
            cptCode,
            modifier,
            diagnosisCode,
            billedAmount: denial.billedAmount,
            deniedAmount: denial.deniedAmount,
            carcCode,
            rarcCode: denial.rarcCode,
          };

          // Use Brain for cross-validated code generation
          const brainResult = await brainGenerateCorrectedCodes(claimData, carcCode);

          // Track cross-validation info
          if (brainResult.crossValidated) {
            crossValidationResult = {
              performed: true,
              agreement: brainResult.crossValidation?.agreement || null,
              providersUsed: brainResult.providers,
              providerOpinions: brainResult.crossValidation?.providerResults?.map(r => ({
                provider: r.provider,
                opinion: r.content.substring(0, 200) + (r.content.length > 200 ? '...' : ''),
              })) || null,
            };
          }

          if (brainResult.parsedContent && brainResult.parsedContent.corrections) {
            const aiCorrections = this.validateAndMapBrainCorrections(
              brainResult.parsedContent.corrections as Array<Record<string, unknown>>,
              brainResult,
            );

            if (aiCorrections.length > 0) {
              proposedCorrections.push(...aiCorrections);
              hasAIGeneratedCorrections = true;

              // Add finding for AI code generation
              const crossValNote = brainResult.crossValidated
                ? (brainResult.crossValidation?.agreement === 'full' ? ' (Cross-validated: GPT + Claude AGREE)' : ' (Cross-validated: Models disagree — human review critical)')
                : '';
              findings.push({
                finding: `AI-generated code correction proposed: ${aiCorrections.map(c => `${c.currentValue} → ${c.proposedValue}`).join(', ')}${crossValNote}`,
                severity: brainResult.crossValidated && brainResult.crossValidation?.agreement === 'full' ? 'low' : 'medium',
                source: 'ai_generated',
                correctionAvailable: true,
              });
            }
          }
        } catch (aiGenError) {
          console.warn('[CodingAgent] Brain code generation failed, rule-based only:', aiGenError);
        }
      }

      // ─── STEP 7: AI ANALYSIS ENHANCEMENT VIA BRAIN ─────────────────────
      let analysis: DenialAnalysis | null = null;
      try {
        const claimData = {
          claimNumber: denial.claimNumber,
          payerName: denial.payerName,
          dateOfService: denial.dateOfService,
          cptCode,
          modifier,
          diagnosisCode,
          billedAmount: denial.billedAmount,
          deniedAmount: denial.deniedAmount,
          carcCode,
          rarcCode: denial.rarcCode,
          denialCategory: denial.denialCategory,
        };

        const brainResult = await brainAnalyzeDenial(claimData);

        if (brainResult.parsedContent) {
          const parsed = brainResult.parsedContent;

          analysis = {
            denialSummary: parsed.denial_summary as string || 'Analysis not available',
            rootCauseCategory: parsed.root_cause_category as string || 'Unknown',
            rootCauseDetail: parsed.root_cause_detail as string || 'Unable to determine root cause',
            denialCategory: (parsed.denial_category as string) || denial.denialCategory || 'other',
            preventable: (parsed.preventable as boolean) ?? true,
            correctable: (parsed.correctable as boolean) ?? true,
            appealRecommended: (parsed.appeal_recommended as boolean) ?? false,
            confidenceScore: (parsed.confidence_score as number) ?? 0.5,
            recommendedNextAction: (parsed.recommended_next_action as string) || 'Review denial',
            requiredInformation: [],
            complianceNotes: Array.isArray(parsed.compliance_notes) ? parsed.compliance_notes as string[] : [],
            analyzedAt: new Date().toISOString(),
          };

          // Add AI finding with cross-validation info
          if (parsed.root_cause_category && parsed.root_cause_category !== 'Unknown') {
            const crossValNote = brainResult.crossValidated
              ? ` [Cross-validated by ${brainResult.providers.join(' + ')}]`
              : '';
            findings.push({
              finding: `AI Analysis: ${parsed.root_cause_detail || parsed.denial_summary}${crossValNote}`,
              severity: brainResult.crossValidated && brainResult.crossValidation?.agreement === 'full' ? 'low' : 'medium',
              source: 'ai_analysis',
              correctionAvailable: false,
            });
          }
        }
      } catch (aiError) {
        console.warn('[CodingAgent] Brain analysis failed, using rule-based only:', aiError);
      }

      // ─── STEP 8: Calculate confidence ──────────────────────────────────
      let confidence = 0.5;
      if (ncciEdits.length > 0) confidence += 0.2;
      if (coverageCheck.isCovered !== null) confidence += 0.15;
      if (analysis && analysis.confidenceScore > 0.6) confidence += 0.1;
      // Boost for cross-validation agreement
      if (crossValidationResult.agreement === 'full') confidence += 0.1;
      // Cap lower when AI-generated corrections are present
      if (hasAIGeneratedCorrections) {
        const maxConf = crossValidationResult.agreement === 'full' ? 0.85 : 0.75;
        confidence = Math.min(confidence, maxConf);
      } else {
        confidence = Math.min(confidence, 0.95);
      }

      // ─── STEP 9: Determine human review need ───────────────────────────
      const hasHighRiskCorrections = proposedCorrections.some(c => c.riskLevel === 'high');
      // AI-generated corrections ALWAYS require human review
      // Cross-validation disagreement ALWAYS requires human review
      const requiresHumanReview = hasAIGeneratedCorrections || hasHighRiskCorrections || confidence < 0.6 ||
        coverageCheck.isCovered === null ||
        crossValidationResult.agreement === 'disagreement';

      // ─── STEP 10: Save to database ─────────────────────────────────────
      if (analysis) {
        await db.denialAnalysis.upsert({
          where: { denialId },
          create: {
            denialId,
            denialSummary: analysis.denialSummary,
            rootCauseCategory: analysis.rootCauseCategory,
            rootCauseDetail: analysis.rootCauseDetail,
            denialCategory: analysis.denialCategory,
            preventable: analysis.preventable,
            correctable: analysis.correctable,
            appealRecommended: analysis.appealRecommended,
            confidenceScore: analysis.confidenceScore,
            recommendedNextAction: analysis.recommendedNextAction,
            requiredInformation: JSON.stringify(analysis.requiredInformation),
            complianceNotes: JSON.stringify(analysis.complianceNotes),
          },
          update: {
            denialSummary: analysis.denialSummary,
            rootCauseCategory: analysis.rootCauseCategory,
            rootCauseDetail: analysis.rootCauseDetail,
          },
        });
      }

      // Save correction if we have proposed corrections
      if (proposedCorrections.length > 0) {
        const primaryCorrection = proposedCorrections[0];
        const correction: CorrectionSuggestion = {
          correctionType: primaryCorrection.type,
          correctionSummary: `${primaryCorrection.type}: Change ${primaryCorrection.field} from ${primaryCorrection.currentValue} to ${primaryCorrection.proposedValue}${hasAIGeneratedCorrections ? ' (AI-generated — requires verification)' : ''}`,
          correctionRationale: primaryCorrection.reason,
          proposedChanges: proposedCorrections.map(c => ({
            fieldPath: c.field,
            originalValue: c.currentValue,
            proposedValue: c.proposedValue,
            reason: c.reason + (c.source === 'ai_generated' ? ' [AI-GENERATED — VERIFY BEFORE USE]' : ''),
            riskLevel: c.riskLevel,
          })),
          requiredDocuments: [],
          resubmissionInstructions: {
            claimFrequencyCode: '7',
            submissionType: 'corrected_claim',
            notes: hasAIGeneratedCorrections
              ? `WARNING: Contains AI-generated corrections.${crossValidationResult.agreement === 'full' ? ' Cross-validated by multiple AI models.' : ''} Must be verified by certified coder before submission.`
              : 'Submit as corrected claim with supporting documentation',
          },
          confidenceScore: confidence,
          riskLevel: hasAIGeneratedCorrections ? 'high' : (hasHighRiskCorrections ? 'high' : 'medium'),
          complianceNotes: hasAIGeneratedCorrections
            ? [`AI-generated corrections present — human verification required before claim resubmission${crossValidationResult.agreement === 'full' ? ' (Cross-validated by GPT + Claude)' : ''}`]
            : [],
          createdAt: new Date().toISOString(),
        };

        await db.correctionSuggestion.upsert({
          where: { denialId },
          create: {
            denialId,
            correctionType: correction.correctionType,
            correctionSummary: correction.correctionSummary,
            correctionRationale: correction.correctionRationale,
            proposedChanges: JSON.stringify(correction.proposedChanges),
            requiredDocuments: JSON.stringify(correction.requiredDocuments),
            resubmissionInstructions: JSON.stringify(correction.resubmissionInstructions),
            confidenceScore: correction.confidenceScore,
            riskLevel: correction.riskLevel,
            complianceNotes: JSON.stringify(correction.complianceNotes),
          },
          update: {
            correctionType: correction.correctionType,
            correctionSummary: correction.correctionSummary,
            proposedChanges: JSON.stringify(correction.proposedChanges),
          },
        });
      }

      // Remember pattern
      await this.remember(
        `coding:${carcCode}:${cptCode}`,
        { result: analysisResult, correctionsAvailable: proposedCorrections.length > 0, aiGenerated: hasAIGeneratedCorrections, crossValidated: crossValidationResult.performed },
        'pattern',
        confidence,
      );

      const result: CodingOutput = {
        analysisResult,
        codingFindings: findings,
        ncciEdits,
        coverageCheck,
        proposedCorrections,
        confidenceScore: confidence,
        hasAIGeneratedCorrections,
        requiresHumanReview,
        humanReviewReason: requiresHumanReview
          ? crossValidationResult.agreement === 'disagreement'
            ? 'AI models DISAGREE on proposed corrections — human must review both opinions and decide'
            : hasAIGeneratedCorrections
              ? 'AI-generated code corrections require human verification by a certified coder before resubmission'
              : hasHighRiskCorrections
                ? 'High-risk corrections proposed (e.g., diagnosis change) — requires provider verification'
                : 'Insufficient coding data for automated resolution'
          : null,
        crossValidationResult,
      };

      // Determine next actions
      const nextActions: Array<{ agent: string; task: string; input: Record<string, unknown> }> = [];
      if (proposedCorrections.length > 0) {
        nextActions.push({ agent: 'scrubber-agent', task: 'pre_submission_check', input: { denialId } });
      }
      if (analysis?.appealRecommended || coverageCheck.isCovered === false) {
        nextActions.push({ agent: 'appeal-agent', task: 'generate_appeal_strategy', input: { denialId } });
      }

      return {
        success: findings.some(f => f.correctionAvailable) || proposedCorrections.length > 0,
        output: result as unknown as Record<string, unknown>,
        confidence,
        toolsUsed: ['denial_data', 'coding_intelligence', 'resubmission_intelligence'],
        requiresHumanApproval: requiresHumanReview,
        humanApprovalReason: requiresHumanReview ? 'Coding correction requires human verification' : undefined,
        nextActions,
      };
    });
  }

  // ─── BRAIN RESULT VALIDATION ────────────────────────────────────────────────

  /**
   * Validate and map Brain-generated corrections to our output schema.
   * Applies additional format validation and safety guardrails.
   */
  private validateAndMapBrainCorrections(
    corrections: Array<Record<string, unknown>>,
    brainResult: BrainResult,
  ): CodingOutput['proposedCorrections'] {
    const validatedCorrections: CodingOutput['proposedCorrections'] = [];

    // If Brain's deterministic validation failed, log it but still process
    if (!brainResult.validation.passed) {
      console.warn('[CodingAgent] Brain deterministic validation had issues:', brainResult.validation.checks.filter(c => !c.passed));
    }

    for (const corr of corrections) {
      const field = String(corr.field || '');
      const proposedCode = String(corr.proposed_code || corr.proposed_value || corr.proposedValue || '');
      const currentCode = String(corr.current_code || corr.current_value || corr.currentValue || '');
      const confidence = Number(corr.confidence || corr.confidence_score || 0);

      // Validate code format
      let formatValid = true;
      if (field === 'CPT' && !/^\d{4,5}$/.test(proposedCode)) formatValid = false;
      if (field === 'ICD10' && !/^[A-Z]\d{2}(\.\d{1,4})?$/.test(proposedCode)) formatValid = false;
      if (field === 'Modifier' && !/^[A-Z0-9]{1,3}$/.test(proposedCode)) formatValid = false;

      // Skip if confidence too low or format invalid
      if (confidence < 0.4 || !formatValid) {
        console.warn(`[CodingAgent] Brain correction rejected: field=${field}, proposed=${proposedCode}, confidence=${confidence}, formatValid=${formatValid}`);
        continue;
      }

      // Map field name to our schema
      let correctionType: CodingOutput['proposedCorrections'][0]['type'] = 'code_change';
      let mappedField = 'cptCode';
      if (field === 'ICD10' || field.toLowerCase().includes('icd') || field.toLowerCase().includes('diagnosis')) {
        correctionType = 'diagnosis_change';
        mappedField = 'diagnosisCode';
      } else if (field === 'Modifier' || field.toLowerCase().includes('modifier')) {
        correctionType = 'modifier_add';
        mappedField = 'modifier';
      } else if (field === 'CPT' || field.toLowerCase().includes('cpt')) {
        correctionType = 'code_change';
        mappedField = 'cptCode';
      }

      const crossValNote = brainResult.crossValidated && brainResult.crossValidation?.agreement === 'full'
        ? ' [Cross-validated: GPT + Claude agree]'
        : brainResult.crossValidated && brainResult.crossValidation?.agreement === 'partial'
          ? ' [Cross-validated: Models partially agree — verify carefully]'
          : brainResult.crossValidated && brainResult.crossValidation?.agreement === 'disagreement'
            ? ' [CROSS-VALIDATION DISAGREEMENT — human decision required]'
            : '';

      validatedCorrections.push({
        type: correctionType,
        field: mappedField,
        currentValue: currentCode,
        proposedValue: proposedCode,
        reason: `AI-generated: ${String(corr.reason || corr.rationale || 'Based on coding guidelines')}${corr.guideline_reference ? ` (Ref: ${corr.guideline_reference})` : ''}${crossValNote}`,
        riskLevel: 'high', // AI-generated corrections are ALWAYS high risk
        source: 'ai_generated',
      });
    }

    return validatedCorrections;
  }
}

export const codingAgent = new CodingAgent();
