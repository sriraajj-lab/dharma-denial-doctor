'use client';

import { useState, useEffect } from 'react';
import { Trophy, TrendingUp, TrendingDown, Minus, Loader2, Award, Target } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

export function StaffMetricsView() {
  const [metrics, setMetrics] = useState<any[]>([]);
  const [team, setTeam] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, []);
  async function fetchData() { setLoading(true); try { const res = await fetch('/api/dashboard?view=staff-metrics'); const data = await res.json(); setMetrics(data.metrics || []); setTeam(data.team || null); } catch {} finally { setLoading(false); } }

  const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const trendIcon = (t: string) => t === 'up' ? <TrendingUp className="h-3 w-3 text-emerald-400" /> : t === 'down' ? <TrendingDown className="h-3 w-3 text-red-400" /> : <Minus className="h-3 w-3 text-gray-400" />;

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3"><Trophy className="h-6 w-6 text-amber-400" /><div><h2 className="text-xl font-bold text-foreground">Staff Performance</h2><p className="text-sm text-muted-foreground">Productivity, recovery, and quality metrics per team member</p></div></div>

      {team && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card className="border-border bg-card"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-foreground">{team.totalClaimsWorked}</p><p className="text-xs text-muted-foreground">Claims Worked</p></CardContent></Card>
            <Card className="border-emerald-500/30 bg-emerald-500/5"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-emerald-400">{fmt(team.totalRecovered)}</p><p className="text-xs text-emerald-400">Recovered</p></CardContent></Card>
            <Card className="border-blue-500/30 bg-blue-500/5"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-blue-400">{team.avgSuccessRate}%</p><p className="text-xs text-blue-400">Success Rate</p></CardContent></Card>
            <Card className="border-purple-500/30 bg-purple-500/5"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-purple-400">{team.avgDaysToResolve}d</p><p className="text-xs text-purple-400">Avg Resolution</p></CardContent></Card>
            <Card className="border-amber-500/30 bg-amber-500/5"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-amber-400">{team.topPerformer?.split(' ')[0]}</p><p className="text-xs text-amber-400">Top Performer</p></CardContent></Card>
          </div>
          <Card className="border-border bg-card"><CardContent className="p-4"><div className="flex items-center justify-between mb-2"><div className="flex items-center gap-2"><Target className="h-4 w-4 text-primary" /><span className="text-sm font-medium text-foreground">Monthly Recovery Goal</span></div><span className="text-sm font-bold text-primary">{team.teamGoalProgress}%</span></div><Progress value={team.teamGoalProgress} className="h-3" /></CardContent></Card>
        </div>
      )}

      <Card className="border-border bg-card">
        <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><Award className="h-4 w-4 text-amber-400" /> Leaderboard</CardTitle></CardHeader>
        <CardContent className="p-4">
          <div className="space-y-3">
            {metrics.map((m: any) => (
              <div key={m.userId} className={`rounded-lg border p-4 ${m.rank === 1 ? 'border-amber-500/40 bg-amber-500/5' : m.rank === 2 ? 'border-gray-400/30 bg-gray-400/5' : m.rank === 3 ? 'border-orange-600/30 bg-orange-600/5' : 'border-border'}`}>
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${m.rank === 1 ? 'bg-amber-500/20 text-amber-400' : m.rank === 2 ? 'bg-gray-400/20 text-gray-300' : m.rank === 3 ? 'bg-orange-600/20 text-orange-400' : 'bg-muted text-muted-foreground'}`}>#{m.rank}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2"><span className="text-sm font-semibold text-foreground">{m.userName}</span><Badge variant="outline" className="text-[9px]">{m.role}</Badge>{trendIcon(m.trend)}{m.streak >= 3 && <span className="text-[10px] text-orange-400">🔥 {m.streak}d</span>}</div>
                    {m.badges.length > 0 && <div className="flex gap-1 mt-1">{m.badges.slice(0, 4).map((b: any) => <span key={b.id} className="text-xs" title={b.description}>{b.icon}</span>)}</div>}
                  </div>
                  <div className="grid grid-cols-4 gap-4 text-center hidden md:grid">
                    <div><p className="text-sm font-bold text-foreground">{m.claimsWorked}</p><p className="text-[10px] text-muted-foreground">Claims</p></div>
                    <div><p className="text-sm font-bold text-emerald-400">{fmt(m.totalRecovered)}</p><p className="text-[10px] text-muted-foreground">Recovered</p></div>
                    <div><p className="text-sm font-bold text-blue-400">{m.successRate}%</p><p className="text-[10px] text-muted-foreground">Success</p></div>
                    <div><p className="text-sm font-bold text-purple-400">{m.avgDaysToResolve}d</p><p className="text-[10px] text-muted-foreground">Avg Days</p></div>
                  </div>
                  <div className="text-center flex-shrink-0"><p className={`text-2xl font-bold ${m.productivityScore >= 70 ? 'text-emerald-400' : m.productivityScore >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{m.productivityScore}</p><p className="text-[10px] text-muted-foreground">Score</p></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
