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

export class LinUCBPolicy {
  public readonly algorithm = 'linucb';
  public readonly d = CONTEXT_DIMENSION;
  public alpha: number;
  public lambda: number;
  public totalPulls = 0;
  public arms: Record<BanditAction, ArmState>;

  constructor(alpha = 0.8, lambda = 1.0) {
    this.alpha = alpha;
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
   * Selects an action using upper confidence bound:
   * p_a = theta_a^T * x + alpha * sqrt(x^T * A_a^(-1) * x)
   */
  public selectAction(x: number[], policyVersion = 1): DecisionResult {
    let bestAction: BanditAction = BANDIT_ACTIONS[0]!;
    let bestScore = -Infinity;
    const scores: Partial<Record<BanditAction, number>> = {};

    for (const action of BANDIT_ACTIONS) {
      const arm = this.arms[action];
      // theta_a = A_a^(-1) * b_a
      const theta = matrixVectorMultiply(arm.invA, arm.b);
      // Expected payoff = theta_a^T * x
      const mean = dotProduct(theta, x);
      // Confidence bound width = alpha * sqrt(x^T * A_a^(-1) * x)
      const invAx = matrixVectorMultiply(arm.invA, x);
      const variance = Math.max(0, dotProduct(x, invAx));
      const ucb = this.alpha * Math.sqrt(variance);

      const p = mean + ucb;
      scores[action] = Math.round(p * 10000) / 10000;

      if (p > bestScore) {
        bestScore = p;
        bestAction = action;
      }
    }

    return {
      action: bestAction,
      scores: scores as Record<BanditAction, number>,
      propensity: null, // Deterministic UCB choice given state
      policyVersion,
      context: x,
    };
  }

  /**
   * Updates arm state with observed reward r:
   * A_a += x * x^T
   * b_a += r * x
   * invA_a = shermanMorrisonUpdate(invA_a, x)
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
  }

  /**
   * Serializes current policy state to JSON object.
   */
  public toJSON(): SerializedPolicyState {
    return {
      algorithm: this.algorithm,
      d: this.d,
      alpha: this.alpha,
      lambda: this.lambda,
      epsilon: 0,
      minEpsilon: 0,
      decayRate: 0,
      totalPulls: this.totalPulls,
      arms: this.arms,
    };
  }

  public serialize(): SerializedPolicyState {
    return this.toJSON();
  }

  /**
   * Restores policy state from serialized JSON object.
   */
  public static fromJSON(state: SerializedPolicyState): LinUCBPolicy {
    const policy = new LinUCBPolicy(state.alpha ?? 0.8, state.lambda ?? 1.0);
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

  public static deserialize(state: SerializedPolicyState): LinUCBPolicy {
    return LinUCBPolicy.fromJSON(state);
  }
}
