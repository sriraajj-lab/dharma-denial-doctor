import { NextRequest, NextResponse } from 'next/server';
import { getAuditLogs, getAuditLogsForDenial } from '@/lib/audit';
import { AuditAction } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const denialId = searchParams.get('denialId');
    const userId = searchParams.get('userId');
    const action = searchParams.get('action') as AuditAction | null;
    const entityType = searchParams.get('entityType');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (denialId) {
      const logs = getAuditLogsForDenial(denialId);
      return NextResponse.json({ logs, total: logs.length });
    }

    const result = getAuditLogs({
      userId: userId || undefined,
      action: action || undefined,
      entityType: entityType || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      limit,
      offset,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 });
  }
}
