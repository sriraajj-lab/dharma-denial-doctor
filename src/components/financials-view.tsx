'use client';

import { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, TrendingDown, PiggyBank, Plus } from 'lucide-react';

interface FinancialSummary {
  totalResubmitted: number;
  totalRecovered: number;
  totalWriteOff: number;
  totalAdjustments: number;
  recoveryRate: number;
  byEventType: Record<string, { count: number; amount: number }>;
  byMonth: Array<{ month: string; recovered: number; writeOff: number; pending: number }>;
}

interface FinancialEvent {
  id: string;
  denialId: string;
  eventType: string;
  amount: number;
  checkNumber?: string;
  paymentDate?: string;
  notes?: string;
  createdAt: string;
}

export function FinancialsView() {
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [events, setEvents] = useState<FinancialEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    denialId: '',
    eventType: 'full_payment',
    amount: '',
    checkNumber: '',
    notes: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [summaryRes, eventsRes] = await Promise.all([
        fetch('/api/financials?summary=true'),
        fetch('/api/financials'),
      ]);
      const summaryData = await summaryRes.json();
      const eventsData = await eventsRes.json();
      setSummary(summaryData);
      setEvents(eventsData.events || []);
    } catch {
      // Empty state
    } finally {
      setLoading(false);
    }
  }

  async function addEvent() {
    if (!formData.denialId || !formData.amount) return;
    try {
      await fetch('/api/financials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      setShowAddForm(false);
      setFormData({ denialId: '', eventType: 'full_payment', amount: '', checkNumber: '', notes: '' });
      fetchData();
    } catch (err) {
      console.error('Failed to add event:', err);
    }
  }

  const eventTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      resubmission: 'Resubmission',
      partial_payment: 'Partial Payment',
      full_payment: 'Full Payment',
      write_off: 'Write Off',
      adjustment: 'Adjustment',
      refund: 'Refund',
    };
    return labels[type] || type;
  };

  const eventTypeColor = (type: string) => {
    switch (type) {
      case 'full_payment': return 'text-emerald-400';
      case 'partial_payment': return 'text-green-400';
      case 'write_off': return 'text-red-400';
      case 'adjustment': return 'text-yellow-400';
      case 'refund': return 'text-orange-400';
      default: return 'text-blue-400';
    }
  };

  const formatCurrency = (amount: number) => `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <DollarSign className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-xl font-bold text-foreground">Financial Tracking</h2>
            <p className="text-sm text-muted-foreground">Track actual recovery amounts, payments, and write-offs</p>
          </div>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Record Payment
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              <span className="text-xs text-muted-foreground">Total Recovered</span>
            </div>
            <p className="text-xl font-bold text-emerald-400">{formatCurrency(summary.totalRecovered)}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <PiggyBank className="h-4 w-4 text-blue-400" />
              <span className="text-xs text-muted-foreground">Recovery Rate</span>
            </div>
            <p className="text-xl font-bold text-blue-400">{summary.recoveryRate.toFixed(1)}%</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="h-4 w-4 text-red-400" />
              <span className="text-xs text-muted-foreground">Write-offs</span>
            </div>
            <p className="text-xl font-bold text-red-400">{formatCurrency(summary.totalWriteOff)}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-yellow-400" />
              <span className="text-xs text-muted-foreground">Resubmitted</span>
            </div>
            <p className="text-xl font-bold text-yellow-400">{formatCurrency(summary.totalResubmitted)}</p>
          </div>
        </div>
      )}

      {/* Add Payment Form */}
      {showAddForm && (
        <div className="rounded-lg border border-primary/30 bg-card p-4 space-y-3">
          <h3 className="text-sm font-medium text-foreground">Record Financial Event</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <input
              type="text"
              placeholder="Denial ID (e.g. DEN-001)"
              value={formData.denialId}
              onChange={(e) => setFormData({ ...formData, denialId: e.target.value })}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <select
              value={formData.eventType}
              onChange={(e) => setFormData({ ...formData, eventType: e.target.value })}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="full_payment">Full Payment</option>
              <option value="partial_payment">Partial Payment</option>
              <option value="write_off">Write Off</option>
              <option value="adjustment">Adjustment</option>
              <option value="resubmission">Resubmission</option>
              <option value="refund">Refund</option>
            </select>
            <input
              type="number"
              placeholder="Amount"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="Check # (optional)"
              value={formData.checkNumber}
              onChange={(e) => setFormData({ ...formData, checkNumber: e.target.value })}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              onClick={addEvent}
              className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Recent Events */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading financials...</div>
      ) : events.length === 0 ? (
        <div className="text-center py-12">
          <DollarSign className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">No financial events recorded yet</p>
          <p className="text-xs text-muted-foreground mt-1">Record payments, write-offs, and adjustments to track actual recovery</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Denial ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {events.map((event) => (
                <tr key={event.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(event.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-foreground">{event.denialId}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${eventTypeColor(event.eventType)}`}>
                      {eventTypeLabel(event.eventType)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-medium text-foreground">
                    {formatCurrency(event.amount)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{event.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
