export interface LlmCompletionOptions {
  systemPrompt: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LlmProvider {
  generateCompletion(options: LlmCompletionOptions): Promise<string>;
}
