import { NextRequest, NextResponse } from 'next/server';
import { getDenialById, updateDenial } from '@/lib/data';
import { createBatchJob, getBatchJob, getAllBatchJobs, updateBatchJob, addBatchResult, cancelBatchJob } from '@/lib/batch-processor';
import { callAzureOpenAI, parseJSONResponse, DENIAL_ANALYSIS_PROMPT, CORRECTION_SUGGESTION_PROMPT, QUALITY_CHECKER_PROMPT } from '@/lib/azure-openai';
import { createAuditLog } from '@/lib/audit';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobType, denialIds } = body;

    if (!jobType || !denialIds || !Array.isArray(denialIds) || denialIds.length === 0) {
      return NextResponse.json({ error: 'jobType and denialIds array required' }, { status: 400 });
    }

    if (!['analyze', 'correct', 'quality_check'].includes(jobType)) {
      return NextResponse.json({ error: 'Invalid jobType. Must be: analyze, correct, quality_check' }, { status: 400 });
    }

    const job = createBatchJob({ jobType, denialIds });

    createAuditLog({
      action: 'batch_start',
      entityType: 'batch_job',
      entityId: job.id,
      metadata: { jobType, totalItems: denialIds.length },
    });

    // Start processing asynchronously (non-blocking)
    updateBatchJob(job.id, { status: 'running', startedAt: new Date().toISOString() });

    // Process each denial
    processBatch(job.id, jobType, denialIds);

    return NextResponse.json({ job });
  } catch (error) {
    console.error('Error creating batch job:', error);
    return NextResponse.json({ error: 'Failed to create batch job' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('id');
    const status = searchParams.get('status');
    const jobType = searchParams.get('jobType');

    if (jobId) {
      const job = getBatchJob(jobId);
      if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      return NextResponse.json({ job });
    }

    const jobs = getAllBatchJobs({
      status: status || undefined,
      jobType: jobType || undefined,
    });

    return NextResponse.json({ jobs });
  } catch (error) {
    console.error('Error fetching batch jobs:', error);
    return NextResponse.json({ error: 'Failed to fetch batch jobs' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('id');

    if (!jobId) {
      return NextResponse.json({ error: 'Job ID required' }, { status: 400 });
    }

    const job = cancelBatchJob(jobId);
    if (!job) {
      return NextResponse.json({ error: 'Job not found or already completed' }, { status: 404 });
    }

    return NextResponse.json({ job });
  } catch (error) {
    console.error('Error cancelling batch job:', error);
    return NextResponse.json({ error: 'Failed to cancel batch job' }, { status: 500 });
  }
}

async function processBatch(jobId: string, jobType: string, denialIds: string[]) {
  for (const denialId of denialIds) {
    const job = getBatchJob(jobId);
    if (!job || job.status === 'cancelled') break;

    try {
      const denial = await getDenialById(denialId);
      if (!denial) {
        addBatchResult(jobId, { denialId, success: false, error: 'Denial not found' });
        continue;
      }

      const claimData = JSON.stringify({
        claimNumber: denial.claimNumber,
        patientName: denial.patientName,
        payerName: denial.payerName,
        dateOfService: denial.dateOfService,
        cptCode: denial.cptCode,
        modifier: denial.modifier,
        diagnosisCode: denial.diagnosisCode,
        billedAmount: denial.billedAmount,
        deniedAmount: denial.deniedAmount,
        carcCode: denial.carcCode,
        rarcCode: denial.rarcCode,
        adjustmentGroupCode: denial.adjustmentGroupCode,
        denialCategory: denial.denialCategory,
      });

      let prompt = '';
      let userMessage = '';
      let newStatus = '';

      switch (jobType) {
        case 'analyze':
          prompt = DENIAL_ANALYSIS_PROMPT;
          userMessage = `Analyze this denied claim:\n${claimData}`;
          newStatus = 'Analyzed';
          break;
        case 'correct':
          prompt = CORRECTION_SUGGESTION_PROMPT;
          userMessage = `Suggest corrections for this denied claim:\n${claimData}\nAnalysis: ${JSON.stringify(denial.analysis || {})}`;
          newStatus = 'Corrected';
          break;
        case 'quality_check':
          prompt = QUALITY_CHECKER_PROMPT;
          userMessage = `Quality check this correction:\n${claimData}\nCorrection: ${JSON.stringify(denial.correction || {})}`;
          newStatus = 'Reviewed';
          break;
      }

      try {
        const responseText = await callAzureOpenAI(prompt, userMessage);
        const parsed = parseJSONResponse(responseText);

        // Update denial based on job type
        const updates: Record<string, unknown> = { status: newStatus };
        if (jobType === 'analyze') updates.analysis = { ...parsed, analyzedAt: new Date().toISOString() };
        if (jobType === 'correct') updates.correction = { ...parsed, createdAt: new Date().toISOString() };
        if (jobType === 'quality_check') updates.qualityCheck = { ...parsed, checkedAt: new Date().toISOString() };

        await updateDenial(denialId, updates as any);
        addBatchResult(jobId, { denialId, success: true });
      } catch (aiError) {
        // AI failed but we can still mark as processed with fallback
        addBatchResult(jobId, { denialId, success: false, error: String(aiError) });
      }
    } catch (err) {
      addBatchResult(jobId, { denialId, success: false, error: String(err) });
    }
  }

  // Final job status update
  const finalJob = getBatchJob(jobId);
  if (finalJob && finalJob.status !== 'cancelled') {
    updateBatchJob(jobId, {
      status: finalJob.failedItems === finalJob.totalItems ? 'failed' : 'completed',
      completedAt: new Date().toISOString(),
    });

    createAuditLog({
      action: 'batch_complete',
      entityType: 'batch_job',
      entityId: jobId,
      metadata: {
        totalItems: finalJob.totalItems,
        processedItems: finalJob.processedItems,
        failedItems: finalJob.failedItems,
      },
    });
  }
}
