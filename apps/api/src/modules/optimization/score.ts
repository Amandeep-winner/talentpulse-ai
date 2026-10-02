import { PublisherScoreInput, ScoringWeights, PublisherScoreResult } from './types';

export const DEFAULT_WEIGHTS: ScoringWeights = {
  quality: 1.0,
  lambdaCpa: 0.5,
  lambdaCph: 0.5,
};

/**
 * Normalizes an array of values into [0, 1] using min-max scaling.
 */
function minMaxNormalize(values: (number | null)[]): number[] {
  const valid = values.filter((v): v is number => v !== null && !isNaN(v) && v > 0);
  if (valid.length === 0) {
    return values.map(() => 0.5);
  }

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min;

  return values.map((v) => {
    if (v === null || isNaN(v) || v <= 0) {
      // Maximum penalty for zero conversions / missing unit economics
      return 1.0;
    }
    if (range === 0) {
      return 0.5;
    }
    return Math.max(0, Math.min(1, (v - min) / range));
  });
}

/**
 * Scores a set of publishers within a campaign.
 *
 * Formula:
 * quality = (qualified_applications / applications) * (1 + hireRate)
 * score = w_q * quality - lambda1 * cpaNorm - lambda2 * cphNorm
 */
export function scorePublishers(
  publishers: PublisherScoreInput[],
  weights: Partial<ScoringWeights> = {}
): PublisherScoreResult[] {
  const finalWeights: ScoringWeights = {
    ...DEFAULT_WEIGHTS,
    ...weights,
  };

  const rawCpas = publishers.map((p) => p.cpa);
  const rawCphs = publishers.map((p) => p.cph);

  const normCpas = minMaxNormalize(rawCpas);
  const normCphs = minMaxNormalize(rawCphs);

  return publishers.map((p, idx) => {
    const quality =
      p.applications > 0
        ? (p.qualifiedApplications / p.applications) * (1 + (p.hireRate || 0))
        : 0;

    const cpaNorm = normCpas[idx] ?? 1.0;
    const cphNorm = normCphs[idx] ?? 1.0;

    const score =
      finalWeights.quality * quality -
      finalWeights.lambdaCpa * cpaNorm -
      finalWeights.lambdaCph * cphNorm;

    return {
      publisherId: p.publisherId,
      publisherName: p.publisherName,
      quality: Math.round(quality * 1000) / 1000,
      cpaNorm: Math.round(cpaNorm * 1000) / 1000,
      cphNorm: Math.round(cphNorm * 1000) / 1000,
      score: Math.round(score * 1000) / 1000,
    };
  });
}
