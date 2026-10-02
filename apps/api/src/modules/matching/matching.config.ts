/**
 * Hybrid Candidate-Job Matching Weights Configuration.
 * Exact formula:
 * final = 0.35*semantic + 0.25*skills + 0.15*experience + 0.10*location + 0.10*education + 0.05*preferences
 */
export const MATCHING_WEIGHTS = {
  semantic: 0.35,
  skills: 0.25,
  experience: 0.15,
  location: 0.10,
  education: 0.10,
  preferences: 0.05,
} as const;

export type MatchingDimension = keyof typeof MATCHING_WEIGHTS;

// Runtime assertion that weights sum to exactly 1.0
const weightSum = Object.values(MATCHING_WEIGHTS).reduce((acc, w) => acc + w, 0);
if (Math.abs(weightSum - 1.0) > 1e-6) {
  throw new Error(`MATCHING_WEIGHTS must sum to 1.0, current sum is ${weightSum}`);
}

/**
 * Normalized Education Ladder from lowest to highest academic qualification.
 */
export const EDUCATION_LADDER = [
  'none',
  'diploma',
  'bachelor',
  'master',
  'phd',
] as const;

export type EducationLevel = (typeof EDUCATION_LADDER)[number];

export function getEducationLevel(educationStr?: string | null): EducationLevel {
  if (!educationStr) return 'none';
  const text = educationStr.toLowerCase();
  if (text.includes('phd') || text.includes('doctorate') || text.includes('doctoral')) return 'phd';
  if (text.includes('master') || text.includes('ms') || text.includes('m.tech') || text.includes('mba') || text.includes('m.sc')) return 'master';
  if (text.includes('bachelor') || text.includes('bs') || text.includes('b.tech') || text.includes('b.sc') || text.includes('b.e') || text.includes('b.com')) return 'bachelor';
  if (text.includes('diploma') || text.includes('associate') || text.includes('polytechnic')) return 'diploma';
  return 'bachelor'; // Default plausible level if degree mentioned but ladder unspecified
}
