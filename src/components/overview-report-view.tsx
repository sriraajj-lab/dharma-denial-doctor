'use client';

import { OverviewReport } from '@/lib/types';
import {
  ArrowLeft, Download, FileText, TrendingUp, AlertTriangle,
  CheckCircle2, XCircle, Shield, BarChart3, Clock, DollarSign,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useAppStore } from '@/lib/store';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

export function OverviewReportView({ report }: { report: OverviewReport }) {
  const { navigateBack, setCurrentView } = useAppStore();
  const isSigned = report.contractStatus === 'signed';

  const getRatingColor = (rating: number) => {
    if (rating >= 8) return 'text-emerald-400';
    if (rating >= 5) return 'text-yellow-400';
    if (rating >= 3) return 'text-orange-400';
    return 'text-red-400';
  };

  const handleExportReport = () => {
    const lines: string[] = [];
    lines.push('DENIAL OVERVIEW REPORT');
    lines.push('=' .repeat(60));
    lines.push('');
    lines.push(`File: ${report.fileName}`);
    lines.push(`Date: ${new Date(report.uploadDate).toLocaleDateString()}`);
    lines.push(`Total Claims: ${report.totalClaims}`);
    lines.push(`Total Denied Amount: $${report.totalDeniedAmount.toLocaleString()}`);
    lines.push(`Overall Rating: ${report.overallRating}/10 (${report.ratingLabel})`);
    lines.push('');
    lines.push('EXECUTIVE SUMMARY');
    lines.push('-'.repeat(40));
    lines.push(report.executiveSummary);
    lines.push('');
    lines.push('KEY ISSUES');
    lines.push('-'.repeat(40));
    report.keyIssues.forEach((issue, i) => {
      lines.push(`${i + 1}. [${issue.severity.toUpperCase()}] ${issue.issue}`);
      lines.push(`   ${issue.description}`);
      lines.push(`   Affected: ${issue.affectedClaims} claims, $${issue.affectedAmount.toLocaleString()}`);
    });
    lines.push('');
    lines.push('TOP DENIAL REASONS');
    lines.push('-'.repeat(40));
    report.topDenialReasons.forEach((reason, i) => {
      lines.push(`${i + 1}. ${reason.reason} (${reason.carcCode}) - ${reason.count} claims, $${reason.amount.toLocaleString()}`);
    });
    lines.push('');
    lines.push('CATEGORY BREAKDOWN');
    lines.push('-'.repeat(40));
    report.categoryBreakdown.forEach((cat) => {
      lines.push(`  ${cat.category}: ${cat.count} claims, $${cat.amount.toLocaleString()} (${cat.percentage}%)`);
    });
    lines.push('');
    lines.push('PAYER BREAKDOWN');
    lines.push('-'.repeat(40));
    report.payerBreakdown.forEach((payer) => {
      lines.push(`  ${payer.payer}: ${payer.count} claims, $${payer.amount.toLocaleString()} (${payer.denialRate}% of total)`);
    });
    lines.push('');
    lines.push('RECOVERY POTENTIAL');
    lines.push('-'.repeat(40));
    lines.push(`  Estimated Recoverable: $${report.recoveryPotential.estimatedRecoverable.toLocaleString()}`);
    lines.push(`  Recovery Rate: ${report.recoveryPotential.recoveryPercentage}%`);
    lines.push(`  High Confidence: $${report.recoveryPotential.highConfidence.toLocaleString()}`);
    lines.push(`  Medium Confidence: $${report.recoveryPotential.mediumConfidence.toLocaleString()}`);
    lines.push(`  Low Confidence: $${report.recoveryPotential.lowConfidence.toLocaleString()}`);
    lines.push('');
    lines.push('RECOMMENDATIONS');
    lines.push('-'.repeat(40));
    report.recommendations.forEach((rec, i) => {
      lines.push(`${i + 1}. ${rec}`);
    });
    lines.push('');
    lines.push(`Contract Status: ${isSigned ? `Signed by ${report.signedBy} on ${report.signedAt ? new Date(report.signedAt).toLocaleString() : 'N/A'}` : 'Not Signed'}`);

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `denial_overview_report_${report.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={navigateBack} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div>
            <h2 className="text-2xl font-bold text-foreground">Detailed Denial Report</h2>
            <p className="text-muted-foreground mt-1">{report.fileName} · {report.totalClaims} claims · ${report.totalDeniedAmount.toLocaleString()} denied</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={handleExportReport} className="border-primary/30 text-primary">
            <Download className="h-4 w-4 mr-2" /> Export Report
          </Button>
          {isSigned && (
            <Button size="sm" onClick={() => setCurrentView('denials')} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              Go to Denial Queue
            </Button>
          )}
        </div>
      </div>

      {/* Rating Banner */}
      <div className="flex items-center gap-6 rounded-xl border border-border bg-card p-6">
        <div className="flex-shrink-0 text-center">
          <div className="relative h-24 w-24 mx-auto">
            <svg className="h-24 w-24 -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="52" fill="none" stroke="oklch(0.28 0.02 240)" strokeWidth="8" />
              <circle
                cx="60" cy="60" r="52" fill="none"
                className={report.overallRating >= 8 ? 'stroke-emerald-400' : report.overallRating >= 5 ? 'stroke-yellow-400' : report.overallRating >= 3 ? 'stroke-orange-400' : 'stroke-red-400'}
                strokeWidth="8"
                strokeDasharray={`${(report.overallRating / 10) * 327} 327`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-2xl font-bold ${getRatingColor(report.overallRating)}`}>{report.overallRating}/10</span>
            </div>
          </div>
          <Badge variant="outline" className={`mt-2 ${SEVERITY_COLORS[report.overallRating >= 8 ? 'low' : report.overallRating >= 5 ? 'medium' : report.overallRating >= 3 ? 'high' : 'critical']}`}>
            {report.ratingLabel}
          </Badge>
        </div>
        <div className="flex-1">
          <p className="text-base text-foreground leading-relaxed">{report.executiveSummary}</p>
          <div className="flex items-center gap-6 mt-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">{report.totalClaims} claims</span>
            </div>
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-orange-400" />
              <span className="text-sm text-muted-foreground">${report.totalDeniedAmount.toLocaleString()} denied</span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald" />
              <span className="text-sm text-muted-foreground">${report.recoveryPotential.estimatedRecoverable.toLocaleString()} recoverable</span>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payer Breakdown Table */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Payer Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Payer</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Claims</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Amount</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {report.payerBreakdown.map((payer, idx) => (
                    <tr key={idx} className="border-b border-border/50">
                      <td className="px-4 py-2.5 text-sm text-foreground">{payer.payer}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-muted-foreground">{payer.count}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-foreground font-medium">${payer.amount.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-primary">{payer.denialRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Category Breakdown Table */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Denial Category Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Category</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Claims</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Amount</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Pct</th>
                  </tr>
                </thead>
                <tbody>
                  {report.categoryBreakdown.map((cat, idx) => (
                    <tr key={idx} className="border-b border-border/50">
                      <td className="px-4 py-2.5 text-sm text-foreground capitalize">{cat.category.replace(/_/g, ' ')}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-muted-foreground">{cat.count}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-foreground font-medium">${cat.amount.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-primary">{cat.percentage}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Key Issues Detail */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-400" /> Key Issues - Detailed View
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {report.keyIssues.map((issue, idx) => (
              <div key={idx} className="rounded-xl border border-border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {issue.severity === 'critical' ? <XCircle className="h-5 w-5 text-red-400" /> :
                     issue.severity === 'high' ? <AlertTriangle className="h-5 w-5 text-orange-400" /> :
                     issue.severity === 'medium' ? <Shield className="h-5 w-5 text-yellow-400" /> :
                     <CheckCircle2 className="h-5 w-5 text-blue-400" />}
                    <h4 className="text-sm font-semibold text-foreground">{issue.issue}</h4>
                  </div>
                  <Badge variant="outline" className={SEVERITY_COLORS[issue.severity]}>{issue.severity}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{issue.description}</p>
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <FileText className="h-3 w-3 text-primary" />
                    <span className="text-muted-foreground">{issue.affectedClaims} claims</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <DollarSign className="h-3 w-3 text-orange-400" />
                    <span className="text-muted-foreground">${issue.affectedAmount.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recovery Potential Detail */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald" /> Recovery Potential Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-xl bg-emerald/10 border border-emerald/20 p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">High Confidence</p>
              <p className="text-xl font-bold text-emerald-400">${report.recoveryPotential.highConfidence.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground mt-1">Correctable denials with clear fixes</p>
            </div>
            <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Medium Confidence</p>
              <p className="text-xl font-bold text-yellow-400">${report.recoveryPotential.mediumConfidence.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground mt-1">Appeals with moderate success rate</p>
            </div>
            <div className="rounded-xl bg-orange-500/10 border border-orange-500/20 p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Low Confidence</p>
              <p className="text-xl font-bold text-orange-400">${report.recoveryPotential.lowConfidence.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground mt-1">Complex denials, uncertain recovery</p>
            </div>
            <div className="rounded-xl bg-primary/10 border border-primary/20 p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Total Recoverable</p>
              <p className="text-xl font-bold text-primary">${report.recoveryPotential.estimatedRecoverable.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{report.recoveryPotential.recoveryPercentage}% recovery rate</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contract Status */}
      <Card className={`border ${isSigned ? 'border-emerald/30' : 'border-yellow-500/30'}`}>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            {isSigned ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-emerald" />
                <div>
                  <p className="text-sm font-medium text-foreground">Contract signed by {report.signedBy}</p>
                  <p className="text-xs text-muted-foreground">{report.signedAt ? new Date(report.signedAt).toLocaleString() : ''}</p>
                </div>
              </>
            ) : (
              <>
                <Clock className="h-5 w-5 text-yellow-400" />
                <div>
                  <p className="text-sm font-medium text-foreground">Awaiting contract signature</p>
                  <p className="text-xs text-muted-foreground">Claim processing will be available once the contract is signed</p>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
