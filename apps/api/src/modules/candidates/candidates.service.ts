import { Candidate, Prisma } from '@prisma/client';
import {
  CreateCandidateRequest,
  UpdateCandidateRequest,
  CandidateItem,
  CandidateFilterQuery,
  PaginationMeta,
  CandidateSearchQuery,
  CandidateSearchResponse,
} from '@talentpulse/shared';
import { prisma } from '../../lib/prisma';
import { normalizeSkills } from '../../utils/skills';
import { enqueue } from '../../lib/queue';
import { cached, CacheResult, invalidate } from '../../lib/cache';
import { embedText } from '../../lib/embeddings';
import { knnCandidates } from '../../lib/vector';
import { NotFoundError, ValidationError } from '../../lib/errors/AppError';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse');

function mapCandidateToItem(c: Candidate): CandidateItem {
  return {
    id: c.id,
    organizationId: c.organizationId,
    name: c.name,
    email: c.email,
    location: c.location,
    remoteOk: c.remoteOk,
    experienceYears: c.experienceYears,
    skills: c.skills,
    education: c.education,
    certifications: c.certifications || [],
    preferredLocations: c.preferredLocations || [],
    preferredEmploymentTypes: c.preferredEmploymentTypes || [],
    expectedSalary: c.expectedSalary,
    resumeText: c.resumeText,
    embeddedAt: c.embeddedAt ? c.embeddedAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt?.toISOString(),
  };
}

export class CandidatesService {
  async listCandidates(
    organizationId: string,
    query: CandidateFilterQuery,
  ): Promise<{ candidates: CandidateItem[]; meta: PaginationMeta }> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));

    const where: Prisma.CandidateWhereInput = {
      organizationId,
    };

    if (query.location) {
      where.location = { contains: query.location, mode: 'insensitive' };
    }

    if (query.remoteOk !== undefined) {
      where.remoteOk = query.remoteOk;
    }

    if (query.minExperience !== undefined) {
      where.experienceYears = { gte: Number(query.minExperience) };
    }

    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
        { skills: { hasSome: [query.q] } },
      ];
    }

    let orderBy: Prisma.CandidateOrderByWithRelationInput = { createdAt: 'desc' };
    if (query.sort) {
      const [field, direction] = query.sort.split(':');
      if (field && ['createdAt', 'name', 'experienceYears'].includes(field)) {
        orderBy = { [field]: direction?.toLowerCase() === 'asc' ? 'asc' : 'desc' };
      }
    }

    const [total, candidates] = await Promise.all([
      prisma.candidate.count({ where }),
      prisma.candidate.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy,
      }),
    ]);

    const totalPages = Math.ceil(total / pageSize);

    return {
      candidates: candidates.map(mapCandidateToItem),
      meta: {
        page,
        pageSize,
        total,
        totalPages,
      },
    };
  }

  async getCandidate(organizationId: string, id: string): Promise<CandidateItem> {
    const candidate = await prisma.candidate.findFirst({
      where: { id, organizationId },
    });

    if (!candidate) {
      throw new NotFoundError('Candidate not found in your organization');
    }

    return mapCandidateToItem(candidate);
  }

  async createCandidate(organizationId: string, input: CreateCandidateRequest): Promise<CandidateItem> {
    const skills = normalizeSkills(input.skills || []);

    const candidate = await prisma.candidate.create({
      data: {
        organizationId,
        name: input.name,
        email: input.email.toLowerCase(),
        location: input.location,
        remoteOk: input.remoteOk ?? true,
        experienceYears: input.experienceYears ?? 0,
        skills,
        education: input.education,
        certifications: input.certifications || [],
        preferredLocations: input.preferredLocations || [],
        preferredEmploymentTypes: input.preferredEmploymentTypes || [],
        expectedSalary: input.expectedSalary,
        resumeText: input.resumeText,
      },
    });

    enqueue('embedding', { type: 'candidate', id: candidate.id, orgId: organizationId }).catch(() => {});
    await invalidate(organizationId, 'candidates-search');

    return mapCandidateToItem(candidate);
  }

  async updateCandidate(
    organizationId: string,
    id: string,
    input: UpdateCandidateRequest,
  ): Promise<CandidateItem> {
    const existing = await prisma.candidate.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      throw new NotFoundError('Candidate not found in your organization');
    }

    const data: Prisma.CandidateUpdateInput = {};

    if (input.name !== undefined) data.name = input.name;
    if (input.email !== undefined) data.email = input.email.toLowerCase();
    if (input.location !== undefined) data.location = input.location;
    if (input.remoteOk !== undefined) data.remoteOk = input.remoteOk;
    if (input.experienceYears !== undefined) data.experienceYears = input.experienceYears;
    if (input.education !== undefined) data.education = input.education;
    if (input.certifications !== undefined) data.certifications = input.certifications;
    if (input.preferredLocations !== undefined) data.preferredLocations = input.preferredLocations;
    if (input.preferredEmploymentTypes !== undefined) data.preferredEmploymentTypes = input.preferredEmploymentTypes;
    if (input.expectedSalary !== undefined) data.expectedSalary = input.expectedSalary;
    if (input.resumeText !== undefined) data.resumeText = input.resumeText;

    if (input.skills !== undefined) {
      data.skills = normalizeSkills(input.skills);
    }

    const updated = await prisma.candidate.update({
      where: { id },
      data,
    });

    enqueue('embedding', { type: 'candidate', id: updated.id, orgId: organizationId }).catch(() => {});
    await invalidate(organizationId, 'candidates-search');

    return mapCandidateToItem(updated);
  }

  async deleteCandidate(organizationId: string, id: string): Promise<{ message: string }> {
    const existing = await prisma.candidate.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      throw new NotFoundError('Candidate not found in your organization');
    }

    await prisma.candidate.delete({
      where: { id },
    });

    await invalidate(organizationId, 'candidates-search');

    return { message: 'Candidate deleted successfully' };
  }

  async processResumeUpload(
    organizationId: string,
    candidateId: string,
    options: {
      buffer?: Buffer;
      mimetype?: string;
      pastedText?: string;
    },
  ): Promise<{ id: string; resumeText: string; message: string }> {
    const candidate = await prisma.candidate.findFirst({
      where: { id: candidateId, organizationId },
    });

    if (!candidate) {
      throw new NotFoundError('Candidate not found in your organization');
    }

    let extractedText = '';

    if (options.pastedText && options.pastedText.trim().length > 0) {
      extractedText = options.pastedText.trim();
    } else if (options.buffer && options.mimetype) {
      if (options.mimetype === 'application/pdf') {
        try {
          const parsed = await pdfParse(options.buffer);
          extractedText = parsed.text.trim();
        } catch {
          throw new ValidationError('Failed to parse PDF file');
        }
      } else if (options.mimetype === 'text/plain') {
        extractedText = options.buffer.toString('utf-8').trim();
      } else {
        throw new ValidationError('Invalid file type. Only PDF and plain text (.txt) files are allowed');
      }
    } else {
      throw new ValidationError('Either resume file upload or pasted resume text is required');
    }

    if (!extractedText) {
      throw new ValidationError('Extracted resume text is empty');
    }

    await prisma.candidate.update({
      where: { id: candidateId },
      data: { resumeText: extractedText },
    });

    enqueue('embedding', { type: 'candidate', id: candidateId, orgId: organizationId }).catch(() => {});

    await invalidate(organizationId, 'candidates');
    await invalidate(organizationId, 'candidates-search');

    return {
      id: candidateId,
      resumeText: extractedText,
      message: 'Resume text saved successfully',
    };
  }

  /**
   * Semantic candidate search via query embedding and pgvector cosine similarity (<=>).
   * Cached for 60 seconds per organization and query parameters.
   */
  async searchSemantic(
    organizationId: string,
    query: CandidateSearchQuery,
  ): Promise<CacheResult<CandidateSearchResponse>> {
    const q = query.q.trim();
    if (!q) {
      throw new ValidationError('Search query cannot be empty');
    }

    return cached(organizationId, 'candidates-search', query, 60, async () => {
      const queryVector = await embedText(q);
      const results = await knnCandidates({
        orgId: organizationId,
        queryVector,
        limit: query.limit ?? 20,
        minExperience: query.minExperience,
        remoteOk: query.remoteOk,
      });

      return {
        query: q,
        total: results.length,
        candidates: results.map((r) => ({
          id: r.id,
          name: r.name,
          email: r.email,
          location: r.location,
          experienceYears: Number(r.experienceYears),
          skills: r.skills || [],
          education: r.education || null,
          remoteOk: r.remoteOk,
          distance: Number(r.distance),
          similarity: Number(r.similarity),
        })),
      };
    });
  }
}

export const candidatesService = new CandidatesService();
