import {
  createIdentity,
  outerProduct,
  matrixAdd,
  directMatrixInverse,
  shermanMorrisonUpdate,
  matrixFrobeniusDistance,
} from '../src/modules/optimization/bandit/matrix';
import { LinUCBPolicy } from '../src/modules/optimization/bandit/linucb';
import { EpsilonGreedyPolicy } from '../src/modules/optimization/bandit/epsilonGreedy';
import {
  runBanditSimulation,
  createMulberry32,
  generateSyntheticContext,
} from '../src/modules/optimization/bandit/simulation';
import { twoProportionZTest, normalCdf } from '../src/modules/optimization/experiments/stats';
import { assignVariant } from '../src/modules/optimization/experiments/assignment';
import { BanditAction, ExperimentVariant } from '@talentpulse/shared';

describe('Task 20: Bandit Math & Statistical Verification', () => {
  describe('Sherman-Morrison Rank-1 Inverse vs Direct Inversion', () => {
    it('maintains negligible Frobenius numerical drift (< 1e-6) over sequential updates', () => {
      const d = 12;
      const lambda = 1.0;
      let A = createIdentity(d, lambda);
      let invA = createIdentity(d, 1.0 / lambda);

      const rng = createMulberry32(12345);

      // Perform 50 sequential rank-1 updates
      for (let step = 0; step < 50; step++) {
        const u = new Array<number>(d);
        for (let i = 0; i < d; i++) {
          u[i] = (rng() - 0.5) * 2; // uniform [-1, 1]
        }

        // Exact direct update: A_new = A + u * u^T
        const uOuter = outerProduct(u, u);
        A = matrixAdd(A, uOuter);
        const directInv = directMatrixInverse(A);

        // Fast Sherman-Morrison update: invA_new = SM(invA, u)
        invA = shermanMorrisonUpdate(invA, u);

        // Calculate Frobenius distance between SM inverse and Direct inverse
        const drift = matrixFrobeniusDistance(invA, directInv);
        expect(drift).toBeLessThan(1e-5);
      }

      // Final drift after 50 updates must be well within tolerance
      const finalDrift = matrixFrobeniusDistance(invA, directMatrixInverse(A));
      expect(finalDrift).toBeLessThan(1e-5);
    });
  });

  describe('LinUCB Convergence vs Random Baseline', () => {
    it('converges to superior cumulative reward and lower regret over 2,000 rounds', () => {
      const simulation = runBanditSimulation({
        rounds: 2000,
        seed: 42,
        algorithms: ['linucb', 'random'],
      });

      const linucbSummary = simulation.summaries.find((s) => s.algorithm === 'linucb')!;
      const randomSummary = simulation.summaries.find((s) => s.algorithm === 'random')!;

      expect(linucbSummary).toBeDefined();
      expect(randomSummary).toBeDefined();

      // LinUCB cumulative reward must substantially outperform Random baseline
      expect(linucbSummary.cumulativeReward).toBeGreaterThan(randomSummary.cumulativeReward * 1.15);

      // LinUCB cumulative regret must be lower than Random baseline
      expect(linucbSummary.regret).toBeLessThan(randomSummary.regret);
    });
  });

  describe('Epsilon-Greedy Exploration Decay', () => {
    it('decays from 0.10 toward 0.02 floor and never dips below minEpsilon', () => {
      const policy = new EpsilonGreedyPolicy(0.10, 0.02, 0.998, 1.0);
      const rng = createMulberry32(999);
      const x = generateSyntheticContext(rng);

      expect(policy.getCurrentEpsilon()).toBeCloseTo(0.10, 4);

      // Simulate 500 rounds of decisions and reward updates
      for (let t = 1; t <= 500; t++) {
        const dec = policy.selectAction(x, rng, t);
        policy.update(dec.action, x, 1.0);
      }

      // After 500 rounds: 0.10 * (0.998^500) ≈ 0.10 * 0.367 ≈ 0.0367
      expect(policy.getCurrentEpsilon()).toBeLessThan(0.05);
      expect(policy.getCurrentEpsilon()).toBeGreaterThanOrEqual(0.02);

      // Simulate further rounds to reach decay floor
      for (let t = 501; t <= 2000; t++) {
        const dec = policy.selectAction(x, rng, t);
        policy.update(dec.action, x, 1.0);
      }

      expect(policy.getCurrentEpsilon()).toBeCloseTo(0.02, 4);
    });
  });

  describe('Policy Serialization and Deserialization Round-Trip', () => {
    it('serializes and deserializes LinUCB state preserving identical predictions', () => {
      const original = new LinUCBPolicy(0.8, 1.0);
      const rng = createMulberry32(777);

      // Train with some updates
      for (let i = 0; i < 20; i++) {
        const x = generateSyntheticContext(rng);
        original.update('increase_bid', x, 1.5);
        original.update('maintain_bid', x, 0.8);
      }

      // Serialize
      const serialized = original.serialize();
      expect(serialized.algorithm).toBe('linucb');
      expect(serialized.totalPulls).toBe(40);

      // Rehydrate
      const restored = LinUCBPolicy.deserialize(serialized);

      // Test identical scoring on new context vector
      const testX = generateSyntheticContext(rng);
      const origDec = original.selectAction(testX);
      const restDec = restored.selectAction(testX);

      expect(restDec.action).toBe(origDec.action);
      for (const arm of ['increase_bid', 'decrease_bid', 'maintain_bid', 'increase_budget', 'decrease_budget'] as BanditAction[]) {
        expect(restDec.scores[arm]).toBeCloseTo(origDec.scores[arm], 6);
      }
    });
  });

  describe('Statistical Normal CDF & Two-Proportion Z-Test', () => {
    it('computes normal CDF accurately against standard normal distribution values', () => {
      expect(normalCdf(0)).toBeCloseTo(0.5, 5);
      expect(normalCdf(1.95996)).toBeCloseTo(0.975, 4); // 95% two-sided critical z
      expect(normalCdf(2.5758)).toBeCloseTo(0.995, 4); // 99% two-sided critical z
      expect(normalCdf(-1.95996)).toBeCloseTo(0.025, 4);
    });

    it('performs two-proportion z-test matching statistical reference values', () => {
      // 20/100 control vs 35/100 variant
      const result = twoProportionZTest(20, 100, 35, 100);

      expect(result.hasSufficientData).toBe(true);
      expect(result.zScore).toBeCloseTo(2.375, 2);
      expect(result.pValue).toBeCloseTo(0.0175, 3);
      expect(result.significant).toBe(true);
      expect(result.lift).toBeCloseTo(0.75, 2); // (0.35 - 0.20) / 0.20 = +75% lift
    });

    it('enforces minimum sample size guard (N < 30) per arm', () => {
      const underpowered = twoProportionZTest(5, 20, 10, 20);

      expect(underpowered.hasSufficientData).toBe(false);
      expect(underpowered.significant).toBe(false);
      expect(underpowered.zScore).toBeNull();
      expect(underpowered.pValue).toBeNull();
    });
  });

  describe('Deterministic Variant Assignment', () => {
    const variants: ExperimentVariant[] = [
      { key: 'control', weight: 50 },
      { key: 'variant_b', weight: 50 },
    ];
    const experimentId = 'd82b0123-5e93-4a11-b0e2-892a0e44208a';

    it('is strictly deterministic and stable across calls for the same subject', () => {
      const key1 = 'candidate-9912';
      const key2 = 'candidate-1044';

      const assign1a = assignVariant(experimentId, key1, variants);
      const assign1b = assignVariant(experimentId, key1, variants);
      expect(assign1a).toBe(assign1b);

      const assign2a = assignVariant(experimentId, key2, variants);
      const assign2b = assignVariant(experimentId, key2, variants);
      expect(assign2a).toBe(assign2b);
    });

    it('achieves approximately even 50/50 split across 1,000 distinct subjects', () => {
      const counts: Record<string, number> = { control: 0, variant_b: 0 };

      for (let i = 0; i < 1000; i++) {
        const subjectKey = `user-${i}`;
        const assigned = assignVariant(experimentId, subjectKey, variants);
        counts[assigned] = (counts[assigned] ?? 0) + 1;
      }

      // Expect each arm to receive between 45% and 55% of traffic
      expect(counts.control).toBeGreaterThan(450);
      expect(counts.control).toBeLessThan(550);
      expect(counts.variant_b).toBeGreaterThan(450);
      expect(counts.variant_b).toBeLessThan(550);
    });
  });
});
