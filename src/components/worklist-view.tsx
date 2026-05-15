'use client';

import { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { Target, ChevronRight, Loader2, Filter, Zap, Award, Activity } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const RISK_COLORS: Record<string, string> = { critical: 'border-red-500/50 bg-red-500/5', high: 'border-orange-500/40 bg-orange-500/5', medium: 'border-yellow-500/30 bg-yellow-500/5', low: 'border-border' };
const RISK_BADGE: Record<string, string> = { critical: 'bg-red-500/20 text-red-400 border-red-500/30', high: 'bg-orange-500/20 text-orange-400 border-orange-500/30', medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', low: 'bg-gray-500/20 text-gray-400 border-gray-500/30' };

export function WorklistView() {
  const [items, setItems] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [payerFilter, setPayerFilter] = useState('');
  const { navigateToDenial } = useAppStore();

  useEffect(() => { fetchWorklist(); }, [categoryFilter, payerFilter]);

  async function fetchWorklist() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ view: 'worklist', maxItems: '50' });
      if (categoryFilter) params.set('category', categoryFilter);
      if (payerFilter) params.set('payerName', payerFilter);
      const res = await fetch(`/api/dashboard?${params}`);
      const data = await res.json();
      setItems(data.items || []); setSummary(data.summary || null);
    } catch {} finally { setLoading(false); }
  }

  const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Target className="h-6 w-6 text-primary" />
          <div><h2 className="text-xl font-bold text-foreground">AI-Ranked Worklist</h2><p className="text-sm text-muted-foreground">Optimized work order for maximum revenue recovery per hour</p></div>
        </div>
        <Button onClick={fetchWorklist} variant="outline" size="sm"><Zap className="h-4 w-4 mr-1" /> Refresh</Button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="border-border bg-card"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-foreground">{summary.totalItems}</p><p className="text-xs text-muted-foreground">Active</p></CardContent></Card>
          <Card className="border-emerald-500/30 bg-emerald-500/5"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-emerald-400">{fmt(summary.totalPotentialRevenue)}</p><p className="text-xs text-emerald-400">Potential $</p></CardContent></Card>
          <Card className="border-blue-500/30 bg-blue-500/5"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-blue-400">{summary.avgSuccessRate}%</p><p className="text-xs text-blue-400">Avg Success</p></CardContent></Card>
          <Card className="border-red-500/30 bg-red-500/5"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-red-400">{summary.criticalCount}</p><p className="text-xs text-red-400">Critical</p></CardContent></Card>
          <Card className="border-orange-500/30 bg-orange-500/5"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-orange-400">{summary.itemsApproachingDeadline}</p><p className="text-xs text-orange-400">Deadline &lt;14d</p></CardContent></Card>
        </div>
      )}

      <div className="flex gap-3 items-center">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm">
          <option value="">All Categories</option>
          <option value="coding_error">Coding Error</option><option value="missing_information">Missing Info</option><option value="authorization">Authorization</option><option value="eligibility">Eligibility</option><option value="bundling">Bundling</option><option value="medical_necessity">Medical Necessity</option>
        </select>
        <select value={payerFilter} onChange={(e) => setPayerFilter(e.target.value)} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm">
          <option value="">All Payers</option>
          <option value="UnitedHealthcare">UHC</option><option value="Blue Cross">BCBS</option><option value="Aetna">Aetna</option><option value="Cigna">Cigna</option><option value="Medicare">Medicare</option>
        </select>
      </div>

      {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> : items.length === 0 ? (
        <Card className="border-border bg-card"><CardContent className="p-12 text-center"><Award className="h-12 w-12 text-emerald-400 mx-auto mb-3" /><h3 className="text-lg font-medium text-foreground">All Caught Up!</h3></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {items.map((item: any) => (
            <div key={item.denial.id} className={`rounded-lg border p-4 cursor-pointer hover:border-primary/40 transition-all ${RISK_COLORS[item.riskLevel]}`} onClick={() => navigateToDenial(item.denial.id)}>
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center"><span className="text-sm font-bold text-primary">#{item.rank}</span></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{item.denial.claimNumber}</span>
                    <Badge variant="outline" className={RISK_BADGE[item.riskLevel]}>{item.riskLevel}</Badge>
                    <span className="text-xs text-muted-foreground">{item.denial.patientName}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>{item.denial.payerName}</span><span>·</span><span className="font-mono">{item.denial.carcCode}</span><span>·</span><span className="capitalize">{item.denial.denialCategory.replace('_', ' ')}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">{item.reasons.slice(0, 2).map((r: string, i: number) => <span key={i} className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{r}</span>)}</div>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <div className="text-center hidden md:block"><p className="text-xs text-muted-foreground">Score</p><p className="text-lg font-bold text-primary">{item.workScore}</p></div>
                  <div className="text-center"><p className="text-xs text-muted-foreground">Value</p><p className="text-sm font-bold text-foreground">{fmt(item.denial.deniedAmount)}</p></div>
                  {item.daysUntilDeadline !== null && <div className="text-center"><p className="text-xs text-muted-foreground">Deadline</p><p className={`text-sm font-bold ${item.daysUntilDeadline <= 14 ? 'text-red-400' : 'text-foreground'}`}>{item.daysUntilDeadline}d</p></div>}
                  <span className="text-[10px] bg-primary/10 text-primary px-2 py-1 rounded hidden md:block">{item.recommendedAction}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
