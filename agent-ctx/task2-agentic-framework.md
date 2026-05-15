# Task: Agentic Orchestration Framework Implementation

## Summary
Created the agentic orchestration framework for the Denial Doctor RCM system, fixing "Critical Issue 1: Not truly agentic" by adding orchestration, tool use, persistent memory, and agent communication.

## Files Created

### 1. `/home/z/my-project/denial-doctor/src/lib/agents/base-agent.ts`
- **BaseAgent abstract class** — the foundation all agents extend
- **Tool Use**: `registerTool()`, `useTool()`, `getAvailableTools()` — agents can call registered tools with parameter validation
- **Persistent Memory**: `remember()`, `recall()`, `recallAll()`, `forget()` — backed by Prisma `AgentMemory` model with confidence-weighted merging
- **Agent Communication**: `sendMessage()`, `receiveMessages()`, `broadcast()` — via Prisma `AgentMessage` model with read/unread tracking
- **Task Lifecycle**: `setContext()`, `getContext()`, `createTask()`, `updateTaskStatus()` — integration with `AgentTask` model
- **Abstract method**: `execute()` — each agent must implement its own task execution logic

### 2. `/home/z/my-project/denial-doctor/src/lib/agents/orchestrator.ts`
- **AgentOrchestrator class** — central coordinator
- **Agent Registration**: `registerAgent()`, `getAgent()`, `getAllAgents()`
- **Task Routing**: `submitTask()` with automatic routing via `routeTask()` — maps task types to specific agents
- **Workflow Execution**: `processTask()` — runs a single task through the assigned agent, handles follow-up actions and human approval
- **Full Denial Workflow**: `processDenial()` — triage → execute recommended actions → learn from workflow
- **Background Processing**: `start()`/`stop()` — continuous loop processing pending tasks, retrying failures, timing out stuck tasks, and running the timely filing watchdog
- **Monitoring**: `getSystemStatus()` — agent list, pending/running/recent tasks
- **Singleton export**: `orchestrator` instance

### 3. `/home/z/my-project/denial-doctor/src/lib/agents/tool-registry.ts`
- **7 callable tools** that fix "Critical Issue 5" (rule engines not callable):
  1. `payer_rules` — look up payer-specific rules, filing/appeal deadlines, auth requirements
  2. `claim_scrub` — run claim scrubbing rules against claim data
  3. `coding_intelligence` — NCCI edits, modifier validation, CPT-ICD crosswalk, coverage rules
  4. `resubmission_intelligence` — historical success predictions, alternative strategies
  5. `eligibility_resolver` — eligibility/COB resolution strategies by denial code
  6. `appeal_generator` — appeal strategy and deadline calculation
  7. `denial_data` — CRUD operations on denial records
- **Registry exports**: `ALL_TOOLS` array, `getToolByName()` helper

## TypeScript Verification
All three files compile cleanly with zero TypeScript errors (verified with `npx tsc --noEmit`).

## Prisma Model Dependencies
The framework relies on these existing Prisma models:
- `AgentTask` — task queue with priority, status, retry tracking
- `AgentMemory` — persistent key-value store with confidence scores
- `AgentMessage` — inter-agent communication with read tracking
- `HumanApproval` — approval gates for high-risk actions
- `Denial` — core denial records
- `PayerRule`, `ClaimScrubRule`, `ResubmissionRecord`, `PayerBehaviorProfile` — tool data sources
