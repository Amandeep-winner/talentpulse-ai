import { EDUCATION_LADDER, getEducationLevel } from '../matching.config';

export interface EducationScoreResult {
  score: number;
  reasons: string[];
  gaps: string[];
}

/**
 * Education Ladder & Certifications Scorer.
 * Matches candidate education to requiredEducation ladder (none < diploma < bachelor < master < phd)
 * plus preferred certifications overlap bonus.
 */
export function scoreEducation(options: {
  candidateEducation?: string | null;
  candidateCertifications: string[];
  requiredEducation?: string | null;
  preferredCertifications: string[];
}): EducationScoreResult {
  const {
    candidateEducation,
    candidateCertifications,
    requiredEducation,
    preferredCertifications,
  } = options;

  const reasons: string[] = [];
  const gaps: string[] = [];

  const candLevel = getEducationLevel(candidateEducation);
  const reqLevel = getEducationLevel(requiredEducation);

  const candIdx = EDUCATION_LADDER.indexOf(candLevel);
  const reqIdx = EDUCATION_LADDER.indexOf(reqLevel);

  let ladderScore = 1.0;
  if (reqIdx > 0) {
    if (candIdx >= reqIdx) {
      ladderScore = 1.0;
      reasons.push(
        `Education qualification meets or exceeds requirement: ${candidateEducation || candLevel}`,
      );
    } else {
      const stepDiff = reqIdx - candIdx;
      ladderScore = Math.max(0.0, 1.0 - stepDiff * 0.3);
      gaps.push(
        `Education level (${candLevel}) below required qualification (${requiredEducation || reqLevel})`,
      );
    }
  } else if (candidateEducation) {
    reasons.push(`Degree recorded: ${candidateEducation}`);
  }

  // Certifications overlap bonus
  let certBonus = 0.0;
  if (preferredCertifications.length > 0 && candidateCertifications.length > 0) {
    const candCertsLower = new Set(
      candidateCertifications.map((c) => c.toLowerCase().trim()),
    );
    const matchedCerts: string[] = [];

    for (const cert of preferredCertifications) {
      const certLower = cert.toLowerCase().trim();
      if (
        candCertsLower.has(certLower) ||
        Array.from(candCertsLower).some(
          (c) => c.includes(certLower) || certLower.includes(c),
        )
      ) {
        matchedCerts.push(cert);
      }
    }

    if (matchedCerts.length > 0) {
      certBonus = Math.min(0.2, (matchedCerts.length / preferredCertifications.length) * 0.2);
      reasons.push(`Holds preferred certifications: ${matchedCerts.join(', ')}`);
    }
  }

  const finalScore = Math.max(0.0, Math.min(1.0, ladderScore + certBonus));

  return {
    score: Math.round(finalScore * 1000) / 1000,
    reasons,
    gaps,
  };
}
