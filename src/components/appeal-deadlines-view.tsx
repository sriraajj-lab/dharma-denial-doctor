'use client';

import { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { Timer, AlertTriangle, XCircle, CheckCircle2, Gavel, Loader2, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const URGENCY_STYLES: Record<string, string> = { expired: 'border-red-500/50 bg-red-500/10', critical: 'border-red-500/40 bg-red-500/5', urgent: 'border-orange-500/40 bg-orange-500/5', warning: 'border-yellow-500/30 bg-yellow-500/5', normal: 'border-blue-500/20 bg-blue-500/5', safe: 'border-border' };
const URGENCY_TEXT: Record<string, string> = { expired: 'text-red-400', critical: 'text-red-400', urgent: 'text-orange-400', warning: 'text-yellow-400', normal: 'text-blue-400', safe: 'text-emerald-400' };

export function AppealDeadlinesView() {
  const [items, setItems] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { navigateToDenial } = useAppStore();

  useEffect(() => { fetchData(); }, []);
  async function fetchData() { setLoading(true); try { const res = await fetch('/api/dashboard?view=appeal-deadlines'); const data = await res.json(); setItems(data.items || []); setSummary(data.summary || null); } catch {} finally { setLoading(false); } }

  const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3"><Timer className="h-6 w-6 text-red-400" /><div><h2 className="text-xl font-bold text-foreground">Appeal Deadline Countdown</h2><p className="text-sm text-muted-foreground">Auto-escalates when deadlines approach</p></div></div>
        <Button onClick={fetchData} variant="outline" size="sm"><RefreshCw className="h-4 w-4 mr-1" /> Refresh</Button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="border-red-500/30 bg-red-500/5"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-red-400">{summary.expiredCount + summary.criticalCount}</p><p className="text-xs text-red-400">Critical/Expired</p></CardContent></Card>
          <Card className="border-orange-500/30 bg-orange-500/5"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-orange-400">{summary.urgentCount}</p><p className="text-xs text-orange-400">&lt;7 Days</p></CardContent></Card>
          <Card className="border-yellow-500/30 bg-yellow-500/5"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-yellow-400">{summary.warningCount}</p><p className="text-xs text-yellow-400">&lt;14 Days</p></CardContent></Card>
          <Card className="border-border bg-card"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-foreground">{fmt(summary.totalAtRiskAmount)}</p><p className="text-xs text-muted-foreground">$ at Risk</p></CardContent></Card>
          <Card className="border-emerald-500/30 bg-emerald-500/5"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-emerald-400">{summary.appealsFiled}</p><p className="text-xs text-emerald-400">Filed</p></CardContent></Card>
        </div>
      )}

      {items.length === 0 ? (
        <Card className="border-emerald-500/30 bg-emerald-500/5"><CardContent className="p-8 text-center"><CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto mb-3" /><h3 className="text-lg font-medium text-emerald-400">No Urgent Deadlines</h3></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {items.slice(0, 30).map((item: any) => (
            <div key={item.denialId} className={`rounded-lg border p-4 cursor-pointer hover:border-primary/40 transition-all ${URGENCY_STYLES[item.urgency]}`} onClick={() => navigateToDenial(item.denialId)}>
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 w-16 text-center">
                  {item.urgency === 'expired' ? <div><XCircle className="h-6 w-6 text-red-400 mx-auto" /><span className="text-[10px] text-red-400 font-bold">EXPIRED</span></div> : <div><p className={`text-2xl font-bold ${URGENCY_TEXT[item.urgency]}`}>{item.daysRemaining}</p><p className={`text-[10px] ${URGENCY_TEXT[item.urgency]}`}>days</p></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{item.claimNumber}</span>
                    {item.hasAppealFiled && <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30"><Gavel className="h-2.5 w-2.5 mr-0.5" />Filed</Badge>}
                    {item.escalationLevel !== 'none' && <Badge variant="outline" className="text-[9px] bg-red-500/10 text-red-400 border-red-500/30">{item.escalationLevel}</Badge>}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground"><span>{item.patientName}</span><span>·</span><span>{item.payerName}</span><span>·</span><span className="font-mono">{item.carcCode}</span></div>
                  {item.escalationMessage && <p className="text-[11px] text-red-400 mt-1 font-medium">{item.escalationMessage}</p>}
                  <p className="text-[11px] text-muted-foreground mt-1 bg-muted/50 rounded px-2 py-1">{item.recommendedAction}</p>
                </div>
                <div className="text-right flex-shrink-0"><p className="text-sm font-bold text-foreground">{fmt(item.deniedAmount)}</p><p className="text-[10px] text-muted-foreground">{new Date(item.appealDeadline).toLocaleDateString()}</p></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
