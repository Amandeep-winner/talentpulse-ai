import { LocalFeatureHashingEmbedder } from '../src/lib/embeddings/local';
import { embedText, embedTexts } from '../src/lib/embeddings';
import { cosineSimilarity, computeMeanVector } from '../src/lib/vector';

describe('Embedding Engine & Vector Operations', () => {
  const embedder = new LocalFeatureHashingEmbedder(384);

  it('embeds text to fixed dimension of 384 with L2 unit norm', async () => {
    const text = 'Staff DevOps Engineer with extensive Kubernetes, Docker, and Terraform experience.';
    const vector = await embedder.embed(text);

    expect(vector).toHaveLength(384);

    // Assert L2 norm is approximately 1.0
    const sumSquares = vector.reduce((sum: number, val: number) => sum + val * val, 0);
    const norm = Math.sqrt(sumSquares);
    expect(norm).toBeCloseTo(1.0, 4);
  });

  it('is completely deterministic across multiple calls with same input', async () => {
    const text = 'Full Stack Developer with Node.js, TypeScript, and PostgreSQL experience in Bengaluru.';
    const vec1 = await embedder.embed(text);
    const vec2 = await embedder.embed(text);

    expect(vec1).toEqual(vec2);
  });

  it('embedTexts helper embeds multiple texts preserving count and order', async () => {
    const texts = [
      'Frontend React Engineer',
      'Backend Python Distributed Systems',
      'Clinical Nurse Specialist',
    ];
    const vectors = await embedTexts(texts);

    expect(vectors).toHaveLength(3);
    expect(vectors[0]).toHaveLength(384);
    expect(vectors[1]).toHaveLength(384);
    expect(vectors[2]).toHaveLength(384);

    // Each should be normalized
    for (const vec of vectors) {
      const norm = Math.sqrt(vec.reduce((s: number, v: number) => s + v * v, 0));
      expect(norm).toBeCloseTo(1.0, 4);
    }
  });

  it('reflects higher cosine similarity for semantically related texts than unrelated texts', async () => {
    const vecA = await embedText('Senior React Frontend Developer with TypeScript, Redux, and Next.js');
    const vecB = await embedText('Frontend Software Engineer experienced in React, Next.js, and modern UI design');
    const vecC = await embedText('Registered Staff Nurse in Pediatric Intensive Care Unit with BLS certification');

    const simRelated = cosineSimilarity(vecA, vecB);
    const simUnrelated = cosineSimilarity(vecA, vecC);

    expect(simRelated).toBeGreaterThan(simUnrelated);
    expect(simRelated).toBeGreaterThan(0.2);
  });

  it('boosts canonical skills recognized from skills taxonomy', async () => {
    const textWithoutSkill = 'Building enterprise software products with strong velocity and execution';
    const textWithSkill = 'Building enterprise software products with strong velocity and kubernetes docker';

    const vecWithout = await embedder.embed(textWithoutSkill);
    const vecWith = await embedder.embed(textWithSkill);

    // Vectors should differ because canonical skills were injected and boosted
    const similarity = cosineSimilarity(vecWithout, vecWith);
    expect(similarity).toBeLessThan(0.95);
  });

  describe('computeMeanVector', () => {
    it('returns zero-filled vector for empty array', () => {
      const result = computeMeanVector([]);
      expect(result).toHaveLength(384);
      expect(result.every((val) => val === 0)).toBe(true);
    });

    it('returns the exact vector for single-element array', () => {
      const v = new Array(384).fill(0);
      v[0] = 1;
      const result = computeMeanVector([v]);
      expect(result).toEqual(v);
    });

    it('computes coordinate-wise mean and re-normalizes to L2 unit norm', () => {
      const v1 = new Array(384).fill(0);
      v1[0] = 1;
      const v2 = new Array(384).fill(0);
      v2[1] = 1;

      const meanVec = computeMeanVector([v1, v2]);
      expect(meanVec).toHaveLength(384);

      // Coordinate-wise mean before norm is [0.5, 0.5, 0...]. After L2 norm it is [1/sqrt(2), 1/sqrt(2), 0...]
      expect(meanVec[0]).toBeCloseTo(Math.SQRT1_2, 4);
      expect(meanVec[1]).toBeCloseTo(Math.SQRT1_2, 4);

      const norm = Math.sqrt(meanVec.reduce((sum: number, val: number) => sum + val * val, 0));
      expect(norm).toBeCloseTo(1.0, 4);
    });
  });

  describe('cosineSimilarity', () => {
    it('returns 0 for empty or mismatched length vectors', () => {
      expect(cosineSimilarity([], [])).toBe(0);
      expect(cosineSimilarity([1, 0], [1])).toBe(0);
    });

    it('returns 1.0 for identical non-zero vectors', () => {
      const v = [0.6, 0.8];
      expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
    });

    it('returns 0 for orthogonal vectors', () => {
      const v1 = [1, 0, 0];
      const v2 = [0, 1, 0];
      expect(cosineSimilarity(v1, v2)).toBe(0);
    });
  });
});
