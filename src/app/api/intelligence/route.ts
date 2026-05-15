import { NextRequest, NextResponse } from 'next/server';
import {
  generateInsights,
  getPayerProfile,
  getResubmissionRecords,
  recordResubmissionOutcome,
  predictResubmissionSuccess,
} from '@/lib/resubmission-intelligence';
import { getDenialById } from '@/lib/data';
import { createAuditLog } from '@/lib/audit';

/**
 * Resubmission Intelligence API
 *
 * GET endpoints:
 *   ?view=insights       → AI-generated insights from historical patterns
 *   ?view=payer&name=X   → Payer-specific intelligence profile
 *   ?view=records        → Historical resubmission outcomes (with filters)
 *   ?view=predict&denialId=X&correctionType=Y → Predict success for a correction
 *
 * POST endpoint:
 *   Record a new resubmission outcome for the learning engine
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get('view') || 'insights';

    switch (view) {
      case 'insights': {
        const insights = generateInsights();
        return NextResponse.json({ insights, generatedAt: new Date().toISOString() });
      }

      case 'payer': {
        const payerName = searchParams.get('name');
        if (!payerName) {
          return NextResponse.json({ error: 'Payer name required (use ?view=payer&name=PayerName)' }, { status: 400 });
        }
        const profile = getPayerProfile(payerName);
        return NextResponse.json({ profile });
      }

      case 'records': {
        const payerName = searchParams.get('payerName') || undefined;
        const carcCode = searchParams.get('carcCode') || undefined;
        const outcome = searchParams.get('outcome') || undefined;
        const correctionType = searchParams.get('correctionType') || undefined;

        const records = getResubmissionRecords({ payerName, carcCode, outcome, correctionType });
        const total = records.length;
        const successCount = records.filter(r => r.outcome === 'paid' || r.outcome === 'partially_paid').length;

        return NextResponse.json({
          records,
          summary: {
            total,
            successCount,
            failCount: records.filter(r => r.outcome === 'denied_again').length,
            pendingCount: records.filter(r => r.outcome === 'pending').length,
            successRate: total > 0 ? Math.round((successCount / total) * 100) : 0,
            totalRecovered: records.reduce((sum, r) => sum + (r.paidAmount || 0), 0),
            avgDaysToResolution: records.filter(r => r.daysToResolution).length > 0
              ? Math.round(records.reduce((sum, r) => sum + (r.daysToResolution || 0), 0) / records.filter(r => r.daysToResolution).length)
              : 0,
          },
        });
      }

      case 'predict': {
        const denialId = searchParams.get('denialId');
        const correctionType = searchParams.get('correctionType');

        if (!denialId || !correctionType) {
          return NextResponse.json({ error: 'denialId and correctionType required' }, { status: 400 });
        }

        const denial = await getDenialById(denialId);
        if (!denial) {
          return NextResponse.json({ error: 'Denial not found' }, { status: 404 });
        }

        const prediction = predictResubmissionSuccess(denial, correctionType);
        return NextResponse.json({ prediction, denialId, correctionType });
      }

      default:
        return NextResponse.json({ error: 'Invalid view. Use: insights, payer, records, predict' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error in intelligence API:', error);
    return NextResponse.json({ error: 'Failed to retrieve intelligence data' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      denialId,
      claimNumber,
      payerName,
      carcCode,
      denialCategory,
      cptCode,
      deniedAmount,
      correctionType,
      correctionDetails,
      resubmittedAt,
      outcome,
      paidAmount,
      resolvedAt,
      deniedAgainReason,
      notes,
    } = body;

    // Validate required fields
    if (!denialId || !payerName || !carcCode || !correctionType || !outcome) {
      return NextResponse.json(
        { error: 'Required fields: denialId, payerName, carcCode, correctionType, outcome' },
        { status: 400 }
      );
    }

    if (!['paid', 'partially_paid', 'denied_again', 'pending', 'appealed'].includes(outcome)) {
      return NextResponse.json(
        { error: 'outcome must be: paid, partially_paid, denied_again, pending, or appealed' },
        { status: 400 }
      );
    }

    const record = recordResubmissionOutcome({
      denialId,
      claimNumber: claimNumber || '',
      payerName,
      carcCode,
      denialCategory: denialCategory || 'other',
      cptCode: cptCode || '',
      deniedAmount: parseFloat(deniedAmount) || 0,
      correctionType,
      correctionDetails: correctionDetails || '',
      resubmittedAt: resubmittedAt || new Date().toISOString(),
      outcome,
      paidAmount: paidAmount ? parseFloat(paidAmount) : undefined,
      resolvedAt: resolvedAt || (outcome !== 'pending' ? new Date().toISOString() : undefined),
      deniedAgainReason,
      notes,
    });

    createAuditLog({
      denialId,
      action: 'update',
      entityType: 'resubmission_record',
      entityId: record.id,
      metadata: { outcome, correctionType, paidAmount },
    });

    return NextResponse.json({ record, message: 'Outcome recorded successfully. Intelligence engine updated.' });
  } catch (error) {
    console.error('Error recording resubmission outcome:', error);
    return NextResponse.json({ error: 'Failed to record outcome' }, { status: 500 });
  }
}
