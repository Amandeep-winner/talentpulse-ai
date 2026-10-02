import crypto from 'crypto';
import { ExperimentVariant } from '@talentpulse/shared';

/**
 * Deterministically assigns a subject to an experiment variant using MD5 hashing.
 * hash(experimentId + subjectKey) % 100 mapped to cumulative variant weights.
 */
export function assignVariant(
  experimentId: string,
  subjectKey: string,
  variants: ExperimentVariant[]
): string {
  if (!variants || variants.length === 0) {
    throw new Error('Experiment must have at least one variant');
  }

  if (variants.length === 1) {
    return variants[0]!.key;
  }

  const hash = crypto
    .createHash('md5')
    .update(`${experimentId}:${subjectKey}`)
    .digest();

  // Read unsigned 32-bit big-endian integer and map to [0, 99]
  const bucket = hash.readUInt32BE(0) % 100;

  let cumulative = 0;
  for (const variant of variants) {
    cumulative += variant.weight;
    if (bucket < cumulative) {
      return variant.key;
    }
  }

  // Fallback to last variant in case of rounding
  return variants[variants.length - 1]!.key;
}
