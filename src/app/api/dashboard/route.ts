import { NextRequest, NextResponse } from 'next/server';
import { getDashboardStats } from '@/lib/data';
import { generateWorklist } from '@/lib/worklist';
import { generatePreventionDashboard } from '@/lib/prevention';
import { generateFollowUpTasks, getFollowUpSummary } from '@/lib/followup';
import { getAppealDeadlines } from '@/lib/appeal-deadlines';
import { getStaffMetrics } from '@/lib/staff-metrics';
import { executeNLQuery } from '@/lib/nl-query';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get('view');

    if (view === 'worklist') {
      const category = searchParams.get('category') || undefined;
      const payerName = searchParams.get('payerName') || undefined;
      const minAmount = searchParams.get('minAmount') ? parseFloat(searchParams.get('minAmount')!) : undefined;
      const maxItems = searchParams.get('maxItems') ? parseInt(searchParams.get('maxItems')!) : 50;
      const statusParam = searchParams.get('status');
      const status = statusParam ? statusParam.split(',') : undefined;
      const worklist = await generateWorklist({ category, payerName, minAmount, maxItems, status });
      return NextResponse.json(worklist);
    }

    if (view === 'prevention') {
      return NextResponse.json(await generatePreventionDashboard());
    }

    if (view === 'followup') {
      const tasks = await generateFollowUpTasks();
      const summary = await getFollowUpSummary();
      return NextResponse.json({ tasks, summary });
    }

    if (view === 'appeal-deadlines') {
      return NextResponse.json(await getAppealDeadlines());
    }

    if (view === 'staff-metrics') {
      return NextResponse.json(await getStaffMetrics());
    }

    if (view === 'nl-query') {
      const q = searchParams.get('q') || '';
      return NextResponse.json(await executeNLQuery(q));
    }

    const stats = await getDashboardStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
  }
}
