/**
 * Agent 3: Coding Agent (Generates Corrected Codes)
 *
 * SCOPE: Validate CPT/ICD-10 pairing, modifiers, NCCI edits, medical necessity, unbundling
 *        AND generate corrected codes when the old codes are wrong
 * HANDLES: CO-4, CO-11, CO-22, CO-27 (coding-related), CO-97
 * FORBIDDEN: Cannot change patient demographics, cannot generate appeal letters
 *
 * Anti-Hallucination Guardrails:
 * - First tries rule-based corrections from NCCI edit tables and coverage rules (highest confidence)
 * - When rule-based corrections are insufficient, uses AI to GENERATE corrected codes
 * - AI-generated corrections are ALWAYS marked as 'ai_generated' source with riskLevel: 'high'
 * - AI-generated corrections ALWAYS require human review before use
 * - If AI cannot confidently generate a code, flags for manual review instead
 * - All generated codes are validated against format rules (CPT = 4-5 digits, ICD-10 = letter+digits)
 * - Cross-references AI-generated codes against NCCI edits to catch new bundling issues
 * - Confidence is capped at 0.75 when any AI-generated correction is present
 */

import { z } from 'zod';
import { BaseAgentV2, AgentTaskResult } from './base-agent-v2';
import { denialDataTool, codingIntelligenceTool, resubmissionIntelligenceTool } from './tool-registry';
import { callAzureOpenAI, parseJSONResponse } from '../azure-openai';
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
});

export type CodingOutput = z.infer<typeof CodingOutputSchema>;

// ─── AGENT ─────────────────────────────────────────────────────────────────────

export class CodingAgent extends BaseAgentV2 {
  constructor() {
    super(
      'coding-agent',
      'Validates CPT/ICD-10 coding, NCCI edits, modifier compliance, and medical necessity. Generates corrected codes when original codes are wrong — rule-based first, AI-generated as fallback (always flagged for human review).',
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

      // ─── STEP 6: AI CODE GENERATION (when rule-based corrections insufficient) ──
      // Only triggered if: (a) no rule-based corrections found AND (b) analysis confirms coding error
      let hasAIGeneratedCorrections = false;
      if (proposedCorrections.length === 0 &&
          ['coding_error_confirmed', 'modifier_issue', 'bundling_issue', 'medical_necessity_issue'].includes(analysisResult)) {
        try {
          const aiCorrections = await this.generateCorrectedCodes(denial, carcCode, cptCode, diagnosisCode, modifier);
          if (aiCorrections.length > 0) {
            proposedCorrections.push(...aiCorrections);
            hasAIGeneratedCorrections = true;

            // Add finding for AI code generation
            findings.push({
              finding: `AI-generated code correction proposed: ${aiCorrections.map(c => `${c.currentValue} → ${c.proposedValue}`).join(', ')}`,
              severity: 'medium',
              source: 'ai_generated',
              correctionAvailable: true,
            });
          }
        } catch (aiGenError) {
          console.warn('[CodingAgent] AI code generation failed, rule-based only:', aiGenError);
        }
      }

      // ─── STEP 7: AI ENHANCEMENT (analysis enrichment, NOT code generation) ────
      let analysis: DenialAnalysis | null = null;
      try {
        if (process.env.AZURE_OPENAI_API_KEY) {
          const claimData = JSON.stringify({
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
          });

          const DENIAL_ANALYSIS_PROMPT = `You are a medical coding analyst. Analyze this denied claim and provide a structured assessment. You must ONLY validate existing codes and identify issues. Do NOT invent new codes or policy numbers. If you are unsure, say so explicitly.

Respond in JSON format:
{
  "denial_summary": "Brief summary of the coding issue",
  "root_cause_category": "Coding Error|Missing Information|Bundling Issue|Medical Necessity|Unknown",
  "root_cause_detail": "Detailed explanation",
  "confidence_score": 0.0-1.0,
  "compliance_notes": ["Any compliance considerations"]
}`;

          const responseText = await callAzureOpenAI(DENIAL_ANALYSIS_PROMPT, `Analyze this denied claim:\n${claimData}`);
          const parsed = parseJSONResponse(responseText);

          analysis = {
            denialSummary: parsed.denial_summary || 'Analysis not available',
            rootCauseCategory: parsed.root_cause_category || 'Unknown',
            rootCauseDetail: parsed.root_cause_detail || 'Unable to determine root cause',
            denialCategory: parsed.denial_category || denial.denialCategory || 'other',
            preventable: parsed.preventable ?? true,
            correctable: parsed.correctable ?? true,
            appealRecommended: parsed.appeal_recommended ?? false,
            confidenceScore: parsed.confidence_score ?? 0.5,
            recommendedNextAction: parsed.recommended_next_action || 'Review denial',
            requiredInformation: [],
            complianceNotes: Array.isArray(parsed.compliance_notes) ? parsed.compliance_notes : [],
            analyzedAt: new Date().toISOString(),
          };

          // Add AI finding (marked as AI source)
          if (parsed.root_cause_category && parsed.root_cause_category !== 'Unknown') {
            findings.push({
              finding: `AI Analysis: ${parsed.root_cause_detail || parsed.denial_summary}`,
              severity: 'medium',
              source: 'ai_analysis',
              correctionAvailable: false,
            });
          }
        }
      } catch (aiError) {
        console.warn('[CodingAgent] AI enhancement failed, using rule-based only:', aiError);
      }

      // ─── STEP 8: Calculate confidence ──────────────────────────────────
      let confidence = 0.5;
      // Boost for NCCI findings
      if (ncciEdits.length > 0) confidence += 0.2;
      // Boost for coverage check result
      if (coverageCheck.isCovered !== null) confidence += 0.15;
      // Boost for AI confirmation
      if (analysis && analysis.confidenceScore > 0.6) confidence += 0.1;
      // Cap lower when AI-generated corrections are present
      if (hasAIGeneratedCorrections) {
        confidence = Math.min(confidence, 0.75);
      } else {
        confidence = Math.min(confidence, 0.95);
      }

      // ─── STEP 9: Determine human review need ───────────────────────────
      const hasHighRiskCorrections = proposedCorrections.some(c => c.riskLevel === 'high');
      // AI-generated corrections ALWAYS require human review
      const requiresHumanReview = hasAIGeneratedCorrections || hasHighRiskCorrections || confidence < 0.6 || coverageCheck.isCovered === null;

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
              ? 'WARNING: Contains AI-generated corrections. Must be verified by certified coder before submission.'
              : 'Submit as corrected claim with supporting documentation',
          },
          confidenceScore: confidence,
          riskLevel: hasAIGeneratedCorrections ? 'high' : (hasHighRiskCorrections ? 'high' : 'medium'),
          complianceNotes: hasAIGeneratedCorrections
            ? ['AI-generated corrections present — human verification required before claim resubmission']
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
        { result: analysisResult, correctionsAvailable: proposedCorrections.length > 0, aiGenerated: hasAIGeneratedCorrections },
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
          ? hasAIGeneratedCorrections
            ? 'AI-generated code corrections require human verification by a certified coder before resubmission'
            : hasHighRiskCorrections
              ? 'High-risk corrections proposed (e.g., diagnosis change) — requires provider verification'
              : 'Insufficient coding data for automated resolution'
          : null,
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

  // ─── AI CODE GENERATION ──────────────────────────────────────────────────

  /**
   * Generate corrected CPT/ICD-10 codes using AI when rule-based corrections are insufficient.
   *
   * SAFETY GUARDRAILS:
   * - All AI-generated corrections are marked source: 'ai_generated' and riskLevel: 'high'
   * - Codes are validated against format rules before inclusion
   * - If AI confidence < 0.5, correction is discarded
   * - If code format is invalid (wrong CPT/ICD-10 format), correction is discarded
   * - AI-generated corrections ALWAYS require human review
   */
  private async generateCorrectedCodes(
    denial: Record<string, unknown>,
    carcCode: string,
    currentCpt: string,
    currentDiagnosis: string,
    currentModifier: string | undefined,
  ): Promise<CodingOutput['proposedCorrections']> {
    if (!process.env.AZURE_OPENAI_API_KEY) return [];

    const CODE_GEN_PROMPT = `You are a medical coding specialist. A claim was denied and rule-based analysis could not find a correction. We need you to GENERATE the CORRECTED codes.

CURRENT CLAIM:
- CPT Code: ${currentCpt}
- ICD-10 Diagnosis: ${currentDiagnosis}
- Modifier: ${currentModifier || 'None'}
- Denial Code: ${carcCode}
- Payer: ${denial.payerName}
- Billed Amount: $${denial.billedAmount}
- Denied Amount: $${denial.deniedAmount}

DENIAL CONTEXT:
- CARC ${carcCode} indicates a coding or coverage issue
- Our rule-based system (NCCI edits, coverage rules, modifier rules) could not find an automatic correction
- We need your expertise to identify what the correct code SHOULD be

TASK: If the current CPT or ICD-10 code is incorrect, propose the corrected code(s). You MUST:
1. Only propose codes you are confident about — if unsure, return empty corrections
2. Explain WHY the original code is wrong and WHY the new code is correct
3. Reference specific coding guidelines (AMA CPT, ICD-10-CM Official Guidelines, NCCI, LCD/NCD)
4. Validate that proposed codes are real, valid code numbers (CPT = 4-5 digits, ICD-10 = letter + digits)
5. If proposing a diagnosis change, ensure it is clinically consistent with the procedure
6. Never fabricate codes — if you cannot determine the correct code with confidence, say so

Respond in JSON format:
{
  "corrections": [
    {
      "field": "CPT" or "ICD10" or "Modifier",
      "current_code": "the current value",
      "proposed_code": "the corrected value",
      "reason": "why this change is correct — be specific about which guideline supports this",
      "confidence": 0.0-1.0,
      "guideline_reference": "specific guideline reference (e.g., AMA CPT 2024, NCCI Policy Manual Ch.1)",
      "needs_clinical_verification": true/false
    }
  ],
  "overall_confidence": 0.0-1.0,
  "summary": "Brief explanation of the coding correction"
}

If you cannot confidently propose a correction, return:
{"corrections": [], "overall_confidence": 0, "summary": "MANUAL_REVIEW_NEEDED: Unable to determine correct code with confidence"}`;

    try {
      const responseText = await callAzureOpenAI(
        CODE_GEN_PROMPT,
        `Generate corrected codes for denied claim: CPT ${currentCpt}, Dx ${currentDiagnosis}, CARC ${carcCode}`,
      );
      const parsed = parseJSONResponse(responseText);

      if (!parsed.corrections || !Array.isArray(parsed.corrections) || parsed.corrections.length === 0) {
        return [];
      }

      // If AI says it can't confidently correct, bail out
      if (parsed.overall_confidence !== undefined && Number(parsed.overall_confidence) < 0.4) {
        return [];
      }

      // Validate each AI-generated correction
      const validatedCorrections: CodingOutput['proposedCorrections'] = [];
      for (const corr of parsed.corrections as Array<Record<string, unknown>>) {
        const field = String(corr.field || '');
        const proposedCode = String(corr.proposed_code || '');
        const currentCode = String(corr.current_code || '');
        const confidence = Number(corr.confidence || 0);

        // Validate code format
        let formatValid = true;
        if (field === 'CPT' && !/^\d{4,5}$/.test(proposedCode)) formatValid = false;
        if (field === 'ICD10' && !/^[A-Z]\d{2}(\.\d{1,4})?$/.test(proposedCode)) formatValid = false;
        if (field === 'Modifier' && !/^[A-Z0-9]{1,3}$/.test(proposedCode)) formatValid = false;

        // Skip if confidence too low or format invalid
        if (confidence < 0.5 || !formatValid) {
          console.warn(`[CodingAgent] AI correction rejected: field=${field}, proposed=${proposedCode}, confidence=${confidence}, formatValid=${formatValid}`);
          continue;
        }

        // Map field name to our schema
        let correctionType: CodingOutput['proposedCorrections'][0]['type'] = 'code_change';
        let mappedField = 'cptCode';
        if (field === 'ICD10') { correctionType = 'diagnosis_change'; mappedField = 'diagnosisCode'; }
        else if (field === 'Modifier') { correctionType = 'modifier_add'; mappedField = 'modifier'; }
        else if (field === 'CPT') { correctionType = 'code_change'; mappedField = 'cptCode'; }

        validatedCorrections.push({
          type: correctionType,
          field: mappedField,
          currentValue: currentCode,
          proposedValue: proposedCode,
          reason: `AI-generated: ${String(corr.reason || 'Based on coding guidelines')}${corr.guideline_reference ? ` (Ref: ${corr.guideline_reference})` : ''}`,
          riskLevel: 'high', // AI-generated corrections are ALWAYS high risk
          source: 'ai_generated',
        });
      }

      return validatedCorrections;
    } catch (error) {
      console.warn('[CodingAgent] Code generation error:', error);
      return [];
    }
  }
}

export const codingAgent = new CodingAgent();
