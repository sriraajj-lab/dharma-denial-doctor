/**
 * UNIFIED DATA ACCESS LAYER
 * 
 * FIX: Critical Issue 3 — Dual data layer eliminated
 * 
 * Previously this file used in-memory/JSON file storage, creating a data corruption
 * risk with the Prisma layer. Now ALL data access goes through Prisma exclusively.
 * 
 * The JSON file fallback has been removed. Prisma (SQLite) is the single source of truth.
 * If Prisma is unavailable (e.g., during build), functions return safe defaults.
 */

import { db } from './db';
import { Denial } from './types';

// ─── DENIALS ────────────────────────────────────────────────────────────────

export async function getDenials(): Promise<Denial[]> {
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
    console.error('[DataLayer] Prisma getDenials error:', error);
    return [];
  }
}

export async function getDenialById(id: string): Promise<Denial | null> {
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
    console.error('[DataLayer] Prisma getDenialById error:', error);
    return null;
  }
}

export async function createDenial(data: Omit<Denial, 'id' | 'createdAt' | 'updatedAt'>): Promise<Denial> {
  try {
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
        diagnosisCode2: data.diagnosisCode2,
        diagnosisCode3: data.diagnosisCode3,
        diagnosisCode4: data.diagnosisCode4,
        billedAmount: data.billedAmount,
        deniedAmount: data.deniedAmount,
        allowedAmount: data.allowedAmount,
        paidAmount: data.paidAmount,
        carcCode: data.carcCode,
        rarcCode: data.rarcCode,
        adjustmentGroupCode: data.adjustmentGroupCode,
        denialCategory: data.denialCategory || 'other',
        status: data.status || 'New',
        priority: data.priority || 'normal',
        filingDeadline: data.filingDeadline ? new Date(data.filingDeadline) : null,
        filingDeadlineDays: data.filingDeadlineDays,
        isTimelyFilingRisk: data.isTimelyFilingRisk || false,
        batchId: data.batchId,
      },
    });

    return mapDenialFromDB(denial);
  } catch (error) {
    console.error('[DataLayer] Prisma createDenial error:', error);
    throw error;
  }
}

export async function updateDenial(id: string, updates: Partial<Denial>): Promise<Denial | null> {
  try {
    const data: Record<string, unknown> = {};

    // Map only defined fields to prevent overwriting with undefined
    if (updates.status !== undefined) data.status = updates.status;
    if (updates.priority !== undefined) data.priority = updates.priority;
    if (updates.denialCategory !== undefined) data.denialCategory = updates.denialCategory;
    if (updates.paidAmount !== undefined) data.paidAmount = updates.paidAmount;
    if (updates.allowedAmount !== undefined) data.allowedAmount = updates.allowedAmount;
    if (updates.isTimelyFilingRisk !== undefined) data.isTimelyFilingRisk = updates.isTimelyFilingRisk;
    if (updates.filingDeadline !== undefined) data.filingDeadline = updates.filingDeadline ? new Date(updates.filingDeadline) : null;
    if (updates.filingDeadlineDays !== undefined) data.filingDeadlineDays = updates.filingDeadlineDays;

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
    console.error('[DataLayer] Prisma updateDenial error:', error);
    return null;
  }
}

export async function bulkCreateDenials(newDenials: Array<Omit<Denial, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Denial[]> {
  const created: Denial[] = [];

  for (const d of newDenials) {
    try {
      const denial = await createDenial(d);
      created.push(denial);
    } catch (error) {
      // Skip duplicates (unique constraint on claimNumber)
      console.error('[DataLayer] Skip duplicate or error:', (error as Error).message);
    }
  }

  return created;
}

// ─── DASHBOARD STATS ────────────────────────────────────────────────────────

export async function getDashboardStats() {
  try {
    const denials = await db.denial.findMany({
      include: { analysis: true, financials: true },
      orderBy: { createdAt: 'desc' },
    });

    const totalDenials = denials.length;
    const totalDeniedAmount = denials.reduce((sum, d) => sum + d.deniedAmount, 0);

    // Calculate actual recovered from financial tracking
    const actualRecovered = denials.reduce((sum, d) => {
      const payments = d.financials
        .filter(f => f.eventType === 'full_payment' || f.eventType === 'partial_payment')
        .reduce((s, f) => s + f.amount, 0);
      return sum + payments;
    }, 0);

    // Estimate recovery for closed/resubmitted without financial records
    const estimatedRecovery = denials
      .filter(d => d.status === 'Closed' || d.status === 'Resubmitted')
      .reduce((sum, d) => {
        const hasPayments = d.financials.some(f => f.eventType === 'full_payment' || f.eventType === 'partial_payment');
        return sum + (hasPayments ? 0 : d.deniedAmount * 0.65);
      }, 0);

    const totalRecoveredAmount = actualRecovered + estimatedRecovery;
    const recoveryRate = totalDeniedAmount > 0 ? (totalRecoveredAmount / totalDeniedAmount) * 100 : 0;

    const now = new Date();
    const closedDenials = denials.filter(d => d.status === 'Closed');
    const avgDaysToResolve = closedDenials.length > 0
      ? closedDenials.reduce((sum, d) => {
          const created = new Date(d.createdAt);
          const updated = new Date(d.updatedAt);
          return sum + (updated.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
        }, 0) / closedDenials.length
      : 0;

    const statusCounts = {
      New: denials.filter(d => d.status === 'New').length,
      Analyzed: denials.filter(d => d.status === 'Analyzed').length,
      Corrected: denials.filter(d => d.status === 'Corrected').length,
      Reviewed: denials.filter(d => d.status === 'Reviewed').length,
      Resubmitted: denials.filter(d => d.status === 'Resubmitted').length,
      Appealed: denials.filter(d => d.status === 'Appealed').length,
      Closed: denials.filter(d => d.status === 'Closed').length,
    };

    const categoryMap = new Map<string, { count: number; amount: number }>();
    denials.forEach(d => {
      const cat = d.denialCategory || 'other';
      const existing = categoryMap.get(cat) || { count: 0, amount: 0 };
      categoryMap.set(cat, { count: existing.count + 1, amount: existing.amount + d.deniedAmount });
    });
    const categoryBreakdown = Array.from(categoryMap.entries()).map(([category, data]) => ({
      category,
      ...data,
    }));

    const payerMap = new Map<string, { count: number; amount: number }>();
    denials.forEach(d => {
      const existing = payerMap.get(d.payerName) || { count: 0, amount: 0 };
      payerMap.set(d.payerName, { count: existing.count + 1, amount: existing.amount + d.deniedAmount });
    });
    const payerBreakdown = Array.from(payerMap.entries()).map(([payer, data]) => ({
      payer,
      ...data,
    }));

    const recentDenials = denials.slice(0, 10);

    const agingBuckets = [
      { bucket: '0-30 days', count: 0, amount: 0 },
      { bucket: '31-60 days', count: 0, amount: 0 },
      { bucket: '61-90 days', count: 0, amount: 0 },
      { bucket: '90+ days', count: 0, amount: 0 },
    ];
    denials.forEach(d => {
      const days = (now.getTime() - new Date(d.denialDate).getTime()) / (1000 * 60 * 60 * 24);
      if (days <= 30) {
        agingBuckets[0].count++;
        agingBuckets[0].amount += d.deniedAmount;
      } else if (days <= 60) {
        agingBuckets[1].count++;
        agingBuckets[1].amount += d.deniedAmount;
      } else if (days <= 90) {
        agingBuckets[2].count++;
        agingBuckets[2].amount += d.deniedAmount;
      } else {
        agingBuckets[3].count++;
        agingBuckets[3].amount += d.deniedAmount;
      }
    });

    const timelyFilingAtRisk = denials.filter(d => d.isTimelyFilingRisk && d.status !== 'Closed').length;

    return {
      totalDenials,
      totalDeniedAmount,
      totalRecoveredAmount,
      actualRecoveredAmount: actualRecovered,
      recoveryRate,
      actualRecoveryRate: totalDeniedAmount > 0 ? (actualRecovered / totalDeniedAmount) * 100 : 0,
      avgDaysToResolve,
      ...statusCounts,
      newDenialsCount: statusCounts.New,
      analyzedCount: statusCounts.Analyzed,
      correctedCount: statusCounts.Corrected,
      reviewedCount: statusCounts.Reviewed,
      resubmittedCount: statusCounts.Resubmitted,
      appealedCount: statusCounts.Appealed,
      closedCount: statusCounts.Closed,
      categoryBreakdown,
      payerBreakdown,
      recentDenials: recentDenials.map(mapDenialFromDB),
      agingBuckets,
      timelyFilingAtRisk,
      pendingAppeals: statusCounts.Appealed,
      activeBatchJobs: 0,
    };
  } catch (error) {
    console.error('[DataLayer] Dashboard stats error:', error);
    return {
      totalDenials: 0,
      totalDeniedAmount: 0,
      totalRecoveredAmount: 0,
      actualRecoveredAmount: 0,
      recoveryRate: 0,
      actualRecoveryRate: 0,
      avgDaysToResolve: 0,
      New: 0, Analyzed: 0, Corrected: 0, Reviewed: 0, Resubmitted: 0, Appealed: 0, Closed: 0,
      newDenialsCount: 0, analyzedCount: 0, correctedCount: 0, reviewedCount: 0,
      resubmittedCount: 0, appealedCount: 0, closedCount: 0,
      categoryBreakdown: [],
      payerBreakdown: [],
      recentDenials: [],
      agingBuckets: [
        { bucket: '0-30 days', count: 0, amount: 0 },
        { bucket: '31-60 days', count: 0, amount: 0 },
        { bucket: '61-90 days', count: 0, amount: 0 },
        { bucket: '90+ days', count: 0, amount: 0 },
      ],
      timelyFilingAtRisk: 0,
      pendingAppeals: 0,
      activeBatchJobs: 0,
    };
  }
}

// ─── HELPER: Map DB record to Denial type ───────────────────────────────────

function mapDenialFromDB(record: Record<string, unknown>): Denial {
  const analysis = record.analysis as Record<string, unknown> | null;
  const correction = record.correction as Record<string, unknown> | null;
  const qualityCheck = record.qualityCheck as Record<string, unknown> | null;

  return {
    id: record.id as string,
    claimNumber: record.claimNumber as string,
    patientName: record.patientName as string,
    patientDOB: record.patientDOB as string,
    patientMemberId: (record.patientMemberId as string) || undefined,
    payerName: record.payerName as string,
    payerId: record.payerId as string,
    providerNPI: record.providerNPI as string,
    providerName: (record.providerName as string) || undefined,
    facilityName: (record.facilityName as string) || undefined,
    dateOfService: record.dateOfService as string,
    denialDate: record.denialDate as string,
    cptCode: record.cptCode as string,
    modifier: (record.modifier as string) || undefined,
    diagnosisCode: record.diagnosisCode as string,
    diagnosisCode2: (record.diagnosisCode2 as string) || undefined,
    diagnosisCode3: (record.diagnosisCode3 as string) || undefined,
    diagnosisCode4: (record.diagnosisCode4 as string) || undefined,
    billedAmount: record.billedAmount as number,
    deniedAmount: record.deniedAmount as number,
    allowedAmount: (record.allowedAmount as number) || undefined,
    paidAmount: (record.paidAmount as number) || undefined,
    carcCode: record.carcCode as string,
    rarcCode: (record.rarcCode as string) || undefined,
    adjustmentGroupCode: record.adjustmentGroupCode as string,
    denialCategory: record.denialCategory as string,
    status: record.status as Denial['status'],
    priority: record.priority as Denial['priority'],
    filingDeadline: record.filingDeadline ? new Date(record.filingDeadline as string).toISOString() : undefined,
    filingDeadlineDays: (record.filingDeadlineDays as number) || undefined,
    isTimelyFilingRisk: (record.isTimelyFilingRisk as boolean) || false,
    batchId: (record.batchId as string) || undefined,
    analysis: analysis ? {
      denialSummary: analysis.denialSummary as string,
      rootCauseCategory: analysis.rootCauseCategory as string,
      rootCauseDetail: analysis.rootCauseDetail as string,
      denialCategory: analysis.denialCategory as string,
      preventable: analysis.preventable as boolean,
      correctable: analysis.correctable as boolean,
      appealRecommended: analysis.appealRecommended as boolean,
      confidenceScore: analysis.confidenceScore as number,
      recommendedNextAction: analysis.recommendedNextAction as string,
      requiredInformation: JSON.parse((analysis.requiredInformation as string) || '[]'),
      complianceNotes: JSON.parse((analysis.complianceNotes as string) || '[]'),
      analyzedAt: analysis.analyzedAt ? new Date(analysis.analyzedAt as string).toISOString() : new Date(analysis.createdAt as string).toISOString(),
    } : undefined,
    correction: correction ? {
      correctionType: correction.correctionType as string,
      correctionSummary: correction.correctionSummary as string,
      correctionRationale: correction.correctionRationale as string,
      proposedChanges: JSON.parse((correction.proposedChanges as string) || '[]'),
      requiredDocuments: JSON.parse((correction.requiredDocuments as string) || '[]'),
      resubmissionInstructions: JSON.parse((correction.resubmissionInstructions as string) || '{}'),
      confidenceScore: correction.confidenceScore as number,
      riskLevel: correction.riskLevel as 'low' | 'medium' | 'high',
      complianceNotes: JSON.parse((correction.complianceNotes as string) || '[]'),
      createdAt: correction.createdAt ? new Date(correction.createdAt as string).toISOString() : new Date().toISOString(),
    } : undefined,
    qualityCheck: qualityCheck ? {
      overallResult: qualityCheck.overallResult as 'pass' | 'fail' | 'warning',
      validationFindings: JSON.parse((qualityCheck.validationFindings as string) || '[]'),
      blockingIssues: JSON.parse((qualityCheck.blockingIssues as string) || '[]'),
      warnings: JSON.parse((qualityCheck.warnings as string) || '[]'),
      recommendation: qualityCheck.recommendation as string,
      confidenceScore: qualityCheck.confidenceScore as number,
      checkedAt: qualityCheck.checkedAt ? new Date(qualityCheck.checkedAt as string).toISOString() : new Date(qualityCheck.createdAt as string).toISOString(),
    } : undefined,
    createdAt: record.createdAt ? new Date(record.createdAt as string).toISOString() : new Date().toISOString(),
    updatedAt: record.updatedAt ? new Date(record.updatedAt as string).toISOString() : new Date().toISOString(),
  };
}
