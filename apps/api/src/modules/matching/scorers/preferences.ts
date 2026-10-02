export interface PreferencesScoreResult {
  score: number;
  reasons: string[];
  gaps: string[];
}

/**
 * Preferences Alignment Scorer.
 * Evaluates employment type match and candidate salary expectation within requisition budget range.
 */
export function scorePreferences(options: {
  candidateEmploymentTypes: string[];
  candidateExpectedSalary?: number | null;
  jobEmploymentType: string;
  jobSalaryMin?: number | null;
  jobSalaryMax?: number | null;
}): PreferencesScoreResult {
  const {
    candidateEmploymentTypes,
    candidateExpectedSalary,
    jobEmploymentType,
    jobSalaryMax,
  } = options;

  const reasons: string[] = [];
  const gaps: string[] = [];

  // 1. Employment type match
  let empScore = 1.0;
  if (candidateEmploymentTypes && candidateEmploymentTypes.length > 0) {
    if (candidateEmploymentTypes.includes(jobEmploymentType)) {
      empScore = 1.0;
      reasons.push(`Employment type match: ${jobEmploymentType.replace('_', ' ')}`);
    } else {
      empScore = 0.4;
      gaps.push(
        `Prefers ${candidateEmploymentTypes.join('/')}, job is ${jobEmploymentType.replace('_', ' ')}`,
      );
    }
  }

  // 2. Salary expectation match
  let salaryScore = 1.0;
  if (candidateExpectedSalary && jobSalaryMax) {
    if (candidateExpectedSalary <= jobSalaryMax) {
      salaryScore = 1.0;
      reasons.push(
        `Expected compensation within budget ceiling (${candidateExpectedSalary.toLocaleString('en-IN')} <= ${jobSalaryMax.toLocaleString('en-IN')})`,
      );
    } else if (candidateExpectedSalary <= jobSalaryMax * 1.15) {
      salaryScore = 0.7;
      reasons.push('Expected compensation within 15% negotiable range of budget ceiling');
    } else {
      salaryScore = 0.3;
      gaps.push(
        `Expected salary (${candidateExpectedSalary.toLocaleString('en-IN')}) exceeds budget ceiling (${jobSalaryMax.toLocaleString('en-IN')})`,
      );
    }
  }

  const finalScore = Math.max(0.0, Math.min(1.0, empScore * 0.5 + salaryScore * 0.5));

  return {
    score: Math.round(finalScore * 1000) / 1000,
    reasons,
    gaps,
  };
}
