import { describe, it, expect } from 'vitest';
import { executeNLQuery } from '../lib/nl-query';

describe('Natural Language Query Parser', () => {
  it('parses payer name from query', () => {
    const result = executeNLQuery('Show me Aetna denials');
    expect(result.query.filtersApplied).toContain('Payer: Aetna');
  });

  it('parses payer aliases (UHC → UnitedHealthcare)', () => {
    const result = executeNLQuery('UHC coding errors');
    expect(result.query.filtersApplied.some(f => f.includes('UnitedHealthcare'))).toBe(true);
  });

  it('parses amount filter (over $1000)', () => {
    const result = executeNLQuery('denials over $1000');
    expect(result.query.filtersApplied.some(f => f.includes('Amount > $1,000'))).toBe(true);
    result.results.forEach(d => {
      expect(d.deniedAmount).toBeGreaterThanOrEqual(1000);
    });
  });

  it('parses amount filter (under $500)', () => {
    const result = executeNLQuery('claims under $500');
    expect(result.query.filtersApplied.some(f => f.includes('Amount < $500'))).toBe(true);
    result.results.forEach(d => {
      expect(d.deniedAmount).toBeLessThanOrEqual(500);
    });
  });

  it('parses category filter', () => {
    const result = executeNLQuery('coding errors');
    expect(result.query.filtersApplied.some(f => f.includes('Category'))).toBe(true);
  });

  it('parses correctable filter', () => {
    const result = executeNLQuery('correctable denials');
    expect(result.query.filtersApplied).toContain('Correctable: Yes');
  });

  it('parses date range (last month)', () => {
    const result = executeNLQuery('denials from last month');
    expect(result.query.filtersApplied.some(f => f.includes('Last month'))).toBe(true);
  });

  it('returns summary with count and amount', () => {
    const result = executeNLQuery('all denials');
    expect(result.summary).toBeDefined();
    expect(result.totalCount).toBeGreaterThanOrEqual(0);
    expect(result.totalAmount).toBeGreaterThanOrEqual(0);
  });

  it('returns interpretation string', () => {
    const result = executeNLQuery('Medicare over $5000');
    expect(result.query.interpretation).toContain('Searching for denials');
  });

  it('handles empty query gracefully', () => {
    const result = executeNLQuery('');
    expect(result.query.filtersApplied.length).toBe(0);
  });
});
