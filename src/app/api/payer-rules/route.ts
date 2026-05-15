import { NextRequest, NextResponse } from 'next/server';
import { getPayerRules, getPayerRuleById, createPayerRule, updatePayerRule, deletePayerRule, calculateFilingDeadline, calculateAppealDeadline } from '@/lib/payer-rules';
import { createAuditLog } from '@/lib/audit';
import { getCurrentUser } from '@/lib/auth';
import { PayerRuleType } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const payerName = searchParams.get('payerName');
    const ruleType = searchParams.get('ruleType') as PayerRuleType | null;

    if (id) {
      const rule = getPayerRuleById(id);
      if (!rule) return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
      return NextResponse.json({ rule });
    }

    // Check deadline calculation
    const calcDeadline = searchParams.get('calculateDeadline');
    if (calcDeadline === 'filing') {
      const payer = searchParams.get('payerName') || '';
      const dos = searchParams.get('dateOfService') || '';
      const denialDate = searchParams.get('denialDate') || '';
      const result = calculateFilingDeadline(payer, dos, denialDate);
      return NextResponse.json(result);
    }
    if (calcDeadline === 'appeal') {
      const payer = searchParams.get('payerName') || '';
      const denialDate = searchParams.get('denialDate') || '';
      const result = calculateAppealDeadline(payer, denialDate);
      return NextResponse.json(result);
    }

    const rules = getPayerRules({
      payerName: payerName || undefined,
      ruleType: ruleType || undefined,
    });

    return NextResponse.json({ rules });
  } catch (error) {
    console.error('Error fetching payer rules:', error);
    return NextResponse.json({ error: 'Failed to fetch payer rules' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const currentUser = getCurrentUser();

    const rule = createPayerRule(body);

    createAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      action: 'create',
      entityType: 'payer_rule',
      entityId: rule.id,
      newValues: body,
    });

    return NextResponse.json({ rule });
  } catch (error) {
    console.error('Error creating payer rule:', error);
    return NextResponse.json({ error: 'Failed to create payer rule' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Rule ID required' }, { status: 400 });
    }

    const currentUser = getCurrentUser();
    const oldRule = getPayerRuleById(id);
    const rule = updatePayerRule(id, updates);

    if (!rule) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    createAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      action: 'update',
      entityType: 'payer_rule',
      entityId: id,
      oldValues: oldRule as unknown as Record<string, unknown>,
      newValues: updates,
    });

    return NextResponse.json({ rule });
  } catch (error) {
    console.error('Error updating payer rule:', error);
    return NextResponse.json({ error: 'Failed to update payer rule' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Rule ID required' }, { status: 400 });
    }

    const deleted = deletePayerRule(id);
    if (!deleted) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    const currentUser = getCurrentUser();
    createAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      action: 'delete',
      entityType: 'payer_rule',
      entityId: id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting payer rule:', error);
    return NextResponse.json({ error: 'Failed to delete payer rule' }, { status: 500 });
  }
}
