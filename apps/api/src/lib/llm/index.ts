import { LlmProvider } from './types';
import { MockLlmProvider } from './mock';

let customProvider: LlmProvider | null = null;
let defaultProvider: LlmProvider | null = null;

export function getLlmProvider(): LlmProvider {
  if (customProvider) {
    return customProvider;
  }

  if (!defaultProvider) {
    // Default to MockLlmProvider for local deterministic execution and tests
    defaultProvider = new MockLlmProvider();
  }

  return defaultProvider;
}

export function setLlmProvider(provider: LlmProvider | null): void {
  customProvider = provider;
}

export * from './types';
export * from './mock';
