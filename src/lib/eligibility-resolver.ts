/**
 * Eligibility Resolution Workflow
 * Handles insurance eligibility denials with:
 * - Coordination of Benefits (COB) detection
 * - Retroactive eligibility verification
 * - Coverage gap identification
 * - Patient responsibility routing
 * - Alternate payer identification
 * - Self-pay/financial assistance pathways
 */

import { Denial } from './types';

// ─── TYPES ──────────────────────────────────────────────────────────────────

export interface EligibilityResolution {
  resolutionType: EligibilityResolutionType;
  confidence: number;
  findings: EligibilityFinding[];
  recommendedActions: EligibilityAction[];
  cobAnalysis: COBAnalysis | null;
  coverageGapAnalysis: CoverageGapAnalysis | null;
  patientResponsibility: PatientResponsibilityAssessment | null;
  estimatedRecovery: number;
  estimatedSuccessRate: number;
  timelineEstimate: string;
}

export type EligibilityResolutionType =
  | 'cob_primary_identified'    // Another payer should be primary
  | 'retro_eligibility'         // Patient gained retroactive coverage
  | 'coverage_gap_fixable'      // Coverage lapsed but can be reinstated
  | 'wrong_subscriber_info'     // Incorrect member ID, group, etc.
  | 'plan_change_mid_service'   // Patient changed plans around DOS
  | 'patient_responsibility'    // Legitimately patient's obligation
  | 'financial_assistance'      // Qualifies for charity/assistance
  | 'medicaid_eligible'         // May qualify for Medicaid retroactive
  | 'workers_comp_auto'         // Should be billed to WC or auto insurance
  | 'needs_investigation';      // Requires manual investigation

export interface EligibilityFinding {
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  evidence: string;
}

export interface EligibilityAction {
  priority: number;
  action: string;
  responsible: 'billing_staff' | 'patient' | 'provider' | 'payer';
  deadline?: string;
  details: string;
  expectedOutcome: string;
  contactInfo?: string;
}

export interface COBAnalysis {
  hasPotentialOtherInsurance: boolean;
  suspectedPrimaryPayer?: string;
  cobReason: string;
  birthdayRule?: boolean;
  genderRule?: boolean;
  employmentStatus?: string;
  medicareMSPType?: string;
  verificationSteps: string[];
}

export interface CoverageGapAnalysis {
  gapType: 'lapsed' | 'terminated' | 'not_yet_effective' | 'cobra_eligible' | 'open_enrollment';
  gapStart?: string;
  gapEnd?: string;
  dosWithinGap: boolean;
  reinstateEligible: boolean;
  reinstateDeadline?: string;
  reinstateProcess: string;
}

export interface PatientResponsibilityAssessment {
  isLegitimatePatientResponsibility: boolean;
  responsibilityType: 'deductible' | 'copay' | 'coinsurance' | 'non_covered' | 'out_of_network' | 'out_of_pocket_max';
  estimatedPatientOwes: number;
  financialAssistanceEligible: boolean;
  paymentPlanRecommended: boolean;
  collectionActions: string[];
}

// ─── COMMON PAYER ELIGIBILITY PATTERNS ──────────────────────────────────────

interface PayerEligibilityPattern {
  payerName: string;
  retroEligibilityDays: number;      // How far back they allow retro verification
  cobVerificationMethod: string;
  memberIdFormat: RegExp;
  commonIssues: string[];
  eligibilityPortal?: string;
  eligibilityPhone?: string;
}

const PAYER_ELIGIBILITY_PATTERNS: PayerEligibilityPattern[] = [
  {
    payerName: 'Medicare',
    retroEligibilityDays: 365,
    cobVerificationMethod: 'MSPQ (Medicare Secondary Payer Questionnaire)',
    memberIdFormat: /^[A-Z0-9]{11}$/,
    commonIssues: [
      'Medicare as secondary when should be primary (age 65+)',
      'Working aged with employer group health plan',
      'ESRD coordination period (30 months)',
      'Disability with large group health plan',
    ],
    eligibilityPortal: 'https://www.cms.gov/medicare/eligibility',
    eligibilityPhone: '1-800-633-4227',
  },
  {
    payerName: 'Medicaid',
    retroEligibilityDays: 90,
    cobVerificationMethod: 'State Medicaid portal verification',
    memberIdFormat: /^[A-Z0-9]{8,12}$/,
    commonIssues: [
      'Retroactive eligibility (up to 3 months prior)',
      'Spend-down not met',
      'Managed care plan assignment change',
      'Third party liability (TPL) exists',
    ],
    eligibilityPhone: 'State-specific',
  },
  {
    payerName: 'UnitedHealthcare',
    retroEligibilityDays: 180,
    cobVerificationMethod: 'Availity or UHC Provider Portal',
    memberIdFormat: /^[A-Z0-9]{9,11}$/,
    commonIssues: [
      'Member ID transposed digits',
      'Plan changed from PPO to HMO mid-year',
      'Subscriber vs dependent ID confusion',
      'Dental plan submitted to medical',
    ],
    eligibilityPortal: 'https://www.uhcprovider.com',
    eligibilityPhone: '1-877-842-3210',
  },
  {
    payerName: 'Blue Cross Blue Shield',
    retroEligibilityDays: 365,
    cobVerificationMethod: 'Availity or state BCBS portal',
    memberIdFormat: /^[A-Z]{3}[0-9]{9}$/,
    commonIssues: [
      'Wrong BCBS plan (state/regional plan confusion)',
      'Federal Employee Program (FEP) vs local plan',
      'Prefix routing errors',
      'Out-of-area coverage not verified',
    ],
    eligibilityPortal: 'https://www.availity.com',
    eligibilityPhone: '1-800-262-2583',
  },
  {
    payerName: 'Aetna',
    retroEligibilityDays: 180,
    cobVerificationMethod: 'Availity or Aetna provider portal',
    memberIdFormat: /^[A-Z0-9]{8,12}$/,
    commonIssues: [
      'Student dependent aged out (26)',
      'COBRA election period confusion',
      'Behavioral health carved out to separate plan',
    ],
    eligibilityPortal: 'https://www.availity.com',
    eligibilityPhone: '1-800-624-0756',
  },
  {
    payerName: 'Cigna',
    retroEligibilityDays: 180,
    cobVerificationMethod: 'Cigna for HCP portal',
    memberIdFormat: /^[A-Z0-9]{8,11}$/,
    commonIssues: [
      'Network tier confusion (local vs national)',
      'Pharmacy benefits separate from medical',
      'Vision/dental submitted to medical plan',
    ],
    eligibilityPortal: 'https://www.cignaforhcp.com',
    eligibilityPhone: '1-800-244-6224',
  },
];



// ─── MAIN RESOLUTION FUNCTION ───────────────────────────────────────────────

/**
 * Analyze an eligibility denial and generate a resolution workflow
 */
export function resolveEligibilityDenial(denial: Denial): EligibilityResolution {
  const findings = identifyEligibilityIssues(denial);
  const cobAnalysis = analyzeCOB(denial);
  const coverageGapAnalysis = analyzeCoverageGap(denial);
  const patientResponsibility = assessPatientResponsibility(denial);

  // Determine resolution type based on findings
  const resolutionType = determineResolutionType(denial, findings, cobAnalysis, coverageGapAnalysis);

  // Generate recommended actions
  const recommendedActions = generateResolutionActions(denial, resolutionType, cobAnalysis, coverageGapAnalysis, patientResponsibility);

  // Estimate recovery
  const { recovery, successRate, timeline } = estimateRecovery(resolutionType, denial.deniedAmount);

  return {
    resolutionType,
    confidence: calculateConfidence(findings, resolutionType),
    findings,
    recommendedActions,
    cobAnalysis,
    coverageGapAnalysis,
    patientResponsibility,
    estimatedRecovery: recovery,
    estimatedSuccessRate: successRate,
    timelineEstimate: timeline,
  };
}

/**
 * Identify specific eligibility issues from the denial data
 */
function identifyEligibilityIssues(denial: Denial): EligibilityFinding[] {
  const findings: EligibilityFinding[] = [];
  const carcCode = denial.carcCode;

  // PR-1: Deductible
  if (carcCode === 'PR-1') {
    findings.push({
      type: 'deductible',
      severity: 'medium',
      description: 'Patient has not met annual deductible',
      evidence: `Denied amount $${denial.deniedAmount} applied to deductible`,
    });

    // Check if amount seems wrong (e.g., entire charge applied)
    if (denial.deniedAmount === denial.billedAmount) {
      findings.push({
        type: 'potential_deductible_error',
        severity: 'high',
        description: 'Entire billed amount applied to deductible - verify patient benefits',
        evidence: 'Full charge denial suggests possible eligibility issue rather than simple deductible',
      });
    }
  }

  // CO-109: Not covered under plan
  if (carcCode === 'CO-109') {
    findings.push({
      type: 'coverage_terminated',
      severity: 'critical',
      description: 'Patient not covered under this plan on date of service',
      evidence: `DOS: ${denial.dateOfService}, Denial Date: ${denial.denialDate}`,
    });

    // Check for potential COB
    findings.push({
      type: 'potential_cob',
      severity: 'high',
      description: 'Patient may have alternate coverage that should be billed',
      evidence: 'Coverage denial suggests need to verify all available insurance',
    });
  }

  // PR-2: Coinsurance
  if (carcCode === 'PR-2') {
    findings.push({
      type: 'coinsurance',
      severity: 'low',
      description: 'Patient coinsurance responsibility',
      evidence: `Coinsurance amount: $${denial.deniedAmount}`,
    });
  }

  // PR-3: Copay
  if (carcCode === 'PR-3') {
    findings.push({
      type: 'copay',
      severity: 'low',
      description: 'Patient copay responsibility',
      evidence: `Copay amount: $${denial.deniedAmount}`,
    });
  }

  // CO-197 / CO-50: Auth/eligibility hybrid
  if (['CO-197', 'CO-50'].includes(carcCode)) {
    findings.push({
      type: 'auth_eligibility_hybrid',
      severity: 'high',
      description: 'Authorization denial may mask eligibility issue',
      evidence: 'Verify patient was eligible on DOS before pursuing auth correction',
    });
  }

  // Check for suspicious patterns
  const dos = new Date(denial.dateOfService);
  const denialDate = new Date(denial.denialDate);
  const daysBetween = Math.ceil((denialDate.getTime() - dos.getTime()) / (1000 * 60 * 60 * 24));

  if (daysBetween > 90) {
    findings.push({
      type: 'delayed_denial',
      severity: 'medium',
      description: `Denial received ${daysBetween} days after DOS - possible retroactive termination`,
      evidence: 'Long delay between service and denial suggests retroactive coverage change',
    });
  }

  return findings;
}

/**
 * Analyze potential Coordination of Benefits issues
 */
function analyzeCOB(denial: Denial): COBAnalysis {
  const carcCode = denial.carcCode;
  const payerName = denial.payerName.toLowerCase();

  // Detect potential COB scenarios
  let hasPotentialOtherInsurance = false;
  let suspectedPrimaryPayer: string | undefined;
  let cobReason = '';
  const verificationSteps: string[] = [];

  // If Medicare denied, check if commercial should be primary
  if (payerName.includes('medicare')) {
    hasPotentialOtherInsurance = true;
    cobReason = 'Medicare may be secondary if patient has active employer group health plan (EGHP)';
    suspectedPrimaryPayer = 'Employer Group Health Plan';
    verificationSteps.push(
      'Verify patient employment status on date of service',
      'Check if employer has 20+ employees (Medicare Secondary Payer rules)',
      'Complete Medicare Secondary Payer Questionnaire (MSPQ)',
      'If employer coverage exists, bill employer plan as primary',
      'Resubmit to Medicare as secondary with primary EOB',
    );
  }

  // If commercial denied for eligibility, check for Medicare/Medicaid
  if (!payerName.includes('medicare') && !payerName.includes('medicaid')) {
    if (carcCode === 'CO-109') {
      hasPotentialOtherInsurance = true;
      cobReason = 'Patient coverage terminated - check for COBRA, spouse coverage, Medicare, or Medicaid eligibility';
      verificationSteps.push(
        'Contact patient to verify current insurance coverage',
        'Check if patient is Medicare-eligible (age 65+ or disability)',
        'Check state Medicaid eligibility (retroactive up to 3 months)',
        'Verify if COBRA was elected (retroactive election period: 60 days)',
        'Check for spouse/domestic partner coverage',
        'Verify workers comp or auto insurance if injury-related',
      );
    }
  }

  // General COB verification for any denial
  if (!hasPotentialOtherInsurance && ['PR-1', 'CO-109'].includes(carcCode)) {
    verificationSteps.push(
      'Run eligibility verification for date of service',
      'Check patient registration for secondary insurance on file',
      'Verify subscriber vs dependent relationship',
      'Confirm correct member ID and group number',
    );
  }

  return {
    hasPotentialOtherInsurance,
    suspectedPrimaryPayer,
    cobReason: cobReason || 'No obvious COB issue detected, but standard verification recommended',
    verificationSteps: verificationSteps.length > 0 ? verificationSteps : [
      'Verify patient eligibility for DOS via payer portal',
      'Confirm member ID and group number',
      'Check for any other insurance on file',
    ],
  };
}

/**
 * Analyze potential coverage gaps
 */
function analyzeCoverageGap(denial: Denial): CoverageGapAnalysis | null {
  const carcCode = denial.carcCode;

  // Only relevant for coverage-related denials
  if (!['CO-109', 'CO-198', 'CO-199'].includes(carcCode)) {
    return null;
  }

  const dos = new Date(denial.dateOfService);
  const now = new Date();

  // Determine gap type based on timing
  let gapType: CoverageGapAnalysis['gapType'] = 'terminated';
  let reinstateEligible = false;
  let reinstateProcess = '';

  // Check COBRA eligibility (60-day election period from qualifying event)
  const daysSinceDOS = Math.ceil((now.getTime() - dos.getTime()) / (1000 * 60 * 60 * 24));

  if (daysSinceDOS <= 60) {
    gapType = 'cobra_eligible';
    reinstateEligible = true;
    reinstateProcess = 'Patient may elect COBRA within 60 days of qualifying event. Coverage is retroactive to termination date. Contact former employer HR or COBRA administrator.';
  } else if (daysSinceDOS <= 90) {
    gapType = 'lapsed';
    reinstateEligible = true;
    reinstateProcess = 'Some plans allow reinstatement within 90 days. Contact payer member services. Also check state Medicaid (retroactive 3 months).';
  } else {
    gapType = 'terminated';
    reinstateEligible = false;
    reinstateProcess = 'Coverage gap exceeds typical reinstatement windows. Check Medicaid retroactive eligibility or financial assistance programs.';
  }

  return {
    gapType,
    gapStart: denial.dateOfService,
    dosWithinGap: true,
    reinstateEligible,
    reinstateDeadline: reinstateEligible ? calculateDeadline(dos, gapType === 'cobra_eligible' ? 60 : 90) : undefined,
    reinstateProcess,
  };
}

/**
 * Assess patient financial responsibility
 */
function assessPatientResponsibility(denial: Denial): PatientResponsibilityAssessment {
  const carcCode = denial.carcCode;
  let responsibilityType: PatientResponsibilityAssessment['responsibilityType'] = 'non_covered';
  let isLegitimate = false;
  let financialAssistanceEligible = false;
  let paymentPlanRecommended = false;

  switch (carcCode) {
    case 'PR-1':
      responsibilityType = 'deductible';
      isLegitimate = true;
      paymentPlanRecommended = denial.deniedAmount > 500;
      break;
    case 'PR-2':
      responsibilityType = 'coinsurance';
      isLegitimate = true;
      paymentPlanRecommended = denial.deniedAmount > 200;
      break;
    case 'PR-3':
      responsibilityType = 'copay';
      isLegitimate = true;
      break;
    case 'CO-109':
      responsibilityType = 'non_covered';
      isLegitimate = false; // Need to verify first
      financialAssistanceEligible = denial.deniedAmount > 1000;
      paymentPlanRecommended = true;
      break;
    default:
      responsibilityType = 'non_covered';
      isLegitimate = false;
  }

  // Financial assistance threshold
  if (denial.deniedAmount > 2000) {
    financialAssistanceEligible = true;
  }

  const collectionActions: string[] = [];
  if (isLegitimate) {
    collectionActions.push('Send patient statement with itemized charges');
    if (paymentPlanRecommended) {
      collectionActions.push('Offer payment plan (3-12 months interest-free)');
    }
    collectionActions.push('Follow up at 30, 60, 90 days');
    if (denial.deniedAmount > 500) {
      collectionActions.push('If no response after 90 days, consider collections agency');
    }
  }

  return {
    isLegitimatePatientResponsibility: isLegitimate,
    responsibilityType,
    estimatedPatientOwes: isLegitimate ? denial.deniedAmount : 0,
    financialAssistanceEligible,
    paymentPlanRecommended,
    collectionActions,
  };
}



/**
 * Determine the primary resolution type
 */
function determineResolutionType(
  denial: Denial,
  findings: EligibilityFinding[],
  cobAnalysis: COBAnalysis,
  coverageGapAnalysis: CoverageGapAnalysis | null,
): EligibilityResolutionType {
  const carcCode = denial.carcCode;

  // Workers comp / auto accident indicators
  if (denial.diagnosisCode.startsWith('S') || denial.diagnosisCode.startsWith('T')) {
    return 'workers_comp_auto';
  }

  // COB detected
  if (cobAnalysis.hasPotentialOtherInsurance) {
    return 'cob_primary_identified';
  }

  // Coverage gap that can be fixed
  if (coverageGapAnalysis?.reinstateEligible) {
    return 'coverage_gap_fixable';
  }

  // Retroactive Medicaid
  if (carcCode === 'CO-109') {
    const dos = new Date(denial.dateOfService);
    const now = new Date();
    const daysSince = Math.ceil((now.getTime() - dos.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince <= 90) {
      return 'medicaid_eligible';
    }
  }

  // Likely wrong subscriber info
  if (carcCode === 'CO-109' && findings.some(f => f.type === 'potential_deductible_error')) {
    return 'wrong_subscriber_info';
  }

  // Deductible/copay/coinsurance - legitimate patient responsibility
  if (['PR-1', 'PR-2', 'PR-3'].includes(carcCode)) {
    return 'patient_responsibility';
  }

  // High dollar - check financial assistance
  if (denial.deniedAmount > 5000 && carcCode === 'CO-109') {
    return 'financial_assistance';
  }

  return 'needs_investigation';
}

/**
 * Generate specific resolution actions based on analysis
 */
function generateResolutionActions(
  denial: Denial,
  resolutionType: EligibilityResolutionType,
  cobAnalysis: COBAnalysis,
  coverageGapAnalysis: CoverageGapAnalysis | null,
  patientResp: PatientResponsibilityAssessment,
): EligibilityAction[] {
  const actions: EligibilityAction[] = [];

  switch (resolutionType) {
    case 'cob_primary_identified':
      actions.push({
        priority: 1,
        action: 'Verify alternate insurance coverage',
        responsible: 'billing_staff',
        details: cobAnalysis.cobReason,
        expectedOutcome: 'Identify primary payer for claim resubmission',
        deadline: '5 business days',
      });
      actions.push({
        priority: 2,
        action: 'Contact patient for insurance verification',
        responsible: 'billing_staff',
        details: 'Call patient to obtain current insurance information. Check for employer coverage, spouse coverage, or government programs.',
        expectedOutcome: 'Obtain correct primary insurance details',
        contactInfo: 'Patient phone on file',
      });
      actions.push({
        priority: 3,
        action: 'Resubmit to correct primary payer',
        responsible: 'billing_staff',
        details: 'Once primary payer identified, submit claim to primary. After primary processes, submit to secondary with primary EOB.',
        expectedOutcome: `Recovery of up to $${denial.deniedAmount.toFixed(2)}`,
      });
      break;

    case 'retro_eligibility':
    case 'coverage_gap_fixable':
      actions.push({
        priority: 1,
        action: 'Verify COBRA election or reinstatement eligibility',
        responsible: 'billing_staff',
        details: coverageGapAnalysis?.reinstateProcess || 'Contact payer to verify reinstatement options',
        expectedOutcome: 'Determine if coverage can be reinstated retroactively',
        deadline: coverageGapAnalysis?.reinstateDeadline || '10 business days',
      });
      actions.push({
        priority: 2,
        action: 'Contact patient about coverage reinstatement',
        responsible: 'patient',
        details: 'Patient needs to contact former employer or payer to elect COBRA or reinstate coverage. Provide patient with necessary forms and deadlines.',
        expectedOutcome: 'Patient reinstates coverage for date of service',
      });
      actions.push({
        priority: 3,
        action: 'Resubmit claim once coverage confirmed',
        responsible: 'billing_staff',
        details: 'After coverage reinstated, resubmit claim with updated eligibility information.',
        expectedOutcome: `Full recovery of $${denial.deniedAmount.toFixed(2)}`,
      });
      break;

    case 'wrong_subscriber_info':
      actions.push({
        priority: 1,
        action: 'Verify correct subscriber information',
        responsible: 'billing_staff',
        details: 'Run real-time eligibility check. Verify: Member ID, Group Number, Subscriber Name/DOB, Relationship to subscriber.',
        expectedOutcome: 'Correct subscriber information obtained',
        deadline: '3 business days',
      });
      actions.push({
        priority: 2,
        action: 'Correct demographics and resubmit',
        responsible: 'billing_staff',
        details: 'Update patient registration with correct info. Resubmit as corrected claim (frequency 7) with correct subscriber details.',
        expectedOutcome: `Full recovery of $${denial.deniedAmount.toFixed(2)}`,
      });
      break;

    case 'patient_responsibility':
      actions.push({
        priority: 1,
        action: 'Verify benefits and accumulator status',
        responsible: 'billing_staff',
        details: 'Confirm deductible/OOP amounts with payer. Verify patient has not already met deductible with other claims.',
        expectedOutcome: 'Confirm patient responsibility is accurate',
        deadline: '5 business days',
      });
      if (patientResp.estimatedPatientOwes > 0) {
        actions.push({
          priority: 2,
          action: 'Generate patient statement',
          responsible: 'billing_staff',
          details: `Send itemized patient statement for $${patientResp.estimatedPatientOwes.toFixed(2)}. ${patientResp.paymentPlanRecommended ? 'Include payment plan options.' : ''}`,
          expectedOutcome: 'Patient payment received',
        });
      }
      if (patientResp.financialAssistanceEligible) {
        actions.push({
          priority: 3,
          action: 'Offer financial assistance application',
          responsible: 'billing_staff',
          details: 'Patient may qualify for charity care or sliding scale. Provide financial assistance application.',
          expectedOutcome: 'Reduced patient liability or write-off to charity',
        });
      }
      break;

    case 'medicaid_eligible':
      actions.push({
        priority: 1,
        action: 'Screen patient for Medicaid eligibility',
        responsible: 'billing_staff',
        details: 'Check state Medicaid income guidelines. Medicaid can be retroactive up to 3 months prior to application date.',
        expectedOutcome: 'Determine if patient qualifies for retroactive Medicaid',
        deadline: '10 business days',
      });
      actions.push({
        priority: 2,
        action: 'Assist patient with Medicaid application',
        responsible: 'patient',
        details: 'If eligible, help patient apply for Medicaid. Provide application forms and required documentation list.',
        expectedOutcome: 'Retroactive Medicaid coverage obtained',
      });
      actions.push({
        priority: 3,
        action: 'Submit claim to Medicaid once approved',
        responsible: 'billing_staff',
        details: 'After Medicaid approval, submit claim with Medicaid ID. Note: Medicaid rates may be lower than commercial.',
        expectedOutcome: `Partial to full recovery (Medicaid rate)`,
      });
      break;

    case 'workers_comp_auto':
      actions.push({
        priority: 1,
        action: 'Verify if injury is work-related or auto accident',
        responsible: 'billing_staff',
        details: 'Diagnosis codes suggest injury. Check if this should be billed to Workers Compensation or Auto/PIP insurance instead.',
        expectedOutcome: 'Identify correct liability payer',
        deadline: '5 business days',
      });
      actions.push({
        priority: 2,
        action: 'Obtain WC claim number or auto policy info',
        responsible: 'billing_staff',
        details: 'Contact patient or employer to get WC claim number, adjuster info, or auto insurance policy details.',
        expectedOutcome: 'Correct billing information obtained',
      });
      actions.push({
        priority: 3,
        action: 'Resubmit to liability carrier',
        responsible: 'billing_staff',
        details: 'Submit claim to Workers Comp carrier or Auto/PIP insurance. These typically pay at full billed charges.',
        expectedOutcome: `Full recovery of $${denial.billedAmount.toFixed(2)} (billed charges)`,
      });
      break;

    case 'financial_assistance':
      actions.push({
        priority: 1,
        action: 'Exhaust all insurance options first',
        responsible: 'billing_staff',
        details: 'Before writing off, verify: Medicaid eligibility, COBRA, marketplace plans, other coverage.',
        expectedOutcome: 'Confirm no insurance options remain',
        deadline: '15 business days',
      });
      actions.push({
        priority: 2,
        action: 'Apply financial assistance policy',
        responsible: 'billing_staff',
        details: 'If uninsured and qualifies under facility charity care policy (typically <400% FPL), apply discount or write-off.',
        expectedOutcome: 'Reduced balance or full charity write-off',
      });
      break;

    default: // needs_investigation
      actions.push({
        priority: 1,
        action: 'Run real-time eligibility verification',
        responsible: 'billing_staff',
        details: `Run 270/271 eligibility inquiry for patient on DOS ${denial.dateOfService}. Check payer portal directly.`,
        expectedOutcome: 'Determine actual eligibility status',
        deadline: '3 business days',
      });
      actions.push({
        priority: 2,
        action: 'Contact payer for clarification',
        responsible: 'billing_staff',
        details: 'Call payer provider services to understand specific denial reason. Document call reference number.',
        expectedOutcome: 'Clear understanding of denial reason and correction path',
        contactInfo: getPayerPhone(denial.payerName),
      });
      break;
  }

  return actions;
}

// ─── HELPER FUNCTIONS ───────────────────────────────────────────────────────

function calculateConfidence(findings: EligibilityFinding[], resolutionType: EligibilityResolutionType): number {
  const baseConfidence: Record<string, number> = {
    cob_primary_identified: 0.7,
    retro_eligibility: 0.6,
    coverage_gap_fixable: 0.65,
    wrong_subscriber_info: 0.85,
    plan_change_mid_service: 0.6,
    patient_responsibility: 0.9,
    financial_assistance: 0.75,
    medicaid_eligible: 0.5,
    workers_comp_auto: 0.7,
    needs_investigation: 0.3,
  };

  let confidence = baseConfidence[resolutionType] || 0.5;

  // Boost confidence with more findings
  if (findings.length >= 3) confidence += 0.1;
  if (findings.some(f => f.severity === 'critical')) confidence -= 0.1;

  return Math.max(0.1, Math.min(0.95, confidence));
}

function estimateRecovery(resolutionType: EligibilityResolutionType, deniedAmount: number): {
  recovery: number;
  successRate: number;
  timeline: string;
} {
  const estimates: Record<string, { recoveryPct: number; successRate: number; days: string }> = {
    cob_primary_identified: { recoveryPct: 0.9, successRate: 75, days: '30-45 days' },
    retro_eligibility: { recoveryPct: 0.95, successRate: 60, days: '45-60 days' },
    coverage_gap_fixable: { recoveryPct: 0.9, successRate: 55, days: '30-60 days' },
    wrong_subscriber_info: { recoveryPct: 1.0, successRate: 92, days: '14-21 days' },
    plan_change_mid_service: { recoveryPct: 0.85, successRate: 65, days: '30-45 days' },
    patient_responsibility: { recoveryPct: 0.6, successRate: 45, days: '30-90 days' },
    financial_assistance: { recoveryPct: 0.2, successRate: 80, days: '15-30 days' },
    medicaid_eligible: { recoveryPct: 0.7, successRate: 40, days: '60-90 days' },
    workers_comp_auto: { recoveryPct: 1.0, successRate: 70, days: '30-60 days' },
    needs_investigation: { recoveryPct: 0.5, successRate: 35, days: '30-60 days' },
  };

  const est = estimates[resolutionType] || { recoveryPct: 0.5, successRate: 30, days: '30-60 days' };
  return {
    recovery: deniedAmount * est.recoveryPct,
    successRate: est.successRate,
    timeline: est.days,
  };
}

function calculateDeadline(fromDate: Date, days: number): string {
  const deadline = new Date(fromDate);
  deadline.setDate(deadline.getDate() + days);
  return deadline.toISOString().split('T')[0];
}

function getPayerPhone(payerName: string): string {
  const pattern = PAYER_ELIGIBILITY_PATTERNS.find(p =>
    payerName.toLowerCase().includes(p.payerName.toLowerCase())
  );
  return pattern?.eligibilityPhone || 'See payer website for provider services number';
}
