import { BanditAction, BanditAlgorithm } from '@talentpulse/shared';

export const CONTEXT_DIMENSION = 12;

export const BANDIT_ACTIONS: BanditAction[] = [
  'increase_bid',
  'decrease_bid',
  'maintain_bid',
  'increase_budget',
  'decrease_budget',
];

export interface ArmState {
  A: number[][]; // d x d matrix
  invA: number[][]; // d x d matrix inverse
  b: number[]; // d x 1 vector
  pulls: number;
}

export interface SerializedPolicyState {
  algorithm: BanditAlgorithm;
  d: number;
  alpha: number; // LinUCB exploration parameter (default 0.8)
  lambda: number; // Ridge regularizer (default 1.0)
  epsilon: number; // Current epsilon for epsilon-greedy
  minEpsilon: number; // Epsilon decay floor (0.02)
  decayRate: number; // Epsilon decay factor per round (e.g. 0.998)
  totalPulls: number;
  arms: Record<string, ArmState>;
}

export interface DecisionResult {
  action: BanditAction;
  scores: Record<BanditAction, number>;
  propensity?: number | null;
  policyVersion: number;
  context: number[];
}

export interface RewardMetrics {
  qualifiedApplications: number;
  refQa?: number; // baseline benchmark QA (default 5.0)
  spend: number;
  refSpend?: number; // baseline benchmark spend (default 200.0)
  mu?: number; // spend penalty weight (default 0.5)
}

/**
 * Computes standard reward formulation:
 * reward = (qualifiedApplications / ref_qa) - mu * (spend / ref_spend)
 * Clipped to [-2.0, 2.0].
 */
export function calculateReward(metrics: RewardMetrics): number {
  const refQa = metrics.refQa && metrics.refQa > 0 ? metrics.refQa : 5.0;
  const refSpend = metrics.refSpend && metrics.refSpend > 0 ? metrics.refSpend : 200.0;
  const mu = metrics.mu ?? 0.5;

  const rawReward = (metrics.qualifiedApplications / refQa) - mu * (metrics.spend / refSpend);
  return Math.max(-2.0, Math.min(2.0, Math.round(rawReward * 10000) / 10000));
}
