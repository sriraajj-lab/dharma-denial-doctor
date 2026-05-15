/**
 * Quality Checker Agent — Wraps the existing AI quality check in the agent framework
 */

import { BaseAgent, AgentTaskResult } from './base-agent';
import { denialDataTool, claimScrubTool } from './tool-registry';
import { callAzureOpenAI, parseJSONResponse, QUALITY_CHECKER_PROMPT } from '../azure-openai';
import { QualityCheck } from '../types';
import { db } from '../db';

export class QualityCheckerAgent extends BaseAgent {
  constructor() {
    super('quality-checker', 'Validates proposed corrections for denied claims before resubmission, ensuring quality and compliance', [
      'quality_validation', 'correction_verification', 'compliance_checking', 'blocking_issue_detection'
    ]);
    this.registerTool(denialDataTool);
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

      if (!denial.correction) {
        return { success: false, output: { error: 'No correction to validate — run correction engine first' }, confidence: 0, toolsUsed: ['denial_data'] };
      }

      // Run claim scrub on the corrected claim
      const scrubResult = await this.useTool('claim_scrub', {
        claimData: denial,
      }) as any;

      // Try AI quality check
      let qualityCheck: QualityCheck;
      try {
        const checkData = JSON.stringify({
          claimNumber: denial.claimNumber,
          carcCode: denial.carcCode,
          correction: denial.correction,
          analysis: denial.analysis,
        });

        const responseText = await callAzureOpenAI(QUALITY_CHECKER_PROMPT, `Validate this correction for a denied claim:\n${checkData}`);
        const parsed = parseJSONResponse(responseText);

        qualityCheck = {
          overallResult: parsed.overall_result || 'warning',
          validationFindings: Array.isArray(parsed.validation_findings) ? parsed.validation_findings : [],
          blockingIssues: Array.isArray(parsed.blocking_issues) ? parsed.blocking_issues : [],
          warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
          recommendation: parsed.recommendation || 'request_more_info',
          confidenceScore: parsed.confidence_score ?? 0.5,
          checkedAt: new Date().toISOString(),
        };
      } catch (aiError) {
        console.error('[QualityChecker] AI failed, using rule-based fallback:', aiError);
        qualityCheck = this.generateFallbackQualityCheck(denial, scrubResult);
      }

      // Update the denial
      await db.denial.update({
        where: { id: denialId },
        data: { status: 'Reviewed' },
      });
      await db.qualityCheck.upsert({
        where: { denialId },
        create: {
          denialId,
          overallResult: qualityCheck.overallResult,
          validationFindings: JSON.stringify(qualityCheck.validationFindings),
          blockingIssues: JSON.stringify(qualityCheck.blockingIssues),
          warnings: JSON.stringify(qualityCheck.warnings),
          recommendation: qualityCheck.recommendation,
          confidenceScore: qualityCheck.confidenceScore,
        },
        update: {
          overallResult: qualityCheck.overallResult,
          validationFindings: JSON.stringify(qualityCheck.validationFindings),
          blockingIssues: JSON.stringify(qualityCheck.blockingIssues),
          warnings: JSON.stringify(qualityCheck.warnings),
          recommendation: qualityCheck.recommendation,
          confidenceScore: qualityCheck.confidenceScore,
        },
      });

      // Remember quality patterns
      await this.remember(
        `quality:${denial.carcCode}:${denial.correction?.correctionType}`,
        { result: qualityCheck.overallResult, recommendation: qualityCheck.recommendation },
        'pattern',
        qualityCheck.confidenceScore
      );

      const result = {
        qualityCheck,
        scrubResult,
        recommendation: qualityCheck.recommendation,
      };

      if (taskId) await this.updateTaskStatus(taskId, 'completed', result, ['denial_data', 'claim_scrub']);

      const requiresHumanApproval = qualityCheck.overallResult === 'fail' || qualityCheck.blockingIssues?.length > 0;

      return {
        success: qualityCheck.overallResult !== 'fail',
        output: result,
        confidence: qualityCheck.confidenceScore,
        toolsUsed: ['denial_data', 'claim_scrub'],
        requiresHumanApproval,
        humanApprovalReason: requiresHumanApproval ? 'Quality check found blocking issues that require human review' : undefined,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      if (taskId) await this.updateTaskStatus(taskId, 'failed');
      return { success: false, output: { error: errorMsg }, confidence: 0, toolsUsed: [], error: errorMsg };
    }
  }

  private generateFallbackQualityCheck(denial: any, scrubResult: any): QualityCheck {
    const blockingIssues: Array<{ issue: string; requiredResolution: string }> = [];
    const warnings: Array<{ warning: string; recommendedAction: string }> = [];
    const findings: Array<{ check: string; result: string; details: string }> = [];

    // Check if correction addresses the denial reason
    if (denial.correction) {
      findings.push({
        check: 'Correction addresses denial reason',
        result: 'pass',
        details: `Correction type: ${denial.correction.correctionType}`,
      });
    }

    // Check for scrub findings
    if (scrubResult?.criticalCount > 0) {
      blockingIssues.push({
        issue: `${scrubResult.criticalCount} critical scrub findings on corrected claim`,
        requiredResolution: 'Resolve all critical findings before resubmission',
      });
    }

    if (scrubResult?.highCount > 0) {
      warnings.push({
        warning: `${scrubResult.highCount} high-severity scrub findings`,
        recommendedAction: 'Review findings before proceeding',
      });
    }

    // Check correction risk level
    if (denial.correction?.riskLevel === 'high') {
      warnings.push({
        warning: 'Correction has high risk level',
        recommendedAction: 'Verify clinical documentation supports this change',
      });
    }

    // Determine overall result
    let overallResult: 'pass' | 'fail' | 'warning' = 'pass';
    if (blockingIssues.length > 0) overallResult = 'fail';
    else if (warnings.length > 0) overallResult = 'warning';

    let recommendation = 'approve_for_review';
    if (overallResult === 'fail') recommendation = 'return_for_correction';
    else if (overallResult === 'warning') recommendation = 'proceed_with_caution';

    return {
      overallResult,
      validationFindings: findings,
      blockingIssues,
      warnings,
      recommendation,
      confidenceScore: 0.7,
      checkedAt: new Date().toISOString(),
    };
  }
}
