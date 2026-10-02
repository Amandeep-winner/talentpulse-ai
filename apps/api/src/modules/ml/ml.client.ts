import { env } from '../../config/env';
import { logger } from '../../lib/logger';

export class MlServiceError extends Error {
  public readonly code: string;
  public readonly statusCode?: number;

  constructor(message: string, code: string = 'UPSTREAM_UNAVAILABLE', statusCode?: number) {
    super(message);
    this.name = 'MlServiceError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface CircuitBreakerState {
  status: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  lastFailureTime: number | null;
}

export class MlClient {
  private baseUrl: string;
  private token: string;
  private timeoutMs: number;
  private maxRetries: number;
  private circuitBreaker: CircuitBreakerState;
  private readonly failureThreshold = 3;
  private readonly resetTimeoutMs = 30000; // 30s

  constructor(
    baseUrl: string = env.ML_SERVICE_URL,
    token: string = env.ML_SERVICE_TOKEN,
    timeoutMs: number = 5000,
    maxRetries: number = 2
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token;
    this.timeoutMs = timeoutMs;
    this.maxRetries = maxRetries;
    this.circuitBreaker = {
      status: 'CLOSED',
      failures: 0,
      lastFailureTime: null,
    };
  }

  public getCircuitStatus(): CircuitBreakerState {
    this.checkCircuitReset();
    return { ...this.circuitBreaker };
  }

  public resetCircuit(): void {
    this.circuitBreaker = {
      status: 'CLOSED',
      failures: 0,
      lastFailureTime: null,
    };
  }

  private checkCircuitReset(): void {
    if (this.circuitBreaker.status === 'OPEN' && this.circuitBreaker.lastFailureTime) {
      const now = Date.now();
      if (now - this.circuitBreaker.lastFailureTime > this.resetTimeoutMs) {
        this.circuitBreaker.status = 'HALF_OPEN';
        logger.info({ msg: 'ML service circuit breaker entering HALF_OPEN state' });
      }
    }
  }

  private recordSuccess(): void {
    if (this.circuitBreaker.status !== 'CLOSED') {
      logger.info({ msg: 'ML service circuit breaker reset to CLOSED after successful request' });
    }
    this.circuitBreaker.status = 'CLOSED';
    this.circuitBreaker.failures = 0;
    this.circuitBreaker.lastFailureTime = null;
  }

  private recordFailure(): void {
    this.circuitBreaker.failures += 1;
    this.circuitBreaker.lastFailureTime = Date.now();
    if (this.circuitBreaker.failures >= this.failureThreshold) {
      this.circuitBreaker.status = 'OPEN';
      logger.warn({
        msg: 'ML service circuit breaker tripped to OPEN',
        failures: this.circuitBreaker.failures,
        threshold: this.failureThreshold,
      });
    }
  }

  private async request<T>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      body?: unknown;
      skipCircuitCheck?: boolean;
    } = {}
  ): Promise<T> {
    const { method = 'GET', body, skipCircuitCheck = false } = options;

    if (!skipCircuitCheck) {
      this.checkCircuitReset();
      if (this.circuitBreaker.status === 'OPEN') {
        throw new MlServiceError(
          'ML prediction service is temporarily unavailable (circuit open)',
          'UPSTREAM_UNAVAILABLE',
          503
        );
      }
    }

    const url = `${this.baseUrl}${endpoint}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const backoffMs = Math.min(200 * Math.pow(2, attempt - 1), 1000);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            'x-service-token': this.token,
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (!response.ok) {
          const errorBody = await response.text().catch(() => '');
          if (response.status >= 500) {
            throw new Error(`ML service returned server error ${response.status}: ${errorBody}`);
          }
          throw new MlServiceError(
            `ML service client error ${response.status}: ${errorBody}`,
            response.status === 401 ? 'UNAUTHORIZED' : 'BAD_REQUEST',
            response.status
          );
        }

        const data = (await response.json()) as T;
        this.recordSuccess();
        return data;
      } catch (err: unknown) {
        clearTimeout(timer);
        const error = err instanceof Error ? err : new Error(String(err));
        lastError = error;

        // Do not retry 4xx client errors
        if (err instanceof MlServiceError && err.statusCode && err.statusCode < 500) {
          throw err;
        }

        logger.warn({
          msg: `ML service request failed (attempt ${attempt + 1}/${this.maxRetries + 1})`,
          endpoint,
          error: error.message,
        });
      }
    }

    // All retries failed
    this.recordFailure();
    throw new MlServiceError(
      `ML prediction service unavailable: ${lastError?.message || 'Connection failed'}`,
      'UPSTREAM_UNAVAILABLE',
      503
    );
  }

  public async isHealthy(): Promise<boolean> {
    try {
      const res = await this.request<{ status: string }>('/health', {
        method: 'GET',
        skipCircuitCheck: true,
      });
      return res.status === 'ok';
    } catch {
      return false;
    }
  }

  public async listModels(): Promise<Array<{
    name: string;
    version: string;
    metrics: Record<string, unknown>;
    trainedAt: string;
    trainingRows: number;
    isActive: boolean;
  }>> {
    const res = await this.request<{
      models: Array<{
        name: string;
        version: string;
        metrics: Record<string, unknown>;
        trainedAt: string;
        trainingRows: number;
        isActive: boolean;
      }>;
    }>('/models', { method: 'GET' });
    return res.models || [];
  }

  public async trainModel(modelName: string, rows: Array<Record<string, unknown>>): Promise<{
    model: string;
    version: string;
    metrics: Record<string, unknown>;
    trainingRows: number;
    trainedAt: string;
    isActive: boolean;
  }> {
    return this.request(`/train/${modelName}`, {
      method: 'POST',
      body: { rows },
    });
  }

  public async predict<T>(modelName: string, features: Record<string, unknown>): Promise<T> {
    return this.request<T>(`/predict/${modelName}`, {
      method: 'POST',
      body: features,
    });
  }
}

export const mlClient = new MlClient();
