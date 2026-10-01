import { Job, Prisma } from '@prisma/client';
import { CreateJobRequest, UpdateJobRequest, JobItem, JobFilterQuery, PaginationMeta } from '@talentpulse/shared';
import { prisma } from '../../lib/prisma';
import { cached, invalidate, CacheResult } from '../../lib/cache';
import { normalizeSkills } from '../../utils/skills';
import { NotFoundError } from '../../lib/errors/AppError';

function mapJobToItem(job: Job): JobItem {
  return {
    id: job.id,
    organizationId: job.organizationId,
    title: job.title,
    description: job.description,
    category: job.category,
    location: job.location,
    remote: job.remote,
    employmentType: job.employmentType,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    minExperienceYears: job.minExperienceYears,
    requiredSkills: job.requiredSkills,
    preferredSkills: job.preferredSkills,
    requiredEducation: job.requiredEducation,
    status: job.status,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt?.toISOString(),
  };
}

export class JobsService {
  async listJobs(
    organizationId: string,
    query: JobFilterQuery,
  ): Promise<CacheResult<{ jobs: JobItem[]; meta: PaginationMeta }>> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));

    return cached(organizationId, 'jobs', query, 60, async () => {
      const where: Prisma.JobWhereInput = {
        organizationId,
      };

      if (query.status) {
        where.status = query.status;
      }

      if (query.category) {
        where.category = { contains: query.category, mode: 'insensitive' };
      }

      if (query.location) {
        where.location = { contains: query.location, mode: 'insensitive' };
      }

      if (query.remote !== undefined) {
        where.remote = query.remote;
      }

      if (query.q) {
        where.OR = [
          { title: { contains: query.q, mode: 'insensitive' } },
          { description: { contains: query.q, mode: 'insensitive' } },
        ];
      }

      let orderBy: Prisma.JobOrderByWithRelationInput = { createdAt: 'desc' };
      if (query.sort) {
        const [field, direction] = query.sort.split(':');
        if (field && ['createdAt', 'title', 'minExperienceYears'].includes(field)) {
          orderBy = { [field]: direction?.toLowerCase() === 'asc' ? 'asc' : 'desc' };
        }
      }

      const [total, jobs] = await Promise.all([
        prisma.job.count({ where }),
        prisma.job.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy,
        }),
      ]);

      const totalPages = Math.ceil(total / pageSize);

      return {
        jobs: jobs.map(mapJobToItem),
        meta: {
          page,
          pageSize,
          total,
          totalPages,
        },
      };
    });
  }

  async getJob(organizationId: string, id: string): Promise<JobItem> {
    const job = await prisma.job.findFirst({
      where: { id, organizationId },
    });

    if (!job) {
      throw new NotFoundError('Job not found in your organization');
    }

    return mapJobToItem(job);
  }

  async createJob(organizationId: string, input: CreateJobRequest): Promise<JobItem> {
    const requiredSkills = normalizeSkills(input.requiredSkills);
    const preferredSkills = normalizeSkills(input.preferredSkills || []);

    const job = await prisma.job.create({
      data: {
        organizationId,
        title: input.title,
        description: input.description,
        category: input.category,
        location: input.location,
        remote: input.remote ?? false,
        employmentType: input.employmentType ?? 'FULL_TIME',
        salaryMin: input.salaryMin,
        salaryMax: input.salaryMax,
        minExperienceYears: input.minExperienceYears ?? 0,
        requiredSkills,
        preferredSkills,
        requiredEducation: input.requiredEducation,
        status: input.status ?? 'OPEN',
      },
    });

    await invalidate(organizationId, 'jobs');

    return mapJobToItem(job);
  }

  async updateJob(organizationId: string, id: string, input: UpdateJobRequest): Promise<JobItem> {
    const existing = await prisma.job.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      throw new NotFoundError('Job not found in your organization');
    }

    const data: Prisma.JobUpdateInput = {};

    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.category !== undefined) data.category = input.category;
    if (input.location !== undefined) data.location = input.location;
    if (input.remote !== undefined) data.remote = input.remote;
    if (input.employmentType !== undefined) data.employmentType = input.employmentType;
    if (input.salaryMin !== undefined) data.salaryMin = input.salaryMin;
    if (input.salaryMax !== undefined) data.salaryMax = input.salaryMax;
    if (input.minExperienceYears !== undefined) data.minExperienceYears = input.minExperienceYears;
    if (input.status !== undefined) data.status = input.status;
    if (input.requiredEducation !== undefined) data.requiredEducation = input.requiredEducation;

    if (input.requiredSkills !== undefined) {
      data.requiredSkills = normalizeSkills(input.requiredSkills);
    }
    if (input.preferredSkills !== undefined) {
      data.preferredSkills = normalizeSkills(input.preferredSkills);
    }

    const updated = await prisma.job.update({
      where: { id },
      data,
    });

    await invalidate(organizationId, 'jobs');

    return mapJobToItem(updated);
  }

  async deleteJob(organizationId: string, id: string): Promise<{ message: string }> {
    const existing = await prisma.job.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      throw new NotFoundError('Job not found in your organization');
    }

    await prisma.job.delete({
      where: { id },
    });

    await invalidate(organizationId, 'jobs');

    return { message: 'Job deleted successfully' };
  }
}

export const jobsService = new JobsService();
