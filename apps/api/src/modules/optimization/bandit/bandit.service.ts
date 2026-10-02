import { prisma } from '../../../lib/prisma';
import { NotFoundError, ValidationError, ForbiddenError } from '../../../lib/errors/AppError';
import {
  BanditAlgorithm,
  BanditAction,
  BanditContextInput,
  BanditSimulationRequest,
  BanditSimulationResponse,
} from '@talentpulse/shared';
import { buildContextVector } from './context';
import { LinUCBPolicy } from './linucb';
import { EpsilonGreedyPolicy } from './epsilonGreedy';
import { RandomPolicy, StaticPolicy } from './baselines';
import { calculateReward, SerializedPolicyState } from './types';
import { runBanditSimulation } from './simulation';

export interface DecideParams {
  algorithm?: BanditAlgorithm;
  publisherId?: string;
  campaignId?: string;
  context: BanditContextInput;
}

export interface RewardParams {
  decisionId: string;
  reward?: number;
  metrics?: {
    qualifiedApplications: number;
    refQa?: number;
    spend: number;
    refSpend?: number;
    mu?: number;
  };
}

export class BanditService {
  /**
   * Retrieves or initializes an in-database BanditPolicy for an organization.
   */
  private async getOrCreatePolicy(
    organizationId: string,
    algorithm: BanditAlgorithm = 'linucb'
  ): Promise<{
    id: string;
    version: number;
    policy: LinUCBPolicy | EpsilonGreedyPolicy;
  }> {
    let record = await prisma.banditPolicy.findUnique({
      where: {
        organizationId_algorithm: {
          organizationId,
          algorithm,
        },
      },
    });

    if (!record) {
      const initialPolicy =
        algorithm === 'linucb'
          ? new LinUCBPolicy(0.8, 1.0)
          : new EpsilonGreedyPolicy(0.1, 0.02, 0.998, 1.0);

      record = await prisma.banditPolicy.create({
        data: {
          organizationId,
          algorithm,
          version: 1,
          state: initialPolicy.toJSON() as unknown as object,
        },
      });

      return {
        id: record.id,
        version: record.version,
        policy: initialPolicy,
      };
    }

    const state = record.state as unknown as SerializedPolicyState;
    const policy =
      algorithm === 'linucb'
        ? LinUCBPolicy.fromJSON(state)
        : EpsilonGreedyPolicy.fromJSON(state);

    return {
      id: record.id,
      version: record.version,
      policy,
    };
  }

  /**
   * Evaluates recruitment context and selects optimal bandit action.
   * Logs decision in BanditDecision and persists a responsible-AI Recommendation.
   */
  async decide(
    organizationId: string,
    params: DecideParams,
    userId?: string
  ): Promise<{
    decisionId: string;
    algorithm: BanditAlgorithm;
    action: BanditAction;
    scores: Record<BanditAction, number>;
    propensity: number | null;
    policyVersion: number;
    recommendationId: string;
  }> {
    const algorithm = params.algorithm || 'linucb';
    const x = buildContextVector(params.context);

    let decisionResult;
    let policyVersion = 1;

    if (algorithm === 'linucb') {
      const { version, policy } = await this.getOrCreatePolicy(organizationId, 'linucb');
      policyVersion = version;
      decisionResult = (policy as LinUCBPolicy).selectAction(x, version);
    } else if (algorithm === 'epsilon_greedy') {
      const { version, policy } = await this.getOrCreatePolicy(organizationId, 'epsilon_greedy');
      policyVersion = version;
      decisionResult = (policy as EpsilonGreedyPolicy).selectAction(x, Math.random, version);
    } else if (algorithm === 'random') {
      const randomPolicy = new RandomPolicy();
      decisionResult = randomPolicy.selectAction(x);
    } else {
      const staticPolicy = new StaticPolicy();
      decisionResult = staticPolicy.selectAction(x);
    }

    // 1. Log BanditDecision
    const decisionRecord = await prisma.banditDecision.create({
      data: {
        organizationId,
        policyVersion,
        algorithm,
        context: x,
        action: decisionResult.action,
        propensity: decisionResult.propensity,
        scores: decisionResult.scores,
        simulated: false,
      },
    });

    // 2. Persist responsible-AI Recommendation audit record
    const recRecord = await prisma.recommendation.create({
      data: {
        organizationId,
        userId: userId || null,
        type: 'BANDIT_ACTION',
        modelVersion: `${algorithm}-v${policyVersion}`,
        inputRef: {
          context: params.context,
          publisherId: params.publisherId || null,
          campaignId: params.campaignId || null,
        },
        decision: {
          action: decisionResult.action,
          scores: decisionResult.scores,
          propensity: decisionResult.propensity,
          algorithm,
        },
        explanation: {
          summary: `Contextual bandit selected action "${decisionResult.action}" based on estimated payoff vectors.`,
          scores: decisionResult.scores,
        },
        confidence: algorithm === 'linucb' ? 0.88 : 0.80,
        status: 'PROPOSED',
      },
    });

    return {
      decisionId: decisionRecord.id,
      algorithm,
      action: decisionResult.action,
      scores: decisionResult.scores,
      propensity: decisionResult.propensity ?? null,
      policyVersion,
      recommendationId: recRecord.id,
    };
  }

  /**
   * Applies reward feedback to the contextual bandit policy and updates matrices.
   */
  async reward(
    organizationId: string,
    params: RewardParams
  ): Promise<{
    decisionId: string;
    reward: number;
    updatedVersion: number;
    policyVersion: number;
  }> {
    const { decisionId } = params;

    const decision = await prisma.banditDecision.findFirst({
      where: { id: decisionId, organizationId },
    });

    if (!decision) {
      throw new NotFoundError(`Bandit decision '${decisionId}' not found`);
    }

    if (decision.reward !== null && decision.reward !== undefined) {
      throw new ValidationError(`Decision '${decisionId}' has already been rewarded with value ${decision.reward}`);
    }

    let calculatedR = params.reward;
    if (calculatedR === undefined && params.metrics) {
      calculatedR = calculateReward(params.metrics);
    }

    if (calculatedR === undefined) {
      throw new ValidationError('Either a reward number or metrics payload must be provided');
    }

    const reward = Math.max(-2.0, Math.min(2.0, calculatedR));
    const algorithm = decision.algorithm as BanditAlgorithm;
    const action = decision.action as BanditAction;
    const context = decision.context as number[];

    let newVersion = decision.policyVersion;

    if (algorithm === 'linucb' || algorithm === 'epsilon_greedy') {
      const { id: policyId, version, policy } = await this.getOrCreatePolicy(
        organizationId,
        algorithm
      );

      policy.update(action, context, reward);
      newVersion = version + 1;

      await prisma.banditPolicy.update({
        where: { id: policyId },
        data: {
          version: newVersion,
          state: policy.toJSON() as unknown as object,
        },
      });
    }

    await prisma.banditDecision.update({
      where: { id: decisionId },
      data: {
        reward,
        rewardedAt: new Date(),
      },
    });

    return {
      decisionId,
      reward,
      updatedVersion: newVersion,
      policyVersion: newVersion,
    };
  }

  /**
   * Runs an offline simulation comparing LinUCB, Epsilon-Greedy, Random, and Static policies.
   */
  async simulate(
    _organizationId: string,
    params: BanditSimulationRequest,
    userRole?: string
  ): Promise<BanditSimulationResponse> {
    if (userRole === 'ANALYST') {
      throw new ForbiddenError('Analysts are not authorized to run bandit simulations');
    }

    return runBanditSimulation(params);
  }

  /**
   * Retrieves policy state and configuration for inspection.
   */
  async getState(
    organizationId: string,
    algorithm: BanditAlgorithm = 'linucb'
  ): Promise<{
    algorithm: BanditAlgorithm;
    version: number;
    totalPulls: number;
    hyperparameters: { alpha?: number; lambda?: number; epsilon?: number };
    armPulls: Record<BanditAction, number>;
    state?: unknown;
  }> {
    const { version, policy } = await this.getOrCreatePolicy(organizationId, algorithm);
    const json = policy.toJSON();

    const armPulls: Record<BanditAction, number> = {
      increase_bid: json.arms.increase_bid?.pulls || 0,
      decrease_bid: json.arms.decrease_bid?.pulls || 0,
      maintain_bid: json.arms.maintain_bid?.pulls || 0,
      increase_budget: json.arms.increase_budget?.pulls || 0,
      decrease_budget: json.arms.decrease_budget?.pulls || 0,
    };

    return {
      algorithm,
      version,
      totalPulls: json.totalPulls,
      hyperparameters: {
        alpha: json.alpha,
        lambda: json.lambda,
        epsilon: json.epsilon,
      },
      armPulls,
      state: json,
    };
  }

  /**
   * Resets policy matrices and resets version to 1.
   */
  async reset(
    organizationId: string,
    algorithm: BanditAlgorithm = 'linucb',
    userRole?: string
  ): Promise<{ success: boolean; message: string; version: number }> {
    if (userRole === 'ANALYST') {
      throw new ForbiddenError('Analysts are not authorized to reset bandit policies');
    }

    const initialPolicy =
      algorithm === 'linucb'
        ? new LinUCBPolicy(0.8, 1.0)
        : new EpsilonGreedyPolicy(0.1, 0.02, 0.998, 1.0);

    const record = await prisma.banditPolicy.upsert({
      where: {
        organizationId_algorithm: {
          organizationId,
          algorithm,
        },
      },
      update: {
        version: 1,
        state: initialPolicy.toJSON() as unknown as object,
      },
      create: {
        organizationId,
        algorithm,
        version: 1,
        state: initialPolicy.toJSON() as unknown as object,
      },
    });

    return {
      success: true,
      message: `Bandit policy for ${algorithm} successfully reset to initial state.`,
      version: record.version,
    };
  }
}

export const banditService = new BanditService();
