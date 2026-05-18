/**
 * Denial Prevention Engine - Proactive pre-submission analysis
 */
import { Denial } from './types';
import { getDenials } from './data';
import { scrubClaim } from './claim-scrub';
import { checkAuthRequired, calculateFilingDeadline } from './payer-rules';

export async function generatePreventionDashboard() {
  const denials = await getDenials();
  const alerts: any[] = [];

  for (const denial of denials.filter(d => !['Closed', 'Resubmitted'].includes(d.status))) {
    // Auth check
    const authCheck = checkAuthRequired(denial.payerName, denial.cptCode);
    if (authCheck.required) {
      alerts.push({ id: `prev-auth-${denial.id}`, claimId: denial.id, claimNumber: denial.claimNumber, patientName: denial.patientName, payerName: denial.payerName, alertType: 'auth_required', severity: 'high', title: `Prior auth likely required for CPT ${denial.cptCode}`, description: `${denial.payerName} typically requires prior authorization for this procedure.`, suggestedAction: 'Verify prior authorization number is on file.', estimatedRiskAmount: denial.deniedAmount, category: 'authorization', createdAt: new Date().toISOString() });
    }
    // Deadline check
    const deadline = calculateFilingDeadline(denial.payerName, denial.dateOfService, denial.denialDate);
    if (deadline.daysRemaining !== null && deadline.daysRemaining <= 14) {
      alerts.push({ id: `prev-dl-${denial.id}`, claimId: denial.id, claimNumber: denial.claimNumber, patientName: denial.patientName, payerName: denial.payerName, alertType: 'filing_deadline', severity: deadline.daysRemaining <= 7 ? 'critical' : 'high', title: `Filing deadline: ${deadline.daysRemaining} days`, description: `${denial.payerName} filing deadline approaching.`, suggestedAction: 'Prioritize correction and resubmission immediately.', estimatedRiskAmount: denial.deniedAmount, category: 'timely_filing', createdAt: new Date().toISOString() });
    }
    // Coding scrub
    const scrubResults = scrubClaim(denial);
    for (const r of scrubResults.filter(r => r.severity === 'critical' || r.severity === 'high')) {
      alerts.push({ id: `prev-code-${denial.id}-${r.id}`, claimId: denial.id, claimNumber: denial.claimNumber, patientName: denial.patientName, payerName: denial.payerName, alertType: 'coding_warning', severity: r.severity === 'critical' ? 'critical' : 'high', title: r.ruleName, description: r.finding, suggestedAction: r.suggestion || 'Review coding', estimatedRiskAmount: denial.deniedAmount, category: 'coding', createdAt: new Date().toISOString() });
    }
  }

  // Duplicate check
  const seen = new Map<string, Denial>();
  for (const d of denials) {
    const key = `${d.patientName}-${d.dateOfService}-${d.cptCode}`;
    if (seen.has(key) && seen.get(key)!.id !== d.id) {
      alerts.push({ id: `prev-dup-${d.id}`, claimId: d.id, claimNumber: d.claimNumber, patientName: d.patientName, payerName: d.payerName, alertType: 'duplicate_risk', severity: 'high', title: 'Potential duplicate claim', description: `Same patient/DOS/CPT found on ${seen.get(key)!.claimNumber}`, suggestedAction: 'Verify not a duplicate before resubmitting.', estimatedRiskAmount: d.deniedAmount, category: 'duplicate', createdAt: new Date().toISOString() });
    } else { seen.set(key, d); }
  }

  alerts.sort((a: any, b: any) => { const o: any = { critical: 0, high: 1, medium: 2, low: 3 }; return (o[a.severity] || 4) - (o[b.severity] || 4); });

  const totalRiskAmount = alerts.reduce((s: number, a: any) => s + a.estimatedRiskAmount, 0);
  const preventableDenials = denials.filter(d => d.analysis?.preventable).length;
  const preventionRate = denials.length > 0 ? Math.round((preventableDenials / denials.length) * 100) : 0;
  const estimatedSavings = denials.filter(d => d.analysis?.preventable && d.analysis?.correctable).reduce((s, d) => s + d.deniedAmount * 0.85, 0);

  const categoryMap = new Map<string, { count: number; amount: number }>();
  alerts.forEach((a: any) => { const e = categoryMap.get(a.category) || { count: 0, amount: 0 }; categoryMap.set(a.category, { count: e.count + 1, amount: e.amount + a.estimatedRiskAmount }); });

  return {
    totalClaimsAtRisk: new Set(alerts.map((a: any) => a.claimId)).size,
    totalRiskAmount, alerts,
    summary: {
      authRequired: alerts.filter((a: any) => a.alertType === 'auth_required').length,
      codingWarnings: alerts.filter((a: any) => a.alertType === 'coding_warning').length,
      eligibilityIssues: 0,
      deadlineApproaching: alerts.filter((a: any) => a.alertType === 'filing_deadline').length,
      duplicateRisk: alerts.filter((a: any) => a.alertType === 'duplicate_risk').length,
      patternWarnings: 0,
    },
    preventionRate, estimatedSavings,
    topRiskCategories: Array.from(categoryMap.entries()).map(([category, data]) => ({ category, ...data })).sort((a, b) => b.amount - a.amount).slice(0, 5),
  };
}
