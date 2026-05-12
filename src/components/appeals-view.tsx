'use client';

import { useState, useEffect } from 'react';
import { Gavel, Plus, Send, Clock, CheckCircle2, XCircle, FileText, Eye } from 'lucide-react';

interface Appeal {
  id: string;
  denialId: string;
  appealType: string;
  status: string;
  letterContent: string;
  sentAt?: string;
  deadline?: string;
  createdAt: string;
  createdByName?: string;
}

export function AppealsView() {
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAppeal, setSelectedAppeal] = useState<Appeal | null>(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchAppeals();
  }, []);

  async function fetchAppeals() {
    try {
      const res = await fetch('/api/appeals');
      const data = await res.json();
      setAppeals(data.appeals || []);
    } catch {
      // Empty state
    } finally {
      setLoading(false);
    }
  }

  const filteredAppeals = filter === 'all' ? appeals : appeals.filter((a) => a.status === filter);

  const statusIcon = (status: string) => {
    switch (status) {
      case 'draft': return <FileText className="h-4 w-4 text-gray-400" />;
      case 'pending_review': return <Clock className="h-4 w-4 text-yellow-400" />;
      case 'sent': return <Send className="h-4 w-4 text-blue-400" />;
      case 'accepted': return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
      case 'denied': return <XCircle className="h-4 w-4 text-red-400" />;
      default: return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const statusLabel = (status: string) => {
    const labels: Record<string, string> = {
      draft: 'Draft',
      pending_review: 'Pending Review',
      sent: 'Sent',
      accepted: 'Accepted',
      denied: 'Denied',
      expired: 'Expired',
    };
    return labels[status] || status;
  };

  async function updateAppealStatus(appealId: string, newStatus: string) {
    try {
      await fetch('/api/appeals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appealId, status: newStatus }),
      });
      fetchAppeals();
    } catch (err) {
      console.error('Failed to update appeal:', err);
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Gavel className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-xl font-bold text-foreground">Appeal Letters</h2>
            <p className="text-sm text-muted-foreground">Generate, manage, and track appeal submissions</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{appeals.length} total appeals</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'draft', 'pending_review', 'sent', 'accepted', 'denied'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              filter === f
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {f === 'all' ? 'All' : statusLabel(f)}
          </button>
        ))}
      </div>

      {/* Appeals List */}
      {selectedAppeal ? (
        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {statusIcon(selectedAppeal.status)}
              <span className="text-sm font-medium">{statusLabel(selectedAppeal.status)}</span>
              <span className="text-xs text-muted-foreground">| {selectedAppeal.appealType.replace('_', ' ')}</span>
            </div>
            <div className="flex gap-2">
              {selectedAppeal.status === 'draft' && (
                <button
                  onClick={() => updateAppealStatus(selectedAppeal.id, 'sent')}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs hover:bg-blue-700"
                >
                  <Send className="h-3 w-3" /> Mark Sent
                </button>
              )}
              <button
                onClick={() => setSelectedAppeal(null)}
                className="px-3 py-1.5 rounded-md bg-muted text-muted-foreground text-xs hover:bg-muted/80"
              >
                Back to List
              </button>
            </div>
          </div>
          <div className="prose prose-sm prose-invert max-w-none">
            <div className="whitespace-pre-wrap text-sm text-foreground/90 bg-muted/30 rounded-lg p-4 border border-border">
              {selectedAppeal.letterContent}
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Created by {selectedAppeal.createdByName || 'System'} on {new Date(selectedAppeal.createdAt).toLocaleDateString()}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading appeals...</div>
          ) : filteredAppeals.length === 0 ? (
            <div className="text-center py-12">
              <Gavel className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">No appeals yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Appeals are generated from the denial detail view when AI recommends an appeal
              </p>
            </div>
          ) : (
            filteredAppeals.map((appeal) => (
              <div
                key={appeal.id}
                className="flex items-center justify-between rounded-lg border border-border bg-card p-4 hover:border-primary/30 transition-all cursor-pointer"
                onClick={() => setSelectedAppeal(appeal)}
              >
                <div className="flex items-center gap-3">
                  {statusIcon(appeal.status)}
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {appeal.appealType.replace('_', ' ')} - Denial {appeal.denialId}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Created {new Date(appeal.createdAt).toLocaleDateString()}
                      {appeal.sentAt && ` | Sent ${new Date(appeal.sentAt).toLocaleDateString()}`}
                    </p>
                  </div>
                </div>
                <Eye className="h-4 w-4 text-muted-foreground" />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
