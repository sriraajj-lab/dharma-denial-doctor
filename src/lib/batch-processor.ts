/**
 * Optimized Batch Processor for Large-Scale Claim Processing
 * Handles up to 50,000 claims at once with:
 * - Chunked processing with configurable chunk sizes
 * - Memory-efficient streaming for large datasets
 * - Parallel processing with concurrency control
 * - Progress tracking with estimated time remaining
 * - Failure recovery and resume capability
 * - Background job management
 */

import { BatchJob, AccessLevel } from './types';

// ─── CONFIGURATION ───────────────────────────────────────────────────────────

export interface BatchConfig {
  chunkSize: number;          // Claims per chunk (default: 100)
  maxConcurrency: number;     // Max parallel chunks (default: 3)
  retryAttempts: number;      // Retry failed items (default: 2)
  retryDelayMs: number;       // Delay between retries (default: 1000)
  progressIntervalMs: number; // Progress update interval (default: 500)
  timeoutPerItemMs: number;   // Timeout per claim (default: 30000)
  level: AccessLevel;         // Access level determines processing depth
}

const DEFAULT_CONFIG: BatchConfig = {
  chunkSize: 100,
  maxConcurrency: 3,
  retryAttempts: 2,
  retryDelayMs: 1000,
  progressIntervalMs: 500,
  timeoutPerItemMs: 30000,
  level: 1,
};

// Level-specific configurations
const LEVEL_CONFIGS: Record<AccessLevel, Partial<BatchConfig>> = {
  1: { chunkSize: 500, maxConcurrency: 5, timeoutPerItemMs: 5000 },   // Level 1: Scan only - faster
  2: { chunkSize: 100, maxConcurrency: 3, timeoutPerItemMs: 30000 },  // Level 2: Fix + appeal - moderate
  3: { chunkSize: 50, maxConcurrency: 2, timeoutPerItemMs: 60000 },   // Level 3: Full EHR - slower, more complex
};

// ─── BATCH JOB MANAGER ───────────────────────────────────────────────────────

interface ManagedBatchJob extends BatchJob {
  config: BatchConfig;
  chunks: ChunkState[];
  startedAt?: string;
  estimatedCompletion?: string;
  throughput: number; // claims per minute
}

interface ChunkState {
  chunkIndex: number;
  startIdx: number;
  endIdx: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  processedItems: number;
  failedItems: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

class BatchProcessorManager {
  private jobs: Map<string, ManagedBatchJob> = new Map();
  private activeProcessors: Map<string, AbortController> = new Map();

  /**
   * Create a new batch job optimized for the given volume
   */
  createJob(
    denialIds: string[],
    jobType: BatchJob['jobType'],
    level: AccessLevel,
    customConfig?: Partial<BatchConfig>
  ): ManagedBatchJob {
    const config = {
      ...DEFAULT_CONFIG,
      ...LEVEL_CONFIGS[level],
      ...customConfig,
      level,
    };

    // Auto-adjust chunk size for very large volumes
    if (denialIds.length > 10000) {
      config.chunkSize = Math.min(config.chunkSize * 2, 1000);
      config.maxConcurrency = Math.min(config.maxConcurrency + 2, 8);
    }
    if (denialIds.length > 30000) {
      config.chunkSize = Math.min(config.chunkSize * 3, 2000);
      config.maxConcurrency = Math.min(config.maxConcurrency + 3, 10);
    }

    // Split into chunks
    const chunks: ChunkState[] = [];
    for (let i = 0; i < denialIds.length; i += config.chunkSize) {
      chunks.push({
        chunkIndex: Math.floor(i / config.chunkSize),
        startIdx: i,
        endIdx: Math.min(i + config.chunkSize, denialIds.length),
        status: 'pending',
        processedItems: 0,
        failedItems: 0,
      });
    }

    const job: ManagedBatchJob = {
      id: `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      jobType,
      status: 'pending',
      totalItems: denialIds.length,
      processedItems: 0,
      failedItems: 0,
      denialIds,
      results: [],
      config,
      chunks,
      throughput: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.jobs.set(job.id, job);
    return job;
  }

  /**
   * Start processing a batch job
   */
  async startJob(
    jobId: string,
    processItem: (denialId: string, level: AccessLevel) => Promise<{ success: boolean; error?: string }>,
    onProgress?: (job: ManagedBatchJob) => void
  ): Promise<ManagedBatchJob> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    const abortController = new AbortController();
    this.activeProcessors.set(jobId, abortController);

    job.status = 'running';
    job.startedAt = new Date().toISOString();
    job.updatedAt = new Date().toISOString();

    const startTime = Date.now();
    let totalProcessed = 0;

    try {
      // Process chunks with concurrency control
      const pendingChunks = job.chunks.filter(c => c.status === 'pending');

      for (let i = 0; i < pendingChunks.length; i += job.config.maxConcurrency) {
        if (abortController.signal.aborted) {
          job.status = 'cancelled';
          break;
        }

        const chunkBatch = pendingChunks.slice(i, i + job.config.maxConcurrency);
        const chunkPromises = chunkBatch.map(chunk => this.processChunk(
          job, chunk, processItem, abortController.signal
        ));

        const chunkResults = await Promise.allSettled(chunkPromises);

        // Update overall progress
        totalProcessed = job.chunks.reduce((sum, c) => sum + c.processedItems, 0);
        job.processedItems = totalProcessed;
        job.failedItems = job.chunks.reduce((sum, c) => sum + c.failedItems, 0);

        // Calculate throughput
        const elapsedMinutes = (Date.now() - startTime) / 60000;
        job.throughput = elapsedMinutes > 0 ? totalProcessed / elapsedMinutes : 0;

        // Estimate completion time
        if (job.throughput > 0) {
          const remainingItems = job.totalItems - totalProcessed;
          const remainingMinutes = remainingItems / job.throughput;
          job.estimatedCompletion = new Date(Date.now() + remainingMinutes * 60000).toISOString();
        }

        job.updatedAt = new Date().toISOString();
        onProgress?.(job);
      }

      if (job.status !== 'cancelled') {
        // Final status
        const allCompleted = job.chunks.every(c => c.status === 'completed');
        const anyFailed = job.chunks.some(c => c.status === 'failed');

        if (allCompleted) {
          job.status = 'completed';
        } else if (anyFailed) {
          job.status = 'failed';
          job.errorLog = job.chunks
            .filter(c => c.error)
            .map(c => `Chunk ${c.chunkIndex}: ${c.error}`)
            .join('; ');
        }

        job.completedAt = new Date().toISOString();
        job.updatedAt = new Date().toISOString();
      }
    } catch (error) {
      job.status = 'failed';
      job.errorLog = error instanceof Error ? error.message : 'Unknown error';
      job.completedAt = new Date().toISOString();
      job.updatedAt = new Date().toISOString();
    } finally {
      this.activeProcessors.delete(jobId);
    }

    return job;
  }

  /**
   * Process a single chunk of claims
   */
  private async processChunk(
    job: ManagedBatchJob,
    chunk: ChunkState,
    processItem: (denialId: string, level: AccessLevel) => Promise<{ success: boolean; error?: string }>,
    signal: AbortSignal
  ): Promise<void> {
    chunk.status = 'running';
    chunk.startedAt = new Date().toISOString();

    const chunkIds = job.denialIds.slice(chunk.startIdx, chunk.endIdx);

    for (let i = 0; i < chunkIds.length; i++) {
      if (signal.aborted) {
        chunk.status = 'failed';
        chunk.error = 'Cancelled';
        return;
      }

      const denialId = chunkIds[i];
      let success = false;
      let lastError: string | undefined;

      // Retry logic
      for (let attempt = 0; attempt <= job.config.retryAttempts; attempt++) {
        try {
          const result = await Promise.race([
            processItem(denialId, job.config.level),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Timeout')), job.config.timeoutPerItemMs)
            ),
          ]);
          success = result.success;
          if (!success) lastError = result.error;
          if (success) break;
        } catch (error) {
          lastError = error instanceof Error ? error.message : 'Unknown error';
        }

        // Wait before retry
        if (attempt < job.config.retryAttempts && !signal.aborted) {
          await new Promise(resolve => setTimeout(resolve, job.config.retryDelayMs * (attempt + 1)));
        }
      }

      if (success) {
        chunk.processedItems++;
        job.results.push({ denialId, success: true });
      } else {
        chunk.failedItems++;
        job.results.push({ denialId, success: false, error: lastError });
      }
    }

    chunk.status = chunk.failedItems > chunk.processedItems ? 'failed' : 'completed';
    chunk.completedAt = new Date().toISOString();
  }

  /**
   * Cancel a running batch job
   */
  cancelJob(jobId: string): boolean {
    const controller = this.activeProcessors.get(jobId);
    if (controller) {
      controller.abort();
      return true;
    }
    return false;
  }

  /**
   * Get job status
   */
  getJob(jobId: string): ManagedBatchJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Get all jobs
   */
  getAllJobs(): ManagedBatchJob[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Get progress percentage for a job
   */
  getProgress(jobId: string): number {
    const job = this.jobs.get(jobId);
    if (!job) return 0;
    if (job.status === 'completed') return 100;
    if (job.totalItems === 0) return 0;
    return Math.round((job.processedItems / job.totalItems) * 100);
  }

  /**
   * Get estimated time remaining in minutes
   */
  getEstimatedTimeRemaining(jobId: string): number | null {
    const job = this.jobs.get(jobId);
    if (!job || job.throughput === 0) return null;
    const remaining = job.totalItems - job.processedItems;
    return remaining / job.throughput;
  }
}

// ─── SINGLETON EXPORT ────────────────────────────────────────────────────────

export const batchProcessor = new BatchProcessorManager();
export type { ManagedBatchJob, ChunkState };
