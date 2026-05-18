/**
 * Staff Performance Metrics & Gamification
 */
import { getDenials } from './data';
import { getUsers } from './auth';

const BADGES = [
  { id: 'speed_demon', name: 'Speed Demon', icon: '⚡', description: '10+ claims in one day', check: (m: any) => m.claimsWorkedToday >= 10 },
  { id: 'money_maker', name: 'Money Maker', icon: '💰', description: '$50k+ recovered this month', check: (m: any) => m.recoveredThisMonth >= 50000 },
  { id: 'quality_king', name: 'Quality King', icon: '👑', description: '95%+ quality pass rate', check: (m: any) => m.qualityPassRate >= 95 },
  { id: 'century_club', name: 'Century Club', icon: '💯', description: '100+ claims worked', check: (m: any) => m.claimsWorked >= 100 },
  { id: 'high_roller', name: 'High Roller', icon: '🎯', description: '85%+ success rate', check: (m: any) => m.successRate >= 85 },
  { id: 'streak_master', name: 'Streak Master', icon: '🔥', description: '10+ day streak', check: (m: any) => m.streak >= 10 },
];

export async function getStaffMetrics() {
  const users = getUsers();
  const denials = await getDenials();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay());

  const staffUsers = users.filter(u => u.role !== 'client');
  const metrics = staffUsers.map((user, idx) => {
    const staffCount = staffUsers.length;
    const assigned = denials.filter((_, i) => i % staffCount === idx);
    const worked = assigned.filter(d => d.status !== 'New');
    const resolved = assigned.filter(d => ['Resubmitted', 'Closed'].includes(d.status));
    const thisMonth = worked.filter(d => new Date(d.updatedAt) >= startOfMonth);
    const thisWeek = worked.filter(d => new Date(d.updatedAt) >= startOfWeek);

    const totalRecovered = resolved.reduce((s, d) => s + d.deniedAmount * 0.65, 0);
    const recoveredThisMonth = resolved.filter(d => new Date(d.updatedAt) >= startOfMonth).reduce((s, d) => s + d.deniedAmount * 0.65, 0);
    const avgDaysToResolve = resolved.length > 0 ? Math.round(resolved.reduce((s, d) => s + (new Date(d.updatedAt).getTime() - new Date(d.createdAt).getTime()) / (1000 * 60 * 60 * 24), 0) / resolved.length) : 0;
    const qc = assigned.filter(d => d.qualityCheck);
    const qualityPassRate = qc.length > 0 ? Math.round((qc.filter(d => d.qualityCheck?.overallResult === 'pass').length / qc.length) * 100) : 100;
    const successRate = worked.length > 0 ? Math.round((resolved.length / worked.length) * 100) : 0;
    const streak = thisWeek.length > 0 ? Math.min(thisWeek.length, 7) : 0;
    const productivityScore = Math.round((Math.min(100, (worked.length / Math.max(denials.length / staffCount, 1)) * 100) * 0.3) + (Math.min(100, (totalRecovered / 50000) * 100) * 0.3) + (avgDaysToResolve > 0 ? Math.min(100, (30 / avgDaysToResolve) * 50) : 50) * 0.2 + qualityPassRate * 0.2);

    const m: any = { userId: user.id, userName: user.name || user.email, role: user.role, rank: 0, claimsWorked: worked.length, claimsWorkedThisWeek: thisWeek.length, claimsWorkedToday: 0, totalRecovered, recoveredThisMonth, avgDaysToResolve, qualityPassRate, successRate, productivityScore, streak, badges: [] as any[], trend: recoveredThisMonth > totalRecovered * 0.3 ? 'up' : 'stable' };
    m.badges = BADGES.filter(b => b.check(m)).map(b => ({ id: b.id, name: b.name, icon: b.icon, description: b.description, earnedAt: now.toISOString() }));
    return m;
  });

  metrics.sort((a: any, b: any) => b.productivityScore - a.productivityScore);
  metrics.forEach((m: any, i: number) => { m.rank = i + 1; });

  const team = {
    totalClaimsWorked: metrics.reduce((s: number, m: any) => s + m.claimsWorked, 0),
    totalRecovered: metrics.reduce((s: number, m: any) => s + m.totalRecovered, 0),
    avgProductivityScore: metrics.length > 0 ? Math.round(metrics.reduce((s: number, m: any) => s + m.productivityScore, 0) / metrics.length) : 0,
    avgSuccessRate: metrics.length > 0 ? Math.round(metrics.reduce((s: number, m: any) => s + m.successRate, 0) / metrics.length) : 0,
    avgDaysToResolve: metrics.length > 0 ? Math.round(metrics.reduce((s: number, m: any) => s + m.avgDaysToResolve, 0) / metrics.length) : 0,
    topPerformer: metrics.length > 0 ? metrics[0].userName : 'N/A',
    teamGoalProgress: Math.min(100, Math.round((metrics.reduce((s: number, m: any) => s + m.recoveredThisMonth, 0) / 100000) * 100)),
    monthlyGoal: 100000,
  };

  return { metrics, team };
}
