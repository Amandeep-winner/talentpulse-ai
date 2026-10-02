import { prisma } from '../../lib/prisma';
import { NotFoundError } from '../../lib/errors';
import { chunkText } from '../../utils/chunk';
import { embedTexts, embedText } from '../../lib/embeddings';
import {
  updateCandidateEmbedding,
  updateJobEmbedding,
  insertCandidateChunk,
  deleteCandidateChunks,
  computeMeanVector,
} from '../../lib/vector';
import { logger } from '../../lib/logger';

export class EmbeddingService {
  /**
   * Embeds a candidate: builds text profile, chunks, embeds chunks, stores CandidateChunk rows,
   * calculates the mean vector, re-normalizes, and stores the candidate-level vector.
   * Idempotent: re-embedding deletes previous chunks first.
   */
  public async embedCandidate(
    candidateId: string,
    orgId?: string
  ): Promise<{ chunkCount: number; dimension: number }> {
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });

    if (!candidate || (orgId && candidate.organizationId !== orgId)) {
      throw new NotFoundError('Candidate not found');
    }

    const parts: string[] = [];
    if (candidate.skills && candidate.skills.length > 0) {
      parts.push(`Skills: ${candidate.skills.join(', ')}`);
    }
    if (candidate.experienceYears !== undefined && candidate.experienceYears !== null) {
      parts.push(`Experience: ${candidate.experienceYears} years`);
    }
    if (candidate.location) {
      parts.push(`Location: ${candidate.location}`);
    }
    if (candidate.education) {
      parts.push(`Education: ${candidate.education}`);
    }
    if (candidate.certifications && candidate.certifications.length > 0) {
      parts.push(`Certifications: ${candidate.certifications.join(', ')}`);
    }
    if (candidate.resumeText) {
      parts.push(candidate.resumeText);
    }

    const text = parts.join('\n\n').trim() || `Candidate Profile: ${candidate.name}`;
    const chunks = chunkText(text, { maxChars: 800, overlapChars: 100, minChars: 80 });

    if (chunks.length === 0) {
      chunks.push({ idx: 0, content: `Candidate Profile: ${candidate.name}` });
    }

    // Embed all chunks
    const chunkVectors = await embedTexts(chunks.map((c) => c.content));

    // Idempotently delete previous chunks and insert new ones
    await deleteCandidateChunks(candidateId);
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      const vector = chunkVectors[i]!;
      await insertCandidateChunk(candidateId, chunk.idx, chunk.content, vector);
    }

    // Compute candidate-level mean vector
    const meanVector = computeMeanVector(chunkVectors);
    await updateCandidateEmbedding(candidateId, meanVector);

    logger.debug(
      { candidateId, chunkCount: chunks.length, dimension: meanVector.length },
      'Candidate embedded successfully'
    );

    return { chunkCount: chunks.length, dimension: meanVector.length };
  }

  /**
   * Embeds a job requisition: builds title, description, skills, embeds, and stores in Job.
   */
  public async embedJob(
    jobId: string,
    orgId?: string
  ): Promise<{ dimension: number }> {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job || (orgId && job.organizationId !== orgId)) {
      throw new NotFoundError('Job not found');
    }

    const parts: string[] = [
      job.title,
      job.description,
      `Category: ${job.category}`,
      `Location: ${job.location}`,
    ];

    if (job.requiredSkills && job.requiredSkills.length > 0) {
      parts.push(`Required Skills: ${job.requiredSkills.join(', ')}`);
    }
    if (job.preferredSkills && job.preferredSkills.length > 0) {
      parts.push(`Preferred Skills: ${job.preferredSkills.join(', ')}`);
    }
    if (job.requiredEducation) {
      parts.push(`Required Education: ${job.requiredEducation}`);
    }

    const text = parts.join('\n\n').trim();
    const vector = await embedText(text);

    await updateJobEmbedding(jobId, vector);

    logger.debug({ jobId, dimension: vector.length }, 'Job embedded successfully');

    return { dimension: vector.length };
  }

  /**
   * Reindexes all candidates and jobs for an organization
   */
  public async reindexAll(
    orgId: string
  ): Promise<{ candidatesCount: number; jobsCount: number }> {
    const [candidates, jobs] = await Promise.all([
      prisma.candidate.findMany({
        where: { organizationId: orgId },
        select: { id: true },
      }),
      prisma.job.findMany({
        where: { organizationId: orgId },
        select: { id: true },
      }),
    ]);

    for (const c of candidates) {
      await this.embedCandidate(c.id, orgId);
    }

    for (const j of jobs) {
      await this.embedJob(j.id, orgId);
    }

    logger.info(
      { orgId, candidatesCount: candidates.length, jobsCount: jobs.length },
      'Full organization reindex complete'
    );

    return { candidatesCount: candidates.length, jobsCount: jobs.length };
  }
}

export const embeddingService = new EmbeddingService();
