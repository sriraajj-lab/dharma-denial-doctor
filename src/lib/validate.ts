/**
 * Input Validation Utilities
 * Lightweight validation without external dependencies (Zod-like patterns)
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateRequired(fields: Record<string, unknown>, required: string[]): ValidationResult {
  const errors: string[] = [];
  for (const field of required) {
    const value = fields[field];
    if (value === undefined || value === null || value === '') {
      errors.push(`${field} is required`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateDenialInput(data: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  const required = ['claimNumber', 'patientName', 'payerName', 'dateOfService', 'denialDate', 'cptCode', 'diagnosisCode', 'carcCode'];
  const reqResult = validateRequired(data, required);
  errors.push(...reqResult.errors);

  // Amount validation
  if (data.billedAmount !== undefined && (typeof data.billedAmount !== 'number' || data.billedAmount < 0)) {
    errors.push('billedAmount must be a non-negative number');
  }
  if (data.deniedAmount !== undefined && (typeof data.deniedAmount !== 'number' || data.deniedAmount < 0)) {
    errors.push('deniedAmount must be a non-negative number');
  }

  // Status validation
  const validStatuses = ['New', 'Analyzed', 'Corrected', 'Reviewed', 'Resubmitted', 'Appealed', 'Closed'];
  if (data.status && !validStatuses.includes(data.status as string)) {
    errors.push(`status must be one of: ${validStatuses.join(', ')}`);
  }

  // Priority validation
  const validPriorities = ['low', 'normal', 'high', 'critical'];
  if (data.priority && !validPriorities.includes(data.priority as string)) {
    errors.push(`priority must be one of: ${validPriorities.join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
}

export function validateBatchInput(data: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  if (!data.jobType || !['analyze', 'correct', 'quality_check'].includes(data.jobType as string)) {
    errors.push('jobType must be: analyze, correct, or quality_check');
  }

  if (!data.denialIds || !Array.isArray(data.denialIds) || data.denialIds.length === 0) {
    errors.push('denialIds must be a non-empty array');
  }

  if (Array.isArray(data.denialIds) && data.denialIds.length > 100) {
    errors.push('Maximum 100 denials per batch job');
  }

  return { valid: errors.length === 0, errors };
}

export function validateNoteInput(data: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  if (!data.denialId) errors.push('denialId is required');
  if (!data.content || (data.content as string).trim().length === 0) errors.push('content is required');
  if ((data.content as string)?.length > 5000) errors.push('content must be under 5000 characters');

  const validTypes = ['general', 'internal', 'escalation', 'payer_contact', 'resolution'];
  if (data.noteType && !validTypes.includes(data.noteType as string)) {
    errors.push(`noteType must be one of: ${validTypes.join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
}

export function validateFinancialInput(data: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  if (!data.denialId) errors.push('denialId is required');
  if (data.amount === undefined || typeof data.amount !== 'number') errors.push('amount must be a number');

  const validTypes = ['resubmission', 'partial_payment', 'full_payment', 'write_off', 'adjustment', 'refund'];
  if (!data.eventType || !validTypes.includes(data.eventType as string)) {
    errors.push(`eventType must be one of: ${validTypes.join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Return a 422 validation error response
 */
export function validationErrorResponse(errors: string[]) {
  return new Response(
    JSON.stringify({ error: 'Validation failed', details: errors }),
    { status: 422, headers: { 'Content-Type': 'application/json' } }
  );
}
