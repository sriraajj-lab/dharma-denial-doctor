'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { Denial, LEVEL_CONFIGS } from '@/lib/types';
import {
  Download,
  FileText,
  Loader2,
  AlertCircle,
  Lock,
  Zap,
  MapPin,
  FileSignature,
  Wrench,
  Clock,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-500/20 text-gray-400',
  normal: 'bg-blue-500/20 text-blue-400',
  high: 'bg-orange-500/20 text-orange-400',
  critical: 'bg-red-500/20 text-red-400',
};

export function FixReportView() {
  const [denials, setDenials] = useState<Denial[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const { accessLevel, setCurrentView, setAccessLevel } = useAppStore();
  const isL2OrAbove = accessLevel !== null && accessLevel >= 2;
  const levelConfig = LEVEL_CONFIGS.find(l => l.level === accessLevel);

  const fetchDenials = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/denials?limit=100&sort=deniedAmount&order=desc');
      const data = await res.json();
      setDenials(data.denials || []);
    } catch (error) {
      console.error('Error fetching denials:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isL2OrAbove) {
      fetchDenials();
    } else {
      setLoading(false);
    }
  }, [isL2OrAbove, fetchDenials]);

  // Level 1: Locked
  if (!isL2OrAbove) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Complete Fix Report</h2>
          <p className="text-muted-foreground mt-1">Export actionable fix instructions for every claim</p>
        </div>
        <Card className="border-cyan/30 bg-cyan/5">
          <CardContent className="p-8">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="h-20 w-20 rounded-full bg-cyan/10 flex items-center justify-center mb-4">
                <Lock className="h-10 w-10 text-cyan" />
              </div>
              <h3 className="text-xl font-bold text-foreground">Level 2+ Feature</h3>
              <p className="text-sm text-muted-foreground mt-2 max-w-md">
                The Complete Fix Report is available with Level 2 (Fix & Appeal) and Level 3 (EHR Auto-Fix).
                Get detailed fix instructions, appeal letters, and submission destinations for every claim.
              </p>
              <Button
                onClick={() => { setAccessLevel(2); setCurrentView('landing'); }}
                className="bg-emerald hover:bg-emerald/90 text-white mt-6"
              >
                <Zap className="h-4 w-4 mr-2" /> Upgrade to Level 2
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Export to CSV
  const handleExportCSV = () => {
    setExporting(true);
    try {
      const headers = [
        'Claim #',
        'Patient Name',
        'Payer',
        'CPT Code',
        'Modifier',
        'Diagnosis Code',
        'Denied Amount',
        'CARC Code',
        'Denial Category',
        'Priority',
        'Status',
        'AI Root Cause',
        'Correctable',
        'Appeal Recommended',
        'Correction Type',
        'What to Change',
        'Original Value',
        'Proposed Value',
        'Change Reason',
        'Risk Level',
        'Letter Type',
        'Submission Type',
        'Frequency Code',
        'Resubmission Notes',
        'Required Documents',
        'Filing Deadline',
        'Timely Filing Risk',
      ];

      const rows = denials.map((d) => {
        const changes = d.correction?.proposedChanges || [];
        const changeStr = changes.map(c => `${c.fieldPath}: ${c.originalValue} → ${c.proposedValue}`).join('; ');
        const origStr = changes.map(c => c.originalValue).join('; ');
        const propStr = changes.map(c => c.proposedValue).join('; ');
        const reasonStr = changes.map(c => c.reason).join('; ');
        const riskStr = changes.map(c => c.riskLevel).join('; ');
        const docsStr = d.correction?.requiredDocuments.map(doc => doc.documentType).join('; ') || '';
        const appealType = d.appeals && d.appeals.length > 0 ? d.appeals[0].appealType.replace('_', ' ') : (d.analysis?.appealRecommended ? '1st level appeal' : 'N/A');

        return [
          d.claimNumber,
          d.patientName,
          d.payerName,
          d.cptCode,
          d.modifier || '',
          d.diagnosisCode,
          d.deniedAmount,
          d.carcCode,
          d.denialCategory,
          d.priority,
          d.status,
          d.analysis?.rootCauseCategory || '',
          d.analysis?.correctable ? 'Yes' : 'No',
          d.analysis?.appealRecommended ? 'Yes' : 'No',
          d.correction?.correctionType || '',
          changeStr,
          origStr,
          propStr,
          reasonStr,
          riskStr,
          appealType,
          d.correction?.resubmissionInstructions?.submissionType || '',
          d.correction?.resubmissionInstructions?.claimFrequencyCode || '',
          d.correction?.resubmissionInstructions?.notes || '',
          docsStr,
          d.filingDeadline || '',
          d.isTimelyFilingRisk ? 'YES' : 'No',
        ];
      });

      const csvContent = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `denials_doctor_fix_report_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Fix report exported successfully!');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export fix report');
    } finally {
      setExporting(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const totalAmount = denials.reduce((s, d) => s + d.deniedAmount, 0);
  const analyzed = denials.filter(d => d.analysis);
  const corrected = denials.filter(d => d.correction);
  const appealable = denials.filter(d => d.analysis?.appealRecommended);
  const timelyRisk = denials.filter(d => d.isTimelyFilingRisk);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Complete Fix Report</h2>
          <p className="text-muted-foreground mt-1">
            Actionable fix instructions for {denials.length} claims totaling ${totalAmount.toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {levelConfig && (
            <Badge variant="outline" className={levelConfig.bgColor + ' ' + levelConfig.color + ' ' + levelConfig.borderColor}>
              L{levelConfig.level}: {levelConfig.name}
            </Badge>
          )}
          <Button
            onClick={handleExportCSV}
            disabled={exporting || denials.length === 0}
            className="bg-emerald hover:bg-emerald/90 text-white"
          >
            {exporting ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Exporting...</>
            ) : (
              <><Download className="h-4 w-4 mr-2" /> Export CSV</>
            )}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border bg-card">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{denials.length}</p>
            <p className="text-xs text-muted-foreground">Total Claims</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">{analyzed.length}</p>
            <p className="text-xs text-muted-foreground">AI Analyzed</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-emerald-400">{corrected.length}</p>
            <p className="text-xs text-muted-foreground">Corrections Ready</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-400">{timelyRisk.length}</p>
            <p className="text-xs text-muted-foreground">Timely Filing Risk</p>
          </CardContent>
        </Card>
      </div>

      {/* Per-Claim Fix Instructions */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Wrench className="h-4 w-4 text-emerald" /> Per-Claim Fix Instructions
            </CardTitle>
            <Badge variant="outline" className="bg-emerald/10 text-emerald border-emerald/30">
              {appealable.length} appealable claims
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {denials.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <AlertCircle className="h-12 w-12 mb-3 opacity-50" />
              <p>No claims with fix instructions yet</p>
              <p className="text-xs mt-1">Run AI analysis and corrections on your denials first</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {denials.map((denial) => (
                <ClaimFixRow key={denial.id} denial={denial} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ClaimFixRow({ denial }: { denial: Denial }) {
  const [expanded, setExpanded] = useState(false);
  const hasAnalysis = !!denial.analysis;
  const hasCorrection = !!denial.correction;
  const hasAppeal = denial.appeals && denial.appeals.length > 0;

  return (
    <div className="hover:bg-accent/20 transition-colors">
      {/* Summary Row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center gap-4 text-left"
      >
        <div className="flex-shrink-0">
          {hasCorrection ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          ) : hasAnalysis ? (
            <AlertCircle className="h-5 w-5 text-yellow-400" />
          ) : (
            <div className="h-5 w-5 rounded-full bg-secondary border border-border" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-primary">{denial.claimNumber}</span>
            <Badge variant="outline" className={PRIORITY_COLORS[denial.priority]}>
              {denial.priority}
            </Badge>
            {denial.isTimelyFilingRisk && (
              <Badge variant="outline" className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">
                <Clock className="h-3 w-3 mr-0.5" /> FILING RISK
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {denial.patientName} · {denial.payerName} · {denial.cptCode}{denial.modifier ? `-${denial.modifier}` : ''} · ${denial.deniedAmount.toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {hasCorrection && (
            <Badge variant="outline" className="bg-emerald/10 text-emerald border-emerald/30 text-[10px]">
              <Wrench className="h-3 w-3 mr-0.5" /> Fix Ready
            </Badge>
          )}
          {hasAppeal && (
            <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px]">
              <FileSignature className="h-3 w-3 mr-0.5" /> Appeal
            </Badge>
          )}
          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </div>
      </button>

      {/* Expanded Detail */}
      {expanded && (
        <div className="px-4 pb-4 pl-12 space-y-3">
          {/* What Letter to Submit */}
          <div className="rounded-lg bg-secondary p-3">
            <div className="flex items-center gap-2 mb-1">
              <FileSignature className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold text-foreground">What Letter to Submit</span>
            </div>
            <p className="text-sm text-foreground">
              {hasAppeal
                ? `${denial.appeals![0].appealType.replace('_', ' ')} appeal letter`
                : denial.analysis?.appealRecommended
                ? '1st level appeal letter (not yet generated)'
                : 'No appeal needed - correction only'}
            </p>
          </div>

          {/* Where to Submit */}
          <div className="rounded-lg bg-secondary p-3">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold text-foreground">Where to Submit</span>
            </div>
            <p className="text-sm text-foreground">
              {denial.correction?.resubmissionInstructions?.submissionType || 'Electronic resubmission'} via {denial.payerName}
            </p>
            {denial.correction?.resubmissionInstructions?.claimFrequencyCode && (
              <p className="text-xs text-muted-foreground mt-1">
                Frequency Code: {denial.correction.resubmissionInstructions.claimFrequencyCode}
              </p>
            )}
          </div>

          {/* What to Change */}
          {hasCorrection && denial.correction!.proposedChanges.length > 0 ? (
            <div className="rounded-lg bg-secondary p-3">
              <div className="flex items-center gap-2 mb-2">
                <Wrench className="h-4 w-4 text-orange-400" />
                <span className="text-xs font-semibold text-foreground">What to Change</span>
              </div>
              <div className="space-y-2">
                {denial.correction!.proposedChanges.map((change, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-primary">{change.fieldPath}:</span>
                    <span className="text-red-400 line-through">{change.originalValue || '(empty)'}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span className="text-emerald-400 font-medium">{change.proposedValue}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-secondary p-3">
              <div className="flex items-center gap-2 mb-1">
                <Wrench className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground">No corrections generated yet</span>
              </div>
              <p className="text-xs text-muted-foreground">Run the Correction Agent to generate fix instructions</p>
            </div>
          )}

          {/* Resubmission Notes */}
          {denial.correction?.resubmissionInstructions?.notes && (
            <div className="rounded-lg bg-primary/10 border border-primary/20 p-3">
              <span className="text-xs font-semibold text-primary block mb-1">Resubmission Notes</span>
              <p className="text-xs text-foreground">{denial.correction.resubmissionInstructions.notes}</p>
            </div>
          )}

          {/* Required Documents */}
          {denial.correction?.requiredDocuments && denial.correction.requiredDocuments.length > 0 && (
            <div className="rounded-lg bg-secondary p-3">
              <span className="text-xs font-semibold text-foreground block mb-1">Required Documents</span>
              <ul className="space-y-1">
                {denial.correction.requiredDocuments.map((doc, idx) => (
                  <li key={idx} className="text-xs text-muted-foreground flex items-center gap-2">
                    <FileText className="h-3 w-3" />
                    <span>{doc.documentType}: {doc.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
