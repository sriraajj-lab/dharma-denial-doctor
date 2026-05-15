import { ClaimScrubRule, ClaimScrubResult, Denial } from './types';

// Built-in claim scrubbing rules for denial prevention
const scrubRules: ClaimScrubRule[] = [
  {
    id: 'scrub-001',
    ruleName: 'Missing Modifier for Bilateral Procedures',
    ruleType: 'modifier_check',
    description: 'Check if bilateral procedures are missing modifier 50 or RT/LT',
    conditions: { cptCodes: ['27447', '27446', '29881', '29880', '64483'] },
    action: 'warn',
    severity: 'high',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'scrub-002',
    ruleName: 'E/M Level vs Diagnosis Mismatch',
    ruleType: 'coding_validation',
    description: 'Flag high-level E/M codes (99214, 99215) without supporting complex diagnosis',
    conditions: { cptCodes: ['99214', '99215', '99205', '99245'], minDiagnosisCount: 2 },
    action: 'warn',
    severity: 'medium',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'scrub-003',
    ruleName: 'CCI Bundling Check - Common Pairs',
    ruleType: 'bundling',
    description: 'Flag commonly bundled procedure pairs that may be denied',
    conditions: {
      bundledPairs: [
        ['99213', '36415'],
        ['99214', '36415'],
        ['99213', '81002'],
        ['43239', '43235'],
        ['29881', '29877'],
      ],
    },
    action: 'block',
    severity: 'high',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'scrub-004',
    ruleName: 'Missing Diagnosis for Procedure',
    ruleType: 'diagnosis_match',
    description: 'Ensure diagnosis code supports medical necessity for procedure',
    conditions: {
      requiredDiagnosis: {
        '99213': ['Z00-Z99', 'R00-R99'],
        '43239': ['K20-K31'],
        '29881': ['M23', 'S83'],
      },
    },
    action: 'warn',
    severity: 'high',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'scrub-005',
    ruleName: 'Authorization Required - High Cost Imaging',
    ruleType: 'auth_required',
    description: 'Prior auth typically required for MRI, CT, PET scans',
    conditions: { cptCodeRange: ['70000-79999'] },
    action: 'block',
    severity: 'critical',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'scrub-006',
    ruleName: 'Duplicate Claim Check',
    ruleType: 'coding_validation',
    description: 'Check for potential duplicate claims with same patient/DOS/CPT',
    conditions: {},
    action: 'block',
    severity: 'high',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'scrub-007',
    ruleName: 'NCD/LCD Coverage Check',
    ruleType: 'ncd_lcd',
    description: 'Verify procedure is covered under national/local coverage determinations',
    conditions: {
      flaggedProcedures: ['27447', '63030', '22612', '22630'],
      requiredDocs: ['Medical records', 'Conservative treatment documentation'],
    },
    action: 'warn',
    severity: 'medium',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'scrub-008',
    ruleName: 'Patient Demographics Completeness',
    ruleType: 'coding_validation',
    description: 'Ensure all required patient demographics are present',
    conditions: { requiredFields: ['patientName', 'patientDOB', 'payerId', 'providerNPI'] },
    action: 'block',
    severity: 'critical',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// Store for results
let scrubResults: ClaimScrubResult[] = [];

/**
 * Run all active scrub rules against a claim/denial
 */
export function scrubClaim(claim: Partial<Denial>): ClaimScrubResult[] {
  const results: ClaimScrubResult[] = [];

  for (const rule of scrubRules.filter((r) => r.isActive)) {
    const finding = evaluateRule(rule, claim);
    if (finding) {
      const result: ClaimScrubResult = {
        id: `scr-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        denialId: claim.id,
        claimNumber: claim.claimNumber,
        ruleId: rule.id,
        ruleName: rule.ruleName,
        ruleType: rule.ruleType,
        severity: rule.severity,
        finding: finding.finding,
        suggestion: finding.suggestion,
        status: 'open',
        createdAt: new Date().toISOString(),
      };
      results.push(result);
      scrubResults.push(result);
    }
  }

  return results;
}

/**
 * Run scrub on a batch of claims
 */
export function scrubBatch(claims: Partial<Denial>[]): {
  totalClaims: number;
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  results: ClaimScrubResult[];
} {
  const allResults: ClaimScrubResult[] = [];

  for (const claim of claims) {
    const findings = scrubClaim(claim);
    allResults.push(...findings);
  }

  return {
    totalClaims: claims.length,
    totalFindings: allResults.length,
    criticalCount: allResults.filter((r) => r.severity === 'critical').length,
    highCount: allResults.filter((r) => r.severity === 'high').length,
    mediumCount: allResults.filter((r) => r.severity === 'medium').length,
    lowCount: allResults.filter((r) => r.severity === 'low').length,
    results: allResults,
  };
}

function evaluateRule(rule: ClaimScrubRule, claim: Partial<Denial>): { finding: string; suggestion: string } | null {
  switch (rule.ruleType) {
    case 'modifier_check':
      return checkModifier(rule, claim);
    case 'coding_validation':
      return checkCoding(rule, claim);
    case 'bundling':
      return checkBundling(rule, claim);
    case 'diagnosis_match':
      return checkDiagnosis(rule, claim);
    case 'auth_required':
      return checkAuth(rule, claim);
    case 'ncd_lcd':
      return checkNCDLCD(rule, claim);
    default:
      return null;
  }
}

function checkModifier(rule: ClaimScrubRule, claim: Partial<Denial>): { finding: string; suggestion: string } | null {
  const conditions = rule.conditions as { cptCodes?: string[] };
  if (!conditions.cptCodes || !claim.cptCode) return null;

  if (conditions.cptCodes.includes(claim.cptCode) && !claim.modifier) {
    return {
      finding: `CPT ${claim.cptCode} is commonly bilateral but missing modifier (50, RT, or LT)`,
      suggestion: 'Add modifier 50 for bilateral procedure, or RT/LT for unilateral specification',
    };
  }
  return null;
}

function checkCoding(rule: ClaimScrubRule, claim: Partial<Denial>): { finding: string; suggestion: string } | null {
  const conditions = rule.conditions as { cptCodes?: string[]; requiredFields?: string[] };

  // Demographics check
  if (conditions.requiredFields) {
    for (const field of conditions.requiredFields) {
      if (!claim[field as keyof Denial]) {
        return {
          finding: `Required field "${field}" is missing or empty`,
          suggestion: `Ensure "${field}" is populated before claim submission`,
        };
      }
    }
  }

  // E/M level check
  if (conditions.cptCodes && claim.cptCode && conditions.cptCodes.includes(claim.cptCode)) {
    if (!claim.diagnosisCode2 && !claim.diagnosisCode3) {
      return {
        finding: `High-level E/M code ${claim.cptCode} may require multiple supporting diagnoses`,
        suggestion: 'Verify documentation supports the E/M level billed. Consider adding secondary diagnoses if clinically appropriate.',
      };
    }
  }

  return null;
}

function checkBundling(rule: ClaimScrubRule, claim: Partial<Denial>): { finding: string; suggestion: string } | null {
  // Note: In a real implementation, this would check against the full claim with all service lines
  // For now, we flag known commonly-denied codes
  const conditions = rule.conditions as { bundledPairs?: string[][] };
  if (!conditions.bundledPairs || !claim.cptCode) return null;

  for (const pair of conditions.bundledPairs) {
    if (pair.includes(claim.cptCode)) {
      const otherCode = pair.find((c) => c !== claim.cptCode);
      return {
        finding: `CPT ${claim.cptCode} is commonly bundled with ${otherCode} per CCI edits`,
        suggestion: `If both codes are on the same claim, consider modifier 59/XE/XS/XP/XU to unbundle if services are truly distinct`,
      };
    }
  }
  return null;
}

function checkDiagnosis(rule: ClaimScrubRule, claim: Partial<Denial>): { finding: string; suggestion: string } | null {
  // Simplified diagnosis-procedure matching
  if (!claim.cptCode || !claim.diagnosisCode) return null;

  const conditions = rule.conditions as { requiredDiagnosis?: Record<string, string[]> };
  if (!conditions.requiredDiagnosis) return null;

  const requiredRanges = conditions.requiredDiagnosis[claim.cptCode];
  if (!requiredRanges) return null;

  // Check if diagnosis falls within expected ranges (simplified)
  const diagPrefix = claim.diagnosisCode.charAt(0);
  const validPrefixes = requiredRanges.map((r) => r.charAt(0));

  if (!validPrefixes.includes(diagPrefix)) {
    return {
      finding: `Diagnosis ${claim.diagnosisCode} may not support medical necessity for CPT ${claim.cptCode}`,
      suggestion: 'Verify the diagnosis code supports the procedure per LCD/NCD guidelines',
    };
  }

  return null;
}

function checkAuth(rule: ClaimScrubRule, claim: Partial<Denial>): { finding: string; suggestion: string } | null {
  const conditions = rule.conditions as { cptCodeRange?: string[] };
  if (!conditions.cptCodeRange || !claim.cptCode) return null;

  const cptNum = parseInt(claim.cptCode);
  for (const range of conditions.cptCodeRange) {
    const [start, end] = range.split('-');
    if (cptNum >= parseInt(start) && cptNum <= parseInt(end)) {
      return {
        finding: `CPT ${claim.cptCode} typically requires prior authorization`,
        suggestion: 'Verify prior authorization was obtained. If not, obtain retro-auth or note auth reference number on claim.',
      };
    }
  }
  return null;
}

function checkNCDLCD(rule: ClaimScrubRule, claim: Partial<Denial>): { finding: string; suggestion: string } | null {
  const conditions = rule.conditions as { flaggedProcedures?: string[]; requiredDocs?: string[] };
  if (!conditions.flaggedProcedures || !claim.cptCode) return null;

  if (conditions.flaggedProcedures.includes(claim.cptCode)) {
    const docs = conditions.requiredDocs?.join(', ') || 'supporting documentation';
    return {
      finding: `CPT ${claim.cptCode} is subject to NCD/LCD coverage criteria`,
      suggestion: `Ensure ${docs} are included to meet coverage determination requirements`,
    };
  }
  return null;
}

// CRUD for scrub rules
export function getScrubRules(): ClaimScrubRule[] {
  return [...scrubRules];
}

export function getScrubResults(filters?: { denialId?: string; status?: string }): ClaimScrubResult[] {
  let filtered = [...scrubResults];
  if (filters?.denialId) filtered = filtered.filter((r) => r.denialId === filters.denialId);
  if (filters?.status) filtered = filtered.filter((r) => r.status === filters.status);
  return filtered;
}

export function updateScrubResult(id: string, updates: Partial<ClaimScrubResult>): ClaimScrubResult | null {
  const index = scrubResults.findIndex((r) => r.id === id);
  if (index === -1) return null;
  scrubResults[index] = { ...scrubResults[index], ...updates };
  return scrubResults[index];
}
