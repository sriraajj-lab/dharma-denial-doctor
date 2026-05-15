import { BaseAgent, AgentTaskResult } from './base-agent';
import { eligibilityTool, denialDataTool, payerRulesTool } from './tool-registry';

export class EligibilityCOBAgent extends BaseAgent {
  constructor() {
    super('eligibility-cob', 'Resolves eligibility and coordination of benefits issues for denied claims', [
      'eligibility_verification', 'cob_analysis', 'coverage_verification', 'patient_responsibility'
    ]);
    this.registerTool(eligibilityTool);
    this.registerTool(denialDataTool);
    this.registerTool(payerRulesTool);
  }

  async execute(taskType: string, input: Record<string, unknown>, taskId?: string): Promise<AgentTaskResult> {
    if (taskId) await this.updateTaskStatus(taskId, 'running');

    try {
      const denialId = input.denialId as string;
      const denial = await this.useTool('denial_data', { action: 'get', denialId }) as Record<string, unknown> | null;
      if (!denial) {
        return { success: false, output: { error: 'Denial not found' }, confidence: 0, toolsUsed: ['denial_data'] };
      }

      // Use eligibility tool to get resolution strategies
      const eligibilityInfo = await this.useTool('eligibility_resolver', {
        denialId,
        payerName: denial.payerName as string,
        patientMemberId: denial.patientMemberId as string | undefined,
        carcCode: denial.carcCode as string,
      }) as Record<string, unknown>;

      // Determine resolution path
      const resolution = this.determineResolution(denial, eligibilityInfo);

      // Check for COB issues specifically
      const cobAnalysis = this.analyzeCOB(denial);

      // Remember this eligibility pattern
      await this.remember(
        `eligibility:${denial.carcCode}:${denial.payerName}`,
        { resolution, cobAnalysis },
        'pattern',
        0.8
      );

      const result = {
        eligibilityStrategies: eligibilityInfo.strategies,
        resolution,
        cobAnalysis,
        recommendedAction: resolution.action,
        nextSteps: resolution.steps,
      };

      if (taskId) await this.updateTaskStatus(taskId, 'completed', result, ['denial_data', 'eligibility_resolver', 'payer_rules']);

      const nextActions: Array<{ agent: string; task: string; input: Record<string, unknown> }> = [];
      if (resolution.action === 'resubmit_correct_payer') {
        nextActions.push({
          agent: 'correction-engine',
          task: 'correct',
          input: { denialId, correctionType: 'payer_change', ...resolution },
        });
      } else if (resolution.action === 'appeal') {
        nextActions.push({
          agent: 'appeal-strategist',
          task: 'appeal_strategy',
          input: { denialId, appealType: 'first_level', reason: resolution.reason },
        });
      }

      return {
        success: true,
        output: result,
        confidence: 0.85,
        toolsUsed: ['denial_data', 'eligibility_resolver', 'payer_rules'],
        nextActions,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      if (taskId) await this.updateTaskStatus(taskId, 'failed');
      return { success: false, output: { error: errorMsg }, confidence: 0, toolsUsed: [], error: errorMsg };
    }
  }

  private determineResolution(
    denial: Record<string, unknown>,
    _eligibilityInfo: Record<string, unknown>
  ): { action: string; reason: string; steps: string[]; estimatedSuccessRate: number } {
    const carcCode = denial.carcCode as string;

    if (carcCode === 'CO-109') {
      return {
        action: 'verify_coverage',
        reason: 'Patient coverage was not active on date of service',
        steps: [
          'Verify patient eligibility with payer for the date of service',
          'Check if coverage was retroactively activated',
          'If coverage confirmed, resubmit with verification documentation',
          'If no coverage, bill patient or secondary insurance',
        ],
        estimatedSuccessRate: 45,
      };
    }

    if (carcCode === 'PR-1' || carcCode === 'PR-2') {
      return {
        action: 'patient_responsibility',
        reason: 'Amount is patient responsibility (deductible/coinsurance)',
        steps: [
          'Verify patient deductible and coinsurance status',
          'Check if secondary insurance covers the balance',
          'Bill patient for their responsibility portion',
          'Document all collection attempts',
        ],
        estimatedSuccessRate: 30,
      };
    }

    if (carcCode === 'OA-23') {
      return {
        action: 'resubmit_correct_payer',
        reason: 'Coordination of benefits issue - claim may need to go to different payer',
        steps: [
          'Identify primary and secondary insurance',
          'Verify COB information with patient',
          'Resubmit to correct primary payer',
          'If primary pays partial, submit balance to secondary',
        ],
        estimatedSuccessRate: 65,
      };
    }

    return {
      action: 'appeal',
      reason: 'Eligibility issue requires further review',
      steps: [
        'Gather eligibility verification',
        'Contact payer for clarification',
        'Prepare appeal with documentation',
      ],
      estimatedSuccessRate: 40,
    };
  }

  private analyzeCOB(denial: Record<string, unknown>): { hasCOBIssue: boolean; primaryPayer?: string; secondaryPayer?: string; resolutionStrategy?: string } {
    if (denial.carcCode === 'OA-23' || denial.adjustmentGroupCode === 'OA') {
      return {
        hasCOBIssue: true,
        resolutionStrategy: 'Verify primary/secondary payer order and resubmit to correct payer',
      };
    }
    return { hasCOBIssue: false };
  }
}

export const eligibilityCOB = new EligibilityCOBAgent();
