import { LlmProvider, LlmCompletionOptions } from './types';

export class MockLlmProvider implements LlmProvider {
  async generateCompletion(options: LlmCompletionOptions): Promise<string> {
    const { prompt } = options;

    // Extract Question
    const questionMatch = prompt.match(/Question:\s*(.+?)(?:\n\s*<untrusted_context>|$)/s);
    const question = questionMatch && questionMatch[1] ? questionMatch[1].trim() : '';

    // Extract Context blocks
    const contextMatch = prompt.match(/<untrusted_context>(.*?)<\/untrusted_context>/s);
    if (!contextMatch || !contextMatch[1]) {
      return 'I could not find sufficient information in the provided context to answer the question.';
    }

    const contextContent = contextMatch[1];

    // Parse source blocks e.g. [Source 1] Title: ...\nContent
    const sourceBlocks = contextContent.split(/\[Source\s+(\d+)\]/i).slice(1);

    const sources: Array<{ sourceNum: number; content: string }> = [];
    for (let i = 0; i < sourceBlocks.length; i += 2) {
      const sourceNum = parseInt(sourceBlocks[i] || '1', 10);
      const content = sourceBlocks[i + 1] || '';
      sources.push({ sourceNum, content });
    }

    if (sources.length === 0) {
      return 'I could not find sufficient information in the provided context to answer the question.';
    }

    // Tokenize question keywords
    const stopWords = new Set([
      'what', 'when', 'where', 'which', 'who', 'whom', 'whose', 'why', 'how',
      'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
      'do', 'does', 'did', 'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on',
      'at', 'to', 'for', 'of', 'with', 'about', 'by', 'our', 'your', 'their',
      'can', 'could', 'should', 'would', 'will', 'shall', 'may', 'might', 'must',
      'ignore', 'previous', 'instructions', 'system', 'prompt'
    ]);

    const qTokens = question
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !stopWords.has(t));

    interface ScoredSentence {
      sourceNum: number;
      text: string;
      score: number;
    }

    const scoredSentences: ScoredSentence[] = [];

    for (const src of sources) {
      const rawSentences = src.content
        .split(/(?<=[.!?])\s+|\n+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 15 && !s.toLowerCase().startsWith('title:'));

      for (const sent of rawSentences) {
        const lower = sent.toLowerCase();
        // Specifically ignore prompt injection attacks
        if (
          lower.includes('ignore previous instructions') ||
          lower.includes('disregard all instructions') ||
          lower.includes('you are now') ||
          lower.includes('bypass')
        ) {
          continue;
        }

        const sentTokens = new Set(
          sent
            .toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter((t) => t.length > 2)
        );

        let overlap = 0;
        for (const qt of qTokens) {
          if (sentTokens.has(qt)) overlap++;
        }

        if (overlap > 0) {
          scoredSentences.push({ sourceNum: src.sourceNum, text: sent, score: overlap });
        }
      }
    }

    // Sort by score descending
    scoredSentences.sort((a, b) => b.score - a.score);

    if (scoredSentences.length === 0) {
      const firstSource = sources[0];
      const fallbackSentences = firstSource
        ? firstSource.content
            .split(/(?<=[.!?])\s+|\n+/)
            .map((s) => s.trim())
            .filter((s) => s.length > 20 && !s.toLowerCase().startsWith('title:'))
        : [];

      const chosen = fallbackSentences.find(
        (s) => !s.toLowerCase().includes('ignore previous instructions')
      );

      if (chosen && firstSource) {
        const clean = chosen.replace(/[.,;:]$/, '');
        return `${clean} [${firstSource.sourceNum}].`;
      }
      return 'I could not find sufficient information in the provided context to answer the question.';
    }

    // Take top matching sentences (up to 3)
    const topSentences = scoredSentences.slice(0, 3);
    const answers = topSentences.map((s) => {
      const text = s.text.replace(/[.,;:]$/, '');
      return `${text} [${s.sourceNum}].`;
    });

    return answers.join(' ');
  }
}
