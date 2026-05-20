import { NextRequest, NextResponse } from 'next/server';
import { generateHealthScan } from '@/lib/health-scan';
import { createAuditLog } from '@/lib/audit';
import { getCurrentUser } from '@/lib/auth';
import { normalizeCSV, type BillingFormat } from '@/lib/csv-normalizer';
import { getDenials, addDenials } from '@/lib/data';
import type { Denial, OverviewReport } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    // ─── Handle CSV file upload (FormData) ────────────────────────────────
    if (contentType.includes('multipart/form-data') || contentType.includes('form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      const practiceType = (formData.get('practiceType') as string) || 'medical';
      const forcedFormat = formData.get('format') as BillingFormat | null;

      if (!file) {
        return NextResponse.json({ error: 'No CSV file provided. Please upload a file.' }, { status: 400 });
      }

      // Read the CSV content
      const csvText = await file.text();

      if (!csvText || csvText.trim().length === 0) {
        return NextResponse.json({ error: 'The uploaded CSV file is empty.' }, { status: 400 });
      }

      // ─── NORMALIZE: Convert any billing format to unified model ───────
      const result = normalizeCSV(csvText, forcedFormat || undefined);

      if (!result.success || result.denials.length === 0) {
        const errorMsg = result.errors.length > 0
          ? `Could not process your CSV: ${result.errors.slice(0, 3).map(e => e.error).join('; ')}`
          : 'No valid denial records found in the uploaded file. Please check the CSV format.';

        return NextResponse.json({
          error: errorMsg,
          detectedFormat: result.detectedFormatName,
          unmappedColumns: result.unmappedColumns,
          warnings: result.warnings.map(w => w.warning),
          stats: result.stats,
        }, { status: 400 });
      }

      // ─── Store the imported denials ──────────────────────────────────────
      await addDenials(result.denials);

      // ─── Generate the Overview Report ────────────────────────────────────
      const denials = result.denials;
      const totalClaims = denials.length;
      const totalDeniedAmount = denials.reduce((s, d) => s + d.deniedAmount, 0);
      const totalBilledAmount = denials.reduce((s, d) => s + d.billedAmount, 0);

      // Calculate recovery potential
      const correctableEstimate = Math.round(totalDeniedAmount * 0.70); // 70% correctable
      const highConfidence = Math.round(correctableEstimate * 0.50);
      const mediumConfidence = Math.round(correctableEstimate * 0.30);
      const lowConfidence = Math.round(correctableEstimate * 0.20);

      // Category breakdown
      const categoryMap = new Map<string, { count: number; amount: number }>();
      denials.forEach(d => {
        const cat = d.denialCategory || 'other';
        const existing = categoryMap.get(cat) || { count: 0, amount: 0 };
        categoryMap.set(cat, { count: existing.count + 1, amount: existing.amount + d.deniedAmount });
      });
      const categoryBreakdown = Array.from(categoryMap.entries()).map(([category, data]) => ({
        category: category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        count: data.count,
        amount: data.amount,
        percentage: totalClaims > 0 ? Math.round((data.count / totalClaims) * 100) : 0,
      })).sort((a, b) => b.amount - a.amount);

      // Payer breakdown
      const payerMap = new Map<string, { count: number; amount: number }>();
      denials.forEach(d => {
        const existing = payerMap.get(d.payerName) || { count: 0, amount: 0 };
        payerMap.set(d.payerName, { count: existing.count + 1, amount: existing.amount + d.deniedAmount });
      });
      const payerBreakdown = Array.from(payerMap.entries()).map(([payer, data]) => ({
        payer,
        count: data.count,
        amount: data.amount,
        denialRate: totalClaims > 0 ? Math.round((data.count / totalClaims) * 100) : 0,
      })).sort((a, b) => b.amount - a.amount);

      // Top denial reasons by CARC code
      const carcMap = new Map<string, { count: number; amount: number; reason: string }>();
      denials.forEach(d => {
        const code = d.carcCode || 'CO-16';
        const existing = carcMap.get(code) || { count: 0, amount: 0, reason: code };
        carcMap.set(code, { count: existing.count + 1, amount: existing.amount + d.deniedAmount, reason: code });
      });
      const topDenialReasons = Array.from(carcMap.entries()).map(([carcCode, data]) => ({
        reason: data.reason,
        carcCode,
        count: data.count,
        amount: data.amount,
      })).sort((a, b) => b.amount - a.amount).slice(0, 10);

      // Key issues (severity-based)
      const keyIssues = categoryBreakdown.slice(0, 5).map((cat, idx) => ({
        issue: `${cat.category} denials`,
        severity: cat.percentage > 30 ? 'critical' as const : cat.percentage > 15 ? 'high' as const : cat.percentage > 5 ? 'medium' as const : 'low' as const,
        affectedClaims: cat.count,
        affectedAmount: cat.amount,
        description: `${cat.count} claims denied for ${cat.category.toLowerCase()} reasons, totaling $${cat.amount.toLocaleString()} (${cat.percentage}% of all denials).`,
      }));

      // Overall rating (0-10 scale)
      const denialRate = totalBilledAmount > 0 ? (totalDeniedAmount / totalBilledAmount) * 100 : 15;
      const overallRating = Math.max(1, Math.min(10, Math.round(10 - (denialRate / 3))));
      const ratingLabels: Record<number, string> = { 10: 'Exceptional', 9: 'Excellent', 8: 'Very Good', 7: 'Good', 6: 'Above Average', 5: 'Average', 4: 'Below Average', 3: 'Needs Improvement', 2: 'Poor', 1: 'Critical' };
      const ratingColors: Record<number, string> = { 10: 'text-emerald-400', 9: 'text-emerald-400', 8: 'text-emerald-400', 7: 'text-blue-400', 6: 'text-blue-400', 5: 'text-yellow-400', 4: 'text-yellow-400', 3: 'text-orange-400', 2: 'text-orange-400', 1: 'text-red-400' };

      // Recommendations
      const recommendations: string[] = [];
      if (denialRate > 15) recommendations.push('Your denial rate significantly exceeds the 12% industry average. Focus on front-end prevention.');
      if (categoryBreakdown.find(c => c.category === 'Coding Error')) recommendations.push('Implement pre-submission claim scrubbing to catch coding errors before submission.');
      if (categoryBreakdown.find(c => c.category === 'Eligibility')) recommendations.push('Add real-time eligibility verification before every appointment.');
      if (categoryBreakdown.find(c => c.category === 'Authorization')) recommendations.push('Establish prior authorization workflow for all scheduled procedures.');
      if (categoryBreakdown.find(c => c.category === 'Timely Filing')) recommendations.push('Set up automated filing deadline alerts at 14 and 7 days.');
      if (categoryBreakdown.find(c => c.category === 'Bundling')) recommendations.push('Add NCCI edit checks to catch bundling issues before submission.');
      if (recommendations.length === 0) recommendations.push('Practice performance is within healthy parameters. Continue monitoring denial patterns.');

      // Build the overview report
      const report: OverviewReport = {
        id: `RPT-${Date.now()}`,
        fileName: file.name,
        uploadDate: new Date().toISOString(),
        totalClaims,
        totalDeniedAmount,
        overallRating,
        ratingLabel: ratingLabels[overallRating] || 'Average',
        ratingColor: ratingColors[overallRating] || 'text-yellow-400',
        executiveSummary: overallRating >= 7
          ? `Your practice shows a ${overallRating}/10 health rating with ${totalClaims} denied claims totaling $${totalDeniedAmount.toLocaleString()}. The denial rate of ${denialRate.toFixed(1)}% is within acceptable range. Estimated $${correctableEstimate.toLocaleString()} is recoverable.`
          : overallRating >= 4
          ? `Your practice has a ${overallRating}/10 health rating with ${totalClaims} denied claims totaling $${totalDeniedAmount.toLocaleString()}. The denial rate of ${denialRate.toFixed(1)}% exceeds the industry average. Estimated $${correctableEstimate.toLocaleString()} is recoverable with targeted intervention.`
          : `Your practice has a critical ${overallRating}/10 health rating with ${totalClaims} denied claims totaling $${totalDeniedAmount.toLocaleString()}. The denial rate of ${denialRate.toFixed(1)}% significantly exceeds industry standards. Immediate action is required to recover an estimated $${correctableEstimate.toLocaleString()}.`,
        keyIssues,
        categoryBreakdown,
        payerBreakdown,
        recoveryPotential: {
          estimatedRecoverable: correctableEstimate,
          recoveryPercentage: totalDeniedAmount > 0 ? Math.round((correctableEstimate / totalDeniedAmount) * 100) : 0,
          highConfidence,
          mediumConfidence,
          lowConfidence,
        },
        topDenialReasons,
        recommendations,
        contractStatus: 'unsigned',
        importedDenialIds: denials.map(d => d.id),
      };

      // Audit log
      try {
        const currentUser = getCurrentUser();
        createAuditLog({
          userId: currentUser.id,
          userName: currentUser.name,
          action: 'create',
          entityType: 'health_scan',
          entityId: report.id,
          metadata: {
            fileName: file.name,
            format: result.detectedFormat,
            totalClaims,
            overallRating,
            totalDeniedAmount,
          },
        });
      } catch {}

      return NextResponse.json({
        report,
        normalization: {
          detectedFormat: result.detectedFormat,
          detectedFormatName: result.detectedFormatName,
          stats: result.stats,
          warnings: result.warnings.slice(0, 10),
          unmappedColumns: result.unmappedColumns,
          columnMapping: result.columnMapping,
        },
      });
    }

    // ─── Handle JSON body (existing behavior) ────────────────────────────
    const body = await request.json();
    const { clientName, totalClaimsSubmitted } = body;

    const report = await generateHealthScan({ clientName, totalClaimsSubmitted });

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
    const message = error instanceof Error ? error.message : 'Failed to generate health scan. Please ensure the CSV format is correct and try again.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PATCH for contract signing
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { reportId, contractStatus, signedBy } = body;

    if (contractStatus === 'signed' && signedBy) {
      return NextResponse.json({
        report: {
          id: reportId,
          contractStatus: 'signed',
          signedAt: new Date().toISOString(),
          signedBy,
        },
      });
    }

    return NextResponse.json({ error: 'Invalid contract signing request' }, { status: 400 });
  } catch (error) {
    console.error('Error signing contract:', error);
    return NextResponse.json({ error: 'Failed to sign contract' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const report = await generateHealthScan({});
    return NextResponse.json({ report });
  } catch (error) {
    console.error('Error fetching health scan:', error);
    return NextResponse.json({ error: 'Failed to fetch health scan' }, { status: 500 });
  }
}
