import { BanditAction } from '@talentpulse/shared';
import { BANDIT_ACTIONS, DecisionResult } from './types';

export class RandomPolicy {
  public readonly algorithm = 'random';
  public totalPulls = 0;

  public selectAction(
    x: number[],
    rng: () => number = Math.random,
    policyVersion = 1
  ): DecisionResult {
    const K = BANDIT_ACTIONS.length;
    const idx = Math.floor(rng() * K);
    const action = BANDIT_ACTIONS[idx]!;

    const scores: Record<BanditAction, number> = {
      increase_bid: 0.2,
      decrease_bid: 0.2,
      maintain_bid: 0.2,
      increase_budget: 0.2,
      decrease_budget: 0.2,
    };

    return {
      action,
      scores,
      propensity: 1.0 / K,
      policyVersion,
      context: x,
    };
  }

  public update(): void {
    this.totalPulls += 1;
  }
}

export class StaticPolicy {
  public readonly algorithm = 'static';
  public totalPulls = 0;

  public selectAction(x: number[], _rng?: () => number, policyVersion = 1): DecisionResult {
    const scores: Record<BanditAction, number> = {
      increase_bid: 0.0,
      decrease_bid: 0.0,
      maintain_bid: 1.0,
      increase_budget: 0.0,
      decrease_budget: 0.0,
    };

    return {
      action: 'maintain_bid',
      scores,
      propensity: 1.0,
      policyVersion,
      context: x,
    };
  }

  public update(): void {
    this.totalPulls += 1;
  }
}
