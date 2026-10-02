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

/**
 * Publishers Enums and Schemas
 */
export const PublisherTypeEnum = z.enum(['JOB_BOARD', 'SOCIAL', 'SEARCH', 'AGGREGATOR', 'REFERRAL']);
export type PublisherType = z.infer<typeof PublisherTypeEnum>;

export const createPublisherRequestSchema = z.object({
  name: z.string().min(2, 'Publisher name must be at least 2 characters'),
  type: PublisherTypeEnum,
});
export type CreatePublisherRequest = z.infer<typeof createPublisherRequestSchema>;

export const updatePublisherRequestSchema = createPublisherRequestSchema.partial();
export type UpdatePublisherRequest = z.infer<typeof updatePublisherRequestSchema>;

export const publisherItemSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string(),
  type: PublisherTypeEnum,
});
export type PublisherItem = z.infer<typeof publisherItemSchema>;

/**
 * Campaigns Enums and Schemas
 */
export const CampaignStatusEnum = z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED']);
export type CampaignStatus = z.infer<typeof CampaignStatusEnum>;

export const campaignAllocationInputSchema = z.object({
  publisherId: z.string().uuid('Invalid publisher ID format'),
  allocationPct: z.number().min(0).max(100),
  bidCpc: z.number().nonnegative(),
  dailyBudget: z.number().nonnegative(),
});
export type CampaignAllocationInput = z.infer<typeof campaignAllocationInputSchema>;

export const createCampaignRequestSchema = z.object({
  jobId: z.string().uuid('Invalid job ID format'),
  name: z.string().min(2, 'Campaign name must be at least 2 characters'),
  budget: z.number().positive('Budget must be positive'),
  status: CampaignStatusEnum.optional().default('DRAFT'),
  startDate: z.string(),
  endDate: z.string().optional().nullable(),
  allocations: z.array(campaignAllocationInputSchema).optional(),
});
export type CreateCampaignRequest = z.infer<typeof createCampaignRequestSchema>;

export const updateCampaignRequestSchema = z.object({
  name: z.string().min(2).optional(),
  budget: z.number().positive().optional(),
  status: CampaignStatusEnum.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional().nullable(),
});
export type UpdateCampaignRequest = z.infer<typeof updateCampaignRequestSchema>;

export const setAllocationsRequestSchema = z.object({
  allocations: z.array(campaignAllocationInputSchema),
});
export type SetAllocationsRequest = z.infer<typeof setAllocationsRequestSchema>;

export const campaignPublisherItemSchema = z.object({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  publisherId: z.string().uuid(),
  allocationPct: z.number(),
  bidCpc: z.number(),
  dailyBudget: z.number(),
  publisher: publisherItemSchema.optional(),
});
export type CampaignPublisherItem = z.infer<typeof campaignPublisherItemSchema>;

export const campaignItemSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  jobId: z.string().uuid(),
  name: z.string(),
  budget: z.number(),
  status: CampaignStatusEnum,
  startDate: z.string(),
  endDate: z.string().nullable().optional(),
  createdAt: z.string(),
  job: z.object({
    id: z.string().uuid(),
    title: z.string(),
    location: z.string(),
  }).optional(),
  publishers: z.array(campaignPublisherItemSchema).optional(),
});
export type CampaignItem = z.infer<typeof campaignItemSchema>;

export const campaignFilterQuerySchema = paginationQuerySchema.extend({
  status: CampaignStatusEnum.optional(),
  jobId: z.string().uuid().optional(),
  q: z.string().optional(),
});
export type CampaignFilterQuery = z.infer<typeof campaignFilterQuerySchema>;

/**
 * Events Ingestion Schemas
 */
export const EventTypeEnum = z.enum([
  'IMPRESSION',
  'CLICK',
  'APPLICATION_START',
  'APPLICATION',
  'INTERVIEW',
  'HIRE',
]);
export type EventType = z.infer<typeof EventTypeEnum>;

export const eventInputSchema = z.object({
  eventId: z.string().min(1, 'eventId is required').max(128, 'eventId must be <= 128 characters'),
  campaignId: z.string().uuid('Invalid campaignId format'),
  publisherId: z.string().uuid('Invalid publisherId format'),
  eventType: EventTypeEnum,
  timestamp: z.string(),
  quantity: z.number().int().positive().optional().default(1),
  qualifiedQuantity: z.number().int().nonnegative().optional().default(0),
  metadata: z.record(z.unknown()).optional().nullable(),
});
export type EventInput = z.infer<typeof eventInputSchema>;

export const eventsBatchRequestSchema = z.union([
  eventInputSchema,
  z.object({
    events: z.array(eventInputSchema).max(500, 'Batch size cannot exceed 500 events'),
  }),
]);
export type EventsBatchRequest = z.infer<typeof eventsBatchRequestSchema>;

export const eventItemSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string(),
  organizationId: z.string().uuid(),
  campaignId: z.string().uuid(),
  publisherId: z.string().uuid(),
  eventType: EventTypeEnum,
  quantity: z.number(),
  qualifiedQuantity: z.number(),
  timestamp: z.string(),
  metadata: z.record(z.unknown()).nullable().optional(),
  createdAt: z.string(),
});
export type EventItem = z.infer<typeof eventItemSchema>;

export const eventsIngestionResponseSchema = z.object({
  accepted: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  rejected: z.array(
    z.object({
      eventId: z.string(),
      reason: z.string(),
    }),
  ),
});
export type EventsIngestionResponse = z.infer<typeof eventsIngestionResponseSchema>;

export const campaignSpendInputSchema = z.object({
  publisherId: z.string().uuid('Invalid publisherId format'),
  date: z.string(),
  amount: z.number().nonnegative('Spend amount must be nonnegative'),
});
export type CampaignSpendInput = z.infer<typeof campaignSpendInputSchema>;

/**
 * Analytics Enums and Interfaces
 */
export interface AnalyticsOverview {
  period: { from: string; to: string };
  previousPeriod: { from: string; to: string };
  totals: {
    jobs: number;
    applications: number;
    interviews: number;
    hires: number;
    spend: number;
    impressions: number;
    clicks: number;
    cpa: number | null;
    cph: number | null;
    ctr: number | null;
    applicationRate: number | null;
    conversionRate: number | null;
  };
  deltas: {
    jobs: number | null;
    applications: number | null;
    interviews: number | null;
    hires: number | null;
    spend: number | null;
    cpa: number | null;
    cph: number | null;
    conversionRate: number | null;
  };
}

export interface FunnelStage {
  stage: string;
  name?: string;
  count: number;
  conversionRate: number | null;
  overallConversionRate: number | null;
  dropOffRate?: number | null;
}

export interface TimeSeriesPoint {
  date: string;
  impressions: number;
  clicks: number;
  applications: number;
  hires: number;
  spend: number;
}

export interface PublisherPerformance {
  publisherId: string;
  publisherName: string;
  publisherType: PublisherType;
  impressions: number;
  clicks: number;
  applications: number;
  qualifiedApplications: number;
  interviews: number;
  hires: number;
  spend: number;
  ctr: number | null;
  applicationRate: number | null;
  cpc: number | null;
  cpa: number | null;
  cph: number | null;
}

export interface CampaignPerformance {
  campaignId: string;
  campaignName: string;
  jobTitle: string;
  status: CampaignStatus;
  budget: number;
  spend: number;
  impressions: number;
  clicks: number;
  applications: number;
  hires: number;
  cpa: number | null;
  cph: number | null;
}




