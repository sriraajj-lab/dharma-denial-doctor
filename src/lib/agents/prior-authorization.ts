import { BaseAgent, AgentTaskResult } from './base-agent';
import { payerRulesTool, denialDataTool } from './tool-registry';

export class PriorAuthorizationAgent extends BaseAgent {
  constructor() {
    super('prior-authorization', 'Manages prior authorization workflows including retro-authorization, auth verification, and emergent circumstances', [
      'prior_auth_check', 'retro_authorization', 'auth_verification', 'peer_to_peer'
    ]);
    this.registerTool(payerRulesTool);
    this.registerTool(denialDataTool);
  }

  async execute(taskType: string, input: Record<string, unknown>, taskId?: string): Promise<AgentTaskResult> {
    if (taskId) await this.updateTaskStatus(taskId, 'running');

    try {
      const denialId = input.denialId as string;
      const denial = await this.useTool('denial_data', { action: 'get', denialId }) as Record<string, unknown> | null;
      if (!denial) {
        return { success: false, output: { error: 'Denial not found' }, confidence: 0, toolsUsed: ['denial_data'] };
      }

      // Check payer auth requirements
      const payerRules = await this.useTool('payer_rules', {
        payerName: denial.payerName as string,
        ruleType: 'auth_required',
        cptCode: denial.cptCode as string,
      }) as Record<string, unknown>;

      // Determine auth resolution strategy
      const strategy = this.determineAuthStrategy(denial, payerRules);

      // Remember payer auth patterns
      await this.remember(
        `auth:${denial.payerName}:${denial.cptCode}`,
        { requiresAuth: payerRules.authRequired, strategy },
        'pattern',
        0.85
      );

      const authRules = payerRules.rules as Array<Record<string, unknown>> | undefined;
      const filteredRules = authRules?.filter((r: Record<string, unknown>) => r.ruleType === 'auth_required');

      const result = {
        authRequired: payerRules.authRequired,
        authRules: filteredRules,
        strategy,
        nextSteps: strategy.steps,
        estimatedSuccessRate: strategy.successRate,
        requiresHumanApproval: strategy.successRate < 50,
      };

      if (taskId) await this.updateTaskStatus(taskId, 'completed', result, ['denial_data', 'payer_rules']);

      return {
        success: true,
        output: result,
        confidence: 0.85,
        toolsUsed: ['denial_data', 'payer_rules'],
        nextActions: strategy.nextAgent && strategy.nextTask ? [{
          agent: strategy.nextAgent,
          task: strategy.nextTask,
          input: { denialId, ...strategy.nextInput },
        }] : [],
        requiresHumanApproval: result.requiresHumanApproval,
        humanApprovalReason: strategy.successRate < 50 ? 'Low success rate for retro-authorization - requires manager approval' : undefined,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      if (taskId) await this.updateTaskStatus(taskId, 'failed');
      return { success: false, output: { error: errorMsg }, confidence: 0, toolsUsed: [], error: errorMsg };
    }
  }

  private determineAuthStrategy(
    denial: Record<string, unknown>,
    payerRules: Record<string, unknown>
  ): {
    type: string;
    steps: string[];
    successRate: number;
    nextAgent?: string;
    nextTask?: string;
    nextInput?: Record<string, unknown>;
  } {
    const carcCode = denial.carcCode as string;
    const deniedAmount = (denial.deniedAmount as number) || 0;

    if (carcCode === 'CO-50' || carcCode === 'CO-197') {
      // Auth was not obtained
      if (deniedAmount > 5000) {
        // High-value: always try retro-auth and appeal
        return {
          type: 'retro_authorization',
          steps: [
            'Contact payer for retro-authorization process',
            'Request peer-to-peer review',
            'Document emergent/urgent circumstances',
            'Submit retro-auth application with clinical documentation',
            'If retro-auth denied, file formal appeal with medical records',
          ],
          successRate: 55,
          nextAgent: 'appeal-strategist',
          nextTask: 'appeal_strategy',
          nextInput: { denialId: denial.id as string, appealType: 'first_level', reason: 'retro_authorization_needed' },
        };
      }

      return {
        type: 'retro_authorization',
        steps: [
          'Check if payer allows retro-authorization',
          'Gather clinical documentation supporting medical necessity',
          'Submit retro-auth request through payer portal',
          'If retro-auth not allowed, appeal with emergent circumstances documentation',
        ],
        successRate: 40,
        nextAgent: 'human-in-the-loop',
        nextTask: 'human_approval',
        nextInput: { denialId: denial.id as string, taskType: 'correction_approval', urgency: 'high' },
      };
    }

    // CO-4 with auth implication
    if (carcCode === 'CO-4' && payerRules.authRequired) {
      return {
        type: 'auth_verification',
        steps: [
          'Verify if auth was obtained but not linked to claim',
          'Check auth reference number in system',
          'Resubmit claim with auth number if available',
          'If no auth, pursue retro-authorization',
        ],
        successRate: 70,
      };
    }

    return {
      type: 'general_auth_resolution',
      steps: ['Review denial for auth requirements', 'Contact payer for clarification', 'Document any existing auth'],
      successRate: 50,
    };
  }
}

export const priorAuthorization = new PriorAuthorizationAgent();
