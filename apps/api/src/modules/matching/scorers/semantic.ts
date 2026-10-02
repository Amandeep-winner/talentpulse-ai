/**
 * Semantic Cosine Similarity Scorer.
 * Rescales cosine similarity to [0, 1] range and clips boundaries.
 */
export function scoreSemantic(cosineSim: number): {
  score: number;
  reason?: string;
} {
  // Clip between 0.0 and 1.0
  const score = Math.max(0.0, Math.min(1.0, cosineSim));
  const pct = Math.round(score * 100);

  let reason = `Semantic profile alignment: ${pct}% similarity`;
  if (score >= 0.7) {
    reason = `Strong semantic role alignment (${pct}% similarity) with requisition requirements`;
  } else if (score >= 0.45) {
    reason = `Moderate semantic alignment (${pct}% similarity) with position background`;
  }

  return { score, reason };
}
