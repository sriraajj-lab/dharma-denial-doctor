import { BaseAgent, AgentTaskResult } from './base-agent';
import { denialDataTool, payerRulesTool } from './tool-registry';
import { db } from '../db';

export class UnderpaymentDetectorAgent extends BaseAgent {
  constructor() {
    super('underpayment-detector', 'Detects underpayments by comparing paid amounts against expected reimbursement based on fee schedules and contracts', [
      'underpayment_detection', 'fee_schedule_comparison', 'contract_analysis', 'payment_verification'
    ]);
    this.registerTool(denialDataTool);
    this.registerTool(payerRulesTool);
  }

  async execute(taskType: string, input: Record<string, unknown>, taskId?: string): Promise<AgentTaskResult> {
    if (taskId) await this.updateTaskStatus(taskId, 'running');

    try {
      const denialId = input.denialId as string;

      // Scan for underpayments if no specific denial
      if (!denialId || taskType === 'underpayment_check') {
        return await this.scanForUnderpayments(taskId);
      }

      const denial = await this.useTool('denial_data', { action: 'get', denialId }) as any;
      if (!denial) {
        return { success: false, output: { error: 'Denial not found' }, confidence: 0, toolsUsed: ['denial_data'] };
      }

      const analysis = this.analyzeUnderpayment(denial);

      if (analysis.isUnderpaid) {
        await db.underpaymentAlert.create({
          data: {
            denialId: denial.id,
            claimNumber: denial.claimNumber,
            payerName: denial.payerName,
            cptCode: denial.cptCode,
            billedAmount: denial.billedAmount,
            allowedAmount: denial.allowedAmount || 0,
            paidAmount: denial.paidAmount || 0,
            expectedAmount: analysis.expectedAmount,
            underpaidAmount: analysis.underpaidAmount,
            underpaymentPercent: analysis.underpaymentPercent,
            status: 'open',
          }
        });
      }

      await this.remember(
        `underpayment:${denial.payerName}:${denial.cptCode}`,
        { expectedRate: analysis.expectedRate, underpaid: analysis.isUnderpaid },
        'pattern',
        0.8
      );

      const result = {
        isUnderpaid: analysis.isUnderpaid,
        expectedAmount: analysis.expectedAmount,
        actualPaid: denial.paidAmount || 0,
        underpaidAmount: analysis.underpaidAmount,
        underpaymentPercent: analysis.underpaymentPercent,
        recommendedAction: analysis.isUnderpaid ? 'dispute' : 'no_action',
      };

      if (taskId) await this.updateTaskStatus(taskId, 'completed', result, ['denial_data', 'payer_rules']);

      return {
        success: true,
        output: result,
        confidence: 0.85,
        toolsUsed: ['denial_data', 'payer_rules'],
        nextActions: analysis.isUnderpaid ? [{
          agent: 'human-in-the-loop',
          task: 'human_approval',
          input: { denialId, taskType: 'underpayment_dispute', underpaymentAmount: analysis.underpaidAmount },
        }] : [],
        requiresHumanApproval: analysis.isUnderpaid && analysis.underpaidAmount > 500,
        humanApprovalReason: analysis.isUnderpaid ? `Underpayment of $${analysis.underpaidAmount.toFixed(2)} detected - dispute approval needed` : undefined,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      if (taskId) await this.updateTaskStatus(taskId, 'failed');
      return { success: false, output: { error: errorMsg }, confidence: 0, toolsUsed: [], error: errorMsg };
    }
  }

  private async scanForUnderpayments(taskId?: string): Promise<AgentTaskResult> {
    // Find denials with partial payments that might be underpayments
    const partiallyPaid = await db.denial.findMany({
      where: {
        paidAmount: { not: null },
        allowedAmount: { not: null },
        status: { in: ['Resubmitted', 'Closed'] },
      },
      take: 100,
    });

    const underpayments: Array<{
      denialId: string; claimNumber: string; payerName: string;
      cptCode: string; billedAmount: number; paidAmount: number;
      expectedAmount: number; underpaidAmount: number;
    }> = [];

    for (const denial of partiallyPaid) {
      const analysis = this.analyzeUnderpayment(denial as any);
      if (analysis.isUnderpaid) {
        underpayments.push({
          denialId: denial.id,
          claimNumber: denial.claimNumber,
          payerName: denial.payerName,
          cptCode: denial.cptCode,
          billedAmount: denial.billedAmount,
          paidAmount: denial.paidAmount || 0,
          expectedAmount: analysis.expectedAmount,
          underpaidAmount: analysis.underpaidAmount,
        });
      }
    }

    const result = {
      scanned: partiallyPaid.length,
      underpaymentsFound: underpayments.length,
      totalUnderpaidAmount: underpayments.reduce((sum, u) => sum + u.underpaidAmount, 0),
      underpayments,
    };

    if (taskId) await this.updateTaskStatus(taskId, 'completed', result, ['denial_data', 'payer_rules']);

    return {
      success: true,
      output: result,
      confidence: 0.85,
      toolsUsed: ['denial_data', 'payer_rules'],
    };
  }

  private analyzeUnderpayment(denial: any): {
    isUnderpaid: boolean;
    expectedAmount: number;
    expectedRate: number;
    underpaidAmount: number;
    underpaymentPercent: number;
  } {
    // Medicare fee schedule approximation (in production, use actual fee schedule API)
    const feeSchedule: Record<string, number> = {
      '99213': 95, '99214': 140, '99215': 200,
      '27447': 12000, '29881': 2800, '63030': 8000,
      '70553': 1400, '43239': 2000, '93000': 85,
      '36415': 25, '81002': 15,
    };

    const expectedRate = feeSchedule[denial.cptCode] || denial.billedAmount * 0.7;
    const expectedAmount = expectedRate;
    const paidAmount = denial.paidAmount || denial.allowedAmount || 0;
    const underpaidAmount = Math.max(0, expectedAmount - paidAmount);
    const underpaymentPercent = expectedAmount > 0 ? (underpaidAmount / expectedAmount) * 100 : 0;

    return {
      isUnderpaid: underpaymentPercent > 15, // More than 15% below expected
      expectedAmount,
      expectedRate,
      underpaidAmount,
      underpaymentPercent,
    };
  }
}

export const underpaymentDetector = new UnderpaymentDetectorAgent();
