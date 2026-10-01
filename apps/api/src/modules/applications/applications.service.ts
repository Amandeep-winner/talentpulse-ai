import { Prisma } from '@prisma/client';
import {
  CreateApplicationRequest,
  ApplicationFilterQuery,
  ApplicationItem,
  ApplicationStatus,
  PaginationMeta,
} from '@talentpulse/shared';
import { prisma } from '../../lib/prisma';
import { NotFoundError, ValidationError, ConflictError } from '../../lib/errors/AppError';

const ALLOWED_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  APPLIED: ['SCREENING', 'REJECTED', 'WITHDRAWN'],
  SCREENING: ['INTERVIEW', 'REJECTED', 'WITHDRAWN'],
  INTERVIEW: ['OFFER', 'REJECTED', 'WITHDRAWN'],
  OFFER: ['HIRED', 'REJECTED', 'WITHDRAWN'],
  HIRED: [],
  REJECTED: [],
  WITHDRAWN: [],
};

const TERMINAL_STATUSES: Set<ApplicationStatus> = new Set(['HIRED', 'REJECTED', 'WITHDRAWN']);

type ApplicationWithRelations = Prisma.ApplicationGetPayload<{
  include: {
    candidate: true;
    job: true;
  };
}>;

function mapApplicationToItem(app: ApplicationWithRelations): ApplicationItem {
  return {
    id: app.id,
    organizationId: app.organizationId,
    candidateId: app.candidateId,
    jobId: app.jobId,
    status: app.status as ApplicationStatus,
    source: app.source,
    appliedAt: app.appliedAt.toISOString(),
    updatedAt: app.updatedAt.toISOString(),
    candidate: {
      id: app.candidate.id,
      name: app.candidate.name,
      email: app.candidate.email,
      location: app.candidate.location,
      experienceYears: app.candidate.experienceYears,
      skills: app.candidate.skills,
    },
    job: {
      id: app.job.id,
      title: app.job.title,
      category: app.job.category,
      location: app.job.location,
      status: app.job.status,
    },
  };
}

export class ApplicationsService {
  async listApplications(
    organizationId: string,
    query: ApplicationFilterQuery,
  ): Promise<{ applications: ApplicationItem[]; meta: PaginationMeta }> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const skip = (page - 1) * pageSize;

    const where: Prisma.ApplicationWhereInput = {
      organizationId,
    };

    if (query.jobId) {
      where.jobId = query.jobId;
    }

    if (query.candidateId) {
      where.candidateId = query.candidateId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.q) {
      where.OR = [
        {
          candidate: {
            name: { contains: query.q, mode: 'insensitive' },
          },
        },
        {
          candidate: {
            email: { contains: query.q, mode: 'insensitive' },
          },
        },
        {
          job: {
            title: { contains: query.q, mode: 'insensitive' },
          },
        },
      ];
    }

    const [total, records] = await Promise.all([
      prisma.application.count({ where }),
      prisma.application.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { appliedAt: 'desc' },
        include: {
          candidate: true,
          job: true,
        },
      }),
    ]);

    return {
      applications: records.map(mapApplicationToItem),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize) || 1,
      },
    };
  }

  async getApplication(organizationId: string, id: string): Promise<ApplicationItem> {
    const app = await prisma.application.findFirst({
      where: { id, organizationId },
      include: {
        candidate: true,
        job: true,
      },
    });

    if (!app) {
      throw new NotFoundError('Application not found');
    }

    return mapApplicationToItem(app);
  }

  async createApplication(
    organizationId: string,
    data: CreateApplicationRequest,
  ): Promise<ApplicationItem> {
    // 1. Verify candidate belongs to org
    const candidate = await prisma.candidate.findFirst({
      where: { id: data.candidateId, organizationId },
    });
    if (!candidate) {
      throw new NotFoundError('Candidate not found');
    }

    // 2. Verify job belongs to org
    const job = await prisma.job.findFirst({
      where: { id: data.jobId, organizationId },
    });
    if (!job) {
      throw new NotFoundError('Job not found');
    }

    // 3. Verify unique constraint: unique(candidate, job)
    const existing = await prisma.application.findUnique({
      where: {
        candidateId_jobId: {
          candidateId: data.candidateId,
          jobId: data.jobId,
        },
      },
    });

    if (existing) {
      throw new ConflictError('Candidate has already applied for this job');
    }

    const app = await prisma.application.create({
      data: {
        organizationId,
        candidateId: data.candidateId,
        jobId: data.jobId,
        status: data.status || 'APPLIED',
        source: data.source || null,
      },
      include: {
        candidate: true,
        job: true,
      },
    });

    return mapApplicationToItem(app);
  }

  async updateStatus(
    organizationId: string,
    id: string,
    newStatus: ApplicationStatus,
  ): Promise<ApplicationItem> {
    const app = await prisma.application.findFirst({
      where: { id, organizationId },
      include: {
        candidate: true,
        job: true,
      },
    });

    if (!app) {
      throw new NotFoundError('Application not found');
    }

    const currentStatus = app.status as ApplicationStatus;

    if (currentStatus === newStatus) {
      return mapApplicationToItem(app);
    }

    // Check terminal status
    if (TERMINAL_STATUSES.has(currentStatus)) {
      throw new ValidationError(
        `Cannot transition application from terminal status ${currentStatus} to ${newStatus}`,
      );
    }

    // Check allowed transitions
    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
      throw new ValidationError(
        `Invalid status transition from ${currentStatus} to ${newStatus}. Allowed transitions: ${allowed.join(', ')}`,
      );
    }

    const updated = await prisma.application.update({
      where: { id },
      data: { status: newStatus },
      include: {
        candidate: true,
        job: true,
      },
    });

    return mapApplicationToItem(updated);
  }

  async deleteApplication(organizationId: string, id: string): Promise<void> {
    const existing = await prisma.application.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      throw new NotFoundError('Application not found');
    }

    await prisma.application.delete({
      where: { id },
    });
  }
}

export const applicationsService = new ApplicationsService();
