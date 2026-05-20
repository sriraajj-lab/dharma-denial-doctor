/**
 * Agent Index — 6 Functional Agent Architecture
 *
 * 1. Orchestrator Agent — Routes denials, validates outputs, enforces level gates
 * 2. Demographics Agent — Validates patient demographic data completeness
 * 3. Eligibility Agent — Verifies coverage, COB, authorization status
 * 4. Coding Agent — Validates AND generates corrected CPT/ICD-10 codes (rule-based + AI)
 * 5. Scrubber Agent — Pre-submission claim scrubbing (payer ID, filing, duplicates)
 * 6. Appeal Agent — Generates appeal strategies and template letters with citations
 */

import { orchestrator } from './orchestrator';
import { orchestratorAgent } from './orchestrator-agent';
import { demographicsAgent } from './demographics-agent';
import { eligibilityAgent } from './eligibility-agent';
import { codingAgent } from './coding-agent';
import { scrubberAgent } from './scrubber-agent';
import { appealAgent } from './appeal-agent';

// Register all 6 agents with the orchestrator
export function initializeAgents(): void {
  orchestrator.registerAgent(orchestratorAgent);
  orchestrator.registerAgent(demographicsAgent);
  orchestrator.registerAgent(eligibilityAgent);
  orchestrator.registerAgent(codingAgent);
  orchestrator.registerAgent(scrubberAgent);
  orchestrator.registerAgent(appealAgent);

  console.log('[AgentIndex] All 6 agents registered with orchestrator');
}

// Re-export everything
export { orchestrator } from './orchestrator';
export { BaseAgentV2 } from './base-agent-v2';
export type { ToolDefinition, AgentContext, AgentTaskResult, AgentMsg, ScopeViolation } from './base-agent-v2';
export { orchestratorAgent } from './orchestrator-agent';
export { demographicsAgent } from './demographics-agent';
export { eligibilityAgent } from './eligibility-agent';
export { codingAgent } from './coding-agent';
export { scrubberAgent } from './scrubber-agent';
export { appealAgent } from './appeal-agent';
export { ALL_TOOLS, getToolByName } from './tool-registry';
export type { ToolDefinition as ToolDef } from './tool-registry';
