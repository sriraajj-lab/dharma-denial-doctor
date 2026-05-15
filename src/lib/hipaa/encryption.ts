import * as crypto from 'crypto';

// PHI fields that must be encrypted
export const PHI_FIELDS = [
  'patientName',
  'patientDOB',
  'patientMemberId',
  'providerNPI',
] as const;

export type PHIField = typeof PHI_FIELDS[number];

// Encryption config
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY = process.env.PHI_ENCRYPTION_KEY || 'default-dev-key-change-in-production-32ch';

function getKey(): Buffer {
  // Derive a 32-byte key from the configured key
  return crypto.createHash('sha256').update(KEY).digest();
}

/**
 * Encrypt a string value using AES-256-GCM
 */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getKey();

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const tag = cipher.getAuthTag();

  // Format: iv:tag:ciphertext
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a string value using AES-256-GCM
 */
export function decrypt(ciphertext: string): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format. Expected iv:tag:ciphertext');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const tag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  const key = getKey();

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Encrypt an object's PHI fields
 */
export function encryptPHIFields<T extends Record<string, unknown>>(
  data: T,
  fields: readonly string[] = PHI_FIELDS
): T {
  const result = { ...data };
  for (const field of fields) {
    if (field in result && result[field] && typeof result[field] === 'string') {
      (result as any)[field] = encrypt(result[field] as string);
    }
  }
  return result;
}

/**
 * Decrypt an object's PHI fields
 */
export function decryptPHIFields<T extends Record<string, unknown>>(
  data: T,
  fields: readonly string[] = PHI_FIELDS
): T {
  const result = { ...data };
  for (const field of fields) {
    if (field in result && result[field] && typeof result[field] === 'string') {
      try {
        (result as any)[field] = decrypt(result[field] as string);
      } catch {
        // If decryption fails, the field may not be encrypted
        // Keep the original value
      }
    }
  }
  return result;
}

/**
 * Check if a value appears to be encrypted
 */
export function isEncrypted(value: string): boolean {
  // Encrypted values have the format iv:tag:ciphertext (3 hex parts separated by colons)
  const parts = value.split(':');
  if (parts.length !== 3) return false;
  return /^[0-9a-f]+$/.test(parts[0]) && /^[0-9a-f]+$/.test(parts[1]) && /^[0-9a-f]+$/.test(parts[2]);
}

/**
 * Generate a secure random token for sessions
 */
export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a value (one-way) for comparison without storing plaintext
 */
export function hashValue(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
