/**
 * Analytics Metric Calculation Functions
 * Single source of truth for funnel metrics and conversion rates.
 * Pure functions: division by zero returns null (never NaN or Infinity).
 */

export function calculateCTR(clicks: number, impressions: number): number | null {
  if (impressions === undefined || impressions === null || impressions <= 0 || clicks === undefined || clicks === null || clicks < 0) {
    return null;
  }
  return clicks / impressions;
}

export function calculateApplicationRate(applications: number, clicks: number): number | null {
  if (clicks === undefined || clicks === null || clicks <= 0 || applications === undefined || applications === null || applications < 0) {
    return null;
  }
  return applications / clicks;
}

export function calculateInterviewRate(interviews: number, applications: number): number | null {
  if (applications === undefined || applications === null || applications <= 0 || interviews === undefined || interviews === null || interviews < 0) {
    return null;
  }
  return interviews / applications;
}

export function calculateHireRate(hires: number, applications: number): number | null {
  if (applications === undefined || applications === null || applications <= 0 || hires === undefined || hires === null || hires < 0) {
    return null;
  }
  return hires / applications;
}

export function calculateCPC(spend: number, clicks: number): number | null {
  if (!clicks || clicks <= 0 || spend === undefined || spend === null || spend < 0) {
    return null;
  }
  return spend / clicks;
}

export function calculateCPA(spend: number, applications: number): number | null {
  if (!applications || applications <= 0 || spend === undefined || spend === null || spend < 0) {
    return null;
  }
  return spend / applications;
}

export function calculateCPQA(spend: number, qualifiedApplications: number): number | null {
  if (
    !qualifiedApplications ||
    qualifiedApplications <= 0 ||
    spend === undefined ||
    spend === null ||
    spend < 0
  ) {
    return null;
  }
  return spend / qualifiedApplications;
}

export function calculateCPH(spend: number, hires: number): number | null {
  if (!hires || hires <= 0 || spend === undefined || spend === null || spend < 0) {
    return null;
  }
  return spend / hires;
}

/**
 * Calculates percentage delta between current and previous values.
 * Returns null if previous is zero, null, or undefined.
 */
export function calculateDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
): number | null {
  if (
    current === null ||
    current === undefined ||
    previous === null ||
    previous === undefined ||
    previous === 0
  ) {
    return null;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}
