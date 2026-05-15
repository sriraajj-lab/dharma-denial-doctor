import { db } from '../db';

// Tool definition
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
  execute: (params: Record<string, unknown>) => Promise<unknown>;
}

// Agent context passed to tools
export interface AgentContext {
  agentName: string;
  denialId?: string;
  taskId?: string;
  userId?: string;
}

// Memory entry
export interface MemoryEntry {
  key: string;
  value: unknown;
  confidence: number;
  sourceCount: number;
}

// Message between agents
export interface AgentMsg {
  fromAgent: string;
  toAgent: string;
  messageType: 'request' | 'response' | 'broadcast' | 'escalation' | 'tool_result';
  content: Record<string, unknown>;
  denialId?: string;
  taskId?: string;
}

// Task result
export interface AgentTaskResult {
  success: boolean;
  output: Record<string, unknown>;
  confidence: number;
  toolsUsed: string[];
  nextActions?: Array<{ agent: string; task: string; input: Record<string, unknown> }>;
  requiresHumanApproval?: boolean;
  humanApprovalReason?: string;
  error?: string;
}

export abstract class BaseAgent {
  readonly name: string;
  readonly description: string;
  readonly capabilities: string[];

  private tools: Map<string, ToolDefinition> = new Map();
  private context: AgentContext;

  constructor(name: string, description: string, capabilities: string[]) {
    this.name = name;
    this.description = description;
    this.capabilities = capabilities;
    this.context = { agentName: name };
  }

  // ─── TOOL USE ─────────────────────────────────────────────────────────

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
      // Merge: weighted average confidence, increment source count
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

    // Update lastUsedAt
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

  async forget(key: string): Promise<void> {
    const fullKey = `${this.name}:${key}`;
    await db.agentMemory.deleteMany({ where: { agentName: this.name, key: fullKey } });
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

    // Mark as read
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

  async broadcast(content: Record<string, unknown>, denialId?: string): Promise<void> {
    const agents = await this.getRegisteredAgents();
    for (const agent of agents) {
      if (agent !== this.name) {
        await this.sendMessage({
          toAgent: agent,
          messageType: 'broadcast',
          content,
          denialId,
        });
      }
    }
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

  // ─── ABSTRACT METHOD: EXECUTE TASK ────────────────────────────────────

  abstract execute(taskType: string, input: Record<string, unknown>, taskId?: string): Promise<AgentTaskResult>;

  // ─── HELPER ───────────────────────────────────────────────────────────

  private async getRegisteredAgents(): Promise<string[]> {
    // Get all agents that have tasks or memories
    const agents = await db.agentMemory.findMany({
      where: { agentName: { not: this.name } },
      select: { agentName: true },
      distinct: ['agentName'],
    });
    return agents.map(a => a.agentName).concat([
      'triage-router', 'evidence-retrieval', 'eligibility-cob', 'prior-authorization',
      'medical-necessity', 'timely-filing-watchdog', 'appeal-strategist',
      'underpayment-detector', 'payer-behavior-learner', 'root-cause-prevention',
      'human-in-the-loop', 'compliance-audit', 'denial-analyzer', 'correction-engine',
      'quality-checker'
    ]).filter((v, i, a) => a.indexOf(v) === i);
  }
}
