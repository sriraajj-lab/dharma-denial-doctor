import { NextRequest, NextResponse } from 'next/server';
import { getDenialById, updateDenial } from '@/lib/data';
import { analyzeAndCorrectCoding, getCARCSpecificGuidance } from '@/lib/coding-intelligence';
import { predictResubmissionSuccess } from '@/lib/resubmission-intelligence';
import { createAuditLog } from '@/lib/audit';

/**
 * Smart Coding Correction API
 * Performs intelligent coding analysis using:
 * - NCCI edit pair validation
 * - Modifier requirement checking
 * - CPT-ICD crosswalk (medical necessity)
 * - LCD/NCD coverage criteria
 * - Historical resubmission success prediction
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

    // Run smart coding analysis
    const codingResult = analyzeAndCorrectCoding(denial);

    // Get CARC-specific guidance
    const carcGuidance = getCARCSpecificGuidance(denial.carcCode);

    // Predict success if we apply the suggested corrections
    const primaryCorrectionType = codingResult.corrections.length > 0
      ? codingResult.corrections[0].type
      : 'review_required';
    const prediction = predictResubmissionSuccess(denial, primaryCorrectionType);

    // Audit log
    createAuditLog({
      denialId: id,
      action: 'correct',
      entityType: 'denial',
      entityId: id,
      metadata: {
        analysisType: 'smart_coding_correction',
        overallAssessment: codingResult.overallAssessment,
        correctionsCount: codingResult.corrections.length,
        predictedSuccess: prediction.predictedSuccessRate,
      },
    });

    // Update denial with smart correction data if correctable
    if (codingResult.overallAssessment === 'correctable' || codingResult.overallAssessment === 'partially_correctable') {
      await updateDenial(id, {
        status: 'Corrected',
      });
    }

    return NextResponse.json({
      denialId: id,
      codingAnalysis: codingResult,
      carcGuidance,
      prediction,
      summary: {
        assessment: codingResult.overallAssessment,
        totalCorrections: codingResult.corrections.length,
        estimatedSuccessRate: codingResult.estimatedSuccessRate,
        predictedSuccessRate: prediction.predictedSuccessRate,
        recommendation: prediction.recommendation,
        resubmissionMethod: codingResult.resubmissionStrategy.method,
        estimatedDaysToResolution: codingResult.resubmissionStrategy.estimatedDaysToResolution,
        steps: codingResult.resubmissionStrategy.steps,
      },
    });
  } catch (error) {
    console.error('Error in smart correction:', error);
    return NextResponse.json({ error: 'Failed to perform smart coding correction' }, { status: 500 });
  }
}
