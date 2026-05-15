/**
 * Resubmission Intelligence Tracker
 * Learns from past resubmission outcomes to improve future correction suggestions.
 * Tracks success/failure patterns by:
 * - Payer + CARC code combination
 * - Correction type applied
 * - Denial category
 * - Dollar amount range
 * - Time-to-resolution
 *
 * Uses this data to provide:
 * - Predicted success rates for proposed corrections
 * - Best correction strategy per payer
 * - Optimal resubmission timing
 * - Patterns that indicate "don't bother" vs "always wins"
 */

import { Denial } from './types';

// ─── TYPES ──────────────────────────────────────────────────────────────────

export interface ResubmissionRecord {
  id: string;
  denialId: string;
  claimNumber: string;
  payerName: string;
  carcCode: string;
  denialCategory: string;
  cptCode: string;
  deniedAmount: number;
  correctionType: string;        // What correction was applied
  correctionDetails: string;     // Specific changes made
  resubmittedAt: string;
  outcome: 'paid' | 'partially_paid' | 'denied_again' | 'pending' | 'appealed';
  paidAmount?: number;
  resolvedAt?: string;
  daysToResolution?: number;
  deniedAgainReason?: string;    // If denied again, what was the new reason
  notes?: string;
}

export interface IntelligenceInsight {
  category: string;
  insight: string;
  confidence: number;
  dataPoints: number;
  recommendation: string;
  impact: 'high' | 'medium' | 'low';
}

export interface PayerProfile {
  payerName: string;
  totalSubmissions: number;
  successRate: number;
  avgDaysToPayment: number;
  avgRecoveryPercent: number;
  bestCorrectionTypes: Array<{ type: string; successRate: number; count: number }>;
  worstCorrectionTypes: Array<{ type: string; successRate: number; count: number }>;
  topDenialReasons: Array<{ carcCode: string; count: number; successRate: number }>;
  trends: {
    lastMonth: number;     // Success rate last 30 days
    last3Months: number;   // Success rate last 90 days
    last6Months: number;   // Success rate last 180 days
    improving: boolean;
  };
}

export interface PredictionResult {
  predictedSuccessRate: number;
  confidence: number;
  basedOn: number;              // Number of similar historical records
  factors: PredictionFactor[];
  recommendation: 'proceed' | 'proceed_with_caution' | 'consider_appeal' | 'write_off';
  alternativeStrategies: Array<{ strategy: string; predictedSuccess: number }>;
}

export interface PredictionFactor {
  factor: string;
  impact: 'positive' | 'negative' | 'neutral';
  weight: number;
  detail: string;
}



// ─── IN-MEMORY DATA STORE ───────────────────────────────────────────────────
// In production this would be backed by the database

let resubmissionRecords: ResubmissionRecord[] = [
  // Seed with realistic historical data to bootstrap intelligence
  // UHC patterns
  { id: 'RS-001', denialId: 'DEN-H01', claimNumber: 'CLM-H001', payerName: 'UnitedHealthcare', carcCode: 'CO-16', denialCategory: 'missing_information', cptCode: '99213', deniedAmount: 250, correctionType: 'information_addition', correctionDetails: 'Added referring physician NPI', resubmittedAt: '2025-01-15', outcome: 'paid', paidAmount: 250, resolvedAt: '2025-02-01', daysToResolution: 17 },
  { id: 'RS-002', denialId: 'DEN-H02', claimNumber: 'CLM-H002', payerName: 'UnitedHealthcare', carcCode: 'CO-16', denialCategory: 'missing_information', cptCode: '99214', deniedAmount: 350, correctionType: 'information_addition', correctionDetails: 'Added authorization number', resubmittedAt: '2025-01-20', outcome: 'paid', paidAmount: 350, resolvedAt: '2025-02-05', daysToResolution: 16 },
  { id: 'RS-003', denialId: 'DEN-H03', claimNumber: 'CLM-H003', payerName: 'UnitedHealthcare', carcCode: 'CO-22', denialCategory: 'bundling', cptCode: '99213', deniedAmount: 180, correctionType: 'modifier_addition', correctionDetails: 'Added modifier 25', resubmittedAt: '2025-02-01', outcome: 'paid', paidAmount: 180, resolvedAt: '2025-02-20', daysToResolution: 19 },
  { id: 'RS-004', denialId: 'DEN-H04', claimNumber: 'CLM-H004', payerName: 'UnitedHealthcare', carcCode: 'CO-22', denialCategory: 'bundling', cptCode: '36415', deniedAmount: 45, correctionType: 'modifier_addition', correctionDetails: 'Added modifier 59', resubmittedAt: '2025-02-10', outcome: 'denied_again', deniedAgainReason: 'CO-22 - modifier does not override this edit', daysToResolution: 14 },
  { id: 'RS-005', denialId: 'DEN-H05', claimNumber: 'CLM-H005', payerName: 'UnitedHealthcare', carcCode: 'CO-4', denialCategory: 'coding_error', cptCode: '29881', deniedAmount: 2800, correctionType: 'modifier_addition', correctionDetails: 'Added laterality modifier RT', resubmittedAt: '2025-02-15', outcome: 'paid', paidAmount: 2800, resolvedAt: '2025-03-10', daysToResolution: 23 },

  // Aetna patterns
  { id: 'RS-006', denialId: 'DEN-H06', claimNumber: 'CLM-H006', payerName: 'Aetna', carcCode: 'CO-27', denialCategory: 'medical_necessity', cptCode: '70553', deniedAmount: 1500, correctionType: 'diagnosis_change', correctionDetails: 'Changed from R51.9 to G43.909', resubmittedAt: '2025-01-25', outcome: 'paid', paidAmount: 1500, resolvedAt: '2025-02-28', daysToResolution: 34 },
  { id: 'RS-007', denialId: 'DEN-H07', claimNumber: 'CLM-H007', payerName: 'Aetna', carcCode: 'CO-27', denialCategory: 'medical_necessity', cptCode: '27447', deniedAmount: 18000, correctionType: 'appeal_with_documentation', correctionDetails: 'Clinical appeal with 6 months conservative tx records', resubmittedAt: '2025-02-01', outcome: 'paid', paidAmount: 18000, resolvedAt: '2025-03-20', daysToResolution: 47 },
  { id: 'RS-008', denialId: 'DEN-H08', claimNumber: 'CLM-H008', payerName: 'Aetna', carcCode: 'CO-50', denialCategory: 'authorization', cptCode: '43239', deniedAmount: 2200, correctionType: 'retro_authorization', correctionDetails: 'Obtained retro auth via peer-to-peer', resubmittedAt: '2025-03-01', outcome: 'paid', paidAmount: 2200, resolvedAt: '2025-03-25', daysToResolution: 24 },
  { id: 'RS-009', denialId: 'DEN-H09', claimNumber: 'CLM-H009', payerName: 'Aetna', carcCode: 'CO-29', denialCategory: 'timely_filing', cptCode: '99214', deniedAmount: 350, correctionType: 'appeal_with_proof', correctionDetails: 'Submitted clearinghouse acceptance report', resubmittedAt: '2025-02-20', outcome: 'denied_again', deniedAgainReason: 'CO-29 - appeal denied, filing deadline exceeded', daysToResolution: 30 },

  // BCBS patterns
  { id: 'RS-010', denialId: 'DEN-H10', claimNumber: 'CLM-H010', payerName: 'Blue Cross Blue Shield', carcCode: 'CO-16', denialCategory: 'missing_information', cptCode: '99215', deniedAmount: 450, correctionType: 'information_addition', correctionDetails: 'Added patient DOB and subscriber ID', resubmittedAt: '2025-01-10', outcome: 'paid', paidAmount: 450, resolvedAt: '2025-01-28', daysToResolution: 18 },
  { id: 'RS-011', denialId: 'DEN-H11', claimNumber: 'CLM-H011', payerName: 'Blue Cross Blue Shield', carcCode: 'CO-11', denialCategory: 'coding_error', cptCode: '99215', deniedAmount: 450, correctionType: 'code_downgrade', correctionDetails: 'Downcoded from 99215 to 99214', resubmittedAt: '2025-02-05', outcome: 'partially_paid', paidAmount: 320, resolvedAt: '2025-02-25', daysToResolution: 20 },
  { id: 'RS-012', denialId: 'DEN-H12', claimNumber: 'CLM-H012', payerName: 'Blue Cross Blue Shield', carcCode: 'CO-4', denialCategory: 'coding_error', cptCode: '27447', deniedAmount: 15000, correctionType: 'modifier_addition', correctionDetails: 'Added modifier 50 for bilateral', resubmittedAt: '2025-03-01', outcome: 'paid', paidAmount: 15000, resolvedAt: '2025-03-28', daysToResolution: 27 },

  // Medicare patterns
  { id: 'RS-013', denialId: 'DEN-H13', claimNumber: 'CLM-H013', payerName: 'Medicare', carcCode: 'CO-16', denialCategory: 'missing_information', cptCode: '99213', deniedAmount: 120, correctionType: 'information_addition', correctionDetails: 'Added ordering physician NPI', resubmittedAt: '2025-01-05', outcome: 'paid', paidAmount: 120, resolvedAt: '2025-01-19', daysToResolution: 14 },
  { id: 'RS-014', denialId: 'DEN-H14', claimNumber: 'CLM-H014', payerName: 'Medicare', carcCode: 'CO-27', denialCategory: 'medical_necessity', cptCode: '63030', deniedAmount: 8500, correctionType: 'appeal_with_documentation', correctionDetails: 'ABN on file, submitted MRI and conservative tx records', resubmittedAt: '2025-02-10', outcome: 'paid', paidAmount: 8500, resolvedAt: '2025-04-01', daysToResolution: 50 },
  { id: 'RS-015', denialId: 'DEN-H15', claimNumber: 'CLM-H015', payerName: 'Medicare', carcCode: 'CO-27', denialCategory: 'medical_necessity', cptCode: '29881', deniedAmount: 3200, correctionType: 'appeal_with_documentation', correctionDetails: 'Submitted MRI report and functional limitation documentation', resubmittedAt: '2025-03-01', outcome: 'denied_again', deniedAgainReason: 'CO-27 - does not meet LCD L34982 criteria', daysToResolution: 45 },

  // Cigna patterns
  { id: 'RS-016', denialId: 'DEN-H16', claimNumber: 'CLM-H016', payerName: 'Cigna', carcCode: 'CO-50', denialCategory: 'authorization', cptCode: '70553', deniedAmount: 1800, correctionType: 'retro_authorization', correctionDetails: 'Retro auth approved via eviCore', resubmittedAt: '2025-02-15', outcome: 'paid', paidAmount: 1800, resolvedAt: '2025-03-05', daysToResolution: 18 },
  { id: 'RS-017', denialId: 'DEN-H17', claimNumber: 'CLM-H017', payerName: 'Cigna', carcCode: 'CO-22', denialCategory: 'bundling', cptCode: '93000', deniedAmount: 85, correctionType: 'modifier_addition', correctionDetails: 'Added modifier 59 - separate encounter documented', resubmittedAt: '2025-03-10', outcome: 'paid', paidAmount: 85, resolvedAt: '2025-03-28', daysToResolution: 18 },
  { id: 'RS-018', denialId: 'DEN-H18', claimNumber: 'CLM-H018', payerName: 'Cigna', carcCode: 'CO-18', denialCategory: 'duplicate', cptCode: '99213', deniedAmount: 200, correctionType: 'appeal_with_proof', correctionDetails: 'Provided documentation of separate DOS', resubmittedAt: '2025-01-28', outcome: 'paid', paidAmount: 200, resolvedAt: '2025-02-15', daysToResolution: 18 },
];

// ─── CORE FUNCTIONS ─────────────────────────────────────────────────────────

/**
 * Record a new resubmission outcome for learning
 */
export function recordResubmissionOutcome(record: Omit<ResubmissionRecord, 'id'>): ResubmissionRecord {
  const newRecord: ResubmissionRecord = {
    ...record,
    id: `RS-${String(resubmissionRecords.length + 1).padStart(3, '0')}`,
  };

  if (record.resolvedAt && record.resubmittedAt) {
    newRecord.daysToResolution = Math.ceil(
      (new Date(record.resolvedAt).getTime() - new Date(record.resubmittedAt).getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  resubmissionRecords.push(newRecord);
  return newRecord;
}

/**
 * Predict success rate for a proposed correction
 */
export function predictResubmissionSuccess(denial: Denial, correctionType: string): PredictionResult {
  // Find similar historical records
  const similar = findSimilarRecords(denial, correctionType);
  const factors = analyzePredictionFactors(denial, correctionType, similar);

  // Calculate predicted success rate
  let baseRate = 50; // Default 50% if no data
  if (similar.length > 0) {
    const successes = similar.filter(r => r.outcome === 'paid' || r.outcome === 'partially_paid').length;
    baseRate = Math.round((successes / similar.length) * 100);
  }

  // Adjust based on factors
  let adjustedRate = baseRate;
  for (const factor of factors) {
    if (factor.impact === 'positive') adjustedRate += factor.weight * 10;
    if (factor.impact === 'negative') adjustedRate -= factor.weight * 10;
  }
  adjustedRate = Math.max(5, Math.min(95, adjustedRate));

  // Determine recommendation
  let recommendation: PredictionResult['recommendation'] = 'proceed';
  if (adjustedRate >= 70) recommendation = 'proceed';
  else if (adjustedRate >= 45) recommendation = 'proceed_with_caution';
  else if (adjustedRate >= 25) recommendation = 'consider_appeal';
  else recommendation = 'write_off';

  // Find alternative strategies
  const alternatives = findAlternativeStrategies(denial, correctionType);

  return {
    predictedSuccessRate: adjustedRate,
    confidence: Math.min(0.95, similar.length / 20 + 0.3), // More data = more confidence
    basedOn: similar.length,
    factors,
    recommendation,
    alternativeStrategies: alternatives,
  };
}



/**
 * Get payer-specific intelligence profile
 */
export function getPayerProfile(payerName: string): PayerProfile {
  const payerRecords = resubmissionRecords.filter(r =>
    r.payerName.toLowerCase().includes(payerName.toLowerCase())
  );

  if (payerRecords.length === 0) {
    return {
      payerName,
      totalSubmissions: 0,
      successRate: 50,
      avgDaysToPayment: 30,
      avgRecoveryPercent: 0,
      bestCorrectionTypes: [],
      worstCorrectionTypes: [],
      topDenialReasons: [],
      trends: { lastMonth: 50, last3Months: 50, last6Months: 50, improving: false },
    };
  }

  const total = payerRecords.length;
  const successes = payerRecords.filter(r => r.outcome === 'paid' || r.outcome === 'partially_paid');
  const successRate = Math.round((successes.length / total) * 100);

  const avgDays = successes.length > 0
    ? Math.round(successes.reduce((sum, r) => sum + (r.daysToResolution || 30), 0) / successes.length)
    : 30;

  const totalDenied = payerRecords.reduce((sum, r) => sum + r.deniedAmount, 0);
  const totalRecovered = successes.reduce((sum, r) => sum + (r.paidAmount || 0), 0);
  const avgRecoveryPercent = totalDenied > 0 ? Math.round((totalRecovered / totalDenied) * 100) : 0;

  // Best/worst correction types
  const corrTypeMap = new Map<string, { success: number; total: number }>();
  payerRecords.forEach(r => {
    const existing = corrTypeMap.get(r.correctionType) || { success: 0, total: 0 };
    existing.total++;
    if (r.outcome === 'paid' || r.outcome === 'partially_paid') existing.success++;
    corrTypeMap.set(r.correctionType, existing);
  });

  const corrTypes = Array.from(corrTypeMap.entries()).map(([type, data]) => ({
    type,
    successRate: Math.round((data.success / data.total) * 100),
    count: data.total,
  }));
  const bestCorrectionTypes = corrTypes.filter(c => c.count >= 1).sort((a, b) => b.successRate - a.successRate).slice(0, 3);
  const worstCorrectionTypes = corrTypes.filter(c => c.count >= 1).sort((a, b) => a.successRate - b.successRate).slice(0, 3);

  // Top denial reasons
  const carcMap = new Map<string, { success: number; total: number }>();
  payerRecords.forEach(r => {
    const existing = carcMap.get(r.carcCode) || { success: 0, total: 0 };
    existing.total++;
    if (r.outcome === 'paid' || r.outcome === 'partially_paid') existing.success++;
    carcMap.set(r.carcCode, existing);
  });
  const topDenialReasons = Array.from(carcMap.entries())
    .map(([carcCode, data]) => ({ carcCode, count: data.total, successRate: Math.round((data.success / data.total) * 100) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    payerName,
    totalSubmissions: total,
    successRate,
    avgDaysToPayment: avgDays,
    avgRecoveryPercent,
    bestCorrectionTypes,
    worstCorrectionTypes,
    topDenialReasons,
    trends: { lastMonth: successRate, last3Months: successRate, last6Months: successRate, improving: successRate > 60 },
  };
}

/**
 * Generate actionable insights from historical data
 */
export function generateInsights(): IntelligenceInsight[] {
  const insights: IntelligenceInsight[] = [];

  if (resubmissionRecords.length < 5) {
    insights.push({
      category: 'data_quality',
      insight: 'Insufficient data for reliable intelligence',
      confidence: 0.3,
      dataPoints: resubmissionRecords.length,
      recommendation: 'Continue recording outcomes to build intelligence baseline (minimum 20 records recommended)',
      impact: 'low',
    });
    return insights;
  }

  // Overall success rate insight
  const totalSuccess = resubmissionRecords.filter(r => r.outcome === 'paid' || r.outcome === 'partially_paid').length;
  const overallRate = Math.round((totalSuccess / resubmissionRecords.length) * 100);
  insights.push({
    category: 'overall_performance',
    insight: `Overall resubmission success rate is ${overallRate}%`,
    confidence: 0.9,
    dataPoints: resubmissionRecords.length,
    recommendation: overallRate >= 70 ? 'Current correction strategies are effective' : 'Consider reviewing correction protocols for low-success categories',
    impact: overallRate >= 70 ? 'low' : 'high',
  });

  // Payer-specific insights
  const payerGroups = groupBy(resubmissionRecords, 'payerName');
  for (const [payer, records] of Object.entries(payerGroups)) {
    const payerSuccess = records.filter((r: ResubmissionRecord) => r.outcome === 'paid' || r.outcome === 'partially_paid').length;
    const payerRate = Math.round((payerSuccess / records.length) * 100);

    if (payerRate < 40 && records.length >= 3) {
      insights.push({
        category: 'payer_difficulty',
        insight: `${payer} has a low resubmission success rate (${payerRate}%)`,
        confidence: Math.min(0.9, records.length / 10 + 0.3),
        dataPoints: records.length,
        recommendation: `Consider pre-submission verification for ${payer} claims. Focus on getting it right the first time.`,
        impact: 'high',
      });
    }

    if (payerRate >= 85 && records.length >= 3) {
      insights.push({
        category: 'payer_opportunity',
        insight: `${payer} accepts corrections at ${payerRate}% rate`,
        confidence: Math.min(0.9, records.length / 10 + 0.3),
        dataPoints: records.length,
        recommendation: `Prioritize ${payer} denials for correction - high likelihood of recovery`,
        impact: 'high',
      });
    }
  }

  // Correction type insights
  const corrGroups = groupBy(resubmissionRecords, 'correctionType');
  for (const [corrType, records] of Object.entries(corrGroups)) {
    const typeSuccess = records.filter((r: ResubmissionRecord) => r.outcome === 'paid' || r.outcome === 'partially_paid').length;
    const typeRate = Math.round((typeSuccess / records.length) * 100);

    if (typeRate >= 80 && records.length >= 2) {
      insights.push({
        category: 'effective_strategy',
        insight: `"${formatCorrectionType(corrType)}" corrections succeed ${typeRate}% of the time`,
        confidence: Math.min(0.85, records.length / 8 + 0.3),
        dataPoints: records.length,
        recommendation: `Continue using "${formatCorrectionType(corrType)}" as primary correction strategy where applicable`,
        impact: 'medium',
      });
    }

    if (typeRate <= 30 && records.length >= 2) {
      insights.push({
        category: 'ineffective_strategy',
        insight: `"${formatCorrectionType(corrType)}" corrections only succeed ${typeRate}% of the time`,
        confidence: Math.min(0.85, records.length / 8 + 0.3),
        dataPoints: records.length,
        recommendation: `Consider alternative approaches instead of "${formatCorrectionType(corrType)}". May be better to appeal or write off.`,
        impact: 'high',
      });
    }
  }

  // Dollar-amount insight
  const highValue = resubmissionRecords.filter(r => r.deniedAmount > 1000);
  const lowValue = resubmissionRecords.filter(r => r.deniedAmount <= 200);
  if (highValue.length >= 3) {
    const hvSuccess = highValue.filter(r => r.outcome === 'paid' || r.outcome === 'partially_paid').length;
    const hvRate = Math.round((hvSuccess / highValue.length) * 100);
    insights.push({
      category: 'value_based',
      insight: `High-value claims (>$1000) have a ${hvRate}% correction success rate`,
      confidence: 0.7,
      dataPoints: highValue.length,
      recommendation: hvRate >= 60 ? 'High-value denials are worth pursuing aggressively' : 'High-value denials may need appeal rather than simple correction',
      impact: 'high',
    });
  }

  // Timely filing insight
  const timelyFiling = resubmissionRecords.filter(r => r.carcCode === 'CO-29');
  if (timelyFiling.length >= 2) {
    const tfSuccess = timelyFiling.filter(r => r.outcome === 'paid' || r.outcome === 'partially_paid').length;
    const tfRate = Math.round((tfSuccess / timelyFiling.length) * 100);
    insights.push({
      category: 'prevention',
      insight: `Timely filing denials (CO-29) are recovered only ${tfRate}% of the time`,
      confidence: 0.85,
      dataPoints: timelyFiling.length,
      recommendation: 'Focus on prevention: implement claim submission deadline alerts and automated reminders',
      impact: 'high',
    });
  }

  return insights.sort((a, b) => {
    const impactOrder = { high: 0, medium: 1, low: 2 };
    return impactOrder[a.impact] - impactOrder[b.impact];
  });
}

/**
 * Get all resubmission records (for reporting)
 */
export function getResubmissionRecords(filters?: {
  payerName?: string;
  carcCode?: string;
  outcome?: string;
  correctionType?: string;
}): ResubmissionRecord[] {
  let filtered = [...resubmissionRecords];
  if (filters?.payerName) filtered = filtered.filter(r => r.payerName.toLowerCase().includes(filters.payerName!.toLowerCase()));
  if (filters?.carcCode) filtered = filtered.filter(r => r.carcCode === filters.carcCode);
  if (filters?.outcome) filtered = filtered.filter(r => r.outcome === filters.outcome);
  if (filters?.correctionType) filtered = filtered.filter(r => r.correctionType === filters.correctionType);
  return filtered.sort((a, b) => new Date(b.resubmittedAt).getTime() - new Date(a.resubmittedAt).getTime());
}

// ─── HELPER FUNCTIONS ───────────────────────────────────────────────────────

function findSimilarRecords(denial: Denial, correctionType: string): ResubmissionRecord[] {
  return resubmissionRecords.filter(r => {
    let score = 0;
    // Same payer is strongest signal
    if (r.payerName.toLowerCase() === denial.payerName.toLowerCase()) score += 3;
    // Same CARC code
    if (r.carcCode === denial.carcCode) score += 3;
    // Same correction type
    if (r.correctionType === correctionType) score += 2;
    // Same denial category
    if (r.denialCategory === denial.denialCategory) score += 1;
    // Similar dollar amount (within 50%)
    if (Math.abs(r.deniedAmount - denial.deniedAmount) / Math.max(r.deniedAmount, 1) < 0.5) score += 1;
    // Same CPT code
    if (r.cptCode === denial.cptCode) score += 1;

    return score >= 4; // Require at least moderate similarity
  });
}

function analyzePredictionFactors(denial: Denial, correctionType: string, similar: ResubmissionRecord[]): PredictionFactor[] {
  const factors: PredictionFactor[] = [];

  // Payer factor
  const payerRecords = similar.filter(r => r.payerName.toLowerCase() === denial.payerName.toLowerCase());
  if (payerRecords.length > 0) {
    const payerSuccess = payerRecords.filter(r => r.outcome === 'paid' || r.outcome === 'partially_paid').length / payerRecords.length;
    factors.push({
      factor: `Payer history (${denial.payerName})`,
      impact: payerSuccess >= 0.7 ? 'positive' : payerSuccess <= 0.3 ? 'negative' : 'neutral',
      weight: payerSuccess >= 0.7 ? 1.5 : payerSuccess <= 0.3 ? 1.5 : 0.5,
      detail: `${Math.round(payerSuccess * 100)}% success rate with this payer (${payerRecords.length} records)`,
    });
  }

  // Correction type factor
  const corrRecords = similar.filter(r => r.correctionType === correctionType);
  if (corrRecords.length > 0) {
    const corrSuccess = corrRecords.filter(r => r.outcome === 'paid' || r.outcome === 'partially_paid').length / corrRecords.length;
    factors.push({
      factor: `Correction type: ${formatCorrectionType(correctionType)}`,
      impact: corrSuccess >= 0.7 ? 'positive' : corrSuccess <= 0.3 ? 'negative' : 'neutral',
      weight: corrSuccess >= 0.7 ? 1.2 : corrSuccess <= 0.3 ? 1.5 : 0.5,
      detail: `${Math.round(corrSuccess * 100)}% success rate with this correction type`,
    });
  }

  // Dollar amount factor
  if (denial.deniedAmount > 5000) {
    factors.push({
      factor: 'High-value claim',
      impact: 'neutral',
      weight: 0.5,
      detail: `$${denial.deniedAmount.toLocaleString()} - high-value claims often get more scrutiny but are worth pursuing`,
    });
  }

  // CARC code factor
  const unrecoverableCodes = ['CO-29', 'PR-1'];
  if (unrecoverableCodes.includes(denial.carcCode)) {
    factors.push({
      factor: `Denial code ${denial.carcCode}`,
      impact: 'negative',
      weight: 2.0,
      detail: denial.carcCode === 'CO-29' ? 'Timely filing denials are rarely overturned without proof of original submission' : 'Patient responsibility is typically not recoverable from payer',
    });
  }

  // Coding error = usually fixable
  if (['CO-4', 'CO-16', 'CO-15'].includes(denial.carcCode)) {
    factors.push({
      factor: `Correctable denial code ${denial.carcCode}`,
      impact: 'positive',
      weight: 1.5,
      detail: 'Missing info and coding errors have high correction success rates across all payers',
    });
  }

  return factors;
}

function findAlternativeStrategies(denial: Denial, currentCorrectionType: string): Array<{ strategy: string; predictedSuccess: number }> {
  const alternatives: Array<{ strategy: string; predictedSuccess: number }> = [];

  // Find what other correction types have worked for this payer + CARC combination
  const relevantRecords = resubmissionRecords.filter(r =>
    r.payerName.toLowerCase() === denial.payerName.toLowerCase() &&
    r.carcCode === denial.carcCode &&
    r.correctionType !== currentCorrectionType
  );

  const typeGroups = groupBy(relevantRecords, 'correctionType');
  for (const [type, records] of Object.entries(typeGroups)) {
    const success = records.filter((r: ResubmissionRecord) => r.outcome === 'paid' || r.outcome === 'partially_paid').length;
    const rate = Math.round((success / records.length) * 100);
    if (rate > 0) {
      alternatives.push({ strategy: formatCorrectionType(type), predictedSuccess: rate });
    }
  }

  // Always suggest appeal as alternative if not already
  if (currentCorrectionType !== 'appeal_with_documentation') {
    alternatives.push({ strategy: 'Formal appeal with clinical documentation', predictedSuccess: 45 });
  }

  return alternatives.sort((a, b) => b.predictedSuccess - a.predictedSuccess).slice(0, 3);
}

function groupBy(records: ResubmissionRecord[], key: keyof ResubmissionRecord): Record<string, ResubmissionRecord[]> {
  const groups: Record<string, ResubmissionRecord[]> = {};
  for (const record of records) {
    const groupKey = String(record[key]);
    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(record);
  }
  return groups;
}

function formatCorrectionType(type: string): string {
  const labels: Record<string, string> = {
    information_addition: 'Add Missing Information',
    modifier_addition: 'Add Modifier',
    modifier_change: 'Change Modifier',
    code_downgrade: 'Downcode',
    code_change: 'Change Code',
    diagnosis_change: 'Change Diagnosis',
    retro_authorization: 'Retroactive Authorization',
    appeal_with_documentation: 'Appeal with Documentation',
    appeal_with_proof: 'Appeal with Proof of Submission',
    unbundle: 'Unbundle Services',
  };
  return labels[type] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
