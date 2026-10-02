export interface ExperienceScoreResult {
  score: number;
  reason?: string;
  gap?: string;
}

/**
 * Experience Scorer.
 * Formula: 1 if >= minExperienceYears; linear ramp from 0 at 0 yrs to 1 at min; no cap bonus.
 */
export function scoreExperience(
  candidateYears: number,
  minRequiredYears: number,
): ExperienceScoreResult {
  const candYrs = Math.max(0, candidateYears);
  const minReq = Math.max(0, minRequiredYears);

  if (minReq === 0) {
    return {
      score: 1.0,
      reason: `${candYrs.toFixed(1)} yrs experience meets role requirements (no min experience specified)`,
    };
  }

  if (candYrs >= minReq) {
    return {
      score: 1.0,
      reason: `${candYrs.toFixed(1)} yrs experience meets or exceeds required ${minReq} yrs`,
    };
  }

  // Linear ramp
  const score = Math.max(0.0, Math.min(1.0, candYrs / minReq));
  return {
    score: Math.round(score * 1000) / 1000,
    gap: `${candYrs.toFixed(1)} yrs experience vs ${minReq} yrs required`,
  };
}
