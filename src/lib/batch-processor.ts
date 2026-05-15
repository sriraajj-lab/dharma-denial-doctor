import { BatchJob } from './types';

// In-memory batch job store
let batchJobs: BatchJob[] = [];

export function createBatchJob(job: {
  jobType: BatchJob['jobType'];
  denialIds: string[];
}): BatchJob {
  const newJob: BatchJob = {
    id: `BATCH-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    jobType: job.jobType,
    status: 'pending',
    totalItems: job.denialIds.length,
    processedItems: 0,
    failedItems: 0,
    denialIds: job.denialIds,
    results: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  batchJobs.push(newJob);
  return newJob;
}

export function getBatchJob(id: string): BatchJob | undefined {
  return batchJobs.find((j) => j.id === id);
}

export function getAllBatchJobs(filters?: {
  status?: string;
  jobType?: string;
}): BatchJob[] {
  let filtered = [...batchJobs];
  if (filters?.status) filtered = filtered.filter((j) => j.status === filters.status);
  if (filters?.jobType) filtered = filtered.filter((j) => j.jobType === filters.jobType);
  return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function updateBatchJob(id: string, updates: Partial<BatchJob>): BatchJob | null {
  const index = batchJobs.findIndex((j) => j.id === id);
  if (index === -1) return null;
  batchJobs[index] = { ...batchJobs[index], ...updates, updatedAt: new Date().toISOString() };
  return batchJobs[index];
}

export function addBatchResult(
  jobId: string,
  result: { denialId: string; success: boolean; error?: string }
): BatchJob | null {
  const index = batchJobs.findIndex((j) => j.id === jobId);
  if (index === -1) return null;

  const job = batchJobs[index];
  job.results.push(result);
  job.processedItems = job.results.length;
  job.failedItems = job.results.filter((r) => !r.success).length;

  if (job.processedItems >= job.totalItems) {
    job.status = job.failedItems > 0 ? (job.failedItems === job.totalItems ? 'failed' : 'completed') : 'completed';
    job.completedAt = new Date().toISOString();
  }

  job.updatedAt = new Date().toISOString();
  batchJobs[index] = job;
  return job;
}

export function cancelBatchJob(id: string): BatchJob | null {
  const index = batchJobs.findIndex((j) => j.id === id);
  if (index === -1) return null;
  if (batchJobs[index].status === 'completed' || batchJobs[index].status === 'failed') return null;

  batchJobs[index].status = 'cancelled';
  batchJobs[index].updatedAt = new Date().toISOString();
  return batchJobs[index];
}
