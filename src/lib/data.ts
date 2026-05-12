import fs from 'fs';
import path from 'path';
import { Denial } from './types';
import sampleDenials from './sample-data';
import { calculateFilingDeadline } from './payer-rules';

// In-memory store for Vercel serverless (fs.writeFileSync doesn't work on Vercel)
let memoryStore: Denial[] | null = null;

function initializeData(): Denial[] {
  if (memoryStore) return memoryStore;
  
  // Try to load from file (works on VM/local)
  try {
    const DATA_DIR = path.join(process.cwd(), 'data');
    const DENIALS_FILE = path.join(DATA_DIR, 'denials.json');
    if (fs.existsSync(DENIALS_FILE)) {
      const data = fs.readFileSync(DENIALS_FILE, 'utf-8');
      memoryStore = JSON.parse(data);
      return memoryStore!;
    }
  } catch (e) {
    // File read failed, use sample data
  }
  
  // Use sample data as initial store
  memoryStore = [...sampleDenials];
  return memoryStore;
}

function saveData(denials: Denial[]): void {
  memoryStore = denials;
  // Try to persist to file (works on VM/local, no-op on Vercel)
  try {
    const DATA_DIR = path.join(process.cwd(), 'data');
    const DENIALS_FILE = path.join(DATA_DIR, 'denials.json');
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DENIALS_FILE, JSON.stringify(denials, null, 2));
  } catch (e) {
    // Silently fail on Vercel (read-only filesystem)
  }
}

export function getDenials(): Denial[] {
  return initializeData();
}

export function getDenialById(id: string): Denial | undefined {
  const denials = initializeData();
  return denials.find((d) => d.id === id);
}

export function createDenial(denial: Omit<Denial, 'id' | 'createdAt' | 'updatedAt'>): Denial {
  const denials = initializeData();
  const newDenial: Denial = {
    ...denial,
    id: `DEN-${String(denials.length + 1).padStart(3, '0')}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  denials.push(newDenial);
  saveData(denials);
  return newDenial;
}

export function updateDenial(id: string, updates: Partial<Denial>): Denial | null {
  const denials = initializeData();
  const index = denials.findIndex((d) => d.id === id);
  if (index === -1) return null;
  denials[index] = { ...denials[index], ...updates, updatedAt: new Date().toISOString() };
  saveData(denials);
  return denials[index];
}

export function bulkCreateDenials(newDenials: Array<Omit<Denial, 'id' | 'createdAt' | 'updatedAt'>>): Denial[] {
  const denials = initializeData();
  const created: Denial[] = [];
  for (const denialData of newDenials) {
    // Calculate filing deadline
    let filingDeadline: string | undefined;
    let filingDeadlineDays: number | undefined;
    let isTimelyFilingRisk = false;

    try {
      const deadlineInfo = calculateFilingDeadline(
        denialData.payerName || '',
        denialData.dateOfService || '',
        denialData.denialDate || ''
      );
      if (deadlineInfo.deadline) {
        filingDeadline = deadlineInfo.deadline.toISOString();
        filingDeadlineDays = deadlineInfo.daysRemaining || undefined;
        isTimelyFilingRisk = deadlineInfo.isAtRisk;
      }
    } catch {
      // Skip deadline calculation on error
    }

    const newDenial: Denial = {
      ...denialData,
      id: `DEN-${String(denials.length + 1).padStart(3, '0')}`,
      filingDeadline,
      filingDeadlineDays,
      isTimelyFilingRisk,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    denials.push(newDenial);
    created.push(newDenial);
  }
  saveData(denials);
  return created;
}

export function getDashboardStats() {
  const denials = initializeData();

  const totalDenials = denials.length;
  const totalDeniedAmount = denials.reduce((sum, d) => sum + d.deniedAmount, 0);
  const totalRecoveredAmount = denials
    .filter((d) => d.status === 'Closed' || d.status === 'Resubmitted')
    .reduce((sum, d) => sum + d.deniedAmount * 0.65, 0);
  const recoveryRate = totalDeniedAmount > 0 ? (totalRecoveredAmount / totalDeniedAmount) * 100 : 0;

  const now = new Date();
  const avgDaysToResolve =
    denials
      .filter((d) => d.status === 'Closed')
      .reduce((sum, d) => {
        const created = new Date(d.createdAt);
        const updated = new Date(d.updatedAt);
        return sum + (updated.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
      }, 0) / Math.max(denials.filter((d) => d.status === 'Closed').length, 1);

  const statusCounts = {
    New: denials.filter((d) => d.status === 'New').length,
    Analyzed: denials.filter((d) => d.status === 'Analyzed').length,
    Corrected: denials.filter((d) => d.status === 'Corrected').length,
    Reviewed: denials.filter((d) => d.status === 'Reviewed').length,
    Resubmitted: denials.filter((d) => d.status === 'Resubmitted').length,
    Closed: denials.filter((d) => d.status === 'Closed').length,
  };

  const categoryMap = new Map<string, { count: number; amount: number }>();
  denials.forEach((d) => {
    const cat = d.denialCategory || 'other';
    const existing = categoryMap.get(cat) || { count: 0, amount: 0 };
    categoryMap.set(cat, { count: existing.count + 1, amount: existing.amount + d.deniedAmount });
  });
  const categoryBreakdown = Array.from(categoryMap.entries()).map(([category, data]) => ({
    category,
    ...data,
  }));

  const payerMap = new Map<string, { count: number; amount: number }>();
  denials.forEach((d) => {
    const existing = payerMap.get(d.payerName) || { count: 0, amount: 0 };
    payerMap.set(d.payerName, { count: existing.count + 1, amount: existing.amount + d.deniedAmount });
  });
  const payerBreakdown = Array.from(payerMap.entries()).map(([payer, data]) => ({
    payer,
    ...data,
  }));

  const recentDenials = [...denials]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  const agingBuckets = [
    { bucket: '0-30 days', count: 0, amount: 0 },
    { bucket: '31-60 days', count: 0, amount: 0 },
    { bucket: '61-90 days', count: 0, amount: 0 },
    { bucket: '90+ days', count: 0, amount: 0 },
  ];
  denials.forEach((d) => {
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

  return {
    totalDenials,
    totalDeniedAmount,
    totalRecoveredAmount,
    recoveryRate,
    avgDaysToResolve,
    ...statusCounts,
    newDenialsCount: statusCounts.New,
    analyzedCount: statusCounts.Analyzed,
    correctedCount: statusCounts.Corrected,
    reviewedCount: statusCounts.Reviewed,
    resubmittedCount: statusCounts.Resubmitted,
    closedCount: statusCounts.Closed,
    categoryBreakdown,
    payerBreakdown,
    recentDenials,
    agingBuckets,
  };
}
