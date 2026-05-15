'use client';

import { useState, useEffect } from 'react';
import { ShieldCheck, Play, AlertTriangle, CheckCircle2, XCircle, Info } from 'lucide-react';

interface ScrubResult {
  id: string;
  denialId?: string;
  claimNumber?: string;
  ruleName: string;
  ruleType: string;
  severity: string;
  finding: string;
  suggestion?: string;
  status: string;
}

interface ScrubSummary {
  totalClaims: number;
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  results: ScrubResult[];
}

export function ScrubView() {
  const [summary, setSummary] = useState<ScrubSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  async function runScrub() {
    setLoading(true);
    try {
      const res = await fetch('/api/scrub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setSummary(data);
      setHasRun(true);
    } catch (err) {
      console.error('Scrub failed:', err);
    } finally {
      setLoading(false);
    }
  }

  async function resolveResult(resultId: string) {
    try {
      await fetch('/api/scrub', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resultId, status: 'resolved' }),
      });
      if (summary) {
        setSummary({
          ...summary,
          results: summary.results.map((r) =>
            r.id === resultId ? { ...r, status: 'resolved' } : r
          ),
        });
      }
    } catch (err) {
      console.error('Failed to resolve:', err);
    }
  }

  const severityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'high': return <AlertTriangle className="h-4 w-4 text-orange-400" />;
      case 'medium': return <AlertTriangle className="h-4 w-4 text-yellow-400" />;
      case 'low': return <Info className="h-4 w-4 text-blue-400" />;
      default: return <Info className="h-4 w-4 text-gray-400" />;
    }
  };

  const severityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'border-red-500/30 bg-red-500/5';
      case 'high': return 'border-orange-500/30 bg-orange-500/5';
      case 'medium': return 'border-yellow-500/30 bg-yellow-500/5';
      case 'low': return 'border-blue-500/30 bg-blue-500/5';
      default: return 'border-border';
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-xl font-bold text-foreground">Denial Prevention - Claim Scrub</h2>
            <p className="text-sm text-muted-foreground">Pre-submission validation to catch common denial triggers</p>
          </div>
        </div>
        <button
          onClick={runScrub}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          <Play className="h-4 w-4" />
          {loading ? 'Running Scrub...' : 'Run Full Scrub'}
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="rounded-lg border border-border bg-card p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{summary.totalClaims}</p>
            <p className="text-xs text-muted-foreground">Claims Scanned</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{summary.totalFindings}</p>
            <p className="text-xs text-muted-foreground">Total Findings</p>
          </div>
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-center">
            <p className="text-2xl font-bold text-red-400">{summary.criticalCount}</p>
            <p className="text-xs text-red-400">Critical</p>
          </div>
          <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-4 text-center">
            <p className="text-2xl font-bold text-orange-400">{summary.highCount}</p>
            <p className="text-xs text-orange-400">High</p>
          </div>
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4 text-center">
            <p className="text-2xl font-bold text-yellow-400">{summary.mediumCount + summary.lowCount}</p>
            <p className="text-xs text-yellow-400">Medium/Low</p>
          </div>
        </div>
      )}

      {/* Results */}
      {!hasRun ? (
        <div className="text-center py-16">
          <ShieldCheck className="h-16 w-16 text-muted-foreground/20 mx-auto mb-4" />
          <p className="text-muted-foreground">Click &quot;Run Full Scrub&quot; to validate all claims against denial prevention rules</p>
          <p className="text-xs text-muted-foreground mt-2">Checks: CCI bundling, modifier requirements, auth rules, NCD/LCD, demographics</p>
        </div>
      ) : summary && summary.results.length > 0 ? (
        <div className="space-y-3">
          {summary.results
            .sort((a, b) => {
              const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
              return (order[a.severity] || 4) - (order[b.severity] || 4);
            })
            .map((result) => (
              <div
                key={result.id}
                className={`rounded-lg border p-4 ${severityColor(result.severity)} ${result.status === 'resolved' ? 'opacity-50' : ''}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {severityIcon(result.severity)}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{result.ruleName}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{result.ruleType}</span>
                      </div>
                      <p className="text-sm text-foreground/80">{result.finding}</p>
                      {result.suggestion && (
                        <p className="text-xs text-muted-foreground italic">Suggestion: {result.suggestion}</p>
                      )}
                      {result.claimNumber && (
                        <p className="text-xs text-muted-foreground">Claim: {result.claimNumber}</p>
                      )}
                    </div>
                  </div>
                  {result.status !== 'resolved' && (
                    <button
                      onClick={() => resolveResult(result.id)}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                    >
                      <CheckCircle2 className="h-3 w-3" /> Resolve
                    </button>
                  )}
                  {result.status === 'resolved' && (
                    <span className="text-xs text-emerald-400">Resolved</span>
                  )}
                </div>
              </div>
            ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto mb-3" />
          <p className="text-emerald-400 font-medium">All Clear!</p>
          <p className="text-xs text-muted-foreground mt-1">No issues found in the current claims</p>
        </div>
      )}
    </div>
  );
}
