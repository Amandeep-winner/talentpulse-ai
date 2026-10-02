import { EmbeddingProvider } from './types';
import { SKILL_TAXONOMY } from '../../utils/skills';

const EMBEDDING_DIM = 384;

/**
 * 32-bit FNV-1a hash algorithm
 */
function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Local deterministic feature-hashing embedding provider.
 * Uses sublinear term frequency, unigram + bigram extraction, FNV-1a signed hashing,
 * canonical skill boosting from taxonomy, and L2 normalization to produce 384-dimensional unit vectors.
 */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  public readonly name = 'local';
  public readonly dimension: number;

  constructor(dimension: number = EMBEDDING_DIM) {
    this.dimension = dimension;
  }

  public async embed(texts: string[]): Promise<number[][]>;
  public async embed(text: string): Promise<number[]>;
  public async embed(input: string | string[]): Promise<number[] | number[][]> {
    if (Array.isArray(input)) {
      return input.map((t) => this.embedSingle(t));
    }
    return this.embedSingle(input);
  }

  public embedSingle(text: string): number[] {
    const vector = new Array<number>(this.dimension).fill(0);
    const cleaned = text.toLowerCase().trim();
    if (!cleaned) {
      return vector;
    }

    // Tokenize
    const rawTokens = cleaned.match(/[a-z0-9+#.-]+/g) || [];
    const tokens = rawTokens
      .map((t) => t.replace(/^[.-]+|[.-]+$/g, ''))
      .filter((t) => t.length > 0);

    if (tokens.length === 0) {
      return vector;
    }

    // Term counts for unigrams and bigrams
    const termCounts = new Map<string, number>();
    const isSkillMap = new Map<string, boolean>();
    const canonicalMap = new Map<string, string>();

    for (let i = 0; i < tokens.length; i++) {
      const unigram = tokens[i]!;
      termCounts.set(unigram, (termCounts.get(unigram) || 0) + 1);

      const canonicalUni = SKILL_TAXONOMY[unigram];
      if (canonicalUni) {
        isSkillMap.set(unigram, true);
        canonicalMap.set(unigram, canonicalUni.toLowerCase());
      }

      if (i < tokens.length - 1) {
        const bigram = `${unigram} ${tokens[i + 1]}`;
        termCounts.set(bigram, (termCounts.get(bigram) || 0) + 1);

        const canonicalBi = SKILL_TAXONOMY[bigram];
        if (canonicalBi) {
          isSkillMap.set(bigram, true);
          canonicalMap.set(bigram, canonicalBi.toLowerCase());
        }
      }
    }

    // Hash into 384 dimensions with signed feature hashing
    for (const [term, count] of termCounts.entries()) {
      const isSkill = isSkillMap.get(term) || false;
      const weight = (1 + Math.log(count)) * (isSkill ? 2.0 : 1.0);

      const idx = fnv1a(term) % this.dimension;
      const sign = (fnv1a(term + '#sign') & 1) === 0 ? 1 : -1;
      vector[idx] = (vector[idx] ?? 0) + sign * weight;

      // Also hash canonical name if it exists and differs
      const canonical = canonicalMap.get(term);
      if (canonical && canonical !== term) {
        const cIdx = fnv1a(canonical) % this.dimension;
        const cSign = (fnv1a(canonical + '#sign') & 1) === 0 ? 1 : -1;
        vector[cIdx] = (vector[cIdx] ?? 0) + cSign * weight;
      }
    }

    // L2 Normalize
    let norm = 0;
    for (let i = 0; i < this.dimension; i++) {
      norm += vector[i]! * vector[i]!;
    }
    norm = Math.sqrt(norm);

    if (norm > 0) {
      for (let i = 0; i < this.dimension; i++) {
        vector[i] = vector[i]! / norm;
      }
    }

    return vector;
  }
}

export { LocalEmbeddingProvider as LocalFeatureHashingEmbedder };
