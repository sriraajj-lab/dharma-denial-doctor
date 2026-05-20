/**
 * Agent 4: Pre-Submission Scrubber Agent
 *
 * SCOPE: Payer ID validation, claim format checks, timely filing, duplicate checks, fee schedule comparison
 * HANDLES: CO-29, CO-18, CO-16 (filing), payment adjustments, pre-submission validation
 * FORBIDDEN: Cannot suggest coding changes, cannot generate appeal text
 *
 * Anti-Hallucination:
 * - Rule-based checks ONLY — no AI interpretation
 * - Pure validation against payer rules, fee schedules, filing deadlines
 * - All checks produce pass/fail/warning results, never narratives
 */

import { z } from 'zod';
import { BaseAgentV2, AgentTaskResult } from './base-agent-v2';
import { denialDataTool, payerRulesTool, claimScrubTool } from './tool-registry';
import { db } from '../db';

// ─── OUTPUT SCHEMA ────────────────────────────────────────────────────────────

export const ScrubberOutputSchema = z.object({
  overallResult: z.enum(['pass', 'fail', 'warning']),
  checks: z.array(z.object({
    checkName: z.string(),
    checkType: z.enum(['payer_id', 'claim_format', 'timely_filing', 'duplicate', 'fee_schedule', 'modifier_rule', 'coding_validation', 'auth_required', 'bundling']),
    result: z.enum(['pass', 'fail', 'warning', 'not_applicable']),
    severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
    detail: z.string(),
    actionRequired: z.string().nullable(),
  })),
  blockingIssues: z.array(z.object({
    issue: z.string(),
    requiredResolution: z.string(),
    deadline: z.string().nullable(),
  })),
  timelyFilingStatus: z.object({
    daysRemaining: z.number().nullable(),
    filingDeadline: z.string().nullable(),
    appealDeadline: z.string().nullable(),
    urgency: z.enum(['none', 'normal', 'urgent', 'critical']),
  }),
  underpaymentCheck: z.object({
    isUnderpaid: z.boolean(),
    expectedAmount: z.number().nullable(),
    actualPaid: z.number().nullable(),
    underpaidAmount: z.number().nullable(),
    underpaymentPercent: z.number().nullable(),
  }).nullable(),
  confidenceScore: z.number().min(0).max(1),
  requiresHumanReview: z.boolean(),
  humanReviewReason: z.string().nullable(),
});

export type ScrubberOutput = z.infer<typeof ScrubberOutputSchema>;

// ─── AGENT ─────────────────────────────────────────────────────────────────────

export class ScrubberAgent extends BaseAgentV2 {
  constructor() {
    super(
      'scrubber-agent',
      'Pre-submission claim scrubbing: payer ID, format, timely filing, duplicates, fee schedules. Rule-based validation only.',
      {
        allowedDenialCodes: [], // All codes — scrubber validates any claim
        allowedOperations: [
          'pre_submission_check',
          'timely_filing_check',
          'duplicate_check',
          'fee_schedule_check',
          'payer_id_validation',
          'underpayment_check',
          'claim_scrub',
        ],
        forbiddenActions: [
          'suggest_coding_changes',
          'modify_cpt_codes',
          'generate_appeal_letters',
          'verify_eligibility',
        ],
        requiredInputFields: ['denialId'],
      },
      ScrubberOutputSchema,
    );
    this.registerTool(denialDataTool);
    this.registerTool(payerRulesTool);
    this.registerTool(claimScrubTool);
  }

  async execute(taskType: string, input: Record<string, unknown>, taskId?: string): Promise<AgentTaskResult> {
    return this.executeWithGuardrails(taskType, input, taskId, async () => {
      const denialId = input.denialId as string;
      const denial = await this.useTool('denial_data', { action: 'get', denialId }) as any;
      if (!denial) {
        return { success: false, output: { error: 'Denial not found' }, confidence: 0, toolsUsed: ['denial_data'] };
      }

      const checks: ScrubberOutput['checks'] = [];
      const blockingIssues: ScrubberOutput['blockingIssues'] = [];

      // ─── CHECK 1: Payer ID Validation ──────────────────────────────────
      const payerIdCheck = this.checkPayerId(denial);
      checks.push(payerIdCheck);
      if (payerIdCheck.result === 'fail') {
        blockingIssues.push({
          issue: payerIdCheck.detail,
          requiredResolution: payerIdCheck.actionRequired || 'Correct payer ID',
          deadline: null,
        });
      }

      // ─── CHECK 2: Timely Filing ────────────────────────────────────────
      const payerRules = await this.useTool('payer_rules', {
        payerName: denial.payerName,
        ruleType: 'filing_deadline',
      }) as Record<string, unknown>;

      const timelyFilingStatus = this.checkTimelyFiling(denial, payerRules);
      checks.push({
        checkName: 'Timely Filing Compliance',
        checkType: 'timely_filing',
        result: timelyFilingStatus.urgency === 'critical' ? 'fail' : timelyFilingStatus.urgency === 'urgent' ? 'warning' : 'pass',
        severity: timelyFilingStatus.urgency === 'critical' ? 'critical' : timelyFilingStatus.urgency === 'urgent' ? 'high' : 'low',
        detail: timelyFilingStatus.daysRemaining !== null
          ? `${timelyFilingStatus.daysRemaining} days remaining until filing deadline`
          : 'Filing deadline not available',
        actionRequired: timelyFilingStatus.urgency === 'critical'
          ? 'IMMEDIATE ACTION: File within deadline or gather proof of timely original submission'
          : timelyFilingStatus.urgency === 'urgent'
          ? 'Expedite: File corrected claim ASAP'
          : null,
      });

      if (timelyFilingStatus.urgency === 'critical') {
        blockingIssues.push({
          issue: `Filing deadline in ${timelyFilingStatus.daysRemaining} days`,
          requiredResolution: 'Submit immediately or gather proof of timely filing',
          deadline: timelyFilingStatus.filingDeadline,
        });
      }

      // ─── CHECK 3: Claim Scrub Rules ────────────────────────────────────
      const scrubResult = await this.useTool('claim_scrub', {
        claimData: denial,
      }) as any;

      if (scrubResult?.findings) {
        for (const finding of scrubResult.findings) {
          checks.push({
            checkName: finding.ruleName,
            checkType: finding.ruleType as ScrubberOutput['checks'][0]['checkType'],
            result: finding.severity === 'critical' ? 'fail' : finding.severity === 'high' ? 'warning' : 'pass',
            severity: finding.severity,
            detail: finding.finding,
            actionRequired: finding.suggestion,
          });
        }
      }

      if (scrubResult?.criticalCount > 0) {
        blockingIssues.push({
          issue: `${scrubResult.criticalCount} critical scrub findings`,
          requiredResolution: 'Resolve all critical findings before resubmission',
          deadline: null,
        });
      }

      // ─── CHECK 4: Duplicate Check ──────────────────────────────────────
      const duplicateCheck = await this.checkDuplicates(denial);
      checks.push(duplicateCheck);

      // ─── CHECK 5: Underpayment Check ───────────────────────────────────
      const underpaymentCheck = this.checkUnderpayment(denial);

      // ─── Determine overall result ──────────────────────────────────────
      const hasFails = checks.some(c => c.result === 'fail');
      const hasWarnings = checks.some(c => c.result === 'warning');
      const overallResult: ScrubberOutput['overallResult'] = hasFails ? 'fail' : hasWarnings ? 'warning' : 'pass';

      // Confidence is high because all checks are rule-based
      const confidence = overallResult === 'pass' ? 0.95 : overallResult === 'warning' ? 0.85 : 0.7;

      const requiresHumanReview = blockingIssues.length > 0 || overallResult === 'fail';

      const result: ScrubberOutput = {
        overallResult,
        checks,
        blockingIssues,
        timelyFilingStatus,
        underpaymentCheck,
        confidenceScore: confidence,
        requiresHumanReview,
        humanReviewReason: requiresHumanReview
          ? `${blockingIssues.length} blocking issue(s) found in scrub validation`
          : null,
      };

      // Determine next actions
      const nextActions: Array<{ agent: string; task: string; input: Record<string, unknown> }> = [];
      if (overallResult !== 'fail' && denial.correction) {
        // If scrub passes and correction exists, ready for quality check
        nextActions.push({ agent: 'appeal-agent', task: 'generate_appeal_strategy', input: { denialId } });
      }

      return {
        success: overallResult !== 'fail',
        output: result as unknown as Record<string, unknown>,
        confidence,
        toolsUsed: ['denial_data', 'payer_rules', 'claim_scrub'],
        requiresHumanApproval: requiresHumanReview,
        humanApprovalReason: requiresHumanReview ? 'Scrub validation found blocking issues' : undefined,
        nextActions,
      };
    });
  }

  // ─── RULE-BASED CHECKS (NO AI) ────────────────────────────────────────

  private checkPayerId(denial: Record<string, unknown>): ScrubberOutput['checks'][0] {
    const payerId = denial.payerId as string | undefined;
    if (!payerId) {
      return {
        checkName: 'Payer ID Validation',
        checkType: 'payer_id',
        result: 'fail',
        severity: 'critical',
        detail: 'Payer ID is missing',
        actionRequired: 'Add valid payer ID before submission',
      };
    }
    if (payerId.length < 3) {
      return {
        checkName: 'Payer ID Validation',
        checkType: 'payer_id',
        result: 'warning',
        severity: 'high',
        detail: `Payer ID "${payerId}" appears invalid — too short`,
        actionRequired: 'Verify payer ID with payer directory',
      };
    }
    return {
      checkName: 'Payer ID Validation',
      checkType: 'payer_id',
      result: 'pass',
      severity: 'info',
      detail: `Payer ID "${payerId}" format valid`,
      actionRequired: null,
    };
  }

  private checkTimelyFiling(
    denial: Record<string, unknown>,
    payerRules: Record<string, unknown>,
  ): ScrubberOutput['timelyFilingStatus'] {
    const now = new Date();
    const filingDeadlineValue = denial.filingDeadline;
    const filingDeadline = filingDeadlineValue ? new Date(filingDeadlineValue as string | Date) : null;

    const appealDays = (payerRules.appealDeadlineDays as number) || 60;
    const denialDateStr = denial.denialDate as string;
    const appealDeadline = denialDateStr ? new Date(denialDateStr) : null;
    if (appealDeadline) appealDeadline.setDate(appealDeadline.getDate() + appealDays);

    const daysRemaining = filingDeadline
      ? Math.ceil((filingDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    let urgency: ScrubberOutput['timelyFilingStatus']['urgency'] = 'none';
    if (daysRemaining !== null) {
      if (daysRemaining <= 7) urgency = 'critical';
      else if (daysRemaining <= 14) urgency = 'urgent';
      else if (daysRemaining <= 30) urgency = 'normal';
    }

    return {
      daysRemaining,
      filingDeadline: filingDeadline?.toISOString() || null,
      appealDeadline: appealDeadline?.toISOString() || null,
      urgency,
    };
  }

  private async checkDuplicates(denial: Record<string, unknown>): Promise<ScrubberOutput['checks'][0]> {
    const duplicateClaims = await db.denial.findMany({
      where: {
        claimNumber: denial.claimNumber as string,
        id: { not: denial.id as string },
        status: { notIn: ['Closed'] },
      },
      take: 5,
    });

    if (duplicateClaims.length > 0) {
      return {
        checkName: 'Duplicate Claim Check',
        checkType: 'duplicate',
        result: 'warning',
        severity: 'high',
        detail: `${duplicateClaims.length} other claim(s) found with same claim number`,
        actionRequired: 'Verify this is not a duplicate submission',
      };
    }

    return {
      checkName: 'Duplicate Claim Check',
      checkType: 'duplicate',
      result: 'pass',
      severity: 'info',
      detail: 'No duplicate claims found',
      actionRequired: null,
    };
  }

  private checkUnderpayment(denial: Record<string, unknown>): ScrubberOutput['underpaymentCheck'] {
    const paidAmount = denial.paidAmount as number | undefined;
    const allowedAmount = denial.allowedAmount as number | undefined;

    if (!paidAmount || !allowedAmount) return null;

    // Simple fee schedule comparison
    const feeSchedule: Record<string, number> = {
      '99213': 95, '99214': 140, '99215': 200,
      '27447': 12000, '29881': 2800, '63030': 8000,
      '70553': 1400, '43239': 2000, '93000': 85,
    };

    const expectedAmount = feeSchedule[denial.cptCode as string] || (denial.billedAmount as number) * 0.7;
    const underpaidAmount = Math.max(0, expectedAmount - paidAmount);
    const underpaymentPercent = expectedAmount > 0 ? (underpaidAmount / expectedAmount) * 100 : 0;

    return {
      isUnderpaid: underpaymentPercent > 15,
      expectedAmount,
      actualPaid: paidAmount,
      underpaidAmount: underpaymentPercent > 15 ? underpaidAmount : 0,
      underpaymentPercent: underpaymentPercent > 15 ? underpaymentPercent : 0,
    };
  }
}

export const scrubberAgent = new ScrubberAgent();
