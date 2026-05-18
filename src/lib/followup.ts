/**
 * Automated Follow-up Cadence (14/30/45/60 days)
 */
import { getDenials } from './data';

const CADENCE = [
  { step: '14_day', days: 14, action: 'Verify payer received claim. Check status via portal.', escalation: 0 },
  { step: '30_day', days: 30, action: 'Payment expected. Call payer for status. Document ref number.', escalation: 0 },
  { step: '45_day', days: 45, action: 'ESCALATE: No payment. Request supervisor review. File inquiry.', escalation: 1 },
  { step: '60_day', days: 60, action: 'FINAL: Determine write-off vs appeal. Contact payer management.', escalation: 2 },
];

export async function generateFollowUpTasks() {
  const allDenials = await getDenials();
  const denials = allDenials.filter(d => d.status === 'Resubmitted' || d.status === 'Appealed');
  const now = new Date();
  const tasks: any[] = [];

  for (const d of denials) {
    const resubDate = new Date(d.updatedAt);
    const daysSince = Math.ceil((now.getTime() - resubDate.getTime()) / (1000 * 60 * 60 * 24));
    let cadence = CADENCE[0];
    for (let i = CADENCE.length - 1; i >= 0; i--) { if (daysSince >= CADENCE[i].days) { cadence = CADENCE[i]; break; } }

    const dueDate = new Date(resubDate); dueDate.setDate(dueDate.getDate() + cadence.days);
    const isOverdue = now > dueDate;
    const isDueToday = !isOverdue && dueDate.toDateString() === now.toDateString();
    const daysOverdue = isOverdue ? Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;

    let status = 'pending';
    if (isOverdue && daysOverdue > 7) status = 'escalated';
    else if (isOverdue) status = 'overdue';
    else if (isDueToday) status = 'due_today';

    tasks.push({
      id: `fu-${d.id}-${cadence.step}`, denialId: d.id, claimNumber: d.claimNumber,
      patientName: d.patientName, payerName: d.payerName, deniedAmount: d.deniedAmount,
      status, cadenceStep: cadence.step, dueDate: dueDate.toISOString(),
      daysSinceResubmission: daysSince, action: cadence.action,
      priority: status === 'escalated' ? 'critical' : status === 'overdue' ? 'high' : 'medium',
      escalationLevel: isOverdue ? Math.min(cadence.escalation + 1, 3) : cadence.escalation,
    });
  }

  const statusOrder: any = { escalated: 0, overdue: 1, due_today: 2, pending: 3 };
  tasks.sort((a: any, b: any) => (statusOrder[a.status] || 4) - (statusOrder[b.status] || 4));
  return tasks;
}

export async function getFollowUpSummary() {
  const tasks = await generateFollowUpTasks();
  const payerMap = new Map<string, { pending: number; overdue: number; totalDays: number; count: number }>();
  tasks.forEach((t: any) => {
    const e = payerMap.get(t.payerName) || { pending: 0, overdue: 0, totalDays: 0, count: 0 };
    e.count++; e.totalDays += t.daysSinceResubmission;
    if (t.status === 'overdue' || t.status === 'escalated') e.overdue++; else e.pending++;
    payerMap.set(t.payerName, e);
  });

  return {
    totalActive: tasks.length,
    dueTodayCount: tasks.filter((t: any) => t.status === 'due_today').length,
    overdueCount: tasks.filter((t: any) => t.status === 'overdue').length,
    escalatedCount: tasks.filter((t: any) => t.status === 'escalated').length,
    avgDaysPending: tasks.length > 0 ? Math.round(tasks.reduce((s: number, t: any) => s + t.daysSinceResubmission, 0) / tasks.length) : 0,
    byPayer: Array.from(payerMap.entries()).map(([payer, d]) => ({ payer, pending: d.pending, overdue: d.overdue, avgDays: Math.round(d.totalDays / d.count) })),
    byCadence: [],
    totalPendingAmount: tasks.reduce((s: number, t: any) => s + t.deniedAmount, 0),
  };
}
