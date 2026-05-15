import { BaseAgent, AgentTaskResult } from './base-agent';
import { payerRulesTool, resubmissionIntelligenceTool, denialDataTool } from './tool-registry';

export class TriageRouterAgent extends BaseAgent {
  constructor() {
    super('triage-router', 'Routes denials to the correct specialist agents based on denial type and context', [
      'denial_classification', 'priority_assignment', 'agent_routing', 'workflow_orchestration'
    ]);
    this.registerTool(payerRulesTool);
    this.registerTool(resubmissionIntelligenceTool);
    this.registerTool(denialDataTool);
  }

  async execute(taskType: string, input: Record<string, unknown>, taskId?: string): Promise<AgentTaskResult> {
    if (taskId) await this.updateTaskStatus(taskId, 'running');

    try {
      const denialId = input.denialId as string;

      // Get denial data
      const denial = await this.useTool('denial_data', { action: 'get', denialId }) as Record<string, unknown> | null;
      if (!denial) {
        return { success: false, output: { error: 'Denial not found' }, confidence: 0, toolsUsed: ['denial_data'] };
      }

      // Classify the denial
      const classification = this.classifyDenial(denial);

      // Get payer rules
      const payerInfo = await this.useTool('payer_rules', { payerName: denial.payerName as string }) as Record<string, unknown>;

      // Get intelligence prediction
      const prediction = await this.useTool('resubmission_intelligence', {
        payerName: denial.payerName as string,
        carcCode: denial.carcCode as string,
        deniedAmount: denial.deniedAmount as number,
      }) as Record<string, unknown>;

      // Determine priority
      const priority = this.calculatePriority(denial, classification, payerInfo);

      // Route to appropriate agents
      const recommendedActions = this.routeToAgents(classification, denial, prediction);

      // Remember this classification pattern
      await this.remember(
        `classification:${denial.carcCode}`,
        { category: classification.category, route: recommendedActions[0]?.agent },
        'pattern',
        0.8
      );

      const result = {
        classification,
        priority,
        payerInfo: { filingDeadlineDays: payerInfo.filingDeadlineDays, appealDeadlineDays: payerInfo.appealDeadlineDays },
        prediction: { successRate: prediction.predictedSuccessRate, recommendation: prediction.recommendation },
        recommendedActions,
      };

      if (taskId) await this.updateTaskStatus(taskId, 'completed', result, ['denial_data', 'payer_rules', 'resubmission_intelligence']);

      return {
        success: true,
        output: result,
        confidence: 0.9,
        toolsUsed: ['denial_data', 'payer_rules', 'resubmission_intelligence'],
        nextActions: recommendedActions,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      if (taskId) await this.updateTaskStatus(taskId, 'failed');
      return { success: false, output: { error: errorMsg }, confidence: 0, toolsUsed: [], error: errorMsg };
    }
  }

  private classifyDenial(denial: Record<string, unknown>): { category: string; subcategory: string; correctable: boolean; appealRecommended: boolean } {
    const carcCode = denial.carcCode as string;
    const classificationMap: Record<string, { category: string; subcategory: string; correctable: boolean; appealRecommended: boolean }> = {
      'CO-4': { category: 'coding_error', subcategory: 'modifier_issue', correctable: true, appealRecommended: false },
      'CO-11': { category: 'coding_error', subcategory: 'diagnosis_support', correctable: true, appealRecommended: true },
      'CO-15': { category: 'missing_information', subcategory: 'documentation', correctable: true, appealRecommended: false },
      'CO-16': { category: 'missing_information', subcategory: 'claim_info', correctable: true, appealRecommended: false },
      'CO-18': { category: 'duplicate', subcategory: 'duplicate_claim', correctable: true, appealRecommended: false },
      'CO-22': { category: 'bundling', subcategory: 'cci_edit', correctable: true, appealRecommended: true },
      'CO-27': { category: 'medical_necessity', subcategory: 'coverage_criteria', correctable: true, appealRecommended: true },
      'CO-29': { category: 'timely_filing', subcategory: 'filing_deadline', correctable: false, appealRecommended: false },
      'CO-50': { category: 'authorization', subcategory: 'prior_auth', correctable: true, appealRecommended: true },
      'CO-197': { category: 'authorization', subcategory: 'no_auth', correctable: true, appealRecommended: true },
      'CO-109': { category: 'eligibility', subcategory: 'no_coverage', correctable: false, appealRecommended: false },
      'PR-1': { category: 'eligibility', subcategory: 'patient_responsibility', correctable: false, appealRecommended: false },
      'OA-23': { category: 'eligibility', subcategory: 'cob_issue', correctable: true, appealRecommended: true },
    };

    return classificationMap[carcCode] || { category: (denial.denialCategory as string) || 'other', subcategory: 'unclassified', correctable: true, appealRecommended: true };
  }

  private calculatePriority(denial: Record<string, unknown>, classification: { category: string; correctable: boolean }, payerInfo: Record<string, unknown>): string {
    let score = 0;
    const deniedAmount = (denial.deniedAmount as number) || 0;

    // Dollar amount factor
    if (deniedAmount > 5000) score += 3;
    else if (deniedAmount > 1000) score += 2;
    else if (deniedAmount > 500) score += 1;

    // Timely filing risk
    if (denial.isTimelyFilingRisk) score += 3;

    // Correctability
    if (classification.correctable) score += 1;

    // High-value medical necessity
    if (classification.category === 'medical_necessity' && deniedAmount > 1000) score += 2;

    if (score >= 6) return 'critical';
    if (score >= 4) return 'high';
    if (score >= 2) return 'normal';
    return 'low';
  }

  private routeToAgents(
    classification: { category: string },
    denial: Record<string, unknown>,
    _prediction: Record<string, unknown>
  ): Array<{ agent: string; task: string; input: Record<string, unknown> }> {
    const actions: Array<{ agent: string; task: string; input: Record<string, unknown> }> = [];
    const baseInput = { denialId: denial.id as string };

    switch (classification.category) {
      case 'coding_error':
        actions.push({ agent: 'denial-analyzer', task: 'analyze', input: baseInput });
        actions.push({ agent: 'correction-engine', task: 'correct', input: baseInput });
        break;
      case 'missing_information':
        actions.push({ agent: 'evidence-retrieval', task: 'evidence_retrieval', input: baseInput });
        actions.push({ agent: 'correction-engine', task: 'correct', input: baseInput });
        break;
      case 'eligibility':
        actions.push({ agent: 'eligibility-cob', task: 'eligibility_check', input: baseInput });
        break;
      case 'authorization':
        actions.push({ agent: 'prior-authorization', task: 'prior_auth', input: baseInput });
        break;
      case 'medical_necessity':
        actions.push({ agent: 'medical-necessity', task: 'medical_necessity', input: baseInput });
        actions.push({ agent: 'appeal-strategist', task: 'appeal_strategy', input: baseInput });
        break;
      case 'timely_filing':
        actions.push({ agent: 'timely-filing-watchdog', task: 'timely_filing_check', input: baseInput });
        break;
      case 'bundling':
        actions.push({ agent: 'denial-analyzer', task: 'analyze', input: baseInput });
        actions.push({ agent: 'correction-engine', task: 'correct', input: baseInput });
        break;
      case 'duplicate':
        actions.push({ agent: 'evidence-retrieval', task: 'evidence_retrieval', input: baseInput });
        break;
      default:
        actions.push({ agent: 'denial-analyzer', task: 'analyze', input: baseInput });
    }

    // Always check for underpayment on high-value claims
    if ((denial.deniedAmount as number) > 500) {
      actions.push({ agent: 'underpayment-detector', task: 'underpayment_check', input: baseInput });
    }

    return actions;
  }
}

export const triageRouter = new TriageRouterAgent();
