import { z } from 'zod';

/**
 * Health check response schema
 */
export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error']),
  timestamp: z.string().datetime(),
  version: z.string(),
  uptime: z.number().nonnegative(),
  services: z.record(z.string(), z.string()).optional(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

/**
 * Standard API error details schema
 */
export const apiErrorDetailSchema = z.object({
  path: z.string(),
  message: z.string(),
});

export type ApiErrorDetail = z.infer<typeof apiErrorDetailSchema>;

/**
 * Standard API error body schema
 */
export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(apiErrorDetailSchema).optional(),
    requestId: z.string().optional(),
  }),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

/**
 * Standard pagination query schema
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  sort: z.string().optional(),
  q: z.string().optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/**
 * Standard pagination metadata schema
 */
export const paginationMetaSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export type PaginationMeta = z.infer<typeof paginationMetaSchema>;
