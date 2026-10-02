import { BanditAction } from '@talentpulse/shared';
import {
  dotProduct,
  matrixVectorMultiply,
  outerProduct,
  matrixAdd,
  shermanMorrisonUpdate,
  vectorAdd,
  vectorScale,
  createIdentity,
} from './matrix';
import {
  CONTEXT_DIMENSION,
  BANDIT_ACTIONS,
  ArmState,
  SerializedPolicyState,
  DecisionResult,
} from './types';

export class EpsilonGreedyPolicy {
  public readonly algorithm = 'epsilon_greedy';
  public readonly d = CONTEXT_DIMENSION;
  public epsilon: number;
  public minEpsilon: number;
  public decayRate: number;
  public lambda: number;
  public totalPulls = 0;
  public arms: Record<BanditAction, ArmState>;

  constructor(
    initialEpsilon = 0.1,
    minEpsilon = 0.02,
    decayRate = 0.998,
    lambda = 1.0
  ) {
    this.epsilon = initialEpsilon;
    this.minEpsilon = minEpsilon;
    this.decayRate = decayRate;
    this.lambda = lambda;
    this.arms = this.initArms();
  }

  private initArms(): Record<BanditAction, ArmState> {
    const arms: Partial<Record<BanditAction, ArmState>> = {};
    for (const action of BANDIT_ACTIONS) {
      arms[action] = {
        A: createIdentity(this.d, this.lambda),
        invA: createIdentity(this.d, 1.0 / this.lambda),
        b: new Array<number>(this.d).fill(0),
        pulls: 0,
      };
    }
    return arms as Record<BanditAction, ArmState>;
  }

  /**
   * Selects an action using epsilon-greedy strategy with ridge regression predictions:
   * With probability (1 - epsilon): pick argmax theta_a^T * x
   * With probability epsilon: explore uniformly at random
   */
  public selectAction(
    x: number[],
    rng: () => number = Math.random,
    policyVersion = 1
  ): DecisionResult {
    const K = BANDIT_ACTIONS.length;
    let greedyAction: BanditAction = BANDIT_ACTIONS[0]!;
    let bestScore = -Infinity;
    const scores: Partial<Record<BanditAction, number>> = {};

    for (const action of BANDIT_ACTIONS) {
      const arm = this.arms[action];
      const theta = matrixVectorMultiply(arm.invA, arm.b);
      const predictedReward = dotProduct(theta, x);
      scores[action] = Math.round(predictedReward * 10000) / 10000;

      if (predictedReward > bestScore) {
        bestScore = predictedReward;
        greedyAction = action;
      }
    }

    let selectedAction: BanditAction;
    let propensity: number;

    const roll = rng();
    if (roll >= this.epsilon) {
      // Exploit
      selectedAction = greedyAction;
      propensity = 1.0 - this.epsilon + this.epsilon / K;
    } else {
      // Explore uniformly
      const randIdx = Math.floor(rng() * K);
      selectedAction = BANDIT_ACTIONS[randIdx]!;
      propensity =
        selectedAction === greedyAction
          ? 1.0 - this.epsilon + this.epsilon / K
          : this.epsilon / K;
    }

    return {
      action: selectedAction,
      scores: scores as Record<BanditAction, number>,
      propensity: Math.round(propensity * 10000) / 10000,
      policyVersion,
      context: x,
    };
  }

  /**
   * Updates arm state with observed reward and decays epsilon:
   * A_a += x * x^T
   * b_a += r * x
   * epsilon = max(minEpsilon, epsilon * decayRate)
   */
  public update(action: BanditAction, x: number[], reward: number): void {
    const arm = this.arms[action];
    if (!arm) return;

    // 1. Update A_a += x * x^T
    const xxT = outerProduct(x, x);
    arm.A = matrixAdd(arm.A, xxT);

    // 2. Update b_a += r * x
    const rx = vectorScale(x, reward);
    arm.b = vectorAdd(arm.b, rx);

    // 3. Update invA via Sherman-Morrison rank-1 update
    arm.invA = shermanMorrisonUpdate(arm.invA, x);

    arm.pulls += 1;
    this.totalPulls += 1;

    // 4. Decay epsilon
    this.epsilon = Math.max(this.minEpsilon, this.epsilon * this.decayRate);
  }

  public getCurrentEpsilon(): number {
    return this.epsilon;
  }

  public toJSON(): SerializedPolicyState {
    return {
      algorithm: this.algorithm,
      d: this.d,
      alpha: 0,
      lambda: this.lambda,
      epsilon: this.epsilon,
      minEpsilon: this.minEpsilon,
      decayRate: this.decayRate,
      totalPulls: this.totalPulls,
      arms: this.arms,
    };
  }

  public serialize(): SerializedPolicyState {
    return this.toJSON();
  }

  public static fromJSON(state: SerializedPolicyState): EpsilonGreedyPolicy {
    const policy = new EpsilonGreedyPolicy(
      state.epsilon ?? 0.1,
      state.minEpsilon ?? 0.02,
      state.decayRate ?? 0.998,
      state.lambda ?? 1.0
    );
    policy.totalPulls = state.totalPulls ?? 0;
    if (state.arms) {
      for (const action of BANDIT_ACTIONS) {
        if (state.arms[action]) {
          policy.arms[action] = {
            A: state.arms[action].A,
            invA: state.arms[action].invA,
            b: state.arms[action].b,
            pulls: state.arms[action].pulls,
          };
        }
      }
    }
    return policy;
  }

  public static deserialize(state: SerializedPolicyState): EpsilonGreedyPolicy {
    return EpsilonGreedyPolicy.fromJSON(state);
  }
}
