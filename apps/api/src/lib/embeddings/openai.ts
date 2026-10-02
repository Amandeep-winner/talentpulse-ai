import { EmbeddingProvider } from './types';
import { env } from '../../config/env';

/**
 * OpenAI-compatible embedding provider.
 * Calls external embedding endpoint with dimensions=384.
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  public readonly name = 'openai-compatible';
  public readonly dimension = env.EMBEDDING_DIM || 384;

  constructor() {
    if (!env.EMBEDDING_BASE_URL) {
      throw new Error(
        'EMBEDDING_BASE_URL must be configured when EMBEDDING_PROVIDER=openai-compatible. Switch to EMBEDDING_PROVIDER=local for zero-config offline embeddings.'
      );
    }
  }

  public async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const url = `${env.EMBEDDING_BASE_URL.replace(/\/+$/, '')}/embeddings`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.EMBEDDING_API_KEY ? { Authorization: `Bearer ${env.EMBEDDING_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        input: texts,
        model: env.EMBEDDING_MODEL || 'text-embedding-3-small',
        dimensions: this.dimension,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI embedding failed (${response.status}): ${errText}`);
    }

    const json = (await response.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
    };

    return json.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
  }
}
