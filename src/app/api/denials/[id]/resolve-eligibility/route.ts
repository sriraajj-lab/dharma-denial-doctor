import { NextRequest, NextResponse } from 'next/server';
import { getDenialById, updateDenial } from '@/lib/data';
import { resolveEligibilityDenial } from '@/lib/eligibility-resolver';
import { predictResubmissionSuccess } from '@/lib/resubmission-intelligence';
import { createAuditLog } from '@/lib/audit';

/**
 * Eligibility Resolution API
 * Analyzes eligibility-related denials and provides:
 * - COB (Coordination of Benefits) detection
 * - Retroactive eligibility verification workflows
 * - Coverage gap analysis (COBRA, Medicaid, reinstatement)
 * - Patient responsibility assessment with collection routing
 * - Workers comp / auto insurance routing
 * - Financial assistance screening
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const denial = await getDenialById(id);

    if (!denial) {
      return NextResponse.json({ error: 'Denial not found' }, { status: 404 });
    }

    // Run eligibility resolution analysis
    const resolution = resolveEligibilityDenial(denial);

    // Get prediction for the recommended approach
    const correctionType = mapResolutionToCorrection(resolution.resolutionType);
    const prediction = predictResubmissionSuccess(denial, correctionType);

    // Audit log
    createAuditLog({
      denialId: id,
      action: 'correct',
      entityType: 'denial',
      entityId: id,
      metadata: {
        analysisType: 'eligibility_resolution',
        resolutionType: resolution.resolutionType,
        estimatedRecovery: resolution.estimatedRecovery,
        estimatedSuccessRate: resolution.estimatedSuccessRate,
        actionsCount: resolution.recommendedActions.length,
      },
    });

    // Build the response with prioritized next steps
    const response = {
      denialId: id,
      resolution,
      prediction,
      summary: {
        resolutionType: resolution.resolutionType,
        resolutionLabel: formatResolutionType(resolution.resolutionType),
        confidence: resolution.confidence,
        estimatedRecovery: resolution.estimatedRecovery,
        estimatedSuccessRate: resolution.estimatedSuccessRate,
        timelineEstimate: resolution.timelineEstimate,
        totalActions: resolution.recommendedActions.length,
        immediateAction: resolution.recommendedActions[0]?.action || 'Investigate further',
        isPatientResponsibility: resolution.patientResponsibility?.isLegitimatePatientResponsibility || false,
        hasCOBOpportunity: resolution.cobAnalysis?.hasPotentialOtherInsurance || false,
        hasCoverageGapFix: resolution.coverageGapAnalysis?.reinstateEligible || false,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in eligibility resolution:', error);
    return NextResponse.json({ error: 'Failed to resolve eligibility' }, { status: 500 });
  }
}

function mapResolutionToCorrection(resolutionType: string): string {
  const map: Record<string, string> = {
    cob_primary_identified: 'information_addition',
    retro_eligibility: 'information_addition',
    coverage_gap_fixable: 'information_addition',
    wrong_subscriber_info: 'information_addition',
    plan_change_mid_service: 'information_addition',
    patient_responsibility: 'write_off',
    financial_assistance: 'write_off',
    medicaid_eligible: 'information_addition',
    workers_comp_auto: 'information_addition',
    needs_investigation: 'review_required',
  };
  return map[resolutionType] || 'review_required';
}

function formatResolutionType(type: string): string {
  const labels: Record<string, string> = {
    cob_primary_identified: 'Alternate Primary Payer Identified',
    retro_eligibility: 'Retroactive Eligibility Available',
    coverage_gap_fixable: 'Coverage Gap - Reinstatement Possible',
    wrong_subscriber_info: 'Incorrect Subscriber Information',
    plan_change_mid_service: 'Plan Changed During Service Period',
    patient_responsibility: 'Confirmed Patient Responsibility',
    financial_assistance: 'Financial Assistance Eligible',
    medicaid_eligible: 'Potential Medicaid Eligibility',
    workers_comp_auto: 'Workers Comp / Auto Insurance',
    needs_investigation: 'Requires Further Investigation',
  };
  return labels[type] || type;
}
