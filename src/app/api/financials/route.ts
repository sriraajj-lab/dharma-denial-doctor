import { NextRequest, NextResponse } from 'next/server';
import { createFinancialEvent, getFinancialEvents, getFinancialSummary, deleteFinancialEvent } from '@/lib/financial-tracking';
import { createAuditLog } from '@/lib/audit';
import { getCurrentUser } from '@/lib/auth';
import { FinancialEventType } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { denialId, eventType, amount, checkNumber, eraTraceNumber, paymentDate, postingDate, notes } = body;

    if (!denialId || !eventType || amount === undefined) {
      return NextResponse.json({ error: 'denialId, eventType, and amount are required' }, { status: 400 });
    }

    const currentUser = getCurrentUser();

    const event = createFinancialEvent({
      denialId,
      eventType,
      amount: parseFloat(amount),
      checkNumber,
      eraTraceNumber,
      paymentDate,
      postingDate,
      notes,
    });

    createAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      denialId,
      action: 'payment_record',
      entityType: 'financial_event',
      entityId: event.id,
      metadata: { eventType, amount },
    });

    return NextResponse.json({ event });
  } catch (error) {
    console.error('Error creating financial event:', error);
    return NextResponse.json({ error: 'Failed to create financial event' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const denialId = searchParams.get('denialId');
    const eventType = searchParams.get('eventType') as FinancialEventType | null;
    const summary = searchParams.get('summary');

    if (summary === 'true') {
      const denialIds = searchParams.get('denialIds')?.split(',') || undefined;
      const result = getFinancialSummary(denialIds);
      return NextResponse.json(result);
    }

    const events = getFinancialEvents({
      denialId: denialId || undefined,
      eventType: eventType || undefined,
    });

    return NextResponse.json({ events });
  } catch (error) {
    console.error('Error fetching financial events:', error);
    return NextResponse.json({ error: 'Failed to fetch financial events' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Event ID required' }, { status: 400 });
    }

    const deleted = deleteFinancialEvent(id);
    if (!deleted) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting financial event:', error);
    return NextResponse.json({ error: 'Failed to delete financial event' }, { status: 500 });
  }
}
