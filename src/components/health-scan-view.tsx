'use client';

import { useState } from 'react';
import { HeartPulse, TrendingUp, TrendingDown, Loader2, FileText, AlertTriangle, CheckCircle2, Target, BarChart3, Users, Clock, Shield, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

export function HealthScanView() {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [clientName, setClientName] = useState('');
  const [totalClaims, setTotalClaims] = useState('');

  async function runScan() {
    setLoading(true);
    try {
      const res = await fetch('/api/health-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientName: clientName || 'Client Practice', totalClaimsSubmitted: totalClaims ? parseInt(totalClaims) : undefined }),
      });
      const data = await res.json();
      setReport(data.report);
    } catch {} finally { setLoading(false); }
  }

  const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const gradeColor = (grade: string) => {
    if (grade.startsWith('A')) return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
    if (grade.startsWith('B')) return 'text-blue-400 border-blue-500/30 bg-blue-500/10';
    if (grade.startsWith('C')) return 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10';
    if (grade === 'D') return 'text-orange-400 border-orange-500/30 bg-orange-500/10';
    return 'text-red-400 border-red-500/30 bg-red-500/10';
  };

  if (!report) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3"><HeartPulse className="h-6 w-6 text-rose-400" /><div><h2 className="text-xl font-bold text-foreground">Client Health Scan</h2><p className="text-sm text-muted-foreground">Comprehensive practice health assessment with scoring, benchmarks, and improvement plan</p></div></div>

        <Card className="border-border bg-card max-w-lg">
          <CardContent className="p-6 space-y-4">
            <div><label className="text-xs text-muted-foreground block mb-1">Client/Practice Name</label><input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="e.g., ABC Orthopedics" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Total Claims Submitted (optional, for accurate denial rate)</label><input type="number" value={totalClaims} onChange={(e) => setTotalClaims(e.target.value)} placeholder="e.g., 5000" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></div>
            <Button onClick={runScan} disabled={loading} className="w-full bg-rose-600 hover:bg-rose-700 text-white">
              {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating Report...</> : <><HeartPulse className="h-4 w-4 mr-2" /> Generate Health Scan</>}
            </Button>
            <p className="text-[11px] text-muted-foreground">Analyzes all uploaded denial data against industry benchmarks to produce a comprehensive health report.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3"><HeartPulse className="h-6 w-6 text-rose-400" /><div><h2 className="text-xl font-bold text-foreground">Health Scan: {report.clientName}</h2><p className="text-sm text-muted-foreground">Generated {new Date(report.generatedAt).toLocaleDateString()}</p></div></div>
        <Button onClick={() => setReport(null)} variant="outline" size="sm">New Scan</Button>
      </div>

      {/* Overall Score */}
      <Card className="border-border bg-card">
        <CardContent className="p-6">
          <div className="flex items-center gap-8">
            <div className="text-center">
              <div className={`text-6xl font-black ${report.overallColor}`}>{report.overallScore}</div>
              <div className="text-xs text-muted-foreground mt-1">out of 100</div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <span className={`text-3xl font-bold px-3 py-1 rounded-lg border ${gradeColor(report.overallGrade)}`}>{report.overallGrade}</span>
                <span className={`text-lg font-semibold ${report.overallColor}`}>{report.overallLabel}</span>
              </div>
              <p className="text-sm text-foreground/80">{report.executiveSummary}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 5 Dimensions */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {Object.entries(report.dimensions).map(([key, dim]: [string, any]) => (
          <Card key={key} className="border-border bg-card">
            <CardContent className="p-4 text-center">
              <p className={`text-2xl font-bold ${dim.score >= 70 ? 'text-emerald-400' : dim.score >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{dim.score}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
              <Badge variant="outline" className={`mt-2 text-[9px] ${gradeColor(dim.grade)}`}>{dim.grade}</Badge>
              <div className="mt-2 flex items-center justify-center gap-1 text-[10px]">
                {dim.status === 'above' ? <TrendingUp className="h-3 w-3 text-emerald-400" /> : <TrendingDown className="h-3 w-3 text-red-400" />}
                <span className="text-muted-foreground">vs {dim.benchmark}% avg</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border bg-card"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-foreground">{report.metrics.denialRate}%</p><p className="text-xs text-muted-foreground">Denial Rate</p><p className="text-[10px] text-muted-foreground">(Industry: 12%)</p></CardContent></Card>
        <Card className="border-border bg-card"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-emerald-400">{fmt(report.metrics.estimatedRecoverable)}</p><p className="text-xs text-emerald-400">Recoverable</p></CardContent></Card>
        <Card className="border-border bg-card"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-orange-400">{report.metrics.preventablePercentage}%</p><p className="text-xs text-orange-400">Preventable</p></CardContent></Card>
        <Card className="border-border bg-card"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-foreground">{report.metrics.avgDaysToResolve}d</p><p className="text-xs text-muted-foreground">Avg Resolution</p><p className="text-[10px] text-muted-foreground">(Industry: 30d)</p></CardContent></Card>
      </div>

      {/* Key Findings */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-400" /> Key Findings</CardTitle></CardHeader>
        <CardContent className="p-4"><ul className="space-y-2">{report.keyFindings.map((f: string, i: number) => <li key={i} className="flex items-start gap-2 text-sm text-foreground/80"><span className="text-amber-400 mt-0.5">•</span>{f}</li>)}</ul></CardContent>
      </Card>

      {/* Payer Report Card */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Payer Report Card</CardTitle></CardHeader>
        <CardContent className="p-4">
          <div className="space-y-2">
            {report.payerGrades.map((p: any) => (
              <div key={p.payerName} className="flex items-center justify-between p-3 rounded-lg bg-secondary">
                <div className="flex items-center gap-3">
                  <span className={`text-lg font-bold w-8 text-center ${gradeColor(p.grade).split(' ')[0]}`}>{p.grade}</span>
                  <div><p className="text-sm font-medium text-foreground">{p.payerName}</p><p className="text-[11px] text-muted-foreground">{p.denialCount} denials · {fmt(p.denialAmount)} · Top: {p.topDenialReason}</p></div>
                </div>
                <div className="text-right hidden md:block"><p className="text-xs text-muted-foreground">{p.denialRate}% denial rate · {p.avgDaysToResolve}d avg</p><p className="text-[10px] text-muted-foreground italic">{p.recommendation}</p></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Preventable Analysis */}
      <Card className="border-orange-500/20 bg-card">
        <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><Shield className="h-4 w-4 text-orange-400" /> Preventable Denial Analysis</CardTitle></CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center"><p className="text-2xl font-bold text-orange-400">{report.preventableAnalysis.preventablePercentage}%</p><p className="text-xs text-muted-foreground">Were Preventable</p></div>
            <div className="text-center"><p className="text-2xl font-bold text-orange-400">{report.preventableAnalysis.preventableCount}</p><p className="text-xs text-muted-foreground">Claims</p></div>
            <div className="text-center"><p className="text-2xl font-bold text-orange-400">{fmt(report.preventableAnalysis.preventableAmount)}</p><p className="text-xs text-muted-foreground">Lost Revenue</p></div>
          </div>
          <div><p className="text-xs text-muted-foreground mb-2">Root Causes:</p>
            {report.preventableAnalysis.rootCauses.slice(0, 5).map((r: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                <span className="text-sm text-foreground capitalize">{r.cause.replace('_', ' ')}</span>
                <div className="flex items-center gap-3"><span className="text-xs text-muted-foreground">{r.count} claims</span><span className="text-xs font-bold text-foreground">{r.percentage}%</span></div>
              </div>
            ))}
          </div>
          <div><p className="text-xs text-muted-foreground mb-2">Prevention Recommendations:</p><ul className="space-y-1">{report.preventableAnalysis.preventionRecommendations.map((r: string, i: number) => <li key={i} className="text-xs text-foreground/80 flex items-start gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-400 mt-0.5 flex-shrink-0" />{r}</li>)}</ul></div>
        </CardContent>
      </Card>

      {/* Improvement Plan */}
      <Card className="border-emerald-500/20 bg-card">
        <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><Target className="h-4 w-4 text-emerald-400" /> Improvement Plan</CardTitle></CardHeader>
        <CardContent className="p-4">
          <div className="space-y-3">
            {report.improvementPlan.map((action: any) => (
              <div key={action.priority} className="rounded-lg bg-secondary p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">{action.priority}</div>
                    <div>
                      <div className="flex items-center gap-2"><span className="text-sm font-medium text-foreground">{action.action}</span><Badge variant="outline" className="text-[9px]">{action.category}</Badge></div>
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1"><Zap className="h-3 w-3" />{action.expectedImpact}</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{action.timeframe}</span>
                        <Badge variant="outline" className={`text-[9px] ${action.difficulty === 'easy' ? 'text-emerald-400 border-emerald-500/30' : action.difficulty === 'hard' ? 'text-red-400 border-red-500/30' : 'text-yellow-400 border-yellow-500/30'}`}>{action.difficulty}</Badge>
                      </div>
                    </div>
                  </div>
                  {action.estimatedRecovery > 0 && <span className="text-sm font-bold text-emerald-400 flex-shrink-0">{fmt(action.estimatedRecovery)}</span>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
