/**
 * Agent Output Schema Registry
 *
 * Re-exports schemas from the 6 functional agents for centralized validation.
 * Each agent defines its own output schema — this file provides a single
 * lookup point for the conductor to validate outputs.
 */
import { z } from 'zod';

// Import schemas from each agent
import { DemographicsOutputSchema } from './demographics-agent';
import { EligibilityOutputSchema } from './eligibility-agent';
import { CodingOutputSchema } from './coding-agent';
import { ScrubberOutputSchema } from './scrubber-agent';
import { AppealOutputSchema } from './appeal-agent';
import { OrchestratorOutputSchema } from './orchestrator-agent';

// Re-export for convenience
export { DemographicsOutputSchema, EligibilityOutputSchema, CodingOutputSchema, ScrubberOutputSchema, AppealOutputSchema, OrchestratorOutputSchema };

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

// ─── SCHEMA REGISTRY ──────────────────────────────────────────────────────────
// Maps agent names to their output schemas for validation gates

export const AGENT_OUTPUT_SCHEMAS: Record<string, z.ZodType> = {
  'demographics-agent': DemographicsOutputSchema,
  'eligibility-agent': EligibilityOutputSchema,
  'coding-agent': CodingOutputSchema,
  'scrubber-agent': ScrubberOutputSchema,
  'appeal-agent': AppealOutputSchema,
  'orchestrator-agent': OrchestratorOutputSchema,
};
