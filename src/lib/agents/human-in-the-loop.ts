import { BaseAgent, AgentTaskResult } from './base-agent';
import { db } from '../db';

export class HumanInTheLoopAgent extends BaseAgent {
  constructor() {
    super('human-in-the-loop', 'Manages human approval gates, escalations, and oversight for agent decisions that require human judgment', [
      'human_approval', 'escalation_management', 'high_value_review', 'compliance_oversight'
    ]);
  }

  async execute(taskType: string, input: Record<string, unknown>, taskId?: string): Promise<AgentTaskResult> {
    if (taskId) await this.updateTaskStatus(taskId, 'running');

    try {
      switch (taskType) {
        case 'human_approval':
          return await this.requestApproval(input, taskId);
        case 'escalation':
          return await this.handleEscalation(input, taskId);
        case 'process_approvals':
          return await this.processPendingApprovals(taskId);
        default:
          return await this.requestApproval(input, taskId);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      if (taskId) await this.updateTaskStatus(taskId, 'failed');
      return { success: false, output: { error: errorMsg }, confidence: 0, toolsUsed: [], error: errorMsg };
    }
  }

  private async requestApproval(input: Record<string, unknown>, taskId?: string): Promise<AgentTaskResult> {
    const denialId = input.denialId as string;
    const taskType = input.taskType as string || 'correction_approval';
    const urgency = input.urgency as string || 'normal';
    const agentName = input.agentName as string || 'unknown';

    const approval = await db.humanApproval.create({
      data: {
        taskType,
        denialId,
        agentName,
        requestedAction: JSON.stringify(input),
        urgency,
        status: 'pending',
        expiresAt: new Date(Date.now() + (urgency === 'critical' ? 4 : 24) * 60 * 60 * 1000),
      }
    });

    const result = {
      approvalId: approval.id,
      status: 'pending',
      urgency,
      expiresAt: approval.expiresAt?.toISOString(),
      message: `Human approval requested for ${taskType}. Urgency: ${urgency}. ${urgency === 'critical' ? 'Expires in 4 hours.' : 'Expires in 24 hours.'}`,
    };

    if (taskId) await this.updateTaskStatus(taskId, 'completed', result, []);

    return {
      success: true,
      output: result,
      confidence: 1.0,
      toolsUsed: [],
    };
  }

  private async handleEscalation(input: Record<string, unknown>, taskId?: string): Promise<AgentTaskResult> {
    const denialId = input.denialId as string;
    const reason = input.reason as string || 'Agent escalation';
    const fromAgent = input.fromAgent as string || 'unknown';

    const approval = await db.humanApproval.create({
      data: {
        taskType: 'escalation',
        denialId,
        agentName: fromAgent,
        requestedAction: JSON.stringify({ reason, escalatedBy: fromAgent, ...input }),
        urgency: 'high',
        status: 'pending',
        expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours
      }
    });

    // Notify relevant agents about the escalation
    await this.sendMessage({
      toAgent: 'compliance-audit',
      messageType: 'escalation',
      content: { approvalId: approval.id, denialId, reason, fromAgent },
      denialId,
    });

    const result = {
      escalationId: approval.id,
      status: 'escalated',
      reason,
      fromAgent,
    };

    if (taskId) await this.updateTaskStatus(taskId, 'completed', result, []);

    return {
      success: true,
      output: result,
      confidence: 1.0,
      toolsUsed: [],
    };
  }

  private async processPendingApprovals(taskId?: string): Promise<AgentTaskResult> {
    const pending = await db.humanApproval.findMany({
      where: { status: 'pending' },
      orderBy: [
        { urgency: 'desc' },
        { createdAt: 'asc' },
      ],
      take: 50,
    });

    // Check for expired approvals
    const now = new Date();
    const expired = pending.filter(a => a.expiresAt && new Date(a.expiresAt) < now);
    for (const approval of expired) {
      await db.humanApproval.update({
        where: { id: approval.id },
        data: { status: 'expired' }
      });
    }

    const activePending = pending.filter(a => !expired.includes(a));

    const result = {
      pendingCount: activePending.length,
      expiredCount: expired.length,
      pendingApprovals: activePending.map(a => ({
        id: a.id,
        taskType: a.taskType,
        denialId: a.denialId,
        agentName: a.agentName,
        urgency: a.urgency,
        createdAt: a.createdAt.toISOString(),
        expiresAt: a.expiresAt?.toISOString(),
      })),
    };

    if (taskId) await this.updateTaskStatus(taskId, 'completed', result, []);

    return {
      success: true,
      output: result,
      confidence: 1.0,
      toolsUsed: [],
    };
  }
}

export const humanInTheLoop = new HumanInTheLoopAgent();
