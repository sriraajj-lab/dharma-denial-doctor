import { NextRequest, NextResponse } from 'next/server';
import { bulkCreateDenials, getDenials } from '@/lib/data';
import { callAzureOpenAI, parseJSONResponse, OVERVIEW_SCAN_PROMPT } from '@/lib/azure-openai';
import { OverviewReport } from '@/lib/types';

// In-memory store for overview reports (works on Vercel serverless)
const overviewReports = new Map<string, OverviewReport>();

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const text = await file.text();
    const lines = text.split('\n').filter((line) => line.trim() !== '');

    if (lines.length < 2) {
      return NextResponse.json({ error: 'CSV file must contain at least a header row and one data row' }, { status: 400 });
    }

    const headers = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));

    const requiredHeaders = [
      'ClaimNumber', 'PatientName', 'PatientDOB', 'PayerName', 'PayerID',
      'ProviderNPI', 'DateOfService', 'DenialDate', 'CPTCode', 'Modifier',
      'DiagnosisCode', 'BilledAmount', 'DeniedAmount', 'CARCCode', 'RARCCode',
      'AdjustmentGroupCode',
    ];

    const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));
    if (missingHeaders.length > 0) {
      return NextResponse.json(
        { error: `Missing required columns: ${missingHeaders.join(', ')}` },
        { status: 400 }
      );
    }

    // Parse all rows
    const parsedRows: Array<Record<string, string>> = [];
    const denials: Array<Record<string, unknown>> = [];
    const errors: Array<{ row: number; error: string }> = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      const row: Record<string, string> = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx]?.trim().replace(/"/g, '') || '';
      });
      parsedRows.push(row);

      try {
        denials.push({
          claimNumber: row.ClaimNumber,
          patientName: row.PatientName,
          patientDOB: row.PatientDOB,
          payerName: row.PayerName,
          payerId: row.PayerID,
          providerNPI: row.ProviderNPI,
          dateOfService: row.DateOfService,
          denialDate: row.DenialDate,
          cptCode: row.CPTCode,
          modifier: row.Modifier,
          diagnosisCode: row.DiagnosisCode,
          billedAmount: parseFloat(row.BilledAmount) || 0,
          deniedAmount: parseFloat(row.DeniedAmount) || 0,
          carcCode: row.CARCCode,
          rarcCode: row.RARCCode,
          adjustmentGroupCode: row.AdjustmentGroupCode,
          denialCategory: mapCARCToCategory(row.CARCCode),
          status: 'New',
          priority: determinePriority(row.CARCCode, parseFloat(row.DeniedAmount) || 0),
        });
      } catch (e) {
        errors.push({ row: i + 1, error: String(e) });
      }
    }

    if (denials.length === 0) {
      return NextResponse.json({ error: 'No valid denial records found in CSV', errors }, { status: 400 });
    }

    // Compute aggregate statistics for AI analysis
    const totalClaims = denials.length;
    const totalDeniedAmount = denials.reduce((sum: number, d: Record<string, unknown>) => sum + ((d.deniedAmount as number) || 0), 0);

    // Category aggregation
    const categoryMap = new Map<string, { count: number; amount: number }>();
    denials.forEach((d) => {
      const cat = (d.denialCategory as string) || 'other';
      const existing = categoryMap.get(cat) || { count: 0, amount: 0 };
      categoryMap.set(cat, { count: existing.count + 1, amount: existing.amount + ((d.deniedAmount as number) || 0) });
    });

    // Payer aggregation
    const payerMap = new Map<string, { count: number; amount: number }>();
    denials.forEach((d) => {
      const payer = (d.payerName as string) || 'Unknown';
      const existing = payerMap.get(payer) || { count: 0, amount: 0 };
      payerMap.set(payer, { count: existing.count + 1, amount: existing.amount + ((d.deniedAmount as number) || 0) });
    });

    // CARC code aggregation
    const carcMap = new Map<string, { count: number; amount: number }>();
    denials.forEach((d) => {
      const carc = (d.carcCode as string) || 'Unknown';
      const existing = carcMap.get(carc) || { count: 0, amount: 0 };
      carcMap.set(carc, { count: existing.count + 1, amount: existing.amount + ((d.deniedAmount as number) || 0) });
    });

    // Build summary for AI
    const batchSummary = {
      totalClaims,
      totalDeniedAmount,
      categoryBreakdown: Array.from(categoryMap.entries()).map(([category, data]) => ({ category, ...data })),
      payerBreakdown: Array.from(payerMap.entries()).map(([payer, data]) => ({ payer, ...data })),
      carcCodeBreakdown: Array.from(carcMap.entries()).map(([carcCode, data]) => ({ carcCode, ...data })),
      sampleClaims: denials.slice(0, 20).map((d) => ({
        claimNumber: d.claimNumber,
        payer: d.payerName,
        cptCode: d.cptCode,
        diagnosisCode: d.diagnosisCode,
        carcCode: d.carcCode,
        rarcCode: d.rarcCode,
        deniedAmount: d.deniedAmount,
        category: d.denialCategory,
      })),
    };

    // Call Azure GPT-5.5 for overview analysis
    let overviewData: Record<string, unknown>;
    try {
      const responseText = await callAzureOpenAI(
        OVERVIEW_SCAN_PROMPT,
        `Analyze this batch of denied medical claims and provide an overview assessment:\n${JSON.stringify(batchSummary, null, 2)}`
      );
      overviewData = parseJSONResponse(responseText);
    } catch (aiError) {
      console.error('AI overview scan failed, using statistical fallback:', aiError);
      overviewData = generateFallbackOverview(batchSummary);
    }

    // Import denials into the data store
    const created = bulkCreateDenials(denials as Parameters<typeof bulkCreateDenials>[0]);
    const importedDenialIds = created.map((d) => d.id);

    // Build the full OverviewReport
    const reportId = `RPT-${Date.now()}`;
    const rating = Number(overviewData.overall_rating) || 5;
    const ratingLabel = String(overviewData.rating_label || 'Needs Attention');
    const ratingColor = rating >= 8 ? 'text-emerald-400' : rating >= 5 ? 'text-yellow-400' : rating >= 3 ? 'text-orange-400' : 'text-red-400';

    const report: OverviewReport = {
      id: reportId,
      fileName: file.name,
      uploadDate: new Date().toISOString(),
      totalClaims,
      totalDeniedAmount,
      overallRating: rating,
      ratingLabel,
      ratingColor,
      executiveSummary: String(overviewData.executive_summary || 'Denial report analysis completed.'),
      keyIssues: Array.isArray(overviewData.key_issues)
        ? overviewData.key_issues.map((issue: Record<string, unknown>) => ({
            issue: String(issue.issue || ''),
            severity: (['critical', 'high', 'medium', 'low'].includes(String(issue.severity)) ? issue.severity : 'medium') as 'critical' | 'high' | 'medium' | 'low',
            affectedClaims: Number(issue.affected_claims || issue.affectedClaims || 0),
            affectedAmount: Number(issue.affected_amount || issue.affectedAmount || 0),
            description: String(issue.description || ''),
          }))
        : generateFallbackKeyIssues(batchSummary),
      categoryBreakdown: Array.from(categoryMap.entries()).map(([category, data]) => ({
        category,
        count: data.count,
        amount: data.amount,
        percentage: totalClaims > 0 ? Math.round((data.count / totalClaims) * 100) : 0,
      })),
      payerBreakdown: Array.from(payerMap.entries()).map(([payer, data]) => ({
        payer,
        count: data.count,
        amount: data.amount,
        denialRate: totalClaims > 0 ? Math.round((data.count / totalClaims) * 100) : 0,
      })),
      recoveryPotential: {
        estimatedRecoverable: Number(overviewData.recovery_potential?.estimated_recoverable || overviewData.recovery_potential?.estimatedRecoverable || totalDeniedAmount * 0.55),
        recoveryPercentage: Number(overviewData.recovery_potential?.recovery_percentage || overviewData.recovery_potential?.recoveryPercentage || 55),
        highConfidence: Number(overviewData.recovery_potential?.high_confidence || overviewData.recovery_potential?.highConfidence || totalDeniedAmount * 0.3),
        mediumConfidence: Number(overviewData.recovery_potential?.medium_confidence || overviewData.recovery_potential?.mediumConfidence || totalDeniedAmount * 0.15),
        lowConfidence: Number(overviewData.recovery_potential?.low_confidence || overviewData.recovery_potential?.lowConfidence || totalDeniedAmount * 0.1),
      },
      topDenialReasons: Array.isArray(overviewData.top_denial_reasons)
        ? overviewData.top_denial_reasons.map((reason: Record<string, unknown>) => ({
            reason: String(reason.reason || ''),
            carcCode: String(reason.carc_code || reason.carcCode || ''),
            count: Number(reason.count || 0),
            amount: Number(reason.amount || 0),
          }))
        : Array.from(carcMap.entries()).slice(0, 5).map(([code, data]) => ({
            reason: `Denial code ${code}`,
            carcCode: code,
            count: data.count,
            amount: data.amount,
          })),
      recommendations: Array.isArray(overviewData.recommendations)
        ? overviewData.recommendations.map((r: string) => String(r))
        : ['Review all denied claims and prioritize correctable denials for resubmission.'],
      contractStatus: 'unsigned',
      importedDenialIds,
    };

    // Store the report
    overviewReports.set(reportId, report);

    return NextResponse.json({
      report,
      imported: created.length,
      errors: errors.length,
      errorDetails: errors,
    });
  } catch (error) {
    console.error('Error in overview scan:', error);
    return NextResponse.json({ error: 'Failed to process overview scan' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { reportId, contractStatus, signedBy } = body;

    if (!reportId) {
      return NextResponse.json({ error: 'Report ID is required' }, { status: 400 });
    }

    const report = overviewReports.get(reportId);
    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    report.contractStatus = contractStatus || 'signed';
    if (contractStatus === 'signed') {
      report.signedAt = new Date().toISOString();
      report.signedBy = signedBy || 'Client';
    }

    overviewReports.set(reportId, report);

    return NextResponse.json({ report });
  } catch (error) {
    console.error('Error updating report:', error);
    return NextResponse.json({ error: 'Failed to update report' }, { status: 500 });
  }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
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

function generateFallbackOverview(batchSummary: { totalClaims: number; totalDeniedAmount: number; categoryBreakdown: Array<{ category: string; count: number; amount: number }>; carcCodeBreakdown: Array<{ carcCode: string; count: number; amount: number }> }): Record<string, unknown> {
  const totalClaims = batchSummary.totalClaims;
  const totalDeniedAmount = batchSummary.totalDeniedAmount;

  // Determine rating based on category mix
  const codingErrors = batchSummary.categoryBreakdown.find(c => c.category === 'coding_error')?.count || 0;
  const authIssues = batchSummary.categoryBreakdown.find(c => c.category === 'authorization')?.count || 0;
  const timelyFiling = batchSummary.categoryBreakdown.find(c => c.category === 'timely_filing')?.count || 0;
  const eligibility = batchSummary.categoryBreakdown.find(c => c.category === 'eligibility')?.count || 0;

  const correctableRatio = (codingErrors + authIssues) / Math.max(totalClaims, 1);
  const nonRecoverableRatio = (timelyFiling + eligibility) / Math.max(totalClaims, 1);

  let rating = 5;
  if (correctableRatio > 0.5) rating = 7;
  if (correctableRatio > 0.7) rating = 8;
  if (nonRecoverableRatio > 0.5) rating = 3;
  if (nonRecoverableRatio > 0.7) rating = 2;

  return {
    overall_rating: rating,
    rating_label: rating >= 8 ? 'Good' : rating >= 5 ? 'Needs Attention' : rating >= 3 ? 'Poor' : 'Critical',
    executive_summary: `This denial report contains ${totalClaims} denied claims totaling $${totalDeniedAmount.toLocaleString()}. ${rating >= 5 ? 'A significant portion of these denials appear correctable through standard remediation processes.' : 'Many of these denials may be difficult to recover due to the nature of the denial reasons.'}`,
    key_issues: generateFallbackKeyIssues(batchSummary),
    top_denial_reasons: batchSummary.carcCodeBreakdown.slice(0, 5).map(c => ({
      reason: `Denial code ${c.carcCode}`,
      carc_code: c.carcCode,
      count: c.count,
      amount: c.amount,
    })),
    recovery_potential: {
      estimated_recoverable: totalDeniedAmount * (correctableRatio * 0.8 + 0.1),
      recovery_percentage: Math.round((correctableRatio * 0.8 + 0.1) * 100),
      high_confidence: totalDeniedAmount * correctableRatio * 0.6,
      medium_confidence: totalDeniedAmount * correctableRatio * 0.2,
      low_confidence: totalDeniedAmount * 0.1,
    },
    recommendations: [
      'Prioritize coding error denials for immediate correction and resubmission',
      'Obtain retrospective authorizations where applicable',
      'Review eligibility verification processes to prevent future denials',
      'Implement claim scrubbing before submission to catch common errors',
    ],
  };
}

function generateFallbackKeyIssues(batchSummary: { totalClaims: number; totalDeniedAmount: number; categoryBreakdown: Array<{ category: string; count: number; amount: number }> }): Array<{ issue: string; severity: 'critical' | 'high' | 'medium' | 'low'; affectedClaims: number; affectedAmount: number; description: string }> {
  const issues: Array<{ issue: string; severity: 'critical' | 'high' | 'medium' | 'low'; affectedClaims: number; affectedAmount: number; description: string }> = [];

  for (const cat of batchSummary.categoryBreakdown) {
    if (cat.count === 0) continue;
    const severityMap: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {
      coding_error: 'high',
      missing_information: 'high',
      authorization: 'medium',
      eligibility: 'critical',
      medical_necessity: 'medium',
      timely_filing: 'critical',
      duplicate: 'low',
      bundling: 'medium',
      other: 'low',
    };
    const labelMap: Record<string, string> = {
      coding_error: 'Coding Errors',
      missing_information: 'Missing Information',
      authorization: 'Authorization Issues',
      eligibility: 'Eligibility Denials',
      medical_necessity: 'Medical Necessity Denials',
      timely_filing: 'Timely Filing Violations',
      duplicate: 'Duplicate Claims',
      bundling: 'Bundling Issues',
      other: 'Other Denials',
    };
    issues.push({
      issue: labelMap[cat.category] || cat.category,
      severity: severityMap[cat.category] || 'low',
      affectedClaims: cat.count,
      affectedAmount: cat.amount,
      description: `${cat.count} claims denied due to ${labelMap[cat.category] || cat.category} totaling $${cat.amount.toLocaleString()}`,
    });
  }

  return issues.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return order[a.severity] - order[b.severity];
  });
}
