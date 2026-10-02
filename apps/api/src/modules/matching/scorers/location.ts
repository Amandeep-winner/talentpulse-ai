export interface LocationScoreResult {
  score: number;
  reason?: string;
  gap?: string;
}

/**
 * Location Alignment Scorer.
 * Formula:
 * - 1 if same city OR (job remote AND candidate remoteOk)
 * - 0.5 if candidate preferredLocations includes job city
 * - else 0
 */
export function scoreLocation(options: {
  candidateLocation: string;
  candidateRemoteOk: boolean;
  candidatePreferredLocations: string[];
  jobLocation: string;
  jobRemote: boolean;
}): LocationScoreResult {
  const {
    candidateLocation,
    candidateRemoteOk,
    candidatePreferredLocations,
    jobLocation,
    jobRemote,
  } = options;

  const candLoc = candidateLocation.trim().toLowerCase();
  const jobLoc = jobLocation.trim().toLowerCase();

  // Full match via remote
  if (jobRemote && candidateRemoteOk) {
    return {
      score: 1.0,
      reason: 'Remote alignment: role is remote and candidate is open to remote work',
    };
  }

  // Full match via city
  if (candLoc === jobLoc || (candLoc.includes(jobLoc) || jobLoc.includes(candLoc))) {
    return {
      score: 1.0,
      reason: `Exact location match in ${jobLocation}`,
    };
  }

  // Partial match via preferred locations
  const preferredNorm = candidatePreferredLocations.map((l) => l.trim().toLowerCase());
  if (
    preferredNorm.some(
      (pref) => pref === jobLoc || pref.includes(jobLoc) || jobLoc.includes(pref),
    )
  ) {
    return {
      score: 0.5,
      reason: `Relocation match: candidate prefers ${jobLocation}`,
    };
  }

  return {
    score: 0.0,
    gap: `Location mismatch: based in ${candidateLocation}, job located in ${jobLocation}`,
  };
}
