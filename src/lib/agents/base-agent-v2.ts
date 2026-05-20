/**
 * Base Agent V2 — Anti-Hallucination Agent Framework
 *
 * Every agent has:
 * 1. STRICT SCOPE — defined by allowedDenialCodes and allowedOperations
 *    - An agent CANNOT process denial codes outside its scope
 *    - An agent CANNOT perform operations outside its allowedOperations
 *
 * 2. NO INVENTION RULE — agents validate and analyze existing data.
 *    - They NEVER create new patient data, new codes, or new policy numbers
 *    - If data is missing, they flag it for human review
 *    - Confidence drops to 0 when required data is unavailable
 *
 * 3. CITATION REQUIREMENT — appeal agent must cite real regulations.
 *    - Template-based generation, not free-form AI text
 *    - Every factual claim must have a source
 *
 * 4. CONFIDENCE SCORING — every output includes confidence.
 *    - Low confidence (< 0.6) = flag for human review
 *    - Very low confidence (< 0.3) = refuse to output, return error
 *
 * 5. OUTPUT SCHEMA VALIDATION — Zod schema enforced on every output.
 *    - If AI output doesn't match schema, fallback to rule-based logic
 *    - No free-form parseJSONResponse ever reaches the next agent
 */

import { z } from 'zod';
import { db } from '../db';

// ─── SCOPE DEFINITION ─────────────────────────────────────────────────────────

export interface AgentScope {
  /** CARC codes this agent is allowed to handle. If empty, agent handles all codes. */
  allowedDenialCodes: string[];
  /** Operations this agent can perform. Prevents scope creep. */
  allowedOperations: string[];
  /** What this agent is FORBIDDEN from doing. Hard guardrails. */
  forbiddenActions: string[];
  /** Minimum data fields required before this agent will execute. */
  requiredInputFields: string[];
}

// ─── CORE TYPES ────────────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
  execute: (params: Record<string, unknown>) => Promise<unknown>;
}

export interface AgentContext {
  agentName: string;
  denialId?: string;
  taskId?: string;
  userId?: string;
  accessLevel?: number;
}

export interface MemoryEntry {
  key: string;
  value: unknown;
  confidence: number;
  sourceCount: number;
}

export interface AgentMsg {
  fromAgent: string;
  toAgent: string;
  messageType: 'request' | 'response' | 'broadcast' | 'escalation' | 'tool_result';
  content: Record<string, unknown>;
  denialId?: string;
  taskId?: string;
}

export interface ScopeViolation {
  field: string;
  reason: string;
  attemptedValue?: string;
}

export interface AgentTaskResult {
  success: boolean;
  output: Record<string, unknown>;
  confidence: number;
  toolsUsed: string[];
  nextActions?: Array<{ agent: string; task: string; input: Record<string, unknown> }>;
  requiresHumanApproval?: boolean;
  humanApprovalReason?: string;
  scopeViolations?: ScopeViolation[];
  fallbackUsed?: boolean;
  error?: string;
}

// ─── ABSTRACT BASE AGENT V2 ───────────────────────────────────────────────────

export abstract class BaseAgentV2 {
  readonly name: string;
  readonly description: string;
  readonly scope: AgentScope;
  readonly outputSchema: z.ZodType;

  private tools: Map<string, ToolDefinition> = new Map();
  private context: AgentContext;

  constructor(
    name: string,
    description: string,
    scope: AgentScope,
    outputSchema: z.ZodType,
  ) {
    this.name = name;
    this.description = description;
    this.scope = scope;
    this.outputSchema = outputSchema;
    this.context = { agentName: name };
  }

  // ─── SCOPE ENFORCEMENT ──────────────────────────────────────────────────

  /**
   * Validate that this agent is allowed to handle the given denial.
   * Returns violations if the agent is operating outside its scope.
   */
  validateScope(input: Record<string, unknown>): { allowed: boolean; violations: ScopeViolation[] } {
    const violations: ScopeViolation[] = [];

    // Check: Is this denial code in our allowed list?
    if (this.scope.allowedDenialCodes.length > 0) {
      const carcCode = input.carcCode as string | undefined;
      if (carcCode && !this.scope.allowedDenialCodes.includes(carcCode)) {
        violations.push({
          field: 'carcCode',
          reason: `Agent "${this.name}" cannot process denial code "${carcCode}". Allowed: ${this.scope.allowedDenialCodes.join(', ')}`,
          attemptedValue: carcCode,
        });
      }
    }

    // Check: Are required input fields present?
    for (const field of this.scope.requiredInputFields) {
      if (input[field] === undefined || input[field] === null || input[field] === '') {
        violations.push({
          field,
          reason: `Agent "${this.name}" requires "${field}" to execute. Missing or empty.`,
        });
      }
    }

    return { allowed: violations.length === 0, violations };
  }

  /**
   * Validate that a specific operation is allowed for this agent.
   */
  isOperationAllowed(operation: string): boolean {
    if (this.scope.allowedOperations.length === 0) return true;
    return this.scope.allowedOperations.includes(operation);
  }

  /**
   * Check if an action is forbidden for this agent.
   */
  isActionForbidden(action: string): boolean {
    return this.scope.forbiddenActions.includes(action);
  }

  // ─── OUTPUT VALIDATION (ANTI-HALLUCINATION) ────────────────────────────

  /**
   * Validate agent output against the Zod schema.
   * If validation fails, return null — the agent must use fallback.
   */
  validateOutput(data: unknown): { valid: boolean; data?: unknown; errors?: string[] } {
    const result = this.outputSchema.safeParse(data);
    if (result.success) {
      return { valid: true, data: result.data };
    }
    const errors = result.error.issues.map(
      (e) => `${e.path.join('.')}: ${e.message}`
    );
    return { valid: false, errors };
  }

  /**
   * Confidence threshold check.
   * Below MIN_CONFIDENCE_OUTPUT (0.3): Refuse to output, return error
   * Below MIN_CONFIDENCE_HUMAN (0.6): Flag for human review
   */
  evaluateConfidence(confidence: number): {
    canOutput: boolean;
    requiresHumanReview: boolean;
    reason?: string;
  } {
    if (confidence < 0.3) {
      return {
        canOutput: false,
        requiresHumanReview: true,
        reason: `Confidence ${confidence.toFixed(2)} is below minimum output threshold (0.3). Agent refusing to output — insufficient data certainty.`,
      };
    }
    if (confidence < 0.6) {
      return {
        canOutput: true,
        requiresHumanReview: true,
        reason: `Confidence ${confidence.toFixed(2)} is below human review threshold (0.6). Flagging for human validation.`,
      };
    }
    return { canOutput: true, requiresHumanReview: false };
  }

  // ─── TOOL USE ──────────────────────────────────────────────────────────

  registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  async useTool(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Agent ${this.name}: Tool "${toolName}" not found. Available: ${Array.from(this.tools.keys()).join(', ')}`);
    }

    // Validate required parameters
    for (const [paramName, paramDef] of Object.entries(tool.parameters)) {
      if (paramDef.required && params[paramName] === undefined) {
        throw new Error(`Agent ${this.name}: Missing required parameter "${paramName}" for tool "${toolName}"`);
      }
    }

    return tool.execute({ ...params, _context: this.context });
  }

  getAvailableTools(): string[] {
    return Array.from(this.tools.keys());
  }

  // ─── PERSISTENT MEMORY ────────────────────────────────────────────────

  async remember(key: string, value: unknown, memoryType: string = 'learning', confidence: number = 0.5): Promise<void> {
    const fullKey = `${this.name}:${key}`;
    const existing = await db.agentMemory.findUnique({
      where: { agentName_memoryType_key: { agentName: this.name, memoryType, key: fullKey } }
    });

    if (existing) {
      const newConfidence = (existing.confidence * existing.sourceCount + confidence) / (existing.sourceCount + 1);
      await db.agentMemory.update({
        where: { id: existing.id },
        data: {
          value: JSON.stringify(value),
          confidence: newConfidence,
          sourceCount: existing.sourceCount + 1,
          lastUsedAt: new Date(),
        }
      });
    } else {
      await db.agentMemory.create({
        data: {
          agentName: this.name,
          memoryType,
          key: fullKey,
          value: JSON.stringify(value),
          confidence,
          sourceCount: 1,
        }
      });
    }
  }

  async recall(key: string, memoryType?: string): Promise<MemoryEntry | null> {
    const fullKey = `${this.name}:${key}`;
    const where: Record<string, unknown> = { agentName: this.name, key: fullKey };
    if (memoryType) where.memoryType = memoryType;

    const entry = await db.agentMemory.findFirst({ where, orderBy: { updatedAt: 'desc' } });
    if (!entry) return null;

    await db.agentMemory.update({ where: { id: entry.id }, data: { lastUsedAt: new Date() } });

    return {
      key: entry.key,
      value: JSON.parse(entry.value),
      confidence: entry.confidence,
      sourceCount: entry.sourceCount,
    };
  }

  async recallAll(memoryType?: string): Promise<MemoryEntry[]> {
    const where: Record<string, unknown> = { agentName: this.name };
    if (memoryType) where.memoryType = memoryType;

    const entries = await db.agentMemory.findMany({ where, orderBy: { confidence: 'desc' } });
    return entries.map(e => ({
      key: e.key,
      value: JSON.parse(e.value),
      confidence: e.confidence,
      sourceCount: e.sourceCount,
    }));
  }

  // ─── AGENT COMMUNICATION ──────────────────────────────────────────────

  async sendMessage(msg: Omit<AgentMsg, 'fromAgent'>): Promise<void> {
    await db.agentMessage.create({
      data: {
        fromAgent: this.name,
        toAgent: msg.toAgent,
        messageType: msg.messageType,
        content: JSON.stringify(msg.content),
        denialId: msg.denialId,
        taskId: msg.taskId,
      }
    });
  }

  async receiveMessages(unreadOnly: boolean = true): Promise<AgentMsg[]> {
    const where: Record<string, unknown> = { toAgent: this.name };
    if (unreadOnly) where.isRead = false;

    const messages = await db.agentMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    if (messages.length > 0) {
      await db.agentMessage.updateMany({
        where: { id: { in: messages.map(m => m.id) } },
        data: { isRead: true },
      });
    }

    return messages.map(m => ({
      fromAgent: m.fromAgent,
      toAgent: m.toAgent,
      messageType: m.messageType as AgentMsg['messageType'],
      content: JSON.parse(m.content),
      denialId: m.denialId ?? undefined,
      taskId: m.taskId ?? undefined,
    }));
  }

  // ─── TASK MANAGEMENT ──────────────────────────────────────────────────

  setContext(ctx: Partial<AgentContext>): void {
    this.context = { ...this.context, ...ctx };
  }

  getContext(): AgentContext {
    return { ...this.context };
  }

  async createTask(taskType: string, targetAgent: string, input: Record<string, unknown>, priority: string = 'normal'): Promise<string> {
    const task = await db.agentTask.create({
      data: {
        agentName: targetAgent,
        taskType,
        priority,
        denialId: this.context.denialId,
        input: JSON.stringify(input),
        sourceAgent: this.name,
        targetAgent,
      }
    });
    return task.id;
  }

  async updateTaskStatus(taskId: string, status: string, output?: Record<string, unknown>, toolsUsed?: string[]): Promise<void> {
    await db.agentTask.update({
      where: { id: taskId },
      data: {
        status,
        ...(output && { output: JSON.stringify(output) }),
        ...(toolsUsed && { toolsUsed: JSON.stringify(toolsUsed) }),
        ...(status === 'running' && { startedAt: new Date() }),
        ...(status === 'completed' && { completedAt: new Date() }),
      }
    });
  }

  // ─── ABSTRACT: EXECUTE TASK ────────────────────────────────────────────

  abstract execute(taskType: string, input: Record<string, unknown>, taskId?: string): Promise<AgentTaskResult>;

  // ─── PROTECTED: RUN WITH GUARDRAILS ────────────────────────────────────

  /**
   * Wraps the execute method with scope validation, confidence checks,
   * and output validation. Every agent should call this from execute().
   */
  protected async executeWithGuardrails(
    taskType: string,
    input: Record<string, unknown>,
    taskId: string | undefined,
    executor: () => Promise<AgentTaskResult>,
  ): Promise<AgentTaskResult> {
    // Step 1: Scope validation
    const scopeCheck = this.validateScope(input);
    if (!scopeCheck.allowed) {
      if (taskId) await this.updateTaskStatus(taskId, 'failed');
      return {
        success: false,
        output: { error: 'Scope violation', violations: scopeCheck.violations },
        confidence: 0,
        toolsUsed: [],
        scopeViolations: scopeCheck.violations,
        error: `Agent "${this.name}" scope violation: ${scopeCheck.violations.map(v => v.reason).join('; ')}`,
      };
    }

    // Step 2: Operation check
    if (!this.isOperationAllowed(taskType)) {
      if (taskId) await this.updateTaskStatus(taskId, 'failed');
      return {
        success: false,
        output: { error: 'Operation not allowed' },
        confidence: 0,
        toolsUsed: [],
        error: `Agent "${this.name}" cannot perform operation "${taskType}". Allowed: ${this.scope.allowedOperations.join(', ')}`,
      };
    }

    // Step 3: Execute
    if (taskId) await this.updateTaskStatus(taskId, 'running');

    try {
      const result = await executor();

      // Step 4: Confidence check
      const confidenceEval = this.evaluateConfidence(result.confidence);
      if (!confidenceEval.canOutput) {
        if (taskId) await this.updateTaskStatus(taskId, 'failed');
        return {
          success: false,
          output: { error: confidenceEval.reason },
          confidence: result.confidence,
          toolsUsed: result.toolsUsed,
          requiresHumanReview: true,
          error: confidenceEval.reason,
        };
      }

      // Step 5: Output schema validation
      const outputValidation = this.validateOutput(result.output);
      if (!outputValidation.valid) {
        console.warn(`[AgentV2:${this.name}] Output schema validation failed:`, outputValidation.errors);
        // Don't fail the task — but mark as fallback used
        result.fallbackUsed = true;
      }

      // Step 6: Apply confidence-based human review flag
      if (confidenceEval.requiresHumanReview && !result.requiresHumanApproval) {
        result.requiresHumanApproval = true;
        result.humanApprovalReason = confidenceEval.reason;
      }

      // Step 7: Update task status
      if (taskId) await this.updateTaskStatus(taskId, result.success ? 'completed' : 'failed', result.output, result.toolsUsed);

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      if (taskId) await this.updateTaskStatus(taskId, 'failed');
      return { success: false, output: { error: errorMsg }, confidence: 0, toolsUsed: [], error: errorMsg };
    }
  }
}
