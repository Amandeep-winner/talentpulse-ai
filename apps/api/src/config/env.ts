import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1).default('postgresql://talentpulse:talentpulse@localhost:5432/talentpulse'),
  DATABASE_READONLY_URL: z.string().min(1).default('postgresql://tp_readonly:tp_readonly@localhost:5432/talentpulse'),
  TEST_DATABASE_URL: z.string().min(1).default('postgresql://talentpulse:talentpulse@localhost:5432/talentpulse_test'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters long').default('change-me-access-min-32-chars-long-xxxx'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters long').default('change-me-refresh-min-32-chars-long-xxx'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  COOKIE_SECURE: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(false),
  LLM_PROVIDER: z.enum(['mock', 'openai-compatible', 'anthropic']).default('mock'),
  LLM_MODEL: z.string().optional().default(''),
  LLM_API_KEY: z.string().optional().default(''),
  LLM_BASE_URL: z.string().optional().default(''),
  EMBEDDING_PROVIDER: z.enum(['local', 'openai-compatible']).default('local'),
  EMBEDDING_MODEL: z.string().optional().default(''),
  EMBEDDING_API_KEY: z.string().optional().default(''),
  EMBEDDING_BASE_URL: z.string().optional().default(''),
  EMBEDDING_DIM: z.coerce.number().int().default(384),
  ML_SERVICE_URL: z.string().url().default('http://localhost:8000'),
  ML_SERVICE_TOKEN: z.string().default('dev-ml-token'),
  ATS_BASE_URL: z.string().url().default('http://localhost:4100'),
  ATS_CLIENT_ID: z.string().default('talentpulse'),
  ATS_CLIENT_SECRET: z.string().default('dev-ats-secret'),
  ATS_WEBHOOK_SECRET: z.string().default('dev-webhook-secret'),
  NEXT_PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),
  METRICS_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(rawEnv: Record<string, unknown> = process.env): Env {
  const result = envSchema.safeParse(rawEnv);
  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${errorDetails}`);
  }
  return result.data;
}

export const env = validateEnv();
