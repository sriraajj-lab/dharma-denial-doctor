import { BaseAgent, AgentTaskResult } from './base-agent';
import { codingIntelligenceTool, denialDataTool } from './tool-registry';

export class MedicalNecessityAgent extends BaseAgent {
  constructor() {
    super('medical-necessity', 'Evaluates medical necessity denials and develops clinical appeal strategies with evidence-based arguments', [
      'medical_necessity_evaluation', 'clinical_appeal_strategy', 'lcd_ncd_analysis', 'diagnosis_support'
    ]);
    this.registerTool(codingIntelligenceTool);
    this.registerTool(denialDataTool);
  }

  async execute(taskType: string, input: Record<string, unknown>, taskId?: string): Promise<AgentTaskResult> {
    if (taskId) await this.updateTaskStatus(taskId, 'running');

    try {
      const denialId = input.denialId as string;
      const denial = await this.useTool('denial_data', { action: 'get', denialId }) as Record<string, unknown> | null;
      if (!denial) {
        return { success: false, output: { error: 'Denial not found' }, confidence: 0, toolsUsed: ['denial_data'] };
      }

      // Get coding intelligence for coverage/LCD analysis
      const codingInfo = await this.useTool('coding_intelligence', {
        denialId,
        cptCode: denial.cptCode as string,
        modifier: denial.modifier as string | undefined,
        diagnosisCode: denial.diagnosisCode as string,
        carcCode: denial.carcCode as string,
      }) as Record<string, unknown>;

      // Evaluate medical necessity
      const evaluation = this.evaluateMedicalNecessity(denial, codingInfo);

      // Build clinical argument
      const clinicalArgument = this.buildClinicalArgument(denial, codingInfo, evaluation);

      // Remember payer-specific medical necessity patterns
      await this.remember(
        `mednecessity:${denial.payerName}:${denial.cptCode}`,
        { evaluation, successRate: evaluation.overallSuccessRate },
        'pattern',
        0.8
      );

      const result = {
        evaluation,
        clinicalArgument,
        coverageAnalysis: codingInfo.coverage,
        correctionsAvailable: codingInfo.corrections,
        recommendedAction: evaluation.recommendedAction,
        estimatedSuccessRate: evaluation.overallSuccessRate,
      };

      if (taskId) await this.updateTaskStatus(taskId, 'completed', result, ['denial_data', 'coding_intelligence']);

      return {
        success: true,
        output: result,
        confidence: 0.85,
        toolsUsed: ['denial_data', 'coding_intelligence'],
        nextActions: [{
          agent: evaluation.recommendedAction === 'appeal' ? 'appeal-strategist' : 'correction-engine',
          task: evaluation.recommendedAction === 'appeal' ? 'appeal_strategy' : 'correct',
          input: { denialId, medicalNecessityEvaluation: result },
        }],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      if (taskId) await this.updateTaskStatus(taskId, 'failed');
      return { success: false, output: { error: errorMsg }, confidence: 0, toolsUsed: [], error: errorMsg };
    }
  }

  private evaluateMedicalNecessity(
    denial: Record<string, unknown>,
    codingInfo: Record<string, unknown>
  ): {
    isCovered: boolean;
    diagnosisSupported: boolean;
    missingDocumentation: string[];
    alternativeDiagnoses: string[];
    recommendedAction: 'correct_and_resubmit' | 'appeal' | 'peer_to_peer' | 'write_off';
    overallSuccessRate: number;
  } {
    const coverage = codingInfo.coverage as Record<string, unknown> | null;
    const isCovered = (coverage?.isCovered as boolean) ?? false;
    const diagnosisSupported = isCovered;

    const missingDocumentation: string[] = [];
    if (!isCovered) {
      missingDocumentation.push('Clinical records supporting medical necessity');
      missingDocumentation.push('Physician letter of medical necessity');
      missingDocumentation.push('Conservative treatment failure documentation');
    }

    const alternativeDiagnoses = (coverage?.suggestedDiagnoses as string[]) || [];

    let recommendedAction: 'correct_and_resubmit' | 'appeal' | 'peer_to_peer' | 'write_off';
    let overallSuccessRate: number;
    const deniedAmount = (denial.deniedAmount as number) || 0;

    if (alternativeDiagnoses.length > 0 && !isCovered) {
      // Can correct diagnosis and resubmit
      recommendedAction = 'correct_and_resubmit';
      overallSuccessRate = 65;
    } else if (deniedAmount > 2000) {
      // High-value: appeal with clinical documentation
      recommendedAction = 'appeal';
      overallSuccessRate = 45;
    } else if (deniedAmount > 500) {
      // Medium-value: try peer-to-peer first
      recommendedAction = 'peer_to_peer';
      overallSuccessRate = 55;
    } else {
      recommendedAction = 'appeal';
      overallSuccessRate = 40;
    }

    return { isCovered, diagnosisSupported, missingDocumentation, alternativeDiagnoses, recommendedAction, overallSuccessRate };
  }

  private buildClinicalArgument(
    denial: Record<string, unknown>,
    codingInfo: Record<string, unknown>,
    evaluation: { isCovered: boolean }
  ): {
    keyPoints: string[];
    supportingEvidence: string[];
    counterArguments: string[];
  } {
    const keyPoints: string[] = [];
    const supportingEvidence: string[] = [];
    const counterArguments: string[] = [];

    // Key argument points
    keyPoints.push(
      `The service billed under CPT ${denial.cptCode} with diagnosis ${denial.diagnosisCode} was medically necessary for the patient's condition.`
    );

    const coverage = codingInfo.coverage as Record<string, unknown> | null;
    if (coverage?.lcdReference) {
      keyPoints.push(
        `The clinical documentation meets the criteria set forth in LCD ${coverage.lcdReference}.`
      );
    }

    // Supporting evidence types
    supportingEvidence.push('Patient medical records documenting the condition and treatment');
    supportingEvidence.push('Physician documentation of clinical decision-making');

    const cptCode = denial.cptCode as string;
    if (cptCode === '27447' || cptCode === '63030') {
      supportingEvidence.push('Documentation of failed conservative treatment over 6+ months');
      supportingEvidence.push('Imaging studies showing progression of condition');
    }

    // Anticipate counter-arguments
    if (!evaluation.isCovered) {
      counterArguments.push('Payer may argue diagnosis does not meet LCD criteria');
      counterArguments.push('Payer may request additional documentation of conservative treatment');
    }

    return { keyPoints, supportingEvidence, counterArguments };
  }
}

export const medicalNecessity = new MedicalNecessityAgent();
