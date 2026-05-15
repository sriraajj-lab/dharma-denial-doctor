import { ToolDefinition } from './base-agent';
import { db } from '../db';

// ─── PAYER RULES TOOL ───────────────────────────────────────────────────

export const payerRulesTool: ToolDefinition = {
  name: 'payer_rules',
  description: 'Look up payer-specific rules including filing deadlines, appeal deadlines, auth requirements, and contact info',
  parameters: {
    payerName: { type: 'string', description: 'Payer name to look up rules for', required: true },
    ruleType: { type: 'string', description: 'Filter by rule type: filing_deadline, auth_required, modifier_rules, bundling, documentation' },
    cptCode: { type: 'string', description: 'Check if auth is required for this CPT code' },
  },
  execute: async (params) => {
    const { payerName, ruleType, cptCode } = params;

    const where: Record<string, unknown> = {
      payerName: { contains: String(payerName), mode: 'insensitive' },
      isActive: true,
    };
    if (ruleType) where.ruleType = String(ruleType);

    const rules = await db.payerRule.findMany({ where });

    // If CPT code specified, check auth requirements
    let authRequired = false;
    if (cptCode) {
      const authRules = rules.filter(r => r.ruleType === 'auth_required');
      for (const rule of authRules) {
        const conditions = JSON.parse(rule.conditions);
        if (conditions.cptCodeRange) {
          const cptNum = parseInt(String(cptCode));
          for (const range of conditions.cptCodeRange as string[]) {
            const [start, end] = String(range).split('-');
            if (cptNum >= parseInt(start) && cptNum <= parseInt(end)) {
              authRequired = true;
              break;
            }
          }
        }
      }
    }

    // Calculate filing and appeal deadlines
    const filingRule = rules.find(r => r.ruleType === 'filing_deadline');

    return {
      rules: rules.map(r => ({
        id: r.id,
        ruleType: r.ruleType,
        ruleName: r.ruleName,
        description: r.description,
        filingDeadlineDays: r.filingDeadlineDays,
        appealDeadlineDays: r.appealDeadlineDays,
        requiresAuth: r.requiresAuth,
        contactPhone: r.contactPhone,
        contactFax: r.contactFax,
        portalUrl: r.portalUrl,
      })),
      authRequired,
      filingDeadlineDays: filingRule?.filingDeadlineDays,
      appealDeadlineDays: filingRule?.appealDeadlineDays,
    };
  }
};

// ─── CLAIM SCRUB TOOL ───────────────────────────────────────────────────

export const claimScrubTool: ToolDefinition = {
  name: 'claim_scrub',
  description: 'Run claim scrubbing rules against a claim to detect potential issues before submission or to validate corrections',
  parameters: {
    claimData: { type: 'object', description: 'Claim data to scrub (partial Denial fields)', required: true },
  },
  execute: async (params) => {
    const claimData = params.claimData as Record<string, unknown>;
    const results: Array<{ ruleName: string; ruleType: string; severity: string; finding: string; suggestion: string }> = [];

    // Get active scrub rules from DB
    const rules = await db.claimScrubRule.findMany({ where: { isActive: true } });

    for (const rule of rules) {
      const conditions = JSON.parse(rule.conditions);
      const finding = evaluateScrubRule(rule, conditions, claimData);
      if (finding) {
        results.push({
          ruleName: rule.ruleName,
          ruleType: rule.ruleType,
          severity: rule.severity,
          finding: finding.finding,
          suggestion: finding.suggestion,
        });
      }
    }

    return {
      totalFindings: results.length,
      criticalCount: results.filter(r => r.severity === 'critical').length,
      highCount: results.filter(r => r.severity === 'high').length,
      mediumCount: results.filter(r => r.severity === 'medium').length,
      findings: results,
    };
  }
};

function evaluateScrubRule(rule: { ruleName: string; ruleType: string; severity: string }, conditions: Record<string, unknown>, claim: Record<string, unknown>): { finding: string; suggestion: string } | null {
  const cptCode = String(claim.cptCode || '');
  const modifier = claim.modifier as string | undefined;
  const diagnosisCode = String(claim.diagnosisCode || '');

  switch (rule.ruleType) {
    case 'modifier_check': {
      const cptCodes = conditions.cptCodes as string[] | undefined;
      if (cptCodes?.includes(cptCode) && !modifier) {
        return {
          finding: `CPT ${cptCode} commonly requires modifier (50, RT, or LT)`,
          suggestion: 'Add appropriate laterality or bilateral modifier',
        };
      }
      return null;
    }
    case 'coding_validation': {
      const requiredFields = conditions.requiredFields as string[] | undefined;
      if (requiredFields) {
        for (const field of requiredFields) {
          if (!claim[field]) {
            return { finding: `Required field "${field}" is missing`, suggestion: `Populate "${field}" before submission` };
          }
        }
      }
      return null;
    }
    case 'bundling': {
      const bundledPairs = conditions.bundledPairs as string[][] | undefined;
      if (bundledPairs) {
        for (const pair of bundledPairs) {
          if (pair.includes(cptCode)) {
            const other = pair.find(c => c !== cptCode);
            return { finding: `CPT ${cptCode} bundled with ${other} per CCI`, suggestion: 'Consider modifier 59/XE/XS/XP/XU if services are truly distinct' };
          }
        }
      }
      return null;
    }
    case 'diagnosis_match': {
      const requiredDiagnosis = conditions.requiredDiagnosis as Record<string, string[]> | undefined;
      if (requiredDiagnosis && requiredDiagnosis[cptCode]) {
        const validPrefixes = requiredDiagnosis[cptCode].map(r => r.charAt(0));
        if (!validPrefixes.includes(diagnosisCode.charAt(0))) {
          return { finding: `Diagnosis ${diagnosisCode} may not support CPT ${cptCode}`, suggestion: 'Verify diagnosis meets LCD/NCD criteria' };
        }
      }
      return null;
    }
    case 'auth_required': {
      const cptCodeRange = conditions.cptCodeRange as string[] | undefined;
      if (cptCodeRange) {
        const cptNum = parseInt(cptCode);
        for (const range of cptCodeRange) {
          const [start, end] = range.split('-');
          if (cptNum >= parseInt(start) && cptNum <= parseInt(end)) {
            return { finding: `CPT ${cptCode} typically requires prior auth`, suggestion: 'Verify prior authorization was obtained' };
          }
        }
      }
      return null;
    }
    default:
      return null;
  }
}

// ─── CODING INTELLIGENCE TOOL ───────────────────────────────────────────

export const codingIntelligenceTool: ToolDefinition = {
  name: 'coding_intelligence',
  description: 'Analyze coding issues for a denial using NCCI edits, modifier validation, CPT-ICD crosswalk, and coverage rules',
  parameters: {
    denialId: { type: 'string', description: 'Denial ID to analyze', required: true },
    cptCode: { type: 'string', description: 'CPT code on the claim' },
    modifier: { type: 'string', description: 'Current modifier' },
    diagnosisCode: { type: 'string', description: 'Primary diagnosis code' },
    carcCode: { type: 'string', description: 'CARC denial code' },
  },
  execute: async (params) => {
    const { cptCode, modifier, diagnosisCode, carcCode } = params;

    // NCCI edit pairs (in production, these would come from CMS database)
    const NCCI_PAIRS: Array<[string, string, boolean]> = [
      ['99213', '36415', false], ['99214', '36415', false], ['99215', '36415', false],
      ['99213', '81002', false], ['99213', '93000', true], ['99214', '93000', true],
      ['43239', '43235', false], ['29881', '29877', false], ['74177', '74176', false],
      ['70553', '70551', false], ['96374', '96360', true], ['97140', '97530', true],
    ];

    // Find NCCI findings
    const ncciFindings = NCCI_PAIRS
      .filter(([col1, col2]) => col1 === cptCode || col2 === cptCode)
      .map(([col1, col2, modAllowed]) => {
        const isComprehensive = col1 === cptCode;
        const otherCode = isComprehensive ? col2 : col1;
        return {
          column1Code: col1,
          column2Code: col2,
          modifierAllowed: modAllowed,
          recommendation: isComprehensive
            ? `CPT ${cptCode} bundles ${otherCode}. ${modAllowed ? 'Modifier allowed if distinct service.' : 'No modifier override allowed.'}`
            : `CPT ${cptCode} is component of ${otherCode}. ${modAllowed ? 'Add modifier 59/X if distinct.' : 'Always bundled.'}`,
        };
      });

    // Coverage rules
    const COVERAGE: Record<string, { covered: string[]; uncovered: string[]; lcd?: string }> = {
      '27447': { covered: ['M17.0', 'M17.1', 'M17.2'], uncovered: ['M25.56'], lcd: 'L33728' },
      '29881': { covered: ['M23.2', 'M23.3', 'S83.2'], uncovered: ['M17.1'], lcd: 'L34982' },
      '63030': { covered: ['M48.0', 'M51.1', 'G83.4'], uncovered: ['M54.5'], lcd: 'L34839' },
      '70553': { covered: ['G43.9', 'R51.9', 'G40.9'], uncovered: ['R51.0'], lcd: 'L33562' },
    };

    const coverage = COVERAGE[String(cptCode)]
      ? {
          isCovered: COVERAGE[String(cptCode)].covered.some(d => String(diagnosisCode).startsWith(d.split('.')[0])),
          suggestedDiagnoses: COVERAGE[String(cptCode)].uncovered.some(d => String(diagnosisCode).startsWith(d))
            ? COVERAGE[String(cptCode)].covered
            : [],
          lcdReference: COVERAGE[String(cptCode)].lcd,
        }
      : null;

    // Modifier suggestions
    const modifierSuggestions: Array<{ modifier: string; reason: string }> = [];
    if (carcCode === 'CO-4' && !modifier) {
      const cptNum = parseInt(String(cptCode));
      if (cptNum >= 99201 && cptNum <= 99499) {
        modifierSuggestions.push({ modifier: '25', reason: 'Significant separately identifiable E/M' });
      } else if (cptNum >= 20000 && cptNum <= 69999) {
        modifierSuggestions.push({ modifier: 'LT/RT', reason: 'Laterality modifier required' });
      }
    }
    if (carcCode === 'CO-22' && (!modifier || !['59', 'XE', 'XS', 'XP', 'XU'].includes(String(modifier)))) {
      modifierSuggestions.push({ modifier: '59/XE/XS/XP/XU', reason: 'Distinct procedural service for unbundling' });
    }

    // Generate corrections
    const corrections: Array<{ type: string; field: string; current: string; suggested: string; riskLevel: string }> = [];
    if (ncciFindings.some(f => f.modifierAllowed)) {
      corrections.push({ type: 'unbundle', field: 'Modifier', current: String(modifier || 'None'), suggested: '59/XE/XS/XP/XU', riskLevel: 'medium' });
    }
    for (const ms of modifierSuggestions) {
      corrections.push({ type: 'modifier_add', field: 'Modifier', current: String(modifier || 'None'), suggested: ms.modifier, riskLevel: 'low' });
    }
    if (coverage && !coverage.isCovered && coverage.suggestedDiagnoses.length > 0) {
      corrections.push({ type: 'diagnosis_change', field: 'DiagnosisCode', current: String(diagnosisCode), suggested: coverage.suggestedDiagnoses.join(' or '), riskLevel: 'high' });
    }

    return { ncciFindings, coverage, modifierSuggestions, corrections };
  }
};

// ─── RESUBMISSION INTELLIGENCE TOOL ─────────────────────────────────────

export const resubmissionIntelligenceTool: ToolDefinition = {
  name: 'resubmission_intelligence',
  description: 'Get predictions and insights from historical resubmission data to guide correction strategy',
  parameters: {
    payerName: { type: 'string', description: 'Payer name', required: true },
    carcCode: { type: 'string', description: 'CARC denial code', required: true },
    correctionType: { type: 'string', description: 'Proposed correction type' },
    cptCode: { type: 'string', description: 'CPT code on the claim' },
    deniedAmount: { type: 'number', description: 'Denied amount' },
  },
  execute: async (params) => {
    const { payerName, carcCode, correctionType, cptCode } = params;

    // Find similar historical records
    const similar = await db.resubmissionRecord.findMany({
      where: {
        OR: [
          { payerName: { contains: String(payerName) }, carcCode: String(carcCode) },
          { carcCode: String(carcCode), correctionType: String(correctionType || '') },
          { payerName: { contains: String(payerName) }, cptCode: String(cptCode || '') },
        ],
      },
      take: 100,
    });

    // Calculate success rate
    const successes = similar.filter(r => r.outcome === 'paid' || r.outcome === 'partially_paid');
    const baseRate = similar.length > 0 ? Math.round((successes.length / similar.length) * 100) : 50;

    // Get payer profile
    const payerProfile = await db.payerBehaviorProfile.findUnique({
      where: { payerName: String(payerName) }
    });

    // Generate alternative strategies
    const correctionTypes = new Map<string, { success: number; total: number }>();
    for (const record of similar) {
      const existing = correctionTypes.get(record.correctionType) || { success: 0, total: 0 };
      existing.total++;
      if (record.outcome === 'paid' || record.outcome === 'partially_paid') existing.success++;
      correctionTypes.set(record.correctionType, existing);
    }

    const alternatives = Array.from(correctionTypes.entries())
      .map(([type, data]) => ({ strategy: type, predictedSuccess: Math.round((data.success / data.total) * 100), count: data.total }))
      .filter(a => a.strategy !== String(correctionType))
      .sort((a, b) => b.predictedSuccess - a.predictedSuccess)
      .slice(0, 3);

    // Determine recommendation
    let recommendation = 'proceed';
    if (baseRate >= 70) recommendation = 'proceed';
    else if (baseRate >= 45) recommendation = 'proceed_with_caution';
    else if (baseRate >= 25) recommendation = 'consider_appeal';
    else recommendation = 'write_off';

    return {
      predictedSuccessRate: baseRate,
      confidence: Math.min(0.95, similar.length / 20 + 0.3),
      basedOn: similar.length,
      recommendation,
      payerProfile: payerProfile ? {
        successRate: payerProfile.successRate,
        avgDaysToPayment: payerProfile.avgDaysToPayment,
        bestCorrectionTypes: JSON.parse(payerProfile.bestCorrectionTypes),
      } : null,
      alternativeStrategies: alternatives,
    };
  }
};

// ─── ELIGIBILITY TOOL ───────────────────────────────────────────────────

export const eligibilityTool: ToolDefinition = {
  name: 'eligibility_resolver',
  description: 'Resolve eligibility and coordination of benefits issues for denied claims',
  parameters: {
    denialId: { type: 'string', description: 'Denial ID', required: true },
    payerName: { type: 'string', description: 'Payer name' },
    patientMemberId: { type: 'string', description: 'Patient member ID' },
    carcCode: { type: 'string', description: 'CARC code' },
  },
  execute: async (params) => {
    const { payerName, carcCode } = params;

    // Eligibility resolution strategies by denial code
    const strategies: Record<string, Array<{ type: string; description: string; steps: string[]; successRate: number }>> = {
      'CO-109': [{ type: 'coverage_verification', description: 'Patient not covered - verify eligibility and coverage dates', steps: ['Verify coverage dates on DOS', 'Check if retroactive enrollment', 'Contact payer for coverage verification', 'If coverage active, resubmit with verification'], successRate: 45 }],
      'CO-18': [{ type: 'duplicate_resolution', description: 'Duplicate claim - verify if truly duplicate', steps: ['Check claim history for same DOS/CPT', 'If different DOS, appeal with documentation', 'If same claim, void the duplicate'], successRate: 80 }],
      'PR-1': [{ type: 'patient_responsibility', description: 'Patient responsibility - deductible/coinsurance', steps: ['Verify patient deductible status', 'Bill patient for responsibility amount', 'Check if secondary insurance covers'], successRate: 30 }],
      'OA-23': [{ type: 'cob_resolution', description: 'Coordination of benefits issue', steps: ['Identify primary and secondary payers', 'Verify COB information', 'Resubmit to correct payer', 'Appeal with COB documentation'], successRate: 65 }],
    };

    const applicableStrategies = strategies[String(carcCode)] || [{
      type: 'general_eligibility',
      description: 'General eligibility verification',
      steps: ['Verify patient eligibility on date of service', 'Check coordination of benefits', 'Contact payer for clarification'],
      successRate: 40
    }];

    return {
      denialCode: String(carcCode),
      strategies: applicableStrategies,
      payerName: String(payerName),
    };
  }
};

// ─── APPEALS TOOL ───────────────────────────────────────────────────────

export const appealsTool: ToolDefinition = {
  name: 'appeal_generator',
  description: 'Generate appeal letters and strategies for denied claims',
  parameters: {
    denialId: { type: 'string', description: 'Denial ID', required: true },
    appealType: { type: 'string', description: 'first_level, second_level, or external_review' },
    payerName: { type: 'string', description: 'Payer to appeal to' },
    denialReason: { type: 'string', description: 'Reason for the denial' },
    supportingEvidence: { type: 'array', description: 'List of supporting evidence/documents' },
  },
  execute: async (params) => {
    const { appealType, payerName, denialReason } = params;

    const type = String(appealType || 'first_level');

    // Appeal deadline calculation
    const appealDeadlines: Record<string, number> = {
      'UnitedHealthcare': 90,
      'Aetna': 60,
      'Blue Cross Blue Shield': 90,
      'Medicare': 120,
      'Cigna': 90,
      'Humana': 60,
    };

    const deadline = appealDeadlines[String(payerName)] || 60;

    return {
      appealType: type,
      payerName: String(payerName),
      deadlineDays: deadline,
      appealStrategy: {
        level: type,
        recommendedApproach: String(denialReason).includes('medical_necessity')
          ? 'Clinical appeal with peer-reviewed literature and detailed medical records'
          : String(denialReason).includes('authorization')
          ? 'Appeal with retro-authorization documentation and emergent circumstances'
          : 'Corrected claim with supporting documentation',
        keyArguments: [
          'Clinical documentation supports the medical necessity of the service',
          'The service meets applicable coverage criteria per LCD/NCD',
          'All required documentation is enclosed for review',
        ],
        requiredDocuments: ['Medical records', 'Physician letter of medical necessity', 'Relevant LCD/NCD criteria', 'Prior authorization documentation (if applicable)'],
        estimatedSuccessRate: type === 'first_level' ? 45 : type === 'second_level' ? 30 : 20,
        nextStepsIfDenied: type === 'first_level' ? 'File second-level appeal within 60 days' : type === 'second_level' ? 'Request external review' : 'Consider legal options',
      },
    };
  }
};

// ─── DENIAL DATA TOOL ───────────────────────────────────────────────────

export const denialDataTool: ToolDefinition = {
  name: 'denial_data',
  description: 'Read and update denial records from the database',
  parameters: {
    action: { type: 'string', description: 'get, update, or search', required: true },
    denialId: { type: 'string', description: 'Denial ID for get/update' },
    filters: { type: 'object', description: 'Search filters (status, payer, category)' },
    updates: { type: 'object', description: 'Fields to update' },
  },
  execute: async (params) => {
    const action = String(params.action);

    if (action === 'get' && params.denialId) {
      const denial = await db.denial.findUnique({
        where: { id: String(params.denialId) },
        include: { analysis: true, correction: true, qualityCheck: true, notes: true, appeals: true, financials: true }
      });
      return denial;
    }

    if (action === 'update' && params.denialId && params.updates) {
      const updates = params.updates as Record<string, unknown>;
      const denial = await db.denial.update({
        where: { id: String(params.denialId) },
        data: updates,
      });
      return denial;
    }

    if (action === 'search') {
      const filters = (params.filters || {}) as Record<string, unknown>;
      const where: Record<string, unknown> = {};
      if (filters.status) where.status = String(filters.status);
      if (filters.payerName) where.payerName = { contains: String(filters.payerName) };
      if (filters.denialCategory) where.denialCategory = String(filters.denialCategory);
      if (filters.priority) where.priority = String(filters.priority);

      const denials = await db.denial.findMany({
        where,
        include: { analysis: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      return denials;
    }

    throw new Error(`Unknown action: ${action}`);
  }
};

// ─── ALL TOOLS REGISTRY ─────────────────────────────────────────────────

export const ALL_TOOLS: ToolDefinition[] = [
  payerRulesTool,
  claimScrubTool,
  codingIntelligenceTool,
  resubmissionIntelligenceTool,
  eligibilityTool,
  appealsTool,
  denialDataTool,
];

export function getToolByName(name: string): ToolDefinition | undefined {
  return ALL_TOOLS.find(t => t.name === name);
}
