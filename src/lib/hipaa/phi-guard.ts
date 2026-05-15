import { db } from '../db';
import { PHI_FIELDS } from './encryption';

// Access levels for PHI
export type PHIAccessLevel = 'standard' | 'elevated' | 'emergency';

// Context for PHI access
export interface PHIAccessContext {
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  justification?: string;
}

/**
 * Log PHI access to the HIPAA audit log
 */
export async function logPHIAccess(params: {
  action: 'phi_access' | 'phi_export' | 'phi_modify' | 'phi_delete' | 'phi_decrypt';
  entityType: string;
  entityId?: string;
  phiFieldsAccessed: string[];
  ctx: PHIAccessContext;
  accessLevel?: PHIAccessLevel;
  result?: 'success' | 'denied' | 'error';
  denialReason?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.hIPAAAuditLog.create({
    data: {
      userId: params.ctx.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      phiFieldsAccessed: JSON.stringify(params.phiFieldsAccessed),
      justification: params.ctx.justification,
      accessLevel: params.accessLevel || 'standard',
      ipAddress: params.ctx.ipAddress,
      userAgent: params.ctx.userAgent,
      sessionId: params.ctx.sessionId,
      result: params.result || 'success',
      denialReason: params.denialReason,
      metadata: params.metadata ? JSON.stringify(params.metadata) : undefined,
    }
  });
}

/**
 * Check if a user has access to PHI fields
 */
export async function checkPHIAccess(user: {
  role: string;
  id: string;
  isActive: boolean;
}, fields: string[], ctx: PHIAccessContext): Promise<{
  allowed: boolean;
  reason?: string;
  accessLevel: PHIAccessLevel;
}> {
  // Inactive users can never access PHI
  if (!user.isActive) {
    await logPHIAccess({
      action: 'phi_access',
      entityType: 'user',
      entityId: user.id,
      phiFieldsAccessed: fields,
      ctx,
      result: 'denied',
      denialReason: 'User account is inactive',
    });
    return { allowed: false, reason: 'User account is inactive', accessLevel: 'standard' };
  }

  // Role-based access
  const roleAccess: Record<string, string[]> = {
    admin: [...PHI_FIELDS],
    manager: [...PHI_FIELDS],
    biller: ['patientName', 'patientDOB', 'patientMemberId'],
    coder: ['patientName', 'patientDOB'],
    client: [], // Clients should never see raw PHI
  };

  const allowedFields = roleAccess[user.role] || [];
  const hasAccess = fields.every(f => allowedFields.includes(f));

  if (!hasAccess) {
    const deniedFields = fields.filter(f => !allowedFields.includes(f));
    await logPHIAccess({
      action: 'phi_access',
      entityType: 'role_check',
      entityId: user.id,
      phiFieldsAccessed: fields,
      ctx,
      result: 'denied',
      denialReason: `Role '${user.role}' cannot access: ${deniedFields.join(', ')}`,
    });
    return { allowed: false, reason: `Insufficient role permissions for: ${deniedFields.join(', ')}`, accessLevel: 'standard' };
  }

  const accessLevel: PHIAccessLevel = user.role === 'admin' ? 'elevated' : 'standard';
  return { allowed: true, accessLevel };
}

/**
 * Wrap a data access function with PHI access logging
 */
export async function withPHIAccess<T>(
  action: 'phi_access' | 'phi_export' | 'phi_modify' | 'phi_delete' | 'phi_decrypt',
  entityType: string,
  entityId: string | undefined,
  fields: string[],
  ctx: PHIAccessContext,
  fn: () => Promise<T>
): Promise<T> {
  // Log the access
  await logPHIAccess({
    action,
    entityType,
    entityId,
    phiFieldsAccessed: fields,
    ctx,
  });

  // Execute the function
  return fn();
}

/**
 * Get PHI access audit trail
 */
export async function getPHIAuditTrail(filters?: {
  userId?: string;
  action?: string;
  entityType?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}) {
  const where: any = {};
  if (filters?.userId) where.userId = filters.userId;
  if (filters?.action) where.action = filters.action;
  if (filters?.entityType) where.entityType = filters.entityType;
  if (filters?.startDate || filters?.endDate) {
    where.createdAt = {};
    if (filters.startDate) where.createdAt.gte = filters.startDate;
    if (filters.endDate) where.createdAt.lte = filters.endDate;
  }

  return db.hIPAAAuditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: filters?.limit || 100,
  });
}
