export interface Denial {
  id: string;
  claimNumber: string;
  patientName: string;
  patientDOB: string;
  payerName: string;
  payerId: string;
  providerNPI: string;
  dateOfService: string;
  denialDate: string;
  cptCode: string;
  modifier: string;
  diagnosisCode: string;
  billedAmount: number;
  deniedAmount: number;
  carcCode: string;
  rarcCode: string;
  adjustmentGroupCode: string;
  denialCategory: string;
  status: 'New' | 'Analyzed' | 'Corrected' | 'Reviewed' | 'Resubmitted' | 'Closed';
  priority: 'low' | 'normal' | 'high' | 'critical';
  analysis?: DenialAnalysis;
  correction?: CorrectionSuggestion;
  qualityCheck?: QualityCheck;
  createdAt: string;
  updatedAt: string;
}

export interface DenialAnalysis {
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
  overallResult: 'pass' | 'fail' | 'warning';
  validationFindings: Array<{ check: string; result: string; details: string }>;
  blockingIssues: Array<{ issue: string; requiredResolution: string }>;
  warnings: Array<{ warning: string; recommendedAction: string }>;
  recommendation: string;
  confidenceScore: number;
  checkedAt: string;
}

export type ViewType = 'dashboard' | 'denials' | 'denial-detail' | 'upload' | 'agents' | 'overview-report';

export interface OverviewReport {
  id: string;
  fileName: string;
  uploadDate: string;
  totalClaims: number;
  totalDeniedAmount: number;
  overallRating: number; // 0-10
  ratingLabel: string; // e.g., "Critical", "Needs Attention", "Good"
  ratingColor: string; // css color class
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

export interface DashboardStats {
  totalDenials: number;
  totalDeniedAmount: number;
  totalRecoveredAmount: number;
  recoveryRate: number;
  avgDaysToResolve: number;
  newDenialsCount: number;
  analyzedCount: number;
  correctedCount: number;
  reviewedCount: number;
  resubmittedCount: number;
  closedCount: number;
  categoryBreakdown: Array<{ category: string; count: number; amount: number }>;
  payerBreakdown: Array<{ payer: string; count: number; amount: number }>;
  recentDenials: Denial[];
  agingBuckets: Array<{ bucket: string; count: number; amount: number }>;
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
