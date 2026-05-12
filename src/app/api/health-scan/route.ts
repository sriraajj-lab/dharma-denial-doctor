import { NextRequest, NextResponse } from 'next/server';
import { generateHealthScan } from '@/lib/health-scan';
import { createAuditLog } from '@/lib/audit';
import { getCurrentUser } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { clientName, totalClaimsSubmitted } = body;

    const report = generateHealthScan({ clientName, totalClaimsSubmitted });

    const currentUser = getCurrentUser();
    createAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      action: 'create',
      entityType: 'health_scan',
      entityId: report.id,
      metadata: { clientName, overallScore: report.overallScore, overallGrade: report.overallGrade },
    });

    return NextResponse.json({ report });
  } catch (error) {
    console.error('Error generating health scan:', error);
    return NextResponse.json({ error: 'Failed to generate health scan' }, { status: 500 });
  }
}

export async function GET() {
  try {
    // Default scan with current data
    const report = generateHealthScan({});
    return NextResponse.json({ report });
  } catch (error) {
    console.error('Error fetching health scan:', error);
    return NextResponse.json({ error: 'Failed to fetch health scan' }, { status: 500 });
  }
}
