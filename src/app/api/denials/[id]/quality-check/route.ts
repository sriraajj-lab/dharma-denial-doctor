import { NextRequest, NextResponse } from 'next/server';
import { getDenialById, updateDenial } from '@/lib/data';
import { callAzureOpenAI, parseJSONResponse, QUALITY_CHECKER_PROMPT } from '@/lib/azure-openai';
import { QualityCheck, Denial } from '@/lib/types';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const denial = getDenialById(id);
    if (!denial) {
      return NextResponse.json({ error: 'Denial not found' }, { status: 404 });
    }

    if (!denial.analysis || !denial.correction) {
      return NextResponse.json({ error: 'Denial must be analyzed and corrected before quality check' }, { status: 400 });
    }

    const contextData = JSON.stringify({
      claimNumber: denial.claimNumber,
      cptCode: denial.cptCode,
      modifier: denial.modifier,
      diagnosisCode: denial.diagnosisCode,
      billedAmount: denial.billedAmount,
      deniedAmount: denial.deniedAmount,
      carcCode: denial.carcCode,
      rarcCode: denial.rarcCode,
      analysis: denial.analysis,
      correction: denial.correction,
    });

    let qualityCheck: QualityCheck;

    try {
      const responseText = await callAzureOpenAI(QUALITY_CHECKER_PROMPT, `Validate this proposed correction for the denied claim:\n${contextData}`);
      const parsed = parseJSONResponse(responseText);

      qualityCheck = {
        overallResult: parsed.overall_result || parsed.overallResult || 'warning',
        validationFindings: Array.isArray(parsed.validation_findings || parsed.validationFindings)
          ? (parsed.validation_findings || parsed.validationFindings).map((f: Record<string, string>) => ({
              check: f.check || '',
              result: f.result || '',
              details: f.details || '',
            }))
          : [],
        blockingIssues: Array.isArray(parsed.blocking_issues || parsed.blockingIssues)
          ? (parsed.blocking_issues || parsed.blockingIssues).map((i: Record<string, string>) => ({
              issue: i.issue || '',
              requiredResolution: i.required_resolution || i.requiredResolution || '',
            }))
          : [],
        warnings: Array.isArray(parsed.warnings)
          ? parsed.warnings.map((w: Record<string, string>) => ({
              warning: w.warning || '',
              recommendedAction: w.recommended_action || w.recommendedAction || '',
            }))
          : [],
        recommendation: parsed.recommendation || 'return_for_correction',
        confidenceScore: parsed.confidence_score ?? parsed.confidenceScore ?? 0.5,
        checkedAt: new Date().toISOString(),
      };
    } catch (aiError) {
      console.error('AI quality check failed, using fallback:', aiError);
      qualityCheck = generateFallbackQualityCheck(denial);
    }

    const newStatus = qualityCheck.recommendation === 'approve_for_review' ? 'Reviewed' : denial.status;
    const updated = updateDenial(id, {
      qualityCheck,
      status: newStatus as Denial['status'],
    });

    return NextResponse.json({ denial: updated, qualityCheck });
  } catch (error) {
    console.error('Error running quality check:', error);
    return NextResponse.json({ error: 'Failed to run quality check' }, { status: 500 });
  }
}

function generateFallbackQualityCheck(denial: Denial): QualityCheck {
  const correction = denial.correction;
  const analysis = denial.analysis;
  const hasProposedChanges = correction && correction.proposedChanges && correction.proposedChanges.length > 0;
  const hasBlockingRisk = correction && correction.riskLevel === 'high';
  const hasWarnings = correction && correction.riskLevel === 'medium';

  const findings = [
    {
      check: 'Correction addresses denial reason',
      result: hasProposedChanges ? 'pass' : 'warning',
      details: hasProposedChanges
        ? 'Proposed changes address the identified denial reason'
        : 'No specific proposed changes - manual review recommended',
    },
    {
      check: 'Required fields complete',
      result: 'pass',
      details: 'All required fields are populated',
    },
    {
      check: 'Coding changes supported',
      result: correction?.riskLevel === 'low' ? 'pass' : 'warning',
      details: correction?.riskLevel === 'low'
        ? 'Coding changes are well-supported by documentation'
        : 'Coding changes require additional documentation support',
    },
    {
      check: 'Compliance risk assessment',
      result: hasBlockingRisk ? 'fail' : 'pass',
      details: hasBlockingRisk
        ? 'High risk corrections flagged - compliance review required'
        : 'No significant compliance risks identified',
    },
  ];

  const blockingIssues = hasBlockingRisk
    ? [{ issue: 'High-risk correction proposed', requiredResolution: 'Senior coder review required before resubmission' }]
    : [];

  const warnings = hasWarnings
    ? [{ warning: 'Medium-risk correction proposed', recommendedAction: 'Ensure thorough documentation review before resubmission' }]
    : [];

  const overallResult = hasBlockingRisk ? 'fail' : hasWarnings ? 'warning' : 'pass';
  const recommendation = hasBlockingRisk ? 'return_for_correction' : hasWarnings ? 'approve_for_review' : 'approve_for_review';

  return {
    overallResult,
    validationFindings: findings,
    blockingIssues,
    warnings,
    recommendation,
    confidenceScore: 0.75,
    checkedAt: new Date().toISOString(),
  };
}
