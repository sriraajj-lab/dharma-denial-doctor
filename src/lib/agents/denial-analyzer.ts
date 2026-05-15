/**
 * Denial Analyzer Agent — Wraps the existing AI denial analysis in the agent framework
 */

import { BaseAgent, AgentTaskResult } from './base-agent';
import { denialDataTool, payerRulesTool, resubmissionIntelligenceTool, codingIntelligenceTool } from './tool-registry';
import { callAzureOpenAI, parseJSONResponse, DENIAL_ANALYSIS_PROMPT } from '../azure-openai';
import { DenialAnalysis } from '../types';
import { db } from '../db';

export class DenialAnalyzerAgent extends BaseAgent {
  constructor() {
    super('denial-analyzer', 'Analyzes denied claims using AI and rule-based fallbacks to determine root cause, category, and recommended actions', [
      'denial_analysis', 'root_cause_identification', 'category_classification', 'appeal_recommendation'
    ]);
    this.registerTool(denialDataTool);
    this.registerTool(payerRulesTool);
    this.registerTool(resubmissionIntelligenceTool);
    this.registerTool(codingIntelligenceTool);
  }

  async execute(taskType: string, input: Record<string, unknown>, taskId?: string): Promise<AgentTaskResult> {
    if (taskId) await this.updateTaskStatus(taskId, 'running');

    try {
      const denialId = input.denialId as string;
      const denial = await this.useTool('denial_data', { action: 'get', denialId }) as any;
      if (!denial) {
        return { success: false, output: { error: 'Denial not found' }, confidence: 0, toolsUsed: ['denial_data'] };
      }

      // Use coding intelligence tool for rule-based analysis
      const codingInfo = await this.useTool('coding_intelligence', {
        denialId,
        cptCode: denial.cptCode,
        modifier: denial.modifier,
        diagnosisCode: denial.diagnosisCode,
        carcCode: denial.carcCode,
      }) as any;

      // Use resubmission intelligence for prediction
      const prediction = await this.useTool('resubmission_intelligence', {
        payerName: denial.payerName,
        carcCode: denial.carcCode,
        cptCode: denial.cptCode,
        deniedAmount: denial.deniedAmount,
      }) as any;

      // Try AI analysis first
      let analysis: DenialAnalysis;
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
          denialCategory: denial.denialCategory,
        });

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
          recommendedNextAction: parsed.recommended_next_action || 'Review denial and determine appropriate action',
          requiredInformation: Array.isArray(parsed.required_information)
            ? parsed.required_information.map((item: Record<string, string>) => ({
                item: item.item || '',
                reasonNeeded: item.reason_needed || item.reasonNeeded || '',
              }))
            : [],
          complianceNotes: Array.isArray(parsed.compliance_notes)
            ? parsed.compliance_notes.map((n: string) => String(n))
            : [],
          analyzedAt: new Date().toISOString(),
        };
      } catch (aiError) {
        console.error('[DenialAnalyzer] AI failed, using rule-based fallback:', aiError);
        analysis = this.generateFallbackAnalysis(denial, codingInfo, prediction);
      }

      // Update the denial with analysis
      await db.denial.update({
        where: { id: denialId },
        data: { status: 'Analyzed' },
      });
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
          denialCategory: analysis.denialCategory,
          preventable: analysis.preventable,
          correctable: analysis.correctable,
          appealRecommended: analysis.appealRecommended,
          confidenceScore: analysis.confidenceScore,
          recommendedNextAction: analysis.recommendedNextAction,
          requiredInformation: JSON.stringify(analysis.requiredInformation),
          complianceNotes: JSON.stringify(analysis.complianceNotes),
        },
      });

      // Remember this analysis pattern
      await this.remember(
        `analysis:${denial.carcCode}:${denial.cptCode}`,
        { category: analysis.denialCategory, correctable: analysis.correctable, appealRecommended: analysis.appealRecommended },
        'pattern',
        analysis.confidenceScore
      );

      const result = {
        analysis,
        codingIntelligence: codingInfo,
        prediction: { successRate: prediction.predictedSuccessRate, recommendation: prediction.recommendation },
      };

      if (taskId) await this.updateTaskStatus(taskId, 'completed', result, ['denial_data', 'coding_intelligence', 'resubmission_intelligence']);

      return {
        success: true,
        output: result,
        confidence: analysis.confidenceScore,
        toolsUsed: ['denial_data', 'coding_intelligence', 'resubmission_intelligence'],
        nextActions: analysis.correctable ? [{
          agent: 'correction-engine',
          task: 'correct',
          input: { denialId },
        }] : analysis.appealRecommended ? [{
          agent: 'appeal-strategist',
          task: 'appeal_strategy',
          input: { denialId },
        }] : [],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      if (taskId) await this.updateTaskStatus(taskId, 'failed');
      return { success: false, output: { error: errorMsg }, confidence: 0, toolsUsed: [], error: errorMsg };
    }
  }

  private generateFallbackAnalysis(denial: any, codingInfo: any, prediction: any): DenialAnalysis {
    const carcCode = denial.carcCode;
    const analysisMap: Record<string, Partial<DenialAnalysis>> = {
      'CO-4': { denialSummary: 'Procedure code inconsistent with modifier or missing modifier.', rootCauseCategory: 'Coding Error', denialCategory: 'coding_error', correctable: true, appealRecommended: false },
      'CO-11': { denialSummary: 'Diagnosis does not support the level of service.', rootCauseCategory: 'Coding Error', denialCategory: 'coding_error', correctable: true, appealRecommended: true },
      'CO-16': { denialSummary: 'Claim denied due to missing or incomplete information.', rootCauseCategory: 'Missing Information', denialCategory: 'missing_information', correctable: true, appealRecommended: false },
      'CO-18': { denialSummary: 'Claim denied as a duplicate submission.', rootCauseCategory: 'Duplicate Claim', denialCategory: 'duplicate', correctable: true, appealRecommended: false },
      'CO-22': { denialSummary: 'Payment adjusted - procedure bundled with another service.', rootCauseCategory: 'Bundling Issue', denialCategory: 'bundling', correctable: true, appealRecommended: true },
      'CO-27': { denialSummary: 'Service denied as not medically necessary.', rootCauseCategory: 'Medical Necessity', denialCategory: 'medical_necessity', correctable: true, appealRecommended: true },
      'CO-29': { denialSummary: 'Claim denied for timely filing.', rootCauseCategory: 'Timely Filing', denialCategory: 'timely_filing', correctable: false, appealRecommended: false },
      'CO-50': { denialSummary: 'Authorization/precertification not obtained.', rootCauseCategory: 'Authorization Required', denialCategory: 'authorization', correctable: true, appealRecommended: true },
      'PR-1': { denialSummary: 'Deductible amount - patient responsibility.', rootCauseCategory: 'Patient Responsibility', denialCategory: 'eligibility', correctable: false, appealRecommended: false },
      'CO-109': { denialSummary: 'Patient not covered under this plan.', rootCauseCategory: 'Eligibility', denialCategory: 'eligibility', correctable: false, appealRecommended: false },
    };

    const fallback = analysisMap[carcCode] || {
      denialSummary: `Claim denied with CARC code ${carcCode}.`,
      rootCauseCategory: 'Unknown',
      denialCategory: 'other',
      correctable: true,
      appealRecommended: true,
    };

    return {
      denialSummary: fallback.denialSummary || 'Analysis not available',
      rootCauseCategory: fallback.rootCauseCategory || 'Unknown',
      rootCauseDetail: `${fallback.denialSummary}. ${codingInfo?.ncciFindings?.length > 0 ? 'NCCI edits detected. ' : ''}Predicted success rate: ${prediction?.predictedSuccessRate || 50}%`,
      denialCategory: fallback.denialCategory || 'other',
      preventable: true,
      correctable: fallback.correctable ?? true,
      appealRecommended: fallback.appealRecommended ?? false,
      confidenceScore: 0.7,
      recommendedNextAction: fallback.correctable ? 'Proceed with correction' : fallback.appealRecommended ? 'File appeal' : 'Write off or bill patient',
      requiredInformation: [{ item: 'Complete claim documentation', reasonNeeded: 'To support correction or appeal' }],
      complianceNotes: ['Ensure all corrections comply with CMS and payer guidelines.'],
      analyzedAt: new Date().toISOString(),
    };
  }
}
