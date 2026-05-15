/**
 * Correction Engine Agent — Wraps the existing AI correction suggestion in the agent framework
 */

import { BaseAgent, AgentTaskResult } from './base-agent';
import { denialDataTool, codingIntelligenceTool, resubmissionIntelligenceTool, claimScrubTool } from './tool-registry';
import { callAzureOpenAI, parseJSONResponse, CORRECTION_SUGGESTION_PROMPT } from '../azure-openai';
import { CorrectionSuggestion } from '../types';
import { db } from '../db';

export class CorrectionEngineAgent extends BaseAgent {
  constructor() {
    super('correction-engine', 'Generates correction suggestions for denied claims using AI and rule-based coding intelligence', [
      'correction_suggestion', 'coding_correction', 'modifier_suggestion', 'resubmission_guidance'
    ]);
    this.registerTool(denialDataTool);
    this.registerTool(codingIntelligenceTool);
    this.registerTool(resubmissionIntelligenceTool);
    this.registerTool(claimScrubTool);
  }

  async execute(taskType: string, input: Record<string, unknown>, taskId?: string): Promise<AgentTaskResult> {
    if (taskId) await this.updateTaskStatus(taskId, 'running');

    try {
      const denialId = input.denialId as string;
      const denial = await this.useTool('denial_data', { action: 'get', denialId }) as any;
      if (!denial) {
        return { success: false, output: { error: 'Denial not found' }, confidence: 0, toolsUsed: ['denial_data'] };
      }

      // Get coding intelligence for rule-based corrections
      const codingInfo = await this.useTool('coding_intelligence', {
        denialId,
        cptCode: denial.cptCode,
        modifier: denial.modifier,
        diagnosisCode: denial.diagnosisCode,
        carcCode: denial.carcCode,
      }) as any;

      // Get resubmission prediction
      const prediction = await this.useTool('resubmission_intelligence', {
        payerName: denial.payerName,
        carcCode: denial.carcCode,
        correctionType: codingInfo.corrections?.[0]?.type || 'unknown',
        cptCode: denial.cptCode,
        deniedAmount: denial.deniedAmount,
      }) as any;

      // Try AI correction first
      let correction: CorrectionSuggestion;
      try {
        const claimData = JSON.stringify({
          claimNumber: denial.claimNumber,
          payerName: denial.payerName,
          dateOfService: denial.dateOfService,
          cptCode: denial.cptCode,
          modifier: denial.modifier,
          diagnosisCode: denial.diagnosisCode,
          billedAmount: denial.billedAmount,
          deniedAmount: denial.deniedAmount,
          carcCode: denial.carcCode,
          rarcCode: denial.rarcCode,
          adjustmentGroupCode: denial.adjustmentGroupCode,
          denialCategory: denial.denialCategory,
        });

        const responseText = await callAzureOpenAI(CORRECTION_SUGGESTION_PROMPT, `Suggest corrections for this denied claim:\n${claimData}`);
        const parsed = parseJSONResponse(responseText);

        correction = {
          correctionType: parsed.correction_type || 'code_change',
          correctionSummary: parsed.correction_summary || 'Correction available',
          correctionRationale: parsed.correction_rationale || 'Based on coding analysis',
          proposedChanges: Array.isArray(parsed.proposed_changes) ? parsed.proposed_changes : [],
          requiredDocuments: Array.isArray(parsed.required_documents) ? parsed.required_documents : [],
          resubmissionInstructions: parsed.resubmission_instructions || { claimFrequencyCode: '7', submissionType: 'corrected_claim', notes: 'Submit as corrected claim' },
          confidenceScore: parsed.confidence_score ?? 0.5,
          riskLevel: parsed.risk_level || 'medium',
          complianceNotes: Array.isArray(parsed.compliance_notes) ? parsed.compliance_notes : [],
          createdAt: new Date().toISOString(),
        };
      } catch (aiError) {
        console.error('[CorrectionEngine] AI failed, using rule-based fallback:', aiError);
        correction = this.generateFallbackCorrection(denial, codingInfo, prediction);
      }

      // Run claim scrub to validate the correction
      const scrubResult = await this.useTool('claim_scrub', {
        claimData: { ...denial, ...this.applyCorrectionToDenial(denial, correction) },
      }) as any;

      // Update the denial
      await db.denial.update({
        where: { id: denialId },
        data: { status: 'Corrected' },
      });
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
          correctionRationale: correction.correctionRationale,
          proposedChanges: JSON.stringify(correction.proposedChanges),
          requiredDocuments: JSON.stringify(correction.requiredDocuments),
          resubmissionInstructions: JSON.stringify(correction.resubmissionInstructions),
          confidenceScore: correction.confidenceScore,
          riskLevel: correction.riskLevel,
          complianceNotes: JSON.stringify(correction.complianceNotes),
        },
      });

      // Remember correction patterns
      await this.remember(
        `correction:${denial.carcCode}:${denial.cptCode}`,
        { correctionType: correction.correctionType, successRate: prediction.predictedSuccessRate },
        'pattern',
        correction.confidenceScore
      );

      const result = {
        correction,
        codingIntelligence: codingInfo,
        prediction: { successRate: prediction.predictedSuccessRate, recommendation: prediction.recommendation },
        scrubValidation: scrubResult,
      };

      if (taskId) await this.updateTaskStatus(taskId, 'completed', result, ['denial_data', 'coding_intelligence', 'resubmission_intelligence', 'claim_scrub']);

      return {
        success: true,
        output: result,
        confidence: correction.confidenceScore,
        toolsUsed: ['denial_data', 'coding_intelligence', 'resubmission_intelligence', 'claim_scrub'],
        nextActions: [{
          agent: 'quality-checker',
          task: 'quality_check',
          input: { denialId },
        }],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      if (taskId) await this.updateTaskStatus(taskId, 'failed');
      return { success: false, output: { error: errorMsg }, confidence: 0, toolsUsed: [], error: errorMsg };
    }
  }

  private generateFallbackCorrection(denial: any, codingInfo: any, prediction: any): CorrectionSuggestion {
    const corrections = codingInfo?.corrections || [];
    const primaryCorrection = corrections[0];

    return {
      correctionType: primaryCorrection?.type || 'code_change',
      correctionSummary: primaryCorrection
        ? `${primaryCorrection.type}: Change ${primaryCorrection.field} from ${primaryCorrection.current} to ${primaryCorrection.suggested}`
        : `Correction needed for ${denial.carcCode} denial`,
      correctionRationale: primaryCorrection?.riskLevel === 'high'
        ? 'Diagnosis change recommended - verify clinical documentation supports alternative diagnosis'
        : 'Based on coding rules and NCCI edit analysis',
      proposedChanges: corrections.map((c: any) => ({
        fieldPath: c.field,
        originalValue: c.current,
        proposedValue: c.suggested,
        reason: c.riskLevel === 'high' ? 'Requires clinical documentation support' : 'Based on coding guidelines',
        riskLevel: c.riskLevel || 'medium',
      })),
      requiredDocuments: codingInfo?.coverage?.missingDocumentation
        ? codingInfo.coverage.missingDocumentation.map((d: string) => ({ documentType: d, reason: 'Required for coverage criteria' }))
        : [{ documentType: 'Medical records', reason: 'Support correction' }],
      resubmissionInstructions: {
        claimFrequencyCode: '7',
        submissionType: 'corrected_claim',
        notes: 'Submit as corrected claim with supporting documentation',
      },
      confidenceScore: prediction?.predictedSuccessRate ? prediction.predictedSuccessRate / 100 : 0.5,
      riskLevel: primaryCorrection?.riskLevel || 'medium',
      complianceNotes: ['Ensure all corrections are supported by clinical documentation'],
      createdAt: new Date().toISOString(),
    };
  }

  private applyCorrectionToDenial(denial: any, correction: CorrectionSuggestion): Record<string, unknown> {
    const updated = { ...denial };
    for (const change of correction.proposedChanges) {
      const field = change.fieldPath;
      if (field === 'Modifier') updated.modifier = change.proposedValue;
      if (field === 'DiagnosisCode') updated.diagnosisCode = change.proposedValue;
      if (field === 'CPT Code (downcode)') updated.cptCode = change.proposedValue;
    }
    return updated;
  }
}
