import { MATCHING_WEIGHTS } from './matching.config';
import { ScoringCandidateInput, ScoringJobInput, CandidateScoringResult } from './types';
import { scoreSemantic } from './scorers/semantic';
import { scoreSkills } from './scorers/skills';
import { scoreExperience } from './scorers/experience';
import { scoreLocation } from './scorers/location';
import { scoreEducation } from './scorers/education';
import { scorePreferences } from './scorers/preferences';

/**
 * Pure scoring function that evaluates candidate fit against job requisition requirements.
 * STRICT ENFORCEMENT: Only receives ScoringCandidateInput which excludes candidate name, email,
 * age, gender, race, photo, and other protected attributes.
 */
export function scoreCandidate(
  candidate: ScoringCandidateInput,
  job: ScoringJobInput,
  semanticSimilarity: number,
): CandidateScoringResult {
  // 1. Semantic alignment (weight: 0.35)
  const semanticResult = scoreSemantic(semanticSimilarity);

  // 2. Skills coverage (weight: 0.25)
  const skillsResult = scoreSkills(
    candidate.skills,
    job.requiredSkills,
    job.preferredSkills,
  );

  // 3. Experience duration (weight: 0.15)
  const expResult = scoreExperience(
    candidate.experienceYears,
    job.minExperienceYears,
  );

  // 4. Location & Remote eligibility (weight: 0.10)
  const locResult = scoreLocation({
    candidateLocation: candidate.location,
    candidateRemoteOk: candidate.remoteOk,
    candidatePreferredLocations: candidate.preferredLocations,
    jobLocation: job.location,
    jobRemote: job.remote,
  });

  // 5. Education ladder & certifications (weight: 0.10)
  const eduResult = scoreEducation({
    candidateEducation: candidate.education,
    candidateCertifications: candidate.certifications,
    requiredEducation: job.requiredEducation,
    preferredCertifications: job.preferredCertifications,
  });

  // 6. Preferences & Salary expectations (weight: 0.05)
  const prefResult = scorePreferences({
    candidateEmploymentTypes: candidate.preferredEmploymentTypes,
    candidateExpectedSalary: candidate.expectedSalary,
    jobEmploymentType: job.employmentType,
    jobSalaryMin: job.salaryMin,
    jobSalaryMax: job.salaryMax,
  });

  // Weighted sum
  const weightedScore =
    MATCHING_WEIGHTS.semantic * semanticResult.score +
    MATCHING_WEIGHTS.skills * skillsResult.score +
    MATCHING_WEIGHTS.experience * expResult.score +
    MATCHING_WEIGHTS.location * locResult.score +
    MATCHING_WEIGHTS.education * eduResult.score +
    MATCHING_WEIGHTS.preferences * prefResult.score;

  const score = Math.max(0.0, Math.min(1.0, Math.round(weightedScore * 1000) / 1000));

  // Assemble reasons and gaps
  const reasons: string[] = [];
  const gaps: string[] = [];

  if (semanticResult.reason) reasons.push(semanticResult.reason);
  reasons.push(...skillsResult.reasons);
  if (expResult.reason) reasons.push(expResult.reason);
  if (locResult.reason) reasons.push(locResult.reason);
  reasons.push(...eduResult.reasons);
  reasons.push(...prefResult.reasons);

  gaps.push(...skillsResult.gaps);
  if (expResult.gap) gaps.push(expResult.gap);
  if (locResult.gap) gaps.push(locResult.gap);
  gaps.push(...eduResult.gaps);
  gaps.push(...prefResult.gaps);

  // Confidence based on profile data completeness
  let completeness = 0.2; // Baseline
  if (candidate.hasEmbedding) completeness += 0.35;
  if (candidate.hasResume) completeness += 0.35;
  if (candidate.skills.length >= 3) completeness += 0.1;
  const confidence = Math.min(1.0, Math.round(completeness * 100) / 100);

  return {
    candidateId: candidate.id,
    score,
    breakdown: {
      semantic: semanticResult.score,
      skills: skillsResult.score,
      experience: expResult.score,
      location: locResult.score,
      education: eduResult.score,
      preferences: prefResult.score,
    },
    reasons,
    gaps,
    confidence,
  };
}

/**
 * Reranks a list of candidate scoring results and adjusts confidence based on score margin.
 */
export function rankAndCalibrate(
  results: CandidateScoringResult[],
): CandidateScoringResult[] {
  const sorted = [...results].sort((a, b) => b.score - a.score);

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i]!;
    const next = sorted[i + 1];

    if (next) {
      const margin = current.score - next.score;
      // High score margin boosts confidence, very tight cluster slightly modulates confidence
      if (margin >= 0.1) {
        current.confidence = Math.min(1.0, Math.round((current.confidence + 0.05) * 100) / 100);
      }
    }
  }

  return sorted;
}
