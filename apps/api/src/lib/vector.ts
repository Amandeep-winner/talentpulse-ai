import { prisma } from './prisma';

/**
 * Converts a numeric array into a PostgreSQL pgvector literal string '[v1,v2,...]'
 */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(',')}]`;
}

/**
 * Computes exact cosine similarity between two numeric vectors in TypeScript
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const valA = a[i]!;
    const valB = b[i]!;
    dotProduct += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Updates embedding on a Job record using raw SQL
 */
export async function updateJobEmbedding(jobId: string, embedding: number[]): Promise<void> {
  const vectorStr = toVectorLiteral(embedding);
  await prisma.$executeRawUnsafe(
    `UPDATE "Job" SET embedding = $1::vector, "embeddedAt" = NOW() WHERE id = $2::uuid`,
    vectorStr,
    jobId,
  );
}

/**
 * Updates embedding on a Candidate record using raw SQL
 */
export async function updateCandidateEmbedding(candidateId: string, embedding: number[]): Promise<void> {
  const vectorStr = toVectorLiteral(embedding);
  await prisma.$executeRawUnsafe(
    `UPDATE "Candidate" SET embedding = $1::vector, "embeddedAt" = NOW() WHERE id = $2::uuid`,
    vectorStr,
    candidateId,
  );
}

/**
 * Candidate Knn search result
 */
export interface CandidateKnnResult {
  id: string;
  name: string;
  email: string;
  location: string;
  experienceYears: number;
  skills: string[];
  remoteOk: boolean;
  distance: number;
  similarity: number;
}

/**
 * Performs KNN search on Candidates using cosine distance (<=>)
 */
export async function knnCandidates(options: {
  orgId: string;
  queryVector: number[];
  limit?: number;
  minExperience?: number;
  remoteOk?: boolean;
}): Promise<CandidateKnnResult[]> {
  const { orgId, queryVector, limit = 20, minExperience, remoteOk } = options;
  const vectorStr = toVectorLiteral(queryVector);

  let query = `
    SELECT
      id,
      name,
      email,
      location,
      "experienceYears",
      skills,
      "remoteOk",
      (embedding <=> $1::vector) AS distance,
      (1 - (embedding <=> $1::vector)) AS similarity
    FROM "Candidate"
    WHERE "organizationId" = $2::uuid
      AND embedding IS NOT NULL
  `;

  const params: unknown[] = [vectorStr, orgId];
  let paramIdx = 3;

  if (minExperience !== undefined) {
    query += ` AND "experienceYears" >= $${paramIdx++}`;
    params.push(minExperience);
  }

  if (remoteOk !== undefined) {
    query += ` AND "remoteOk" = $${paramIdx++}`;
    params.push(remoteOk);
  }

  query += ` ORDER BY distance ASC LIMIT $${paramIdx}`;
  params.push(limit);

  return prisma.$queryRawUnsafe<CandidateKnnResult[]>(query, ...params);
}
