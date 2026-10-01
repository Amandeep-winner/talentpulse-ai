import Redis from 'ioredis';
import { env } from '../config/env';
import { logger } from './logger';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 1,
  lazyConnect: true,
  enableOfflineQueue: false,
});

redis.on('error', (err) => {
  if (env.NODE_ENV !== 'test') {
    logger.warn({ err }, 'Redis connection error (caching will degrade gracefully)');
  }
});

export async function checkRedisConnection(): Promise<boolean> {
  try {
    if (redis.status === 'ready') return true;
    if (redis.status === 'wait') {
      await redis.connect();
    }
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}
