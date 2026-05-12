import { NextRequest, NextResponse } from 'next/server';
import { parseERA835, convertERATodenials } from '@/lib/era-parser';
import { bulkCreateDenials } from '@/lib/data';
import { createAuditLog } from '@/lib/audit';
import { getCurrentUser } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const content = await file.text();

    // Validate it looks like an 835 file
    if (!content.includes('ISA') && !content.includes('BPR') && !content.includes('CLP')) {
      return NextResponse.json(
        { error: 'File does not appear to be a valid ERA/835 format. Expected ANSI X12 835 segments.' },
        { status: 400 }
      );
    }

    // Parse the ERA/835 file
    const transactions = parseERA835(content);

    if (transactions.length === 0) {
      return NextResponse.json({ error: 'No valid transactions found in ERA/835 file' }, { status: 400 });
    }

    // Convert to denial records
    const denialRecords = convertERATodenials(transactions);

    if (denialRecords.length === 0) {
      return NextResponse.json({
        message: 'ERA/835 parsed successfully but no denied claims found. All claims appear fully paid.',
        transactions: transactions.length,
        totalClaims: transactions.reduce((sum, t) => sum + t.claims.length, 0),
        denials: 0,
      });
    }

    // Map to the format expected by bulkCreateDenials
    const mappedDenials = denialRecords.map((d) => ({
      ...d,
      denialCategory: mapCARCToCategory(d.carcCode),
      status: 'New' as const,
      priority: determinePriority(d.carcCode, d.deniedAmount),
    }));

    const created = bulkCreateDenials(mappedDenials as any);

    const currentUser = getCurrentUser();
    createAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      action: 'create',
      entityType: 'denial',
      metadata: {
        source: 'ERA/835',
        fileName: file.name,
        transactionCount: transactions.length,
        denialCount: created.length,
      },
    });

    return NextResponse.json({
      imported: created.length,
      transactions: transactions.length,
      totalClaims: transactions.reduce((sum, t) => sum + t.claims.length, 0),
      denials: created,
      summary: {
        payerBreakdown: summarizeByPayer(denialRecords),
        totalDeniedAmount: denialRecords.reduce((sum, d) => sum + d.deniedAmount, 0),
      },
    });
  } catch (error) {
    console.error('Error parsing ERA/835:', error);
    return NextResponse.json({ error: 'Failed to parse ERA/835 file' }, { status: 500 });
  }
}

function mapCARCToCategory(carcCode: string): string {
  const categoryMap: Record<string, string> = {
    'CO-16': 'missing_information',
    'CO-18': 'duplicate',
    'CO-22': 'bundling',
    'CO-27': 'medical_necessity',
    'CO-29': 'timely_filing',
    'CO-50': 'authorization',
    'CO-197': 'authorization',
    'PR-1': 'eligibility',
    'CO-4': 'coding_error',
    'CO-11': 'coding_error',
    'CO-15': 'missing_information',
    'OA-23': 'other',
    'CO-109': 'eligibility',
  };
  return categoryMap[carcCode] || 'other';
}

function determinePriority(carcCode: string, deniedAmount: number): string {
  if (deniedAmount > 5000) return 'critical';
  if (deniedAmount > 1000) return 'high';
  if (['CO-50', 'CO-197'].includes(carcCode)) return 'high';
  if (deniedAmount > 200) return 'normal';
  return 'low';
}

function summarizeByPayer(denials: Array<{ payerName: string; deniedAmount: number }>): Array<{ payer: string; count: number; amount: number }> {
  const map = new Map<string, { count: number; amount: number }>();
  for (const d of denials) {
    const existing = map.get(d.payerName) || { count: 0, amount: 0 };
    map.set(d.payerName, { count: existing.count + 1, amount: existing.amount + d.deniedAmount });
  }
  return Array.from(map.entries()).map(([payer, data]) => ({ payer, ...data }));
}
