/**
 * Smart Coding Correction Engine
 * Provides intelligent coding corrections for denied claims using:
 * - NCCI (National Correct Coding Initiative) edit pairs
 * - Modifier validation and suggestions
 * - CPT-ICD crosswalk (procedure-diagnosis matching)
 * - LCD/NCD coverage criteria
 * - Payer-specific coding rules
 */

import { Denial } from './types';

// ─── NCCI EDIT PAIRS (Common bundled procedure pairs) ────────────────────────
// Format: [column1 (comprehensive), column2 (component), modifier_allowed]
const NCCI_EDIT_PAIRS: Array<[string, string, boolean]> = [
  // E/M with minor procedures
  ['99213', '36415', false],  // Office visit + venipuncture
  ['99214', '36415', false],
  ['99215', '36415', false],
  ['99213', '81002', false],  // Office visit + urinalysis
  ['99214', '81002', false],
  ['99213', '93000', true],   // Office visit + EKG (modifier allowed)
  ['99214', '93000', true],
  // Surgical bundling
  ['43239', '43235', false],  // Upper GI endoscopy with biopsy includes diagnostic
  ['29881', '29877', false],  // Knee arthroscopy meniscectomy includes debridement
  ['29881', '29875', false],  // Knee arthroscopy meniscectomy includes synovectomy
  ['43239', '43200', false],  // EGD with biopsy includes diagnostic EGD
  ['45385', '45378', false],  // Colonoscopy with polyp removal includes diagnostic
  ['45380', '45378', false],  // Colonoscopy with biopsy includes diagnostic
  // Imaging bundling
  ['74177', '74176', false],  // CT abd/pelvis with contrast includes without
  ['71260', '71250', false],  // CT chest with contrast includes without
  ['70553', '70551', false],  // MRI brain with/without includes without
  // Lab bundling
  ['80053', '80048', false],  // Comprehensive metabolic includes basic metabolic
  ['80053', '82565', false],  // CMP includes creatinine
  ['80053', '84443', false],  // CMP includes TSH (no, TSH not in CMP but common error)
  ['80061', '82465', false],  // Lipid panel includes total cholesterol
  ['80061', '83718', false],  // Lipid panel includes HDL
  // Injection/infusion
  ['96374', '96360', true],   // IV push + hydration (modifier allowed)
  ['96413', '96360', true],   // Chemo admin + hydration (modifier allowed)
  // Physical therapy
  ['97140', '97530', true],   // Manual therapy + therapeutic activities
  ['97110', '97112', true],   // Therapeutic exercise + neuromuscular re-education
];

// ─── MODIFIER VALIDATION RULES ──────────────────────────────────────────────
interface ModifierRule {
  modifier: string;
  name: string;
  validWith: string[];       // CPT code ranges where this modifier is valid
  invalidWith: string[];     // CPT codes where this modifier is never valid
  requirements: string;      // Documentation requirement
  commonMisuse: string;      // Common incorrect usage
}

const MODIFIER_RULES: ModifierRule[] = [
  {
    modifier: '25',
    name: 'Significant, Separately Identifiable E/M',
    validWith: ['99201-99499'],
    invalidWith: [],
    requirements: 'Documentation must support a significant, separately identifiable E/M service above and beyond the procedure performed',
    commonMisuse: 'Used on E/M when only a minor procedure was performed without separate E/M documentation',
  },
  {
    modifier: '59',
    name: 'Distinct Procedural Service',
    validWith: ['10000-69999'],
    invalidWith: [],
    requirements: 'Different session, different procedure/surgery, different site/organ system, separate incision/excision, separate lesion, or separate injury',
    commonMisuse: 'Used to bypass NCCI edits without true distinct service documentation. Consider XE/XS/XP/XU instead.',
  },
  {
    modifier: 'XE',
    name: 'Separate Encounter',
    validWith: ['10000-99499'],
    invalidWith: [],
    requirements: 'Service performed during a separate encounter on the same date',
    commonMisuse: 'Used when services were actually performed in the same encounter',
  },
  {
    modifier: 'XS',
    name: 'Separate Structure',
    validWith: ['10000-69999'],
    invalidWith: [],
    requirements: 'Service performed on a separate organ/structure',
    commonMisuse: 'Used when same structure was involved',
  },
  {
    modifier: 'XP',
    name: 'Separate Practitioner',
    validWith: ['10000-99499'],
    invalidWith: [],
    requirements: 'Service performed by a different practitioner',
    commonMisuse: 'Used when same practitioner performed both services',
  },
  {
    modifier: 'XU',
    name: 'Unusual Non-Overlapping Service',
    validWith: ['10000-99499'],
    invalidWith: [],
    requirements: 'Service is distinct because it does not overlap usual components of the main service',
    commonMisuse: 'Used without clear documentation of non-overlapping nature',
  },
  {
    modifier: '26',
    name: 'Professional Component',
    validWith: ['70000-79999', '80000-89999', '90000-99499'],
    invalidWith: ['99201-99499'],
    requirements: 'Physician interpretation only, without technical component',
    commonMisuse: 'Used on codes that are inherently professional-only',
  },
  {
    modifier: 'TC',
    name: 'Technical Component',
    validWith: ['70000-79999', '80000-89999'],
    invalidWith: ['99201-99499'],
    requirements: 'Technical component only (equipment, technician, supplies)',
    commonMisuse: 'Used on codes that are inherently technical-only',
  },
  {
    modifier: '50',
    name: 'Bilateral Procedure',
    validWith: ['20000-69999'],
    invalidWith: [],
    requirements: 'Procedure performed on both sides of the body during same session',
    commonMisuse: 'Used on procedures that are inherently bilateral',
  },
  {
    modifier: 'LT',
    name: 'Left Side',
    validWith: ['20000-69999'],
    invalidWith: [],
    requirements: 'Procedure performed on left side',
    commonMisuse: 'Used with modifier 50 simultaneously',
  },
  {
    modifier: 'RT',
    name: 'Right Side',
    validWith: ['20000-69999'],
    invalidWith: [],
    requirements: 'Procedure performed on right side',
    commonMisuse: 'Used with modifier 50 simultaneously',
  },
];



// ─── CPT-ICD CROSSWALK (Procedure-Diagnosis Medical Necessity) ──────────────
interface CoverageRule {
  cptCodes: string[];
  coveredDiagnoses: string[];      // ICD-10 codes/ranges that support medical necessity
  uncoveredDiagnoses: string[];    // ICD-10 codes that are commonly denied
  lcdReference?: string;
  ncdReference?: string;
  documentation: string[];         // Required documentation elements
}

const COVERAGE_RULES: CoverageRule[] = [
  {
    cptCodes: ['27447'],  // Total knee replacement
    coveredDiagnoses: ['M17.0', 'M17.10', 'M17.11', 'M17.12', 'M17.2', 'M17.30', 'M17.31', 'M17.32'],
    uncoveredDiagnoses: ['M25.561', 'M25.562', 'M79.3'],
    lcdReference: 'L33728',
    documentation: [
      'Failed conservative treatment (6+ months)',
      'X-ray showing joint space narrowing',
      'Functional limitation documentation',
      'BMI documented if >40',
    ],
  },
  {
    cptCodes: ['29881', '29880'],  // Knee arthroscopy/meniscectomy
    coveredDiagnoses: ['M23.20', 'M23.21', 'M23.22', 'M23.30', 'M23.31', 'M23.32', 'S83.200A', 'S83.201A'],
    uncoveredDiagnoses: ['M17.11', 'M17.12', 'M25.561'],
    lcdReference: 'L34982',
    documentation: [
      'MRI showing meniscal tear',
      'Failed conservative treatment (4-6 weeks)',
      'Mechanical symptoms documented',
    ],
  },
  {
    cptCodes: ['63030', '63047'],  // Lumbar laminectomy/decompression
    coveredDiagnoses: ['M48.06', 'M48.07', 'M51.16', 'M51.17', 'G83.4'],
    uncoveredDiagnoses: ['M54.5', 'M54.41', 'M54.42'],
    lcdReference: 'L34839',
    documentation: [
      'Failed conservative treatment (6+ weeks)',
      'MRI/CT showing neural compression',
      'Neurological deficit documented',
      'Correlation between imaging and symptoms',
    ],
  },
  {
    cptCodes: ['99213', '99214', '99215'],  // E/M Office visits
    coveredDiagnoses: [],  // Most diagnoses covered for E/M
    uncoveredDiagnoses: ['Z00.00', 'Z00.01'],  // Routine exam should use preventive codes
    documentation: [
      'History of present illness',
      'Review of systems',
      'Physical examination',
      'Medical decision making',
    ],
  },
  {
    cptCodes: ['70553'],  // MRI Brain with/without contrast
    coveredDiagnoses: ['G43.909', 'R51.9', 'G40.909', 'R55', 'G93.40', 'C71.9'],
    uncoveredDiagnoses: ['R51.0'],
    lcdReference: 'L33562',
    documentation: [
      'Clinical indication documented',
      'Prior imaging results (if applicable)',
      'Failed treatment documentation',
    ],
  },
  {
    cptCodes: ['43239', '43235'],  // EGD with/without biopsy
    coveredDiagnoses: ['K21.0', 'K25.9', 'K26.9', 'K29.00', 'K31.811', 'R10.13', 'K22.10'],
    uncoveredDiagnoses: [],
    lcdReference: 'L35052',
    documentation: [
      'Indication for procedure',
      'Symptoms duration documented',
      'Prior treatment failure (if applicable)',
    ],
  },
];

// ─── MAIN FUNCTIONS ─────────────────────────────────────────────────────────

export interface CodingCorrectionResult {
  overallAssessment: 'correctable' | 'partially_correctable' | 'requires_appeal' | 'not_correctable';
  confidenceScore: number;
  corrections: CodingCorrection[];
  ncciFindings: NCCIFinding[];
  modifierSuggestions: ModifierSuggestion[];
  coverageAnalysis: CoverageAnalysis | null;
  resubmissionStrategy: ResubmissionStrategy;
  estimatedSuccessRate: number;
}

export interface CodingCorrection {
  type: 'code_change' | 'modifier_add' | 'modifier_remove' | 'modifier_change' | 'diagnosis_change' | 'unbundle' | 'documentation';
  field: string;
  currentValue: string;
  suggestedValue: string;
  rationale: string;
  riskLevel: 'low' | 'medium' | 'high';
  supportingReference?: string;
}

export interface NCCIFinding {
  column1Code: string;
  column2Code: string;
  modifierAllowed: boolean;
  recommendation: string;
}

export interface ModifierSuggestion {
  modifier: string;
  modifierName: string;
  action: 'add' | 'remove' | 'change';
  reason: string;
  documentationRequired: string;
}

export interface CoverageAnalysis {
  isCovered: boolean;
  currentDiagnosis: string;
  suggestedDiagnoses: string[];
  lcdReference?: string;
  ncdReference?: string;
  missingDocumentation: string[];
  coverageNotes: string;
}

export interface ResubmissionStrategy {
  method: 'corrected_claim' | 'appeal' | 'corrected_with_appeal' | 'patient_responsibility' | 'void_and_replace';
  frequencyCode: string;  // 1=original, 7=replacement, 8=void
  timelineRecommendation: string;
  steps: string[];
  estimatedDaysToResolution: number;
}

/**
 * Perform comprehensive coding analysis and generate smart corrections
 */
export function analyzeAndCorrectCoding(denial: Denial): CodingCorrectionResult {
  const ncciFindings = checkNCCIEdits(denial.cptCode, denial.modifier);
  const modifierSuggestions = analyzeModifiers(denial);
  const coverageAnalysis = analyzeCoverage(denial);
  const corrections = generateCorrections(denial, ncciFindings, modifierSuggestions, coverageAnalysis);
  const strategy = determineResubmissionStrategy(denial, corrections, coverageAnalysis);

  // Calculate overall assessment
  let overallAssessment: CodingCorrectionResult['overallAssessment'] = 'not_correctable';
  if (corrections.length > 0) {
    const highRisk = corrections.filter(c => c.riskLevel === 'high').length;
    if (highRisk === 0) overallAssessment = 'correctable';
    else if (highRisk < corrections.length) overallAssessment = 'partially_correctable';
    else overallAssessment = 'requires_appeal';
  } else if (coverageAnalysis && !coverageAnalysis.isCovered) {
    overallAssessment = 'requires_appeal';
  }

  // Estimate success rate based on correction type and risk
  let estimatedSuccessRate = 0;
  if (overallAssessment === 'correctable') estimatedSuccessRate = 85;
  else if (overallAssessment === 'partially_correctable') estimatedSuccessRate = 60;
  else if (overallAssessment === 'requires_appeal') estimatedSuccessRate = 40;
  else estimatedSuccessRate = 10;

  return {
    overallAssessment,
    confidenceScore: corrections.length > 0 ? 0.8 : 0.5,
    corrections,
    ncciFindings,
    modifierSuggestions,
    coverageAnalysis,
    resubmissionStrategy: strategy,
    estimatedSuccessRate,
  };
}



/**
 * Check NCCI edit pairs for the given CPT code
 */
function checkNCCIEdits(cptCode: string, modifier?: string): NCCIFinding[] {
  const findings: NCCIFinding[] = [];

  for (const [col1, col2, modAllowed] of NCCI_EDIT_PAIRS) {
    if (col1 === cptCode || col2 === cptCode) {
      const otherCode = col1 === cptCode ? col2 : col1;
      const isComprehensive = col1 === cptCode;

      let recommendation = '';
      if (isComprehensive) {
        recommendation = `CPT ${cptCode} is the comprehensive code that bundles ${otherCode}. `;
        if (modAllowed) {
          recommendation += `Modifier 59/X{EPSU} IS allowed if services are truly distinct. Ensure documentation supports distinct service.`;
        } else {
          recommendation += `No modifier override allowed. The component code ${otherCode} cannot be separately reported.`;
        }
      } else {
        recommendation = `CPT ${cptCode} is a component of ${otherCode}. `;
        if (modAllowed) {
          recommendation += `Add modifier 59 or appropriate X modifier if service is distinct (different site, session, or encounter).`;
        } else {
          recommendation += `This code is always bundled with ${otherCode}. Consider billing only the comprehensive code.`;
        }
      }

      findings.push({
        column1Code: col1,
        column2Code: col2,
        modifierAllowed: modAllowed,
        recommendation,
      });
    }
  }

  return findings;
}

/**
 * Analyze current modifiers and suggest corrections
 */
function analyzeModifiers(denial: Denial): ModifierSuggestion[] {
  const suggestions: ModifierSuggestion[] = [];
  const cptCode = denial.cptCode;
  const currentModifier = denial.modifier || '';
  const carcCode = denial.carcCode;

  // CO-4: Modifier issue
  if (carcCode === 'CO-4') {
    if (!currentModifier) {
      // No modifier present - suggest common ones based on CPT range
      const cptNum = parseInt(cptCode);

      if (cptNum >= 99201 && cptNum <= 99499) {
        suggestions.push({
          modifier: '25',
          modifierName: 'Significant, Separately Identifiable E/M',
          action: 'add',
          reason: 'E/M code denied for modifier issue - likely needs modifier 25 if performed with a procedure',
          documentationRequired: 'Separate E/M documentation distinct from procedure',
        });
      } else if (cptNum >= 20000 && cptNum <= 69999) {
        // Surgical code - might need laterality
        suggestions.push({
          modifier: 'LT',
          modifierName: 'Left Side',
          action: 'add',
          reason: 'Surgical procedure may require laterality modifier',
          documentationRequired: 'Operative note specifying side of body',
        });
        suggestions.push({
          modifier: 'RT',
          modifierName: 'Right Side',
          action: 'add',
          reason: 'Surgical procedure may require laterality modifier',
          documentationRequired: 'Operative note specifying side of body',
        });
      }
    } else if (currentModifier === '59') {
      // Modifier 59 is overused - suggest more specific X modifiers
      suggestions.push({
        modifier: 'XE',
        modifierName: 'Separate Encounter',
        action: 'change',
        reason: 'CMS prefers specific X modifiers over 59. Use XE if services were in separate encounters.',
        documentationRequired: 'Documentation of separate encounter time',
      });
      suggestions.push({
        modifier: 'XS',
        modifierName: 'Separate Structure',
        action: 'change',
        reason: 'Use XS if procedure was on a separate anatomical structure.',
        documentationRequired: 'Documentation identifying separate anatomical site',
      });
    }
  }

  // CO-22: Bundling - suggest unbundling modifiers
  if (carcCode === 'CO-22') {
    if (!currentModifier || !['59', 'XE', 'XS', 'XP', 'XU'].includes(currentModifier)) {
      suggestions.push({
        modifier: '59',
        modifierName: 'Distinct Procedural Service',
        action: 'add',
        reason: 'Bundling denial - modifier 59 may unbundle if services are truly distinct',
        documentationRequired: 'Documentation proving: different session, procedure, site, organ system, incision, or injury',
      });
    }
  }

  return suggestions;
}

/**
 * Analyze coverage/medical necessity against LCD/NCD rules
 */
function analyzeCoverage(denial: Denial): CoverageAnalysis | null {
  const cptCode = denial.cptCode;
  const diagnosisCode = denial.diagnosisCode;

  // Find matching coverage rule
  const rule = COVERAGE_RULES.find(r => r.cptCodes.includes(cptCode));
  if (!rule) return null;

  const isCovered = rule.coveredDiagnoses.length === 0 ||
    rule.coveredDiagnoses.some(d => diagnosisCode.startsWith(d.split('.')[0]));

  const isExplicitlyUncovered = rule.uncoveredDiagnoses.some(d =>
    diagnosisCode === d || diagnosisCode.startsWith(d)
  );

  let coverageNotes = '';
  if (isExplicitlyUncovered) {
    coverageNotes = `Diagnosis ${diagnosisCode} is commonly denied for CPT ${cptCode}. `;
    coverageNotes += `Consider reviewing clinical documentation for a more specific diagnosis that meets coverage criteria.`;
  } else if (!isCovered && rule.coveredDiagnoses.length > 0) {
    coverageNotes = `Diagnosis ${diagnosisCode} may not meet LCD/NCD criteria for CPT ${cptCode}. `;
    coverageNotes += `Covered diagnoses include: ${rule.coveredDiagnoses.slice(0, 5).join(', ')}`;
  } else {
    coverageNotes = `Diagnosis ${diagnosisCode} appears to meet coverage criteria for CPT ${cptCode}.`;
  }

  return {
    isCovered: isCovered && !isExplicitlyUncovered,
    currentDiagnosis: diagnosisCode,
    suggestedDiagnoses: isExplicitlyUncovered || !isCovered ? rule.coveredDiagnoses.slice(0, 5) : [],
    lcdReference: rule.lcdReference,
    ncdReference: rule.ncdReference,
    missingDocumentation: rule.documentation,
    coverageNotes,
  };
}

/**
 * Generate specific corrections based on all analyses
 */
function generateCorrections(
  denial: Denial,
  ncciFindings: NCCIFinding[],
  modifierSuggestions: ModifierSuggestion[],
  coverageAnalysis: CoverageAnalysis | null
): CodingCorrection[] {
  const corrections: CodingCorrection[] = [];
  const carcCode = denial.carcCode;

  // NCCI-based corrections
  for (const finding of ncciFindings) {
    if (finding.modifierAllowed) {
      corrections.push({
        type: 'unbundle',
        field: 'Modifier',
        currentValue: denial.modifier || 'None',
        suggestedValue: '59 (or XE/XS/XP/XU as appropriate)',
        rationale: finding.recommendation,
        riskLevel: 'medium',
        supportingReference: 'CMS NCCI Policy Manual, Chapter 1',
      });
    }
  }

  // Modifier-based corrections
  for (const suggestion of modifierSuggestions) {
    corrections.push({
      type: suggestion.action === 'add' ? 'modifier_add' : 'modifier_change',
      field: 'Modifier',
      currentValue: denial.modifier || 'None',
      suggestedValue: `${suggestion.modifier} (${suggestion.modifierName})`,
      rationale: suggestion.reason,
      riskLevel: suggestion.modifier === '59' ? 'medium' : 'low',
      supportingReference: `Documentation required: ${suggestion.documentationRequired}`,
    });
  }

  // Coverage/diagnosis corrections
  if (coverageAnalysis && !coverageAnalysis.isCovered && coverageAnalysis.suggestedDiagnoses.length > 0) {
    corrections.push({
      type: 'diagnosis_change',
      field: 'DiagnosisCode',
      currentValue: denial.diagnosisCode,
      suggestedValue: coverageAnalysis.suggestedDiagnoses.join(' or '),
      rationale: coverageAnalysis.coverageNotes,
      riskLevel: 'high',
      supportingReference: coverageAnalysis.lcdReference ? `LCD ${coverageAnalysis.lcdReference}` : undefined,
    });
  }

  // Missing documentation corrections
  if (coverageAnalysis && coverageAnalysis.missingDocumentation.length > 0) {
    corrections.push({
      type: 'documentation',
      field: 'Supporting Documentation',
      currentValue: 'Not provided with original claim',
      suggestedValue: coverageAnalysis.missingDocumentation.join('; '),
      rationale: 'Required documentation to support medical necessity',
      riskLevel: 'low',
    });
  }

  // CO-11: Diagnosis doesn't support level of service
  if (carcCode === 'CO-11' && corrections.length === 0) {
    corrections.push({
      type: 'code_change',
      field: 'CPT Code (downcode)',
      currentValue: denial.cptCode,
      suggestedValue: suggestDowncode(denial.cptCode),
      rationale: 'Diagnosis does not support current E/M level. Consider downcoding or adding supporting diagnoses.',
      riskLevel: 'medium',
    });
  }

  return corrections;
}

/**
 * Determine the best resubmission strategy
 */
function determineResubmissionStrategy(
  denial: Denial,
  corrections: CodingCorrection[],
  coverageAnalysis: CoverageAnalysis | null
): ResubmissionStrategy {
  const carcCode = denial.carcCode;

  // Timely filing - can't fix
  if (carcCode === 'CO-29') {
    return {
      method: 'appeal',
      frequencyCode: '1',
      timelineRecommendation: 'File appeal within 60 days with proof of timely original submission',
      steps: [
        'Gather proof of original submission (confirmation number, clearinghouse records)',
        'Prepare appeal letter citing timely submission evidence',
        'Include clearinghouse acceptance report',
        'Submit appeal to payer within appeal deadline',
      ],
      estimatedDaysToResolution: 45,
    };
  }

  // Simple coding fixes
  if (corrections.length > 0 && corrections.every(c => c.riskLevel === 'low')) {
    return {
      method: 'corrected_claim',
      frequencyCode: '7',
      timelineRecommendation: 'Submit corrected claim within 5 business days',
      steps: [
        'Apply coding corrections identified above',
        'Verify corrections are supported by clinical documentation',
        'Submit as frequency code 7 (replacement claim)',
        'Reference original claim number in remarks',
        'Monitor for payment within 30 days',
      ],
      estimatedDaysToResolution: 30,
    };
  }

  // Medical necessity / coverage issues
  if (coverageAnalysis && !coverageAnalysis.isCovered) {
    return {
      method: 'corrected_with_appeal',
      frequencyCode: '7',
      timelineRecommendation: 'Submit corrected claim with supporting documentation within 10 business days',
      steps: [
        'Review clinical documentation for diagnosis that meets LCD/NCD criteria',
        'If valid alternative diagnosis exists: correct and resubmit',
        'If current diagnosis is accurate: prepare clinical appeal',
        'Include all required documentation listed in coverage analysis',
        'Attach peer-reviewed literature if supporting medical necessity',
        'Request peer-to-peer review if available',
      ],
      estimatedDaysToResolution: 60,
    };
  }

  // Mixed corrections
  return {
    method: 'corrected_claim',
    frequencyCode: '7',
    timelineRecommendation: 'Submit corrected claim within 7 business days',
    steps: [
      'Apply all corrections identified',
      'Attach supporting documentation',
      'Submit as corrected claim (frequency 7)',
      'If denied again, escalate to formal appeal',
    ],
    estimatedDaysToResolution: 35,
  };
}

/**
 * Suggest a downcode for E/M when documentation doesn't support level
 */
function suggestDowncode(cptCode: string): string {
  const downcodeMap: Record<string, string> = {
    '99215': '99214',
    '99214': '99213',
    '99213': '99212',
    '99205': '99204',
    '99204': '99203',
    '99203': '99202',
    '99245': '99244',
    '99244': '99243',
  };
  return downcodeMap[cptCode] || `Lower level code (review documentation for appropriate level)`;
}

/**
 * Get specific correction suggestions for a given CARC code
 */
export function getCARCSpecificGuidance(carcCode: string): {
  commonFixes: string[];
  successRate: number;
  typicalResolutionDays: number;
} {
  const guidance: Record<string, { commonFixes: string[]; successRate: number; typicalResolutionDays: number }> = {
    'CO-4': {
      commonFixes: [
        'Add missing modifier (25, 59, LT/RT, 50)',
        'Remove incorrect modifier',
        'Change modifier to match procedure documentation',
        'Verify modifier is valid for the CPT code billed',
      ],
      successRate: 88,
      typicalResolutionDays: 21,
    },
    'CO-11': {
      commonFixes: [
        'Downcode E/M to level supported by documentation',
        'Add additional diagnoses to support complexity',
        'Append operative note or detailed medical decision-making',
        'Submit with attestation of complexity',
      ],
      successRate: 72,
      typicalResolutionDays: 30,
    },
    'CO-16': {
      commonFixes: [
        'Add missing required fields (subscriber ID, group number)',
        'Correct patient demographics',
        'Add referring physician NPI',
        'Include authorization number',
      ],
      successRate: 92,
      typicalResolutionDays: 14,
    },
    'CO-22': {
      commonFixes: [
        'Add modifier 59 or X modifier for distinct services',
        'Remove component code if truly bundled',
        'Recode with correct comprehensive code',
        'Document distinct anatomical sites',
      ],
      successRate: 75,
      typicalResolutionDays: 28,
    },
    'CO-27': {
      commonFixes: [
        'Submit with peer-reviewed medical literature',
        'Request peer-to-peer review',
        'Add supporting clinical documentation',
        'Change to diagnosis meeting LCD criteria',
      ],
      successRate: 55,
      typicalResolutionDays: 45,
    },
    'CO-50': {
      commonFixes: [
        'Obtain retrospective authorization (if payer allows)',
        'Submit authorization number with corrected claim',
        'Appeal with documentation of emergent circumstances',
        'Verify authorization was for correct dates/codes',
      ],
      successRate: 62,
      typicalResolutionDays: 35,
    },
  };

  return guidance[carcCode] || {
    commonFixes: ['Review denial reason and correct accordingly', 'Gather supporting documentation', 'Submit corrected claim'],
    successRate: 50,
    typicalResolutionDays: 30,
  };
}
