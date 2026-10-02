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

export const candidateSearchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Search query cannot be empty'),
  limit: z.coerce.number().int().positive().max(50).default(20),
  remoteOk: z
    .union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')])
    .optional(),
  minExperience: z.coerce.number().nonnegative().optional(),
});

export type CandidateSearchQuery = z.infer<typeof candidateSearchQuerySchema>;

export const candidateSearchResultItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string(),
  location: z.string(),
  experienceYears: z.number(),
  skills: z.array(z.string()),
  education: z.string().nullable().optional(),
  remoteOk: z.boolean(),
  distance: z.number(),
  similarity: z.number(),
});

export type CandidateSearchResultItem = z.infer<typeof candidateSearchResultItemSchema>;

export const candidateSearchResponseSchema = z.object({
  query: z.string(),
  total: z.number(),
  candidates: z.array(candidateSearchResultItemSchema),
});

export type CandidateSearchResponse = z.infer<typeof candidateSearchResponseSchema>;

/**
 * Hybrid Candidate-Job Matching Schemas
 */
export const scoreBreakdownSchema = z.object({
  semantic: z.number().min(0).max(1),
  skills: z.number().min(0).max(1),
  experience: z.number().min(0).max(1),
  location: z.number().min(0).max(1),
  education: z.number().min(0).max(1),
  preferences: z.number().min(0).max(1),
});

export type ScoreBreakdown = z.infer<typeof scoreBreakdownSchema>;

export const candidateMatchResultSchema = z.object({
  candidateId: z.string().uuid(),
  name: z.string(),
  email: z.string(),
  location: z.string(),
  experienceYears: z.number(),
  skills: z.array(z.string()),
  remoteOk: z.boolean(),
  score: z.number().min(0).max(1),
  breakdown: scoreBreakdownSchema,
  reasons: z.array(z.string()),
  gaps: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export type CandidateMatchResult = z.infer<typeof candidateMatchResultSchema>;

export const jobMatchesResponseSchema = z.object({
  jobId: z.string().uuid(),
  jobTitle: z.string(),
  totalMatches: z.number(),
  recommendationId: z.string().uuid().optional(),
  matches: z.array(candidateMatchResultSchema),
});

export type JobMatchesResponse = z.infer<typeof jobMatchesResponseSchema>;

/**
 * Knowledge Base Schemas
 */
export const createKnowledgeDocumentSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters'),
  category: z.string().min(1, 'Category is required').default('general'),
  content: z.string().min(10, 'Content must be at least 10 characters'),
});

export type CreateKnowledgeDocumentRequest = z.infer<typeof createKnowledgeDocumentSchema>;

export const knowledgeCitationSchema = z.object({
  n: z.number().int().positive(),
  documentId: z.string().uuid(),
  title: z.string(),
  snippet: z.string(),
  similarity: z.number(),
});

export type KnowledgeCitation = z.infer<typeof knowledgeCitationSchema>;

export const askKnowledgeRequestSchema = z.object({
  question: z.string().min(2, 'Question must be at least 2 characters'),
  category: z.string().optional(),
});

export type AskKnowledgeRequest = z.infer<typeof askKnowledgeRequestSchema>;

export const askKnowledgeResponseSchema = z.object({
  answer: z.string(),
  citations: z.array(knowledgeCitationSchema),
});

export type AskKnowledgeResponse = z.infer<typeof askKnowledgeResponseSchema>;

export const knowledgeDocumentItemSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  title: z.string(),
  category: z.string(),
  content: z.string().optional(),
  createdAt: z.string().datetime().or(z.date()),
  chunkCount: z.number().int().optional(),
});

export type KnowledgeDocumentItem = z.infer<typeof knowledgeDocumentItemSchema>;

/**
 * AI Conversational Analyst Schemas
 */
export const AiIntentEnum = z.enum([
  'analytics_sql',
  'metric_diagnosis',
  'knowledge',
  'candidate_search',
  'campaign_recommendation',
  'smalltalk',
  'unsupported',
]);

export type AiIntent = z.infer<typeof AiIntentEnum>;

export const aiChartSpecSchema = z.object({
  type: z.enum(['line', 'bar', 'pie']),
  title: z.string().optional(),
  xKey: z.string(),
  series: z.array(z.string()),
  data: z.array(z.record(z.unknown())),
});

export type AiChartSpec = z.infer<typeof aiChartSpecSchema>;

export const aiQueryRequestSchema = z.object({
  question: z.string().min(2, 'Question must be at least 2 characters'),
  conversationId: z.string().uuid().optional(),
});

export type AiQueryRequest = z.infer<typeof aiQueryRequestSchema>;

export const aiQueryResponseSchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
  answer: z.string(),
  intent: AiIntentEnum,
  steps: z.array(z.string()),
  sql: z.string().optional(),
  rows: z.array(z.record(z.unknown())).optional(),
  chart: aiChartSpecSchema.optional(),
  recommendations: z.array(z.string()).optional(),
  citations: z.array(knowledgeCitationSchema).optional(),
  confidence: z.number().min(0).max(1),
  executionTimeMs: z.number().optional(),
  rowCount: z.number().optional(),
});

export type AiQueryResponse = z.infer<typeof aiQueryResponseSchema>;

export const sqlPreviewRequestSchema = z.object({
  sql: z.string().min(1, 'SQL query cannot be empty'),
});

export type SqlPreviewRequest = z.infer<typeof sqlPreviewRequestSchema>;

export const sqlPreviewResponseSchema = z.object({
  valid: z.boolean(),
  sql: z.string().optional(),
  reason: z.string().optional(),
  tables: z.array(z.string()).optional(),
  executionTimeMs: z.number().optional(),
  rowCount: z.number().optional(),
});

export type SqlPreviewResponse = z.infer<typeof sqlPreviewResponseSchema>;

export const aiConversationItemSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  title: z.string(),
  createdAt: z.string().datetime().or(z.date()),
  messageCount: z.number().int().optional(),
});

export type AiConversationItem = z.infer<typeof aiConversationItemSchema>;

export const aiMessageItemSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  payload: z.unknown().optional(),
  createdAt: z.string().datetime().or(z.date()),
});

export type AiMessageItem = z.infer<typeof aiMessageItemSchema>;

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

export const campaignSimulateRequestSchema = z.object({
  days: z.number().int().min(1).max(90).default(7),
  seed: z.number().int().optional().default(42),
});
export type CampaignSimulateRequest = z.infer<typeof campaignSimulateRequestSchema>;

export const campaignSimulateResponseSchema = z.object({
  campaignId: z.string().uuid(),
  days: z.number().int(),
  eventsCreated: z.number().int(),
  spendsCreated: z.number().int(),
  totalImpressions: z.number().int(),
  totalClicks: z.number().int(),
  totalApplications: z.number().int(),
  totalHires: z.number().int(),
  totalSpend: z.number(),
});
export type CampaignSimulateResponse = z.infer<typeof campaignSimulateResponseSchema>;

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
    category: z.string().optional(),
    minExperienceYears: z.number().optional(),
    remote: z.boolean().optional(),
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

export interface PublisherPerformanceTrends {
  ctrDelta: number | null;
  cpcDelta: number | null;
  cpaDelta: number | null;
  cpqaDelta: number | null;
  cphDelta: number | null;
  impressionsDelta: number | null;
  clicksDelta: number | null;
  applicationsDelta: number | null;
  spendDelta: number | null;
}

export interface PublisherFunnelMetrics {
  impressions: number;
  clicks: number;
  applications: number;
  qualifiedApplications: number;
  interviews: number;
  hires: number;
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
  cpqa: number | null;
  cph: number | null;
  rank?: number;
  trends?: PublisherPerformanceTrends;
  funnel?: PublisherFunnelMetrics;
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

/**
 * Recommendation and Optimization Enums and Interfaces
 */
export const RecommendationTypeEnum = z.enum([
  'CANDIDATE_RANKING',
  'CAMPAIGN_ALLOCATION',
  'BANDIT_ACTION',
  'FORECAST_ALERT',
]);
export type RecommendationType = z.infer<typeof RecommendationTypeEnum>;

export const RecommendationStatusEnum = z.enum([
  'PROPOSED',
  'APPROVED',
  'REJECTED',
  'APPLIED',
]);
export type RecommendationStatus = z.infer<typeof RecommendationStatusEnum>;

export const OptimizationRuleActionEnum = z.enum([
  'reduce_allocation',
  'increase_allocation',
  'review_landing_quality',
  'adjust_pacing',
  'maintain_allocation',
  'insufficient_volume',
]);
export type OptimizationRuleAction = z.infer<typeof OptimizationRuleActionEnum>;

export interface OptimizationRuleActionItem {
  publisherId: string;
  publisherName: string;
  action: OptimizationRuleAction;
  reason: string;
}

export interface OptimizationDecision {
  current: Record<string, number>;
  recommended: Record<string, number>;
  actions: OptimizationRuleActionItem[];
}

export interface RecommendationItem {
  id: string;
  organizationId: string;
  userId?: string | null;
  type: RecommendationType;
  modelVersion: string;
  inputRef: Record<string, unknown>;
  decision: OptimizationDecision;
  explanation: Record<string, unknown> | string;
  confidence: number;
  status: RecommendationStatus;
  decidedBy?: string | null;
  decidedAt?: string | null;
  createdAt: string;
}

export const proposeOptimizationRequestSchema = z.object({
  campaignId: z.string().uuid('Invalid campaignId format'),
  weights: z
    .object({
      quality: z.number().optional(),
      lambdaCpa: z.number().optional(),
      lambdaCph: z.number().optional(),
    })
    .optional(),
  tau: z.number().positive().optional(),
});
export type ProposeOptimizationRequest = z.infer<typeof proposeOptimizationRequestSchema>;

/**
 * Contextual Bandit Enums and Schemas (Task 20)
 */
export const BanditActionEnum = z.enum([
  'increase_bid',
  'decrease_bid',
  'maintain_bid',
  'increase_budget',
  'decrease_budget',
]);
export type BanditAction = z.infer<typeof BanditActionEnum>;

export const BanditAlgorithmEnum = z.enum([
  'linucb',
  'epsilon_greedy',
  'random',
  'static',
]);
export type BanditAlgorithm = z.infer<typeof BanditAlgorithmEnum>;

export const banditContextInputSchema = z.object({
  jobCategory: z.string().optional().default('Engineering'),
  experienceYears: z.number().nonnegative().optional().default(3),
  locationTier: z.number().min(0).max(1).optional().default(1),
  ctr: z.number().nonnegative().optional().default(3.5),
  cpa: z.number().nonnegative().optional().default(40.0),
  convRate: z.number().nonnegative().optional().default(0.08),
  remainingBudgetFrac: z.number().min(0).max(1).optional().default(0.75),
  publisherId: z.string().optional(),
});
export type BanditContextInput = z.infer<typeof banditContextInputSchema>;

export const banditDecideRequestSchema = z.object({
  algorithm: BanditAlgorithmEnum.optional().default('linucb'),
  publisherId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
  context: banditContextInputSchema,
});
export type BanditDecideRequest = z.infer<typeof banditDecideRequestSchema>;

export const banditDecisionResponseSchema = z.object({
  decisionId: z.string().uuid(),
  algorithm: BanditAlgorithmEnum,
  action: BanditActionEnum,
  scores: z.record(z.string(), z.number()).optional(),
  propensity: z.number().optional().nullable(),
  policyVersion: z.number(),
  recommendation: z.unknown().optional(),
});
export type BanditDecisionResponse = z.infer<typeof banditDecisionResponseSchema>;

export const banditRewardRequestSchema = z.object({
  decisionId: z.string().uuid(),
  reward: z.number().min(-2).max(2).optional(),
  metrics: z
    .object({
      qualifiedApplications: z.number().nonnegative(),
      refQa: z.number().positive().default(5.0),
      spend: z.number().nonnegative(),
      refSpend: z.number().positive().default(200.0),
      mu: z.number().nonnegative().default(0.5),
    })
    .optional(),
});
export type BanditRewardRequest = z.infer<typeof banditRewardRequestSchema>;

export const banditSimulationRequestSchema = z.object({
  rounds: z.number().int().min(10).max(5000).default(500),
  algorithms: z.array(BanditAlgorithmEnum).optional().default(['linucb', 'epsilon_greedy', 'random', 'static']),
  seed: z.number().int().optional().default(42),
});
export type BanditSimulationRequest = z.infer<typeof banditSimulationRequestSchema>;

export interface BanditSimulationPoint {
  round: number;
  [algoKey: string]: number;
}

export interface BanditSimulationSummary {
  algorithm: BanditAlgorithm;
  cumulativeReward: number;
  averageReward: number;
  regret: number;
  actionCounts: Record<BanditAction, number>;
}

export interface BanditSimulationResponse {
  rounds: number;
  rewardHistory: BanditSimulationPoint[];
  regretHistory: BanditSimulationPoint[];
  summaries: BanditSimulationSummary[];
}

/**
 * A/B Experiments Enums and Schemas (Task 20)
 */
export const ExperimentStatusEnum = z.enum(['DRAFT', 'RUNNING', 'STOPPED']);
export type ExperimentStatus = z.infer<typeof ExperimentStatusEnum>;

export const experimentVariantSchema = z.object({
  key: z.string().min(1),
  weight: z.number().positive().max(100),
});
export type ExperimentVariant = z.infer<typeof experimentVariantSchema>;

export const createExperimentRequestSchema = z.object({
  name: z.string().min(2, 'Experiment name must be at least 2 characters'),
  hypothesis: z.string().optional().nullable(),
  variants: z
    .array(experimentVariantSchema)
    .min(2, 'Experiment must have at least 2 variants')
    .refine(
      (vars) => {
        const sum = vars.reduce((acc, v) => acc + v.weight, 0);
        return Math.abs(sum - 100) < 0.1;
      },
      { message: 'Variant weights must sum to 100%' }
    ),
});
export type CreateExperimentRequest = z.infer<typeof createExperimentRequestSchema>;

export const updateExperimentStatusSchema = z.object({
  status: ExperimentStatusEnum,
});
export type UpdateExperimentStatusRequest = z.infer<typeof updateExperimentStatusSchema>;

export const assignExperimentRequestSchema = z.object({
  subjectKey: z.string().min(1, 'subjectKey is required'),
});
export type AssignExperimentRequest = z.infer<typeof assignExperimentRequestSchema>;

export const convertExperimentRequestSchema = z.object({
  subjectKey: z.string().min(1, 'subjectKey is required'),
});
export type ConvertExperimentRequest = z.infer<typeof convertExperimentRequestSchema>;

export interface VariantStats {
  variant: string;
  weight: number;
  exposures: number;
  conversions: number;
  conversionRate: number;
  lift?: number | null;
  zScore?: number | null;
  pValue?: number | null;
  significant?: boolean;
}

export interface ExperimentResultsResponse {
  id: string;
  organizationId: string;
  name: string;
  hypothesis?: string | null;
  status: ExperimentStatus;
  variants: ExperimentVariant[];
  totalExposures: number;
  totalConversions: number;
  stats: VariantStats[];
  hasSufficientData: boolean;
  winner?: string | null;
  createdAt: string;
}

/**
 * Predictive Intelligence & ML Enums and Schemas (Task 21)
 */
export const MlModelNameEnum = z.enum(['application_prob', 'fill_prob']);
export type MlModelName = z.infer<typeof MlModelNameEnum>;

export const MlRiskBucketEnum = z.enum(['High', 'Medium', 'Low']);
export type MlRiskBucket = z.infer<typeof MlRiskBucketEnum>;

export const mlTopFactorSchema = z.object({
  feature: z.string(),
  impact: z.enum(['positive', 'negative']),
  weight: z.number(),
  description: z.string(),
});
export type MlTopFactor = z.infer<typeof mlTopFactorSchema>;

export const predictApplicationRequestSchema = z.object({
  jobCategory: z.string(),
  experienceReq: z.number().nonnegative(),
  locationTier: z.string(),
  publisherType: z.string(),
  historicalCtr: z.number().nonnegative(),
  historicalCpa: z.number().nonnegative(),
  historicalConv: z.number().nonnegative(),
  dayOfWeek: z.number().int().min(0).max(6).default(0),
  bid: z.number().positive(),
  budget: z.number().positive(),
});
export type PredictApplicationRequest = z.infer<typeof predictApplicationRequestSchema>;

export const predictApplicationResponseSchema = z.object({
  probability: z.number().min(0).max(1),
  modelVersion: z.string(),
  topFactors: z.array(mlTopFactorSchema),
});
export type PredictApplicationResponse = z.infer<typeof predictApplicationResponseSchema>;

export const predictFillRequestSchema = z.object({
  jobId: z.string().uuid('Invalid job ID format'),
});
export type PredictFillRequest = z.infer<typeof predictFillRequestSchema>;

export const predictFillResponseSchema = z.object({
  jobId: z.string().uuid(),
  jobTitle: z.string(),
  probability: z.number().min(0).max(1),
  risk: MlRiskBucketEnum,
  modelVersion: z.string(),
  topFactors: z.array(mlTopFactorSchema),
  features: z.object({
    salaryBand: z.number(),
    skillsCount: z.number(),
    applicationsFirst7d: z.number(),
    qualifiedRate: z.number(),
    spend: z.number(),
    experienceReq: z.number(),
  }),
});
export type PredictFillResponse = z.infer<typeof predictFillResponseSchema>;

export const trainModelRequestSchema = z.object({
  model: MlModelNameEnum,
});
export type TrainModelRequest = z.infer<typeof trainModelRequestSchema>;

export const mlModelVersionSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string(),
  version: z.string(),
  metrics: z.record(z.any()),
  trainedAt: z.string(),
  trainingRows: z.number().int(),
  isActive: z.boolean(),
});
export type MlModelVersion = z.infer<typeof mlModelVersionSchema>;

/**
 * Time-Series Forecasting Enums and Schemas (Task 22)
 */
export const ForecastMetricEnum = z.enum(['applications', 'interviews', 'hires', 'spend']);
export type ForecastMetric = z.infer<typeof ForecastMetricEnum>;

export const ForecastHorizonEnum = z.union([
  z.literal(7),
  z.literal(14),
  z.literal(30),
]);
export type ForecastHorizon = z.infer<typeof ForecastHorizonEnum>;

export const forecastSeriesPointSchema = z.object({
  date: z.string(),
  value: z.number(),
});
export type ForecastSeriesPoint = z.infer<typeof forecastSeriesPointSchema>;

export const forecastItemSchema = z.object({
  date: z.string(),
  value: z.number(),
  lower: z.number(),
  upper: z.number(),
});
export type ForecastItem = z.infer<typeof forecastItemSchema>;

export const backtestMetricsSchema = z.object({
  mae: z.number(),
  rmse: z.number(),
  mape: z.number(),
  baselineMae: z.number(),
});
export type BacktestMetrics = z.infer<typeof backtestMetricsSchema>;

export const forecastInsightSchema = z.object({
  expectedTotalNext7d: z.number(),
  actualLast7d: z.number(),
  trendPctVsLast7d: z.number(),
  shortfallAlert: z.boolean(),
  targetPace7d: z.number().optional(),
  message: z.string(),
});
export type ForecastInsight = z.infer<typeof forecastInsightSchema>;

export const forecastResponseSchema = z.object({
  metric: ForecastMetricEnum,
  horizon: z.number(),
  campaignId: z.string().optional(),
  campaignName: z.string().optional(),
  history: z.array(forecastSeriesPointSchema),
  forecast: z.array(forecastItemSchema),
  method: z.string(),
  backtest: backtestMetricsSchema,
  insight: forecastInsightSchema,
  recommendationId: z.string().optional(),
});
export type ForecastResponse = z.infer<typeof forecastResponseSchema>;

export const getForecastQuerySchema = z.object({
  metric: ForecastMetricEnum.default('applications'),
  horizon: z.coerce.number().pipe(ForecastHorizonEnum).default(7),
  campaignId: z.string().uuid().optional(),
});
export type GetForecastQuery = z.infer<typeof getForecastQuerySchema>;
