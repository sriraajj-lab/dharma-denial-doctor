'use client';

import { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { CalendarClock, AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const STATUS_STYLES: Record<string, { border: string; badge: string }> = {
  escalated: { border: 'border-red-500/50 bg-red-500/5', badge: 'bg-red-500/20 text-red-400' },
  overdue: { border: 'border-orange-500/40 bg-orange-500/5', badge: 'bg-orange-500/20 text-orange-400' },
  due_today: { border: 'border-yellow-500/40 bg-yellow-500/5', badge: 'bg-yellow-500/20 text-yellow-400' },
  pending: { border: 'border-border', badge: 'bg-blue-500/20 text-blue-400' },
};

export function FollowUpView() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { navigateToDenial } = useAppStore();

  useEffect(() => { fetchData(); }, []);
  async function fetchData() { setLoading(true); try { const res = await fetch('/api/dashboard?view=followup'); const data = await res.json(); setTasks(data.tasks || []); setSummary(data.summary || null); } catch {} finally { setLoading(false); } }

  const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3"><CalendarClock className="h-6 w-6 text-primary" /><div><h2 className="text-xl font-bold text-foreground">Follow-up Tracking</h2><p className="text-sm text-muted-foreground">Automated 14/30/45/60-day cadence after resubmission</p></div></div>
        <Button onClick={fetchData} variant="outline" size="sm"><RefreshCw className="h-4 w-4 mr-1" /> Refresh</Button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="border-border bg-card"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-foreground">{summary.totalActive}</p><p className="text-xs text-muted-foreground">Active</p></CardContent></Card>
          <Card className="border-yellow-500/30 bg-yellow-500/5"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-yellow-400">{summary.dueTodayCount}</p><p className="text-xs text-yellow-400">Due Today</p></CardContent></Card>
          <Card className="border-orange-500/30 bg-orange-500/5"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-orange-400">{summary.overdueCount}</p><p className="text-xs text-orange-400">Overdue</p></CardContent></Card>
          <Card className="border-red-500/30 bg-red-500/5"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-red-400">{summary.escalatedCount}</p><p className="text-xs text-red-400">Escalated</p></CardContent></Card>
          <Card className="border-emerald-500/30 bg-emerald-500/5"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-emerald-400">{fmt(summary.totalPendingAmount)}</p><p className="text-xs text-emerald-400">Pending $</p></CardContent></Card>
        </div>
      )}

      {tasks.length === 0 ? (
        <Card className="border-emerald-500/30 bg-emerald-500/5"><CardContent className="p-8 text-center"><CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto mb-3" /><h3 className="text-lg font-medium text-emerald-400">No Follow-ups Due</h3><p className="text-sm text-muted-foreground mt-1">Claims enter tracking after resubmission.</p></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {tasks.map((task: any) => {
            const style = STATUS_STYLES[task.status] || STATUS_STYLES.pending;
            return (
              <div key={task.id} className={`rounded-lg border p-4 cursor-pointer hover:border-primary/40 transition-all ${style.border}`} onClick={() => navigateToDenial(task.denialId)}>
                <div className="flex items-start gap-3">
                  {task.status === 'escalated' ? <XCircle className="h-4 w-4 text-red-400 mt-0.5" /> : task.status === 'overdue' ? <AlertTriangle className="h-4 w-4 text-orange-400 mt-0.5" /> : <Clock className="h-4 w-4 text-blue-400 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2"><span className="text-sm font-semibold text-foreground">{task.claimNumber}</span><Badge variant="outline" className={`text-[9px] ${style.badge}`}>{task.status.replace('_', ' ')}</Badge><Badge variant="outline" className="text-[9px] bg-muted text-muted-foreground">{task.cadenceStep.replace('_', ' ')}</Badge></div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground"><span>{task.patientName}</span><span>·</span><span>{task.payerName}</span><span>·</span><span>{task.daysSinceResubmission}d since resubmission</span></div>
                    <p className="text-xs text-foreground/80 mt-1.5 bg-muted/50 rounded px-2 py-1">{task.action}</p>
                  </div>
                  <div className="text-right flex-shrink-0"><p className="text-sm font-bold text-foreground">{fmt(task.deniedAmount)}</p><p className="text-[10px] text-muted-foreground">Due: {new Date(task.dueDate).toLocaleDateString()}</p></div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
