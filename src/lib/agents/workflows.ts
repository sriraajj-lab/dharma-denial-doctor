/**
 * Level-Gated Workflow Definitions
 *
 * Defines structured workflows that enforce level access.
 * L1 gets Scan workflow only (diagnostic).
 * L2 gets full Triage → Analyze → Correct → QualityCheck → Appeal → FixReport pipeline.
 * L3 gets L2 + autonomous EHR integration (aspirational).
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
      agent: 'triage-router',
      task: 'triage',
      requiredLevel: 1,
      dependsOn: [],
      validationGate: true,
      description: 'Classify denials and assign priorities',
    },
  ],
};

// ─── L2 WORKFLOW: Full fix pipeline ──────────────────────────────────────────

export const L2_FIX_WORKFLOW: WorkflowDefinition = {
  name: 'fix_and_appeal',
  description:
    'Level 2: Analyze, correct, validate, generate appeals and fix report',
  minLevel: 2,
  steps: [
    {
      agent: 'triage-router',
      task: 'triage',
      requiredLevel: 1,
      dependsOn: [],
      validationGate: true,
      description: 'Classify denial and determine workflow',
    },
    {
      agent: 'denial-analyzer',
      task: 'analyze',
      requiredLevel: 2,
      dependsOn: ['triage'],
      validationGate: true,
      description: 'Deep analysis with root cause identification',
    },
    {
      agent: 'correction-engine',
      task: 'correct',
      requiredLevel: 2,
      dependsOn: ['analyze'],
      validationGate: true,
      description: 'Generate correction suggestions',
    },
    {
      agent: 'quality-checker',
      task: 'quality_check',
      requiredLevel: 2,
      dependsOn: ['correct'],
      validationGate: true,
      description: 'Validate corrections before resubmission',
    },
    {
      agent: 'appeal-strategist',
      task: 'appeal_strategy',
      requiredLevel: 2,
      dependsOn: ['analyze'],
      validationGate: false,
      description: 'Generate appeal strategy and letter',
    },
    {
      agent: 'root-cause-prevention',
      task: 'root_cause_prevention',
      requiredLevel: 2,
      dependsOn: ['correct'],
      validationGate: false,
      description: 'Learn from this denial to prevent future ones',
    },
  ],
};

// ─── L3 WORKFLOW: Autonomous (same as L2 + placeholder EHR steps) ─────────────

export const L3_AUTO_WORKFLOW: WorkflowDefinition = {
  name: 'auto_fix',
  description: 'Level 3: Full autonomous correction and resubmission via EHR',
  minLevel: 3,
  steps: [
    {
      agent: 'triage-router',
      task: 'triage',
      requiredLevel: 1,
      dependsOn: [],
      validationGate: true,
      description: 'Classify denial and determine workflow',
    },
    {
      agent: 'denial-analyzer',
      task: 'analyze',
      requiredLevel: 2,
      dependsOn: ['triage'],
      validationGate: true,
      description: 'Deep analysis with root cause identification',
    },
    {
      agent: 'correction-engine',
      task: 'correct',
      requiredLevel: 2,
      dependsOn: ['analyze'],
      validationGate: true,
      description: 'Generate correction suggestions',
    },
    {
      agent: 'quality-checker',
      task: 'quality_check',
      requiredLevel: 2,
      dependsOn: ['correct'],
      validationGate: true,
      description: 'Validate corrections',
    },
    {
      agent: 'appeal-strategist',
      task: 'appeal_strategy',
      requiredLevel: 2,
      dependsOn: ['analyze'],
      validationGate: false,
      description: 'Appeal strategy',
    },
    // L3-only: EHR auto-submit (aspirational)
    {
      agent: 'human-in-the-loop',
      task: 'auto_submit',
      requiredLevel: 3,
      dependsOn: ['quality_check'],
      validationGate: true,
      description: 'Auto-submit corrected claim via EHR',
    },
  ],
};

// ─── SINGLE-AGENT WORKFLOWS (for individual agent runs) ───────────────────────

export const SINGLE_AGENT_WORKFLOWS: Record<
  string,
  { agent: string; task: string; requiredLevel: AccessLevel }
> = {
  analyze: { agent: 'denial-analyzer', task: 'analyze', requiredLevel: 2 },
  correct: { agent: 'correction-engine', task: 'correct', requiredLevel: 2 },
  quality_check: {
    agent: 'quality-checker',
    task: 'quality_check',
    requiredLevel: 2,
  },
  appeal_strategy: {
    agent: 'appeal-strategist',
    task: 'appeal_strategy',
    requiredLevel: 2,
  },
  triage: { agent: 'triage-router', task: 'triage', requiredLevel: 1 },
  evidence_retrieval: {
    agent: 'evidence-retrieval',
    task: 'evidence_retrieval',
    requiredLevel: 2,
  },
  eligibility_check: {
    agent: 'eligibility-cob',
    task: 'eligibility_check',
    requiredLevel: 2,
  },
  prior_auth: {
    agent: 'prior-authorization',
    task: 'prior_auth',
    requiredLevel: 2,
  },
  medical_necessity: {
    agent: 'medical-necessity',
    task: 'medical_necessity',
    requiredLevel: 2,
  },
  timely_filing_check: {
    agent: 'timely-filing-watchdog',
    task: 'timely_filing_check',
    requiredLevel: 2,
  },
  underpayment_check: {
    agent: 'underpayment-detector',
    task: 'underpayment_check',
    requiredLevel: 2,
  },
  root_cause_prevention: {
    agent: 'root-cause-prevention',
    task: 'root_cause_prevention',
    requiredLevel: 2,
  },
  payer_behavior_learn: {
    agent: 'payer-behavior-learner',
    task: 'payer_behavior_learn',
    requiredLevel: 2,
  },
  compliance_check: {
    agent: 'compliance-audit',
    task: 'compliance_check',
    requiredLevel: 2,
  },
  human_approval: {
    agent: 'human-in-the-loop',
    task: 'human_approval',
    requiredLevel: 2,
  },
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
