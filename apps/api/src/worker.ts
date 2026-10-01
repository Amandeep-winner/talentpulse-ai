import { logger } from './lib/logger';
import { env } from './config/env';

logger.info(`TalentPulse BullMQ background worker started in ${env.NODE_ENV} mode`);

const shutdown = (signal: string) => {
  logger.info(`Worker received ${signal}, shutting down gracefully...`);
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Keep worker alive
setInterval(() => {
  logger.debug('Worker heartbeat');
}, 60000);
