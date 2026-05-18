// ─── CORE DENIAL TYPES ──────────────────────────────────────────────────────────

export interface Denial {
  id: string;
  claimNumber: string;
  patientName: string;
  patientDOB: string;
  patientMemberId?: string;
  payerName: string;
  payerId: string;
  providerNPI: string;
  providerName?: string;
  facilityName?: string;
  dateOfService: string;
  denialDate: string;
  cptCode: string;
  cdtCode?: string; // Dental CDT code support
  codeType: 'CPT' | 'CDT'; // Medical vs Dental coding
  modifier?: string;
  diagnosisCode: string;
  diagnosisCode2?: string;
  diagnosisCode3?: string;
  diagnosisCode4?: string;
  billedAmount: number;
  deniedAmount: number;
  allowedAmount?: number;
  paidAmount?: number;
  carcCode: string;
  rarcCode?: string;
  adjustmentGroupCode: string;
  denialCategory: string;
  status: DenialStatus;
  priority: DenialPriority;
  filingDeadline?: string;
  filingDeadlineDays?: number;
  isTimelyFilingRisk?: boolean;
  batchId?: string;
  practiceType: PracticeType; // Medical or Dental
  analysis?: DenialAnalysis;
  correction?: CorrectionSuggestion;
  qualityCheck?: QualityCheck;
  appeals?: AppealLetter[];
  notes?: DenialNote[];
  assignments?: DenialAssignment[];
  financials?: FinancialEvent[];
  createdAt: string;
  updatedAt: string;
}

export type DenialStatus = 'New' | 'Analyzed' | 'Corrected' | 'Reviewed' | 'Resubmitted' | 'Appealed' | 'Closed';
export type DenialPriority = 'low' | 'normal' | 'high' | 'critical';
export type PracticeType = 'medical' | 'dental';

// ─── ANALYSIS TYPES ─────────────────────────────────────────────────────────────

export interface DenialAnalysis {
  id?: string;
  denialId?: string;
  denialSummary: string;
  rootCauseCategory: string;
  rootCauseDetail: string;
  denialCategory: string;
  preventable: boolean;
  correctable: boolean;
  appealRecommended: boolean;
  confidenceScore: number;
  recommendedNextAction: string;
  requiredInformation: Array<{ item: string; reasonNeeded: string }>;
  complianceNotes: string[];
  analyzedAt: string;
}

export interface CorrectionSuggestion {
  id?: string;
  denialId?: string;
  correctionType: string;
  correctionSummary: string;
  correctionRationale: string;
  proposedChanges: Array<{
    fieldPath: string;
    originalValue: string;
    proposedValue: string;
    reason: string;
    riskLevel: 'low' | 'medium' | 'high';
  }>;
  requiredDocuments: Array<{ documentType: string; reason: string }>;
  resubmissionInstructions: {
    claimFrequencyCode: string;
    submissionType: string;
    notes: string;
  };
  confidenceScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  complianceNotes: string[];
  createdAt: string;
}

export interface QualityCheck {
  id?: string;
  denialId?: string;
  overallResult: 'pass' | 'fail' | 'warning';
  validationFindings: Array<{ check: string; result: string; details: string }>;
  blockingIssues: Array<{ issue: string; requiredResolution: string }>;
  warnings: Array<{ warning: string; recommendedAction: string }>;
  recommendation: string;
  confidenceScore: number;
  checkedAt: string;
}

// ─── APPEAL TYPES ───────────────────────────────────────────────────────────────

export interface AppealLetter {
  id: string;
  denialId: string;
  appealType: 'first_level' | 'second_level' | 'external_review';
  status: 'draft' | 'pending_review' | 'sent' | 'accepted' | 'denied' | 'expired';
  letterContent: string;
  supportingDocs: Array<{ name: string; type: string; url?: string }>;
  recipientName?: string;
  recipientFax?: string;
  recipientAddress?: string;
  sentAt?: string;
  responseDate?: string;
  responseNotes?: string;
  deadline?: string;
  createdById: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── NOTES TYPES ────────────────────────────────────────────────────────────────

export interface DenialNote {
  id: string;
  denialId: string;
  authorId: string;
  authorName?: string;
  content: string;
  noteType: 'general' | 'internal' | 'escalation' | 'payer_contact' | 'resolution';
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── AUDIT TYPES ────────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  userId?: string;
  userName?: string;
  denialId?: string;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export type AuditAction =
  | 'create' | 'update' | 'delete' | 'view'
  | 'analyze' | 'correct' | 'quality_check'
  | 'appeal_create' | 'appeal_send' | 'appeal_update'
  | 'note_add' | 'assign' | 'export'
  | 'login' | 'logout' | 'batch_start' | 'batch_complete'
  | 'payment_record' | 'scrub_run';

// ─── USER & AUTH TYPES ──────────────────────────────────────────────────────────

export interface AppUser {
  id: string;
  email: string;
  name?: string;
  role: UserRole;
  department?: string;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

export type UserRole = 'admin' | 'manager' | 'biller' | 'coder' | 'client';

// ─── PAYER RULES TYPES ──────────────────────────────────────────────────────────

export interface PayerRule {
  id: string;
  payerName: string;
  payerId?: string;
  ruleType: PayerRuleType;
  ruleName: string;
  description?: string;
  conditions: Record<string, unknown>;
  filingDeadlineDays?: number;
  appealDeadlineDays?: number;
  requiresAuth: boolean;
  contactPhone?: string;
  contactFax?: string;
  contactEmail?: string;
  contactAddress?: string;
  portalUrl?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PayerRuleType = 'filing_deadline' | 'auth_required' | 'modifier_rules' | 'bundling' | 'documentation';

// ─── FINANCIAL TRACKING TYPES ───────────────────────────────────────────────────

export interface FinancialEvent {
  id: string;
  denialId: string;
  eventType: FinancialEventType;
  amount: number;
  checkNumber?: string;
  eraTraceNumber?: string;
  paymentDate?: string;
  postingDate?: string;
  notes?: string;
  createdAt: string;
}

export type FinancialEventType = 'resubmission' | 'partial_payment' | 'full_payment' | 'write_off' | 'adjustment' | 'refund';

// ─── ASSIGNMENT TYPES ───────────────────────────────────────────────────────────

export interface DenialAssignment {
  id: string;
  denialId: string;
  assignedTo: string;
  assigneeName?: string;
  assignedBy?: string;
  status: 'active' | 'completed' | 'reassigned';
  dueDate?: string;
  completedAt?: string;
  notes?: string;
  createdAt: string;
}

// ─── CLAIM SCRUBBING TYPES ──────────────────────────────────────────────────────

export interface ClaimScrubRule {
  id: string;
  ruleName: string;
  ruleType: ScrubRuleType;
  description?: string;
  conditions: Record<string, unknown>;
  action: 'warn' | 'block' | 'auto_correct';
  severity: 'low' | 'medium' | 'high' | 'critical';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ScrubRuleType = 'coding_validation' | 'modifier_check' | 'diagnosis_match' | 'auth_required' | 'ncd_lcd' | 'bundling';

export interface ClaimScrubResult {
  id: string;
  denialId?: string;
  claimNumber?: string;
  ruleId?: string;
  ruleName: string;
  ruleType: string;
  severity: string;
  finding: string;
  suggestion?: string;
  status: 'open' | 'resolved' | 'ignored';
  resolvedAt?: string;
  createdAt: string;
}

// ─── BATCH PROCESSING TYPES ─────────────────────────────────────────────────────

export interface BatchJob {
  id: string;
  jobType: 'analyze' | 'correct' | 'quality_check' | 'appeal_generate' | 'batch_scan' | 'batch_fix';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  totalItems: number;
  processedItems: number;
  failedItems: number;
  denialIds: string[];
  results: Array<{ denialId: string; success: boolean; error?: string }>;
  errorLog?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── OVERVIEW REPORT ────────────────────────────────────────────────────────────

export interface OverviewReport {
  id: string;
  fileName: string;
  uploadDate: string;
  totalClaims: number;
  totalDeniedAmount: number;
  overallRating: number;
  ratingLabel: string;
  ratingColor: string;
  executiveSummary: string;
  keyIssues: Array<{
    issue: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    affectedClaims: number;
    affectedAmount: number;
    description: string;
  }>;
  categoryBreakdown: Array<{
    category: string;
    count: number;
    amount: number;
    percentage: number;
  }>;
  payerBreakdown: Array<{
    payer: string;
    count: number;
    amount: number;
    denialRate: number;
  }>;
  recoveryPotential: {
    estimatedRecoverable: number;
    recoveryPercentage: number;
    highConfidence: number;
    mediumConfidence: number;
    lowConfidence: number;
  };
  topDenialReasons: Array<{
    reason: string;
    carcCode: string;
    count: number;
    amount: number;
  }>;
  recommendations: string[];
  contractStatus: 'unsigned' | 'signed' | 'expired';
  signedAt?: string;
  signedBy?: string;
  importedDenialIds: string[];
}

// ─── DASHBOARD TYPES ────────────────────────────────────────────────────────────

export interface DashboardStats {
  totalDenials: number;
  totalDeniedAmount: number;
  totalRecoveredAmount: number;
  actualRecoveredAmount: number;
  recoveryRate: number;
  actualRecoveryRate: number;
  avgDaysToResolve: number;
  newDenialsCount: number;
  analyzedCount: number;
  correctedCount: number;
  reviewedCount: number;
  resubmittedCount: number;
  appealedCount: number;
  closedCount: number;
  categoryBreakdown: Array<{ category: string; count: number; amount: number }>;
  payerBreakdown: Array<{ payer: string; count: number; amount: number }>;
  recentDenials: Denial[];
  agingBuckets: Array<{ bucket: string; count: number; amount: number }>;
  timelyFilingAtRisk: number;
  pendingAppeals: number;
  activeBatchJobs: number;
}

export interface AgentStatus {
  id: string;
  name: string;
  description: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  lastRun?: string;
  lastResult?: string;
  totalRuns: number;
  successRate: number;
  avgDuration: number;
}

// ─── 3-LEVEL ACCESS MODEL ──────────────────────────────────────────────────────

export type AccessLevel = 1 | 2 | 3;

export interface LevelConfig {
  level: AccessLevel;
  name: string;
  subtitle: string;
  description: string;
  icon: string;
  features: string[];
  color: string;
  bgColor: string;
  borderColor: string;
}

export const LEVEL_CONFIGS: LevelConfig[] = [
  {
    level: 1,
    name: 'Scan & Score',
    subtitle: 'Diagnostic Overview',
    description: 'AI scans your billing data, identifies denial patterns, scores your practice health, and highlights pain points. You get a comprehensive report to fix issues manually.',
    icon: 'scan',
    features: [
      'AI-powered denial pattern recognition',
      'Practice health score (0-100)',
      'Pain point identification & ranking',
      'Payer-specific denial analysis',
      'Category breakdown with severity levels',
      'Top denial reasons with CARC mapping',
      'Recovery potential estimation',
      'Downloadable executive report',
      'No commitment - preview before you commit',
    ],
    color: 'text-cyan',
    bgColor: 'bg-cyan/10',
    borderColor: 'border-cyan/30',
  },
  {
    level: 2,
    name: 'Fix & Appeal',
    subtitle: 'Guided Recovery',
    description: 'Everything in Level 1, plus AI works every claim individually. Generates pre-authorization letters, shows exactly where to submit, provides step-by-step fix instructions, and returns a complete report for your team to execute manually.',
    icon: 'fix',
    features: [
      'Everything in Level 1',
      'AI analysis of every individual claim',
      'Smart coding corrections (NCCI, modifiers, CPT-ICD)',
      'Pre-authorization letter generation',
      'Submission destination mapping',
      'Step-by-step fix instructions per claim',
      'Appeal letter drafting (1st & 2nd level)',
      'Quality check validation before resubmission',
      'Comprehensive manual execution report',
      'Timely filing watchdog alerts',
    ],
    color: 'text-emerald',
    bgColor: 'bg-emerald/10',
    borderColor: 'border-emerald/30',
  },
  {
    level: 3,
    name: 'EHR Auto-Fix',
    subtitle: 'Full Autonomous Recovery',
    description: 'Everything in Levels 1 & 2, plus direct EHR integration. AI agents automatically fix claims, submit corrections, track payments, and manage the entire recovery lifecycle. Hands-free revenue recovery.',
    icon: 'auto',
    features: [
      'Everything in Levels 1 & 2',
      'Direct EHR/EMR integration (Epic, Cerner, Athena)',
      'Autonomous claim correction & resubmission',
      'Automated prior authorization workflows',
      'Real-time payment tracking & posting',
      'Automatic appeal filing & follow-up',
      'FHIR R4 & X12 EDI compliant',
      'Clearinghouse API integration (Availity, Stedi)',
      '16 AI agents working 24/7 autonomously',
      'Dedicated account manager',
    ],
    color: 'text-primary',
    bgColor: 'bg-primary/10',
    borderColor: 'border-primary/30',
  },
];

// ─── PAYMENT STRUCTURE ─────────────────────────────────────────────────────────

export type PaymentModel = 'per_hundred' | 'per_claim' | 'pay_as_you_grow' | 'collections_percentage';

export interface PricingTier {
  id: string;
  level: AccessLevel;
  paymentModel: PaymentModel;
  name: string;
  description: string;
  price: number;
  unit: string;
  popular?: boolean;
  savingsNote?: string;
}

export const PRICING_TIERS: PricingTier[] = [
  // Level 1 Pricing
  {
    id: 'l1-per-hundred',
    level: 1,
    paymentModel: 'per_hundred',
    name: 'Per 100 Claims',
    description: 'Best for practices with consistent claim volumes',
    price: 149,
    unit: 'per 100 claims scanned',
  },
  {
    id: 'l1-per-claim',
    level: 1,
    paymentModel: 'per_claim',
    name: 'Pay Per Claim',
    description: 'Flexible pricing for variable volumes',
    price: 1.99,
    unit: 'per claim scanned',
  },
  {
    id: 'l1-payg',
    level: 1,
    paymentModel: 'pay_as_you_grow',
    name: 'Pay As You Grow',
    description: 'Start small, scale as you see results',
    price: 0.99,
    unit: 'per claim (first 500), then $1.49/claim',
  },
  {
    id: 'l1-collections',
    level: 1,
    paymentModel: 'collections_percentage',
    name: 'No Upfront - Collections %',
    description: 'Zero upfront cost, pay from recovered revenue',
    price: 5,
    unit: '% of recovered amount',
  },
  // Level 2 Pricing
  {
    id: 'l2-per-hundred',
    level: 2,
    paymentModel: 'per_hundred',
    name: 'Per 100 Claims',
    description: 'Best for practices needing guided recovery',
    price: 349,
    unit: 'per 100 claims fixed',
    popular: true,
  },
  {
    id: 'l2-per-claim',
    level: 2,
    paymentModel: 'per_claim',
    name: 'Pay Per Claim',
    description: 'Flexible per-claim pricing',
    price: 4.49,
    unit: 'per claim fixed',
  },
  {
    id: 'l2-payg',
    level: 2,
    paymentModel: 'pay_as_you_grow',
    name: 'Pay As You Grow',
    description: 'Scale with your recovery pipeline',
    price: 2.99,
    unit: 'per claim (first 500), then $3.99/claim',
  },
  {
    id: 'l2-collections',
    level: 2,
    paymentModel: 'collections_percentage',
    name: 'No Upfront - Collections %',
    description: 'Zero upfront, pay when you recover',
    price: 12,
    unit: '% of recovered amount',
  },
  // Level 3 Pricing
  {
    id: 'l3-per-hundred',
    level: 3,
    paymentModel: 'per_hundred',
    name: 'Per 100 Claims',
    description: 'Full autonomous recovery at scale',
    price: 699,
    unit: 'per 100 claims auto-fixed',
  },
  {
    id: 'l3-per-claim',
    level: 3,
    paymentModel: 'per_claim',
    name: 'Pay Per Claim',
    description: 'Enterprise-grade per-claim pricing',
    price: 8.99,
    unit: 'per claim auto-fixed',
  },
  {
    id: 'l3-payg',
    level: 3,
    paymentModel: 'pay_as_you_grow',
    name: 'Pay As You Grow',
    description: 'Scale to 50,000+ claims seamlessly',
    price: 5.99,
    unit: 'per claim (first 1000), then $7.49/claim',
  },
  {
    id: 'l3-collections',
    level: 3,
    paymentModel: 'collections_percentage',
    name: 'No Upfront - Collections %',
    description: 'Maximum recovery, zero risk',
    price: 20,
    unit: '% of recovered amount',
    savingsNote: 'Most popular for high-volume practices',
  },
];

// ─── DENTAL CDT CODE TYPES ─────────────────────────────────────────────────────

export interface CDTCodeInfo {
  code: string;
  description: string;
  category: CDTCategory;
  typicalCost: { min: number; max: number };
  commonDenialReasons: string[];
  requiredDocumentation: string[];
}

export type CDTCategory =
  | 'diagnostic'       // D0100-D1999
  | 'preventive'       // D1000-D1999
  | 'restorative'      // D2000-D2999
  | 'endodontics'      // D3000-D3999
  | 'periodontics'     // D4000-D4999
  | 'prosthodontics'   // D5000-D6999
  | 'oral_surgery'     // D7000-D7999
  | 'orthodontics'     // D8000-D8999
  | 'adjunctive';      // D9000-D9999

export const CDT_CATEGORIES: Array<{ code: CDTCategory; name: string; range: string }> = [
  { code: 'diagnostic', name: 'Diagnostic', range: 'D0100-D1999' },
  { code: 'preventive', name: 'Preventive', range: 'D1000-D1999' },
  { code: 'restorative', name: 'Restorative', range: 'D2000-D2999' },
  { code: 'endodontics', name: 'Endodontics', range: 'D3000-D3999' },
  { code: 'periodontics', name: 'Periodontics', range: 'D4000-D4999' },
  { code: 'prosthodontics', name: 'Prosthodontics', range: 'D5000-D6999' },
  { code: 'oral_surgery', name: 'Oral Surgery', range: 'D7000-D7999' },
  { code: 'orthodontics', name: 'Orthodontics', range: 'D8000-D8999' },
  { code: 'adjunctive', name: 'Adjunctive Services', range: 'D9000-D9999' },
];

// ─── VIEW TYPES ─────────────────────────────────────────────────────────────────

export type ViewType =
  | 'landing'
  | 'dashboard'
  | 'denials'
  | 'denial-detail'
  | 'upload'
  | 'agents'
  | 'overview-report'
  | 'appeals'
  | 'payer-rules'
  | 'audit-log'
  | 'scrub'
  | 'financials'
  | 'settings'
  | 'pricing'
  | 'worklist'
  | 'health-scan'
  | 'nl-query'
  | 'followup'
  | 'appeal-deadlines'
  | 'staff-metrics'
  | 'prevention';

// ─── ERA/835 TYPES ──────────────────────────────────────────────────────────────

export interface ERA835Transaction {
  traceNumber: string;
  checkDate: string;
  checkAmount: number;
  payerName: string;
  payerId: string;
  claims: ERA835Claim[];
}

export interface ERA835Claim {
  claimNumber: string;
  patientName: string;
  patientId?: string;
  dateOfService: string;
  billedAmount: number;
  paidAmount: number;
  adjustments: ERA835Adjustment[];
  serviceLines: ERA835ServiceLine[];
}

export interface ERA835Adjustment {
  groupCode: string;
  reasonCode: string;
  amount: number;
  quantity?: number;
}

export interface ERA835ServiceLine {
  cptCode: string;
  modifier?: string;
  billedAmount: number;
  paidAmount: number;
  adjustments: ERA835Adjustment[];
  remarkCodes: string[];
}
