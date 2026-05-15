'use client';

import { useState, useEffect } from 'react';
import { BookOpen, Plus, Edit2, Trash2, Phone, Globe, Calendar } from 'lucide-react';

interface PayerRule {
  id: string;
  payerName: string;
  payerId?: string;
  ruleType: string;
  ruleName: string;
  description?: string;
  filingDeadlineDays?: number;
  appealDeadlineDays?: number;
  requiresAuth: boolean;
  contactPhone?: string;
  portalUrl?: string;
  notes?: string;
  isActive: boolean;
}

export function PayerRulesView() {
  const [rules, setRules] = useState<PayerRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [payerFilter, setPayerFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  useEffect(() => {
    fetchRules();
  }, []);

  async function fetchRules() {
    try {
      const res = await fetch('/api/payer-rules');
      const data = await res.json();
      setRules(data.rules || []);
    } catch {
      // Empty state
    } finally {
      setLoading(false);
    }
  }

  const uniquePayers = [...new Set(rules.map((r) => r.payerName))];
  const uniqueTypes = [...new Set(rules.map((r) => r.ruleType))];

  const filteredRules = rules.filter((r) => {
    if (payerFilter && r.payerName !== payerFilter) return false;
    if (typeFilter && r.ruleType !== typeFilter) return false;
    return true;
  });

  const ruleTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      filing_deadline: 'Filing Deadline',
      auth_required: 'Auth Required',
      modifier_rules: 'Modifier Rules',
      bundling: 'Bundling',
      documentation: 'Documentation',
    };
    return labels[type] || type;
  };

  const ruleTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      filing_deadline: 'bg-blue-500/20 text-blue-400',
      auth_required: 'bg-orange-500/20 text-orange-400',
      modifier_rules: 'bg-purple-500/20 text-purple-400',
      bundling: 'bg-yellow-500/20 text-yellow-400',
      documentation: 'bg-green-500/20 text-green-400',
    };
    return colors[type] || 'bg-gray-500/20 text-gray-400';
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-xl font-bold text-foreground">Payer Rules Engine</h2>
            <p className="text-sm text-muted-foreground">Configure payer-specific filing deadlines, auth requirements, and contact info</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select
          value={payerFilter}
          onChange={(e) => setPayerFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        >
          <option value="">All Payers</option>
          {uniquePayers.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        >
          <option value="">All Rule Types</option>
          {uniqueTypes.map((t) => (
            <option key={t} value={t}>{ruleTypeLabel(t)}</option>
          ))}
        </select>
      </div>

      {/* Rules Grid */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading rules...</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredRules.map((rule) => (
            <div key={rule.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{rule.ruleName}</h3>
                  <p className="text-xs text-muted-foreground">{rule.payerName}</p>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${ruleTypeColor(rule.ruleType)}`}>
                  {ruleTypeLabel(rule.ruleType)}
                </span>
              </div>

              {rule.description && (
                <p className="text-xs text-muted-foreground">{rule.description}</p>
              )}

              <div className="space-y-1">
                {rule.filingDeadlineDays && (
                  <div className="flex items-center gap-2 text-xs">
                    <Calendar className="h-3 w-3 text-blue-400" />
                    <span className="text-foreground">Filing: {rule.filingDeadlineDays} days</span>
                  </div>
                )}
                {rule.appealDeadlineDays && (
                  <div className="flex items-center gap-2 text-xs">
                    <Calendar className="h-3 w-3 text-orange-400" />
                    <span className="text-foreground">Appeal: {rule.appealDeadlineDays} days</span>
                  </div>
                )}
                {rule.contactPhone && (
                  <div className="flex items-center gap-2 text-xs">
                    <Phone className="h-3 w-3 text-green-400" />
                    <span className="text-foreground">{rule.contactPhone}</span>
                  </div>
                )}
                {rule.portalUrl && (
                  <div className="flex items-center gap-2 text-xs">
                    <Globe className="h-3 w-3 text-purple-400" />
                    <a href={rule.portalUrl} target="_blank" rel="noopener" className="text-primary hover:underline truncate">
                      {rule.portalUrl.replace('https://', '')}
                    </a>
                  </div>
                )}
              </div>

              {rule.notes && (
                <p className="text-[11px] text-muted-foreground italic border-t border-border pt-2">{rule.notes}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
