'use client';

import { useState } from 'react';
import { Denial } from '@/lib/types';
import {
  Users, AlertTriangle, CheckCircle2, XCircle, Loader2,
  Phone, Globe, Clock, DollarSign, ArrowRight, Shield,
  HeartPulse, Building, CreditCard,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface EligibilityResult {
  denialId: string;
  resolution: {
    resolutionType: string;
    confidence: number;
    findings: Array<{ type: string; severity: string; description: string; evidence: string }>;
    recommendedActions: Array<{
      priority: number;
      action: string;
      responsible: string;
      deadline?: string;
      details: string;
      expectedOutcome: string;
      contactInfo?: string;
    }>;
    cobAnalysis: {
      hasPotentialOtherInsurance: boolean;
      suspectedPrimaryPayer?: string;
      cobReason: string;
      verificationSteps: string[];
    } | null;
    coverageGapAnalysis: {
      gapType: string;
      gapStart?: string;
      dosWithinGap: boolean;
      reinstateEligible: boolean;
      reinstateDeadline?: string;
      reinstateProcess: string;
    } | null;
    patientResponsibility: {
      isLegitimatePatientResponsibility: boolean;
      responsibilityType: string;
      estimatedPatientOwes: number;
      financialAssistanceEligible: boolean;
      paymentPlanRecommended: boolean;
      collectionActions: string[];
    } | null;
    estimatedRecovery: number;
    estimatedSuccessRate: number;
    timelineEstimate: string;
  };
  summary: {
    resolutionType: string;
    resolutionLabel: string;
    confidence: number;
    estimatedRecovery: number;
    estimatedSuccessRate: number;
    timelineEstimate: string;
    totalActions: number;
    immediateAction: string;
    isPatientResponsibility: boolean;
    hasCOBOpportunity: boolean;
    hasCoverageGapFix: boolean;
  };
}

export function EligibilityPanel({ denial }: { denial: Denial }) {
  const [result, setResult] = useState<EligibilityResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function runEligibilityResolution() {
    setLoading(true);
    try {
      const res = await fetch(`/api/denials/${denial.id}/resolve-eligibility`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setResult(data);
      toast.success('Eligibility resolution complete');
    } catch (err) {
      toast.error('Failed to resolve eligibility');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <Card className="border-teal-500/30 bg-card">
        <CardContent className="p-8">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="relative">
              <Users className="h-16 w-16 text-teal-400 animate-pulse" />
              <Loader2 className="h-6 w-6 text-teal-400 absolute -bottom-1 -right-1 animate-spin" />
            </div>
            <h3 className="text-lg font-semibold mt-4">Eligibility Resolution Engine Running</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-md">
              Checking COB, coverage gaps, COBRA eligibility, Medicaid retro, workers comp...
            </p>
            <Progress className="w-64 mt-4" value={50} />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!result) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-8">
          <div className="flex flex-col items-center justify-center text-center">
            <Users className="h-12 w-12 text-teal-400/50 mb-3" />
            <h3 className="text-lg font-medium text-foreground">Eligibility Resolution</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              Analyzes eligibility denials to find: alternate payers (COB), COBRA windows, Medicaid retro-eligibility, wrong subscriber info, and patient responsibility routing.
            </p>
            <Button onClick={runEligibilityResolution} className="mt-4 bg-teal-600 hover:bg-teal-700 text-white">
              <Users className="h-4 w-4 mr-2" /> Resolve Eligibility
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { resolution, summary } = result;

  const typeIcon = (type: string) => {
    switch (type) {
      case 'cob_primary_identified': return <Building className="h-5 w-5 text-blue-400" />;
      case 'coverage_gap_fixable':
      case 'retro_eligibility': return <Clock className="h-5 w-5 text-orange-400" />;
      case 'wrong_subscriber_info': return <CreditCard className="h-5 w-5 text-purple-400" />;
      case 'patient_responsibility': return <DollarSign className="h-5 w-5 text-yellow-400" />;
      case 'medicaid_eligible': return <HeartPulse className="h-5 w-5 text-green-400" />;
      case 'workers_comp_auto': return <Shield className="h-5 w-5 text-red-400" />;
      default: return <Users className="h-5 w-5 text-teal-400" />;
    }
  };

  const severityColor = (sev: string) => {
    switch (sev) {
      case 'critical': return 'text-red-400 bg-red-500/10 border-red-500/30';
      case 'high': return 'text-orange-400 bg-orange-500/10 border-orange-500/30';
      case 'medium': return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
      default: return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
    }
  };

  return (
    <div className="space-y-4">
      {/* Resolution Summary */}
      <Card className="border-teal-500/20 bg-card">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-4">
            {typeIcon(summary.resolutionType)}
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-foreground">{summary.resolutionLabel}</h3>
              <p className="text-xs text-muted-foreground">Confidence: {(summary.confidence * 100).toFixed(0)}%</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Est. Recovery</p>
              <p className="text-lg font-bold text-emerald-400">${summary.estimatedRecovery.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-secondary p-3 text-center">
              <p className="text-xs text-muted-foreground">Success Rate</p>
              <p className="text-lg font-bold text-teal-400">{summary.estimatedSuccessRate}%</p>
            </div>
            <div className="rounded-lg bg-secondary p-3 text-center">
              <p className="text-xs text-muted-foreground">Timeline</p>
              <p className="text-sm font-bold text-foreground">{summary.timelineEstimate}</p>
            </div>
            <div className="rounded-lg bg-secondary p-3 text-center">
              <p className="text-xs text-muted-foreground">Actions</p>
              <p className="text-lg font-bold text-foreground">{summary.totalActions}</p>
            </div>
          </div>

          {/* Quick indicators */}
          <div className="flex flex-wrap gap-2 mt-3">
            {summary.hasCOBOpportunity && (
              <Badge variant="outline" className="text-blue-400 border-blue-500/30 text-[10px]">
                <Building className="h-3 w-3 mr-1" /> COB Opportunity
              </Badge>
            )}
            {summary.hasCoverageGapFix && (
              <Badge variant="outline" className="text-orange-400 border-orange-500/30 text-[10px]">
                <Clock className="h-3 w-3 mr-1" /> Coverage Gap Fixable
              </Badge>
            )}
            {summary.isPatientResponsibility && (
              <Badge variant="outline" className="text-yellow-400 border-yellow-500/30 text-[10px]">
                <DollarSign className="h-3 w-3 mr-1" /> Patient Responsibility
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Findings */}
      {resolution.findings.length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-400" /> Findings ({resolution.findings.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-2">
            {resolution.findings.map((finding, idx) => (
              <div key={idx} className={`rounded-lg border p-3 ${severityColor(finding.severity)}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{finding.description}</span>
                  <Badge variant="outline" className="text-[10px] capitalize">{finding.severity}</Badge>
                </div>
                <p className="text-xs opacity-80">{finding.evidence}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* COB Analysis */}
      {resolution.cobAnalysis && resolution.cobAnalysis.hasPotentialOtherInsurance && (
        <Card className="border-blue-500/20 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Building className="h-4 w-4 text-blue-400" /> Coordination of Benefits (COB)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-3">
              <p className="text-sm text-foreground">{resolution.cobAnalysis.cobReason}</p>
              {resolution.cobAnalysis.suspectedPrimaryPayer && (
                <p className="text-xs text-blue-400 mt-1 font-medium">Suspected Primary: {resolution.cobAnalysis.suspectedPrimaryPayer}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Verification steps:</p>
              <ol className="space-y-1.5">
                {resolution.cobAnalysis.verificationSteps.map((step, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs text-foreground/90">
                    <span className="h-4 w-4 rounded-full bg-blue-500/20 flex items-center justify-center text-[9px] font-bold text-blue-400 flex-shrink-0 mt-0.5">{idx + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Coverage Gap */}
      {resolution.coverageGapAnalysis && (
        <Card className="border-orange-500/20 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-orange-400" /> Coverage Gap Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-secondary p-3">
                <p className="text-xs text-muted-foreground">Gap Type</p>
                <p className="text-sm font-medium text-foreground capitalize">{resolution.coverageGapAnalysis.gapType.replace(/_/g, ' ')}</p>
              </div>
              <div className="rounded-lg bg-secondary p-3">
                <p className="text-xs text-muted-foreground">Reinstatement</p>
                <p className={`text-sm font-medium ${resolution.coverageGapAnalysis.reinstateEligible ? 'text-emerald-400' : 'text-red-400'}`}>
                  {resolution.coverageGapAnalysis.reinstateEligible ? 'ELIGIBLE' : 'Not Eligible'}
                </p>
              </div>
            </div>
            {resolution.coverageGapAnalysis.reinstateDeadline && (
              <div className="rounded-lg bg-orange-500/10 border border-orange-500/20 p-3">
                <p className="text-xs text-orange-400 font-medium">Deadline: {resolution.coverageGapAnalysis.reinstateDeadline}</p>
              </div>
            )}
            <p className="text-sm text-foreground/90">{resolution.coverageGapAnalysis.reinstateProcess}</p>
          </CardContent>
        </Card>
      )}

      {/* Patient Responsibility */}
      {resolution.patientResponsibility && (
        <Card className="border-yellow-500/20 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-yellow-400" /> Patient Responsibility
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-secondary p-3">
                <p className="text-xs text-muted-foreground">Type</p>
                <p className="text-sm font-medium text-foreground capitalize">{resolution.patientResponsibility.responsibilityType.replace(/_/g, ' ')}</p>
              </div>
              <div className="rounded-lg bg-secondary p-3">
                <p className="text-xs text-muted-foreground">Amount Owed</p>
                <p className="text-sm font-bold text-yellow-400">${resolution.patientResponsibility.estimatedPatientOwes.toFixed(2)}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {resolution.patientResponsibility.financialAssistanceEligible && (
                <Badge variant="outline" className="text-green-400 border-green-500/30 text-[10px]">Financial Assistance Eligible</Badge>
              )}
              {resolution.patientResponsibility.paymentPlanRecommended && (
                <Badge variant="outline" className="text-blue-400 border-blue-500/30 text-[10px]">Payment Plan Recommended</Badge>
              )}
            </div>
            {resolution.patientResponsibility.collectionActions.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Collection workflow:</p>
                <ol className="space-y-1">
                  {resolution.patientResponsibility.collectionActions.map((action, idx) => (
                    <li key={idx} className="text-xs text-foreground/80 flex items-start gap-1">
                      <span className="text-yellow-400">{idx + 1}.</span> {action}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Action Plan */}
      <Card className="border-emerald-500/20 bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ArrowRight className="h-4 w-4 text-emerald-400" /> Action Plan ({resolution.recommendedActions.length} steps)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-3">
          {resolution.recommendedActions.map((action, idx) => (
            <div key={idx} className="rounded-lg bg-secondary p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-6 w-6 rounded-full bg-emerald-500/20 flex items-center justify-center text-xs font-bold text-emerald-400">{action.priority}</span>
                  <span className="text-sm font-medium text-foreground">{action.action}</span>
                </div>
                <Badge variant="outline" className="text-[10px] capitalize">{action.responsible.replace(/_/g, ' ')}</Badge>
              </div>
              <p className="text-xs text-foreground/80 pl-8">{action.details}</p>
              <div className="flex items-center gap-3 pl-8 text-[11px]">
                {action.deadline && (
                  <span className="text-orange-400 flex items-center gap-1"><Clock className="h-3 w-3" /> {action.deadline}</span>
                )}
                <span className="text-emerald-400">{action.expectedOutcome}</span>
              </div>
              {action.contactInfo && (
                <p className="text-[11px] text-blue-400 pl-8 flex items-center gap-1"><Phone className="h-3 w-3" /> {action.contactInfo}</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
