/**
 * Prisma-based Data Access Layer
 * Replaces the in-memory/JSON file store with proper database persistence.
 * Falls back to in-memory if Prisma is not available (e.g., during build).
 */

import { db } from './db';
import { Denial } from './types';

// ─── DENIALS ────────────────────────────────────────────────────────────────

export async function getDenialsDB(): Promise<Denial[]> {
  try {
    const denials = await db.denial.findMany({
      include: {
        analysis: true,
        correction: true,
        qualityCheck: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return denials.map(mapDenialFromDB);
  } catch (error) {
    console.error('Prisma getDenials error:', error);
    return [];
  }
}

export async function getDenialByIdDB(id: string): Promise<Denial | null> {
  try {
    const denial = await db.denial.findUnique({
      where: { id },
      include: {
        analysis: true,
        correction: true,
        qualityCheck: true,
        notes: { include: { author: { select: { name: true } } } },
        appeals: true,
        assignments: true,
        financials: true,
      },
    });

    if (!denial) return null;
    return mapDenialFromDB(denial);
  } catch (error) {
    console.error('Prisma getDenialById error:', error);
    return null;
  }
}

export async function createDenialDB(data: Omit<Denial, 'id' | 'createdAt' | 'updatedAt'>): Promise<Denial> {
  const denial = await db.denial.create({
    data: {
      claimNumber: data.claimNumber,
      patientName: data.patientName,
      patientDOB: data.patientDOB,
      patientMemberId: data.patientMemberId,
      payerName: data.payerName,
      payerId: data.payerId,
      providerNPI: data.providerNPI,
      providerName: data.providerName,
      facilityName: data.facilityName,
      dateOfService: data.dateOfService,
      denialDate: data.denialDate,
      cptCode: data.cptCode,
      modifier: data.modifier,
      diagnosisCode: data.diagnosisCode,
      billedAmount: data.billedAmount,
      deniedAmount: data.deniedAmount,
      carcCode: data.carcCode,
      rarcCode: data.rarcCode,
      adjustmentGroupCode: data.adjustmentGroupCode,
      denialCategory: data.denialCategory || 'other',
      status: data.status || 'New',
      priority: data.priority || 'normal',
      filingDeadline: data.filingDeadline ? new Date(data.filingDeadline) : null,
      filingDeadlineDays: data.filingDeadlineDays,
      isTimelyFilingRisk: data.isTimelyFilingRisk || false,
    },
  });

  return mapDenialFromDB(denial);
}

export async function updateDenialDB(id: string, updates: Partial<Denial>): Promise<Denial | null> {
  try {
    const data: any = {};

    // Map only defined fields
    if (updates.status !== undefined) data.status = updates.status;
    if (updates.priority !== undefined) data.priority = updates.priority;

    // Handle nested analysis update
    if (updates.analysis) {
      await db.denialAnalysis.upsert({
        where: { denialId: id },
        create: {
          denialId: id,
          denialSummary: updates.analysis.denialSummary,
          rootCauseCategory: updates.analysis.rootCauseCategory,
          rootCauseDetail: updates.analysis.rootCauseDetail,
          denialCategory: updates.analysis.denialCategory,
          preventable: updates.analysis.preventable,
          correctable: updates.analysis.correctable,
          appealRecommended: updates.analysis.appealRecommended,
          confidenceScore: updates.analysis.confidenceScore,
          recommendedNextAction: updates.analysis.recommendedNextAction,
          requiredInformation: JSON.stringify(updates.analysis.requiredInformation),
          complianceNotes: JSON.stringify(updates.analysis.complianceNotes),
        },
        update: {
          denialSummary: updates.analysis.denialSummary,
          rootCauseCategory: updates.analysis.rootCauseCategory,
          rootCauseDetail: updates.analysis.rootCauseDetail,
          denialCategory: updates.analysis.denialCategory,
          preventable: updates.analysis.preventable,
          correctable: updates.analysis.correctable,
          appealRecommended: updates.analysis.appealRecommended,
          confidenceScore: updates.analysis.confidenceScore,
          recommendedNextAction: updates.analysis.recommendedNextAction,
          requiredInformation: JSON.stringify(updates.analysis.requiredInformation),
          complianceNotes: JSON.stringify(updates.analysis.complianceNotes),
        },
      });
    }

    // Handle nested correction update
    if (updates.correction) {
      await db.correctionSuggestion.upsert({
        where: { denialId: id },
        create: {
          denialId: id,
          correctionType: updates.correction.correctionType,
          correctionSummary: updates.correction.correctionSummary,
          correctionRationale: updates.correction.correctionRationale,
          proposedChanges: JSON.stringify(updates.correction.proposedChanges),
          requiredDocuments: JSON.stringify(updates.correction.requiredDocuments),
          resubmissionInstructions: JSON.stringify(updates.correction.resubmissionInstructions),
          confidenceScore: updates.correction.confidenceScore,
          riskLevel: updates.correction.riskLevel,
          complianceNotes: JSON.stringify(updates.correction.complianceNotes),
        },
        update: {
          correctionType: updates.correction.correctionType,
          correctionSummary: updates.correction.correctionSummary,
          correctionRationale: updates.correction.correctionRationale,
          proposedChanges: JSON.stringify(updates.correction.proposedChanges),
          requiredDocuments: JSON.stringify(updates.correction.requiredDocuments),
          resubmissionInstructions: JSON.stringify(updates.correction.resubmissionInstructions),
          confidenceScore: updates.correction.confidenceScore,
          riskLevel: updates.correction.riskLevel,
          complianceNotes: JSON.stringify(updates.correction.complianceNotes),
        },
      });
    }

    // Handle nested quality check update
    if (updates.qualityCheck) {
      await db.qualityCheck.upsert({
        where: { denialId: id },
        create: {
          denialId: id,
          overallResult: updates.qualityCheck.overallResult,
          validationFindings: JSON.stringify(updates.qualityCheck.validationFindings),
          blockingIssues: JSON.stringify(updates.qualityCheck.blockingIssues),
          warnings: JSON.stringify(updates.qualityCheck.warnings),
          recommendation: updates.qualityCheck.recommendation,
          confidenceScore: updates.qualityCheck.confidenceScore,
        },
        update: {
          overallResult: updates.qualityCheck.overallResult,
          validationFindings: JSON.stringify(updates.qualityCheck.validationFindings),
          blockingIssues: JSON.stringify(updates.qualityCheck.blockingIssues),
          warnings: JSON.stringify(updates.qualityCheck.warnings),
          recommendation: updates.qualityCheck.recommendation,
          confidenceScore: updates.qualityCheck.confidenceScore,
        },
      });
    }

    const denial = await db.denial.update({
      where: { id },
      data,
      include: { analysis: true, correction: true, qualityCheck: true },
    });

    return mapDenialFromDB(denial);
  } catch (error) {
    console.error('Prisma updateDenial error:', error);
    return null;
  }
}

export async function bulkCreateDenialsDB(denials: Array<Omit<Denial, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Denial[]> {
  const created: Denial[] = [];

  for (const d of denials) {
    try {
      const denial = await createDenialDB(d);
      created.push(denial);
    } catch (error) {
      // Skip duplicates (unique constraint on claimNumber)
      console.error('Skip duplicate or error:', (error as Error).message);
    }
  }

  return created;
}

// ─── AUDIT LOGS ─────────────────────────────────────────────────────────────

export async function createAuditLogDB(entry: {
  userId?: string;
  denialId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  oldValues?: string;
  newValues?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: string;
}) {
  return db.auditLog.create({ data: entry });
}

export async function getAuditLogsDB(filters?: {
  userId?: string;
  denialId?: string;
  action?: string;
  limit?: number;
  offset?: number;
}) {
  return db.auditLog.findMany({
    where: {
      ...(filters?.userId && { userId: filters.userId }),
      ...(filters?.denialId && { denialId: filters.denialId }),
      ...(filters?.action && { action: filters.action }),
    },
    orderBy: { createdAt: 'desc' },
    take: filters?.limit || 50,
    skip: filters?.offset || 0,
    include: { user: { select: { name: true, email: true } } },
  });
}

// ─── HELPER: Map DB record to Denial type ───────────────────────────────────

function mapDenialFromDB(record: any): Denial {
  return {
    id: record.id,
    claimNumber: record.claimNumber,
    patientName: record.patientName,
    patientDOB: record.patientDOB,
    patientMemberId: record.patientMemberId ?? undefined,
    payerName: record.payerName,
    payerId: record.payerId,
    providerNPI: record.providerNPI,
    providerName: record.providerName ?? undefined,
    facilityName: record.facilityName ?? undefined,
    dateOfService: record.dateOfService,
    denialDate: record.denialDate,
    cptCode: record.cptCode,
    modifier: record.modifier ?? undefined,
    diagnosisCode: record.diagnosisCode,
    billedAmount: record.billedAmount,
    deniedAmount: record.deniedAmount,
    carcCode: record.carcCode,
    rarcCode: record.rarcCode ?? undefined,
    adjustmentGroupCode: record.adjustmentGroupCode,
    denialCategory: record.denialCategory,
    status: record.status as any,
    priority: record.priority as any,
    filingDeadline: record.filingDeadline?.toISOString(),
    filingDeadlineDays: record.filingDeadlineDays ?? undefined,
    isTimelyFilingRisk: record.isTimelyFilingRisk,
    analysis: record.analysis ? {
      denialSummary: record.analysis.denialSummary,
      rootCauseCategory: record.analysis.rootCauseCategory,
      rootCauseDetail: record.analysis.rootCauseDetail,
      denialCategory: record.analysis.denialCategory,
      preventable: record.analysis.preventable,
      correctable: record.analysis.correctable,
      appealRecommended: record.analysis.appealRecommended,
      confidenceScore: record.analysis.confidenceScore,
      recommendedNextAction: record.analysis.recommendedNextAction,
      requiredInformation: JSON.parse(record.analysis.requiredInformation || '[]'),
      complianceNotes: JSON.parse(record.analysis.complianceNotes || '[]'),
      analyzedAt: record.analysis.analyzedAt?.toISOString() || record.analysis.createdAt?.toISOString(),
    } : undefined,
    correction: record.correction ? {
      correctionType: record.correction.correctionType,
      correctionSummary: record.correction.correctionSummary,
      correctionRationale: record.correction.correctionRationale,
      proposedChanges: JSON.parse(record.correction.proposedChanges || '[]'),
      requiredDocuments: JSON.parse(record.correction.requiredDocuments || '[]'),
      resubmissionInstructions: JSON.parse(record.correction.resubmissionInstructions || '{}'),
      confidenceScore: record.correction.confidenceScore,
      riskLevel: record.correction.riskLevel as any,
      complianceNotes: JSON.parse(record.correction.complianceNotes || '[]'),
      createdAt: record.correction.createdAt?.toISOString(),
    } : undefined,
    qualityCheck: record.qualityCheck ? {
      overallResult: record.qualityCheck.overallResult as any,
      validationFindings: JSON.parse(record.qualityCheck.validationFindings || '[]'),
      blockingIssues: JSON.parse(record.qualityCheck.blockingIssues || '[]'),
      warnings: JSON.parse(record.qualityCheck.warnings || '[]'),
      recommendation: record.qualityCheck.recommendation,
      confidenceScore: record.qualityCheck.confidenceScore,
      checkedAt: record.qualityCheck.checkedAt?.toISOString() || record.qualityCheck.createdAt?.toISOString(),
    } : undefined,
    createdAt: record.createdAt?.toISOString() || new Date().toISOString(),
    updatedAt: record.updatedAt?.toISOString() || new Date().toISOString(),
  };
}
