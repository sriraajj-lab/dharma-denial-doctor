import { db } from '../db';
import { BaseAgent, AgentTaskResult } from './base-agent';

interface OrchestratorConfig {
  maxConcurrentTasks: number;
  taskTimeout: number; // ms
  retryLimit: number;
  escalationAgent: string;
}

const DEFAULT_CONFIG: OrchestratorConfig = {
  maxConcurrentTasks: 10,
  taskTimeout: 120000, // 2 minutes
  retryLimit: 3,
  escalationAgent: 'human-in-the-loop',
};

class AgentOrchestrator {
  private agents: Map<string, BaseAgent> = new Map();
  private config: OrchestratorConfig;
  private isRunning: boolean = false;

  constructor(config?: Partial<OrchestratorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ─── AGENT REGISTRATION ───────────────────────────────────────────────

  registerAgent(agent: BaseAgent): void {
    this.agents.set(agent.name, agent);
    console.log(`[Orchestrator] Registered agent: ${agent.name} (capabilities: ${agent.capabilities.join(', ')})`);
  }

  getAgent(name: string): BaseAgent | undefined {
    return this.agents.get(name);
  }

  getAllAgents(): BaseAgent[] {
    return Array.from(this.agents.values());
  }

  // ─── TASK ROUTING ─────────────────────────────────────────────────────

  async submitTask(
    taskType: string,
    input: Record<string, unknown>,
    options?: {
      targetAgent?: string;
      denialId?: string;
      priority?: string;
      sourceAgent?: string;
    }
  ): Promise<string> {
    // Determine target agent if not specified
    const targetAgent = options?.targetAgent || await this.routeTask(taskType, input);

    const task = await db.agentTask.create({
      data: {
        agentName: targetAgent,
        taskType,
        priority: options?.priority || 'normal',
        denialId: options?.denialId,
        input: JSON.stringify(input),
        sourceAgent: options?.sourceAgent || 'orchestrator',
        targetAgent,
      }
    });

    console.log(`[Orchestrator] Task created: ${task.id} → ${targetAgent} (${taskType})`);
    return task.id;
  }

  private async routeTask(taskType: string, input: Record<string, unknown>): Promise<string> {
    // Task type → agent mapping
    const taskRouting: Record<string, string> = {
      'triage': 'triage-router',
      'analyze': 'denial-analyzer',
      'correct': 'correction-engine',
      'quality_check': 'quality-checker',
      'evidence_retrieval': 'evidence-retrieval',
      'eligibility_check': 'eligibility-cob',
      'cob_analysis': 'eligibility-cob',
      'prior_auth': 'prior-authorization',
      'medical_necessity': 'medical-necessity',
      'timely_filing_check': 'timely-filing-watchdog',
      'appeal_strategy': 'appeal-strategist',
      'appeal_generate': 'appeal-strategist',
      'underpayment_check': 'underpayment-detector',
      'payer_behavior_learn': 'payer-behavior-learner',
      'payer_profile': 'payer-behavior-learner',
      'root_cause_prevention': 'root-cause-prevention',
      'human_approval': 'human-in-the-loop',
      'escalation': 'human-in-the-loop',
      'compliance_check': 'compliance-audit',
      'hipaa_check': 'compliance-audit',
    };

    return taskRouting[taskType] || 'triage-router';
  }

  // ─── WORKFLOW EXECUTION ───────────────────────────────────────────────

  async processTask(taskId: string): Promise<AgentTaskResult> {
    const task = await db.agentTask.findUnique({ where: { id: taskId } });
    if (!task) throw new Error(`Task ${taskId} not found`);

    const agent = this.agents.get(task.agentName);
    if (!agent) throw new Error(`Agent ${task.agentName} not registered`);

    // Update task status
    await db.agentTask.update({
      where: { id: taskId },
      data: { status: 'running', startedAt: new Date() }
    });

    agent.setContext({
      denialId: task.denialId ?? undefined,
      taskId: task.id,
    });

    try {
      const result = await agent.execute(
        task.taskType,
        JSON.parse(task.input),
        task.id
      );

      // Store result
      await db.agentTask.update({
        where: { id: taskId },
        data: {
          status: result.success ? 'completed' : 'failed',
          output: JSON.stringify(result.output),
          toolsUsed: JSON.stringify(result.toolsUsed),
          confidenceScore: result.confidence,
          completedAt: new Date(),
          ...(result.error && { errorMessage: result.error }),
        }
      });

      // Handle follow-up actions
      if (result.nextActions) {
        for (const next of result.nextActions) {
          await this.submitTask(next.task, next.input, {
            targetAgent: next.agent,
            denialId: task.denialId ?? undefined,
            sourceAgent: task.agentName,
          });
        }
      }

      // Handle human approval request
      if (result.requiresHumanApproval) {
        await db.humanApproval.create({
          data: {
            taskType: task.taskType,
            denialId: task.denialId,
            agentName: task.agentName,
            requestedAction: JSON.stringify(result.output),
            urgency: result.confidence < 0.5 ? 'high' : 'normal',
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
          }
        });
      }

      console.log(`[Orchestrator] Task ${taskId} ${result.success ? 'completed' : 'failed'} (${task.agentName})`);
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await db.agentTask.update({
        where: { id: taskId },
        data: {
          status: 'failed',
          errorMessage: errorMsg,
          completedAt: new Date(),
          retryCount: { increment: 1 },
        }
      });
      return { success: false, output: {}, confidence: 0, toolsUsed: [], error: errorMsg };
    }
  }

  // ─── FULL DENIAL WORKFLOW ─────────────────────────────────────────────

  async processDenial(denialId: string): Promise<AgentTaskResult> {
    // Step 1: Triage — routes to the right agent
    const triageTaskId = await this.submitTask('triage', { denialId }, { denialId });
    const triageResult = await this.processTask(triageTaskId);

    if (!triageResult.success) {
      return triageResult;
    }

    // Step 2: Based on triage, execute the recommended workflow
    const recommendedActions = triageResult.output.recommendedActions as Array<{
      agent: string;
      task: string;
      input: Record<string, unknown>;
    }> || [];

    const results: AgentTaskResult[] = [];
    for (const action of recommendedActions) {
      const taskId = await this.submitTask(action.task, action.input, {
        targetAgent: action.agent,
        denialId,
        sourceAgent: 'triage-router',
      });
      const result = await this.processTask(taskId);
      results.push(result);
    }

    // Step 3: Learn from this workflow
    const learnTaskId = await this.submitTask('payer_behavior_learn', {
      denialId,
      triageResult: triageResult.output,
      workflowResults: results.map(r => r.output),
    }, { denialId, sourceAgent: 'orchestrator' });
    await this.processTask(learnTaskId);

    return {
      success: results.every(r => r.success),
      output: {
        triage: triageResult.output,
        results: results.map(r => r.output),
      },
      confidence: results.reduce((sum, r) => sum + r.confidence, 0) / Math.max(results.length, 1),
      toolsUsed: results.flatMap(r => r.toolsUsed),
    };
  }

  // ─── BACKGROUND PROCESSING ────────────────────────────────────────────

  async start(): Promise<void> {
    this.isRunning = true;
    console.log('[Orchestrator] Started background processing');

    while (this.isRunning) {
      try {
        // Process pending tasks
        const pendingTasks = await db.agentTask.findMany({
          where: { status: 'pending' },
          orderBy: [
            { priority: 'desc' },  // critical first
            { createdAt: 'asc' },  // oldest first
          ],
          take: this.config.maxConcurrentTasks,
        });

        for (const task of pendingTasks) {
          await this.processTask(task.id);
        }

        // Retry failed tasks under limit
        const retryableTasks = await db.agentTask.findMany({
          where: { status: 'failed', retryCount: { lt: this.config.retryLimit } },
          orderBy: { createdAt: 'asc' },
          take: 3,
        });

        for (const task of retryableTasks) {
          await db.agentTask.update({
            where: { id: task.id },
            data: { status: 'pending', retryCount: { increment: 1 } }
          });
        }

        // Check for timed out tasks
        const timedOutCutoff = new Date(Date.now() - this.config.taskTimeout);
        const timedOutTasks = await db.agentTask.findMany({
          where: { status: 'running', startedAt: { lt: timedOutCutoff } },
        });
        for (const task of timedOutTasks) {
          await db.agentTask.update({
            where: { id: task.id },
            data: { status: 'failed', errorMessage: 'Task timed out' }
          });
        }

        // Check timely filing watchdog
        await this.runTimelyFilingWatchdog();

      } catch (error) {
        console.error('[Orchestrator] Background error:', error);
      }

      // Wait before next cycle
      await new Promise(resolve => setTimeout(resolve, 30000)); // 30 second cycles
    }
  }

  stop(): void {
    this.isRunning = false;
    console.log('[Orchestrator] Stopped');
  }

  // ─── TIMELY FILING WATCHDOG ───────────────────────────────────────────

  private async runTimelyFilingWatchdog(): Promise<void> {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const atRiskDenials = await db.denial.findMany({
      where: {
        status: { notIn: ['Closed', 'Resubmitted'] },
        isTimelyFilingRisk: true,
        filingDeadline: { lte: thirtyDaysFromNow },
      },
      take: 50,
    });

    for (const denial of atRiskDenials) {
      await this.submitTask('timely_filing_check', {
        denialId: denial.id,
        filingDeadline: denial.filingDeadline?.toISOString(),
        daysRemaining: denial.filingDeadlineDays,
      }, {
        denialId: denial.id,
        priority: 'high',
        sourceAgent: 'orchestrator-watchdog',
      });
    }
  }

  // ─── STATUS & MONITORING ──────────────────────────────────────────────

  async getSystemStatus(): Promise<{
    agents: Array<{ name: string; description: string; capabilities: string[]; tools: string[] }>;
    pendingTasks: number;
    runningTasks: number;
    recentCompletions: number;
  }> {
    const [pending, running, completed24h] = await Promise.all([
      db.agentTask.count({ where: { status: 'pending' } }),
      db.agentTask.count({ where: { status: 'running' } }),
      db.agentTask.count({
        where: {
          status: 'completed',
          completedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }
      }),
    ]);

    return {
      agents: this.getAllAgents().map(a => ({
        name: a.name,
        description: a.description,
        capabilities: a.capabilities,
        tools: a.getAvailableTools(),
      })),
      pendingTasks: pending,
      runningTasks: running,
      recentCompletions: completed24h,
    };
  }
}

// Singleton orchestrator
export const orchestrator = new AgentOrchestrator();
export { AgentOrchestrator };
