import { NextRequest, NextResponse } from 'next/server';
import { getDenialById, updateDenial } from '@/lib/data';
import { callAzureOpenAI, parseJSONResponse, DENIAL_ANALYSIS_PROMPT } from '@/lib/azure-openai';
import { DenialAnalysis } from '@/lib/types';

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

    const claimData = JSON.stringify({
      claimNumber: denial.claimNumber,
      patientName: denial.patientName,
      payerName: denial.payerName,
      dateOfService: denial.dateOfService,
      cptCode: denial.cptCode,
      modifier: denial.modifier,
      diagnosisCode: denial.diagnosisCode,
      billedAmount: denial.billedAmount,
      deniedAmount: denial.deniedAmount,
      carcCode: denial.carcCode,
      rarcCode: denial.rarcCode,
      adjustmentGroupCode: denial.adjustmentGroupCode,
      denialCategory: denial.denialCategory,
    });

    let analysis: DenialAnalysis;

    try {
      const responseText = await callAzureOpenAI(DENIAL_ANALYSIS_PROMPT, `Analyze this denied claim:\n${claimData}`);
      const parsed = parseJSONResponse(responseText);

      analysis = {
        denialSummary: parsed.denial_summary || 'Analysis not available',
        rootCauseCategory: parsed.root_cause_category || 'Unknown',
        rootCauseDetail: parsed.root_cause_detail || 'Unable to determine root cause',
        denialCategory: parsed.denial_category || denial.denialCategory || 'other',
        preventable: parsed.preventable ?? true,
        correctable: parsed.correctable ?? true,
        appealRecommended: parsed.appeal_recommended ?? false,
        confidenceScore: parsed.confidence_score ?? 0.5,
        recommendedNextAction: parsed.recommended_next_action || 'Review denial and determine appropriate action',
        requiredInformation: Array.isArray(parsed.required_information)
          ? parsed.required_information.map((item: Record<string, string>) => ({
              item: item.item || '',
              reasonNeeded: item.reason_needed || item.reasonNeeded || '',
            }))
          : [],
        complianceNotes: Array.isArray(parsed.compliance_notes)
          ? parsed.compliance_notes.map((n: string) => String(n))
          : [],
        analyzedAt: new Date().toISOString(),
      };
    } catch (aiError) {
      console.error('AI analysis failed, using fallback:', aiError);
      // Fallback analysis based on CARC codes
      analysis = generateFallbackAnalysis(denial);
    }

    const updated = updateDenial(id, {
      analysis,
      status: 'Analyzed',
    });

    return NextResponse.json({ denial: updated, analysis });
  } catch (error) {
    console.error('Error analyzing denial:', error);
    return NextResponse.json({ error: 'Failed to analyze denial' }, { status: 500 });
  }
}

function generateFallbackAnalysis(denial: Record<string, string | number>): DenialAnalysis {
  const carcCode = String(denial.carcCode);
  const analysisMap: Record<string, Partial<DenialAnalysis>> = {
    'CO-16': {
      denialSummary: 'Claim denied due to missing or incomplete information.',
      rootCauseCategory: 'Missing Information',
      rootCauseDetail: 'Required claim information is missing or incomplete per payer requirements.',
      denialCategory: 'missing_information',
      correctable: true,
      appealRecommended: false,
    },
    'CO-18': {
      denialSummary: 'Claim denied as a duplicate submission.',
      rootCauseCategory: 'Duplicate Claim',
      rootCauseDetail: 'The same claim was previously submitted and adjudicated.',
      denialCategory: 'duplicate',
      correctable: true,
      appealRecommended: false,
    },
    'CO-22': {
      denialSummary: 'Payment adjusted - procedure bundled with another service.',
      rootCauseCategory: 'Bundling Issue',
      rootCauseDetail: 'This procedure is bundled with another procedure per CCI edits.',
      denialCategory: 'bundling',
      correctable: true,
      appealRecommended: true,
    },
    'CO-27': {
      denialSummary: 'Service denied as not medically necessary.',
      rootCauseCategory: 'Medical Necessity',
      rootCauseDetail: 'The diagnosis does not support medical necessity per LCD/NCD.',
      denialCategory: 'medical_necessity',
      correctable: true,
      appealRecommended: true,
    },
    'CO-29': {
      denialSummary: 'Claim denied for timely filing.',
      rootCauseCategory: 'Timely Filing',
      rootCauseDetail: 'Claim submitted after the payer filing deadline.',
      denialCategory: 'timely_filing',
      correctable: false,
      appealRecommended: false,
    },
    'CO-50': {
      denialSummary: 'Service denied - authorization/precertification not obtained.',
      rootCauseCategory: 'Authorization Required',
      rootCauseDetail: 'Required precertification was not obtained prior to service.',
      denialCategory: 'authorization',
      correctable: true,
      appealRecommended: true,
    },
    'CO-197': {
      denialSummary: 'Precertification/authorization not obtained or not valid.',
      rootCauseCategory: 'Authorization Issue',
      rootCauseDetail: 'No valid authorization on file for this service.',
      denialCategory: 'authorization',
      correctable: true,
      appealRecommended: true,
    },
    'PR-1': {
      denialSummary: 'Deductible amount - patient responsibility.',
      rootCauseCategory: 'Patient Responsibility',
      rootCauseDetail: 'Patient has not met annual deductible.',
      denialCategory: 'eligibility',
      correctable: false,
      appealRecommended: false,
    },
    'CO-4': {
      denialSummary: 'Procedure code inconsistent with modifier or missing modifier.',
      rootCauseCategory: 'Coding Error',
      rootCauseDetail: 'The procedure code and modifier combination is invalid or missing required modifier.',
      denialCategory: 'coding_error',
      correctable: true,
      appealRecommended: false,
    },
    'CO-11': {
      denialSummary: 'Diagnosis does not support the level of service.',
      rootCauseCategory: 'Coding Error',
      rootCauseDetail: 'The billed E/M level is not supported by the documented medical decision-making.',
      denialCategory: 'coding_error',
      correctable: true,
      appealRecommended: true,
    },
    'CO-15': {
      denialSummary: 'Missing required supporting documentation.',
      rootCauseCategory: 'Missing Information',
      rootCauseDetail: 'Required supporting documentation was not submitted with the claim.',
      denialCategory: 'missing_information',
      correctable: true,
      appealRecommended: false,
    },
    'OA-23': {
      denialSummary: 'Impact of prior payer adjudication.',
      rootCauseCategory: 'Prior Payer Adjustment',
      rootCauseDetail: 'Adjustment reflects prior payer adjudication or coordination of benefits.',
      denialCategory: 'other',
      correctable: true,
      appealRecommended: true,
    },
    'CO-109': {
      denialSummary: 'Patient not covered under this plan.',
      rootCauseCategory: 'Eligibility',
      rootCauseDetail: 'Patient coverage was not active on date of service.',
      denialCategory: 'eligibility',
      correctable: false,
      appealRecommended: false,
    },
  };

  const fallback = analysisMap[carcCode] || {
    denialSummary: `Claim denied with CARC code ${carcCode}.`,
    rootCauseCategory: 'Unknown',
    rootCauseDetail: 'Root cause analysis requires further review.',
    denialCategory: 'other',
    correctable: true,
    appealRecommended: true,
  };

  return {
    denialSummary: fallback.denialSummary || 'Analysis not available',
    rootCauseCategory: fallback.rootCauseCategory || 'Unknown',
    rootCauseDetail: fallback.rootCauseDetail || 'Unable to determine root cause',
    denialCategory: fallback.denialCategory || 'other',
    preventable: true,
    correctable: fallback.correctable ?? true,
    appealRecommended: fallback.appealRecommended ?? false,
    confidenceScore: 0.7,
    recommendedNextAction: 'Review denial details and determine appropriate action based on CARC/RARC codes.',
    requiredInformation: [
      { item: 'Complete claim documentation', reasonNeeded: 'To support correction or appeal' },
    ],
    complianceNotes: ['Ensure all corrections comply with CMS and payer guidelines.'],
    analyzedAt: new Date().toISOString(),
  };
}
