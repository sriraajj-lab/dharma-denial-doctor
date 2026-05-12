import { NextRequest, NextResponse } from 'next/server';
import { getDenialById, updateDenial } from '@/lib/data';
import { generateAppealLetter, createAppeal, getAllAppeals, getAppealsForDenial, updateAppeal } from '@/lib/appeals';
import { createAuditLog } from '@/lib/audit';
import { getCurrentUser } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { denialId, appealType } = body;

    if (!denialId) {
      return NextResponse.json({ error: 'denialId is required' }, { status: 400 });
    }

    const denial = getDenialById(denialId);
    if (!denial) {
      return NextResponse.json({ error: 'Denial not found' }, { status: 404 });
    }

    const currentUser = getCurrentUser();

    // Generate appeal letter content via AI
    const letterContent = await generateAppealLetter(denial);

    // Create the appeal record
    const appeal = createAppeal({
      denialId,
      appealType: appealType || 'first_level',
      status: 'draft',
      letterContent,
      supportingDocs: [],
      createdById: currentUser.id,
      createdByName: currentUser.name,
    });

    // Update denial status
    updateDenial(denialId, { status: 'Appealed' });

    createAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      denialId,
      action: 'appeal_create',
      entityType: 'appeal',
      entityId: appeal.id,
      metadata: { appealType: appeal.appealType },
    });

    return NextResponse.json({ appeal });
  } catch (error) {
    console.error('Error creating appeal:', error);
    return NextResponse.json({ error: 'Failed to create appeal' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const denialId = searchParams.get('denialId');
    const status = searchParams.get('status');
    const appealType = searchParams.get('appealType');

    if (denialId) {
      const appeals = getAppealsForDenial(denialId);
      return NextResponse.json({ appeals });
    }

    const appeals = getAllAppeals({
      status: status || undefined,
      appealType: appealType || undefined,
    });

    return NextResponse.json({ appeals });
  } catch (error) {
    console.error('Error fetching appeals:', error);
    return NextResponse.json({ error: 'Failed to fetch appeals' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { appealId, ...updates } = body;

    if (!appealId) {
      return NextResponse.json({ error: 'appealId is required' }, { status: 400 });
    }

    const currentUser = getCurrentUser();

    // If marking as sent, record the send time
    if (updates.status === 'sent' && !updates.sentAt) {
      updates.sentAt = new Date().toISOString();
    }

    const appeal = updateAppeal(appealId, updates);
    if (!appeal) {
      return NextResponse.json({ error: 'Appeal not found' }, { status: 404 });
    }

    createAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      denialId: appeal.denialId,
      action: 'appeal_update',
      entityType: 'appeal',
      entityId: appeal.id,
      newValues: updates,
    });

    return NextResponse.json({ appeal });
  } catch (error) {
    console.error('Error updating appeal:', error);
    return NextResponse.json({ error: 'Failed to update appeal' }, { status: 500 });
  }
}
