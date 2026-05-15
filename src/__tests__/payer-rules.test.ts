import { describe, it, expect } from 'vitest';
import { calculateFilingDeadline, calculateAppealDeadline, checkAuthRequired, getPayerRules } from '../lib/payer-rules';

describe('Payer Rules Engine', () => {
  describe('calculateFilingDeadline', () => {
    it('returns a deadline for known payers', () => {
      const result = calculateFilingDeadline('Medicare', '2024-06-01', '2024-07-01');
      expect(result.deadline).toBeInstanceOf(Date);
      expect(result.daysRemaining).toBeDefined();
    });

    it('marks as at-risk when fewer than 30 days remain', () => {
      // DOS very recent = lots of time left
      const recent = calculateFilingDeadline('UnitedHealthcare', new Date().toISOString().split('T')[0], new Date().toISOString().split('T')[0]);
      expect(recent.isAtRisk).toBe(false);
    });

    it('defaults to 365 days for unknown payers', () => {
      const result = calculateFilingDeadline('Unknown Payer XYZ', '2024-06-01', '2024-07-01');
      expect(result.deadline).toBeInstanceOf(Date);
    });
  });

  describe('calculateAppealDeadline', () => {
    it('returns deadline based on payer appeal days', () => {
      const result = calculateAppealDeadline('Aetna', '2024-10-01');
      expect(result.deadline).toBeInstanceOf(Date);
      // Aetna has 60-day appeal window
      expect(result.daysRemaining).toBeDefined();
    });

    it('defaults to 60 days for unknown payers', () => {
      const result = calculateAppealDeadline('Random Payer', '2024-10-01');
      expect(result.deadline).toBeInstanceOf(Date);
    });
  });

  describe('checkAuthRequired', () => {
    it('detects auth requirement for imaging codes with UHC', () => {
      const result = checkAuthRequired('UnitedHealthcare', '70553'); // MRI Brain
      expect(result.required).toBe(true);
    });

    it('returns false for E/M codes', () => {
      const result = checkAuthRequired('UnitedHealthcare', '99213');
      expect(result.required).toBe(false);
    });

    it('returns false for unknown payers', () => {
      const result = checkAuthRequired('Random Insurance', '70553');
      expect(result.required).toBe(false);
    });
  });

  describe('getPayerRules', () => {
    it('returns rules for all payers when no filter', () => {
      const rules = getPayerRules();
      expect(rules.length).toBeGreaterThan(0);
    });

    it('filters by payer name', () => {
      const rules = getPayerRules({ payerName: 'Medicare' });
      rules.forEach(r => {
        expect(r.payerName.toLowerCase()).toContain('medicare');
      });
    });

    it('filters by rule type', () => {
      const rules = getPayerRules({ ruleType: 'filing_deadline' });
      rules.forEach(r => {
        expect(r.ruleType).toBe('filing_deadline');
      });
    });
  });
});
