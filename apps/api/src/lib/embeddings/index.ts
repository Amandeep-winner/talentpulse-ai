import { EmbeddingProvider } from './types';
import { LocalEmbeddingProvider } from './local';
import { OpenAIEmbeddingProvider } from './openai';
import { env } from '../../config/env';

export * from './types';
export * from './local';
export * from './openai';

let defaultProvider: EmbeddingProvider | null = null;

export function getEmbeddingProvider(): EmbeddingProvider {
  if (defaultProvider) {
    return defaultProvider;
  }

  if (env.EMBEDDING_PROVIDER === 'openai-compatible') {
    defaultProvider = new OpenAIEmbeddingProvider();
  } else {
    defaultProvider = new LocalEmbeddingProvider();
  }

  return defaultProvider;
}

/**
 * Convenience helper to embed an array of texts using the active provider
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const provider = getEmbeddingProvider();
  return provider.embed(texts);
}

/**
 * Convenience helper to embed a single text using the active provider
 */
export async function embedText(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text]);
  return vector || new Array<number>(384).fill(0);
}
