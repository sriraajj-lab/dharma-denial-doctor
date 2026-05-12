import { NextRequest, NextResponse } from 'next/server';
import { scrubClaim, scrubBatch, getScrubRules, getScrubResults, updateScrubResult } from '@/lib/claim-scrub';
import { getDenials, getDenialById } from '@/lib/data';
import { createAuditLog } from '@/lib/audit';
import { getCurrentUser } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { denialId, denialIds, claimData } = body;

    const currentUser = getCurrentUser();

    // Single claim scrub
    if (denialId) {
      const denial = getDenialById(denialId);
      if (!denial) {
        return NextResponse.json({ error: 'Denial not found' }, { status: 404 });
      }

      const results = scrubClaim(denial);

      createAuditLog({
        userId: currentUser.id,
        userName: currentUser.name,
        denialId,
        action: 'scrub_run',
        entityType: 'claim_scrub',
        metadata: { findingsCount: results.length },
      });

      return NextResponse.json({ results, totalFindings: results.length });
    }

    // Batch scrub
    if (denialIds && Array.isArray(denialIds)) {
      const denials = denialIds
        .map((id: string) => getDenialById(id))
        .filter(Boolean);

      const summary = scrubBatch(denials as any[]);

      createAuditLog({
        userId: currentUser.id,
        userName: currentUser.name,
        action: 'scrub_run',
        entityType: 'claim_scrub',
        metadata: { batchSize: denials.length, totalFindings: summary.totalFindings },
      });

      return NextResponse.json(summary);
    }

    // Scrub raw claim data (pre-submission)
    if (claimData) {
      const results = scrubClaim(claimData);
      return NextResponse.json({ results, totalFindings: results.length });
    }

    // Scrub all denials
    const allDenials = getDenials();
    const summary = scrubBatch(allDenials);

    createAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      action: 'scrub_run',
      entityType: 'claim_scrub',
      metadata: { batchSize: allDenials.length, totalFindings: summary.totalFindings },
    });

    return NextResponse.json(summary);
  } catch (error) {
    console.error('Error running claim scrub:', error);
    return NextResponse.json({ error: 'Failed to run claim scrub' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rulesOnly = searchParams.get('rules');
    const denialId = searchParams.get('denialId');
    const status = searchParams.get('status');

    if (rulesOnly === 'true') {
      const rules = getScrubRules();
      return NextResponse.json({ rules });
    }

    const results = getScrubResults({
      denialId: denialId || undefined,
      status: status || undefined,
    });

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Error fetching scrub data:', error);
    return NextResponse.json({ error: 'Failed to fetch scrub data' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { resultId, status } = body;

    if (!resultId || !status) {
      return NextResponse.json({ error: 'resultId and status required' }, { status: 400 });
    }

    const updates: Record<string, unknown> = { status };
    if (status === 'resolved') {
      updates.resolvedAt = new Date().toISOString();
    }

    const result = updateScrubResult(resultId, updates as any);
    if (!result) {
      return NextResponse.json({ error: 'Result not found' }, { status: 404 });
    }

    return NextResponse.json({ result });
  } catch (error) {
    console.error('Error updating scrub result:', error);
    return NextResponse.json({ error: 'Failed to update scrub result' }, { status: 500 });
  }
}
