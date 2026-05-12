import { PayerRule, PayerRuleType } from './types';

// In-memory payer rules store with common default rules
let payerRules: PayerRule[] = [
  // Medicare
  {
    id: 'pr-001',
    payerName: 'Medicare',
    payerId: 'CMS',
    ruleType: 'filing_deadline',
    ruleName: 'Medicare Timely Filing',
    description: 'Claims must be filed within 365 days of date of service',
    conditions: {},
    filingDeadlineDays: 365,
    appealDeadlineDays: 120,
    requiresAuth: false,
    contactPhone: '1-800-633-4227',
    contactFax: null,
    contactEmail: null,
    contactAddress: null,
    portalUrl: 'https://www.cms.gov',
    notes: 'Medicare Part B: 365 days from DOS. Part A: 365 days from DOS.',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  // UnitedHealthcare
  {
    id: 'pr-002',
    payerName: 'UnitedHealthcare',
    payerId: '87726',
    ruleType: 'filing_deadline',
    ruleName: 'UHC Timely Filing',
    description: 'Claims must be filed within 180 days of date of service',
    conditions: {},
    filingDeadlineDays: 180,
    appealDeadlineDays: 90,
    requiresAuth: false,
    contactPhone: '1-877-842-3210',
    contactFax: '1-801-994-1349',
    contactEmail: null,
    contactAddress: null,
    portalUrl: 'https://www.uhcprovider.com',
    notes: 'In-network: 90 days. Out-of-network: 180 days.',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  // Aetna
  {
    id: 'pr-003',
    payerName: 'Aetna',
    payerId: '60054',
    ruleType: 'filing_deadline',
    ruleName: 'Aetna Timely Filing',
    description: 'Claims must be filed within 180 days of date of service',
    conditions: {},
    filingDeadlineDays: 180,
    appealDeadlineDays: 60,
    requiresAuth: false,
    contactPhone: '1-800-624-0756',
    contactFax: '1-860-754-5440',
    contactEmail: null,
    contactAddress: null,
    portalUrl: 'https://www.availity.com',
    notes: 'Appeal deadline is 60 days from EOB receipt.',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  // Blue Cross Blue Shield
  {
    id: 'pr-004',
    payerName: 'Blue Cross Blue Shield',
    payerId: '00060',
    ruleType: 'filing_deadline',
    ruleName: 'BCBS Timely Filing',
    description: 'Claims must be filed within 365 days of date of service (varies by plan)',
    conditions: {},
    filingDeadlineDays: 365,
    appealDeadlineDays: 90,
    requiresAuth: false,
    contactPhone: '1-800-262-2583',
    contactFax: null,
    contactEmail: null,
    contactAddress: null,
    portalUrl: 'https://www.availity.com',
    notes: 'Varies by state/plan. In-network may have 90-day requirement.',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  // Cigna
  {
    id: 'pr-005',
    payerName: 'Cigna',
    payerId: '62308',
    ruleType: 'filing_deadline',
    ruleName: 'Cigna Timely Filing',
    description: 'Claims must be filed within 180 days of date of service',
    conditions: {},
    filingDeadlineDays: 180,
    appealDeadlineDays: 90,
    requiresAuth: false,
    contactPhone: '1-800-244-6224',
    contactFax: '1-859-410-2416',
    contactEmail: null,
    contactAddress: null,
    portalUrl: 'https://www.cignaforhcp.com',
    notes: 'In-network: 90 days. Out-of-network: 180 days.',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  // Humana
  {
    id: 'pr-006',
    payerName: 'Humana',
    payerId: '61101',
    ruleType: 'filing_deadline',
    ruleName: 'Humana Timely Filing',
    description: 'Claims must be filed within 365 days of date of service',
    conditions: {},
    filingDeadlineDays: 365,
    appealDeadlineDays: 60,
    requiresAuth: false,
    contactPhone: '1-800-457-4708',
    contactFax: '1-800-949-2961',
    contactEmail: null,
    contactAddress: null,
    portalUrl: 'https://www.availity.com',
    notes: 'Appeal must include supporting documentation.',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  // Authorization rules
  {
    id: 'pr-007',
    payerName: 'UnitedHealthcare',
    payerId: '87726',
    ruleType: 'auth_required',
    ruleName: 'UHC Prior Auth - Advanced Imaging',
    description: 'Prior authorization required for MRI, CT, PET scans',
    conditions: { cptCodeRange: ['70000-79999'], modifiers: [] },
    filingDeadlineDays: null,
    appealDeadlineDays: null,
    requiresAuth: true,
    contactPhone: '1-866-889-8054',
    contactFax: null,
    contactEmail: null,
    contactAddress: null,
    portalUrl: 'https://www.uhcprovider.com/prior-auth',
    notes: 'Use eviCore for imaging auth requests.',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'pr-008',
    payerName: 'Aetna',
    payerId: '60054',
    ruleType: 'auth_required',
    ruleName: 'Aetna Prior Auth - Outpatient Surgery',
    description: 'Prior authorization required for outpatient surgical procedures',
    conditions: { cptCodeRange: ['10000-69999'], modifiers: [] },
    filingDeadlineDays: null,
    appealDeadlineDays: null,
    requiresAuth: true,
    contactPhone: '1-800-624-0756',
    contactFax: null,
    contactEmail: null,
    contactAddress: null,
    portalUrl: 'https://www.availity.com',
    notes: 'Submit via Availity portal for faster processing.',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export function getPayerRules(filters?: {
  payerName?: string;
  ruleType?: PayerRuleType;
  isActive?: boolean;
}): PayerRule[] {
  let filtered = [...payerRules];

  if (filters?.payerName) {
    filtered = filtered.filter((r) =>
      r.payerName.toLowerCase().includes(filters.payerName!.toLowerCase())
    );
  }
  if (filters?.ruleType) {
    filtered = filtered.filter((r) => r.ruleType === filters.ruleType);
  }
  if (filters?.isActive !== undefined) {
    filtered = filtered.filter((r) => r.isActive === filters.isActive);
  }

  return filtered;
}

export function getPayerRuleById(id: string): PayerRule | undefined {
  return payerRules.find((r) => r.id === id);
}

export function createPayerRule(rule: Omit<PayerRule, 'id' | 'createdAt' | 'updatedAt'>): PayerRule {
  const newRule: PayerRule = {
    ...rule,
    id: `pr-${String(payerRules.length + 1).padStart(3, '0')}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  payerRules.push(newRule);
  return newRule;
}

export function updatePayerRule(id: string, updates: Partial<PayerRule>): PayerRule | null {
  const index = payerRules.findIndex((r) => r.id === id);
  if (index === -1) return null;
  payerRules[index] = { ...payerRules[index], ...updates, updatedAt: new Date().toISOString() };
  return payerRules[index];
}

export function deletePayerRule(id: string): boolean {
  const index = payerRules.findIndex((r) => r.id === id);
  if (index === -1) return false;
  payerRules.splice(index, 1);
  return true;
}

/**
 * Calculate filing deadline for a denial based on payer rules
 */
export function calculateFilingDeadline(payerName: string, dateOfService: string, denialDate: string): {
  deadline: Date | null;
  daysRemaining: number | null;
  isAtRisk: boolean;
} {
  const rule = payerRules.find(
    (r) => r.payerName.toLowerCase() === payerName.toLowerCase() && r.ruleType === 'filing_deadline' && r.isActive
  );

  if (!rule || !rule.filingDeadlineDays) {
    // Default: 365 days from denial date
    const deadline = new Date(denialDate);
    deadline.setDate(deadline.getDate() + 365);
    const now = new Date();
    const daysRemaining = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return { deadline, daysRemaining, isAtRisk: daysRemaining <= 30 };
  }

  // Use the later of DOS-based or denial-date-based deadline
  const dosDeadline = new Date(dateOfService);
  dosDeadline.setDate(dosDeadline.getDate() + rule.filingDeadlineDays);

  const now = new Date();
  const daysRemaining = Math.ceil((dosDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return {
    deadline: dosDeadline,
    daysRemaining,
    isAtRisk: daysRemaining <= 30,
  };
}

/**
 * Calculate appeal deadline for a denial
 */
export function calculateAppealDeadline(payerName: string, denialDate: string): {
  deadline: Date | null;
  daysRemaining: number | null;
  isAtRisk: boolean;
} {
  const rule = payerRules.find(
    (r) => r.payerName.toLowerCase() === payerName.toLowerCase() && r.ruleType === 'filing_deadline' && r.isActive
  );

  const appealDays = rule?.appealDeadlineDays || 60; // default 60 days
  const deadline = new Date(denialDate);
  deadline.setDate(deadline.getDate() + appealDays);

  const now = new Date();
  const daysRemaining = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return {
    deadline,
    daysRemaining,
    isAtRisk: daysRemaining <= 14,
  };
}

/**
 * Check if a CPT code requires prior authorization for a given payer
 */
export function checkAuthRequired(payerName: string, cptCode: string): {
  required: boolean;
  rule?: PayerRule;
} {
  const authRules = payerRules.filter(
    (r) =>
      r.payerName.toLowerCase() === payerName.toLowerCase() &&
      r.ruleType === 'auth_required' &&
      r.isActive
  );

  for (const rule of authRules) {
    const conditions = rule.conditions as { cptCodeRange?: string[] };
    if (conditions.cptCodeRange) {
      for (const range of conditions.cptCodeRange) {
        const [start, end] = range.split('-');
        const cptNum = parseInt(cptCode);
        if (cptNum >= parseInt(start) && cptNum <= parseInt(end)) {
          return { required: true, rule };
        }
      }
    }
  }

  return { required: false };
}
