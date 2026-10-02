import { PublisherScoreResult, AllocationOptions, AllocationResult } from './types';

export const DEFAULT_ALLOCATION_OPTIONS: Required<AllocationOptions> = {
  tau: 0.5,
  floor: 5.0,
  cap: 50.0,
  maxChange: 10.0,
};

/**
 * Computes constrained budget allocations across publishers using Softmax,
 * iterative clip-and-renormalize within [floor, cap], and max-change dampening (±10 pp).
 *
 * Guarantees:
 * 1. Allocations sum to exactly 100.00%.
 * 2. Every publisher gets between floor% (5%) and cap% (50%).
 * 3. Max change from current allocation is clamped to ±maxChange% (±10 pp).
 */
export function computeAllocations(
  scores: PublisherScoreResult[],
  currentAllocations: Record<string, number>, // publisherId -> current %
  options: AllocationOptions = {}
): AllocationResult {
  const opts: Required<AllocationOptions> = {
    ...DEFAULT_ALLOCATION_OPTIONS,
    ...options,
  };

  const n = scores.length;
  if (n === 0) {
    return { allocations: {}, rawProbabilities: {} };
  }

  if (n === 1) {
    const singleId = scores[0]!.publisherId;
    return {
      allocations: { [singleId]: 100.0 },
      rawProbabilities: { [singleId]: 100.0 },
    };
  }

  // 1. Raw Softmax with numerical stability
  const maxScore = Math.max(...scores.map((s) => s.score));
  const expScores = scores.map((s) => Math.exp((s.score - maxScore) / opts.tau));
  const sumExp = expScores.reduce((sum, v) => sum + v, 0);

  const rawProbabilities: Record<string, number> = {};
  const rawPcts: number[] = [];

  scores.forEach((s, idx) => {
    const prob = (expScores[idx]! / sumExp) * 100;
    rawProbabilities[s.publisherId] = Math.round(prob * 100) / 100;
    rawPcts.push(prob);
  });

  // 2. Define per-publisher dynamic bounds [lower, upper] based on current allocation and maxChange
  const bounds: Array<{ lower: number; upper: number }> = scores.map((s) => {
    const current = currentAllocations[s.publisherId] ?? (100 / n);
    const lower = Math.max(opts.floor, current - opts.maxChange);
    const upper = Math.min(opts.cap, current + opts.maxChange);
    return { lower, upper };
  });

  // 3. Iterative clip and renormalize
  let currentPcts = [...rawPcts];

  for (let iter = 0; iter < 50; iter++) {
    // Clamp to bounds
    const clamped = currentPcts.map((p, i) =>
      Math.max(bounds[i]!.lower, Math.min(bounds[i]!.upper, p))
    );

    const sumClamped = clamped.reduce((sum, v) => sum + v, 0);
    const diff = 100 - sumClamped;

    if (Math.abs(diff) < 0.001) {
      currentPcts = clamped;
      break;
    }

    // Find indices that are not at their boundary in the direction of adjustment
    const adjustableIndices = clamped
      .map((val, i) => ({ val, idx: i }))
      .filter(({ val, idx }) => {
        if (diff > 0) return val < bounds[idx]!.upper - 0.001; // Can increase
        return val > bounds[idx]!.lower + 0.001; // Can decrease
      })
      .map((item) => item.idx);

    if (adjustableIndices.length === 0) {
      currentPcts = clamped;
      break;
    }

    const share = diff / adjustableIndices.length;
    for (const idx of adjustableIndices) {
      clamped[idx] = clamped[idx]! + share;
    }
    currentPcts = clamped;
  }

  // 4. Round to 2 decimal places and balance remainder to top publisher
  const roundedAllocations: Record<string, number> = {};
  let totalRounded = 0;

  scores.forEach((s, i) => {
    const rounded = Math.round(currentPcts[i]! * 100) / 100;
    roundedAllocations[s.publisherId] = rounded;
    totalRounded += rounded;
  });

  const remainder = Math.round((100.0 - totalRounded) * 100) / 100;
  if (Math.abs(remainder) > 0.0001) {
    const sortedIndices = scores
      .map((s, i) => ({ score: s.score, idx: i }))
      .sort((a, b) => (remainder > 0 ? b.score - a.score : a.score - b.score));

    const step = remainder > 0 ? 0.01 : -0.01;
    let remainingSteps = Math.round(Math.abs(remainder) / 0.01);

    for (const item of sortedIndices) {
      if (remainingSteps <= 0) break;
      const pubId = scores[item.idx]!.publisherId;
      const upperBound = bounds[item.idx]!.upper;
      const lowerBound = bounds[item.idx]!.lower;

      while (remainingSteps > 0) {
        const nextVal = Math.round(((roundedAllocations[pubId] ?? 0) + step) * 100) / 100;
        if (step > 0 && nextVal > upperBound + 0.0001) break;
        if (step < 0 && nextVal < lowerBound - 0.0001) break;
        roundedAllocations[pubId] = nextVal;
        remainingSteps--;
      }
    }

    if (remainingSteps > 0) {
      const topPubId = scores[sortedIndices[0]!.idx]!.publisherId;
      roundedAllocations[topPubId] =
        Math.round(((roundedAllocations[topPubId] ?? 0) + remainingSteps * step) * 100) / 100;
    }
  }

  return {
    allocations: roundedAllocations,
    rawProbabilities,
  };
}
