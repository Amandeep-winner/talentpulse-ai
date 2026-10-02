import { chunkText } from '../src/utils/chunk';

describe('Paragraph-Aware Chunker (chunkText)', () => {
  it('returns empty array for empty string or whitespace', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n\n   \t  ')).toEqual([]);
  });

  it('returns single chunk for short text under minChars without dropping', () => {
    const text = 'Senior Software Engineer with experience in React and Node.js.';
    const chunks = chunkText(text, { maxChars: 800, minChars: 80, overlapChars: 100 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.idx).toBe(0);
    expect(chunks[0]!.content).toBe(text);
  });

  it('keeps paragraphs together when total length is within maxChars', () => {
    const text = [
      'Experienced Full Stack Engineer with 7 years building scalable systems.',
      'Proficient in TypeScript, PostgreSQL, Redis, and React architecture.',
      'Proven leadership in cross-functional squads delivering cloud services.',
    ].join('\n\n');

    const chunks = chunkText(text, { maxChars: 800, minChars: 80, overlapChars: 100 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.content).toContain('Experienced Full Stack');
    expect(chunks[0]!.content).toContain('cross-functional squads');
  });

  it('splits long multi-paragraph text across multiple chunks with overlap', () => {
    const para1 = 'Paragraph 1: '.padEnd(350, 'A');
    const para2 = 'Paragraph 2: '.padEnd(350, 'B');
    const para3 = 'Paragraph 3: '.padEnd(350, 'C');
    const fullText = `${para1}\n\n${para2}\n\n${para3}`;

    const chunks = chunkText(fullText, { maxChars: 500, minChars: 80, overlapChars: 100 });
    expect(chunks.length).toBeGreaterThan(1);

    // Verify sequential indexes
    chunks.forEach((chunk, index) => {
      expect(chunk.idx).toBe(index);
      expect(chunk.content.length).toBeLessThanOrEqual(600); // within tolerance
    });

    // Verify overlap presence: chunk 1 contains some content from chunk 0
    expect(chunks[1]!.content.length).toBeGreaterThan(80);
  });

  it('splits sentences if an individual paragraph exceeds maxChars', () => {
    const sentence1 = 'Sentence one is substantive and explains software design patterns thoroughly.';
    const sentence2 = 'Sentence two discusses high-concurrency architectures and fault-tolerant distributed systems.';
    const sentence3 = 'Sentence three outlines container orchestration with Kubernetes and Docker deployments.';
    const sentence4 = 'Sentence four details automated CI/CD pipelines, unit testing, and engineering velocity.';
    const longParagraph = [sentence1, sentence2, sentence3, sentence4].join(' ');

    const chunks = chunkText(longParagraph, { maxChars: 120, minChars: 40, overlapChars: 30 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]!.idx).toBe(0);
    expect(chunks[1]!.idx).toBe(1);
  });

  it('handles single unbroken words longer than maxChars with hard character split', () => {
    const hugeWord = 'X'.repeat(500);
    const chunks = chunkText(hugeWord, { maxChars: 150, minChars: 50, overlapChars: 20 });
    expect(chunks.length).toBeGreaterThan(2);
    chunks.forEach((chunk, idx) => {
      expect(chunk.idx).toBe(idx);
      expect(chunk.content.length).toBeLessThanOrEqual(150);
    });
  });
});
