'use client';

import { useState, useEffect } from 'react';
import { ShieldAlert, AlertTriangle, Clock, Loader2, RefreshCw, DollarSign } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const SEVERITY_COLORS: Record<string, string> = { critical: 'border-red-500/50 bg-red-500/5', high: 'border-orange-500/40 bg-orange-500/5', medium: 'border-yellow-500/30 bg-yellow-500/5', low: 'border-blue-500/20 bg-blue-500/5' };

export function PreventionDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchData(); }, []);
  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboard?view=prevention');
      if (!res.ok) {
        throw new Error(`Failed to load prevention data (HTTP ${res.status})`);
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (error) return (
    <div className="flex flex-col items-center justify-center py-12 gap-4">
      <AlertTriangle className="h-10 w-10 text-red-400" />
      <h3 className="text-lg font-semibold text-foreground">Failed to Load Prevention Data</h3>
      <p className="text-sm text-muted-foreground max-w-md text-center">{error}</p>
      <Button onClick={fetchData} variant="outline" size="sm">
        <RefreshCw className="h-4 w-4 mr-1" /> Try Again
      </Button>
    </div>
  );
  if (!data) return null;

  const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3"><ShieldAlert className="h-6 w-6 text-amber-400" /><div><h2 className="text-xl font-bold text-foreground">Denial Prevention Dashboard</h2><p className="text-sm text-muted-foreground">Proactive alerts to catch issues before they become denials</p></div></div>
        <Button onClick={fetchData} variant="outline" size="sm"><RefreshCw className="h-4 w-4 mr-1" /> Re-scan</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="border-red-500/30 bg-red-500/5"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-red-400">{data.totalClaimsAtRisk}</p><p className="text-xs text-red-400">Claims at Risk</p></CardContent></Card>
        <Card className="border-orange-500/30 bg-orange-500/5"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-orange-400">{fmt(data.totalRiskAmount)}</p><p className="text-xs text-orange-400">$ at Risk</p></CardContent></Card>
        <Card className="border-emerald-500/30 bg-emerald-500/5"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-emerald-400">{data.preventionRate}%</p><p className="text-xs text-emerald-400">Preventable Rate</p></CardContent></Card>
        <Card className="border-blue-500/30 bg-blue-500/5"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-blue-400">{fmt(data.estimatedSavings)}</p><p className="text-xs text-blue-400">Could Save</p></CardContent></Card>
        <Card className="border-border bg-card"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-foreground">{data.alerts.length}</p><p className="text-xs text-muted-foreground">Total Alerts</p></CardContent></Card>
      </div>

      <div className="space-y-2">
        {data.alerts.slice(0, 30).map((alert: any) => (
          <div key={alert.id} className={`rounded-lg border p-4 ${SEVERITY_COLORS[alert.severity]}`}>
            <div className="flex items-start gap-3">
              <AlertTriangle className={`h-4 w-4 mt-0.5 ${alert.severity === 'critical' ? 'text-red-400' : alert.severity === 'high' ? 'text-orange-400' : 'text-yellow-400'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-semibold text-foreground">{alert.title}</span>
                  <Badge variant="outline" className={`text-[9px] capitalize ${alert.severity === 'critical' ? 'text-red-400 border-red-500/30' : alert.severity === 'high' ? 'text-orange-400 border-orange-500/30' : 'text-yellow-400 border-yellow-500/30'}`}>{alert.severity}</Badge>
                </div>
                <p className="text-xs text-foreground/80">{alert.description}</p>
                <div className="flex items-center gap-3 mt-1.5">
                  {alert.claimNumber && <span className="text-[10px] font-mono text-muted-foreground">{alert.claimNumber}</span>}
                  {alert.payerName && <span className="text-[10px] text-muted-foreground">{alert.payerName}</span>}
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1"><DollarSign className="h-3 w-3" />{fmt(alert.estimatedRiskAmount)} at risk</span>
                </div>
                <div className="mt-2 rounded bg-muted/50 px-2 py-1.5"><p className="text-[11px] text-muted-foreground"><span className="font-medium text-foreground">Action:</span> {alert.suggestedAction}</p></div>
              </div>
            </div>
          </div>
        ))}
        {data.alerts.length === 0 && (
          <Card className="border-emerald-500/30 bg-emerald-500/5"><CardContent className="p-8 text-center"><ShieldAlert className="h-12 w-12 text-emerald-400 mx-auto mb-3" /><h3 className="text-lg font-medium text-emerald-400">No Alerts</h3><p className="text-sm text-muted-foreground mt-1">All claims look clean</p></CardContent></Card>
        )}
      </div>
    </div>
  );
}
