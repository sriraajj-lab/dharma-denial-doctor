/**
 * Client Health Scan Report
 * Comprehensive practice health assessment scoring:
 * 1. Denial Rate Score (vs industry benchmarks)
 * 2. Recovery Potential Score
 * 3. Coding Accuracy Score
 * 4. Timely Filing Compliance Score
 * 5. Payer Mix Health Score
 *
 * Also provides:
 * - Per-payer grading (A-F)
 * - Preventable denial analysis
 * - Month-over-month trends
 * - Industry benchmark comparisons
 * - Actionable improvement plan
 */

import { Denial } from './types';
import { getDenials } from './data';

// ─── INDUSTRY BENCHMARKS ────────────────────────────────────────────────────

const BENCHMARKS = {
  denialRate: { excellent: 5, good: 8, average: 12, poor: 18, critical: 25 },
  recoveryRate: { excellent: 85, good: 70, average: 55, poor: 40, critical: 25 },
  codingAccuracy: { excellent: 95, good: 90, average: 85, poor: 75, critical: 65 },
  timelyFilingCompliance: { excellent: 98, good: 95, average: 90, poor: 80, critical: 70 },
  avgDaysToResolve: { excellent: 14, good: 21, average: 30, poor: 45, critical: 60 },
};

// ─── TYPES ──────────────────────────────────────────────────────────────────

export interface HealthScanReport {
  id: string;
  generatedAt: string;
  clientName: string;
  reportPeriod: { start: string; end: string; label: string };

  // Overall Score
  overallScore: number; // 0-100
  overallGrade: string; // A+, A, B+, B, C+, C, D, F
  overallLabel: string; // Excellent, Good, Needs Improvement, Poor, Critical
  overallColor: string;

  // 5 Dimension Scores
  dimensions: {
    denialRate: DimensionScore;
    recoveryPotential: DimensionScore;
    codingAccuracy: DimensionScore;
    timelyFilingCompliance: DimensionScore;
    payerMixHealth: DimensionScore;
  };

  // Key Metrics
  metrics: {
    totalClaims: number;
    totalDenials: number;
    denialRate: number;
    totalDeniedAmount: number;
    estimatedRecoverable: number;
    preventablePercentage: number;
    correctablePercentage: number;
    avgDaysToResolve: number;
    topDenialCategory: string;
    topDenialCategoryPercentage: number;
  };

  // Payer Grades
  payerGrades: PayerGrade[];

  // Preventable Analysis
  preventableAnalysis: {
    preventableCount: number;
    preventableAmount: number;
    preventablePercentage: number;
    rootCauses: Array<{ cause: string; count: number; amount: number; percentage: number }>;
    preventionRecommendations: string[];
  };

  // Improvement Plan
  improvementPlan: ImprovementAction[];

  // Trends (if historical data available)
  trends: {
    hasHistory: boolean;
    scoreChange: number; // +/- from previous period
    denialRateChange: number;
    recoveryChange: number;
    direction: 'improving' | 'declining' | 'stable';
    monthlyScores: Array<{ month: string; score: number; denialRate: number }>;
  };

  // Executive Summary (for client presentation)
  executiveSummary: string;
  keyFindings: string[];
  criticalActions: string[];
}

export interface DimensionScore {
  score: number; // 0-100
  grade: string; // A-F
  value: number; // actual metric value
  benchmark: number; // industry benchmark
  status: 'above' | 'at' | 'below'; // vs benchmark
  insight: string;
}

export interface PayerGrade {
  payerName: string;
  grade: string; // A-F
  score: number;
  denialCount: number;
  denialAmount: number;
  denialRate: number;
  recoveryRate: number;
  avgDaysToResolve: number;
  topDenialReason: string;
  recommendation: string;
}

export interface ImprovementAction {
  priority: number;
  category: string;
  action: string;
  expectedImpact: string;
  estimatedRecovery: number;
  timeframe: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

// ─── MAIN FUNCTION ──────────────────────────────────────────────────────────

export async function generateHealthScan(options?: {
  clientName?: string;
  totalClaimsSubmitted?: number; // needed to calculate denial rate
}): Promise<HealthScanReport> {
  const denials = await getDenials();
  const now = new Date();
  const clientName = options?.clientName || 'Client Practice';
  const totalClaimsSubmitted = options?.totalClaimsSubmitted || Math.round(denials.length / 0.12); // estimate 12% denial rate if not provided

  // Calculate core metrics
  const totalDenials = denials.length;
  const totalDeniedAmount = denials.reduce((s, d) => s + d.deniedAmount, 0);
  const denialRate = totalClaimsSubmitted > 0 ? Math.round((totalDenials / totalClaimsSubmitted) * 100) : 12;

  // Preventable/correctable
  const analyzed = denials.filter(d => d.analysis);
  const preventable = analyzed.filter(d => d.analysis?.preventable);
  const correctable = analyzed.filter(d => d.analysis?.correctable);
  const preventablePercentage = analyzed.length > 0 ? Math.round((preventable.length / analyzed.length) * 100) : 65;
  const correctablePercentage = analyzed.length > 0 ? Math.round((correctable.length / analyzed.length) * 100) : 70;

  // Coding accuracy (inverse of coding error rate)
  const codingErrors = denials.filter(d => d.denialCategory === 'coding_error' || d.denialCategory === 'bundling');
  const codingErrorRate = totalDenials > 0 ? (codingErrors.length / totalDenials) * 100 : 15;
  const codingAccuracy = Math.round(100 - codingErrorRate);

  // Timely filing compliance
  const timelyFilingDenials = denials.filter(d => d.denialCategory === 'timely_filing');
  const timelyFilingRate = totalClaimsSubmitted > 0 ? Math.round(((totalClaimsSubmitted - timelyFilingDenials.length) / totalClaimsSubmitted) * 100) : 95;

  // Avg days to resolve
  const resolved = denials.filter(d => d.status === 'Closed' || d.status === 'Resubmitted');
  const avgDays = resolved.length > 0 ? Math.round(resolved.reduce((s, d) => s + (new Date(d.updatedAt).getTime() - new Date(d.createdAt).getTime()) / (1000 * 60 * 60 * 24), 0) / resolved.length) : 28;

  // Recovery potential
  const estimatedRecoverable = totalDeniedAmount * (correctablePercentage / 100) * 0.85;
  const recoveryRate = totalDeniedAmount > 0 ? Math.round((estimatedRecoverable / totalDeniedAmount) * 100) : 55;

  // Dimension scores
  const dimensions = {
    denialRate: scoreDenialRate(denialRate),
    recoveryPotential: scoreRecovery(recoveryRate),
    codingAccuracy: scoreCodingAccuracy(codingAccuracy),
    timelyFilingCompliance: scoreTimelyFiling(timelyFilingRate),
    payerMixHealth: scorePayerMix(denials),
  };

  // Overall score (weighted average)
  const overallScore = Math.round(
    dimensions.denialRate.score * 0.25 +
    dimensions.recoveryPotential.score * 0.25 +
    dimensions.codingAccuracy.score * 0.20 +
    dimensions.timelyFilingCompliance.score * 0.15 +
    dimensions.payerMixHealth.score * 0.15
  );

  const { grade: overallGrade, label: overallLabel, color: overallColor } = getGradeFromScore(overallScore);

  // Payer grades
  const payerGrades = generatePayerGrades(denials, totalClaimsSubmitted);

  // Preventable analysis
  const preventableAnalysis = analyzePreventable(denials, analyzed, preventable);

  // Improvement plan
  const improvementPlan = generateImprovementPlan(denials, dimensions, payerGrades);

  // Top category
  const categoryMap = new Map<string, number>();
  denials.forEach(d => categoryMap.set(d.denialCategory, (categoryMap.get(d.denialCategory) || 0) + 1));
  const topCategory = Array.from(categoryMap.entries()).sort((a, b) => b[1] - a[1])[0];

  // Executive summary
  const executiveSummary = generateExecutiveSummary(overallScore, overallGrade, denialRate, totalDeniedAmount, estimatedRecoverable, preventablePercentage, clientName);
  const keyFindings = generateKeyFindings(dimensions, payerGrades, preventablePercentage, denialRate);
  const criticalActions = improvementPlan.filter(a => a.priority <= 3).map(a => a.action);

  return {
    id: `HS-${Date.now()}`,
    generatedAt: now.toISOString(),
    clientName,
    reportPeriod: { start: denials.length > 0 ? denials.sort((a, b) => a.denialDate.localeCompare(b.denialDate))[0].denialDate : now.toISOString(), end: now.toISOString(), label: 'Current Period' },
    overallScore, overallGrade, overallLabel, overallColor,
    dimensions,
    metrics: {
      totalClaims: totalClaimsSubmitted, totalDenials, denialRate, totalDeniedAmount,
      estimatedRecoverable, preventablePercentage, correctablePercentage, avgDaysToResolve: avgDays,
      topDenialCategory: topCategory ? topCategory[0].replace('_', ' ') : 'N/A',
      topDenialCategoryPercentage: topCategory ? Math.round((topCategory[1] / totalDenials) * 100) : 0,
    },
    payerGrades, preventableAnalysis, improvementPlan,
    trends: { hasHistory: false, scoreChange: 0, denialRateChange: 0, recoveryChange: 0, direction: 'stable', monthlyScores: [] },
    executiveSummary, keyFindings, criticalActions,
  };
}

// ─── SCORING FUNCTIONS ──────────────────────────────────────────────────────

function scoreDenialRate(rate: number): DimensionScore {
  const b = BENCHMARKS.denialRate;
  let score = 50;
  if (rate <= b.excellent) score = 95;
  else if (rate <= b.good) score = 80;
  else if (rate <= b.average) score = 65;
  else if (rate <= b.poor) score = 40;
  else score = 20;

  return { score, grade: getGradeFromScore(score).grade, value: rate, benchmark: b.average, status: rate <= b.average ? 'above' : 'below', insight: rate <= b.good ? `Your denial rate of ${rate}% is better than the industry average of ${b.average}%.` : `Your denial rate of ${rate}% exceeds the industry average of ${b.average}%. Focus on prevention.` };
}

function scoreRecovery(rate: number): DimensionScore {
  const b = BENCHMARKS.recoveryRate;
  let score = 50;
  if (rate >= b.excellent) score = 95;
  else if (rate >= b.good) score = 80;
  else if (rate >= b.average) score = 65;
  else if (rate >= b.poor) score = 40;
  else score = 20;

  return { score, grade: getGradeFromScore(score).grade, value: rate, benchmark: b.average, status: rate >= b.average ? 'above' : 'below', insight: rate >= b.good ? `Recovery potential of ${rate}% is strong.` : `Recovery potential of ${rate}% has room for improvement. Focus on correctable denials.` };
}

function scoreCodingAccuracy(accuracy: number): DimensionScore {
  const b = BENCHMARKS.codingAccuracy;
  let score = 50;
  if (accuracy >= b.excellent) score = 95;
  else if (accuracy >= b.good) score = 80;
  else if (accuracy >= b.average) score = 65;
  else if (accuracy >= b.poor) score = 40;
  else score = 20;

  return { score, grade: getGradeFromScore(score).grade, value: accuracy, benchmark: b.average, status: accuracy >= b.average ? 'above' : 'below', insight: accuracy >= b.good ? `Coding accuracy of ${accuracy}% is above industry standards.` : `Coding accuracy of ${accuracy}% is below the ${b.average}% benchmark. Coder education recommended.` };
}

function scoreTimelyFiling(rate: number): DimensionScore {
  const b = BENCHMARKS.timelyFilingCompliance;
  let score = 50;
  if (rate >= b.excellent) score = 95;
  else if (rate >= b.good) score = 80;
  else if (rate >= b.average) score = 65;
  else if (rate >= b.poor) score = 40;
  else score = 20;

  return { score, grade: getGradeFromScore(score).grade, value: rate, benchmark: b.average, status: rate >= b.average ? 'above' : 'below', insight: rate >= b.good ? `Timely filing compliance of ${rate}% is excellent.` : `Timely filing at ${rate}% - implement deadline alerts to prevent lost revenue.` };
}

function scorePayerMix(denials: Denial[]): DimensionScore {
  const payerMap = new Map<string, number>();
  denials.forEach(d => payerMap.set(d.payerName, (payerMap.get(d.payerName) || 0) + 1));
  const payerCount = payerMap.size;
  const topPayerPct = payerMap.size > 0 ? Math.round((Math.max(...payerMap.values()) / denials.length) * 100) : 0;

  // Diversified payer mix = healthier (not over-dependent on one payer)
  let score = 70;
  if (topPayerPct > 60) score = 40; // too concentrated
  else if (topPayerPct > 40) score = 60;
  else if (payerCount >= 4) score = 80;

  return { score, grade: getGradeFromScore(score).grade, value: payerCount, benchmark: 5, status: payerCount >= 4 ? 'above' : 'below', insight: topPayerPct > 50 ? `Over ${topPayerPct}% of denials from one payer. Diversification recommended.` : `Healthy payer distribution across ${payerCount} payers.` };
}

function getGradeFromScore(score: number): { grade: string; label: string; color: string } {
  if (score >= 93) return { grade: 'A+', label: 'Excellent', color: 'text-emerald-400' };
  if (score >= 85) return { grade: 'A', label: 'Very Good', color: 'text-emerald-400' };
  if (score >= 78) return { grade: 'B+', label: 'Good', color: 'text-blue-400' };
  if (score >= 70) return { grade: 'B', label: 'Above Average', color: 'text-blue-400' };
  if (score >= 63) return { grade: 'C+', label: 'Average', color: 'text-yellow-400' };
  if (score >= 55) return { grade: 'C', label: 'Needs Improvement', color: 'text-yellow-400' };
  if (score >= 45) return { grade: 'D', label: 'Below Average', color: 'text-orange-400' };
  return { grade: 'F', label: 'Critical', color: 'text-red-400' };
}

// ─── PAYER GRADING ──────────────────────────────────────────────────────────

function generatePayerGrades(denials: Denial[], totalClaims: number): PayerGrade[] {
  const payerMap = new Map<string, Denial[]>();
  denials.forEach(d => { const list = payerMap.get(d.payerName) || []; list.push(d); payerMap.set(d.payerName, list); });

  return Array.from(payerMap.entries()).map(([payer, claims]) => {
    const denialCount = claims.length;
    const denialAmount = claims.reduce((s, d) => s + d.deniedAmount, 0);
    const estPayerClaims = Math.round(totalClaims * (denialCount / denials.length));
    const denialRate = estPayerClaims > 0 ? Math.round((denialCount / estPayerClaims) * 100) : 15;
    const correctable = claims.filter(d => d.analysis?.correctable).length;
    const recoveryRate = claims.length > 0 ? Math.round((correctable / claims.length) * 100) : 50;
    const resolved = claims.filter(d => ['Closed', 'Resubmitted'].includes(d.status));
    const avgDays = resolved.length > 0 ? Math.round(resolved.reduce((s, d) => s + (new Date(d.updatedAt).getTime() - new Date(d.createdAt).getTime()) / (1000 * 60 * 60 * 24), 0) / resolved.length) : 30;

    // Score the payer
    let score = 70;
    if (denialRate <= 8) score += 15;
    else if (denialRate >= 20) score -= 20;
    if (recoveryRate >= 70) score += 10;
    else if (recoveryRate <= 40) score -= 15;
    if (avgDays <= 21) score += 5;
    else if (avgDays >= 45) score -= 10;
    score = Math.max(10, Math.min(100, score));

    const { grade } = getGradeFromScore(score);

    // Top denial reason
    const catMap = new Map<string, number>();
    claims.forEach(d => catMap.set(d.denialCategory, (catMap.get(d.denialCategory) || 0) + 1));
    const topCat = Array.from(catMap.entries()).sort((a, b) => b[1] - a[1])[0];

    let recommendation = '';
    if (denialRate > 15) recommendation = 'High denial rate. Review payer-specific submission requirements.';
    else if (recoveryRate < 50) recommendation = 'Low recovery. Consider peer-to-peer reviews and stronger appeals.';
    else if (avgDays > 35) recommendation = 'Slow resolution. Implement proactive follow-up cadence.';
    else recommendation = 'Performing well. Maintain current processes.';

    return { payerName: payer, grade, score, denialCount, denialAmount, denialRate, recoveryRate, avgDaysToResolve: avgDays, topDenialReason: topCat ? topCat[0].replace('_', ' ') : 'N/A', recommendation };
  }).sort((a, b) => a.score - b.score); // worst first
}

// ─── PREVENTABLE ANALYSIS ───────────────────────────────────────────────────

function analyzePreventable(denials: Denial[], analyzed: Denial[], preventable: Denial[]) {
  const preventableAmount = preventable.reduce((s, d) => s + d.deniedAmount, 0);
  const preventablePercentage = analyzed.length > 0 ? Math.round((preventable.length / analyzed.length) * 100) : 65;

  // Root causes of preventable denials
  const causeMap = new Map<string, { count: number; amount: number }>();
  preventable.forEach(d => {
    const cause = d.analysis?.rootCauseCategory || d.denialCategory;
    const e = causeMap.get(cause) || { count: 0, amount: 0 };
    causeMap.set(cause, { count: e.count + 1, amount: e.amount + d.deniedAmount });
  });

  const rootCauses = Array.from(causeMap.entries())
    .map(([cause, data]) => ({ cause, ...data, percentage: preventable.length > 0 ? Math.round((data.count / preventable.length) * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount);

  const recommendations: string[] = [];
  if (rootCauses.find(r => r.cause.includes('coding') || r.cause.includes('Coding'))) recommendations.push('Implement pre-submission coding validation (NCCI edit checks)');
  if (rootCauses.find(r => r.cause.includes('auth') || r.cause.includes('Auth'))) recommendations.push('Add prior authorization verification to scheduling workflow');
  if (rootCauses.find(r => r.cause.includes('missing') || r.cause.includes('Missing'))) recommendations.push('Create claim submission checklist for required fields per payer');
  if (rootCauses.find(r => r.cause.includes('timely') || r.cause.includes('Timely'))) recommendations.push('Set up automated filing deadline alerts at 14 and 7 days');
  if (rootCauses.find(r => r.cause.includes('eligibility') || r.cause.includes('Eligibility'))) recommendations.push('Run real-time eligibility verification before every appointment');
  if (recommendations.length === 0) recommendations.push('Continue monitoring denial patterns for new prevention opportunities');

  return { preventableCount: preventable.length, preventableAmount, preventablePercentage, rootCauses, preventionRecommendations: recommendations };
}

// ─── IMPROVEMENT PLAN ───────────────────────────────────────────────────────

function generateImprovementPlan(denials: Denial[], dimensions: any, payerGrades: PayerGrade[]): ImprovementAction[] {
  const actions: ImprovementAction[] = [];
  let priority = 1;

  // Based on dimension scores, generate prioritized actions
  if (dimensions.codingAccuracy.score < 70) {
    actions.push({ priority: priority++, category: 'Coding', action: 'Implement AI-powered claim scrubbing before submission to catch NCCI edits, modifier errors, and diagnosis mismatches', expectedImpact: 'Reduce coding denials by 40-60%', estimatedRecovery: denials.filter(d => d.denialCategory === 'coding_error').reduce((s, d) => s + d.deniedAmount, 0) * 0.5, timeframe: '2-4 weeks', difficulty: 'medium' });
  }

  if (dimensions.timelyFilingCompliance.score < 80) {
    actions.push({ priority: priority++, category: 'Timely Filing', action: 'Deploy automated deadline tracking with escalation alerts at 30, 14, and 7 days before each payer deadline', expectedImpact: 'Eliminate 90%+ of timely filing denials', estimatedRecovery: denials.filter(d => d.denialCategory === 'timely_filing').reduce((s, d) => s + d.deniedAmount, 0) * 0.9, timeframe: '1 week', difficulty: 'easy' });
  }

  if (dimensions.denialRate.score < 65) {
    actions.push({ priority: priority++, category: 'Prevention', action: 'Establish front-end eligibility verification and prior authorization workflow for all scheduled procedures', expectedImpact: 'Reduce denial rate by 3-5 percentage points', estimatedRecovery: denials.filter(d => ['authorization', 'eligibility'].includes(d.denialCategory)).reduce((s, d) => s + d.deniedAmount, 0) * 0.6, timeframe: '4-6 weeks', difficulty: 'hard' });
  }

  // Payer-specific actions
  const worstPayer = payerGrades.find(p => p.score < 50);
  if (worstPayer) {
    actions.push({ priority: priority++, category: 'Payer Management', action: `Schedule quarterly meeting with ${worstPayer.payerName} provider relations to address ${worstPayer.topDenialReason} denials (${worstPayer.denialCount} claims, $${worstPayer.denialAmount.toLocaleString()})`, expectedImpact: `Reduce ${worstPayer.payerName} denials by 25%`, estimatedRecovery: worstPayer.denialAmount * 0.25, timeframe: '2-4 weeks', difficulty: 'medium' });
  }

  if (dimensions.recoveryPotential.score < 70) {
    actions.push({ priority: priority++, category: 'Recovery', action: 'Implement AI-powered correction and appeal generation for all correctable denials within 48 hours of receipt', expectedImpact: 'Increase recovery rate by 15-20%', estimatedRecovery: denials.filter(d => d.analysis?.correctable).reduce((s, d) => s + d.deniedAmount, 0) * 0.2, timeframe: '1-2 weeks', difficulty: 'easy' });
  }

  // Always include
  actions.push({ priority: priority++, category: 'Monitoring', action: 'Run monthly health scan to track improvement and identify new denial patterns before they become systemic', expectedImpact: 'Continuous improvement cycle', estimatedRecovery: 0, timeframe: 'Ongoing', difficulty: 'easy' });

  return actions;
}

// ─── EXECUTIVE SUMMARY ──────────────────────────────────────────────────────

function generateExecutiveSummary(score: number, grade: string, denialRate: number, totalDenied: number, recoverable: number, preventable: number, clientName: string): string {
  const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  if (score >= 80) return `${clientName} demonstrates strong revenue cycle performance with an overall health score of ${score}/100 (Grade: ${grade}). The denial rate of ${denialRate}% is within industry benchmarks. We estimate ${fmt(recoverable)} in recoverable revenue from current denials.`;
  if (score >= 60) return `${clientName} has a health score of ${score}/100 (Grade: ${grade}), indicating room for improvement. The denial rate of ${denialRate}% exceeds the industry average. ${preventable}% of denials were preventable. We have identified ${fmt(recoverable)} in recoverable revenue and specific actions to reduce future denials.`;
  return `${clientName} requires immediate attention with a health score of ${score}/100 (Grade: ${grade}). The denial rate of ${denialRate}% significantly exceeds industry standards. ${preventable}% of denials were preventable, representing ${fmt(totalDenied)} in denied revenue. Our improvement plan targets ${fmt(recoverable)} in near-term recovery.`;
}

function generateKeyFindings(dimensions: any, payerGrades: PayerGrade[], preventable: number, denialRate: number): string[] {
  const findings: string[] = [];

  if (denialRate > 12) findings.push(`Denial rate of ${denialRate}% exceeds the industry average of 12%`);
  if (preventable > 60) findings.push(`${preventable}% of denials were preventable with proper front-end processes`);

  const weakest = Object.entries(dimensions).sort((a: any, b: any) => a[1].score - b[1].score)[0];
  if (weakest) findings.push(`Weakest area: ${(weakest[0] as string).replace(/([A-Z])/g, ' $1').trim()} (Score: ${(weakest[1] as any).score}/100)`);

  const worstPayer = payerGrades[0];
  if (worstPayer && worstPayer.score < 60) findings.push(`${worstPayer.payerName} has the highest denial impact: ${worstPayer.denialCount} denials totaling $${worstPayer.denialAmount.toLocaleString()}`);

  if (findings.length === 0) findings.push('Practice is performing within healthy parameters across all dimensions');

  return findings;
}
