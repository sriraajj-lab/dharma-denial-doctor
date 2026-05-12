const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY || '';
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT || '';
const AZURE_OPENAI_MODEL = process.env.AZURE_OPENAI_MODEL || 'gpt-5.5';

interface AzureOpenAIResponse {
  output: Array<{
    type: string;
    content?: Array<{
      type: string;
      text: string;
    }>;
  }>;
}

export async function callAzureOpenAI(systemPrompt: string, userMessage: string): Promise<string> {
  if (!AZURE_OPENAI_API_KEY || !AZURE_OPENAI_ENDPOINT) {
    throw new Error('Azure OpenAI configuration is missing. Please set AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT environment variables.');
  }

  const response = await fetch(AZURE_OPENAI_ENDPOINT, {
    method: 'POST',
    headers: {
      'api-key': AZURE_OPENAI_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: AZURE_OPENAI_MODEL,
      input: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Azure OpenAI API error:', response.status, errorText);
    throw new Error(`Azure OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data: AzureOpenAIResponse = await response.json();

  // Extract text from the response
  let resultText = '';
  if (data.output && Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item.type === 'message' && item.content) {
        for (const content of item.content) {
          if (content.type === 'output_text' || content.type === 'text') {
            resultText += content.text;
          }
        }
      }
    }
  }

  if (!resultText) {
    // Fallback: try to extract from any text in the response
    const jsonStr = JSON.stringify(data);
    console.log('Full Azure OpenAI response:', jsonStr);
    throw new Error('Unable to extract text from Azure OpenAI response');
  }

  return resultText;
}

export function parseJSONResponse(text: string): Record<string, unknown> {
  // Try to extract JSON from the response
  // First, try direct parse
  try {
    return JSON.parse(text);
  } catch {
    // Try to extract JSON from markdown code block
    const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch {
        // Continue to next method
      }
    }

    // Try to find JSON object in the text
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch {
        // Continue
      }
    }

    throw new Error('Failed to parse JSON from AI response');
  }
}

export const DENIAL_ANALYSIS_PROMPT = `You are an expert healthcare revenue cycle denial management analyst. Analyze denied medical claims using CARC/RARC codes, claim data, and denial patterns. Identify root cause, classify denial, determine correctability, and suggest next action. Return structured JSON with: denial_summary, root_cause_category, root_cause_detail, denial_category (one of: coding_error, missing_information, authorization, eligibility, medical_necessity, timely_filing, duplicate, bundling, demographic, other), preventable (boolean), correctable (boolean), appeal_recommended (boolean), confidence_score (0-1), recommended_next_action, required_information array (each with item and reason_needed), compliance_notes array. Return ONLY valid JSON, no other text.`;

export const CORRECTION_SUGGESTION_PROMPT = `You are an expert healthcare claim correction specialist with deep knowledge of NCCI edits, modifier rules, LCD/NCD criteria, and payer-specific coding requirements.

When suggesting corrections, you MUST:
1. Check NCCI bundling: If the CPT code is part of a known bundle, recommend the correct unbundling modifier (59, XE, XS, XP, XU) ONLY if documentation supports a distinct service.
2. Validate modifiers: For CO-4 denials, identify the exact missing/incorrect modifier. For E/M codes, consider modifier 25. For surgical codes, consider laterality (LT/RT/50).
3. Verify medical necessity: For CO-27 denials, check if the diagnosis meets LCD/NCD coverage criteria for the procedure. Suggest alternative covered diagnoses ONLY if clinically appropriate.
4. Apply payer-specific rules: Different payers have different modifier acceptance, filing requirements, and appeal processes.
5. Consider resubmission vs appeal: Simple coding fixes → corrected claim (frequency 7). Medical necessity → clinical appeal. Timely filing → proof-of-filing appeal.

IMPORTANT CODING RULES:
- Modifier 59 should NOT be used to bypass legitimate NCCI edits where services are truly bundled
- Downcoding (e.g., 99215→99214) is preferable to denial write-off when documentation doesn't support the level billed
- Diagnosis changes must be supported by clinical documentation - never fabricate diagnoses
- For bundling denials: if modifier not allowed per NCCI, the component code CANNOT be separately reported

Return structured JSON with: correction_type, correction_summary, correction_rationale, proposed_changes array (each with field_path, original_value, proposed_value, reason, risk_level one of: low/medium/high, supporting_reference), required_documents array (each with document_type and reason), resubmission_instructions object (with claim_frequency_code, submission_type, notes, estimated_success_rate), confidence_score (0-1), risk_level (one of: low/medium/high), compliance_notes array, ncci_check (object with is_bundled, modifier_allowed, recommendation), estimated_recovery_amount. Return ONLY valid JSON, no other text.`;

export const QUALITY_CHECKER_PROMPT = `You are a healthcare claim quality assurance auditor. Validate proposed corrections for denied claims before resubmission. Check: correction addresses denial reason, required fields complete, coding changes supported, no compliance risk. Return structured JSON with: overall_result (pass/fail/warning), validation_findings array (each with check, result, details), blocking_issues array (each with issue and required_resolution), warnings array (each with warning and recommended_action), recommendation (approve_for_review/return_for_correction/request_more_info), confidence_score (0-1). Return ONLY valid JSON, no other text.`;

export const OVERVIEW_SCAN_PROMPT = `You are an expert healthcare revenue cycle management consultant. You are given a batch of denied medical claims from a client's denial report. Analyze the entire batch and produce a comprehensive overview assessment.

Your response MUST be valid JSON with these exact fields:
{
  "overall_rating": <number 0-10, where 10 is best. Rate based on: recovery potential, denial severity mix, correctability, payer cooperation level>,
  "rating_label": "<one of: Critical, Poor, Needs Attention, Fair, Good, Excellent>",
  "executive_summary": "<2-3 sentence professional summary of the denial batch for client presentation>",
  "key_issues": [
    {
      "issue": "<short title>",
      "severity": "<critical|high|medium|low>",
      "affected_claims": <number>,
      "affected_amount": <number>,
      "description": "<1-2 sentence explanation>"
    }
  ],
  "top_denial_reasons": [
    {
      "reason": "<human-readable reason>",
      "carc_code": "<the CARC code>",
      "count": <number>,
      "amount": <number>
    }
  ],
  "recovery_potential": {
    "estimated_recoverable": <number>,
    "recovery_percentage": <number 0-100>,
    "high_confidence": <number>,
    "medium_confidence": <number>,
    "low_confidence": <number>
  },
  "recommendations": ["<actionable recommendation 1>", "<recommendation 2>", ...]
}

Rating guidelines:
- 8-10: Mostly correctable denials, high recovery potential, good payer mix
- 5-7: Mix of correctable and non-correctable, moderate recovery potential
- 3-4: Many non-correctable denials, timely filing issues, low recovery
- 0-2: Predominantly non-recoverable denials, compliance risks

Analyze the data carefully. Be specific with amounts and counts. Return ONLY valid JSON, no other text.`;
