import { NextRequest, NextResponse } from 'next/server';
import { getDenialById, updateDenial } from '@/lib/data';
import { callAzureOpenAI, parseJSONResponse, CORRECTION_SUGGESTION_PROMPT } from '@/lib/azure-openai';
import { CorrectionSuggestion, Denial } from '@/lib/types';

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

    if (!denial.analysis) {
      return NextResponse.json({ error: 'Denial must be analyzed before correction suggestions can be generated' }, { status: 400 });
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
    });

    let correction: CorrectionSuggestion;

    try {
      const responseText = await callAzureOpenAI(CORRECTION_SUGGESTION_PROMPT, `Based on the denial analysis, suggest corrections for this claim:\n${contextData}`);
      const parsed = parseJSONResponse(responseText);

      correction = {
        correctionType: parsed.correction_type || 'Review Required',
        correctionSummary: parsed.correction_summary || 'Correction suggestion not available',
        correctionRationale: parsed.correction_rationale || '',
        proposedChanges: Array.isArray(parsed.proposed_changes)
          ? parsed.proposed_changes.map((change: Record<string, string>) => ({
              fieldPath: change.field_path || change.fieldPath || '',
              originalValue: change.original_value || change.originalValue || '',
              proposedValue: change.proposed_value || change.proposedValue || '',
              reason: change.reason || '',
              riskLevel: change.risk_level || change.riskLevel || 'low',
            }))
          : [],
        requiredDocuments: Array.isArray(parsed.required_documents)
          ? parsed.required_documents.map((doc: Record<string, string>) => ({
              documentType: doc.document_type || doc.documentType || '',
              reason: doc.reason || '',
            }))
          : [],
        resubmissionInstructions: {
          claimFrequencyCode: parsed.resubmission_instructions?.claim_frequency_code || parsed.resubmission_instructions?.claimFrequencyCode || '7',
          submissionType: parsed.resubmission_instructions?.submission_type || parsed.resubmission_instructions?.submissionType || 'Electronic',
          notes: parsed.resubmission_instructions?.notes || 'Resubmit as corrected claim.',
        },
        confidenceScore: parsed.confidence_score ?? parsed.confidenceScore ?? 0.5,
        riskLevel: parsed.risk_level || parsed.riskLevel || 'low',
        complianceNotes: Array.isArray(parsed.compliance_notes)
          ? parsed.compliance_notes.map((n: string) => String(n))
          : [],
        createdAt: new Date().toISOString(),
      };
    } catch (aiError) {
      console.error('AI correction failed, using fallback:', aiError);
      correction = generateFallbackCorrection(denial);
    }

    const updated = updateDenial(id, {
      correction,
      status: 'Corrected',
    });

    return NextResponse.json({ denial: updated, correction });
  } catch (error) {
    console.error('Error generating correction:', error);
    return NextResponse.json({ error: 'Failed to generate correction suggestion' }, { status: 500 });
  }
}

function generateFallbackCorrection(denial: Denial): CorrectionSuggestion {
  const category = denial.analysis?.denialCategory || denial.denialCategory;

  const corrections: Record<string, Partial<CorrectionSuggestion>> = {
    missing_information: {
      correctionType: 'Information Addition',
      correctionSummary: 'Add missing information to the claim as identified in the denial analysis.',
      correctionRationale: 'The claim was denied due to missing or incomplete information. Supply the required information and resubmit.',
      proposedChanges: [
        {
          fieldPath: 'AdditionalDocumentation',
          originalValue: 'Missing',
          proposedValue: 'To be determined from clinical records',
          reason: 'Required information identified in denial analysis',
          riskLevel: 'low',
        },
      ],
    },
    coding_error: {
      correctionType: 'Code Correction',
      correctionSummary: 'Correct coding errors identified in the denial analysis.',
      correctionRationale: 'The claim contains coding errors that need to be corrected before resubmission.',
      proposedChanges: [
        {
          fieldPath: 'CPTCode/Modifier',
          originalValue: denial.cptCode + (denial.modifier ? `-${denial.modifier}` : ''),
          proposedValue: 'To be determined based on documentation review',
          reason: 'Current code/modifier combination is invalid or incorrect',
          riskLevel: 'medium',
        },
      ],
    },
    authorization: {
      correctionType: 'Authorization Request',
      correctionSummary: 'Obtain required authorization and resubmit claim.',
      correctionRationale: 'The service requires prior authorization that was not obtained. Request retrospective authorization if available.',
      proposedChanges: [],
    },
    bundling: {
      correctionType: 'Modifier Addition',
      correctionSummary: 'Add appropriate modifier to unbundle services correctly.',
      correctionRationale: 'The service was bundled with another procedure. Add appropriate modifier (e.g., 25, 59) to indicate distinct service.',
      proposedChanges: [
        {
          fieldPath: 'Modifier',
          originalValue: denial.modifier || 'None',
          proposedValue: '25 or 59 (as appropriate)',
          reason: 'To indicate separately identifiable or distinct service',
          riskLevel: 'low',
        },
      ],
    },
    medical_necessity: {
      correctionType: 'Diagnosis Update/Appeal',
      correctionSummary: 'Update diagnosis to covered diagnosis or prepare clinical appeal.',
      correctionRationale: 'The current diagnosis does not meet medical necessity criteria. Review clinical documentation for alternative covered diagnoses.',
      proposedChanges: [
        {
          fieldPath: 'DiagnosisCode',
          originalValue: denial.diagnosisCode,
          proposedValue: 'Review clinical documentation for appropriate covered diagnosis',
          reason: 'Current diagnosis does not support medical necessity',
          riskLevel: 'medium',
        },
      ],
    },
  };

  const fallback = corrections[category || 'other'] || {
    correctionType: 'Review Required',
    correctionSummary: 'Manual review required to determine appropriate correction.',
    correctionRationale: 'Automated correction suggestions are not available for this denial type.',
    proposedChanges: [],
  };

  return {
    correctionType: fallback.correctionType || 'Review Required',
    correctionSummary: fallback.correctionSummary || 'Correction suggestion not available',
    correctionRationale: fallback.correctionRationale || '',
    proposedChanges: (fallback.proposedChanges || []) as CorrectionSuggestion['proposedChanges'],
    requiredDocuments: [
      { documentType: 'Clinical documentation', reason: 'To support the correction' },
    ],
    resubmissionInstructions: {
      claimFrequencyCode: '7',
      submissionType: 'Electronic',
      notes: 'Resubmit as corrected claim with supporting documentation.',
    },
    confidenceScore: 0.6,
    riskLevel: 'medium',
    complianceNotes: ['Ensure all corrections are supported by clinical documentation.'],
    createdAt: new Date().toISOString(),
  };
}
