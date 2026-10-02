import { PublisherRuleInput, PublisherRuleResult } from './types';

export const MIN_CLICK_VOLUME_THRESHOLD = 50;

/**
 * Evaluates rule-based heuristic signals for a single publisher.
 *
 * Rules:
 * 1. Minimum-volume guard: clicks < 50 => insufficient_volume
 * 2. CPA ↑ >10% AND appRate ↓ >5% => reduce_allocation
 * 3. CPA ↓ >10% AND qualified applications ↑ => increase_allocation
 * 4. CTR healthy (>= 2.5%) but appRate collapsing (<= -20%) => review_landing_quality
 * 5. Budget pacing >120% or <70% => adjust_pacing
 * 6. Default => maintain_allocation
 */
export function evaluatePublisherRules(input: PublisherRuleInput): PublisherRuleResult {
  const {
    publisherId,
    publisherName,
    clicks,
    ctr,
    cpaDelta,
    appRateDelta,
    qualifiedDelta,
    pacingRatio,
  } = input;

  const triggeredRules: string[] = [];

  // 1. Min-volume guard
  if (clicks < MIN_CLICK_VOLUME_THRESHOLD) {
    return {
      publisherId,
      publisherName,
      action: 'insufficient_volume',
      reason: `Insufficient click volume (${clicks} clicks < ${MIN_CLICK_VOLUME_THRESHOLD} threshold) to trigger automated reallocation`,
      triggeredRules: ['min_volume_guard'],
    };
  }

  // 2. Reduce Allocation Rule: CPA rising >10% and app rate falling >5%
  if (cpaDelta !== null && cpaDelta > 10 && appRateDelta !== null && appRateDelta < -5) {
    triggeredRules.push('cpa_escalation_app_drop');
    return {
      publisherId,
      publisherName,
      action: 'reduce_allocation',
      reason: `CPA escalated by +${cpaDelta.toFixed(1)}% and application conversion rate degraded by ${Math.abs(appRateDelta).toFixed(1)}%`,
      triggeredRules,
    };
  }

  // 3. Increase Allocation Rule: CPA dropping >10% and qualified applications increasing
  if (
    cpaDelta !== null &&
    cpaDelta < -10 &&
    qualifiedDelta != null &&
    qualifiedDelta > 0
  ) {
    triggeredRules.push('cpa_reduction_qualified_gain');
    return {
      publisherId,
      publisherName,
      action: 'increase_allocation',
      reason: `CPA improved by ${cpaDelta.toFixed(1)}% while qualified application volume increased by +${qualifiedDelta.toFixed(1)}%`,
      triggeredRules,
    };
  }

  // 4. Review Landing Quality: CTR healthy (>= 0.025) but app rate collapsing (<= -20%)
  if (ctr !== null && ctr >= 0.025 && appRateDelta !== null && appRateDelta <= -20) {
    triggeredRules.push('landing_quality_friction');
    return {
      publisherId,
      publisherName,
      action: 'review_landing_quality',
      reason: `Healthy ad CTR (${(ctr * 100).toFixed(1)}%) but collapsing conversion rate (${appRateDelta.toFixed(1)}%) indicates candidate friction on requisition page`,
      triggeredRules,
    };
  }

  // 5. Pacing adjustments: pacing > 120% or < 70%
  if (pacingRatio !== null && pacingRatio !== undefined && (pacingRatio > 1.2 || pacingRatio < 0.7)) {
    triggeredRules.push('pacing_out_of_bounds');
    return {
      publisherId,
      publisherName,
      action: 'adjust_pacing',
      reason: `Daily budget pacing at ${(pacingRatio * 100).toFixed(0)}% diverges from target corridor (70% - 120%)`,
      triggeredRules,
    };
  }

  // 6. Default nominal state
  return {
    publisherId,
    publisherName,
    action: 'maintain_allocation',
    reason: 'Performance metrics remain within nominal operational tolerance corridors',
    triggeredRules: ['nominal_maintenance'],
  };
}
