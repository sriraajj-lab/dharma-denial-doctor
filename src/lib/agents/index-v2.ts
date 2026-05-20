/**
 * Agent Index V2 — 6 Functional Agent Architecture
 *
 * AGENTS:
 * 1. orchestrator-agent — Routes denials, validates outputs, enforces level gates
 * 2. demographics-agent — Validates patient demographics (no invention)
 * 3. eligibility-agent — Verifies eligibility, coverage, COB, authorization
 * 4. coding-agent — Validates CPT/ICD-10, NCCI edits, medical necessity
 * 5. scrubber-agent — Pre-submission validation, timely filing, fee schedules
 * 6. appeal-agent — Generates appeal strategies with verified citations
 *
 * ANTI-HALLUCINATION PRINCIPLES:
 * - Each agent has STRICT SCOPE — cannot operate outside its domain
 * - No agent invents data — missing data = flag for human review
 * - All AI outputs are schema-validated before passing to next agent
 * - Appeal citations must be from verified database or explicitly null
 * - Low confidence outputs are blocked and flagged for human review
 */

import { orchestratorAgent } from './orchestrator-agent';
import { demographicsAgent } from './demographics-agent';
import { eligibilityAgent } from './eligibility-agent';
import { codingAgent } from './coding-agent';
import { scrubberAgent } from './scrubber-agent';
import { appealAgent } from './appeal-agent';

// Legacy agents (kept for backward compatibility with existing API routes)
import { DenialAnalyzerAgent } from './denial-analyzer';
import { CorrectionEngineAgent } from './correction-engine';
import { QualityCheckerAgent } from './quality-checker';

// V2 Base Agent
export { BaseAgentV2 } from './base-agent-v2';
export type {
  ToolDefinition,
  AgentContext,
  AgentTaskResult,
  AgentMsg,
  AgentScope,
  ScopeViolation,
} from './base-agent-v2';

// V2 Agents
export { orchestratorAgent } from './orchestrator-agent';
export { demographicsAgent } from './demographics-agent';
export { eligibilityAgent } from './eligibility-agent';
export { codingAgent } from './coding-agent';
export { scrubberAgent } from './scrubber-agent';
export { appealAgent } from './appeal-agent';

// Legacy exports (for backward compatibility)
export { DenialAnalyzerAgent } from './denial-analyzer';
export { CorrectionEngineAgent } from './correction-engine';
export { QualityCheckerAgent } from './quality-checker';
export { triageRouter } from './triage-router';
export { appealStrategist } from './appeal-strategist';
export { eligibilityCOB } from './eligibility-cob';
export { priorAuthorization } from './prior-authorization';
export { medicalNecessity } from './medical-necessity';
export { evidenceRetrieval } from './evidence-retrieval';
export { timelyFilingWatchdog } from './timely-filing-watchdog';
export { underpaymentDetector } from './underpayment-detector';
export { payerBehaviorLearner } from './payer-behavior-learner';
export { rootCausePrevention } from './root-cause-prevention';
export { humanInTheLoop } from './human-in-the-loop';
export { complianceAudit } from './compliance-audit';
export { orchestrator } from './orchestrator';
export { conductor } from './conductor';
export { ALL_TOOLS, getToolByName } from './tool-registry';
export type { ToolDefinition as ToolDef } from './tool-registry';

/**
 * Initialize the V2 agent system (6 functional agents).
 * This replaces the old 15-agent registration.
 */
export function initializeAgentsV2(): void {
  // Import the orchestrator singleton and register V2 agents
  const { orchestrator } = require('./orchestrator');

  // Register 6 V2 agents
  orchestrator.registerAgent(orchestratorAgent);
  orchestrator.registerAgent(demographicsAgent);
  orchestrator.registerAgent(eligibilityAgent);
  orchestrator.registerAgent(codingAgent);
  orchestrator.registerAgent(scrubberAgent);
  orchestrator.registerAgent(appealAgent);

  console.log('[AgentIndexV2] All 6 V2 agents registered with orchestrator');
}

/**
 * Initialize legacy agents (15-agent system, for backward compatibility).
 */
export function initializeAgentsLegacy(): void {
  const { orchestrator } = require('./orchestrator');
  const { triageRouter } = require('./triage-router');
  const { evidenceRetrieval } = require('./evidence-retrieval');
  const { eligibilityCOB } = require('./eligibility-cob');
  const { priorAuthorization } = require('./prior-authorization');
  const { medicalNecessity } = require('./medical-necessity');
  const { timelyFilingWatchdog } = require('./timely-filing-watchdog');
  const { appealStrategist } = require('./appeal-strategist');
  const { underpaymentDetector } = require('./underpayment-detector');
  const { payerBehaviorLearner } = require('./payer-behavior-learner');
  const { rootCausePrevention } = require('./root-cause-prevention');
  const { humanInTheLoop } = require('./human-in-the-loop');
  const { complianceAudit } = require('./compliance-audit');

  orchestrator.registerAgent(triageRouter);
  orchestrator.registerAgent(evidenceRetrieval);
  orchestrator.registerAgent(eligibilityCOB);
  orchestrator.registerAgent(priorAuthorization);
  orchestrator.registerAgent(medicalNecessity);
  orchestrator.registerAgent(timelyFilingWatchdog);
  orchestrator.registerAgent(appealStrategist);
  orchestrator.registerAgent(underpaymentDetector);
  orchestrator.registerAgent(payerBehaviorLearner);
  orchestrator.registerAgent(rootCausePrevention);
  orchestrator.registerAgent(humanInTheLoop);
  orchestrator.registerAgent(complianceAudit);
  orchestrator.registerAgent(new DenialAnalyzerAgent());
  orchestrator.registerAgent(new CorrectionEngineAgent());
  orchestrator.registerAgent(new QualityCheckerAgent());

  console.log('[AgentIndexLegacy] All 15 legacy agents registered with orchestrator');
}

// Keep backward compatibility — default export initializes V2
export function initializeAgents(): void {
  initializeAgentsV2();
}
