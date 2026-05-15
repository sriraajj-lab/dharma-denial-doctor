import { BaseAgent, AgentTaskResult } from './base-agent';
import { payerRulesTool, denialDataTool } from './tool-registry';
import { db } from '../db';

export class TimelyFilingWatchdogAgent extends BaseAgent {
  constructor() {
    super('timely-filing-watchdog', 'Monitors timely filing deadlines, alerts on at-risk claims, and manages filing deadline compliance', [
      'deadline_monitoring', 'filing_compliance', 'deadline_alerts', 'proof_of_filing'
    ]);
    this.registerTool(payerRulesTool);
    this.registerTool(denialDataTool);
  }

  async execute(taskType: string, input: Record<string, unknown>, taskId?: string): Promise<AgentTaskResult> {
    if (taskId) await this.updateTaskStatus(taskId, 'running');

    try {
      const denialId = input.denialId as string;

      // Get all at-risk denials if no specific denial
      if (!denialId || taskType === 'timely_filing_check') {
        return await this.runWatchdogScan(taskId);
      }

      // Process specific denial
      const denial = await this.useTool('denial_data', { action: 'get', denialId }) as Record<string, unknown> | null;
      if (!denial) {
        return { success: false, output: { error: 'Denial not found' }, confidence: 0, toolsUsed: ['denial_data'] };
      }

      const payerRules = await this.useTool('payer_rules', {
        payerName: denial.payerName as string,
        ruleType: 'filing_deadline',
      }) as Record<string, unknown>;

      const deadlineAnalysis = this.analyzeDeadline(denial, payerRules);

      // Remember deadline patterns
      await this.remember(
        `deadline:${denial.payerName}`,
        {
          filingDays: payerRules.filingDeadlineDays as number | null,
          appealDays: payerRules.appealDeadlineDays as number | null,
        },
        'pattern',
        0.95
      );

      const result = {
        deadlineAnalysis,
        urgentAction: deadlineAnalysis.daysRemaining <= 14,
        recommendedAction: deadlineAnalysis.recommendedAction,
        steps: deadlineAnalysis.steps,
      };

      if (taskId) await this.updateTaskStatus(taskId, 'completed', result, ['denial_data', 'payer_rules']);

      return {
        success: true,
        output: result,
        confidence: 0.95,
        toolsUsed: ['denial_data', 'payer_rules'],
        nextActions: deadlineAnalysis.daysRemaining <= 14 ? [{
          agent: 'human-in-the-loop',
          task: 'human_approval',
          input: {
            denialId,
            taskType: 'timely_filing_escalation',
            urgency: deadlineAnalysis.daysRemaining <= 7 ? 'critical' : 'high',
          },
        }] : [],
        requiresHumanApproval: deadlineAnalysis.daysRemaining <= 7,
        humanApprovalReason: `Timely filing deadline in ${deadlineAnalysis.daysRemaining} days - immediate action required`,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      if (taskId) await this.updateTaskStatus(taskId, 'failed');
      return { success: false, output: { error: errorMsg }, confidence: 0, toolsUsed: [], error: errorMsg };
    }
  }

  private async runWatchdogScan(taskId?: string): Promise<AgentTaskResult> {
    const now = new Date();
    const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Find critical denials (deadline within 7 days)
    const criticalDenials = await db.denial.findMany({
      where: {
        status: { notIn: ['Closed', 'Resubmitted'] },
        filingDeadline: { lte: sevenDaysOut, gte: now },
      },
      take: 50,
    });

    // Find at-risk denials (deadline within 30 days)
    const atRiskDenials = await db.denial.findMany({
      where: {
        status: { notIn: ['Closed', 'Resubmitted'] },
        filingDeadline: { lte: thirtyDaysOut, gt: sevenDaysOut },
      },
      take: 100,
    });

    // Past deadline denials
    const pastDeadline = await db.denial.findMany({
      where: {
        status: { notIn: ['Closed'] },
        filingDeadline: { lt: now },
        isTimelyFilingRisk: true,
      },
      take: 50,
    });

    const result = {
      critical: criticalDenials.map(d => ({
        id: d.id,
        claimNumber: d.claimNumber,
        payerName: d.payerName,
        deadline: d.filingDeadline?.toISOString(),
        daysRemaining: d.filingDeadline
          ? Math.ceil((new Date(d.filingDeadline).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          : 0,
        deniedAmount: d.deniedAmount,
      })),
      atRisk: atRiskDenials.map(d => ({
        id: d.id,
        claimNumber: d.claimNumber,
        payerName: d.payerName,
        deadline: d.filingDeadline?.toISOString(),
        daysRemaining: d.filingDeadline
          ? Math.ceil((new Date(d.filingDeadline).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          : 0,
        deniedAmount: d.deniedAmount,
      })),
      pastDeadline: pastDeadline.length,
      totalAtRisk: criticalDenials.length + atRiskDenials.length,
    };

    if (taskId) await this.updateTaskStatus(taskId, 'completed', result, ['denial_data', 'payer_rules']);

    return {
      success: true,
      output: result,
      confidence: 0.95,
      toolsUsed: ['denial_data', 'payer_rules'],
      nextActions: criticalDenials.map(d => ({
        agent: 'human-in-the-loop',
        task: 'human_approval',
        input: { denialId: d.id, taskType: 'timely_filing_escalation', urgency: 'critical' as const },
      })),
    };
  }

  private analyzeDeadline(
    denial: Record<string, unknown>,
    payerRules: Record<string, unknown>
  ): {
    filingDeadline: Date | null;
    appealDeadline: Date | null;
    daysRemaining: number;
    isAtRisk: boolean;
    recommendedAction: string;
    steps: string[];
  } {
    const now = new Date();
    const filingDeadlineValue = denial.filingDeadline;
    const filingDeadline = filingDeadlineValue ? new Date(filingDeadlineValue as string | Date) : null;

    const appealDays = (payerRules.appealDeadlineDays as number) || 60;
    const denialDateStr = denial.denialDate as string;
    const appealDeadline = new Date(denialDateStr);
    appealDeadline.setDate(appealDeadline.getDate() + appealDays);

    const daysRemaining = filingDeadline
      ? Math.ceil((filingDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    const isAtRisk = daysRemaining <= 30;

    let recommendedAction: string;
    let steps: string[];

    if (daysRemaining <= 0) {
      recommendedAction = 'appeal_with_proof_of_filing';
      steps = [
        'Deadline has passed - gather proof of original timely submission',
        'Collect clearinghouse confirmation reports',
        'Submit appeal with proof of timely filing',
        'Cite payer-specific filing requirements in appeal',
      ];
    } else if (daysRemaining <= 7) {
      recommendedAction = 'immediate_action_required';
      steps = [
        `CRITICAL: Only ${daysRemaining} days remaining`,
        'Prioritize this claim for immediate correction/resubmission',
        'Submit corrected claim today if possible',
        'If appeal needed, file immediately',
      ];
    } else if (daysRemaining <= 30) {
      recommendedAction = 'expedite_processing';
      steps = [
        `File deadline approaching in ${daysRemaining} days`,
        'Prioritize correction and resubmission',
        'Monitor daily for status changes',
      ];
    } else {
      recommendedAction = 'standard_processing';
      steps = ['Process within normal workflow timelines'];
    }

    return { filingDeadline, appealDeadline, daysRemaining, isAtRisk, recommendedAction, steps };
  }
}

export const timelyFilingWatchdog = new TimelyFilingWatchdogAgent();
