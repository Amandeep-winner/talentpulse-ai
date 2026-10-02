import { OptimizationRuleAction } from '@talentpulse/shared';

export interface PublisherRuleInput {
  publisherId: string;
  publisherName: string;
  clicks: number;
  impressions: number;
  applications: number;
  qualifiedApplications: number;
  ctr: number | null;
  cpa: number | null;
  cpaDelta: number | null; // percentage change, e.g. +15.0 or -12.5
  appRateDelta: number | null; // percentage change, e.g. -8.0
  qualifiedDelta?: number | null; // percentage change, e.g. +20.0
  pacingRatio?: number | null; // actualSpend / targetDailyBudget
}

export interface PublisherRuleResult {
  publisherId: string;
  publisherName: string;
  action: OptimizationRuleAction;
  reason: string;
  triggeredRules: string[];
}

export interface PublisherScoreInput {
  publisherId: string;
  publisherName: string;
  clicks: number;
  applications: number;
  qualifiedApplications: number;
  hires: number;
  spend: number;
  cpa: number | null;
  cph: number | null;
  hireRate: number | null;
}

export interface ScoringWeights {
  quality: number; // default: 1.0
  lambdaCpa: number; // default: 0.5
  lambdaCph: number; // default: 0.5
}

export interface PublisherScoreResult {
  publisherId: string;
  publisherName: string;
  quality: number;
  cpaNorm: number;
  cphNorm: number;
  score: number;
}

export interface AllocationOptions {
  tau?: number; // temperature, default 0.5
  floor?: number; // min allocation %, default 5.0
  cap?: number; // max allocation %, default 50.0
  maxChange?: number; // max change from current %, default 10.0
}

export interface AllocationResult {
  allocations: Record<string, number>; // publisherId -> allocation %
  rawProbabilities: Record<string, number>;
}
