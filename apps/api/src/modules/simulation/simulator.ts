import { SimulationDayParams, SimulatedDayResult } from './types';

/**
 * Creates a deterministic pseudo-random number generator (Mulberry32).
 */
export function createMulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Simulates recruitment marketing events and spend for a publisher on a single day.
 *
 * Rules:
 * 1. Clicks ≈ f(budget/bid, saturation curve with diminishing returns)
 * 2. Higher bid ⇒ higher ad impression reach, but higher actual CPC
 * 3. Seeded RNG adds realistic stochastic noise while remaining strictly deterministic
 * 4. Drift modifies application conversion rates monotonically or degradingly over time
 * 5. Strict funnel consistency: impressions >= clicks >= applications >= qualified >= interviews >= hires
 */
export function simulateDay(params: SimulationDayParams): SimulatedDayResult {
  const { publisher, bid, budget, rng, dayIndex } = params;

  if (budget <= 0 || bid <= 0) {
    return {
      impressions: 0,
      clicks: 0,
      applications: 0,
      qualified: 0,
      interviews: 0,
      hires: 0,
      spend: 0,
    };
  }

  // 1. Bid effects
  const baseCpc = publisher.baseCpc > 0 ? publisher.baseCpc : 15;
  const bidRatio = Math.max(0.2, Math.min(5.0, bid / baseCpc));

  // Higher bid increases auction impression reach
  const impressionMultiplier = Math.pow(bidRatio, 0.8);

  // Higher bid increases clearing CPC
  const effectiveCpc = baseCpc * Math.pow(bidRatio, 0.5);

  // 2. Diminishing returns curve (saturation model)
  // Clicks follow a concave saturation curve: f(B) = (B * S) / (S + B)
  const saturation = publisher.saturation > 0 ? publisher.saturation : 10000;
  const saturationRatio = (2 * saturation) / (saturation + budget);
  const baselineClicks = (budget / effectiveCpc) * (saturationRatio * 0.5);

  // 3. Stochastic noise from RNG
  const clickNoise = 0.95 + 0.1 * rng();
  const rawClicks = baselineClicks * clickNoise;
  const clicks = Math.max(0, Math.round(rawClicks));

  // 4. Spend calculation (clamped to budget)
  const calculatedSpend = clicks * effectiveCpc;
  const spend = Math.min(budget, Math.round(calculatedSpend * 100) / 100);

  // 5. Impressions
  const effectiveCtr = Math.max(0.005, publisher.baseCtr);
  const impressionNoise = 0.96 + 0.08 * rng();
  const rawImpressions = (clicks / effectiveCtr) * impressionMultiplier * impressionNoise;
  const impressions = Math.max(clicks, Math.round(rawImpressions));

  // 6. Drift modifying conversion rate over days
  // e.g. driftPerDay = -0.012 leads to ~35% degradation over 30 days
  const driftFactor = Math.max(0.1, 1 + publisher.driftPerDay * dayIndex);
  const effectiveAppRate = Math.max(0.005, Math.min(0.6, publisher.appRate * driftFactor));

  const appNoise = 0.94 + 0.12 * rng();
  const applications = Math.min(clicks, Math.round(clicks * effectiveAppRate * appNoise));

  // 7. Funnel stages: Qualified -> Interviews -> Hires
  const qualNoise = 0.95 + 0.1 * rng();
  const qualified = Math.min(
    applications,
    Math.round(applications * publisher.qualityRate * qualNoise)
  );

  const interviewNoise = 0.95 + 0.1 * rng();
  const interviews = Math.min(
    qualified,
    Math.round(qualified * publisher.interviewRate * interviewNoise)
  );

  const hireNoise = 0.95 + 0.1 * rng();
  const hires = Math.min(
    interviews,
    Math.round(interviews * publisher.hireRate * hireNoise)
  );

  return {
    impressions,
    clicks,
    applications,
    qualified,
    interviews,
    hires,
    spend,
  };
}
