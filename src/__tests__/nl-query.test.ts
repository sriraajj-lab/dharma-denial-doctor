import { describe, it, expect } from 'vitest';
import { executeNLQuery } from '../lib/nl-query';

describe('Natural Language Query Parser', () => {
  it('parses payer name from query', async () => {
    const result = await executeNLQuery('Show me Aetna denials');
    expect(result.query.filtersApplied).toContain('Payer: Aetna');
  });

  it('parses payer aliases (UHC → UnitedHealthcare)', async () => {
    const result = await executeNLQuery('UHC coding errors');
    expect(result.query.filtersApplied.some(f => f.includes('UnitedHealthcare'))).toBe(true);
  });

  it('parses amount filter (over $1000)', async () => {
    const result = await executeNLQuery('denials over $1000');
    expect(result.query.filtersApplied.some(f => f.includes('Amount > $1,000'))).toBe(true);
    result.results.forEach(d => {
      expect(d.deniedAmount).toBeGreaterThanOrEqual(1000);
    });
  });

  it('parses amount filter (under $500)', async () => {
    const result = await executeNLQuery('claims under $500');
    expect(result.query.filtersApplied.some(f => f.includes('Amount < $500'))).toBe(true);
    result.results.forEach(d => {
      expect(d.deniedAmount).toBeLessThanOrEqual(500);
    });
  });

  it('parses category filter', async () => {
    const result = await executeNLQuery('coding errors');
    expect(result.query.filtersApplied.some(f => f.includes('Category'))).toBe(true);
  });

  it('parses correctable filter', async () => {
    const result = await executeNLQuery('correctable denials');
    expect(result.query.filtersApplied).toContain('Correctable: Yes');
  });

  it('parses date range (last month)', async () => {
    const result = await executeNLQuery('denials from last month');
    expect(result.query.filtersApplied.some(f => f.includes('Last month'))).toBe(true);
  });

  it('returns summary with count and amount', async () => {
    const result = await executeNLQuery('all denials');
    expect(result.summary).toBeDefined();
    expect(result.totalCount).toBeGreaterThanOrEqual(0);
    expect(result.totalAmount).toBeGreaterThanOrEqual(0);
  });

  it('returns interpretation string', async () => {
    const result = await executeNLQuery('Medicare over $5000');
    expect(result.query.interpretation).toContain('Searching for denials');
  });

  it('handles empty query gracefully', async () => {
    const result = await executeNLQuery('');
    expect(result.query.filtersApplied.length).toBe(0);
  });
});
