'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { DashboardStats, Denial } from '@/lib/types';
import {
  DollarSign,
  FileWarning,
  TrendingUp,
  Clock,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

const STATUS_COLORS: Record<string, string> = {
  New: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  Analyzed: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  Corrected: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  Reviewed: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  Resubmitted: 'bg-green-500/20 text-green-400 border-green-500/30',
  Closed: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const CATEGORY_COLORS = [
  '#0d9488', '#0891b2', '#2563eb', '#7c3aed', '#c026d3', '#e11d48', '#ea580c', '#ca8a04', '#16a34a', '#64748b',
];

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-500/20 text-gray-400',
  normal: 'bg-blue-500/20 text-blue-400',
  high: 'bg-orange-500/20 text-orange-400',
  critical: 'bg-red-500/20 text-red-400',
};

export function DashboardView() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { navigateToDenial, setCurrentView } = useAppStore();

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      const res = await fetch('/api/dashboard');
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!stats) return null;

  const kpiCards = [
    {
      title: 'Total Denials',
      value: stats.totalDenials,
      icon: <FileWarning className="h-5 w-5" />,
      color: 'text-red-400',
      bgColor: 'bg-red-500/10',
    },
    {
      title: 'Denied Amount',
      value: `$${stats.totalDeniedAmount.toLocaleString()}`,
      icon: <DollarSign className="h-5 w-5" />,
      color: 'text-orange-400',
      bgColor: 'bg-orange-500/10',
    },
    {
      title: 'Recovered Amount',
      value: `$${Math.round(stats.totalRecoveredAmount).toLocaleString()}`,
      icon: <TrendingUp className="h-5 w-5" />,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
    },
    {
      title: 'Recovery Rate',
      value: `${stats.recoveryRate.toFixed(1)}%`,
      icon: <CheckCircle2 className="h-5 w-5" />,
      color: 'text-teal',
      bgColor: 'bg-teal/10',
    },
    {
      title: 'Avg Days to Resolve',
      value: `${stats.avgDaysToResolve.toFixed(0)}`,
      icon: <Clock className="h-5 w-5" />,
      color: 'text-cyan',
      bgColor: 'bg-cyan/10',
    },
    {
      title: 'New Denials',
      value: stats.newDenialsCount,
      icon: <AlertCircle className="h-5 w-5" />,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
    },
  ];

  const statusFlowData = [
    { name: 'New', count: stats.New || 0 },
    { name: 'Analyzed', count: stats.Analyzed || 0 },
    { name: 'Corrected', count: stats.Corrected || 0 },
    { name: 'Reviewed', count: stats.Reviewed || 0 },
    { name: 'Resubmitted', count: stats.Resubmitted || 0 },
    { name: 'Closed', count: stats.Closed || 0 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Dashboard</h2>
        <p className="text-muted-foreground mt-1">Denial Doctor - Revenue Cycle Management Overview</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpiCards.map((kpi) => (
          <Card key={kpi.title} className="border-border bg-card hover:border-primary/30 transition-smooth">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground font-medium">{kpi.title}</span>
                <div className={`rounded-lg p-1.5 ${kpi.bgColor}`}>
                  <span className={kpi.color}>{kpi.icon}</span>
                </div>
              </div>
              <div className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Breakdown */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-foreground">Denial Category Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.categoryBreakdown} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.02 240)" />
                <XAxis
                  dataKey="category"
                  tick={{ fill: 'oklch(0.65 0.02 240)', fontSize: 11 }}
                  angle={-30}
                  textAnchor="end"
                  height={70}
                />
                <YAxis tick={{ fill: 'oklch(0.65 0.02 240)', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'oklch(0.17 0.015 240)',
                    border: '1px solid oklch(0.28 0.02 240)',
                    borderRadius: '8px',
                    color: 'oklch(0.95 0.01 240)',
                  }}
                />
                <Bar dataKey="count" name="Count" radius={[4, 4, 0, 0]}>
                  {stats.categoryBreakdown.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Payer Breakdown Pie Chart */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-foreground">Payer Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={stats.payerBreakdown}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  dataKey="amount"
                  nameKey="payer"
                  label={({ payer, percent }) => `${payer} (${(percent * 100).toFixed(0)}%)`}
                  labelLine={{ stroke: 'oklch(0.65 0.02 240)' }}
                >
                  {stats.payerBreakdown.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'oklch(0.17 0.015 240)',
                    border: '1px solid oklch(0.28 0.02 240)',
                    borderRadius: '8px',
                    color: 'oklch(0.95 0.01 240)',
                  }}
                  formatter={(value: number) => `$${value.toLocaleString()}`}
                />
                <Legend wrapperStyle={{ color: 'oklch(0.65 0.02 240)', fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Status Flow and Aging */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Flow */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-foreground">Workflow Status Distribution</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={statusFlowData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.02 240)" />
                <XAxis dataKey="name" tick={{ fill: 'oklch(0.65 0.02 240)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'oklch(0.65 0.02 240)', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'oklch(0.17 0.015 240)',
                    border: '1px solid oklch(0.28 0.02 240)',
                    borderRadius: '8px',
                    color: 'oklch(0.95 0.01 240)',
                  }}
                />
                <Bar dataKey="count" name="Denials" radius={[4, 4, 0, 0]}>
                  {statusFlowData.map((entry, index) => {
                    const colors = ['#3b82f6', '#eab308', '#f97316', '#a855f7', '#22c55e', '#6b7280'];
                    return <Cell key={`cell-${index}`} fill={colors[index]} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Aging Buckets */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-foreground">Denial Aging</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-4">
              {stats.agingBuckets.map((bucket, index) => {
                const totalAmount = stats.totalDeniedAmount || 1;
                const percentage = (bucket.amount / totalAmount) * 100;
                const colors = ['bg-emerald', 'bg-yellow-500', 'bg-orange-500', 'bg-red-500'];
                const bgColors = ['bg-emerald/20', 'bg-yellow-500/20', 'bg-orange-500/20', 'bg-red-500/20'];
                return (
                  <div key={bucket.bucket} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{bucket.bucket}</span>
                      <span className="font-medium text-foreground">
                        {bucket.count} claims · ${bucket.amount.toLocaleString()}
                      </span>
                    </div>
                    <div className={`h-3 rounded-full ${bgColors[index]}`}>
                      <div
                        className={`h-full rounded-full ${colors[index]} transition-all duration-500`}
                        style={{ width: `${Math.max(percentage, 2)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Denials */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-foreground">Recent Denials</CardTitle>
            <button
              onClick={() => setCurrentView('denials')}
              className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-smooth"
            >
              View All <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Claim #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Patient</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Payer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">CPT</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">CARC</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Amount</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Priority</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentDenials.map((denial: Denial) => (
                  <tr
                    key={denial.id}
                    onClick={() => navigateToDenial(denial.id)}
                    className="border-b border-border/50 hover:bg-accent/30 cursor-pointer transition-smooth"
                  >
                    <td className="px-4 py-3 text-sm font-mono text-primary">{denial.claimNumber}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{denial.patientName}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{denial.payerName}</td>
                    <td className="px-4 py-3 text-sm font-mono text-foreground">{denial.cptCode}</td>
                    <td className="px-4 py-3 text-sm font-mono text-foreground">{denial.carcCode}</td>
                    <td className="px-4 py-3 text-sm text-right text-foreground font-medium">
                      ${denial.deniedAmount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant="outline" className={PRIORITY_COLORS[denial.priority]}>
                        {denial.priority}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant="outline" className={STATUS_COLORS[denial.status]}>
                        {denial.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
