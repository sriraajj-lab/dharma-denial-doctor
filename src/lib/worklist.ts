/**
 * AI-Ranked Worklist Engine
 * Ranks denials by optimal work order based on:
 * 1. Timely filing urgency (days remaining until deadline)
 * 2. Predicted success rate (from resubmission intelligence)
 * 3. Dollar value at risk
 * 4. Payer response speed (faster payers = quicker revenue)
 * 5. Claim age (older = more urgent)
 */

import { Denial } from './types';
import { getDenials } from './data';
import { calculateFilingDeadline } from './payer-rules';

export interface WorklistItem {
  denial: Denial;
  workScore: number;
  rank: number;
  urgencyScore: number;
  valueScore: number;
  successScore: number;
  payerSpeedScore: number;
  reasons: string[];
  recommendedAction: string;
  estimatedRevenue: number;
  daysUntilDeadline: number | null;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
}

const WEIGHTS = { urgency: 0.35, value: 0.25, success: 0.25, payerSpeed: 0.15 };

const PAYER_SPEED: Record<string, number> = {
  medicare: 14, unitedhealthcare: 21, uhc: 21, 'blue cross': 18, bcbs: 18,
  aetna: 25, cigna: 20, humana: 22, anthem: 20, kaiser: 15,
};

const CATEGORY_SUCCESS: Record<string, number> = {
  missing_information: 92, coding_error: 85, bundling: 72, authorization: 65,
  duplicate: 80, medical_necessity: 45, eligibility: 40, timely_filing: 15, other: 50,
};

export function generateWorklist(filters?: {
  status?: string[]; category?: string; payerName?: string; minAmount?: number; maxItems?: number;
}): { items: WorklistItem[]; summary: { totalItems: number; totalAtRisk: number; criticalCount: number; highCount: number; mediumCount: number; lowCount: number; totalPotentialRevenue: number; avgSuccessRate: number; itemsApproachingDeadline: number } } {
  let denials = getDenials();
  const workableStatuses = filters?.status || ['New', 'Analyzed', 'Corrected', 'Reviewed'];
  denials = denials.filter(d => workableStatuses.includes(d.status));
  if (filters?.category) denials = denials.filter(d => d.denialCategory === filters.category);
  if (filters?.payerName) denials = denials.filter(d => d.payerName.toLowerCase().includes(filters.payerName!.toLowerCase()));
  if (filters?.minAmount) denials = denials.filter(d => d.deniedAmount >= filters.minAmount!);

  const items: WorklistItem[] = denials.map(denial => {
    const urgencyScore = calcUrgency(denial);
    const valueScore = calcValue(denial);
    const successScore = CATEGORY_SUCCESS[denial.denialCategory] || 50;
    const payerSpeedScore = calcPayerSpeed(denial);
    const workScore = Math.round((WEIGHTS.urgency * urgencyScore) + (WEIGHTS.value * valueScore) + (WEIGHTS.success * successScore) + (WEIGHTS.payerSpeed * payerSpeedScore));
    const daysUntilDeadline = calcDeadlineDays(denial);
    let riskLevel: WorklistItem['riskLevel'] = 'low';
    if (daysUntilDeadline !== null && daysUntilDeadline <= 7) riskLevel = 'critical';
    else if (daysUntilDeadline !== null && daysUntilDeadline <= 14) riskLevel = 'high';
    else if (workScore >= 70) riskLevel = 'high';
    else if (workScore >= 45) riskLevel = 'medium';

    const reasons: string[] = [];
    if (daysUntilDeadline !== null && daysUntilDeadline <= 14) reasons.push(`${daysUntilDeadline}d to deadline`);
    if (valueScore >= 70) reasons.push(`High value: $${denial.deniedAmount.toLocaleString()}`);
    if (successScore >= 80) reasons.push(`${successScore}% success rate`);
    if (denial.analysis?.correctable) reasons.push('AI confirmed correctable');
    if (reasons.length === 0) reasons.push('Standard priority');

    let recommendedAction = 'Review Claim';
    if (denial.status === 'New') recommendedAction = 'Run Analysis';
    else if (denial.status === 'Analyzed' && denial.analysis?.correctable) recommendedAction = 'Generate Correction';
    else if (denial.status === 'Analyzed' && denial.analysis?.appealRecommended) recommendedAction = 'Generate Appeal';
    else if (denial.status === 'Corrected') recommendedAction = 'Quality Check';
    else if (denial.status === 'Reviewed') recommendedAction = 'Resubmit';

    return { denial, workScore, rank: 0, urgencyScore, valueScore, successScore, payerSpeedScore, reasons, recommendedAction, estimatedRevenue: denial.deniedAmount * (successScore / 100), daysUntilDeadline, riskLevel };
  });

  items.sort((a, b) => b.workScore - a.workScore);
  items.forEach((item, idx) => { item.rank = idx + 1; });
  const limited = filters?.maxItems ? items.slice(0, filters.maxItems) : items;

  return {
    items: limited,
    summary: {
      totalItems: limited.length,
      totalAtRisk: limited.filter(i => i.daysUntilDeadline !== null && i.daysUntilDeadline <= 30).length,
      criticalCount: limited.filter(i => i.riskLevel === 'critical').length,
      highCount: limited.filter(i => i.riskLevel === 'high').length,
      mediumCount: limited.filter(i => i.riskLevel === 'medium').length,
      lowCount: limited.filter(i => i.riskLevel === 'low').length,
      totalPotentialRevenue: limited.reduce((s, i) => s + i.estimatedRevenue, 0),
      avgSuccessRate: limited.length > 0 ? Math.round(limited.reduce((s, i) => s + i.successScore, 0) / limited.length) : 0,
      itemsApproachingDeadline: limited.filter(i => i.daysUntilDeadline !== null && i.daysUntilDeadline <= 14).length,
    },
  };
}

function calcUrgency(d: Denial): number {
  const days = calcDeadlineDays(d);
  if (days === null) return 50;
  if (days <= 0) return 100;
  if (days <= 7) return 95;
  if (days <= 14) return 85;
  if (days <= 30) return 70;
  if (days <= 60) return 50;
  return 20;
}
function calcValue(d: Denial): number {
  if (d.deniedAmount >= 10000) return 100;
  if (d.deniedAmount >= 5000) return 85;
  if (d.deniedAmount >= 2000) return 70;
  if (d.deniedAmount >= 1000) return 55;
  if (d.deniedAmount >= 500) return 40;
  return 20;
}
function calcPayerSpeed(d: Denial): number {
  const payer = d.payerName.toLowerCase();
  let speed = 30;
  for (const [k, v] of Object.entries(PAYER_SPEED)) { if (payer.includes(k)) { speed = v; break; } }
  if (speed <= 14) return 90;
  if (speed <= 18) return 75;
  if (speed <= 21) return 60;
  if (speed <= 25) return 45;
  return 30;
}
function calcDeadlineDays(d: Denial): number | null {
  if (d.filingDeadlineDays !== undefined && d.filingDeadlineDays !== null) return d.filingDeadlineDays;
  try {
    const r = calculateFilingDeadline(d.payerName, d.dateOfService, d.denialDate);
    return r.daysRemaining;
  } catch { return null; }
}
