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
 * Fetches the embedding vector for a Job as a numeric array
 */
export async function getJobEmbedding(jobId: string): Promise<number[] | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{ vec: string | null }>>(
    `SELECT embedding::text AS vec FROM "Job" WHERE id = $1::uuid`,
    jobId,
  );
  if (!rows[0] || !rows[0].vec) return null;
  const str = rows[0].vec.replace(/\[|\]/g, '');
  return str.split(',').map((n) => parseFloat(n));
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
 * Computes coordinate-wise mean of multiple vectors, then re-normalizes to unit length (L2 norm = 1)
 */
export function computeMeanVector(vectors: number[][]): number[] {
  if (vectors.length === 0) return new Array(384).fill(0);
  if (vectors.length === 1) return [...vectors[0]!];

  const dim = vectors[0]!.length;
  const mean = new Array<number>(dim).fill(0);

  for (const v of vectors) {
    for (let i = 0; i < dim; i++) {
      mean[i] = (mean[i] ?? 0) + v[i]!;
    }
  }

  for (let i = 0; i < dim; i++) {
    mean[i] = (mean[i] ?? 0) / vectors.length;
  }

  // Re-normalize to unit length
  let norm = 0;
  for (let i = 0; i < dim; i++) {
    norm += (mean[i] ?? 0) * (mean[i] ?? 0);
  }
  norm = Math.sqrt(norm);

  if (norm > 0) {
    for (let i = 0; i < dim; i++) {
      mean[i] = (mean[i] ?? 0) / norm;
    }
  }

  return mean;
}

/**
 * Inserts a CandidateChunk with pgvector embedding
 */
export async function insertCandidateChunk(
  candidateId: string,
  idx: number,
  content: string,
  embedding: number[]
): Promise<void> {
  const vectorStr = toVectorLiteral(embedding);
  await prisma.$executeRawUnsafe(
    `INSERT INTO "CandidateChunk" (id, "candidateId", idx, content, embedding)
     VALUES (gen_random_uuid(), $1::uuid, $2, $3, $4::vector)`,
    candidateId,
    idx,
    content,
    vectorStr
  );
}

/**
 * Deletes all CandidateChunk rows for a candidate (for idempotent re-indexing)
 */
export async function deleteCandidateChunks(candidateId: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `DELETE FROM "CandidateChunk" WHERE "candidateId" = $1::uuid`,
    candidateId
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
  education?: string | null;
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
      education,
      "remoteOk",
      (embedding <=> $1::vector) AS distance,
      ROUND((1 - (embedding <=> $1::vector))::numeric, 4)::float AS similarity
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

/**
 * Inserts a KnowledgeChunk with pgvector embedding
 */
export async function insertKnowledgeChunk(
  documentId: string,
  orgId: string,
  idx: number,
  content: string,
  embedding: number[]
): Promise<void> {
  const vectorStr = toVectorLiteral(embedding);
  await prisma.$executeRawUnsafe(
    `INSERT INTO "KnowledgeChunk" (id, "documentId", "organizationId", idx, content, embedding)
     VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, $5::vector)`,
    documentId,
    orgId,
    idx,
    content,
    vectorStr
  );
}

/**
 * Deletes all KnowledgeChunk rows for a document
 */
export async function deleteKnowledgeChunks(documentId: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `DELETE FROM "KnowledgeChunk" WHERE "documentId" = $1::uuid`,
    documentId
  );
}

/**
 * Knowledge chunk KNN search result
 */
export interface KnowledgeChunkKnnResult {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  category: string;
  idx: number;
  content: string;
  distance: number;
  similarity: number;
}

/**
 * Performs KNN search on KnowledgeChunks using cosine distance (<=>)
 */
export async function knnKnowledgeChunks(options: {
  orgId: string;
  queryVector: number[];
  limit?: number;
  category?: string;
}): Promise<KnowledgeChunkKnnResult[]> {
  const { orgId, queryVector, limit = 5, category } = options;
  const vectorStr = toVectorLiteral(queryVector);

  let query = `
    SELECT
      kc.id AS "chunkId",
      kc."documentId",
      kd.title AS "documentTitle",
      kd.category AS "category",
      kc.idx,
      kc.content,
      (kc.embedding <=> $1::vector) AS distance,
      ROUND((1 - (kc.embedding <=> $1::vector))::numeric, 4)::float AS similarity
    FROM "KnowledgeChunk" kc
    JOIN "KnowledgeDocument" kd ON kc."documentId" = kd.id
    WHERE kc."organizationId" = $2::uuid
      AND kc.embedding IS NOT NULL
  `;

  const params: unknown[] = [vectorStr, orgId];
  let paramIdx = 3;

  if (category) {
    query += ` AND kd.category = $${paramIdx++}`;
    params.push(category);
  }

  query += ` ORDER BY distance ASC LIMIT $${paramIdx}`;
  params.push(limit);

  return prisma.$queryRawUnsafe<KnowledgeChunkKnnResult[]>(query, ...params);
}

