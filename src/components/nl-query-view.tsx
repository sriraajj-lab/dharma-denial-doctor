'use client';

import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Search, Sparkles, ArrowRight, Loader2, FileText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const SUGGESTIONS = ['Show me all Aetna denials over $1000', 'Correctable denials from last month', 'Top 10 highest value claims', 'UHC coding errors', 'Critical priority needing appeal', 'Medicare medical necessity over $5000', 'Bundling denials for Blue Cross', 'Cigna authorization that are correctable'];
const STATUS_COLORS: Record<string, string> = { New: 'text-blue-400', Analyzed: 'text-yellow-400', Corrected: 'text-orange-400', Reviewed: 'text-purple-400', Resubmitted: 'text-green-400', Closed: 'text-gray-400' };

export function NLQueryView() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const { navigateToDenial } = useAppStore();

  async function runQuery(q?: string) {
    const searchQuery = q || query;
    if (!searchQuery.trim()) return;
    setLoading(true); setShowSuggestions(false); setQuery(searchQuery);
    try { const res = await fetch(`/api/dashboard?view=nl-query&q=${encodeURIComponent(searchQuery)}`); setResult(await res.json()); } catch {} finally { setLoading(false); }
  }

  const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3"><Sparkles className="h-6 w-6 text-violet-400" /><div><h2 className="text-xl font-bold text-foreground">Natural Language Search</h2><p className="text-sm text-muted-foreground">Ask questions in plain English about your denials</p></div></div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && runQuery()} onFocus={() => !result && setShowSuggestions(true)} placeholder="e.g., Show me all Aetna denials over $1000 that are correctable..." className="w-full rounded-lg border border-border bg-background pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-primary focus:border-primary" />
        </div>
        <button onClick={() => runQuery()} disabled={loading || !query.trim()} className="px-6 py-3 rounded-lg bg-violet-600 text-white font-medium text-sm hover:bg-violet-700 disabled:opacity-50 flex items-center gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Search
        </button>
      </div>

      {showSuggestions && !result && (
        <Card className="border-border bg-card"><CardContent className="p-4"><p className="text-xs text-muted-foreground mb-3">Try these:</p><div className="flex flex-wrap gap-2">{SUGGESTIONS.map((s, i) => <button key={i} onClick={() => runQuery(s)} className="text-xs bg-muted hover:bg-muted/80 text-foreground px-3 py-1.5 rounded-full transition-all hover:ring-1 hover:ring-primary/30">{s}</button>)}</div></CardContent></Card>
      )}

      {result && (
        <div className="space-y-4">
          <Card className="border-violet-500/20 bg-violet-500/5"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><Sparkles className="h-4 w-4 text-violet-400" /><span className="text-sm font-medium text-violet-400">Interpreted as:</span></div><p className="text-sm text-foreground">{result.query.interpretation}</p>{result.query.filtersApplied.length > 0 && <div className="flex flex-wrap gap-1 mt-2">{result.query.filtersApplied.map((f: string, i: number) => <Badge key={i} variant="outline" className="text-[10px] text-violet-400 border-violet-500/30">{f}</Badge>)}</div>}</CardContent></Card>

          <div className="flex items-center justify-between"><p className="text-sm text-foreground">{result.summary}</p><button onClick={() => { setResult(null); setShowSuggestions(true); }} className="text-xs text-muted-foreground hover:text-foreground">Clear</button></div>

          {result.results.length === 0 ? (
            <Card className="border-border bg-card"><CardContent className="p-8 text-center"><Search className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" /><p className="text-sm text-muted-foreground">No results. Try a different query.</p></CardContent></Card>
          ) : (
            <div className="space-y-1.5">
              {result.results.slice(0, 25).map((d: any) => (
                <div key={d.id} onClick={() => navigateToDenial(d.id)} className="rounded-lg border border-border p-3 cursor-pointer hover:border-primary/40 transition-all flex items-center gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2"><span className="text-sm font-medium text-foreground">{d.claimNumber}</span><span className={`text-[10px] font-medium ${STATUS_COLORS[d.status] || 'text-gray-400'}`}>{d.status}</span><span className="text-[10px] text-muted-foreground font-mono">{d.carcCode}</span></div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground"><span>{d.patientName}</span><span>·</span><span>{d.payerName}</span><span>·</span><span className="capitalize">{d.denialCategory?.replace('_', ' ')}</span></div>
                  </div>
                  <span className="text-sm font-bold text-foreground">{fmt(d.deniedAmount)}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                </div>
              ))}
              {result.totalCount > 25 && <p className="text-xs text-muted-foreground text-center pt-2">Showing 25 of {result.totalCount}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
