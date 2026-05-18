import { NextRequest, NextResponse } from 'next/server';
import { getDenialById, updateDenial } from '@/lib/data';
import { batchProcessor } from '@/lib/batch-processor';
import { callAzureOpenAI, parseJSONResponse, DENIAL_ANALYSIS_PROMPT, CORRECTION_SUGGESTION_PROMPT, QUALITY_CHECKER_PROMPT } from '@/lib/azure-openai';
import { analyzeDentalDenial } from '@/lib/dental-cdt-codes';
import { createAuditLog } from '@/lib/audit';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobType, denialIds, level, practiceType, config } = body;

    if (!jobType || !denialIds || !Array.isArray(denialIds) || denialIds.length === 0) {
      return NextResponse.json({ error: 'jobType and denialIds array required' }, { status: 400 });
    }

    const validJobTypes = ['analyze', 'correct', 'quality_check', 'appeal_generate', 'batch_scan', 'batch_fix'];
    if (!validJobTypes.includes(jobType)) {
      return NextResponse.json({ error: `Invalid jobType. Must be one of: ${validJobTypes.join(', ')}` }, { status: 400 });
    }

    // Volume limit warning for very large batches
    if (denialIds.length > 50000) {
      return NextResponse.json({
        error: 'Maximum batch size is 50,000 claims. Please split into multiple batches.',
        suggestion: `Split into ${Math.ceil(denialIds.length / 50000)} batches of 50,000 or fewer.`,
      }, { status: 400 });
    }

    const accessLevel = level || 1;
    const pType = practiceType || 'medical';

    // Create optimized batch job using the BatchProcessorManager
    const managedJob = batchProcessor.createJob(
      denialIds,
      jobType,
      accessLevel,
      config
    );

    createAuditLog({
      action: 'batch_start',
      entityType: 'batch_job',
      entityId: managedJob.id,
      metadata: {
        jobType,
        totalItems: denialIds.length,
        accessLevel,
        practiceType: pType,
        chunkSize: managedJob.config.chunkSize,
        maxConcurrency: managedJob.config.maxConcurrency,
      },
    });

    // Start the optimized batch processing asynchronously
    processLargeBatch(managedJob.id, jobType, denialIds, accessLevel, pType);

    return NextResponse.json({
      job: {
        id: managedJob.id,
        jobType: managedJob.jobType,
        status: managedJob.status,
        totalItems: managedJob.totalItems,
        config: {
          chunkSize: managedJob.config.chunkSize,
          maxConcurrency: managedJob.config.maxConcurrency,
          level: managedJob.config.level,
        },
        estimatedDuration: estimateDuration(denialIds.length, accessLevel, jobType),
      },
    });
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
      const managedJob = batchProcessor.getJob(jobId);
      if (!managedJob) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      const progress = batchProcessor.getProgress(jobId);
      const eta = batchProcessor.getEstimatedTimeRemaining(jobId);
      return NextResponse.json({
        job: managedJob,
        progress,
        estimatedTimeRemainingMinutes: eta,
      });
    }

    const managedJobs = batchProcessor.getAllJobs();

    return NextResponse.json({
      jobs: managedJobs.map(j => ({
        id: j.id,
        jobType: j.jobType,
        status: j.status,
        totalItems: j.totalItems,
        processedItems: j.processedItems,
        failedItems: j.failedItems,
        throughput: j.throughput,
        progress: batchProcessor.getProgress(j.id),
        eta: batchProcessor.getEstimatedTimeRemaining(j.id),
      })),
    });
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

    const cancelled = batchProcessor.cancelJob(jobId);
    if (!cancelled) {
      return NextResponse.json({ error: 'Job not found or already completed' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Job cancelled', jobId });
  } catch (error) {
    console.error('Error cancelling batch job:', error);
    return NextResponse.json({ error: 'Failed to cancel batch job' }, { status: 500 });
  }
}

/**
 * Process large batches with chunked parallel processing
 */
async function processLargeBatch(
  managedJobId: string,
  jobType: string,
  denialIds: string[],
  level: number,
  practiceType: string
) {
  const processItem = async (denialId: string, accessLevel: number) => {
    try {
      const denial = await getDenialById(denialId);
      if (!denial) {
        return { success: false, error: 'Denial not found' };
      }

      const claimData = JSON.stringify({
        claimNumber: denial.claimNumber,
        patientName: denial.patientName,
        payerName: denial.payerName,
        dateOfService: denial.dateOfService,
        cptCode: denial.cptCode,
        cdtCode: denial.cdtCode || '',
        codeType: denial.codeType || (practiceType === 'dental' ? 'CDT' : 'CPT'),
        modifier: denial.modifier,
        diagnosisCode: denial.diagnosisCode,
        billedAmount: denial.billedAmount,
        deniedAmount: denial.deniedAmount,
        carcCode: denial.carcCode,
        rarcCode: denial.rarcCode,
        adjustmentGroupCode: denial.adjustmentGroupCode,
        denialCategory: denial.denialCategory,
        practiceType,
      });

      // Level-based processing depth
      switch (jobType) {
        case 'analyze':
        case 'batch_scan': {
          if (practiceType === 'dental') {
            const dentalAnalysis = analyzeDentalDenial(denial);
            await updateDenial(denialId, {
              status: 'Analyzed',
              analysis: {
                denialSummary: dentalAnalysis.denialReason,
                rootCauseCategory: dentalAnalysis.category,
                rootCauseDetail: dentalAnalysis.isFrequencyIssue ? 'Frequency limitation' :
                  dentalAnalysis.missingToothClauseApplies ? 'Missing tooth clause' :
                  dentalAnalysis.denialReason,
                denialCategory: dentalAnalysis.category,
                preventable: true,
                correctable: dentalAnalysis.estimatedSuccessRate > 40,
                appealRecommended: dentalAnalysis.estimatedSuccessRate > 30,
                confidenceScore: dentalAnalysis.estimatedSuccessRate / 100,
                recommendedNextAction: dentalAnalysis.commonFixes[0] || 'Review denial reason',
                requiredInformation: dentalAnalysis.commonFixes.map(f => ({ item: f, reasonNeeded: 'To support appeal or correction' })),
                complianceNotes: dentalAnalysis.appealStrategy.slice(0, 3),
                analyzedAt: new Date().toISOString(),
              },
            } as any);
            return { success: true };
          }

          const responseText = await callAzureOpenAI(DENIAL_ANALYSIS_PROMPT, `Analyze this denied claim:\n${claimData}`);
          const parsed = parseJSONResponse(responseText);
          await updateDenial(denialId, {
            status: 'Analyzed',
            analysis: { ...parsed, analyzedAt: new Date().toISOString() },
          } as any);
          return { success: true };
        }
        case 'correct':
        case 'batch_fix': {
          if (practiceType === 'dental') {
            const dentalAnalysis = analyzeDentalDenial(denial);
            const responseText = await callAzureOpenAI(
              CORRECTION_SUGGESTION_PROMPT,
              `Suggest corrections for this dental denial:\n${claimData}\nDental Analysis: ${JSON.stringify(dentalAnalysis)}`
            );
            const parsed = parseJSONResponse(responseText);
            await updateDenial(denialId, {
              status: 'Corrected',
              correction: {
                ...parsed,
                dentalSpecific: dentalAnalysis,
                createdAt: new Date().toISOString(),
              },
            } as any);
          } else {
            const responseText = await callAzureOpenAI(
              CORRECTION_SUGGESTION_PROMPT,
              `Suggest corrections for this denied claim:\n${claimData}\nAnalysis: ${JSON.stringify(denial.analysis || {})}`
            );
            const parsed = parseJSONResponse(responseText);
            await updateDenial(denialId, {
              status: 'Corrected',
              correction: { ...parsed, createdAt: new Date().toISOString() },
            } as any);
          }
          return { success: true };
        }
        case 'quality_check': {
          const responseText = await callAzureOpenAI(
            QUALITY_CHECKER_PROMPT,
            `Quality check this correction:\n${claimData}\nCorrection: ${JSON.stringify(denial.correction || {})}`
          );
          const parsed = parseJSONResponse(responseText);
          await updateDenial(denialId, {
            status: 'Reviewed',
            qualityCheck: { ...parsed, checkedAt: new Date().toISOString() },
          } as any);
          return { success: true };
        }
        case 'appeal_generate': {
          const responseText = await callAzureOpenAI(
            'You are a medical/dental appeal letter writer. Generate a professional first-level appeal letter for the following denied claim. Include: 1) Patient and claim info 2) Clinical justification 3) References to LCD/NCD or ADA guidelines 4) Request for review. Return the letter as plain text.',
            `Generate appeal letter for:\n${claimData}\nAnalysis: ${JSON.stringify(denial.analysis || {})}\nCorrection: ${JSON.stringify(denial.correction || {})}`
          );
          await updateDenial(denialId, { status: 'Appealed' } as any);
          return { success: true };
        }
        default:
          return { success: false, error: `Unknown job type: ${jobType}` };
      }
    } catch (error) {
      return { success: false, error: String(error) };
    }
  };

  // Start the managed batch processor
  await batchProcessor.startJob(managedJobId, processItem, () => {
    // Progress callback
  });

  // Final audit log
  const managedJob = batchProcessor.getJob(managedJobId);
  if (managedJob) {
    createAuditLog({
      action: 'batch_complete',
      entityType: 'batch_job',
      entityId: managedJobId,
      metadata: {
        totalItems: managedJob.totalItems,
        processedItems: managedJob.processedItems,
        failedItems: managedJob.failedItems,
        throughput: managedJob.throughput,
        duration: managedJob.completedAt
          ? new Date(managedJob.completedAt).getTime() - new Date(managedJob.startedAt || managedJob.createdAt).getTime()
          : 0,
      },
    });
  }
}

/**
 * Estimate processing duration based on volume, level, and job type
 */
function estimateDuration(totalClaims: number, level: number, jobType: string): string {
  const baseTimes: Record<string, Record<number, number>> = {
    analyze: { 1: 0.5, 2: 2, 3: 3 },
    correct: { 1: 1, 2: 5, 3: 8 },
    quality_check: { 1: 1, 2: 3, 3: 4 },
    appeal_generate: { 1: 2, 2: 5, 3: 7 },
    batch_scan: { 1: 0.3, 2: 1, 3: 2 },
    batch_fix: { 1: 1, 2: 5, 3: 8 },
  };

  const timePerClaim = baseTimes[jobType]?.[level] || 3;
  const concurrency = level === 1 ? 5 : level === 2 ? 3 : 2;
  const totalSeconds = (totalClaims * timePerClaim) / concurrency;

  if (totalSeconds < 60) return `${Math.round(totalSeconds)} seconds`;
  if (totalSeconds < 3600) return `${Math.round(totalSeconds / 60)} minutes`;
  return `${(totalSeconds / 3600).toFixed(1)} hours`;
}
