import { normalizeSkills } from '../../../utils/skills';

export interface SkillsScoreResult {
  score: number;
  reasons: string[];
  gaps: string[];
}

/**
 * Skills Coverage Scorer.
 * Formula: required-skill coverage * 0.8 + preferred coverage * 0.2 (canonicalized).
 */
export function scoreSkills(
  candidateSkills: string[],
  requiredSkills: string[],
  preferredSkills: string[],
): SkillsScoreResult {
  const normCand = new Set(normalizeSkills(candidateSkills));
  const normReq = normalizeSkills(requiredSkills);
  const normPref = normalizeSkills(preferredSkills);

  const matchedRequired: string[] = [];
  const missingRequired: string[] = [];
  for (const s of normReq) {
    if (normCand.has(s)) {
      matchedRequired.push(s);
    } else {
      missingRequired.push(s);
    }
  }

  const matchedPreferred: string[] = [];
  for (const s of normPref) {
    if (normCand.has(s)) {
      matchedPreferred.push(s);
    }
  }

  const reqScore = normReq.length > 0 ? matchedRequired.length / normReq.length : 1.0;
  const prefScore = normPref.length > 0 ? matchedPreferred.length / normPref.length : 1.0;

  const score = Math.max(0.0, Math.min(1.0, reqScore * 0.8 + prefScore * 0.2));

  const reasons: string[] = [];
  const gaps: string[] = [];

  if (normReq.length > 0) {
    if (matchedRequired.length === normReq.length) {
      reasons.push(`Matches all ${normReq.length} required skills: ${matchedRequired.join(', ')}`);
    } else if (matchedRequired.length > 0) {
      reasons.push(
        `Matches ${matchedRequired.length}/${normReq.length} required skills: ${matchedRequired.join(', ')}`,
      );
    }
  }

  if (matchedPreferred.length > 0) {
    reasons.push(`Matches preferred skills: ${matchedPreferred.join(', ')}`);
  }

  if (missingRequired.length > 0) {
    gaps.push(`Missing required skills: ${missingRequired.join(', ')}`);
  }

  return {
    score: Math.round(score * 1000) / 1000,
    reasons,
    gaps,
  };
}
