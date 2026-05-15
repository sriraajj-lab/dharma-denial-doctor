'use client';

import { useState, useEffect } from 'react';
import { ClipboardList, User, FileText, Bot, Shield, DollarSign } from 'lucide-react';

interface AuditLog {
  id: string;
  userId?: string;
  userName?: string;
  denialId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export function AuditLogView() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');

  useEffect(() => {
    fetchLogs();
  }, []);

  async function fetchLogs() {
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (actionFilter) params.set('action', actionFilter);
      const res = await fetch(`/api/audit?${params}`);
      const data = await res.json();
      setLogs(data.logs || []);
    } catch {
      // Empty state
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLogs();
  }, [actionFilter]);

  const actionIcon = (action: string) => {
    if (action.includes('login') || action.includes('logout')) return <User className="h-4 w-4 text-blue-400" />;
    if (action.includes('analyze') || action.includes('correct') || action.includes('batch')) return <Bot className="h-4 w-4 text-purple-400" />;
    if (action.includes('appeal')) return <Shield className="h-4 w-4 text-orange-400" />;
    if (action.includes('payment') || action.includes('financial')) return <DollarSign className="h-4 w-4 text-green-400" />;
    return <FileText className="h-4 w-4 text-gray-400" />;
  };

  const actionLabel = (action: string) => {
    const labels: Record<string, string> = {
      create: 'Created',
      update: 'Updated',
      delete: 'Deleted',
      view: 'Viewed',
      analyze: 'Analyzed',
      correct: 'Corrected',
      quality_check: 'Quality Checked',
      appeal_create: 'Appeal Created',
      appeal_send: 'Appeal Sent',
      appeal_update: 'Appeal Updated',
      note_add: 'Note Added',
      assign: 'Assigned',
      export: 'Exported',
      login: 'Logged In',
      logout: 'Logged Out',
      batch_start: 'Batch Started',
      batch_complete: 'Batch Completed',
      payment_record: 'Payment Recorded',
      scrub_run: 'Claim Scrub Run',
    };
    return labels[action] || action;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-xl font-bold text-foreground">Audit Trail</h2>
            <p className="text-sm text-muted-foreground">HIPAA-compliant activity log for all system actions</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded">HIPAA Compliant</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        >
          <option value="">All Actions</option>
          <option value="create">Create</option>
          <option value="update">Update</option>
          <option value="analyze">Analyze</option>
          <option value="correct">Correct</option>
          <option value="appeal_create">Appeal Create</option>
          <option value="export">Export</option>
          <option value="login">Login</option>
          <option value="batch_start">Batch Start</option>
          <option value="payment_record">Payment Record</option>
          <option value="scrub_run">Claim Scrub</option>
        </select>
      </div>

      {/* Audit Log Table */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading audit logs...</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12">
          <ClipboardList className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">No audit logs yet</p>
          <p className="text-xs text-muted-foreground mt-1">Actions will be logged as you use the system</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Timestamp</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">User</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Action</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Entity</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-foreground">{log.userName || 'System'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {actionIcon(log.action)}
                      <span className="text-xs font-medium text-foreground">{actionLabel(log.action)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-muted-foreground">
                      {log.entityType}
                      {log.entityId && <span className="text-foreground/60"> #{log.entityId.slice(0, 8)}</span>}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {log.denialId && (
                      <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                        Denial: {log.denialId}
                      </span>
                    )}
                    {log.metadata && (
                      <span className="text-xs text-muted-foreground ml-2">
                        {JSON.stringify(log.metadata).slice(0, 50)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
