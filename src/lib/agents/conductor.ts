/**
 * Conductor — The Garry Tan GStack/Conductor Pattern
 *
 * Routes ALL workflows through the orchestrator, enforcing:
 * 1. Level gates (L1 can't run L2 agents)
 * 2. Schema validation on every agent output before the next step runs
 * 3. Workflow state tracking
 * 4. Full audit trail
 *
 * The conductor replaces direct API route calls from the UI.
 */
import { z } from 'zod';
import { orchestrator } from './orchestrator';
import { initializeAgents } from './index';
import {
  getWorkflowForLevel,
  getAvailableStepsForLevel,
  isAgentAllowedAtLevel,
  WorkflowStep,
  WorkflowDefinition,
  SINGLE_AGENT_WORKFLOWS,
} from './workflows';
import {
  validateAgentOutput,
  AGENT_OUTPUT_SCHEMAS,
} from './schemas';
import { AccessLevel } from '../types';

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface ConductorStepResult {
  agent: string;
  task: string;
  success: boolean;
  validated: boolean;
  confidence: number;
  output?: Record<string, unknown>;
  validationErrors?: string[];
  fallbackUsed?: boolean;
}

export interface ConductorResult {
  success: boolean;
  workflow: string;
  level: AccessLevel;
  steps: ConductorStepResult[];
  finalOutput: Record<string, unknown>;
  auditTrail: string;
}

// ─── CONDUCTOR ────────────────────────────────────────────────────────────────

let agentsInitialized = false;

function ensureAgentsInitialized() {
  if (!agentsInitialized) {
    initializeAgents();
    agentsInitialized = true;
  }
}

export class Conductor {
  private workflowState: Map<string, Map<string, { success: boolean; output?: Record<string, unknown>; confidence: number }>> = new Map();

  /**
   * Run the full workflow for a denial, gated by the user's access level.
   */
  async processDenial(denialId: string, level: AccessLevel): Promise<ConductorResult> {
    ensureAgentsInitialized();

    const workflow = getWorkflowForLevel(level);
    const availableSteps = getAvailableStepsForLevel(level, workflow);
    const traceId = `wf_${Date.now()}_${denialId.slice(0, 8)}`;

    // Initialize state for this denial
    this.workflowState.set(denialId, new Map());
    const stepResults: ConductorStepResult[] = [];

    for (const step of availableSteps) {
      // Check dependencies
      const depsMet = step.dependsOn.every((dep) => {
        const depResult = this.workflowState.get(denialId)?.get(dep);
        return depResult?.success === true;
      });
      if (!depsMet) {
        // Skip this step if dependencies aren't met
        stepResults.push({
          agent: step.agent,
          task: step.task,
          success: false,
          validated: false,
          confidence: 0,
          validationErrors: ['Dependencies not met — skipped'],
        });
        continue;
      }

      // Submit task to orchestrator
      const taskId = await orchestrator.submitTask(step.task, { denialId }, {
        denialId,
        targetAgent: step.agent,
      });

      // Execute
      const result = await orchestrator.processTask(taskId);

      // Validate output if this step has a validation gate
      let validated = true;
      let validationErrors: string[] = [];
      let fallbackUsed = false;

      if (step.validationGate && result.success) {
        const schema = AGENT_OUTPUT_SCHEMAS[step.agent];
        if (schema) {
          // The agent output is wrapped in a result object.
          // We validate the primary output key if present.
          const outputToValidate = result.output?.analysis ||
            result.output?.correction ||
            result.output?.qualityCheck ||
            result.output?.appealStrategy ||
            result.output?.classification ||
            result.output;

          const validation = validateAgentOutput(schema, outputToValidate);
          if (!validation.success) {
            validated = false;
            validationErrors = validation.errors || [];
            // Mark step as failed since output doesn't conform to schema
            result.success = false;
          }
        }
      }

      // Store step result in workflow state
      this.workflowState.get(denialId)?.set(step.task, {
        success: result.success,
        output: result.output,
        confidence: result.confidence,
      });

      stepResults.push({
        agent: step.agent,
        task: step.task,
        success: result.success,
        validated,
        confidence: result.confidence,
        output: result.success ? result.output : undefined,
        validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
        fallbackUsed,
      });

      // If a validation-gated step fails, stop the pipeline
      if (!result.success && step.validationGate) {
        break;
      }
    }

    // Compile final output
    const finalOutput: Record<string, unknown> = {};
    for (const stepResult of stepResults) {
      if (stepResult.output) {
        finalOutput[stepResult.task] = stepResult.output;
      }
    }

    return {
      success: stepResults.filter((s) => s.success).length > 0 &&
        stepResults.every((s) => s.success || !stepResults.some((r) => r.task === s.task)),
      workflow: workflow.name,
      level,
      steps: stepResults,
      finalOutput,
      auditTrail: traceId,
    };
  }

  /**
   * Run a single agent with level gating enforced.
   */
  async runSingleAgent(
    agentName: string,
    taskType: string,
    input: Record<string, unknown>,
    level: AccessLevel
  ): Promise<ConductorResult> {
    ensureAgentsInitialized();

    // Level gate check
    if (!isAgentAllowedAtLevel(agentName, taskType, level)) {
      return {
        success: false,
        workflow: 'blocked',
        level,
        steps: [
          {
            agent: agentName,
            task: taskType,
            success: false,
            validated: false,
            confidence: 0,
            validationErrors: [
              `Agent "${agentName}" with task "${taskType}" is not available at Level ${level}`,
            ],
          },
        ],
        finalOutput: {},
        auditTrail: `blocked_${Date.now()}`,
      };
    }

    const denialId = input.denialId as string;
    const taskId = await orchestrator.submitTask(taskType, input, {
      targetAgent: agentName,
      denialId,
    });
    const result = await orchestrator.processTask(taskId);

    // Validate output against schema
    let validated = true;
    let validationErrors: string[] = [];
    const schema = AGENT_OUTPUT_SCHEMAS[agentName];
    if (schema && result.success) {
      const outputToValidate = result.output?.analysis ||
        result.output?.correction ||
        result.output?.qualityCheck ||
        result.output?.appealStrategy ||
        result.output?.classification ||
        result.output;

      const validation = validateAgentOutput(schema, outputToValidate);
      if (!validation.success) {
        validated = false;
        validationErrors = validation.errors || [];
      }
    }

    return {
      success: result.success && validated,
      workflow: 'single_agent',
      level,
      steps: [
        {
          agent: agentName,
          task: taskType,
          success: result.success,
          validated,
          confidence: result.confidence,
          output: result.success ? result.output : undefined,
          validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
        },
      ],
      finalOutput: result.success ? result.output : {},
      auditTrail: `single_${Date.now()}`,
    };
  }

  /**
   * Get the full system status — all 6 agents, their runs, success rates, etc.
   */
  async getSystemStatus(): Promise<{
    agents: Array<{
      name: string;
      description: string;
      capabilities: string[];
      tools: string[];
      level: AccessLevel;
      category: string;
    }>;
    pendingTasks: number;
    runningTasks: number;
    recentCompletions: number;
    workflows: {
      l1: WorkflowDefinition;
      l2: WorkflowDefinition;
      l3: WorkflowDefinition;
    };
  }> {
    ensureAgentsInitialized();

    const status = await orchestrator.getSystemStatus();

    // Categorize agents by level
    const agentLevelMap: Record<string, { level: AccessLevel; category: string }> = {
      'orchestrator-agent': { level: 1, category: 'Orchestration' },
      'demographics-agent': { level: 1, category: 'Validation' },
      'eligibility-agent': { level: 2, category: 'Verification' },
      'coding-agent': { level: 2, category: 'Code Correction' },
      'scrubber-agent': { level: 2, category: 'Pre-Submission' },
      'appeal-agent': { level: 2, category: 'Appeals' },
    };

    const { L1_SCAN_WORKFLOW, L2_FIX_WORKFLOW, L3_AUTO_WORKFLOW } = await import('./workflows');

    return {
      agents: status.agents.map((a) => ({
        ...a,
        level: agentLevelMap[a.name]?.level || 2,
        category: agentLevelMap[a.name]?.category || 'General',
      })),
      pendingTasks: status.pendingTasks,
      runningTasks: status.runningTasks,
      recentCompletions: status.recentCompletions,
      workflows: {
        l1: L1_SCAN_WORKFLOW,
        l2: L2_FIX_WORKFLOW,
        l3: L3_AUTO_WORKFLOW,
      },
    };
  }

  /**
   * Get task history for a specific agent
   */
  async getAgentTaskHistory(agentName: string, limit: number = 20): Promise<Array<{
    id: string;
    taskType: string;
    status: string;
    confidenceScore: number | null;
    createdAt: string;
    completedAt: string | null;
  }>> {
    const dbModule = await import('../db');
    const db = dbModule.db;
    const tasks = await db.agentTask.findMany({
      where: { agentName },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return tasks.map((t: any) => ({
      id: t.id,
      taskType: t.taskType,
      status: t.status,
      confidenceScore: t.confidenceScore,
      createdAt: t.createdAt?.toISOString(),
      completedAt: t.completedAt?.toISOString(),
    }));
  }
}

// Singleton
export const conductor = new Conductor();
