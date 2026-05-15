import { BaseAgent, AgentTaskResult } from './base-agent';
import { resubmissionIntelligenceTool, denialDataTool } from './tool-registry';
import { db } from '../db';

export class PayerBehaviorLearnerAgent extends BaseAgent {
  constructor() {
    super('payer-behavior-learner', 'Learns payer-specific behavior patterns from historical data to improve prediction accuracy and correction strategies', [
      'payer_behavior_learning', 'pattern_recognition', 'success_rate_tracking', 'payer_profiling'
    ]);
    this.registerTool(resubmissionIntelligenceTool);
    this.registerTool(denialDataTool);
  }

  async execute(taskType: string, input: Record<string, unknown>, taskId?: string): Promise<AgentTaskResult> {
    if (taskId) await this.updateTaskStatus(taskId, 'running');

    try {
      const denialId = input.denialId as string;

      // Learn from a specific denial outcome
      if (denialId) {
        return await this.learnFromOutcome(denialId, input, taskId);
      }

      // Full payer profile rebuild
      return await this.rebuildAllProfiles(taskId);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      if (taskId) await this.updateTaskStatus(taskId, 'failed');
      return { success: false, output: { error: errorMsg }, confidence: 0, toolsUsed: [], error: errorMsg };
    }
  }

  private async learnFromOutcome(denialId: string, input: Record<string, unknown>, taskId?: string): Promise<AgentTaskResult> {
    const denial = await this.useTool('denial_data', { action: 'get', denialId }) as any;
    if (!denial) {
      return { success: false, output: { error: 'Denial not found' }, confidence: 0, toolsUsed: ['denial_data'] };
    }

    // Record the outcome in resubmission records
    const workflowResults = (input.workflowResults as any[]) || [];
    const outcome = this.determineOutcome(denial);

    if (outcome) {
      await db.resubmissionRecord.upsert({
        where: { id: `RS-${denialId}` },
        create: {
          id: `RS-${denialId}`,
          denialId,
          claimNumber: denial.claimNumber,
          payerName: denial.payerName,
          carcCode: denial.carcCode,
          denialCategory: denial.denialCategory,
          cptCode: denial.cptCode,
          deniedAmount: denial.deniedAmount,
          correctionType: workflowResults[0]?.correctionType || 'unknown',
          correctionDetails: JSON.stringify(workflowResults),
          resubmittedAt: new Date(),
          outcome,
        },
        update: { outcome },
      });
    }

    // Update payer profile
    await this.updatePayerProfile(denial.payerName);

    // Store learning insights
    const insights = this.generateInsights(denial, outcome);
    for (const insight of insights) {
      await this.remember(
        `insight:${denial.payerName}:${insight.category}`,
        insight,
        'insight',
        0.8
      );
    }

    const result = { outcome, insights, payerProfileUpdated: true };

    if (taskId) await this.updateTaskStatus(taskId, 'completed', result, ['denial_data', 'resubmission_intelligence']);

    return {
      success: true,
      output: result,
      confidence: 0.9,
      toolsUsed: ['denial_data', 'resubmission_intelligence'],
    };
  }

  private async rebuildAllProfiles(taskId?: string): Promise<AgentTaskResult> {
    // Get all unique payers
    const payerNames = await db.resubmissionRecord.findMany({
      select: { payerName: true },
      distinct: ['payerName'],
    });

    for (const { payerName } of payerNames) {
      await this.updatePayerProfile(payerName);
    }

    const result = {
      profilesUpdated: payerNames.length,
      payers: payerNames.map(p => p.payerName),
    };

    if (taskId) await this.updateTaskStatus(taskId, 'completed', result, ['resubmission_intelligence']);

    return {
      success: true,
      output: result,
      confidence: 0.9,
      toolsUsed: ['resubmission_intelligence'],
    };
  }

  private async updatePayerProfile(payerName: string): Promise<void> {
    const records = await db.resubmissionRecord.findMany({
      where: { payerName },
    });

    if (records.length === 0) return;

    const total = records.length;
    const successes = records.filter(r => r.outcome === 'paid' || r.outcome === 'partially_paid');
    const successRate = total > 0 ? successes.length / total : 0.5;

    const avgDays = successes.length > 0
      ? Math.round(successes.reduce((sum, r) => sum + (r.daysToResolution || 30), 0) / successes.length)
      : 30;

    const totalDenied = records.reduce((sum, r) => sum + r.deniedAmount, 0);
    const totalRecovered = successes.reduce((sum, r) => sum + (r.paidAmount || 0), 0);
    const avgRecoveryPercent = totalDenied > 0 ? (totalRecovered / totalDenied) * 100 : 0;

    // Best/worst correction types
    const corrTypeMap = new Map<string, { success: number; total: number }>();
    records.forEach(r => {
      const existing = corrTypeMap.get(r.correctionType) || { success: 0, total: 0 };
      existing.total++;
      if (r.outcome === 'paid' || r.outcome === 'partially_paid') existing.success++;
      corrTypeMap.set(r.correctionType, existing);
    });

    const corrTypes = Array.from(corrTypeMap.entries()).map(([type, data]) => ({
      type,
      successRate: Math.round((data.success / data.total) * 100),
      count: data.total,
    }));

    const best = corrTypes.sort((a, b) => b.successRate - a.successRate).slice(0, 3);
    const worst = corrTypes.sort((a, b) => a.successRate - b.successRate).slice(0, 3);

    // Top denial reasons
    const carcMap = new Map<string, { success: number; total: number }>();
    records.forEach(r => {
      const existing = carcMap.get(r.carcCode) || { success: 0, total: 0 };
      existing.total++;
      if (r.outcome === 'paid' || r.outcome === 'partially_paid') existing.success++;
      carcMap.set(r.carcCode, existing);
    });

    const topReasons = Array.from(carcMap.entries())
      .map(([carcCode, data]) => ({ carcCode, count: data.total, successRate: Math.round((data.success / data.total) * 100) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    await db.payerBehaviorProfile.upsert({
      where: { payerName },
      create: {
        payerName,
        totalSubmissions: total,
        successRate,
        avgDaysToPayment: avgDays,
        avgRecoveryPercent,
        bestCorrectionTypes: JSON.stringify(best),
        worstCorrectionTypes: JSON.stringify(worst),
        topDenialReasons: JSON.stringify(topReasons),
        trendData: JSON.stringify({
          lastMonth: successRate,
          last3Months: successRate,
          last6Months: successRate,
          improving: successRate > 0.6,
        }),
        specialBehaviors: JSON.stringify({}),
      },
      update: {
        totalSubmissions: total,
        successRate,
        avgDaysToPayment: avgDays,
        avgRecoveryPercent,
        bestCorrectionTypes: JSON.stringify(best),
        worstCorrectionTypes: JSON.stringify(worst),
        topDenialReasons: JSON.stringify(topReasons),
        trendData: JSON.stringify({
          lastMonth: successRate,
          last3Months: successRate,
          last6Months: successRate,
          improving: successRate > 0.6,
        }),
        lastAnalyzedAt: new Date(),
      },
    });
  }

  private determineOutcome(denial: any): string {
    if (denial.status === 'Closed' && denial.paidAmount && denial.paidAmount >= denial.deniedAmount * 0.9) return 'paid';
    if (denial.status === 'Closed' && denial.paidAmount && denial.paidAmount > 0) return 'partially_paid';
    if (denial.status === 'Appealed') return 'appealed';
    if (denial.status === 'Closed' && (!denial.paidAmount || denial.paidAmount === 0)) return 'denied_again';
    return 'pending';
  }

  private generateInsights(denial: any, outcome: string): Array<{ category: string; insight: string; impact: string }> {
    const insights: Array<{ category: string; insight: string; impact: string }> = [];

    if (outcome === 'paid') {
      insights.push({ category: 'success_pattern', insight: `${denial.payerName} accepted correction for ${denial.carcCode}`, impact: 'high' });
    } else if (outcome === 'denied_again') {
      insights.push({ category: 'failure_pattern', insight: `${denial.payerName} denied again after correction for ${denial.carcCode}`, impact: 'high' });
    }

    return insights;
  }
}

export const payerBehaviorLearner = new PayerBehaviorLearnerAgent();
