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
  jobType: 'analyze' | 'correct' | 'quality_check' | 'appeal_generate';
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

// ─── VIEW TYPES ─────────────────────────────────────────────────────────────────

export type ViewType =
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
  | 'settings';

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
  groupCode: string; // CO, PR, OA, PI, CR
  reasonCode: string; // CARC
  amount: number;
  quantity?: number;
}

export interface ERA835ServiceLine {
  cptCode: string;
  modifier?: string;
  billedAmount: number;
  paidAmount: number;
  adjustments: ERA835Adjustment[];
  remarkCodes: string[]; // RARC codes
}
