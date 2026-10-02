import { PublisherProfile } from './types';

export const STANDARD_PROFILES: Record<
  'JOB_BOARD' | 'SOCIAL' | 'SEARCH' | 'AGGREGATOR' | 'REFERRAL',
  PublisherProfile
> = {
  JOB_BOARD: {
    name: 'JobBoard Prime',
    type: 'JOB_BOARD',
    baseCtr: 0.035,
    baseCpc: 18.5,
    appRate: 0.085,
    qualityRate: 0.65,
    interviewRate: 0.25,
    hireRate: 0.12,
    saturation: 10000,
    driftPerDay: 0.0,
  },
  SOCIAL: {
    name: 'SocialReach',
    type: 'SOCIAL',
    baseCtr: 0.018,
    baseCpc: 12.0,
    appRate: 0.075,
    qualityRate: 0.5,
    interviewRate: 0.2,
    hireRate: 0.08,
    saturation: 15000,
    driftPerDay: -0.012, // Scenario: degrading conversion rate over time
  },
  SEARCH: {
    name: 'SearchHire',
    type: 'SEARCH',
    baseCtr: 0.045,
    baseCpc: 32.0,
    appRate: 0.11,
    qualityRate: 0.7,
    interviewRate: 0.3,
    hireRate: 0.15,
    saturation: 8000,
    driftPerDay: 0.0,
  },
  AGGREGATOR: {
    name: 'AggregatorX',
    type: 'AGGREGATOR',
    baseCtr: 0.028,
    baseCpc: 14.5,
    appRate: 0.06,
    qualityRate: 0.55,
    interviewRate: 0.22,
    hireRate: 0.1,
    saturation: 12000,
    driftPerDay: 0.008, // Scenario: steadily improving publisher performance
  },
  REFERRAL: {
    name: 'ReferralNet',
    type: 'REFERRAL',
    baseCtr: 0.065,
    baseCpc: 45.0,
    appRate: 0.18,
    qualityRate: 0.85,
    interviewRate: 0.45,
    hireRate: 0.28,
    saturation: 4000,
    driftPerDay: 0.0,
  },
};

/**
 * Returns a profile by publisher name or publisher type.
 * Falls back to JOB_BOARD profile if unknown.
 */
export function getPublisherProfile(typeOrName: string): PublisherProfile {
  const upper = typeOrName.toUpperCase().replace(/\s+/g, '_');
  if (upper in STANDARD_PROFILES) {
    return STANDARD_PROFILES[upper as keyof typeof STANDARD_PROFILES];
  }

  for (const prof of Object.values(STANDARD_PROFILES)) {
    if (prof.name.toLowerCase() === typeOrName.toLowerCase()) {
      return prof;
    }
  }

  return STANDARD_PROFILES.JOB_BOARD;
}
