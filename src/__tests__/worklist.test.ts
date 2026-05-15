import { describe, it, expect } from 'vitest';
import { generateWorklist } from '../lib/worklist';

describe('AI Worklist Engine', () => {
  it('returns items sorted by workScore descending', () => {
    const { items } = generateWorklist({ maxItems: 10 });
    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1].workScore).toBeGreaterThanOrEqual(items[i].workScore);
    }
  });

  it('assigns sequential ranks starting from 1', () => {
    const { items } = generateWorklist({ maxItems: 5 });
    items.forEach((item, idx) => {
      expect(item.rank).toBe(idx + 1);
    });
  });

  it('filters by category', () => {
    const { items } = generateWorklist({ category: 'coding_error' });
    items.forEach(item => {
      expect(item.denial.denialCategory).toBe('coding_error');
    });
  });

  it('filters by payer name', () => {
    const { items } = generateWorklist({ payerName: 'Medicare' });
    items.forEach(item => {
      expect(item.denial.payerName.toLowerCase()).toContain('medicare');
    });
  });

  it('assigns risk levels correctly', () => {
    const { items } = generateWorklist({});
    items.forEach(item => {
      expect(['critical', 'high', 'medium', 'low']).toContain(item.riskLevel);
    });
  });

  it('summary matches items', () => {
    const { items, summary } = generateWorklist({ maxItems: 50 });
    expect(summary.totalItems).toBe(items.length);
    expect(summary.criticalCount).toBe(items.filter(i => i.riskLevel === 'critical').length);
    expect(summary.highCount).toBe(items.filter(i => i.riskLevel === 'high').length);
  });

  it('recommends actions based on status', () => {
    const { items } = generateWorklist({});
    items.forEach(item => {
      if (item.denial.status === 'New') expect(item.recommendedAction).toContain('Analysis');
      if (item.denial.status === 'Reviewed') expect(item.recommendedAction).toContain('Resubmit');
    });
  });
});
