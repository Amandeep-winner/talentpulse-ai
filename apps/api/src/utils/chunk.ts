export interface TextChunk {
  idx: number;
  content: string;
}

export interface ChunkOptions {
  maxChars?: number;
  overlapChars?: number;
  minChars?: number;
}

const DEFAULT_MAX_CHARS = 800;
const DEFAULT_OVERLAP_CHARS = 100;
const DEFAULT_MIN_CHARS = 80;

/**
 * Paragraph-aware text chunker.
 * Chunks text respecting paragraph and sentence boundaries, with configurable
 * max length (800 chars default), overlap (100 chars default), and minimum size (80 chars default).
 */
export function chunkText(text: string, options: ChunkOptions = {}): TextChunk[] {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const overlapChars = options.overlapChars ?? DEFAULT_OVERLAP_CHARS;
  const minChars = options.minChars ?? DEFAULT_MIN_CHARS;

  const normalized = text.trim();
  if (!normalized) {
    return [];
  }

  if (normalized.length <= maxChars) {
    return [{ idx: 0, content: normalized }];
  }

  // 1. Split into paragraphs
  const rawParagraphs = normalized.split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean);

  // 2. Further break paragraphs that exceed maxChars into sentences
  const units: string[] = [];
  for (const p of rawParagraphs) {
    if (p.length <= maxChars) {
      units.push(p);
    } else {
      // Split into sentences
      const sentences = p.split(/(?<=[.?!])\s+/).filter(Boolean);
      for (const s of sentences) {
        if (s.length <= maxChars) {
          units.push(s);
        } else {
          // Hard split very long sentences on whitespace or characters
          const words = s.split(/\s+/);
          let currentPiece = '';
          for (const word of words) {
            if (word.length > maxChars) {
              if (currentPiece) {
                units.push(currentPiece);
                currentPiece = '';
              }
              for (let wIdx = 0; wIdx < word.length; wIdx += maxChars) {
                units.push(word.slice(wIdx, wIdx + maxChars));
              }
            } else if ((currentPiece + ' ' + word).trim().length <= maxChars) {
              currentPiece = (currentPiece + ' ' + word).trim();
            } else {
              if (currentPiece) units.push(currentPiece);
              currentPiece = word;
            }
          }
          if (currentPiece) units.push(currentPiece);
        }
      }
    }
  }

  // 3. Assemble units into chunks with overlap
  const chunks: string[] = [];
  let currentChunk = '';

  for (let i = 0; i < units.length; i++) {
    const unit = units[i]!;
    const candidate = currentChunk ? `${currentChunk}\n\n${unit}` : unit;

    if (candidate.length <= maxChars) {
      currentChunk = candidate;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);

        // Compute overlap from tail of currentChunk
        let overlap = '';
        if (overlapChars > 0 && currentChunk.length > overlapChars) {
          const tail = currentChunk.slice(-overlapChars).trim();
          // Find first space in tail to not cut mid-word
          const firstSpace = tail.indexOf(' ');
          overlap = firstSpace !== -1 ? tail.slice(firstSpace + 1) : tail;
        }

        if (overlap) {
          const withOverlap = `${overlap}\n\n${unit}`;
          if (withOverlap.length <= maxChars) {
            currentChunk = withOverlap;
          } else {
            const budget = maxChars - unit.length - 2;
            if (budget > 10) {
              const trimmedOverlap = overlap.slice(-budget).trim();
              const space = trimmedOverlap.indexOf(' ');
              const cleanOverlap = space !== -1 ? trimmedOverlap.slice(space + 1) : trimmedOverlap;
              currentChunk = cleanOverlap ? `${cleanOverlap}\n\n${unit}` : unit;
            } else {
              currentChunk = unit;
            }
          }
        } else {
          currentChunk = unit;
        }
      } else {
        chunks.push(unit);
        currentChunk = '';
      }
    }
  }

  if (currentChunk) {
    // If leftover is smaller than minChars and we already have chunks, attempt merge within maxChars
    if (currentChunk.length < minChars && chunks.length > 0) {
      const prev = chunks[chunks.length - 1]!;
      const merged = `${prev}\n\n${currentChunk}`;
      if (merged.length <= maxChars) {
        chunks[chunks.length - 1] = merged;
      } else {
        chunks.push(currentChunk);
      }
    } else {
      chunks.push(currentChunk);
    }
  }

  return chunks.map((content, idx) => ({
    idx,
    content: content.trim(),
  }));
}
