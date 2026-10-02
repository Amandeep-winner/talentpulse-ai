import { ExperimentVariant, VariantStats } from '@talentpulse/shared';

/**
 * Standard Normal Cumulative Distribution Function Phi(z).
 * Uses Abramowitz and Stegun polynomial approximation (formula 26.2.17).
 * Absolute error |e(z)| < 7.5e-8.
 */
export function normalCdf(z: number): number {
  if (isNaN(z)) return 0.5;
  if (z === Infinity) return 1.0;
  if (z === -Infinity) return 0.0;

  // Symmetry: Phi(-z) = 1 - Phi(z)
  if (z < 0) {
    return 1 - normalCdf(-z);
  }

  const p = 0.2316419;
  const b1 = 0.31938153;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;

  const t = 1.0 / (1.0 + p * z);
  const phi = (1.0 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z);
  const poly = ((((b5 * t + b4) * t + b3) * t + b2) * t + b1) * t;

  return 1.0 - phi * poly;
}

export interface ZTestResult {
  hasSufficientData: boolean;
  zScore: number | null;
  pValue: number | null;
  significant: boolean;
  lift: number | null;
}

/**
 * Computes two-proportion z-test comparing variant vs control.
 * Applies standard minimum-sample guard of N >= 30 per arm.
 */
export function twoProportionZTest(
  controlConversions: number,
  controlExposures: number,
  variantConversions: number,
  variantExposures: number,
  alpha = 0.05
): ZTestResult {
  // Guard: minimum 30 exposures required per arm
  if (controlExposures < 30 || variantExposures < 30) {
    const p1 = controlExposures > 0 ? controlConversions / controlExposures : 0;
    const p2 = variantExposures > 0 ? variantConversions / variantExposures : 0;
    const lift = p1 > 0 ? (p2 - p1) / p1 : p2 > 0 ? 1 : 0;

    return {
      hasSufficientData: false,
      zScore: null,
      pValue: null,
      significant: false,
      lift: Math.round(lift * 10000) / 10000,
    };
  }

  const p1 = controlConversions / controlExposures;
  const p2 = variantConversions / variantExposures;
  const lift = p1 > 0 ? (p2 - p1) / p1 : p2 > 0 ? 1 : 0;

  // Pooled sample proportion
  const pooledP = (controlConversions + variantConversions) / (controlExposures + variantExposures);

  // If pooled conversion rate is 0 or 1, variance is 0
  if (pooledP <= 0 || pooledP >= 1) {
    return {
      hasSufficientData: true,
      zScore: 0,
      pValue: 1.0,
      significant: false,
      lift: Math.round(lift * 10000) / 10000,
    };
  }

  const standardError = Math.sqrt(
    pooledP * (1 - pooledP) * (1 / controlExposures + 1 / variantExposures)
  );

  if (standardError <= 0) {
    return {
      hasSufficientData: true,
      zScore: 0,
      pValue: 1.0,
      significant: false,
      lift: Math.round(lift * 10000) / 10000,
    };
  }

  const z = (p2 - p1) / standardError;
  // Two-sided p-value: 2 * (1 - normalCdf(|z|))
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  const significant = pValue < alpha;

  return {
    hasSufficientData: true,
    zScore: Math.round(z * 10000) / 10000,
    pValue: Math.round(pValue * 10000) / 10000,
    significant,
    lift: Math.round(lift * 10000) / 10000,
  };
}

export interface ExposureCount {
  variant: string;
  exposures: number;
  conversions: number;
}

/**
 * Computes full variant statistics and statistical significance
 * comparing each variant against the control (baseline) variant.
 */
export function computeExperimentResults(
  variants: ExperimentVariant[],
  counts: ExposureCount[]
): {
  stats: VariantStats[];
  hasSufficientData: boolean;
  winner: string | null;
} {
  if (!variants || variants.length === 0) {
    return { stats: [], hasSufficientData: false, winner: null };
  }

  const countMap = new Map<string, ExposureCount>();
  for (const c of counts) {
    countMap.set(c.variant, c);
  }

  // Baseline control variant is the one with key 'control' or the first variant
  const controlVariant = variants.find((v) => v.key.toLowerCase() === 'control') ?? variants[0];
  const controlKey = controlVariant ? controlVariant.key : variants[0]?.key;
  if (!controlKey) {
    return { stats: [], hasSufficientData: false, winner: null };
  }

  const controlData = countMap.get(controlKey) ?? {
    variant: controlKey,
    exposures: 0,
    conversions: 0,
  };

  let allHaveSufficientData = true;
  let winnerKey: string | null = null;
  let bestCr = -1;

  const stats: VariantStats[] = variants.map((v) => {
    const data = countMap.get(v.key) ?? {
      variant: v.key,
      exposures: 0,
      conversions: 0,
    };

    const cr = data.exposures > 0 ? data.conversions / data.exposures : 0;

    if (data.exposures < 30) {
      allHaveSufficientData = false;
    }

    if (v.key === controlKey) {
      return {
        variant: v.key,
        weight: v.weight,
        exposures: data.exposures,
        conversions: data.conversions,
        conversionRate: Math.round(cr * 10000) / 10000,
        lift: 0,
        zScore: 0,
        pValue: 1.0,
        significant: false,
      };
    }

    const test = twoProportionZTest(
      controlData.conversions,
      controlData.exposures,
      data.conversions,
      data.exposures
    );

    if (!test.hasSufficientData) {
      allHaveSufficientData = false;
    }

    if (test.significant && test.lift !== null && test.lift > 0) {
      if (cr > bestCr) {
        bestCr = cr;
        winnerKey = v.key;
      }
    }

    return {
      variant: v.key,
      weight: v.weight,
      exposures: data.exposures,
      conversions: data.conversions,
      conversionRate: Math.round(cr * 10000) / 10000,
      lift: test.lift,
      zScore: test.zScore,
      pValue: test.pValue,
      significant: test.significant,
    };
  });

  return {
    stats,
    hasSufficientData: allHaveSufficientData,
    winner: winnerKey,
  };
}
