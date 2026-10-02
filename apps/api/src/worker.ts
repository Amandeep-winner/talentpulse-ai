import { logger } from './lib/logger';
import { env } from './config/env';
import { registerWorker, closeQueuesAndWorkers } from './lib/queue';
import { embeddingService } from './modules/embeddings/embedding.service';

logger.info(`TalentPulse BullMQ background worker started in ${env.NODE_ENV} mode`);

// Register embedding worker processor
registerWorker('embedding', async (job) => {
  const { type, id, orgId } = job.data;
  logger.info({ type, id, orgId }, 'Processing embedding job in background worker');
  if (type === 'candidate') {
    await embeddingService.embedCandidate(id, orgId);
  } else if (type === 'job') {
    await embeddingService.embedJob(id, orgId);
  }
});

const shutdown = async (signal: string) => {
  logger.info(`Worker received ${signal}, shutting down gracefully...`);
  try {
    await closeQueuesAndWorkers();
  } catch (err) {
    logger.error({ err }, 'Error closing queues during worker shutdown');
  }
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Keep worker alive
setInterval(() => {
  logger.debug('Worker heartbeat');
}, 60000);
