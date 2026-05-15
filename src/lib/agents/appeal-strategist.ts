import { BaseAgent, AgentTaskResult } from './base-agent';
import { appealsTool, resubmissionIntelligenceTool, denialDataTool } from './tool-registry';
import { db } from '../db';

export class AppealStrategistAgent extends BaseAgent {
  constructor() {
    super('appeal-strategist', 'Develops and manages appeal strategies for denied claims, including multi-level appeal planning and letter generation', [
      'appeal_strategy', 'appeal_generation', 'multi_level_planning', 'success_prediction'
    ]);
    this.registerTool(appealsTool);
    this.registerTool(resubmissionIntelligenceTool);
    this.registerTool(denialDataTool);
  }

  async execute(taskType: string, input: Record<string, unknown>, taskId?: string): Promise<AgentTaskResult> {
    if (taskId) await this.updateTaskStatus(taskId, 'running');

    try {
      const denialId = input.denialId as string;
      const denial = await this.useTool('denial_data', { action: 'get', denialId }) as any;
      if (!denial) {
        return { success: false, output: { error: 'Denial not found' }, confidence: 0, toolsUsed: ['denial_data'] };
      }

      // Determine appeal level
      const currentAppeals = await db.appealLetter.findMany({ where: { denialId } });
      const appealLevel = this.determineAppealLevel(currentAppeals);

      // Get intelligence prediction
      const prediction = await this.useTool('resubmission_intelligence', {
        payerName: denial.payerName,
        carcCode: denial.carcCode,
        correctionType: 'appeal_with_documentation',
        cptCode: denial.cptCode,
        deniedAmount: denial.deniedAmount,
      }) as any;

      // Get appeal strategy from tool
      const appealInfo = await this.useTool('appeal_generator', {
        denialId,
        appealType: appealLevel,
        payerName: denial.payerName,
        denialReason: denial.denialCategory,
      }) as any;

      // Build comprehensive strategy
      const strategy = this.buildAppealStrategy(denial, appealLevel, prediction, appealInfo);

      // Remember appeal patterns
      await this.remember(
        `appeal:${denial.payerName}:${denial.carcCode}:${appealLevel}`,
        { strategy, predictedSuccess: prediction.predictedSuccessRate },
        'pattern',
        0.8
      );

      const result = {
        appealLevel,
        strategy,
        prediction: { successRate: prediction.predictedSuccessRate, recommendation: prediction.recommendation, basedOn: prediction.basedOn },
        appealInfo,
        requiresHumanApproval: denial.deniedAmount > 10000,
      };

      if (taskId) await this.updateTaskStatus(taskId, 'completed', result, ['denial_data', 'resubmission_intelligence', 'appeal_generator']);

      return {
        success: true,
        output: result,
        confidence: 0.8,
        toolsUsed: ['denial_data', 'resubmission_intelligence', 'appeal_generator'],
        requiresHumanApproval: result.requiresHumanApproval,
        humanApprovalReason: denial.deniedAmount > 10000 ? 'High-value appeal requires manager approval' : undefined,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      if (taskId) await this.updateTaskStatus(taskId, 'failed');
      return { success: false, output: { error: errorMsg }, confidence: 0, toolsUsed: [], error: errorMsg };
    }
  }

  private determineAppealLevel(existingAppeals: any[]): 'first_level' | 'second_level' | 'external_review' {
    if (existingAppeals.length === 0) return 'first_level';
    if (existingAppeals.length === 1) return 'second_level';
    return 'external_review';
  }

  private buildAppealStrategy(denial: any, level: string, prediction: any, appealInfo: any): {
    approach: string;
    keyArguments: string[];
    requiredDocuments: string[];
    timeline: string;
    fallbackPlan: string;
  } {
    const category = denial.denialCategory;

    let approach: string;
    let keyArguments: string[];
    let requiredDocuments: string[];
    let timeline: string;
    let fallbackPlan: string;

    if (category === 'medical_necessity') {
      approach = 'Clinical appeal with comprehensive medical documentation and peer-reviewed evidence';
      keyArguments = [
        'The service meets established coverage criteria per LCD/NCD guidelines',
        'Clinical documentation clearly supports the medical necessity of the service',
        'Conservative treatment was attempted and failed prior to this service',
        'Peer-reviewed literature supports the clinical appropriateness',
      ];
      requiredDocuments = [
        'Complete medical records',
        'Physician letter of medical necessity',
        'Conservative treatment documentation',
        'Imaging/lab results',
        'Peer-reviewed literature references',
      ];
      timeline = '30-45 days for first-level review';
      fallbackPlan = 'Request peer-to-peer review; if denied, escalate to second-level with additional specialist documentation';
    } else if (category === 'authorization') {
      approach = 'Appeal based on retroactive authorization eligibility and emergent circumstances';
      keyArguments = [
        'The service met criteria for prior authorization',
        'Circumstances prevented obtaining prior authorization (emergent/urgent)',
        'The payer\'s authorization requirement was not properly communicated',
        'A peer-to-peer review will confirm clinical appropriateness',
      ];
      requiredDocuments = [
        'Emergency documentation (if applicable)',
        'Clinical records supporting urgency',
        'Proof of authorization attempt',
        'Retro-auth application',
      ];
      timeline = '20-30 days for retro-auth review';
      fallbackPlan = 'File second-level appeal with medical director review';
    } else if (category === 'timely_filing') {
      approach = 'Appeal with proof of timely original submission';
      keyArguments = [
        'Original claim was submitted within the filing deadline',
        'Clearinghouse confirmation proves timely submission',
        'Any delay was caused by circumstances beyond our control',
      ];
      requiredDocuments = [
        'Clearinghouse submission confirmation',
        'Original claim acceptance report',
        'Payer acknowledgment of receipt',
        'Timeline of all submissions and communications',
      ];
      timeline = '30-45 days for appeal review';
      fallbackPlan = 'Escalate to insurance commissioner if payer does not honor proof of timely filing';
    } else {
      approach = 'Corrective appeal with documentation of corrected claim elements';
      keyArguments = [
        'The identified issues have been corrected in the resubmission',
        'All required information is now included',
        'The service is covered under the patient\'s plan',
      ];
      requiredDocuments = ['Corrected claim', 'Supporting documentation for corrections', 'Original denial reference'];
      timeline = '14-21 days for corrected claim review';
      fallbackPlan = 'File formal appeal if corrected claim is denied again';
    }

    // Adjust for appeal level
    if (level === 'second_level') {
      approach = 'ESCALATED: ' + approach;
      keyArguments.push('This is a second-level appeal requesting medical director review');
      timeline = '45-60 days for second-level review';
    } else if (level === 'external_review') {
      approach = 'EXTERNAL REVIEW: ' + approach;
      keyArguments.push('Requesting independent external review per applicable regulations');
      timeline = '60-90 days for external review';
    }

    return { approach, keyArguments, requiredDocuments, timeline, fallbackPlan };
  }
}

export const appealStrategist = new AppealStrategistAgent();
