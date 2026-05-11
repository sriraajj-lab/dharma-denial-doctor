'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { Denial } from '@/lib/types';
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Eye,
  ArrowUpDown,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const STATUS_COLORS: Record<string, string> = {
  New: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  Analyzed: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  Corrected: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  Reviewed: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  Resubmitted: 'bg-green-500/20 text-green-400 border-green-500/30',
  Closed: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-500/20 text-gray-400',
  normal: 'bg-blue-500/20 text-blue-400',
  high: 'bg-orange-500/20 text-orange-400',
  critical: 'bg-red-500/20 text-red-400',
};

export function DenialsView() {
  const [denials, setDenials] = useState<Denial[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const [payerFilter, setPayerFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('denialDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const { navigateToDenial } = useAppStore();

  const fetchDenials = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '10',
        sort: sortField,
        order: sortOrder,
      });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (payerFilter !== 'all') params.set('payer', payerFilter);
      if (categoryFilter !== 'all') params.set('category', categoryFilter);
      if (searchQuery) params.set('search', searchQuery);

      const res = await fetch(`/api/denials?${params}`);
      const data = await res.json();
      setDenials(data.denials);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (error) {
      console.error('Error fetching denials:', error);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, payerFilter, categoryFilter, searchQuery, sortField, sortOrder]);

  useEffect(() => {
    fetchDenials();
  }, [fetchDenials]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const handleStatusTab = (value: string) => {
    setStatusFilter(value);
    setPage(1);
  };

  const statusCounts: Record<string, number> = {};
  denials.forEach((d) => {
    statusCounts[d.status] = (statusCounts[d.status] || 0) + 1;
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Denial Queue</h2>
        <p className="text-muted-foreground mt-1">Manage and process denied claims</p>
      </div>

      {/* Status Tabs */}
      <Tabs value={statusFilter} onValueChange={handleStatusTab}>
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="all" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            All
          </TabsTrigger>
          <TabsTrigger value="New" className="data-[state=active]:bg-blue-500 data-[state=active]:text-white">
            New
          </TabsTrigger>
          <TabsTrigger value="Analyzed" className="data-[state=active]:bg-yellow-500 data-[state=active]:text-black">
            Analyzed
          </TabsTrigger>
          <TabsTrigger value="Corrected" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white">
            Corrected
          </TabsTrigger>
          <TabsTrigger value="Reviewed" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white">
            Reviewed
          </TabsTrigger>
          <TabsTrigger value="Resubmitted" className="data-[state=active]:bg-green-500 data-[state=active]:text-white">
            Resubmitted
          </TabsTrigger>
          <TabsTrigger value="Closed" className="data-[state=active]:bg-gray-500 data-[state=active]:text-white">
            Closed
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filters */}
      <Card className="border-border bg-card">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search claims, patients, codes..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="pl-10 bg-secondary border-border"
              />
            </div>
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={payerFilter} onValueChange={(v) => { setPayerFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[180px] bg-secondary border-border">
                <SelectValue placeholder="All Payers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Payers</SelectItem>
                <SelectItem value="UnitedHealthcare">UnitedHealthcare</SelectItem>
                <SelectItem value="Aetna">Aetna</SelectItem>
                <SelectItem value="Cigna">Cigna</SelectItem>
                <SelectItem value="Medicare">Medicare</SelectItem>
                <SelectItem value="Blue Cross Blue Shield">BCBS</SelectItem>
                <SelectItem value="Humana">Humana</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[180px] bg-secondary border-border">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="coding_error">Coding Error</SelectItem>
                <SelectItem value="missing_information">Missing Information</SelectItem>
                <SelectItem value="authorization">Authorization</SelectItem>
                <SelectItem value="eligibility">Eligibility</SelectItem>
                <SelectItem value="medical_necessity">Medical Necessity</SelectItem>
                <SelectItem value="timely_filing">Timely Filing</SelectItem>
                <SelectItem value="duplicate">Duplicate</SelectItem>
                <SelectItem value="bundling">Bundling</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Denials Table */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">
              {total} Denial{total !== 1 ? 's' : ''} Found
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : denials.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Filter className="h-12 w-12 mb-3 opacity-50" />
              <p>No denials found matching your criteria</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                        <button onClick={() => handleSort('claimNumber')} className="flex items-center gap-1 hover:text-foreground">
                          Claim # <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Patient</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                        <button onClick={() => handleSort('payerName')} className="flex items-center gap-1 hover:text-foreground">
                          Payer <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">CPT / DX</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">CARC</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                        <button onClick={() => handleSort('deniedAmount')} className="flex items-center gap-1 ml-auto hover:text-foreground">
                          Amount <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Priority</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Status</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {denials.map((denial) => (
                      <tr
                        key={denial.id}
                        className="border-b border-border/50 hover:bg-accent/30 transition-smooth"
                      >
                        <td className="px-4 py-3 text-sm font-mono text-primary">{denial.claimNumber}</td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-foreground">{denial.patientName}</div>
                          <div className="text-xs text-muted-foreground">DoS: {denial.dateOfService}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{denial.payerName}</td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-mono text-foreground">{denial.cptCode}{denial.modifier ? `-${denial.modifier}` : ''}</div>
                          <div className="text-xs text-muted-foreground">{denial.diagnosisCode}</div>
                        </td>
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
                        <td className="px-4 py-3 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigateToDenial(denial.id)}
                            className="text-primary hover:text-primary/80"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  Page {page} of {totalPages} · {total} total records
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="border-border"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page === totalPages}
                    className="border-border"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
