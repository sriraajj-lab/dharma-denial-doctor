import { AuditAction, AuditLogEntry } from './types';

// In-memory audit log store (mirrors the DB model for use before DB migration)
let auditLogs: AuditLogEntry[] = [];

export function createAuditLog(entry: {
  userId?: string;
  userName?: string;
  denialId?: string;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}): AuditLogEntry {
  const log: AuditLogEntry = {
    id: `AUD-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    ...entry,
    createdAt: new Date().toISOString(),
  };
  auditLogs.push(log);
  return log;
}

export function getAuditLogs(filters?: {
  userId?: string;
  denialId?: string;
  action?: AuditAction;
  entityType?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}): { logs: AuditLogEntry[]; total: number } {
  let filtered = [...auditLogs];

  if (filters?.userId) {
    filtered = filtered.filter((l) => l.userId === filters.userId);
  }
  if (filters?.denialId) {
    filtered = filtered.filter((l) => l.denialId === filters.denialId);
  }
  if (filters?.action) {
    filtered = filtered.filter((l) => l.action === filters.action);
  }
  if (filters?.entityType) {
    filtered = filtered.filter((l) => l.entityType === filters.entityType);
  }
  if (filters?.startDate) {
    filtered = filtered.filter((l) => l.createdAt >= filters.startDate!);
  }
  if (filters?.endDate) {
    filtered = filtered.filter((l) => l.createdAt <= filters.endDate!);
  }

  // Sort newest first
  filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = filtered.length;
  const offset = filters?.offset || 0;
  const limit = filters?.limit || 50;
  const logs = filtered.slice(offset, offset + limit);

  return { logs, total };
}

export function getAuditLogsForDenial(denialId: string): AuditLogEntry[] {
  return auditLogs
    .filter((l) => l.denialId === denialId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
