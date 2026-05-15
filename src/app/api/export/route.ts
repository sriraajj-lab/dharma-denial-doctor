import { NextRequest, NextResponse } from 'next/server';
import { getDenials, getDenialById } from '@/lib/data';
import { createAuditLog } from '@/lib/audit';
import { getCurrentUser } from '@/lib/auth';
import { Denial } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'csv';
    const denialIds = searchParams.get('denialIds')?.split(',');
    const status = searchParams.get('status');
    const category = searchParams.get('category');

    let denials = await getDenials();

    // Apply filters
    if (denialIds && denialIds.length > 0) {
      denials = denials.filter((d) => denialIds.includes(d.id));
    }
    if (status) {
      denials = denials.filter((d) => d.status === status);
    }
    if (category) {
      denials = denials.filter((d) => d.denialCategory === category);
    }

    const currentUser = getCurrentUser();
    createAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      action: 'export',
      entityType: 'denial',
      metadata: { format, count: denials.length, filters: { status, category } },
    });

    switch (format) {
      case 'csv':
        return exportCSV(denials);
      case 'json':
        return exportJSON(denials);
      case 'summary':
        return exportSummary(denials);
      default:
        return NextResponse.json({ error: 'Invalid format. Use: csv, json, summary' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error exporting:', error);
    return NextResponse.json({ error: 'Failed to export' }, { status: 500 });
  }
}

function exportCSV(denials: Denial[]): NextResponse {
  const headers = [
    'ID', 'Claim Number', 'Patient Name', 'Payer', 'Date of Service', 'Denial Date',
    'CPT Code', 'Modifier', 'Diagnosis Code', 'Billed Amount', 'Denied Amount',
    'CARC Code', 'RARC Code', 'Category', 'Status', 'Priority',
    'Root Cause', 'Correctable', 'Appeal Recommended', 'Created At',
  ];

  const rows = denials.map((d) => [
    d.id,
    d.claimNumber,
    `"${d.patientName}"`,
    `"${d.payerName}"`,
    d.dateOfService,
    d.denialDate,
    d.cptCode,
    d.modifier || '',
    d.diagnosisCode,
    d.billedAmount.toFixed(2),
    d.deniedAmount.toFixed(2),
    d.carcCode,
    d.rarcCode || '',
    d.denialCategory,
    d.status,
    d.priority,
    `"${d.analysis?.rootCauseCategory || ''}"`,
    d.analysis?.correctable ? 'Yes' : 'No',
    d.analysis?.appealRecommended ? 'Yes' : 'No',
    d.createdAt,
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

  return new NextResponse(csvContent, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="denials-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

function exportJSON(denials: Denial[]): NextResponse {
  const exportData = {
    exportDate: new Date().toISOString(),
    totalRecords: denials.length,
    totalDeniedAmount: denials.reduce((sum, d) => sum + d.deniedAmount, 0),
    denials: denials.map((d) => ({
      id: d.id,
      claimNumber: d.claimNumber,
      patientName: d.patientName,
      payerName: d.payerName,
      dateOfService: d.dateOfService,
      denialDate: d.denialDate,
      cptCode: d.cptCode,
      modifier: d.modifier,
      diagnosisCode: d.diagnosisCode,
      billedAmount: d.billedAmount,
      deniedAmount: d.deniedAmount,
      carcCode: d.carcCode,
      rarcCode: d.rarcCode,
      denialCategory: d.denialCategory,
      status: d.status,
      priority: d.priority,
      analysis: d.analysis ? {
        rootCause: d.analysis.rootCauseCategory,
        correctable: d.analysis.correctable,
        appealRecommended: d.analysis.appealRecommended,
        nextAction: d.analysis.recommendedNextAction,
      } : null,
    })),
  };

  const jsonContent = JSON.stringify(exportData, null, 2);

  return new NextResponse(jsonContent, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="denials-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}

function exportSummary(denials: Denial[]): NextResponse {
  const totalDenied = denials.reduce((sum, d) => sum + d.deniedAmount, 0);
  const correctable = denials.filter((d) => d.analysis?.correctable).length;
  const appealable = denials.filter((d) => d.analysis?.appealRecommended).length;

  // Category breakdown
  const categoryMap = new Map<string, { count: number; amount: number }>();
  denials.forEach((d) => {
    const cat = d.denialCategory || 'other';
    const existing = categoryMap.get(cat) || { count: 0, amount: 0 };
    categoryMap.set(cat, { count: existing.count + 1, amount: existing.amount + d.deniedAmount });
  });

  // Payer breakdown
  const payerMap = new Map<string, { count: number; amount: number }>();
  denials.forEach((d) => {
    const existing = payerMap.get(d.payerName) || { count: 0, amount: 0 };
    payerMap.set(d.payerName, { count: existing.count + 1, amount: existing.amount + d.deniedAmount });
  });

  const summary = `
DENIAL MANAGEMENT SUMMARY REPORT
Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
${'='.repeat(60)}

OVERVIEW
--------
Total Denials: ${denials.length}
Total Denied Amount: $${totalDenied.toLocaleString('en-US', { minimumFractionDigits: 2 })}
Correctable: ${correctable} (${denials.length > 0 ? Math.round((correctable / denials.length) * 100) : 0}%)
Appeal Recommended: ${appealable} (${denials.length > 0 ? Math.round((appealable / denials.length) * 100) : 0}%)

STATUS BREAKDOWN
----------------
${['New', 'Analyzed', 'Corrected', 'Reviewed', 'Resubmitted', 'Appealed', 'Closed']
  .map((s) => {
    const count = denials.filter((d) => d.status === s).length;
    return `  ${s}: ${count}`;
  })
  .join('\n')}

CATEGORY BREAKDOWN
------------------
${Array.from(categoryMap.entries())
  .sort((a, b) => b[1].amount - a[1].amount)
  .map(([cat, data]) => `  ${cat}: ${data.count} claims, $${data.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`)
  .join('\n')}

PAYER BREAKDOWN
---------------
${Array.from(payerMap.entries())
  .sort((a, b) => b[1].amount - a[1].amount)
  .map(([payer, data]) => `  ${payer}: ${data.count} claims, $${data.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`)
  .join('\n')}

${'='.repeat(60)}
End of Report
`;

  return new NextResponse(summary, {
    headers: {
      'Content-Type': 'text/plain',
      'Content-Disposition': `attachment; filename="denials-summary-${new Date().toISOString().slice(0, 10)}.txt"`,
    },
  });
}
