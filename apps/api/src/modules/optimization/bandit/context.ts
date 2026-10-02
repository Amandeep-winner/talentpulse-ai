import { BanditContextInput } from '@talentpulse/shared';
import { CONTEXT_DIMENSION } from './types';

export const JOB_CATEGORIES = [
  'Engineering',
  'Product',
  'Design',
  'Marketing',
  'Sales',
] as const;

/**
 * Transforms recruitment context input into a normalized feature vector x in R^12.
 *
 * Vector structure:
 * [0]     : bias term (1.0)
 * [1..5]  : job category one-hot (Engineering, Product, Design, Marketing, Sales)
 * [6]     : experience requirement normalized to [0, 1] (capped at 10 yrs)
 * [7]     : location tier normalized to [0, 1] (Tier 1: 1.0, Remote: 0.8, Tier 2: 0.6, Tier 3: 0.3)
 * [8]     : historical CTR normalized to [0, 1] (capped at 10% CTR)
 * [9]     : historical CPA normalized and inverted to [0, 1] (1 / (1 + CPA / 50))
 * [10]    : historical conversion rate normalized to [0, 1] (convRate * 5.0, capped at 1.0)
 * [11]    : campaign budget remaining fraction in [0, 1]
 */
export function buildContextVector(input: BanditContextInput): number[] {
  const x = new Array<number>(CONTEXT_DIMENSION).fill(0);

  // [0] Bias
  x[0] = 1.0;

  // [1..5] Category one-hot
  const categoryIndex = JOB_CATEGORIES.indexOf(
    (input.jobCategory as typeof JOB_CATEGORIES[number]) || 'Engineering'
  );
  if (categoryIndex >= 0 && categoryIndex < 5) {
    x[1 + categoryIndex] = 1.0;
  }

  // [6] Experience normalized
  const exp = input.experienceYears ?? 3;
  x[6] = Math.max(0, Math.min(1.0, exp / 10.0));

  // [7] Location Tier
  const locTier = input.locationTier ?? 1.0;
  x[7] = Math.max(0, Math.min(1.0, locTier));

  // [8] Historical CTR normalized
  const ctr = input.ctr ?? 3.5;
  x[8] = Math.max(0, Math.min(1.0, ctr / 10.0));

  // [9] Historical CPA normalized and inverted (lower CPA is better => higher value)
  const cpa = Math.max(0, input.cpa ?? 40.0);
  x[9] = 1.0 / (1.0 + cpa / 50.0);

  // [10] Historical Conversion Rate
  const conv = input.convRate ?? 0.08;
  x[10] = Math.max(0, Math.min(1.0, conv * 5.0));

  // [11] Remaining Budget Fraction
  const remBudget = input.remainingBudgetFrac ?? 0.75;
  x[11] = Math.max(0, Math.min(1.0, remBudget));

  return x;
}
