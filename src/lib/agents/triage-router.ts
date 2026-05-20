import { BaseAgent, AgentTaskResult } from './base-agent';
import { payerRulesTool, resubmissionIntelligenceTool, denialDataTool } from './tool-registry';
import { detectSpecialty, getSpecialtyDefinition, getSpecialtyAgentConfig, type SpecialtyName } from '../specialties';

export class TriageRouterAgent extends BaseAgent {
  constructor() {
    super('triage-router', 'Routes denials to the correct specialist agents based on denial type, specialty, and context', [
      'denial_classification', 'priority_assignment', 'agent_routing', 'specialty_detection', 'workflow_orchestration'
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

      // ─── SPECIALTY DETECTION ───────────────────────────────────────────────
      const cptCode = denial.cptCode as string;
      const diagnosisCode = denial.diagnosisCode as string;
      const detectedSpecialty = detectSpecialty(cptCode, diagnosisCode);
      const specialtyDef = getSpecialtyDefinition(detectedSpecialty);
      const specialtyConfig = getSpecialtyAgentConfig(detectedSpecialty);

      // Update denial with detected specialty
      await this.useTool('denial_data', {
        action: 'update',
        denialId,
        data: { specialty: detectedSpecialty },
      });

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

      // Determine priority (specialty-aware)
      const priority = this.calculatePriority(denial, classification, payerInfo, detectedSpecialty);

      // Route to appropriate agents (specialty-aware)
      const recommendedActions = this.routeToAgents(classification, denial, prediction, detectedSpecialty, specialtyConfig);

      // Remember this classification pattern
      await this.remember(
        `classification:${denial.carcCode}:${detectedSpecialty}`,
        { category: classification.category, specialty: detectedSpecialty, route: recommendedActions[0]?.agent },
        'pattern',
        0.8
      );

      const result = {
        classification,
        specialty: {
          detected: detectedSpecialty,
          displayName: specialtyDef.displayName,
          riskLevel: specialtyDef.denialRiskLevel,
          hasJCodes: specialtyDef.hasJCodes,
          hasTimeBasedCoding: specialtyDef.hasTimeBasedCoding,
          hasGlobalPeriods: specialtyDef.hasGlobalPeriods,
        },
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
      'CO-97': { category: 'payment_adjustment', subcategory: 'reimbursement_rate', correctable: true, appealRecommended: true },
      'CO-197': { category: 'authorization', subcategory: 'no_auth', correctable: true, appealRecommended: true },
      'CO-109': { category: 'eligibility', subcategory: 'no_coverage', correctable: false, appealRecommended: false },
      'PR-1': { category: 'eligibility', subcategory: 'patient_responsibility', correctable: false, appealRecommended: false },
      'OA-23': { category: 'eligibility', subcategory: 'cob_issue', correctable: true, appealRecommended: true },
    };

    return classificationMap[carcCode] || { category: (denial.denialCategory as string) || 'other', subcategory: 'unclassified', correctable: true, appealRecommended: true };
  }

  private calculatePriority(
    denial: Record<string, unknown>,
    classification: { category: string; correctable: boolean },
    payerInfo: Record<string, unknown>,
    specialty: SpecialtyName
  ): string {
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

    // Specialty risk level boost
    const specialtyDef = getSpecialtyDefinition(specialty);
    if (specialtyDef.denialRiskLevel === 'critical') score += 2;
    else if (specialtyDef.denialRiskLevel === 'high') score += 1;

    // Oncology-specific: high-dollar chemo denials always critical
    if (specialty === 'oncology' && deniedAmount > 2000) score += 2;

    // Cardiology: cath lab/PCI denials high priority
    if (specialty === 'cardiology' && classification.category === 'bundling') score += 1;

    if (score >= 6) return 'critical';
    if (score >= 4) return 'high';
    if (score >= 2) return 'normal';
    return 'low';
  }

  private routeToAgents(
    classification: { category: string },
    denial: Record<string, unknown>,
    _prediction: Record<string, unknown>,
    specialty: SpecialtyName,
    specialtyConfig: ReturnType<typeof getSpecialtyAgentConfig>
  ): Array<{ agent: string; task: string; input: Record<string, unknown> }> {
    const actions: Array<{ agent: string; task: string; input: Record<string, unknown> }> = [];
    const baseInput = { denialId: denial.id as string, specialty };

    // ─── Speciality-aware routing ─────────────────────────────────────────────

    // Oncology-specific routing
    if (specialty === 'oncology') {
      switch (classification.category) {
        case 'coding_error':
          actions.push({ agent: 'correction-engine', task: 'specialty_correct', input: { ...baseInput, specialtyModule: 'oncology' } });
          actions.push({ agent: 'quality-checker', task: 'quality_check', input: baseInput });
          break;
        case 'bundling':
          actions.push({ agent: 'correction-engine', task: 'oncology_bundling_correct', input: { ...baseInput, specialtyModule: 'oncology' } });
          actions.push({ agent: 'appeal-strategist', task: 'appeal_strategy', input: { ...baseInput, specialtyContext: 'chemo_infusion_bundling' } });
          break;
        case 'medical_necessity':
          actions.push({ agent: 'medical-necessity', task: 'medical_necessity', input: { ...baseInput, specialtyModule: 'oncology' } });
          actions.push({ agent: 'evidence-retrieval', task: 'evidence_retrieval', input: { ...baseInput, specialtyContext: 'ncd_110_oncology' } });
          actions.push({ agent: 'appeal-strategist', task: 'appeal_strategy', input: { ...baseInput, specialtyContext: 'oncology_medical_necessity' } });
          break;
        case 'authorization':
          actions.push({ agent: 'prior-authorization', task: 'prior_auth', input: { ...baseInput, specialtyContext: 'chemo_auth' } });
          break;
        case 'payment_adjustment':
          actions.push({ agent: 'underpayment-detector', task: 'underpayment_check', input: { ...baseInput, specialtyContext: 'jcode_pricing' } });
          break;
        default:
          actions.push({ agent: 'denial-analyzer', task: 'analyze', input: { ...baseInput, specialtyModule: 'oncology' } });
      }

      // Always check J-code pricing on oncology claims
      if ((denial.deniedAmount as number) > 100) {
        actions.push({ agent: 'underpayment-detector', task: 'underpayment_check', input: { ...baseInput, specialtyContext: 'jcode_asp_pricing' } });
      }
    }
    // Cardiology-specific routing
    else if (specialty === 'cardiology') {
      switch (classification.category) {
        case 'coding_error':
          actions.push({ agent: 'correction-engine', task: 'specialty_correct', input: { ...baseInput, specialtyModule: 'cardiology' } });
          break;
        case 'bundling':
          actions.push({ agent: 'correction-engine', task: 'cardiology_bundling_correct', input: { ...baseInput, specialtyModule: 'cardiology' } });
          actions.push({ agent: 'appeal-strategist', task: 'appeal_strategy', input: { ...baseInput, specialtyContext: 'cath_lab_bundling' } });
          break;
        case 'medical_necessity':
          actions.push({ agent: 'medical-necessity', task: 'medical_necessity', input: { ...baseInput, specialtyModule: 'cardiology' } });
          actions.push({ agent: 'evidence-retrieval', task: 'evidence_retrieval', input: { ...baseInput, specialtyContext: 'cardiac_imaging_lcd' } });
          break;
        case 'authorization':
          actions.push({ agent: 'prior-authorization', task: 'prior_auth', input: { ...baseInput, specialtyContext: 'cardiology_auth' } });
          break;
        default:
          actions.push({ agent: 'denial-analyzer', task: 'analyze', input: { ...baseInput, specialtyModule: 'cardiology' } });
      }
    }
    // ─── Default (non-specialty-specific) routing ──────────────────────────────
    else {
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
        case 'payment_adjustment':
          actions.push({ agent: 'underpayment-detector', task: 'underpayment_check', input: baseInput });
          break;
        default:
          actions.push({ agent: 'denial-analyzer', task: 'analyze', input: baseInput });
      }
    }

    // Always check for underpayment on high-value claims
    if ((denial.deniedAmount as number) > 500 && !actions.some(a => a.agent === 'underpayment-detector')) {
      actions.push({ agent: 'underpayment-detector', task: 'underpayment_check', input: baseInput });
    }

    // Check if human approval is required based on specialty config
    const needsHumanApproval = specialtyConfig.requiresHumanApproval.some(rule => {
      if (rule === 'high_value' && (denial.deniedAmount as number) > 5000) return true;
      if (rule === 'off_label_drug' && specialty === 'oncology' && classification.category === 'medical_necessity') return true;
      if (rule === 'jw_modifier' && specialty === 'oncology' && classification.category === 'coding_error') return true;
      if (rule === 'compliance_risk') return false; // Only if flagged
      return false;
    });

    if (needsHumanApproval) {
      actions.push({ agent: 'human-in-the-loop', task: 'human_approval', input: { ...baseInput, reason: 'specialty_config_requires_approval' } });
    }

    return actions;
  }
}

export const triageRouter = new TriageRouterAgent();
