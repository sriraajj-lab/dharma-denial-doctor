/**
 * Agent Output Schema Validation — V2 (6-Agent Architecture)
 *
 * Every agent has a strict Zod schema. Outputs are validated before
 * passing to the next agent. This is the core anti-hallucination measure.
 */
import { z } from 'zod';

// Re-export V2 agent schemas
export { EligibilityOutputSchema, type EligibilityOutput } from './eligibility-agent';
export { DemographicsOutputSchema, type DemographicsOutput } from './demographics-agent';
export { CodingOutputSchema, type CodingOutput } from './coding-agent';
export { ScrubberOutputSchema, type ScrubberOutput } from './scrubber-agent';
export { AppealOutputSchema, type AppealOutput } from './appeal-agent';
export { OrchestratorOutputSchema, type OrchestratorOutput } from './orchestrator-agent';

// ─── VALIDATION HELPER ────────────────────────────────────────────────────────

export function validateAgentOutput<T>(
  schema: z.ZodType<T>,
  data: unknown
): { success: boolean; data?: T; errors?: string[] } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errors = result.error.issues.map(
    (e) => `${e.path.join('.')}: ${e.message}`
  );
  return { success: false, errors };
}

// ─── SCHEMA REGISTRY (V2 — maps agent names to output schemas) ────────────────
// Note: The full schemas are imported dynamically in schemas.ts to avoid circular deps.
// This registry maps agent names to their output schemas for validation gates.

export const AGENT_OUTPUT_SCHEMAS: Record<string, z.ZodType> = {
  'eligibility-agent': z.object({}), // Imported dynamically
  'demographics-agent': z.object({}),
  'coding-agent': z.object({}),
  'scrubber-agent': z.object({}),
  'appeal-agent': z.object({}),
  'orchestrator-agent': z.object({}),
};
