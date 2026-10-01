import { z } from 'zod';

/**
 * Roles Enum
 */
export const RoleEnum = z.enum(['ADMIN', 'RECRUITER', 'ANALYST']);
export type Role = z.infer<typeof RoleEnum>;

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

/**
 * Authentication Schemas
 */
export const registerRequestSchema = z.object({
  organizationName: z.string().min(2, 'Organization name must be at least 2 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const userProfileSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  organizationName: z.string().optional(),
  name: z.string(),
  email: z.string().email(),
  role: RoleEnum,
  createdAt: z.string().datetime().optional(),
});

export type UserProfile = z.infer<typeof userProfileSchema>;

export const authResponseSchema = z.object({
  user: userProfileSchema,
  accessToken: z.string(),
});

export type AuthResponse = z.infer<typeof authResponseSchema>;

export const createUserRequestSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  role: RoleEnum.default('RECRUITER'),
});

export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;

export const updateUserRoleSchema = z.object({
  role: RoleEnum,
});

export type UpdateUserRole = z.infer<typeof updateUserRoleSchema>;

export const createApiKeyRequestSchema = z.object({
  name: z.string().min(2, 'Key name must be at least 2 characters'),
});

export type CreateApiKeyRequest = z.infer<typeof createApiKeyRequestSchema>;

export const apiKeyItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  keyPrefix: z.string(),
  lastUsedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export type ApiKeyItem = z.infer<typeof apiKeyItemSchema>;

export const createApiKeyResponseSchema = z.object({
  apiKey: apiKeyItemSchema,
  plaintextKey: z.string(),
});

export type CreateApiKeyResponse = z.infer<typeof createApiKeyResponseSchema>;

/**
 * Jobs Enums and Schemas
 */
export const JobStatusEnum = z.enum(['DRAFT', 'OPEN', 'PAUSED', 'CLOSED', 'FILLED']);
export type JobStatus = z.infer<typeof JobStatusEnum>;

export const EmploymentTypeEnum = z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP']);
export type EmploymentType = z.infer<typeof EmploymentTypeEnum>;

export const createJobRequestSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  category: z.string().min(2, 'Category is required'),
  location: z.string().min(2, 'Location is required'),
  remote: z.boolean().default(false),
  employmentType: EmploymentTypeEnum.default('FULL_TIME'),
  salaryMin: z.number().int().nonnegative().optional().nullable(),
  salaryMax: z.number().int().nonnegative().optional().nullable(),
  minExperienceYears: z.number().int().nonnegative().default(0),
  requiredSkills: z.array(z.string()).min(1, 'At least one required skill is needed'),
  preferredSkills: z.array(z.string()).default([]),
  requiredEducation: z.string().optional().nullable(),
  status: JobStatusEnum.default('OPEN'),
});

export type CreateJobRequest = z.infer<typeof createJobRequestSchema>;

export const updateJobRequestSchema = createJobRequestSchema.partial();
export type UpdateJobRequest = z.infer<typeof updateJobRequestSchema>;

export const jobItemSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  category: z.string(),
  location: z.string(),
  remote: z.boolean(),
  employmentType: EmploymentTypeEnum,
  salaryMin: z.number().nullable(),
  salaryMax: z.number().nullable(),
  minExperienceYears: z.number(),
  requiredSkills: z.array(z.string()),
  preferredSkills: z.array(z.string()),
  requiredEducation: z.string().nullable(),
  status: JobStatusEnum,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
});

export type JobItem = z.infer<typeof jobItemSchema>;

export const jobFilterQuerySchema = paginationQuerySchema.extend({
  status: JobStatusEnum.optional(),
  category: z.string().optional(),
  location: z.string().optional(),
  remote: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});

export type JobFilterQuery = z.infer<typeof jobFilterQuerySchema>;

/**
 * Candidates Schemas
 */
export const createCandidateRequestSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  location: z.string().min(2, 'Location is required'),
  remoteOk: z.boolean().default(true),
  experienceYears: z.number().nonnegative().default(0),
  skills: z.array(z.string()).default([]),
  education: z.string().optional().nullable(),
  certifications: z.array(z.string()).default([]),
  preferredLocations: z.array(z.string()).default([]),
  preferredEmploymentTypes: z.array(EmploymentTypeEnum).default([]),
  expectedSalary: z.number().int().nonnegative().optional().nullable(),
  resumeText: z.string().optional().nullable(),
});

export type CreateCandidateRequest = z.infer<typeof createCandidateRequestSchema>;

export const updateCandidateRequestSchema = createCandidateRequestSchema.partial();
export type UpdateCandidateRequest = z.infer<typeof updateCandidateRequestSchema>;

export const candidateItemSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string(),
  email: z.string(),
  location: z.string(),
  remoteOk: z.boolean(),
  experienceYears: z.number(),
  skills: z.array(z.string()),
  education: z.string().nullable().optional(),
  certifications: z.array(z.string()).default([]),
  preferredLocations: z.array(z.string()).default([]),
  preferredEmploymentTypes: z.array(EmploymentTypeEnum).default([]),
  expectedSalary: z.number().nullable().optional(),
  resumeText: z.string().nullable().optional(),
  embeddedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
});

export type CandidateItem = z.infer<typeof candidateItemSchema>;

export const candidateFilterQuerySchema = paginationQuerySchema.extend({
  location: z.string().optional(),
  remoteOk: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  minExperience: z.coerce.number().nonnegative().optional(),
});

export type CandidateFilterQuery = z.infer<typeof candidateFilterQuerySchema>;

export const resumePasteRequestSchema = z.object({
  resumeText: z.string().min(10, 'Resume text must be at least 10 characters'),
});

export type ResumePasteRequest = z.infer<typeof resumePasteRequestSchema>;

/**
 * Applications Enums and Schemas
 */
export const ApplicationStatusEnum = z.enum([
  'APPLIED',
  'SCREENING',
  'INTERVIEW',
  'OFFER',
  'HIRED',
  'REJECTED',
  'WITHDRAWN',
]);
export type ApplicationStatus = z.infer<typeof ApplicationStatusEnum>;

export const createApplicationRequestSchema = z.object({
  candidateId: z.string().uuid('Invalid candidate ID format'),
  jobId: z.string().uuid('Invalid job ID format'),
  source: z.string().max(100).optional().nullable(),
  status: ApplicationStatusEnum.optional().default('APPLIED'),
});
export type CreateApplicationRequest = z.infer<typeof createApplicationRequestSchema>;

export const updateApplicationStatusSchema = z.object({
  status: ApplicationStatusEnum,
});
export type UpdateApplicationStatusRequest = z.infer<typeof updateApplicationStatusSchema>;

export const applicationFilterQuerySchema = paginationQuerySchema.extend({
  jobId: z.string().uuid().optional(),
  candidateId: z.string().uuid().optional(),
  status: ApplicationStatusEnum.optional(),
  q: z.string().optional(),
});
export type ApplicationFilterQuery = z.infer<typeof applicationFilterQuerySchema>;

export const applicationCandidateSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string(),
  location: z.string(),
  experienceYears: z.number(),
  skills: z.array(z.string()),
});
export type ApplicationCandidateSummary = z.infer<typeof applicationCandidateSummarySchema>;

export const applicationJobSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  category: z.string(),
  location: z.string(),
  status: JobStatusEnum,
});
export type ApplicationJobSummary = z.infer<typeof applicationJobSummarySchema>;

export const applicationItemSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  candidateId: z.string().uuid(),
  jobId: z.string().uuid(),
  status: ApplicationStatusEnum,
  source: z.string().nullable().optional(),
  appliedAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
  candidate: applicationCandidateSummarySchema,
  job: applicationJobSummarySchema,
});
export type ApplicationItem = z.infer<typeof applicationItemSchema>;


