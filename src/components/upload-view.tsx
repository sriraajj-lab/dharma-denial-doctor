'use client';

import { useState, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { OverviewReport } from '@/lib/types';
import {
  Upload, FileText, CheckCircle2, AlertCircle, Loader2, Download,
  Shield, TrendingUp, AlertTriangle, XCircle, ArrowRight, Lock,
  Unlock, FileSignature, BarChart3, ChevronRight, Eye,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

export function UploadView() {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [report, setReport] = useState<OverviewReport | null>(null);
  const [signing, setSigning] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [showContract, setShowContract] = useState(false);
  const { navigateToReport, setCurrentView, setContractSigned } = useAppStore();

  const handleUpload = useCallback(async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      toast.error('Please upload a CSV file');
      return;
    }

    setUploading(true);
    setReport(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload/overview', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Upload failed');
        return;
      }

      setReport(data.report);
      toast.success(`Overview scan complete! ${data.imported} claims analyzed`);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload file');
    } finally {
      setUploading(false);
    }
  }, []);

  const handleSignContract = async () => {
    if (!report || !signerName.trim()) {
      toast.error('Please enter the signer name');
      return;
    }

    setSigning(true);
    try {
      const res = await fetch('/api/upload/overview', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId: report.id,
          contractStatus: 'signed',
          signedBy: signerName,
        }),
      });
      const data = await res.json();

      if (data.report) {
        setReport({ ...report, contractStatus: 'signed', signedAt: data.report.signedAt, signedBy: signerName });
        setContractSigned(true);
        toast.success('Contract signed! You can now work on fixing claims.');
      }
    } catch (error) {
      toast.error('Failed to sign contract');
    } finally {
      setSigning(false);
    }
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUpload(e.dataTransfer.files[0]);
    }
  }, [handleUpload]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleUpload(e.target.files[0]);
    }
  }, [handleUpload]);

  const downloadSampleCSV = () => {
    const headers = 'ClaimNumber,PatientName,PatientDOB,PayerName,PayerID,ProviderNPI,DateOfService,DenialDate,CPTCode,Modifier,DiagnosisCode,BilledAmount,DeniedAmount,CARCCode,RARCCode,AdjustmentGroupCode';
    const row1 = 'CLM-2025-00001,John Smith,1985-03-15,Aetna,AET-54321,1234567890,2025-01-10,2025-01-25,99213,,J06.9,185.00,185.00,CO-16,N286,CO';
    const row2 = 'CLM-2025-00002,Jane Doe,1970-07-22,UnitedHealthcare,UHC-87726,2345678901,2025-01-12,2025-01-28,27130,,M16.11,35000.00,35000.00,CO-50,N430,CO';
    const row3 = 'CLM-2025-00003,Robert Johnson,1992-11-08,Cigna,CIG-12345,3456789012,2025-01-15,2025-02-01,99214,25,M54.5,250.00,250.00,CO-22,N57,CO';
    const row4 = 'CLM-2025-00004,Mary Wilson,1958-05-30,Medicare,MCD-67890,4567890123,2025-01-20,2025-02-05,77067,,Z12.31,180.00,180.00,CO-27,N70,CO';
    const row5 = 'CLM-2025-00005,James Brown,1980-09-14,Blue Cross Blue Shield,BCBS-11111,5678901234,2025-01-22,2025-02-08,29881,,J34.2,1200.00,1200.00,CO-4,N102,CO';
    const csv = `${headers}\n${row1}\n${row2}\n${row3}\n${row4}\n${row5}`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'denial_report_sample.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // If we have a report, show the overview scan
  if (report) {
    return <OverviewScanView report={report} signing={signing} signerName={signerName} setSignerName={setSignerName} onSign={handleSignContract} onNavigateToDenials={() => setCurrentView('denials')} onNavigateToReport={() => navigateToReport(report.id)} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Upload Denial Report</h2>
        <p className="text-muted-foreground mt-1">Upload a CSV denial report for instant AI-powered overview analysis</p>
      </div>

      {/* Two-Step Process */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">1</div>
            <h3 className="text-sm font-semibold text-foreground">Instant Overview Scan</h3>
          </div>
          <p className="text-xs text-muted-foreground ml-11">AI analyzes your denial report and generates a client-facing overview with rating and key issues. No contract required.</p>
        </div>
        <div className="rounded-xl border border-border bg-secondary/50 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground font-bold text-sm">2</div>
            <h3 className="text-sm font-semibold text-foreground">Fix Claims (After Contract)</h3>
          </div>
          <p className="text-xs text-muted-foreground ml-11">Once the client signs a contract, unlock full denial management: analysis, correction, and resubmission.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload Area */}
        <div className="space-y-6">
          <Card className="border-border bg-card">
            <CardContent className="p-6">
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-12 text-center transition-all ${
                  dragActive
                    ? 'border-primary bg-primary/5 scale-[1.01]'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                {uploading ? (
                  <div className="flex flex-col items-center">
                    <div className="relative">
                      <Loader2 className="h-12 w-12 text-primary animate-spin" />
                      <BarChart3 className="h-5 w-5 text-primary absolute -bottom-1 -right-1" />
                    </div>
                    <p className="mt-4 text-lg font-medium text-foreground">Running AI Overview Scan...</p>
                    <p className="text-sm text-muted-foreground mt-1">Analyzing denial patterns with GPT-5.5</p>
                    <Progress className="w-48 mt-4" value={66} />
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <Upload className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-lg font-medium text-foreground">Drag & Drop CSV File</p>
                    <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
                    <label className="mt-4 cursor-pointer">
                      <input
                        type="file"
                        accept=".csv"
                        onChange={handleFileInput}
                        className="hidden"
                      />
                      <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-all">
                        <FileText className="h-4 w-4" /> Choose File
                      </span>
                    </label>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Download Sample */}
          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Download className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Download Sample CSV</p>
                    <p className="text-xs text-muted-foreground">Get the required format template</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={downloadSampleCSV} className="border-primary/30 text-primary">
                  Download
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* CSV Format Info */}
        <div className="space-y-6">
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Required CSV Format</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="max-h-96 overflow-y-auto custom-scrollbar">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="py-2 text-left text-muted-foreground font-medium">Column</th>
                      <th className="py-2 text-left text-muted-foreground font-medium">Format</th>
                    </tr>
                  </thead>
                  <tbody className="space-y-1">
                    {[
                      { col: 'ClaimNumber', format: 'String (e.g., CLM-2025-001)' },
                      { col: 'PatientName', format: 'String (e.g., John Smith)' },
                      { col: 'PatientDOB', format: 'YYYY-MM-DD' },
                      { col: 'PayerName', format: 'String (e.g., Aetna)' },
                      { col: 'PayerID', format: 'String (e.g., AET-54321)' },
                      { col: 'ProviderNPI', format: '10-digit NPI' },
                      { col: 'DateOfService', format: 'YYYY-MM-DD' },
                      { col: 'DenialDate', format: 'YYYY-MM-DD' },
                      { col: 'CPTCode', format: '5-char CPT (e.g., 99213)' },
                      { col: 'Modifier', format: '2-char modifier or empty' },
                      { col: 'DiagnosisCode', format: 'ICD-10 code (e.g., M54.5)' },
                      { col: 'BilledAmount', format: 'Decimal (e.g., 250.00)' },
                      { col: 'DeniedAmount', format: 'Decimal (e.g., 250.00)' },
                      { col: 'CARCCode', format: 'Claim adjustment code (e.g., CO-16)' },
                      { col: 'RARCCode', format: 'Remittance advice code' },
                      { col: 'AdjustmentGroupCode', format: 'CO, PR, or OA' },
                    ].map((row) => (
                      <tr key={row.col} className="border-b border-border/50">
                        <td className="py-1.5 font-mono text-primary">{row.col}</td>
                        <td className="py-1.5 text-muted-foreground">{row.format}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ==================== Overview Scan View ====================

function OverviewScanView({ report, signing, signerName, setSignerName, onSign, onNavigateToDenials, onNavigateToReport }: {
  report: OverviewReport;
  signing: boolean;
  signerName: string;
  setSignerName: (name: string) => void;
  onSign: () => void;
  onNavigateToDenials: () => void;
  onNavigateToReport: () => void;
}) {
  const isSigned = report.contractStatus === 'signed';

  const getRatingColor = (rating: number) => {
    if (rating >= 8) return 'text-emerald-400';
    if (rating >= 5) return 'text-yellow-400';
    if (rating >= 3) return 'text-orange-400';
    return 'text-red-400';
  };

  const getRatingBg = (rating: number) => {
    if (rating >= 8) return 'bg-emerald/10 border-emerald/30';
    if (rating >= 5) return 'bg-yellow-500/10 border-yellow-500/30';
    if (rating >= 3) return 'bg-orange-500/10 border-orange-500/30';
    return 'bg-red-500/10 border-red-500/30';
  };

  const getRatingRing = (rating: number) => {
    if (rating >= 8) return 'stroke-emerald-400';
    if (rating >= 5) return 'stroke-yellow-400';
    if (rating >= 3) return 'stroke-orange-400';
    return 'stroke-red-400';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Denial Overview Report</h2>
          <p className="text-muted-foreground mt-1">{report.fileName} · {report.uploadDate ? new Date(report.uploadDate).toLocaleDateString() : 'Today'}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className={isSigned ? 'bg-emerald/10 text-emerald border-emerald/30' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'}>
            {isSigned ? <><Unlock className="h-3 w-3 mr-1" /> Contract Signed</> : <><Lock className="h-3 w-3 mr-1" /> Awaiting Contract</>}
          </Badge>
        </div>
      </div>

      {/* Rating Card - Hero Section */}
      <Card className={`border-2 ${getRatingBg(report.overallRating)}`}>
        <CardContent className="p-8">
          <div className="flex flex-col md:flex-row items-center gap-8">
            {/* Rating Circle */}
            <div className="flex-shrink-0">
              <div className="relative h-40 w-40">
                <svg className="h-40 w-40 -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="52" fill="none" stroke="oklch(0.28 0.02 240)" strokeWidth="8" />
                  <circle
                    cx="60" cy="60" r="52" fill="none"
                    className={getRatingRing(report.overallRating)}
                    strokeWidth="8"
                    strokeDasharray={`${(report.overallRating / 10) * 327} 327`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-4xl font-bold ${getRatingColor(report.overallRating)}`}>{report.overallRating}</span>
                  <span className="text-xs text-muted-foreground">out of 10</span>
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="flex-1 text-center md:text-left">
              <div className="flex items-center gap-3 justify-center md:justify-start mb-3">
                <Badge variant="outline" className={`text-sm font-semibold px-3 py-1 ${getRatingBg(report.overallRating)} ${getRatingColor(report.overallRating)}`}>
                  {report.ratingLabel}
                </Badge>
              </div>
              <p className="text-lg text-foreground leading-relaxed mb-4">{report.executiveSummary}</p>
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg bg-background/50 p-3 text-center">
                  <p className="text-2xl font-bold text-foreground">{report.totalClaims}</p>
                  <p className="text-xs text-muted-foreground">Denied Claims</p>
                </div>
                <div className="rounded-lg bg-background/50 p-3 text-center">
                  <p className="text-2xl font-bold text-foreground">${report.totalDeniedAmount.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Total Denied</p>
                </div>
                <div className="rounded-lg bg-background/50 p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-400">${report.recoveryPotential.estimatedRecoverable.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Recoverable</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Key Issues + Recovery Potential */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Key Issues */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-400" /> Key Issues Identified
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-3">
              {report.keyIssues.map((issue, idx) => (
                <div key={idx} className="rounded-lg bg-secondary p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {issue.severity === 'critical' ? <XCircle className="h-4 w-4 text-red-400" /> :
                       issue.severity === 'high' ? <AlertTriangle className="h-4 w-4 text-orange-400" /> :
                       issue.severity === 'medium' ? <AlertCircle className="h-4 w-4 text-yellow-400" /> :
                       <CheckCircle2 className="h-4 w-4 text-blue-400" />}
                      <span className="text-sm font-medium text-foreground">{issue.issue}</span>
                    </div>
                    <Badge variant="outline" className={SEVERITY_COLORS[issue.severity]}>
                      {issue.severity}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{issue.description}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{issue.affectedClaims} claims affected</span>
                    <span>${issue.affectedAmount.toLocaleString()} at risk</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recovery Potential */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald" /> Recovery Potential
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="rounded-xl bg-emerald/10 border border-emerald/20 p-4 text-center">
              <p className="text-3xl font-bold text-emerald-400">${report.recoveryPotential.estimatedRecoverable.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground mt-1">Estimated Recoverable ({report.recoveryPotential.recoveryPercentage}% recovery rate)</p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">High Confidence</span>
                  <span className="font-medium text-emerald-400">${report.recoveryPotential.highConfidence.toLocaleString()}</span>
                </div>
                <Progress value={(report.recoveryPotential.highConfidence / report.totalDeniedAmount) * 100} className="h-2" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Medium Confidence</span>
                  <span className="font-medium text-yellow-400">${report.recoveryPotential.mediumConfidence.toLocaleString()}</span>
                </div>
                <Progress value={(report.recoveryPotential.mediumConfidence / report.totalDeniedAmount) * 100} className="h-2" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Low Confidence</span>
                  <span className="font-medium text-orange-400">${report.recoveryPotential.lowConfidence.toLocaleString()}</span>
                </div>
                <Progress value={(report.recoveryPotential.lowConfidence / report.totalDeniedAmount) * 100} className="h-2" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Denial Reasons + Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Denial Reasons */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" /> Top Denial Reasons
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-3">
              {report.topDenialReasons.map((reason, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground truncate">{reason.reason}</span>
                      <span className="text-xs font-mono text-primary ml-2">{reason.carcCode}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span>{reason.count} claims</span>
                      <span>${reason.amount.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Category Breakdown */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Category Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-3">
              {report.categoryBreakdown.map((cat, idx) => {
                const colors = ['bg-primary', 'bg-cyan', 'bg-emerald', 'bg-yellow-500', 'bg-orange-500', 'bg-red-500', 'bg-purple-500', 'bg-pink-500'];
                const bgColors = ['bg-primary/20', 'bg-cyan/20', 'bg-emerald/20', 'bg-yellow-500/20', 'bg-orange-500/20', 'bg-red-500/20', 'bg-purple-500/20', 'bg-pink-500/20'];
                return (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground capitalize">{cat.category.replace(/_/g, ' ')}</span>
                      <span className="text-foreground font-medium">{cat.count} claims · ${cat.amount.toLocaleString()} · {cat.percentage}%</span>
                    </div>
                    <div className={`h-2.5 rounded-full ${bgColors[idx % bgColors.length]}`}>
                      <div
                        className={`h-full rounded-full ${colors[idx % colors.length]} transition-all duration-500`}
                        style={{ width: `${Math.max(cat.percentage, 2)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recommendations */}
      {report.recommendations.length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" /> Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {report.recommendations.map((rec, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-secondary">
                  <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0 mt-0.5">
                    {idx + 1}
                  </div>
                  <p className="text-sm text-foreground">{rec}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Contract Gate Section */}
      <Card className={`border-2 ${isSigned ? 'border-emerald/30 bg-emerald/5' : 'border-yellow-500/30 bg-yellow-500/5'}`}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            {isSigned ? (
              <><Unlock className="h-4 w-4 text-emerald" /> Contract Signed - Full Access Unlocked</>
            ) : (
              <><Lock className="h-4 w-4 text-yellow-400" /> Contract Required for Claim Processing</>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {isSigned ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald/10 border border-emerald/20">
                <CheckCircle2 className="h-5 w-5 text-emerald" />
                <div>
                  <p className="text-sm font-medium text-foreground">Signed by {report.signedBy} on {report.signedAt ? new Date(report.signedAt).toLocaleString() : 'N/A'}</p>
                  <p className="text-xs text-muted-foreground">Full denial management capabilities are now available</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button onClick={onNavigateToDenials} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                  Go to Denial Queue <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
                <Button variant="outline" onClick={onNavigateToReport} className="border-primary/30 text-primary">
                  <Eye className="h-4 w-4 mr-2" /> View Detailed Report
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-4">
                <div className="flex items-start gap-3">
                  <FileSignature className="h-5 w-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">This overview report is for client review only</p>
                    <p className="text-xs text-muted-foreground mt-1">To unlock claim analysis, correction, and resubmission capabilities, a contract must be signed. The AI agents that fix denied claims will only activate after contract signing.</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder="Enter signer name (client representative)"
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    className="w-full rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <Button
                  onClick={onSign}
                  disabled={signing || !signerName.trim()}
                  className="bg-yellow-500 hover:bg-yellow-600 text-black font-semibold px-6"
                >
                  {signing ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Signing...</>
                  ) : (
                    <><FileSignature className="h-4 w-4 mr-2" /> Sign Contract</>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
