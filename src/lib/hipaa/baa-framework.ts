import { db } from '../db';

export interface BAAVendor {
  vendorName: string;
  baaType: string;
  contactName?: string;
  contactEmail?: string;
  phiAccessScope: string[];
  securityMeasures: string[];
  breachNotifDays?: number;
}

export interface BAAValidationResult {
  isValid: boolean;
  issues: string[];
  warnings: string[];
  vendor?: {
    name: string;
    status: string;
    expirationDate?: Date;
    phiAccessScope: string[];
  };
}

/**
 * Create a new BAA record
 */
export async function createBAA(vendor: BAAVendor): Promise<string> {
  const record = await db.bAARecord.create({
    data: {
      vendorName: vendor.vendorName,
      baaType: vendor.baaType,
      contactName: vendor.contactName,
      contactEmail: vendor.contactEmail,
      phiAccessScope: JSON.stringify(vendor.phiAccessScope),
      securityMeasures: JSON.stringify(vendor.securityMeasures),
      breachNotifDays: vendor.breachNotifDays || 60,
      status: 'pending',
    }
  });
  return record.id;
}

/**
 * Validate that a vendor has an active BAA for the required PHI access
 */
export async function validateBAA(vendorName: string, requiredAccess: string[]): Promise<BAAValidationResult> {
  const record = await db.bAARecord.findFirst({
    where: { vendorName, status: 'active' },
    orderBy: { signedDate: 'desc' },
  });

  if (!record) {
    return {
      isValid: false,
      issues: [`No active BAA found for vendor: ${vendorName}`],
      warnings: ['PHI cannot be shared without an active BAA per HIPAA requirements'],
    };
  }

  const issues: string[] = [];
  const warnings: string[] = [];

  // Check expiration
  if (record.expirationDate && new Date() > record.expirationDate) {
    issues.push(`BAA expired on ${record.expirationDate.toISOString()}`);
  }

  // Check if BAA is about to expire (30 days)
  if (record.expirationDate) {
    const daysUntilExpiry = Math.ceil((record.expirationDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysUntilExpiry > 0 && daysUntilExpiry <= 30) {
      warnings.push(`BAA expires in ${daysUntilExpiry} days - renew promptly`);
    }
  }

  // Check PHI access scope
  const allowedAccess = JSON.parse(record.phiAccessScope) as string[];
  const unauthorizedAccess = requiredAccess.filter(a => !allowedAccess.includes(a));
  if (unauthorizedAccess.length > 0) {
    issues.push(`BAA does not authorize access to: ${unauthorizedAccess.join(', ')}`);
  }

  // Check security measures
  const securityMeasures = JSON.parse(record.securityMeasures) as string[];
  const requiredMeasures = ['encryption_at_rest', 'encryption_in_transit', 'access_controls', 'audit_logging'];
  const missingMeasures = requiredMeasures.filter(m => !securityMeasures.includes(m));
  if (missingMeasures.length > 0) {
    warnings.push(`BAA should specify security measures: ${missingMeasures.join(', ')}`);
  }

  return {
    isValid: issues.length === 0,
    issues,
    warnings,
    vendor: {
      name: record.vendorName,
      status: record.status,
      expirationDate: record.expirationDate ?? undefined,
      phiAccessScope: allowedAccess,
    },
  };
}

/**
 * Get all BAA records with their status
 */
export async function getAllBAAs(includeExpired: boolean = false) {
  const where: any = {};
  if (!includeExpired) where.status = { not: 'expired' };

  return db.bAARecord.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
  });
}

/**
 * Update BAA status (e.g., mark as signed, expired, terminated)
 */
export async function updateBAAStatus(id: string, status: string, updates?: {
  signedDate?: Date;
  expirationDate?: Date;
  notes?: string;
}) {
  return db.bAARecord.update({
    where: { id },
    data: {
      status,
      ...(updates?.signedDate && { signedDate: updates.signedDate }),
      ...(updates?.expirationDate && { expirationDate: updates.expirationDate }),
      ...(updates?.notes && { notes: updates.notes }),
    },
  });
}

/**
 * Run compliance check for all active BAAs
 */
export async function runBAAComplianceCheck(): Promise<{
  total: number;
  active: number;
  expired: number;
  expiringSoon: number;
  missing: string[];
}> {
  const allBAAs = await db.bAARecord.findMany();
  const now = new Date();
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const active = allBAAs.filter(b => b.status === 'active' && (!b.expirationDate || new Date(b.expirationDate) > now));
  const expired = allBAAs.filter(b => b.status === 'expired' || (b.expirationDate && new Date(b.expirationDate) <= now));
  const expiringSoon = allBAAs.filter(b => b.expirationDate && new Date(b.expirationDate) > now && new Date(b.expirationDate) <= thirtyDays);

  // Check required vendors
  const requiredVendors = ['cloud_provider', 'ai_service', 'clearinghouse', 'storage'];
  const coveredTypes = new Set(allBAAs.filter(b => b.status === 'active').map(b => b.baaType));
  const missing = requiredVendors.filter(v => !coveredTypes.has(v));

  return {
    total: allBAAs.length,
    active: active.length,
    expired: expired.length,
    expiringSoon: expiringSoon.length,
    missing,
  };
}
