import { describe, it, expect } from 'vitest';
import { generateHealthScan } from '../lib/health-scan';

describe('Client Health Scan', () => {
  it('generates a report with overall score between 0-100', async () => {
    const report = await generateHealthScan({ clientName: 'Test Practice' });
    expect(report.overallScore).toBeGreaterThanOrEqual(0);
    expect(report.overallScore).toBeLessThanOrEqual(100);
  });

  it('assigns a valid letter grade', async () => {
    const report = await generateHealthScan({});
    expect(['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F']).toContain(report.overallGrade);
  });

  it('has all 5 dimension scores', async () => {
    const report = await generateHealthScan({});
    expect(report.dimensions.denialRate).toBeDefined();
    expect(report.dimensions.recoveryPotential).toBeDefined();
    expect(report.dimensions.codingAccuracy).toBeDefined();
    expect(report.dimensions.timelyFilingCompliance).toBeDefined();
    expect(report.dimensions.payerMixHealth).toBeDefined();
  });

  it('each dimension has score, grade, value, benchmark', async () => {
    const report = await generateHealthScan({});
    Object.values(report.dimensions).forEach(dim => {
      expect(dim.score).toBeGreaterThanOrEqual(0);
      expect(dim.score).toBeLessThanOrEqual(100);
      expect(dim.grade).toBeDefined();
      expect(dim.value).toBeDefined();
      expect(dim.benchmark).toBeDefined();
      expect(['above', 'at', 'below']).toContain(dim.status);
    });
  });

  it('generates payer grades', async () => {
    const report = await generateHealthScan({});
    expect(Array.isArray(report.payerGrades)).toBe(true);
    report.payerGrades.forEach(pg => {
      expect(pg.payerName).toBeDefined();
      expect(pg.grade).toBeDefined();
      expect(pg.score).toBeGreaterThan(0);
    });
  });

  it('generates improvement plan with priorities', async () => {
    const report = await generateHealthScan({});
    expect(Array.isArray(report.improvementPlan)).toBe(true);
    expect(report.improvementPlan.length).toBeGreaterThan(0);
    report.improvementPlan.forEach((action, idx) => {
      expect(action.priority).toBe(idx + 1);
      expect(action.action).toBeDefined();
      expect(['easy', 'medium', 'hard']).toContain(action.difficulty);
    });
  });

  it('executive summary mentions client name', async () => {
    const report = await generateHealthScan({ clientName: 'ABC Ortho' });
    expect(report.executiveSummary).toContain('ABC Ortho');
  });

  it('respects totalClaimsSubmitted for denial rate calculation', async () => {
    const report1 = await generateHealthScan({ totalClaimsSubmitted: 100 });
    const report2 = await generateHealthScan({ totalClaimsSubmitted: 10000 });
    // With more total claims, denial rate should be lower
    expect(report2.metrics.denialRate).toBeLessThan(report1.metrics.denialRate);
  });
});
