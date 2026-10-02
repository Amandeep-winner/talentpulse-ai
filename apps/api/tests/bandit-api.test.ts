import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env';

describe('Task 20: Contextual Bandit & Experiments API Integration', () => {
  const app = createApp();

  let adminToken: string;
  let recruiterToken: string;
  let analystToken: string;
  let orgId: string;
  let campaignId: string;
  let publisherId: string;

  beforeAll(async () => {
    // 1. Create Organization & Admin User
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        organizationName: `Bandit Test Corp ${Date.now()}`,
        name: 'Bandit Admin',
        email: `admin-${Date.now()}@bandit-test.com`,
        password: 'Password123!',
      });
    orgId = regRes.body.data.user.organizationId;
    adminToken = regRes.body.data.accessToken;

    // 2. Create Recruiter and Analyst Users
    const recruiterUser = await prisma.user.create({
      data: {
        organizationId: orgId,
        name: 'Bandit Recruiter',
        email: `recruiter-${Date.now()}@bandit-test.com`,
        passwordHash: 'hashed',
        role: 'RECRUITER',
      },
    });
    recruiterToken = jwt.sign(
      { userId: recruiterUser.id, organizationId: orgId, role: 'RECRUITER' },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '1h' }
    );

    const analystUser = await prisma.user.create({
      data: {
        organizationId: orgId,
        name: 'Bandit Analyst',
        email: `analyst-${Date.now()}@bandit-test.com`,
        passwordHash: 'hashed',
        role: 'ANALYST',
      },
    });
    analystToken = jwt.sign(
      { userId: analystUser.id, organizationId: orgId, role: 'ANALYST' },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '1h' }
    );

    // 3. Create Publisher, Job, and Campaign
    const publisher = await prisma.publisher.create({
      data: {
        organizationId: orgId,
        name: 'JobBoard Prime',
        type: 'JOB_BOARD',
      },
    });
    publisherId = publisher.id;

    const job = await prisma.job.create({
      data: {
        organizationId: orgId,
        title: 'Senior Bandit Engineer',
        description: 'Test job for contextual bandit evaluation',
        category: 'Engineering',
        location: 'Bengaluru',
      },
    });

    const campaign = await prisma.campaign.create({
      data: {
        organizationId: orgId,
        jobId: job.id,
        name: 'Bandit Growth Campaign',
        budget: 50000,
        status: 'ACTIVE',
        startDate: new Date(),
      },
    });
    campaignId = campaign.id;
  });

  describe('Bandit API Endpoints', () => {
    let testDecisionId: string;

    it('POST /api/optimization/bandit/decide selects an action and logs decision', async () => {
      const res = await request(app)
        .post('/api/optimization/bandit/decide')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          algorithm: 'linucb',
          campaignId,
          publisherId,
          context: {
            jobCategory: 'Engineering',
            experienceYears: 4,
            locationTier: 1,
            ctr: 3.8,
            cpa: 35.0,
            convRate: 0.12,
            remainingBudgetFrac: 0.8,
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.decisionId).toBeDefined();
      expect(res.body.data.algorithm).toBe('linucb');
      expect(res.body.data.action).toBeDefined();
      expect(res.body.data.scores).toBeDefined();
      expect(res.body.data.policyVersion).toBeGreaterThanOrEqual(1);

      testDecisionId = res.body.data.decisionId;
    });

    it('POST /api/optimization/bandit/reward updates policy with observed payoff', async () => {
      expect(testDecisionId).toBeDefined();

      const res = await request(app)
        .post('/api/optimization/bandit/reward')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          decisionId: testDecisionId,
          metrics: {
            qualifiedApplications: 8,
            refQa: 5.0,
            spend: 210,
            refSpend: 200,
            mu: 0.5,
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.decisionId).toBe(testDecisionId);
      expect(res.body.data.reward).toBeDefined();
      expect(res.body.data.policyVersion).toBeGreaterThan(1);
    });

    it('GET /api/optimization/bandit/state returns current policy parameters', async () => {
      const res = await request(app)
        .get('/api/optimization/bandit/state?algorithm=linucb')
        .set('Authorization', `Bearer ${analystToken}`); // Analysts can read state

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.algorithm).toBe('linucb');
      expect(res.body.data.state).toBeDefined();
      expect(res.body.data.state.arms).toBeDefined();
    });

    it('POST /api/optimization/bandit/reset resets policy (RBAC: Admin only)', async () => {
      // Recruiter blocked from reset
      const denied = await request(app)
        .post('/api/optimization/bandit/reset')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ algorithm: 'linucb' });
      expect(denied.status).toBe(403);

      // Admin succeeds
      const allowed = await request(app)
        .post('/api/optimization/bandit/reset')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ algorithm: 'linucb' });
      expect(allowed.status).toBe(200);
      expect(allowed.body.data.success).toBe(true);
    });

    it('POST /api/optimization/bandit/simulate satisfies Task 20 Verification Gate: LinUCB > ε-greedy > Random', async () => {
      const res = await request(app)
        .post('/api/optimization/bandit/simulate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          rounds: 500,
          seed: 42,
          algorithms: ['linucb', 'epsilon_greedy', 'random', 'static'],
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      const summaries: Array<{ algorithm: string; cumulativeReward: number; regret: number }> =
        res.body.data.summaries;

      const linucb = summaries.find((s) => s.algorithm === 'linucb');
      const epsGreedy = summaries.find((s) => s.algorithm === 'epsilon_greedy');
      const random = summaries.find((s) => s.algorithm === 'random');

      expect(linucb).toBeDefined();
      expect(epsGreedy).toBeDefined();
      expect(random).toBeDefined();

      // Task 20 Verification Gate: LinUCB > ε-greedy > Random on the default scenario
      expect(linucb!.cumulativeReward).toBeGreaterThan(epsGreedy!.cumulativeReward);
      expect(epsGreedy!.cumulativeReward).toBeGreaterThan(random!.cumulativeReward);

      // Regret relationship: LinUCB < ε-greedy < Random
      expect(linucb!.regret).toBeLessThan(epsGreedy!.regret);
      expect(epsGreedy!.regret).toBeLessThan(random!.regret);
    });
  });

  describe('A/B Experiments API Endpoints', () => {
    let createdExperimentId: string;

    it('POST /api/experiments creates a new experiment with validated weights', async () => {
      // Invalid weight sum (> 100)
      const invalid = await request(app)
        .post('/api/experiments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Invalid Split Experiment',
          variants: [
            { key: 'A', weight: 60 },
            { key: 'B', weight: 60 },
          ],
        });
      expect(invalid.status).toBe(400);

      // Valid experiment
      const valid = await request(app)
        .post('/api/experiments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Job Description Header Test',
          hypothesis: 'Highlighting remote flexibility boosts applicant completion rate.',
          variants: [
            { key: 'control', weight: 50 },
            { key: 'remote_first', weight: 50 },
          ],
        });

      expect(valid.status).toBe(201);
      expect(valid.body.data.id).toBeDefined();
      expect(valid.body.data.status).toBe('DRAFT');
      expect(valid.body.data.stats).toHaveLength(2);

      createdExperimentId = valid.body.data.id;
    });

    it('PATCH /api/experiments/:id/status updates experiment status to RUNNING', async () => {
      const res = await request(app)
        .patch(`/api/experiments/${createdExperimentId}/status`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ status: 'RUNNING' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('RUNNING');
    });

    it('POST /api/experiments/:id/assign deterministically assigns subject to variant', async () => {
      const res1 = await request(app)
        .post(`/api/experiments/${createdExperimentId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ subjectKey: 'cand-session-abc' });

      expect(res1.status).toBe(200);
      expect(res1.body.data.variant).toBeDefined();
      expect(res1.body.data.isNewExposure).toBe(true);

      const assignedVariant = res1.body.data.variant;

      // Repeat call for same subject returns identical assignment (isNewExposure: false)
      const res2 = await request(app)
        .post(`/api/experiments/${createdExperimentId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ subjectKey: 'cand-session-abc' });

      expect(res2.status).toBe(200);
      expect(res2.body.data.variant).toBe(assignedVariant);
      expect(res2.body.data.isNewExposure).toBe(false);
    });

    it('POST /api/experiments/:id/convert records subject conversion event', async () => {
      const res = await request(app)
        .post(`/api/experiments/${createdExperimentId}/convert`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ subjectKey: 'cand-session-abc' });

      expect(res.status).toBe(200);
      expect(res.body.data.converted).toBe(true);
    });

    it('GET /api/experiments returns all experiments including stats', async () => {
      const res = await request(app)
        .get('/api/experiments')
        .set('Authorization', `Bearer ${analystToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);

      const experiments: Array<{ id: string; totalExposures: number }> = res.body.data;
      const exp = experiments.find((e) => e.id === createdExperimentId);
      expect(exp).toBeDefined();
      expect(exp!.totalExposures).toBeGreaterThanOrEqual(1);
    });
  });
});
