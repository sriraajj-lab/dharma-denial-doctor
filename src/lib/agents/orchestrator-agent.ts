/**
 * Agent 6: Orchestrator Agent (Supervisor)
 *
 * SCOPE: Routes denials to correct agents, validates outputs, catches contradictions,
 *         enforces level gating, and manages the full denial workflow
 * FORBIDDEN: Cannot generate clinical/coding content. Only validates structure and consistency.
 *
 * Palantir-inspired Architecture:
 * - ONTOLOGY AS SUBSTRATE: All data flows through the denial data model (our "ontology")
 * - INSULATED ORCHESTRATION: Each agent is isolated — can't access other agents' tools/memory
 * - GRANULAR POLICY ENFORCEMENT: Per-agent scope boundaries enforced here
 * - PROVENANCE-BASED: Every agent call is logged, every output is schema-validated
 * - CONDITIONAL EFFECTS: Level gating determines which agents run
 *
 * Anti-Hallucination:
 * - Orchestrator NEVER generates clinical/coding/appeal content
 * - Only validates STRUCTURE and CONSISTENCY of other agents' outputs
 * - Catches contradictions (e.g., coding says "correctable" but eligibility says "not covered")
 * - Every routing decision is rule-based, not AI-generated
 */

import { z } from 'zod';
import { BaseAgentV2, AgentTaskResult } from './base-agent-v2';
import { denialDataTool, payerRulesTool, resubmissionIntelligenceTool } from './tool-registry';
import { AccessLevel } from '../types';
import { db } from '../db';

// ─── OUTPUT SCHEMA ────────────────────────────────────────────────────────────

export const OrchestratorOutputSchema = z.object({
  denialClassification: z.object({
    category: z.string(),
    subcategory: z.string(),
    correctable: z.boolean(),
    appealRecommended: z.boolean(),
  }),
  routingPlan: z.array(z.object({
    agent: z.string(),
    task: z.string(),
    reason: z.string(),
    requiredLevel: z.number(),
    estimatedTime: z.string(),
  })),
  crossValidation: z.object({
    contradictions: z.array(z.object({
      agent1: z.string(),
      agent2: z.string(),
      field: z.string(),
      agent1Value: z.string(),
      agent2Value: z.string(),
      resolution: z.string(),
    })),
    consistencyScore: z.number().min(0).max(1),
  }),
  levelGateResult: z.object({
    userLevel: z.number(),
    availableAgents: z.array(z.string()),
    blockedAgents: z.array(z.object({
      agent: z.string(),
      reason: z.string(),
      requiredLevel: z.number(),
    })),
  }),
  workflowStatus: z.enum(['ready', 'blocked', 'partial', 'complete']),
  requiresHumanApproval: z.boolean(),
  humanApprovalReason: z.string().nullable(),
  confidenceScore: z.number().min(0).max(1),
});

export type OrchestratorOutput = z.infer<typeof OrchestratorOutputSchema>;

// ─── AGENT LEVEL PERMISSIONS ──────────────────────────────────────────────────

const AGENT_LEVEL_MAP: Record<string, number> = {
  'eligibility-agent': 2,
  'demographics-agent': 1,
  'coding-agent': 2,
  'scrubber-agent': 2,
  'appeal-agent': 2,
  'orchestrator-agent': 1,
};

// ─── DENIAL CODE → AGENT ROUTING (RULE-BASED, NO AI) ─────────────────────────

interface RoutingRule {
  carcCodes: string[];
  category: string;
  subcategory: string;
  correctable: boolean;
  appealRecommended: boolean;
  agents: Array<{ agent: string; task: string; reason: string }>;
}

const ROUTING_RULES: RoutingRule[] = [
  {
    carcCodes: ['CO-27'],
    category: 'medical_necessity',
    subcategory: 'coverage_criteria',
    correctable: true,
    appealRecommended: true,
    agents: [
      { agent: 'demographics-agent', task: 'demographics_validation', reason: 'Validate demographics before deeper analysis' },
      { agent: 'eligibility-agent', task: 'eligibility_check', reason: 'CO-27 may involve eligibility/coverage issues' },
      { agent: 'coding-agent', task: 'coding_validation', reason: 'Verify CPT/ICD-10 meets coverage criteria' },
      { agent: 'appeal-agent', task: 'generate_appeal_strategy', reason: 'Medical necessity denials often require appeal' },
    ],
  },
  {
    carcCodes: ['CO-4', 'CO-11'],
    category: 'coding_error',
    subcategory: 'modifier_issue',
    correctable: true,
    appealRecommended: false,
    agents: [
      { agent: 'demographics-agent', task: 'demographics_validation', reason: 'Check demographics before coding analysis' },
      { agent: 'coding-agent', task: 'coding_validation', reason: 'Coding error requires coding agent analysis' },
      { agent: 'scrubber-agent', task: 'pre_submission_check', reason: 'Validate correction before resubmission' },
    ],
  },
  {
    carcCodes: ['CO-22'],
    category: 'bundling',
    subcategory: 'cci_edit',
    correctable: true,
    appealRecommended: true,
    agents: [
      { agent: 'demographics-agent', task: 'demographics_validation', reason: 'Validate demographics' },
      { agent: 'coding-agent', task: 'coding_validation', reason: 'Bundling issue requires NCCI edit analysis' },
      { agent: 'scrubber-agent', task: 'pre_submission_check', reason: 'Validate unbundling correction' },
      { agent: 'appeal-agent', task: 'generate_appeal_strategy', reason: 'Bundling disputes may require appeal' },
    ],
  },
  {
    carcCodes: ['CO-109', 'CO-27'],
    category: 'eligibility',
    subcategory: 'no_coverage',
    correctable: false,
    appealRecommended: false,
    agents: [
      { agent: 'demographics-agent', task: 'demographics_validation', reason: 'Verify demographics are correct' },
      { agent: 'eligibility-agent', task: 'eligibility_check', reason: 'Eligibility denial requires eligibility verification' },
    ],
  },
  {
    carcCodes: ['CO-50', 'CO-197'],
    category: 'authorization',
    subcategory: 'prior_auth',
    correctable: true,
    appealRecommended: true,
    agents: [
      { agent: 'demographics-agent', task: 'demographics_validation', reason: 'Check demographics' },
      { agent: 'eligibility-agent', task: 'eligibility_check', reason: 'Authorization denial may involve eligibility' },
      { agent: 'appeal-agent', task: 'generate_appeal_strategy', reason: 'Auth denials require retro-auth appeal' },
    ],
  },
  {
    carcCodes: ['CO-29'],
    category: 'timely_filing',
    subcategory: 'filing_deadline',
    correctable: false,
    appealRecommended: false,
    agents: [
      { agent: 'scrubber-agent', task: 'timely_filing_check', reason: 'Timely filing requires deadline analysis' },
    ],
  },
  {
    carcCodes: ['CO-18'],
    category: 'duplicate',
    subcategory: 'duplicate_claim',
    correctable: true,
    appealRecommended: false,
    agents: [
      { agent: 'scrubber-agent', task: 'duplicate_check', reason: 'Duplicate requires scrubber analysis' },
    ],
  },
  {
    carcCodes: ['CO-16', 'CO-15'],
    category: 'missing_information',
    subcategory: 'documentation',
    correctable: true,
    appealRecommended: false,
    agents: [
      { agent: 'demographics-agent', task: 'demographics_validation', reason: 'Check for missing demographic fields' },
      { agent: 'scrubber-agent', task: 'pre_submission_check', reason: 'Validate completeness before resubmission' },
    ],
  },
  {
    carcCodes: ['PR-1', 'PR-2'],
    category: 'eligibility',
    subcategory: 'patient_responsibility',
    correctable: false,
    appealRecommended: false,
    agents: [
      { agent: 'eligibility-agent', task: 'eligibility_check', reason: 'Patient responsibility needs eligibility verification' },
    ],
  },
  {
    carcCodes: ['OA-23'],
    category: 'eligibility',
    subcategory: 'cob_issue',
    correctable: true,
    appealRecommended: true,
    agents: [
      { agent: 'eligibility-agent', task: 'cob_analysis', reason: 'COB issue requires eligibility agent' },
    ],
  },
  {
    carcCodes: ['CO-97'],
    category: 'payment_adjustment',
    subcategory: 'reimbursement_rate',
    correctable: true,
    appealRecommended: true,
    agents: [
      { agent: 'scrubber-agent', task: 'underpayment_check', reason: 'Payment adjustment may indicate underpayment' },
      { agent: 'appeal-agent', task: 'generate_appeal_strategy', reason: 'Reimbursement disputes require appeal' },
    ],
  },
];

// Default routing for unknown codes
const DEFAULT_ROUTING: RoutingRule = {
  carcCodes: [],
  category: 'other',
  subcategory: 'unclassified',
  correctable: true,
  appealRecommended: true,
  agents: [
    { agent: 'demographics-agent', task: 'demographics_validation', reason: 'Always check demographics first' },
    { agent: 'coding-agent', task: 'coding_validation', reason: 'Check coding for any issues' },
    { agent: 'scrubber-agent', task: 'pre_submission_check', reason: 'Run full scrub' },
  ],
};

// ─── AGENT ─────────────────────────────────────────────────────────────────────

export class OrchestratorAgent extends BaseAgentV2 {
  constructor() {
    super(
      'orchestrator-agent',
      'Routes denials to correct agents, validates outputs, catches contradictions, enforces level gating. Never generates clinical/coding content.',
      {
        allowedDenialCodes: [], // All codes — orchestrator handles routing for everything
        allowedOperations: [
          'triage',
          'route',
          'validate_outputs',
          'cross_check',
          'enforce_level_gate',
          'processDenial',
        ],
        forbiddenActions: [
          'generate_clinical_content',
          'suggest_coding_changes',
          'generate_appeal_letters',
          'verify_eligibility',
          'validate_demographics',
        ],
        requiredInputFields: ['denialId'],
      },
      OrchestratorOutputSchema,
    );
    this.registerTool(denialDataTool);
    this.registerTool(payerRulesTool);
    this.registerTool(resubmissionIntelligenceTool);
  }

  async execute(taskType: string, input: Record<string, unknown>, taskId?: string): Promise<AgentTaskResult> {
    return this.executeWithGuardrails(taskType, input, taskId, async () => {
      const denialId = input.denialId as string;
      const userLevel = (input.accessLevel as number) || 1;

      const denial = await this.useTool('denial_data', { action: 'get', denialId }) as Record<string, unknown> | null;
      if (!denial) {
        return { success: false, output: { error: 'Denial not found' }, confidence: 0, toolsUsed: ['denial_data'] };
      }

      const carcCode = denial.carcCode as string;

      // ─── STEP 1: CLASSIFY DENIAL (rule-based) ──────────────────────────
      const routing = this.findRoutingRule(carcCode);

      const classification = {
        category: routing.category,
        subcategory: routing.subcategory,
        correctable: routing.correctable,
        appealRecommended: routing.appealRecommended,
      };

      // ─── STEP 2: BUILD ROUTING PLAN ────────────────────────────────────
      const routingPlan = routing.agents.map(a => ({
        agent: a.agent,
        task: a.task,
        reason: a.reason,
        requiredLevel: AGENT_LEVEL_MAP[a.agent] || 2,
        estimatedTime: this.estimateAgentTime(a.agent),
      }));

      // ─── STEP 3: ENFORCE LEVEL GATES ───────────────────────────────────
      const availableAgents = routingPlan
        .filter(r => r.requiredLevel <= userLevel)
        .map(r => r.agent);

      const blockedAgents = routingPlan
        .filter(r => r.requiredLevel > userLevel)
        .map(r => ({
          agent: r.agent,
          reason: `Requires Level ${r.requiredLevel} access. Current level: ${userLevel}`,
          requiredLevel: r.requiredLevel,
        }));

      // ─── STEP 4: CROSS-VALIDATION (placeholder — filled after agents run) ─
      const crossValidation = {
        contradictions: [] as OrchestratorOutput['crossValidation']['contradictions'],
        consistencyScore: 1.0,
      };

      // ─── STEP 5: DETERMINE WORKFLOW STATUS ─────────────────────────────
      let workflowStatus: OrchestratorOutput['workflowStatus'] = 'ready';
      if (availableAgents.length === 0) workflowStatus = 'blocked';
      else if (blockedAgents.length > 0) workflowStatus = 'partial';
      else if (availableAgents.length === routingPlan.length) workflowStatus = 'complete';

      // ─── STEP 6: GET PAYER INTELLIGENCE ────────────────────────────────
      let prediction: Record<string, unknown> = {};
      try {
        prediction = await this.useTool('resubmission_intelligence', {
          payerName: denial.payerName,
          carcCode,
          cptCode: denial.cptCode,
          deniedAmount: denial.deniedAmount,
        }) as Record<string, unknown>;
      } catch {
        // Non-critical — continue without prediction
      }

      // ─── STEP 7: CALCULATE CONFIDENCE ──────────────────────────────────
      let confidence = 0.7; // Start high for orchestrator (all routing is rule-based)
      if (routing !== DEFAULT_ROUTING) confidence += 0.15; // Known CARC code
      if (prediction?.predictedSuccessRate) confidence += 0.05;
      confidence = Math.min(confidence, 0.95);

      const requiresHumanApproval = workflowStatus === 'blocked' || (classification.appealRecommended && userLevel < 2);

      const result: OrchestratorOutput = {
        denialClassification: classification,
        routingPlan,
        crossValidation,
        levelGateResult: {
          userLevel,
          availableAgents,
          blockedAgents,
        },
        workflowStatus,
        requiresHumanApproval,
        humanApprovalReason: requiresHumanApproval
          ? workflowStatus === 'blocked'
            ? `All analysis agents require Level 2 access. Current level: ${userLevel}. Upgrade to access denial analysis.`
            : 'Appeal recommended but requires Level 2 access'
          : null,
        confidenceScore: confidence,
      };

      // Remember routing pattern
      await this.remember(
        `routing:${carcCode}`,
        { classification, agents: availableAgents, blockedAgents: blockedAgents.length },
        'pattern',
        confidence,
      );

      return {
        success: workflowStatus !== 'blocked',
        output: result as unknown as Record<string, unknown>,
        confidence,
        toolsUsed: ['denial_data', 'resubmission_intelligence'],
        requiresHumanApproval,
        humanApprovalReason: requiresHumanApproval ? result.humanApprovalReason || undefined : undefined,
        nextActions: availableAgents.map(agent => {
          const plan = routingPlan.find(p => p.agent === agent)!;
          return {
            agent,
            task: plan.task,
            input: { denialId },
          };
        }),
      };
    });
  }

  // ─── CROSS-VALIDATION METHOD (called after agents run) ──────────────────

  /**
   * Cross-validate outputs from multiple agents to catch contradictions.
   * Called by the Conductor after all agents have completed.
   */
  crossValidateOutputs(
    agentOutputs: Record<string, Record<string, unknown>>,
  ): OrchestratorOutput['crossValidation'] {
    const contradictions: OrchestratorOutput['crossValidation']['contradictions'] = [];

    // Check: Coding says correctable but Eligibility says not covered
    const codingOutput = agentOutputs['coding-agent'];
    const eligibilityOutput = agentOutputs['eligibility-agent'];

    if (codingOutput && eligibilityOutput) {
      const codingCorrectable = codingOutput.analysisResult === 'coding_error_confirmed' ||
        codingOutput.proposedCorrections?.length > 0;
      const eligibilityCovered = eligibilityOutput.eligibilityStatus === 'verified' ||
        eligibilityOutput.coverageVerified === true;

      if (codingCorrectable && !eligibilityCovered) {
        contradictions.push({
          agent1: 'coding-agent',
          agent2: 'eligibility-agent',
          field: 'correctability',
          agent1Value: 'Correctable via coding change',
          agent2Value: 'Not covered/eligible',
          resolution: 'Resolve eligibility first — coding correction is irrelevant if patient is not covered',
        });
      }
    }

    // Check: Scrubber blocks but Coding says pass
    const scrubberOutput = agentOutputs['scrubber-agent'];
    if (codingOutput && scrubberOutput) {
      const scrubberFails = scrubberOutput.overallResult === 'fail';
      const codingHasCorrections = codingOutput.proposedCorrections?.length > 0;

      if (scrubberFails && codingHasCorrections) {
        contradictions.push({
          agent1: 'coding-agent',
          agent2: 'scrubber-agent',
          field: 'correction_validity',
          agent1Value: 'Corrections proposed',
          agent2Value: 'Scrub validation failed',
          resolution: 'Corrections must pass scrub validation before resubmission',
        });
      }
    }

    const consistencyScore = contradictions.length === 0 ? 1.0 :
      contradictions.length === 1 ? 0.7 :
      contradictions.length >= 2 ? 0.4 : 0.5;

    return { contradictions, consistencyScore };
  }

  // ─── HELPERS ──────────────────────────────────────────────────────────

  private findRoutingRule(carcCode: string): RoutingRule {
    return ROUTING_RULES.find(r => r.carcCodes.includes(carcCode)) || DEFAULT_ROUTING;
  }

  private estimateAgentTime(agent: string): string {
    const timeMap: Record<string, string> = {
      'demographics-agent': '1-2s',
      'eligibility-agent': '3-5s',
      'coding-agent': '5-10s',
      'scrubber-agent': '2-4s',
      'appeal-agent': '5-8s',
    };
    return timeMap[agent] || '3-5s';
  }
}

export const orchestratorAgent = new OrchestratorAgent();
