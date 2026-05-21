/**
 * Azure OpenAI Compatibility Layer — Now powered by THE BRAIN
 *
 * This file provides backward compatibility with the old azure-openai.ts API
 * while routing all calls through the new Brain module for:
 * - Multi-model support (Azure OpenAI + Claude + z-ai-sdk)
 * - Cross-validation between models
 * - Anti-hallucination deterministic validation
 * - Automatic fallback when providers fail
 *
 * NEW: Use `import { getBrain, analyzeDenial, generateCorrectedCodes } from './brain'`
 *      for the full Brain API with cross-validation.
 *
 * LEGACY: Use `import { callAzureOpenAI } from './azure-openai'` for drop-in compatibility.
 */

import { getBrain, type BrainResult, type AIProvider } from './brain';

// ─── BACKWARD-COMPATIBLE API ───────────────────────────────────────────────────

/**
 * Call Azure OpenAI (or fallback provider) with a system prompt and user message.
 * This is the LEGACY API — kept for backward compatibility.
 *
 * NEW CODE: Use `getBrain().think()` or the convenience functions in brain.ts instead.
 */
export async function callAzureOpenAI(systemPrompt: string, userMessage: string): Promise<string> {
  const brain = getBrain();

  const result = await brain.think({
    systemPrompt,
    userMessage,
    outputFormat: 'text', // Legacy calls expect raw text
    category: 'general',
    highStakes: false,
    temperature: 0.1,
  });

  if (result.error && !result.content) {
    throw new Error(result.error);
  }

  return result.content;
}

/**
 * Parse JSON from an AI response text.
 * Handles markdown code blocks and other common formats.
 */
export function parseJSONResponse(text: string): Record<string, unknown> {
  // Try direct parse
  try {
    return JSON.parse(text);
  } catch {
    // Try to extract JSON from markdown code block
    const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch {
        // Continue
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

// ─── ENHANCED API (NEW) ────────────────────────────────────────────────────────

/**
 * Get the Brain instance for advanced usage.
 * Use this for cross-validation, deterministic validation, etc.
 */
export { getBrain, analyzeDenial, generateCorrectedCodes, generateAppealLetter, qualityCheck, overviewScan } from './brain';
export type { BrainResult, AIProvider, BrainCallOptions } from './brain';

// ─── SYSTEM PROMPTS (PRESERVED FOR COMPATIBILITY) ──────────────────────────────

export const DENIAL_ANALYSIS_PROMPT = `You are an expert healthcare revenue cycle denial management analyst. Analyze denied medical claims using CARC/RARC codes, claim data, and denial patterns. Identify root cause, classify denial, determine correctability, and suggest next action.

CRITICAL RULES:
- Only validate and analyze EXISTING data — NEVER invent patient data, codes, or policy numbers
- If you are unsure about something, say so explicitly
- Every factual claim must have a source reference
- Confidence must be between 0 and 1

Return structured JSON with: denial_summary, root_cause_category, root_cause_detail, denial_category (one of: coding_error, missing_information, authorization, eligibility, medical_necessity, timely_filing, duplicate, bundling, demographic, other), preventable (boolean), correctable (boolean), appeal_recommended (boolean), confidence_score (0-1), recommended_next_action, required_information array (each with item and reason_needed), compliance_notes array. Return ONLY valid JSON, no other text.`;

export const CORRECTION_SUGGESTION_PROMPT = `You are an expert healthcare claim correction specialist with deep knowledge of NCCI edits, modifier rules, LCD/NCD criteria, and payer-specific coding requirements.

CRITICAL SAFETY RULES:
- Only propose corrections you are confident about — if unsure, return empty corrections
- Explain WHY the original code is wrong and WHY the new code is correct
- Reference specific coding guidelines (AMA CPT, ICD-10-CM Official Guidelines, NCCI, LCD/NCD)
- Validate that proposed codes are real, valid code numbers (CPT = 4-5 digits, ICD-10 = letter + digits)
- If proposing a diagnosis change, ensure it is clinically consistent with the procedure
- Never fabricate codes — if you cannot determine the correct code with confidence, say so
- ALL corrections are AI-generated and MUST be verified by a certified coder before use
- Modifier 59 should NOT be used to bypass legitimate NCCI edits where services are truly bundled
- Downcoding (e.g., 99215→99214) is preferable to denial write-off when documentation doesn't support the level billed
- Diagnosis changes must be supported by clinical documentation — never fabricate diagnoses

Return structured JSON with: correction_type, correction_summary, correction_rationale, proposed_changes array (each with field_path, original_value, proposed_value, reason, risk_level one of: low/medium/high, supporting_reference), required_documents array, resubmission_instructions object, confidence_score (0-1), risk_level (one of: low/medium/high), compliance_notes array, ncci_check (object with is_bundled, modifier_allowed, recommendation), estimated_recovery_amount. Return ONLY valid JSON, no other text.`;

export const QUALITY_CHECKER_PROMPT = `You are a healthcare claim quality assurance auditor. Validate proposed corrections for denied claims before resubmission. Check: correction addresses denial reason, required fields complete, coding changes supported, no compliance risk. Return structured JSON with: overall_result (pass/fail/warning), validation_findings array (each with check, result, details), blocking_issues array (each with issue and required_resolution), warnings array (each with warning and recommended_action), recommendation (approve_for_review/return_for_correction/request_more_info), confidence_score (0-1). Return ONLY valid JSON, no other text.`;

export const OVERVIEW_SCAN_PROMPT = `You are an expert healthcare revenue cycle management consultant. You are given a batch of denied medical claims from a client's denial report. Analyze the entire batch and produce a comprehensive overview assessment.

Your response MUST be valid JSON with these exact fields:
{
  "overall_rating": <number 0-10, where 10 is best>,
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

Analyze the data carefully. Be specific with amounts and counts. Return ONLY valid JSON, no other text.`;
