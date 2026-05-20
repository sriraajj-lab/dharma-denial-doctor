'use client';

import { useEffect, useState } from 'react';
import { Denial, DenialAnalysis, CorrectionSuggestion, QualityCheck } from '@/lib/types';
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  FileText,
  Wrench,
  ShieldCheck,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  Info,
  Zap,
  Users,
  MessageSquare,
  Gavel,
  Lock,
  Cpu,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { useAppStore } from '@/lib/store';
import { toast } from 'sonner';
import { SmartCorrectionPanel } from './smart-correction-panel';
import { EligibilityPanel } from './eligibility-panel';
import { NotesPanel } from './notes-panel';
import { AppealPanel } from './appeal-panel';

const STATUS_COLORS: Record<string, string> = {
  New: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  Analyzed: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  Corrected: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  Reviewed: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  Resubmitted: 'bg-green-500/20 text-green-400 border-green-500/30',
  Appealed: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  Closed: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-500/20 text-gray-400',
  normal: 'bg-blue-500/20 text-blue-400',
  high: 'bg-orange-500/20 text-orange-400',
  critical: 'bg-red-500/20 text-red-400',
};

const RISK_COLORS: Record<string, string> = {
  low: 'text-emerald-400',
  medium: 'text-yellow-400',
  high: 'text-red-400',
};

const RESULT_COLORS: Record<string, string> = {
  pass: 'text-emerald-400',
  fail: 'text-red-400',
  warning: 'text-yellow-400',
};

export function DenialDetailView() {
  const [denial, setDenial] = useState<Denial | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [qualityChecking, setQualityChecking] = useState(false);
  const [activeTab, setActiveTab] = useState<'analysis' | 'correction' | 'quality' | 'smart-correct' | 'eligibility' | 'notes' | 'appeal'>('analysis');
  const { selectedDenialId, navigateBack, accessLevel, setCurrentView, setAccessLevel } = useAppStore();
  const isL1 = accessLevel === 1;
  const isL2OrAbove = accessLevel !== null && accessLevel >= 2;
  const isL3 = accessLevel === 3;

  useEffect(() => {
    if (selectedDenialId) {
      fetchDenial();
    }
  }, [selectedDenialId]);

  const fetchDenial = async () => {
    try {
      const res = await fetch(`/api/denials/${selectedDenialId}`);
      const data = await res.json();
      setDenial(data);
    } catch (error) {
      console.error('Error fetching denial:', error);
    } finally {
      setLoading(false);
    }
  };

  const runAnalysis = async () => {
    setAnalyzing(true);
    setActiveTab('analysis');
    try {
      const res = await fetch(`/api/denials/${selectedDenialId}/analyze`, { method: 'POST' });
      const data = await res.json();
      setDenial(data.denial);
      toast.success('Denial analysis completed successfully');
    } catch (error) {
      console.error('Error analyzing denial:', error);
      toast.error('Failed to analyze denial');
    } finally {
      setAnalyzing(false);
    }
  };

  const runCorrection = async () => {
    setCorrecting(true);
    setActiveTab('correction');
    try {
      const res = await fetch(`/api/denials/${selectedDenialId}/correct`, { method: 'POST' });
      const data = await res.json();
      setDenial(data.denial);
      toast.success('Correction suggestion generated successfully');
    } catch (error) {
      console.error('Error generating correction:', error);
      toast.error('Failed to generate correction suggestion');
    } finally {
      setCorrecting(false);
    }
  };

  const runQualityCheck = async () => {
    setQualityChecking(true);
    setActiveTab('quality');
    try {
      const res = await fetch(`/api/denials/${selectedDenialId}/quality-check`, { method: 'POST' });
      const data = await res.json();
      setDenial(data.denial);
      toast.success('Quality check completed successfully');
    } catch (error) {
      console.error('Error running quality check:', error);
      toast.error('Failed to run quality check');
    } finally {
      setQualityChecking(false);
    }
  };

  const handleResubmit = async () => {
    if (!denial) return;
    try {
      const res = await fetch(`/api/denials/${selectedDenialId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Resubmitted' }),
      });
      const data = await res.json();
      setDenial(data);
      toast.success('Claim marked as resubmitted');
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const handleClose = async () => {
    if (!denial) return;
    try {
      const res = await fetch(`/api/denials/${selectedDenialId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Closed' }),
      });
      const data = await res.json();
      setDenial(data);
      toast.success('Claim closed');
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!denial) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-muted-foreground">
        <AlertCircle className="h-12 w-12 mb-3 opacity-50" />
        <p>Denial not found</p>
      </div>
    );
  }

  const workflowSteps = ['New', 'Analyzed', 'Corrected', 'Reviewed', 'Resubmitted', 'Appealed', 'Closed'];
  const currentStepIndex = workflowSteps.indexOf(denial.status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={navigateBack} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-foreground">{denial.claimNumber}</h2>
            <Badge variant="outline" className={STATUS_COLORS[denial.status]}>{denial.status}</Badge>
            <Badge variant="outline" className={PRIORITY_COLORS[denial.priority]}>{denial.priority} priority</Badge>
          </div>
          <p className="text-muted-foreground mt-1">{denial.patientName} · {denial.payerName} · {denial.carcCode}</p>
        </div>
      </div>

      {/* Workflow Progress */}
      <Card className="border-border bg-card">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            {workflowSteps.map((step, index) => (
              <div key={step} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-smooth ${
                      index < currentStepIndex
                        ? 'bg-emerald border-emerald text-white'
                        : index === currentStepIndex
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'bg-secondary border-border text-muted-foreground'
                    }`}
                  >
                    {index < currentStepIndex ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                  </div>
                  <span className="text-[10px] mt-1 text-muted-foreground">{step}</span>
                </div>
                {index < workflowSteps.length - 1 && (
                  <ChevronRight className={`h-4 w-4 mx-1 ${index < currentStepIndex ? 'text-emerald' : 'text-border'}`} />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Claim Details */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> Claim Details
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <DetailRow label="Claim Number" value={denial.claimNumber} mono />
              <DetailRow label="Patient Name" value={denial.patientName} />
              <DetailRow label="Patient DOB" value={denial.patientDOB} />
              <DetailRow label="Payer" value={denial.payerName} />
              <DetailRow label="Payer ID" value={denial.payerId} mono />
              <DetailRow label="Provider NPI" value={denial.providerNPI} mono />
              <DetailRow label="Date of Service" value={denial.dateOfService} />
              <DetailRow label="Denial Date" value={denial.denialDate} />
              <Separator className="bg-border" />
              <DetailRow label="CPT Code" value={`${denial.cptCode}${denial.modifier ? `-${denial.modifier}` : ''}`} mono highlight />
              <DetailRow label="Diagnosis Code" value={denial.diagnosisCode} mono highlight />
              <Separator className="bg-border" />
              <DetailRow label="Billed Amount" value={`$${denial.billedAmount.toLocaleString()}`} highlight />
              <DetailRow label="Denied Amount" value={`$${denial.deniedAmount.toLocaleString()}`} highlight />
              <Separator className="bg-border" />
              <DetailRow label="CARC Code" value={denial.carcCode} mono highlight />
              <DetailRow label="RARC Code" value={denial.rarcCode} mono />
              <DetailRow label="Adjustment Group" value={denial.adjustmentGroupCode} mono />
              <DetailRow label="Category" value={denial.denialCategory} />
            </CardContent>
          </Card>

          {/* Action Buttons - Level Gated */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" /> AI Agent Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {isL1 ? (
                /* Level 1: Locked - Show upgrade CTA */
                <div className="space-y-3">
                  <div className="rounded-lg bg-cyan/10 border border-cyan/20 p-4 text-center">
                    <Lock className="h-6 w-6 text-cyan mx-auto mb-2" />
                    <p className="text-sm font-medium text-foreground">AI Agents Locked</p>
                    <p className="text-xs text-muted-foreground mt-1">Upgrade to Level 2 to unlock AI analysis, corrections, and appeal generation for individual claims.</p>
                  </div>
                  <Button
                    onClick={() => { setAccessLevel(2); setCurrentView('landing'); }}
                    className="w-full bg-emerald hover:bg-emerald/90 text-white"
                  >
                    <Zap className="h-4 w-4 mr-2" /> Upgrade to Level 2
                  </Button>
                </div>
              ) : (
                /* Level 2+: Full agent actions */
                <>
                  <Button
                    onClick={runAnalysis}
                    disabled={analyzing || denial.status !== 'New'}
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    {analyzing ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyzing...</>
                    ) : (
                      <><Bot className="h-4 w-4 mr-2" /> Run Analysis Agent</>
                    )}
                  </Button>
                  <Button
                    onClick={runCorrection}
                    disabled={correcting || !denial.analysis || denial.status === 'New'}
                    variant="outline"
                    className="w-full border-primary/50 text-primary hover:bg-primary/10"
                  >
                    {correcting ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating Correction...</>
                    ) : (
                      <><Wrench className="h-4 w-4 mr-2" /> Run Correction Agent</>
                    )}
                  </Button>
                  <Button
                    onClick={runQualityCheck}
                    disabled={qualityChecking || !denial.correction || denial.status === 'New' || denial.status === 'Analyzed'}
                    variant="outline"
                    className="w-full border-emerald/50 text-emerald hover:bg-emerald/10"
                  >
                    {qualityChecking ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Quality Checking...</>
                    ) : (
                      <><ShieldCheck className="h-4 w-4 mr-2" /> Run Quality Checker</>
                    )}
                  </Button>
                  <Separator className="bg-border" />
                  {isL3 && (
                    <div className="rounded-lg bg-primary/10 border border-primary/20 p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Cpu className="h-4 w-4 text-primary" />
                        <span className="text-xs font-medium text-primary">Level 3: Auto-Fix</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Autonomous correction and resubmission through EHR integration.</p>
                      <Badge variant="outline" className="mt-2 bg-primary/10 text-primary border-primary/30 text-[10px]">
                        Coming Soon
                      </Badge>
                    </div>
                  )}
                  {denial.status === 'Reviewed' && (
                    <Button onClick={handleResubmit} className="w-full bg-green-600 hover:bg-green-700 text-white">
                      <RefreshCw className="h-4 w-4 mr-2" /> Mark as Resubmitted
                    </Button>
                  )}
                  {denial.status === 'Resubmitted' && (
                    <Button onClick={handleClose} variant="outline" className="w-full border-border">
                      <CheckCircle2 className="h-4 w-4 mr-2" /> Close Claim
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: AI Panels */}
        <div className="lg:col-span-2 space-y-6">
          {/* Level 1: Locked Panel */}
          {isL1 && (
            <Card className="border-cyan/30 bg-cyan/5">
              <CardContent className="p-8">
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="h-20 w-20 rounded-full bg-cyan/10 flex items-center justify-center mb-4">
                    <Lock className="h-10 w-10 text-cyan" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground">Level 1: Diagnostic Only</h3>
                  <p className="text-sm text-muted-foreground mt-2 max-w-md">
                    Your current plan includes scan, score, and pain point identification only.
                    Upgrade to Level 2 to unlock AI analysis, smart corrections, appeal generation, and step-by-step fix instructions for every claim.
                  </p>
                  <div className="flex items-center gap-4 mt-6">
                    <Button
                      onClick={() => { setAccessLevel(2); setCurrentView('landing'); }}
                      className="bg-emerald hover:bg-emerald/90 text-white"
                    >
                      <Zap className="h-4 w-4 mr-2" /> Upgrade to Level 2 - Fix & Appeal
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-6 max-w-sm">
                    <div className="rounded-lg bg-secondary p-3 text-center">
                      <span className="text-xs text-muted-foreground block">L2 Includes</span>
                      <span className="text-sm font-bold text-emerald">AI Analysis</span>
                    </div>
                    <div className="rounded-lg bg-secondary p-3 text-center">
                      <span className="text-xs text-muted-foreground block">L2 Includes</span>
                      <span className="text-sm font-bold text-emerald">Corrections</span>
                    </div>
                    <div className="rounded-lg bg-secondary p-3 text-center">
                      <span className="text-xs text-muted-foreground block">L2 Includes</span>
                      <span className="text-sm font-bold text-emerald">Appeals</span>
                    </div>
                    <div className="rounded-lg bg-secondary p-3 text-center">
                      <span className="text-xs text-muted-foreground block">L2 Includes</span>
                      <span className="text-sm font-bold text-emerald">Fix Report</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Level 2+: Tab Selection and Panels */}
          {isL2OrAbove && (
            <>
              {/* Tab Selection */}
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setActiveTab('analysis')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-smooth ${
                    activeTab === 'analysis' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Bot className="h-4 w-4 inline mr-1" /> Analysis
                </button>
                <button
                  onClick={() => setActiveTab('correction')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-smooth ${
                    activeTab === 'correction' ? 'bg-orange-500 text-white' : 'bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Wrench className="h-4 w-4 inline mr-1" /> Correction
                </button>
                <button
                  onClick={() => setActiveTab('smart-correct')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-smooth ${
                    activeTab === 'smart-correct' ? 'bg-violet-600 text-white' : 'bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Zap className="h-4 w-4 inline mr-1" /> Smart Correct
                </button>
                <button
                  onClick={() => setActiveTab('eligibility')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-smooth ${
                    activeTab === 'eligibility' ? 'bg-teal-600 text-white' : 'bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Users className="h-4 w-4 inline mr-1" /> Eligibility
                </button>
                <button
                  onClick={() => setActiveTab('quality')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-smooth ${
                    activeTab === 'quality' ? 'bg-emerald text-emerald-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <ShieldCheck className="h-4 w-4 inline mr-1" /> Quality
                </button>
                <button
                  onClick={() => setActiveTab('appeal')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-smooth ${
                    activeTab === 'appeal' ? 'bg-amber-600 text-white' : 'bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Gavel className="h-4 w-4 inline mr-1" /> Appeal
                </button>
                <button
                  onClick={() => setActiveTab('notes')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-smooth ${
                    activeTab === 'notes' ? 'bg-sky-600 text-white' : 'bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <MessageSquare className="h-4 w-4 inline mr-1" /> Notes
                </button>
              </div>

          {/* Analysis Panel */}
          {activeTab === 'analysis' && (
            <AnalysisPanel analysis={denial.analysis} isRunning={analyzing} />
          )}

          {/* Correction Panel */}
          {activeTab === 'correction' && (
            <CorrectionPanel correction={denial.correction} isRunning={correcting} hasAnalysis={!!denial.analysis} />
          )}

          {/* Smart Correction Panel */}
          {activeTab === 'smart-correct' && (
            <SmartCorrectionPanel denial={denial} />
          )}

          {/* Eligibility Resolution Panel */}
          {activeTab === 'eligibility' && (
            <EligibilityPanel denial={denial} />
          )}

          {/* Quality Check Panel */}
          {activeTab === 'quality' && (
            <QualityCheckPanel qualityCheck={denial.qualityCheck} isRunning={qualityChecking} hasCorrection={!!denial.correction} />
          )}

          {/* Appeal Panel */}
          {activeTab === 'appeal' && (
            <AppealPanel denial={denial} />
          )}

          {/* Notes Panel */}
          {activeTab === 'notes' && (
            <NotesPanel denialId={denial.id} />
          )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm ${mono ? 'font-mono' : ''} ${highlight ? 'text-foreground font-medium' : 'text-foreground'}`}>
        {value}
      </span>
    </div>
  );
}

function AnalysisPanel({ analysis, isRunning }: { analysis?: DenialAnalysis; isRunning: boolean }) {
  if (isRunning) {
    return (
      <Card className="border-primary/30 bg-card">
        <CardContent className="p-8">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="relative">
              <Bot className="h-16 w-16 text-primary agent-running" />
              <Loader2 className="h-6 w-6 text-primary absolute -bottom-1 -right-1 animate-spin" />
            </div>
            <h3 className="text-lg font-semibold mt-4">Denial Analysis Agent Running</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-md">
              Analyzing denial reason codes, identifying root cause, and determining correctability...
            </p>
            <Progress className="w-64 mt-4" value={66} />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!analysis) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-8">
          <div className="flex flex-col items-center justify-center text-center text-muted-foreground">
            <Bot className="h-12 w-12 mb-3 opacity-50" />
            <h3 className="text-lg font-medium">No Analysis Yet</h3>
            <p className="text-sm mt-1">Click &quot;Run Analysis Agent&quot; to analyze this denial</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <Card className="border-primary/20 bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" /> Analysis Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="rounded-lg bg-primary/10 border border-primary/20 p-4">
            <p className="text-sm text-foreground">{analysis.denialSummary}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Root Cause</span>
              <p className="text-sm font-medium text-foreground">{analysis.rootCauseCategory}</p>
              <p className="text-xs text-muted-foreground">{analysis.rootCauseDetail}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Denial Category</span>
              <Badge variant="outline" className="text-primary border-primary/30">{analysis.denialCategory}</Badge>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-secondary p-3 text-center">
              <span className="text-xs text-muted-foreground block">Preventable</span>
              <span className={`text-sm font-bold ${analysis.preventable ? 'text-yellow-400' : 'text-emerald-400'}`}>
                {analysis.preventable ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="rounded-lg bg-secondary p-3 text-center">
              <span className="text-xs text-muted-foreground block">Correctable</span>
              <span className={`text-sm font-bold ${analysis.correctable ? 'text-emerald-400' : 'text-red-400'}`}>
                {analysis.correctable ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="rounded-lg bg-secondary p-3 text-center">
              <span className="text-xs text-muted-foreground block">Appeal</span>
              <span className={`text-sm font-bold ${analysis.appealRecommended ? 'text-primary' : 'text-muted-foreground'}`}>
                {analysis.appealRecommended ? 'Recommended' : 'Not Needed'}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Confidence Score</span>
              <span className="text-sm font-bold text-primary">{(analysis.confidenceScore * 100).toFixed(0)}%</span>
            </div>
            <Progress value={analysis.confidenceScore * 100} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Next Action */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Info className="h-4 w-4 text-cyan" /> Recommended Next Action
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="rounded-lg bg-cyan/10 border border-cyan/20 p-4">
            <p className="text-sm text-foreground">{analysis.recommendedNextAction}</p>
          </div>
        </CardContent>
      </Card>

      {/* Required Information */}
      {analysis.requiredInformation.length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Required Information</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-2">
              {analysis.requiredInformation.map((info, idx) => (
                <div key={idx} className="flex items-start gap-3 p-2 rounded-lg bg-secondary">
                  <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0 mt-0.5">
                    {idx + 1}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{info.item}</p>
                    <p className="text-xs text-muted-foreground">{info.reasonNeeded}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Compliance Notes */}
      {analysis.complianceNotes.length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-400" /> Compliance Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <ul className="space-y-2">
              {analysis.complianceNotes.map((note, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <AlertTriangle className="h-3 w-3 text-yellow-400 mt-1 flex-shrink-0" />
                  {note}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CorrectionPanel({ correction, isRunning, hasAnalysis }: { correction?: CorrectionSuggestion; isRunning: boolean; hasAnalysis: boolean }) {
  if (isRunning) {
    return (
      <Card className="border-orange-500/30 bg-card">
        <CardContent className="p-8">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="relative">
              <Wrench className="h-16 w-16 text-orange-400 agent-running" />
              <Loader2 className="h-6 w-6 text-orange-400 absolute -bottom-1 -right-1 animate-spin" />
            </div>
            <h3 className="text-lg font-semibold mt-4">Correction Suggestion Agent Running</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-md">
              Generating compliant corrections based on denial analysis...
            </p>
            <Progress className="w-64 mt-4" value={45} />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!hasAnalysis) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-8">
          <div className="flex flex-col items-center justify-center text-center text-muted-foreground">
            <Info className="h-12 w-12 mb-3 opacity-50" />
            <h3 className="text-lg font-medium">Run Analysis First</h3>
            <p className="text-sm mt-1">Analysis must be completed before generating corrections</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!correction) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-8">
          <div className="flex flex-col items-center justify-center text-center text-muted-foreground">
            <Wrench className="h-12 w-12 mb-3 opacity-50" />
            <h3 className="text-lg font-medium">No Correction Yet</h3>
            <p className="text-sm mt-1">Click &quot;Run Correction Agent&quot; to generate corrections</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-orange-500/20 bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Wrench className="h-4 w-4 text-orange-400" /> Correction Suggestion
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-xs text-muted-foreground block">Type</span>
              <Badge variant="outline" className="border-orange-500/30 text-orange-400 mt-1">{correction.correctionType}</Badge>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Risk Level</span>
              <span className={`text-sm font-bold ${RISK_COLORS[correction.riskLevel]}`}>
                {correction.riskLevel.toUpperCase()}
              </span>
            </div>
          </div>

          <div className="rounded-lg bg-orange-500/10 border border-orange-500/20 p-4">
            <p className="text-sm text-foreground">{correction.correctionSummary}</p>
          </div>

          {correction.correctionRationale && (
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Rationale</span>
              <p className="text-sm text-foreground">{correction.correctionRationale}</p>
            </div>
          )}

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Confidence Score</span>
              <span className="text-sm font-bold text-orange-400">{(correction.confidenceScore * 100).toFixed(0)}%</span>
            </div>
            <Progress value={correction.confidenceScore * 100} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Proposed Changes */}
      {correction.proposedChanges.length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Proposed Changes</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-3">
              {correction.proposedChanges.map((change, idx) => (
                <div key={idx} className="rounded-lg bg-secondary p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-mono text-primary">{change.fieldPath}</span>
                    <Badge variant="outline" className={RISK_COLORS[change.riskLevel] === 'text-emerald-400' ? 'bg-emerald/10 text-emerald-400 border-emerald/30' : RISK_COLORS[change.riskLevel] === 'text-yellow-400' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}>
                      {change.riskLevel}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 rounded bg-red-500/10 p-2 text-center">
                      <span className="text-[10px] text-muted-foreground block">Original</span>
                      <span className="text-sm font-mono text-red-400">{change.originalValue || '(empty)'}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 rounded bg-emerald/10 p-2 text-center">
                      <span className="text-[10px] text-muted-foreground block">Proposed</span>
                      <span className="text-sm font-mono text-emerald-400">{change.proposedValue}</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{change.reason}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Required Documents */}
      {correction.requiredDocuments.length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Required Documents</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-2">
              {correction.requiredDocuments.map((doc, idx) => (
                <div key={idx} className="flex items-start gap-3 p-2 rounded-lg bg-secondary">
                  <FileText className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{doc.documentType}</p>
                    <p className="text-xs text-muted-foreground">{doc.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resubmission Instructions */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Resubmission Instructions</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div>
              <span className="text-xs text-muted-foreground block">Frequency Code</span>
              <span className="text-sm font-mono text-foreground">{correction.resubmissionInstructions.claimFrequencyCode}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Submission Type</span>
              <span className="text-sm text-foreground">{correction.resubmissionInstructions.submissionType}</span>
            </div>
          </div>
          <div className="rounded-lg bg-primary/10 border border-primary/20 p-3">
            <p className="text-sm text-foreground">{correction.resubmissionInstructions.notes}</p>
          </div>
        </CardContent>
      </Card>

      {/* Compliance Notes */}
      {correction.complianceNotes.length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-400" /> Compliance Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <ul className="space-y-2">
              {correction.complianceNotes.map((note, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <AlertTriangle className="h-3 w-3 text-yellow-400 mt-1 flex-shrink-0" />
                  {note}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function QualityCheckPanel({ qualityCheck, isRunning, hasCorrection }: { qualityCheck?: QualityCheck; isRunning: boolean; hasCorrection: boolean }) {
  if (isRunning) {
    return (
      <Card className="border-emerald/30 bg-card">
        <CardContent className="p-8">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="relative">
              <ShieldCheck className="h-16 w-16 text-emerald agent-running" />
              <Loader2 className="h-6 w-6 text-emerald absolute -bottom-1 -right-1 animate-spin" />
            </div>
            <h3 className="text-lg font-semibold mt-4">Quality Checker Agent Running</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-md">
              Validating corrections for compliance and completeness before resubmission...
            </p>
            <Progress className="w-64 mt-4" value={30} />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!hasCorrection) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-8">
          <div className="flex flex-col items-center justify-center text-center text-muted-foreground">
            <Info className="h-12 w-12 mb-3 opacity-50" />
            <h3 className="text-lg font-medium">Generate Corrections First</h3>
            <p className="text-sm mt-1">Corrections must be generated before quality check</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!qualityCheck) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-8">
          <div className="flex flex-col items-center justify-center text-center text-muted-foreground">
            <ShieldCheck className="h-12 w-12 mb-3 opacity-50" />
            <h3 className="text-lg font-medium">No Quality Check Yet</h3>
            <p className="text-sm mt-1">Click &quot;Run Quality Checker&quot; to validate corrections</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const resultIcon = qualityCheck.overallResult === 'pass' ? (
    <CheckCircle2 className="h-8 w-8 text-emerald-400" />
  ) : qualityCheck.overallResult === 'fail' ? (
    <XCircle className="h-8 w-8 text-red-400" />
  ) : (
    <AlertTriangle className="h-8 w-8 text-yellow-400" />
  );

  return (
    <div className="space-y-4">
      {/* Overall Result */}
      <Card className={`border-${qualityCheck.overallResult === 'pass' ? 'emerald' : qualityCheck.overallResult === 'fail' ? 'red-500' : 'yellow-500'}/20 bg-card`}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald" /> Quality Check Result
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-4">
            {resultIcon}
            <div>
              <span className={`text-2xl font-bold ${RESULT_COLORS[qualityCheck.overallResult]}`}>
                {qualityCheck.overallResult.toUpperCase()}
              </span>
              <p className="text-sm text-muted-foreground">Overall Result</p>
            </div>
            <div className="ml-auto text-right">
              <span className="text-lg font-bold text-emerald-400">{(qualityCheck.confidenceScore * 100).toFixed(0)}%</span>
              <p className="text-xs text-muted-foreground">Confidence</p>
            </div>
          </div>

          <div className="rounded-lg p-4 border" style={{
            backgroundColor: qualityCheck.overallResult === 'pass' ? 'oklch(0.2 0.05 160 / 0.2)' : qualityCheck.overallResult === 'fail' ? 'oklch(0.2 0.05 25 / 0.2)' : 'oklch(0.2 0.05 90 / 0.2)',
            borderColor: qualityCheck.overallResult === 'pass' ? 'oklch(0.65 0.18 160 / 0.3)' : qualityCheck.overallResult === 'fail' ? 'oklch(0.65 0.2 25 / 0.3)' : 'oklch(0.65 0.15 90 / 0.3)',
          }}>
            <span className="text-xs text-muted-foreground block">Recommendation</span>
            <p className="text-sm font-medium text-foreground mt-1">
              {qualityCheck.recommendation === 'approve_for_review' ? '✓ Approve for Review' :
               qualityCheck.recommendation === 'return_for_correction' ? '↩ Return for Correction' :
               'ℹ Request More Information'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Validation Findings */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Validation Findings</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="space-y-2">
            {qualityCheck.validationFindings.map((finding, idx) => (
              <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-secondary">
                {finding.result === 'pass' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                ) : finding.result === 'fail' ? (
                  <XCircle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                )}
                <div>
                  <p className="text-sm font-medium text-foreground">{finding.check}</p>
                  <p className="text-xs text-muted-foreground">{finding.details}</p>
                </div>
                <Badge variant="outline" className={RESULT_COLORS[finding.result] === 'text-emerald-400' ? 'bg-emerald/10 text-emerald-400 border-emerald/30 ml-auto' : RESULT_COLORS[finding.result] === 'text-red-400' ? 'bg-red-500/10 text-red-400 border-red-500/30 ml-auto' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30 ml-auto'}>
                  {finding.result}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Blocking Issues */}
      {qualityCheck.blockingIssues.length > 0 && (
        <Card className="border-red-500/20 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2 text-red-400">
              <XCircle className="h-4 w-4" /> Blocking Issues
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-3">
              {qualityCheck.blockingIssues.map((issue, idx) => (
                <div key={idx} className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                  <p className="text-sm font-medium text-foreground">{issue.issue}</p>
                  <p className="text-xs text-muted-foreground mt-1">Resolution: {issue.requiredResolution}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Warnings */}
      {qualityCheck.warnings.length > 0 && (
        <Card className="border-yellow-500/20 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2 text-yellow-400">
              <AlertTriangle className="h-4 w-4" /> Warnings
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-3">
              {qualityCheck.warnings.map((warning, idx) => (
                <div key={idx} className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3">
                  <p className="text-sm font-medium text-foreground">{warning.warning}</p>
                  <p className="text-xs text-muted-foreground mt-1">Action: {warning.recommendedAction}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
