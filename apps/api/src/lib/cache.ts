import crypto from 'crypto';
import { redis, checkRedisConnection } from './redis';
import { logger } from './logger';

export interface CacheResult<T> {
  data: T;
  cached: boolean;
}

function sha1(input: string): string {
  return crypto.createHash('sha1').update(input).digest('hex');
}

const inFlightRequests = new Map<string, Promise<unknown>>();

/**
 * Versioned namespace caching helper.
 * Key format: tp:{orgId}:v{ns}:{resource}:{sha1(params)}
 */
export async function cached<T>(
  organizationId: string,
  resource: string,
  params: object | string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<CacheResult<T>> {
  const paramsStr = typeof params === 'string' ? params : JSON.stringify(params);
  const paramsHash = sha1(paramsStr);

  try {
    const isReady = await checkRedisConnection();
    if (!isReady) {
      const data = await loader();
      return { data, cached: false };
    }

    // 1. Get current namespace version (defaults to 1)
    const nsKey = `tp:${organizationId}:ns:${resource}`;
    const ns = (await redis.get(nsKey)) || '1';

    // 2. Build versioned cache key
    const cacheKey = `tp:${organizationId}:v${ns}:${resource}:${paramsHash}`;

    // 3. Try to get cached value
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
      try {
        const data = JSON.parse(cachedData) as T;
        return { data, cached: true };
      } catch {
        // Fall through on JSON parse error
      }
    }

    // 4. Single-flight guard: coalesce concurrent requests for the same key
    if (inFlightRequests.has(cacheKey)) {
      const data = (await inFlightRequests.get(cacheKey)) as T;
      return { data, cached: true };
    }

    const loadPromise = (async () => {
      try {
        const result = await loader();
        try {
          await redis.set(cacheKey, JSON.stringify(result), 'EX', ttlSeconds);
        } catch {
          // Ignore cache set error
        }
        return result;
      } finally {
        inFlightRequests.delete(cacheKey);
      }
    })();

    inFlightRequests.set(cacheKey, loadPromise);
    const data = await loadPromise;
    return { data, cached: false };
  } catch (err) {
    logger.warn({ err, resource, organizationId }, 'Cache lookup failed; falling back to direct load');
    const data = await loader();
    return { data, cached: false };
  }
}

/**
 * Invalidate cached resource for an organization by incrementing its namespace version counter.
 */
export async function invalidate(organizationId: string, resource: string): Promise<void> {
  try {
    const isReady = await checkRedisConnection();
    if (!isReady) return;

    const nsKey = `tp:${organizationId}:ns:${resource}`;
    await redis.incr(nsKey);
  } catch (err) {
    logger.warn({ err, resource, organizationId }, 'Cache invalidation failed');
  }
}
