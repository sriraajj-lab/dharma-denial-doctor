/**
 * Agent Index — Registers all agents with the orchestrator
 * 
 * This is the single entry point for the agentic system.
 * Import this to initialize all agents and the orchestrator.
 */

import { orchestrator } from './orchestrator';
import { triageRouter } from './triage-router';
import { evidenceRetrieval } from './evidence-retrieval';
import { eligibilityCOB } from './eligibility-cob';
import { priorAuthorization } from './prior-authorization';
import { medicalNecessity } from './medical-necessity';
import { timelyFilingWatchdog } from './timely-filing-watchdog';
import { appealStrategist } from './appeal-strategist';
import { underpaymentDetector } from './underpayment-detector';
import { payerBehaviorLearner } from './payer-behavior-learner';
import { rootCausePrevention } from './root-cause-prevention';
import { humanInTheLoop } from './human-in-the-loop';
import { complianceAudit } from './compliance-audit';

// Existing agents (wrapping the current AI analysis/correction/quality check)
import { DenialAnalyzerAgent } from './denial-analyzer';
import { CorrectionEngineAgent } from './correction-engine';
import { QualityCheckerAgent } from './quality-checker';

// Register all 15 agents with the orchestrator
export function initializeAgents(): void {
  // 12 NEW agents
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

  // 3 EXISTING agents (enhanced to use tool framework)
  orchestrator.registerAgent(new DenialAnalyzerAgent());
  orchestrator.registerAgent(new CorrectionEngineAgent());
  orchestrator.registerAgent(new QualityCheckerAgent());

  console.log('[AgentIndex] All 15 agents registered with orchestrator');
}

// Re-export everything
export { orchestrator } from './orchestrator';
export { BaseAgent } from './base-agent';
export type { ToolDefinition, AgentContext, AgentTaskResult, AgentMsg } from './base-agent';
export { triageRouter } from './triage-router';
export { evidenceRetrieval } from './evidence-retrieval';
export { eligibilityCOB } from './eligibility-cob';
export { priorAuthorization } from './prior-authorization';
export { medicalNecessity } from './medical-necessity';
export { timelyFilingWatchdog } from './timely-filing-watchdog';
export { appealStrategist } from './appeal-strategist';
export { underpaymentDetector } from './underpayment-detector';
export { payerBehaviorLearner } from './payer-behavior-learner';
export { rootCausePrevention } from './root-cause-prevention';
export { humanInTheLoop } from './human-in-the-loop';
export { complianceAudit } from './compliance-audit';
export { ALL_TOOLS, getToolByName } from './tool-registry';
export type { ToolDefinition as ToolDef } from './tool-registry';
