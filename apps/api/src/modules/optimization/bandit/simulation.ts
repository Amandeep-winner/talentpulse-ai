import {
  BanditAction,
  BanditAlgorithm,
  BanditSimulationResponse,
  BanditSimulationPoint,
  BanditSimulationSummary,
} from '@talentpulse/shared';
import { CONTEXT_DIMENSION, BANDIT_ACTIONS, calculateReward } from './types';
import { LinUCBPolicy } from './linucb';
import { EpsilonGreedyPolicy } from './epsilonGreedy';
import { RandomPolicy, StaticPolicy } from './baselines';
import { dotProduct } from './matrix';

/**
 * Deterministic Mulberry32 RNG for reproducible bandit simulations.
 */
export function createMulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * True latent coefficient vectors theta_a* for each action in the simulation environment.
 * d = 12: [bias, cat0..4, exp, loc, ctr, cpaInv, conv, budgetRem]
 */
export const TRUE_THETA: Record<BanditAction, number[]> = {
  // increase_bid: excels when CPA is low (cpaInv high, idx 9) and budget remaining (idx 11)
  increase_bid: [0.1, 0.2, 0.1, -0.1, 0.05, 0.0, 0.1, 0.1, 0.2, 1.2, 0.6, 0.8],
  // decrease_bid: excels when CPA is high (cpaInv low, idx 9 penalty) or CTR is low
  decrease_bid: [0.2, -0.1, 0.0, 0.1, -0.1, 0.0, -0.1, -0.1, -0.3, -1.0, -0.4, 0.3],
  // maintain_bid: steady baseline performance
  maintain_bid: [0.4, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.2, 0.2, 0.2],
  // increase_budget: excels when conversion rate (idx 10) and qualified rate are strong
  increase_budget: [0.1, 0.3, 0.2, 0.0, 0.1, 0.05, 0.1, 0.1, 0.1, 0.9, 1.3, 0.5],
  // decrease_budget: protective action when budget is low and performance degraded
  decrease_budget: [0.15, -0.2, -0.1, 0.0, -0.1, 0.0, -0.1, -0.1, -0.2, -0.8, -0.6, -0.4],
};

/**
 * Generates a realistic synthetic context vector x in R^12.
 */
export function generateSyntheticContext(rng: () => number): number[] {
  const x = new Array<number>(CONTEXT_DIMENSION).fill(0);
  x[0] = 1.0; // bias

  // category one-hot
  const catIdx = Math.floor(rng() * 5);
  x[1 + catIdx] = 1.0;

  x[6] = rng(); // experience [0, 1]
  x[7] = 0.5 + 0.5 * rng(); // location tier [0.5, 1.0]
  x[8] = 0.1 + 0.8 * rng(); // CTR [0.1, 0.9]
  x[9] = 0.1 + 0.8 * rng(); // CPA inv [0.1, 0.9]
  x[10] = 0.1 + 0.8 * rng(); // Conv rate [0.1, 0.9]
  x[11] = 0.2 + 0.8 * rng(); // Budget remaining [0.2, 1.0]

  return x;
}

export interface RunSimulationOptions {
  rounds?: number;
  algorithms?: BanditAlgorithm[];
  seed?: number;
}

/**
 * Runs an offline multi-armed contextual bandit simulation comparing LinUCB, Epsilon-Greedy,
 * and baselines over N rounds.
 * Returns cumulative reward and regret histories alongside summary metrics.
 */
export function runBanditSimulation(options: RunSimulationOptions = {}): BanditSimulationResponse {
  const rounds = options.rounds ?? 500;
  const algorithms: BanditAlgorithm[] = options.algorithms ?? [
    'linucb',
    'epsilon_greedy',
    'random',
    'static',
  ];
  const seed = options.seed ?? 42;

  const rng = createMulberry32(seed);

  // Initialize policies
  const linucb = new LinUCBPolicy(0.8, 1.0);
  const epsGreedy = new EpsilonGreedyPolicy(0.1, 0.02, 0.998, 1.0);
  const randomPolicy = new RandomPolicy();
  const staticPolicy = new StaticPolicy();

  // Metrics trackers
  const cumulativeRewards: Record<string, number> = {};
  const cumulativeRegrets: Record<string, number> = {};
  const actionCounts: Record<string, Record<BanditAction, number>> = {};

  for (const algo of algorithms) {
    cumulativeRewards[algo] = 0;
    cumulativeRegrets[algo] = 0;
    actionCounts[algo] = {
      increase_bid: 0,
      decrease_bid: 0,
      maintain_bid: 0,
      increase_budget: 0,
      decrease_budget: 0,
    };
  }

  const rewardHistory: BanditSimulationPoint[] = [];
  const regretHistory: BanditSimulationPoint[] = [];

  // Sampling step for history to keep payload size bounded (e.g. max 50 points)
  const step = Math.max(1, Math.floor(rounds / 50));

  for (let t = 1; t <= rounds; t++) {
    const x = generateSyntheticContext(rng);

    // Compute ground-truth rewards for all actions
    let optimalExpectedReward = -Infinity;
    const trueActionRewards: Record<BanditAction, number> = {} as Record<BanditAction, number>;

    for (const action of BANDIT_ACTIONS) {
      const theta = TRUE_THETA[action];
      const mean = dotProduct(theta, x);
      trueActionRewards[action] = mean;
      if (mean > optimalExpectedReward) {
        optimalExpectedReward = mean;
      }
    }

    // Step each requested algorithm
    for (const algo of algorithms) {
      let chosenAction: BanditAction;
      let updateFn: (action: BanditAction, x: number[], r: number) => void;

      switch (algo) {
        case 'linucb': {
          const dec = linucb.selectAction(x, t);
          chosenAction = dec.action;
          updateFn = (a, cx, r) => linucb.update(a, cx, r);
          break;
        }
        case 'epsilon_greedy': {
          const dec = epsGreedy.selectAction(x, rng, t);
          chosenAction = dec.action;
          updateFn = (a, cx, r) => epsGreedy.update(a, cx, r);
          break;
        }
        case 'random': {
          const dec = randomPolicy.selectAction(x, rng, t);
          chosenAction = dec.action;
          updateFn = () => randomPolicy.update();
          break;
        }
        case 'static':
        default: {
          const dec = staticPolicy.selectAction(x, rng, t);
          chosenAction = dec.action;
          updateFn = () => staticPolicy.update();
          break;
        }
      }

      // Add small zero-mean Gaussian noise to observed reward
      const noise = (rng() - 0.5) * 0.1;
      const expectedR = trueActionRewards[chosenAction];
      const observedReward = calculateReward({
        qualifiedApplications: Math.max(0, expectedR * 5.0 + 2.0),
        refQa: 5.0,
        spend: chosenAction.includes('increase') ? 220 : chosenAction.includes('decrease') ? 180 : 200,
        refSpend: 200.0,
        mu: 0.5,
      }) + noise;

      updateFn(chosenAction, x, observedReward);

      cumulativeRewards[algo]! += observedReward;
      const regret = Math.max(0, optimalExpectedReward - expectedR);
      cumulativeRegrets[algo]! += regret;
      actionCounts[algo]![chosenAction] += 1;
    }

    // Record history
    if (t === 1 || t % step === 0 || t === rounds) {
      const rewardPoint: BanditSimulationPoint = { round: t };
      const regretPoint: BanditSimulationPoint = { round: t };

      for (const algo of algorithms) {
        rewardPoint[algo] = Math.round(cumulativeRewards[algo]! * 100) / 100;
        regretPoint[algo] = Math.round(cumulativeRegrets[algo]! * 100) / 100;
      }

      rewardHistory.push(rewardPoint);
      regretHistory.push(regretPoint);
    }
  }

  const summaries: BanditSimulationSummary[] = algorithms.map((algo) => ({
    algorithm: algo,
    cumulativeReward: Math.round(cumulativeRewards[algo]! * 100) / 100,
    averageReward: Math.round((cumulativeRewards[algo]! / rounds) * 1000) / 1000,
    regret: Math.round(cumulativeRegrets[algo]! * 100) / 100,
    actionCounts: actionCounts[algo]!,
  }));

  return {
    rounds,
    rewardHistory,
    regretHistory,
    summaries,
  };
}
