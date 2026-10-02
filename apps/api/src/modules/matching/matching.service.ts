import crypto from 'crypto';
import { prisma } from '../../lib/prisma';
import { NotFoundError } from '../../lib/errors/AppError';
import { getJobEmbedding, knnCandidates } from '../../lib/vector';
import { embeddingService } from '../embeddings/embedding.service';
import { MATCHING_WEIGHTS } from './matching.config';
import { ScoringCandidateInput, ScoringJobInput } from './types';
import { scoreCandidate, rankAndCalibrate } from './ranker';
import { JobMatchesResponse, CandidateMatchResult } from '@talentpulse/shared';

export class MatchingService {
  /**
   * Retrieves hybrid ranked candidate matches for a job requisition.
   * 1. Fetches requisition and embedding
   * 2. Retrieves top 50 candidates by vector cosine similarity
   * 3. Scores candidates using pure explainable hybrid formula (with protected attributes excluded)
   * 4. Reranks and takes top limit (default 20)
   * 5. Writes an immutable audit Recommendation row
   */
  async getJobMatches(
    jobId: string,
    orgId: string,
    limit: number = 20,
    userId?: string,
  ): Promise<JobMatchesResponse> {
    const job = await prisma.job.findFirst({
      where: { id: jobId, organizationId: orgId },
    });

    if (!job) {
      throw new NotFoundError('Job not found in your organization');
    }

    // Ensure job vector embedding exists
    let jobVector = await getJobEmbedding(jobId);
    if (!jobVector) {
      await embeddingService.embedJob(jobId, orgId);
      jobVector = await getJobEmbedding(jobId);
    }

    if (!jobVector) {
      throw new Error('Failed to compute or retrieve requisition embedding');
    }

    // Retrieve top 50 candidates via pgvector KNN
    const knnResults = await knnCandidates({
      orgId,
      queryVector: jobVector,
      limit: 50,
    });

    if (knnResults.length === 0) {
      return {
        jobId: job.id,
        jobTitle: job.title,
        totalMatches: 0,
        matches: [],
      };
    }

    const candidateIds = knnResults.map((k) => k.id);
    const candidateRecords = await prisma.candidate.findMany({
      where: {
        id: { in: candidateIds },
        organizationId: orgId,
      },
    });

    const candidateMap = new Map(candidateRecords.map((c) => [c.id, c]));
    const similarityMap = new Map(knnResults.map((k) => [k.id, k.similarity]));

    const scoringJob: ScoringJobInput = {
      id: job.id,
      title: job.title,
      category: job.category,
      location: job.location,
      remote: job.remote,
      employmentType: job.employmentType,
      minExperienceYears: job.minExperienceYears,
      requiredSkills: job.requiredSkills,
      preferredSkills: job.preferredSkills,
      requiredEducation: job.requiredEducation,
      preferredCertifications: job.preferredCertifications,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
    };

    // Map to ScoringCandidateInput, strictly omitting name, email, age, gender, photo
    const scoringResults = candidateIds
      .map((id) => {
        const cand = candidateMap.get(id);
        if (!cand) return null;

        const scoringCandidate: ScoringCandidateInput = {
          id: cand.id,
          skills: cand.skills,
          experienceYears: cand.experienceYears,
          location: cand.location,
          remoteOk: cand.remoteOk,
          education: cand.education,
          certifications: cand.certifications,
          preferredLocations: cand.preferredLocations,
          preferredEmploymentTypes: cand.preferredEmploymentTypes,
          expectedSalary: cand.expectedSalary,
          hasEmbedding: cand.embeddedAt !== null,
          hasResume: !!cand.resumeText,
        };

        const sim = similarityMap.get(id) ?? 0;
        return scoreCandidate(scoringCandidate, scoringJob, sim);
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    // Rerank candidates and calibrate confidence margins
    const ranked = rankAndCalibrate(scoringResults);
    const cappedLimit = Math.max(1, Math.min(limit, 50));
    const topMatches = ranked.slice(0, cappedLimit);

    // Hash the candidate pool IDs for audit tracking
    const candidatePoolHash = crypto
      .createHash('sha256')
      .update(candidateIds.slice().sort().join(','))
      .digest('hex');

    const auditDecision = {
      jobId,
      rankedCandidates: topMatches.map((m) => ({
        candidateId: m.candidateId,
        score: m.score,
        confidence: m.confidence,
        breakdown: m.breakdown,
      })),
    };

    // Create immutable audit record
    const recommendation = await prisma.recommendation.create({
      data: {
        organizationId: orgId,
        userId: userId || null,
        type: 'CANDIDATE_RANKING',
        modelVersion: 'hybrid-v1',
        inputRef: {
          jobId,
          poolHash: candidatePoolHash,
          poolSize: candidateIds.length,
        },
        decision: auditDecision,
        explanation: {
          weights: MATCHING_WEIGHTS,
          topScore: topMatches[0]?.score ?? 0,
        },
        confidence: topMatches[0]?.confidence ?? 0.8,
        status: 'PROPOSED',
      },
    });

    // Assemble user-facing presentation items
    const matches: CandidateMatchResult[] = topMatches.map((m) => {
      const cand = candidateMap.get(m.candidateId)!;
      return {
        candidateId: m.candidateId,
        name: cand.name,
        email: cand.email,
        location: cand.location,
        experienceYears: cand.experienceYears,
        skills: cand.skills,
        remoteOk: cand.remoteOk,
        score: m.score,
        breakdown: m.breakdown,
        reasons: m.reasons,
        gaps: m.gaps,
        confidence: m.confidence,
      };
    });

    return {
      jobId: job.id,
      jobTitle: job.title,
      totalMatches: matches.length,
      recommendationId: recommendation.id,
      matches,
    };
  }
}

export const matchingService = new MatchingService();
