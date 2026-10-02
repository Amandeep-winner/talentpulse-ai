import { ScoreBreakdown } from '@talentpulse/shared';

/**
 * Scoring Candidate Input: Strictly stripped of all protected demographic attributes.
 * Candidate name, email, age, gender, race, religion, and photos are completely excluded.
 */
export interface ScoringCandidateInput {
  id: string;
  skills: string[];
  experienceYears: number;
  location: string;
  remoteOk: boolean;
  education?: string | null;
  certifications: string[];
  preferredLocations: string[];
  preferredEmploymentTypes: string[];
  expectedSalary?: number | null;
  hasEmbedding: boolean;
  hasResume: boolean;
}

/**
 * Scoring Job Requisition Input.
 */
export interface ScoringJobInput {
  id: string;
  title: string;
  category: string;
  location: string;
  remote: boolean;
  employmentType: string;
  minExperienceYears: number;
  requiredSkills: string[];
  preferredSkills: string[];
  requiredEducation?: string | null;
  preferredCertifications: string[];
  salaryMin?: number | null;
  salaryMax?: number | null;
}

/**
 * Detailed output from candidate-job scoring.
 */
export interface CandidateScoringResult {
  candidateId: string;
  score: number;
  breakdown: ScoreBreakdown;
  reasons: string[];
  gaps: string[];
  confidence: number;
}
