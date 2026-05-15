import { FinancialEvent, FinancialEventType } from './types';

// In-memory financial tracking store
let financialEvents: FinancialEvent[] = [];

export function createFinancialEvent(event: Omit<FinancialEvent, 'id' | 'createdAt'>): FinancialEvent {
  const newEvent: FinancialEvent = {
    ...event,
    id: `FIN-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    createdAt: new Date().toISOString(),
  };
  financialEvents.push(newEvent);
  return newEvent;
}

export function getFinancialEvents(filters?: {
  denialId?: string;
  eventType?: FinancialEventType;
  startDate?: string;
  endDate?: string;
}): FinancialEvent[] {
  let filtered = [...financialEvents];

  if (filters?.denialId) {
    filtered = filtered.filter((e) => e.denialId === filters.denialId);
  }
  if (filters?.eventType) {
    filtered = filtered.filter((e) => e.eventType === filters.eventType);
  }
  if (filters?.startDate) {
    filtered = filtered.filter((e) => e.createdAt >= filters.startDate!);
  }
  if (filters?.endDate) {
    filtered = filtered.filter((e) => e.createdAt <= filters.endDate!);
  }

  return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getFinancialSummary(denialIds?: string[]): {
  totalResubmitted: number;
  totalRecovered: number;
  totalWriteOff: number;
  totalAdjustments: number;
  recoveryRate: number;
  avgDaysToPayment: number;
  byEventType: Record<string, { count: number; amount: number }>;
  byMonth: Array<{ month: string; recovered: number; writeOff: number; pending: number }>;
} {
  let events = [...financialEvents];
  if (denialIds && denialIds.length > 0) {
    events = events.filter((e) => denialIds.includes(e.denialId));
  }

  const byType: Record<string, { count: number; amount: number }> = {};
  let totalResubmitted = 0;
  let totalRecovered = 0;
  let totalWriteOff = 0;
  let totalAdjustments = 0;

  for (const event of events) {
    if (!byType[event.eventType]) {
      byType[event.eventType] = { count: 0, amount: 0 };
    }
    byType[event.eventType].count++;
    byType[event.eventType].amount += event.amount;

    switch (event.eventType) {
      case 'resubmission':
        totalResubmitted += event.amount;
        break;
      case 'full_payment':
      case 'partial_payment':
        totalRecovered += event.amount;
        break;
      case 'write_off':
        totalWriteOff += event.amount;
        break;
      case 'adjustment':
        totalAdjustments += event.amount;
        break;
    }
  }

  const recoveryRate = totalResubmitted > 0 ? (totalRecovered / totalResubmitted) * 100 : 0;

  // Monthly breakdown (last 6 months)
  const byMonth: Array<{ month: string; recovered: number; writeOff: number; pending: number }> = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStr = monthDate.toISOString().slice(0, 7);
    const monthLabel = monthDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

    const monthEvents = events.filter((e) => e.createdAt.startsWith(monthStr));
    const recovered = monthEvents
      .filter((e) => e.eventType === 'full_payment' || e.eventType === 'partial_payment')
      .reduce((sum, e) => sum + e.amount, 0);
    const writeOff = monthEvents
      .filter((e) => e.eventType === 'write_off')
      .reduce((sum, e) => sum + e.amount, 0);
    const pending = monthEvents
      .filter((e) => e.eventType === 'resubmission')
      .reduce((sum, e) => sum + e.amount, 0) - recovered - writeOff;

    byMonth.push({ month: monthLabel, recovered, writeOff, pending: Math.max(0, pending) });
  }

  return {
    totalResubmitted,
    totalRecovered,
    totalWriteOff,
    totalAdjustments,
    recoveryRate,
    avgDaysToPayment: 0, // Would need payment dates to calculate
    byEventType: byType,
    byMonth,
  };
}

export function deleteFinancialEvent(id: string): boolean {
  const index = financialEvents.findIndex((e) => e.id === id);
  if (index === -1) return false;
  financialEvents.splice(index, 1);
  return true;
}
