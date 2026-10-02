import { Queue, Worker, JobsOptions, WorkerOptions, Job } from 'bullmq';
import { env } from '../../config/env';
import { logger } from '../logger';

export type QueueName =
  | 'embedding'
  | 'resume-processing'
  | 'webhook-events'
  | 'analytics-reports'
  | 'forecast'
  | 'recommendation-batch';

export interface EmbeddingJobPayload {
  type: 'candidate' | 'job';
  id: string;
  orgId: string;
}

export interface ResumeProcessingJobPayload {
  candidateId: string;
  orgId: string;
}

export interface WebhookEventsJobPayload {
  eventId: string;
}

export interface AnalyticsReportsJobPayload {
  orgId: string;
  type: string;
}

export interface ForecastJobPayload {
  orgId: string;
  campaignId?: string;
}

export interface RecommendationBatchJobPayload {
  orgId: string;
}

export interface QueuePayloadMap {
  'embedding': EmbeddingJobPayload;
  'resume-processing': ResumeProcessingJobPayload;
  'webhook-events': WebhookEventsJobPayload;
  'analytics-reports': AnalyticsReportsJobPayload;
  'forecast': ForecastJobPayload;
  'recommendation-batch': RecommendationBatchJobPayload;
}

function parseRedisUrl(url: string) {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || 'localhost',
      port: parsed.port ? parseInt(parsed.port, 10) : 6379,
      password: parsed.password || undefined,
    };
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}

const connection = parseRedisUrl(env.REDIS_URL);

const queues = new Map<string, Queue>();
const workers = new Map<string, Worker>();

export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
  removeOnComplete: 1000,
  removeOnFail: false,
};

/**
 * Get or create a typed BullMQ Queue
 */
export function getQueue<T extends QueueName>(name: T): Queue {
  if (!queues.has(name)) {
    const queue = new Queue(name, {
      connection,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
    queues.set(name, queue);
  }
  return queues.get(name)!;
}

/**
 * Enqueue a job into a typed BullMQ queue
 */
export async function enqueue<T extends QueueName>(
  queueName: T,
  payload: QueuePayloadMap[T],
  opts?: JobsOptions
): Promise<Job | null> {
  try {
    const queue = getQueue(queueName);
    const job = await queue.add(queueName, payload, {
      ...DEFAULT_JOB_OPTIONS,
      ...opts,
    });
    logger.debug({ queue: queueName, jobId: job.id, payload }, 'Job enqueued');
    return job;
  } catch (err) {
    logger.warn({ err, queue: queueName, payload }, 'Failed to enqueue job; continuing gracefully');
    return null;
  }
}

/**
 * Create and register a BullMQ Worker
 */
export function registerWorker<T extends QueueName>(
  queueName: T,
  processor: (job: Job<QueuePayloadMap[T]>) => Promise<unknown>,
  opts?: Partial<WorkerOptions>
): Worker {
  if (workers.has(queueName)) {
    return workers.get(queueName)!;
  }

  const worker = new Worker(queueName, processor, {
    connection,
    concurrency: 5,
    ...opts,
  });

  worker.on('completed', (job) => {
    logger.debug({ queue: queueName, jobId: job.id }, 'Job completed successfully');
  });

  worker.on('failed', (job, err) => {
    logger.error({ queue: queueName, jobId: job?.id, err }, 'Job processing failed');
  });

  workers.set(queueName, worker);
  return worker;
}

/**
 * Gracefully close all queues and workers
 */
export async function closeQueuesAndWorkers(): Promise<void> {
  for (const [name, worker] of workers.entries()) {
    try {
      await worker.close();
      logger.info({ worker: name }, 'Worker closed');
    } catch (err) {
      logger.warn({ worker: name, err }, 'Error closing worker');
    }
  }
  workers.clear();

  for (const [name, queue] of queues.entries()) {
    try {
      await queue.close();
      logger.info({ queue: name }, 'Queue closed');
    } catch (err) {
      logger.warn({ queue: name, err }, 'Error closing queue');
    }
  }
  queues.clear();
}
