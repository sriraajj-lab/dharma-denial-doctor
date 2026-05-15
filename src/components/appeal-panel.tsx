'use client';

import { useState, useEffect } from 'react';
import { Denial } from '@/lib/types';
import { Gavel, Send, Loader2, FileText, CheckCircle2, Clock, Eye, Edit3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface Appeal {
  id: string;
  denialId: string;
  appealType: string;
  status: string;
  letterContent: string;
  sentAt?: string;
  createdByName?: string;
  createdAt: string;
}

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  pending_review: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  sent: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  accepted: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  denied: 'bg-red-500/20 text-red-400 border-red-500/30',
};

export function AppealPanel({ denial }: { denial: Denial }) {
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedAppeal, setSelectedAppeal] = useState<Appeal | null>(null);
  const [appealType, setAppealType] = useState('first_level');

  useEffect(() => {
    fetchAppeals();
  }, [denial.id]);

  async function fetchAppeals() {
    try {
      const res = await fetch(`/api/appeals?denialId=${denial.id}`);
      const data = await res.json();
      setAppeals(data.appeals || []);
    } catch {
      // empty
    } finally {
      setLoading(false);
    }
  }

  async function generateAppeal() {
    setGenerating(true);
    try {
      const res = await fetch('/api/appeals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ denialId: denial.id, appealType }),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setAppeals((prev) => [data.appeal, ...prev]);
      setSelectedAppeal(data.appeal);
      toast.success('Appeal letter generated');
    } catch {
      toast.error('Failed to generate appeal');
    } finally {
      setGenerating(false);
    }
  }

  async function markAsSent(appealId: string) {
    try {
      const res = await fetch('/api/appeals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appealId, status: 'sent' }),
      });
      if (res.ok) {
        fetchAppeals();
        if (selectedAppeal?.id === appealId) {
          setSelectedAppeal((prev) => prev ? { ...prev, status: 'sent', sentAt: new Date().toISOString() } : null);
        }
        toast.success('Appeal marked as sent');
      }
    } catch {
      toast.error('Failed to update appeal');
    }
  }

  // Show appeal letter detail
  if (selectedAppeal) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={STATUS_BADGE[selectedAppeal.status]}>{selectedAppeal.status.replace('_', ' ')}</Badge>
            <span className="text-xs text-muted-foreground">{selectedAppeal.appealType.replace('_', ' ')}</span>
          </div>
          <div className="flex gap-2">
            {selectedAppeal.status === 'draft' && (
              <Button size="sm" onClick={() => markAsSent(selectedAppeal.id)} className="bg-blue-600 hover:bg-blue-700 text-white">
                <Send className="h-3 w-3 mr-1" /> Mark Sent
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setSelectedAppeal(null)}>
              Back to List
            </Button>
          </div>
        </div>

        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <div className="prose prose-sm prose-invert max-w-none whitespace-pre-wrap text-sm text-foreground/90 bg-muted/20 rounded-lg p-4 border border-border max-h-[600px] overflow-y-auto">
              {selectedAppeal.letterContent}
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              Generated on {new Date(selectedAppeal.createdAt).toLocaleString()}
              {selectedAppeal.sentAt && ` | Sent on ${new Date(selectedAppeal.sentAt).toLocaleString()}`}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Generate Appeal */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Gavel className="h-4 w-4 text-primary" /> Generate Appeal Letter
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-3">
            AI generates a professional appeal letter using the denial analysis, CARC/RARC codes, and clinical context.
          </p>
          <div className="flex items-center gap-3">
            <select
              value={appealType}
              onChange={(e) => setAppealType(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="first_level">First Level Appeal</option>
              <option value="second_level">Second Level Appeal</option>
              <option value="external_review">External Review</option>
            </select>
            <Button onClick={generateAppeal} disabled={generating} className="bg-primary hover:bg-primary/90">
              {generating ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
              ) : (
                <><Gavel className="h-4 w-4 mr-2" /> Generate Appeal</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Existing Appeals */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Loading appeals...</div>
      ) : appeals.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="p-8 text-center">
            <Gavel className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No appeals yet for this denial.</p>
            <p className="text-xs text-muted-foreground mt-1">Generate an appeal letter above.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {appeals.map((appeal) => (
            <Card key={appeal.id} className="border-border bg-card hover:border-primary/30 transition-all cursor-pointer" onClick={() => setSelectedAppeal(appeal)}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground capitalize">{appeal.appealType.replace('_', ' ')}</span>
                    <Badge variant="outline" className={`text-[10px] ${STATUS_BADGE[appeal.status]}`}>{appeal.status.replace('_', ' ')}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{new Date(appeal.createdAt).toLocaleDateString()}</span>
                    <Eye className="h-3 w-3 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
