/**
 * Level-Gated Workflow Definitions — V2 (6-Agent Architecture)
 *
 * L1: Demographics + Orchestrator (triage only)
 * L2: Full pipeline — Orchestrator → Demographics → Eligibility → Coding (validation + generation) → Scrubber → Appeal
 * L3: L2 + autonomous EHR integration (aspirational)
 */
import { AccessLevel } from '../types';

export type WorkflowStep = {
  agent: string;
  task: string;
  requiredLevel: AccessLevel;
  dependsOn: string[];
  validationGate: boolean;
  description: string;
};

export interface WorkflowDefinition {
  name: string;
  description: string;
  minLevel: AccessLevel;
  steps: WorkflowStep[];
}

// ─── L1 WORKFLOW: Scan & Score (diagnostic only) ──────────────────────────────

export const L1_SCAN_WORKFLOW: WorkflowDefinition = {
  name: 'scan_and_score',
  description: 'Level 1: Scan report, score billing work, show pain points',
  minLevel: 1,
  steps: [
    {
      agent: 'orchestrator-agent',
      task: 'triage',
      requiredLevel: 1,
      dependsOn: [],
      validationGate: true,
      description: 'Classify denial and determine which agents to route to',
    },
    {
      agent: 'demographics-agent',
      task: 'demographics_validation',
      requiredLevel: 1,
      dependsOn: ['triage'],
      validationGate: true,
      description: 'Validate patient demographics completeness',
    },
  ],
};

// ─── L2 WORKFLOW: Full fix pipeline ──────────────────────────────────────────

export const L2_FIX_WORKFLOW: WorkflowDefinition = {
  name: 'fix_and_appeal',
  description:
    'Level 2: Analyze eligibility, coding (with AI code generation), scrub, and generate appeal strategies',
  minLevel: 2,
  steps: [
    {
      agent: 'orchestrator-agent',
      task: 'triage',
      requiredLevel: 1,
      dependsOn: [],
      validationGate: true,
      description: 'Classify denial and determine workflow',
    },
    {
      agent: 'demographics-agent',
      task: 'demographics_validation',
      requiredLevel: 1,
      dependsOn: ['triage'],
      validationGate: true,
      description: 'Validate demographics before deeper analysis',
    },
    {
      agent: 'eligibility-agent',
      task: 'eligibility_check',
      requiredLevel: 2,
      dependsOn: ['demographics_validation'],
      validationGate: true,
      description: 'Verify eligibility, coverage, COB, and authorization',
    },
    {
      agent: 'coding-agent',
      task: 'coding_validation',
      requiredLevel: 2,
      dependsOn: ['demographics_validation'],
      validationGate: true,
      description: 'Validate CPT/ICD-10, NCCI edits, medical necessity',
    },
    {
      agent: 'coding-agent',
      task: 'code_generation',
      requiredLevel: 2,
      dependsOn: ['coding_validation'],
      validationGate: false,
      description: 'Generate corrected CPT/ICD-10 codes when original codes are wrong (rule-based + AI)',
    },
    {
      agent: 'scrubber-agent',
      task: 'pre_submission_check',
      requiredLevel: 2,
      dependsOn: ['coding_validation'],
      validationGate: true,
      description: 'Pre-submission scrub: payer ID, timely filing, duplicates',
    },
    {
      agent: 'appeal-agent',
      task: 'generate_appeal_strategy',
      requiredLevel: 2,
      dependsOn: ['coding_validation'],
      validationGate: false,
      description: 'Generate appeal strategy with verified citations',
    },
  ],
};

// ─── L3 WORKFLOW: Autonomous (same as L2 + placeholder EHR steps) ─────────────

export const L3_AUTO_WORKFLOW: WorkflowDefinition = {
  name: 'auto_fix',
  description: 'Level 3: Full autonomous correction and resubmission via EHR',
  minLevel: 3,
  steps: [
    ...L2_FIX_WORKFLOW.steps,
    // L3-only: EHR auto-submit (aspirational)
    {
      agent: 'orchestrator-agent',
      task: 'auto_submit',
      requiredLevel: 3,
      dependsOn: ['pre_submission_check'],
      validationGate: true,
      description: 'Auto-submit corrected claim via EHR integration',
    },
  ],
};

// ─── SINGLE-AGENT WORKFLOWS (for individual agent runs) ───────────────────────

export const SINGLE_AGENT_WORKFLOWS: Record<
  string,
  { agent: string; task: string; requiredLevel: AccessLevel }
> = {
  // 6 Functional Agents
  triage: { agent: 'orchestrator-agent', task: 'triage', requiredLevel: 1 },
  demographics_validation: { agent: 'demographics-agent', task: 'demographics_validation', requiredLevel: 1 },
  eligibility_check: { agent: 'eligibility-agent', task: 'eligibility_check', requiredLevel: 2 },
  cob_analysis: { agent: 'eligibility-agent', task: 'cob_analysis', requiredLevel: 2 },
  coding_validation: { agent: 'coding-agent', task: 'coding_validation', requiredLevel: 2 },
  code_generation: { agent: 'coding-agent', task: 'code_generation', requiredLevel: 2 },
  pre_submission_check: { agent: 'scrubber-agent', task: 'pre_submission_check', requiredLevel: 2 },
  timely_filing_check: { agent: 'scrubber-agent', task: 'timely_filing_check', requiredLevel: 2 },
  underpayment_check: { agent: 'scrubber-agent', task: 'underpayment_check', requiredLevel: 2 },
  duplicate_check: { agent: 'scrubber-agent', task: 'duplicate_check', requiredLevel: 2 },
  generate_appeal_strategy: { agent: 'appeal-agent', task: 'generate_appeal_strategy', requiredLevel: 2 },
  generate_appeal_letter: { agent: 'appeal-agent', task: 'generate_appeal_letter', requiredLevel: 2 },
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

export function getWorkflowForLevel(level: AccessLevel): WorkflowDefinition {
  if (level >= 3) return L3_AUTO_WORKFLOW;
  if (level >= 2) return L2_FIX_WORKFLOW;
  return L1_SCAN_WORKFLOW;
}

export function getAvailableStepsForLevel(
  level: AccessLevel,
  workflow: WorkflowDefinition
): WorkflowStep[] {
  return workflow.steps.filter((step) => step.requiredLevel <= level);
}

export function isAgentAllowedAtLevel(
  agentName: string,
  taskType: string,
  level: AccessLevel
): boolean {
  // Check single agent workflows first
  const singleKey = Object.keys(SINGLE_AGENT_WORKFLOWS).find(
    (k) =>
      SINGLE_AGENT_WORKFLOWS[k].agent === agentName &&
      SINGLE_AGENT_WORKFLOWS[k].task === taskType
  );
  if (singleKey) {
    return level >= SINGLE_AGENT_WORKFLOWS[singleKey].requiredLevel;
  }

  // Check workflow steps
  const workflow = getWorkflowForLevel(level);
  return workflow.steps.some(
    (s) => s.agent === agentName && s.task === taskType && s.requiredLevel <= level
  );
}
