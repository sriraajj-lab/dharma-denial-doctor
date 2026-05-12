/**
 * Appeal Deadline Countdown & Auto-Escalation
 */
import { getDenials } from './data';
import { calculateAppealDeadline } from './payer-rules';

export function getAppealDeadlines() {
  const denials = getDenials().filter(d => !['Closed'].includes(d.status));
  const now = new Date();
  const items: any[] = [];

  for (const d of denials) {
    const info = calculateAppealDeadline(d.payerName, d.denialDate);
    if (!info.deadline) continue;
    const ms = info.deadline.getTime() - now.getTime();
    const daysRemaining = Math.ceil(ms / (1000 * 60 * 60 * 24));
    const hoursRemaining = Math.ceil(ms / (1000 * 60 * 60));

    let urgency = 'safe';
    if (daysRemaining <= 0) urgency = 'expired';
    else if (daysRemaining <= 3) urgency = 'critical';
    else if (daysRemaining <= 7) urgency = 'urgent';
    else if (daysRemaining <= 14) urgency = 'warning';
    else if (daysRemaining <= 30) urgency = 'normal';

    let escalationLevel = 'none', escalationMessage = '';
    if (daysRemaining <= 0) { escalationLevel = 'director'; escalationMessage = 'EXPIRED: Immediate director review required.'; }
    else if (daysRemaining <= 3) { escalationLevel = 'manager'; escalationMessage = `CRITICAL: ${daysRemaining} days. Manager must approve appeal NOW.`; }
    else if (daysRemaining <= 7) { escalationLevel = 'supervisor'; escalationMessage = `URGENT: ${daysRemaining} days. Supervisor review needed.`; }

    const hasAppealFiled = d.status === 'Appealed';
    let recommendedAction = hasAppealFiled ? 'Appeal filed. Monitor response.' : urgency === 'expired' ? 'Request deadline extension.' : urgency === 'critical' ? 'FILE APPEAL IMMEDIATELY.' : urgency === 'urgent' ? 'Generate appeal letter today.' : 'Plan appeal preparation.';

    items.push({ denialId: d.id, claimNumber: d.claimNumber, patientName: d.patientName, payerName: d.payerName, deniedAmount: d.deniedAmount, carcCode: d.carcCode, denialCategory: d.denialCategory, appealDeadline: info.deadline.toISOString(), daysRemaining: Math.max(0, daysRemaining), hoursRemaining: Math.max(0, hoursRemaining), urgency, escalationLevel, escalationMessage, hasAppealFiled, recommendedAction });
  }

  const urgencyOrder: any = { expired: 0, critical: 1, urgent: 2, warning: 3, normal: 4, safe: 5 };
  items.sort((a: any, b: any) => (urgencyOrder[a.urgency] || 5) - (urgencyOrder[b.urgency] || 5));

  return {
    items,
    summary: {
      totalTracked: items.length,
      expiredCount: items.filter((i: any) => i.urgency === 'expired').length,
      criticalCount: items.filter((i: any) => i.urgency === 'critical').length,
      urgentCount: items.filter((i: any) => i.urgency === 'urgent').length,
      warningCount: items.filter((i: any) => i.urgency === 'warning').length,
      safeCount: items.filter((i: any) => i.urgency === 'normal' || i.urgency === 'safe').length,
      totalAtRiskAmount: items.filter((i: any) => !i.hasAppealFiled && i.daysRemaining <= 14).reduce((s: number, i: any) => s + i.deniedAmount, 0),
      needsEscalation: items.filter((i: any) => i.escalationLevel !== 'none').length,
      appealsFiled: items.filter((i: any) => i.hasAppealFiled).length,
      appealsNotFiled: items.filter((i: any) => !i.hasAppealFiled && i.daysRemaining <= 14).length,
    },
  };
}
