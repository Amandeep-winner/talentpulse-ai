import request from 'supertest';
import { createApp } from '../src/app';
import { testPrisma, truncateAllTables } from './helpers/db';
import { evaluatePublisherRules } from '../src/modules/optimization/rules';
import { scorePublishers } from '../src/modules/optimization/score';
import { computeAllocations } from '../src/modules/optimization/allocate';
import { runAiPipeline } from '../src/modules/ai/pipeline';

const app = createApp();

describe('Optimization Engine (Task 19)', () => {
  describe('Rule Engine Unit Tests (rules.ts)', () => {
    it('enforces minimum-volume guard when clicks < 50', () => {
      const res = evaluatePublisherRules({
        publisherId: 'p1',
        publisherName: 'Low Volume Pub',
        clicks: 42,
        impressions: 1000,
        applications: 2,
        qualifiedApplications: 1,
        ctr: 4.2,
        cpa: 50,
        cpaDelta: 25.0,
        appRateDelta: -15.0,
      });

      expect(res.action).toBe('insufficient_volume');
      expect(res.reason).toContain('Insufficient click volume');
    });

    it('triggers reduce_allocation when CPA ↑ > 10% and app rate ↓ > 5%', () => {
      const res = evaluatePublisherRules({
        publisherId: 'p2',
        publisherName: 'Degrading Pub',
        clicks: 120,
        impressions: 3000,
        applications: 6,
        qualifiedApplications: 2,
        ctr: 4.0,
        cpa: 85,
        cpaDelta: 18.5,
        appRateDelta: -8.0,
      });

      expect(res.action).toBe('reduce_allocation');
      expect(res.reason).toContain('CPA escalated');
    });

    it('triggers increase_allocation when CPA ↓ > 10% and qualified apps ↑', () => {
      const res = evaluatePublisherRules({
        publisherId: 'p3',
        publisherName: 'High Performer Pub',
        clicks: 250,
        impressions: 5000,
        applications: 25,
        qualifiedApplications: 15,
        ctr: 5.0,
        cpa: 30,
        cpaDelta: -14.0,
        appRateDelta: 12.0,
        qualifiedDelta: 15.0,
      });

      expect(res.action).toBe('increase_allocation');
      expect(res.reason).toContain('CPA improved');
    });

    it('triggers review_landing_quality when CTR is healthy but app rate collapses', () => {
      const res = evaluatePublisherRules({
        publisherId: 'p4',
        publisherName: 'Landing Issue Pub',
        clicks: 180,
        impressions: 4000,
        applications: 2,
        qualifiedApplications: 1,
        ctr: 4.5,
        cpa: 120,
        cpaDelta: 5.0,
        appRateDelta: -25.0,
      });

      expect(res.action).toBe('review_landing_quality');
      expect(res.reason).toContain('Healthy ad CTR');
    });

    it('triggers adjust_pacing when pacing ratio exceeds 120% or falls below 70%', () => {
      const overpacingRes = evaluatePublisherRules({
        publisherId: 'p5',
        publisherName: 'Overpacing Pub',
        clicks: 95,
        impressions: 2000,
        applications: 8,
        qualifiedApplications: 4,
        ctr: 4.75,
        cpa: 45,
        cpaDelta: 2.0,
        appRateDelta: 1.0,
        pacingRatio: 1.35,
      });

      expect(overpacingRes.action).toBe('adjust_pacing');
      expect(overpacingRes.reason).toContain('pacing at 135%');

      const underpacingRes = evaluatePublisherRules({
        publisherId: 'p6',
        publisherName: 'Underpacing Pub',
        clicks: 95,
        impressions: 2000,
        applications: 8,
        qualifiedApplications: 4,
        ctr: 4.75,
        cpa: 45,
        cpaDelta: 2.0,
        appRateDelta: 1.0,
        pacingRatio: 0.62,
      });

      expect(underpacingRes.action).toBe('adjust_pacing');
      expect(underpacingRes.reason).toContain('pacing at 62%');
    });

    it('maintains allocation when metrics are within normal ranges', () => {
      const res = evaluatePublisherRules({
        publisherId: 'p7',
        publisherName: 'Stable Pub',
        clicks: 100,
        impressions: 2500,
        applications: 10,
        qualifiedApplications: 5,
        ctr: 4.0,
        cpa: 40,
        cpaDelta: 2.0,
        appRateDelta: 1.0,
        pacingRatio: 1.02,
      });

      expect(res.action).toBe('maintain_allocation');
    });
  });

  describe('Scoring Engine Unit Tests (score.ts)', () => {
    it('normalizes CPA/CPH and computes quality and weighted score', () => {
      const inputs = [
        {
          publisherId: 'pub-1',
          publisherName: 'High Quality Low CPA',
          clicks: 300,
          applications: 30,
          qualifiedApplications: 24, // QA rate 0.8
          hires: 3,
          spend: 1200,
          cpa: 40,
          cph: 400,
          hireRate: 0.1,
        },
        {
          publisherId: 'pub-2',
          publisherName: 'Low Quality High CPA',
          clicks: 300,
          applications: 15,
          qualifiedApplications: 3, // QA rate 0.2
          hires: 1,
          spend: 1800,
          cpa: 120,
          cph: 1800,
          hireRate: 0.067,
        },
      ];

      const scored = scorePublishers(inputs, { quality: 1.0, lambdaCpa: 0.5, lambdaCph: 0.5 });
      expect(scored).toHaveLength(2);

      const top = scored.find((s) => s.publisherId === 'pub-1')!;
      const bottom = scored.find((s) => s.publisherId === 'pub-2')!;

      expect(top.quality).toBeGreaterThan(bottom.quality);
      expect(top.cpaNorm).toBeLessThan(bottom.cpaNorm);
      expect(top.score).toBeGreaterThan(bottom.score);
    });
  });

  describe('Allocation Engine Unit Tests (allocate.ts)', () => {
    it('guarantees allocations sum to exactly 100.00% with 5% floor, 50% cap, and max ±10 pp change', () => {
      const scores = [
        { publisherId: 'pA', publisherName: 'Pub A', score: 1.8, quality: 0.9, cpaNorm: 0.1, cphNorm: 0.1 },
        { publisherId: 'pB', publisherName: 'Pub B', score: -0.8, quality: 0.2, cpaNorm: 0.9, cphNorm: 0.9 },
        { publisherId: 'pC', publisherName: 'Pub C', score: 0.2, quality: 0.5, cpaNorm: 0.5, cphNorm: 0.5 },
        { publisherId: 'pD', publisherName: 'Pub D', score: 1.4, quality: 0.8, cpaNorm: 0.2, cphNorm: 0.2 },
        { publisherId: 'pE', publisherName: 'Pub E', score: 0.5, quality: 0.6, cpaNorm: 0.4, cphNorm: 0.4 },
      ];

      const current = {
        pA: 20.0,
        pB: 20.0,
        pC: 20.0,
        pD: 20.0,
        pE: 20.0,
      };

      const res = computeAllocations(scores, current, {
        tau: 0.5,
        floor: 5.0,
        cap: 50.0,
        maxChange: 10.0,
      });

      const allocs = res.allocations;
      let total = 0;
      for (const [id, pct] of Object.entries(allocs)) {
        total += pct;
        // Floor and cap check
        expect(pct).toBeGreaterThanOrEqual(5.0);
        expect(pct).toBeLessThanOrEqual(50.0);
        // Max change check ±10 pp from 20%
        expect(pct).toBeGreaterThanOrEqual(current[id as keyof typeof current] - 10.0);
        expect(pct).toBeLessThanOrEqual(current[id as keyof typeof current] + 10.0);
      }

      // Exact 100.00% sum check
      expect(Math.round(total * 100) / 100).toBe(100.0);
    });
  });

  describe('Integration & API Tests (/api/optimization)', () => {
    let orgId: string;
    let adminToken: string;
    let recruiterToken: string;
    let analystToken: string;
    let adminUserId: string;
    let campaignId: string;
    let pubAId: string;
    let pubBId: string;
    let pubCId: string;
    let pubDId: string;
    let pubEId: string;
    let createdRecommendationId: string;

    beforeAll(async () => {
      await truncateAllTables();

      // 1. Create Organization and Users
      const regRes = await request(app)
        .post('/api/auth/register')
        .send({
          organizationName: 'Optimization Test Corp',
          name: 'Optimizer Admin',
          email: 'admin@optimization-test.com',
          password: 'Password123!',
        });
      orgId = regRes.body.data.user.organizationId;
      adminUserId = regRes.body.data.user.id;
      adminToken = regRes.body.data.accessToken;

      const jwt = await import('jsonwebtoken');
      const { env } = await import('../src/config/env');

      const recruiterUser = await testPrisma.user.create({
        data: {
          organizationId: orgId,
          name: 'Optimizer Recruiter',
          email: 'recruiter@optimization-test.com',
          passwordHash: 'hashed',
          role: 'RECRUITER',
        },
      });
      recruiterToken = jwt.sign(
        { userId: recruiterUser.id, organizationId: orgId, role: 'RECRUITER' },
        env.JWT_ACCESS_SECRET,
        { expiresIn: '1h' }
      );

      const analystUser = await testPrisma.user.create({
        data: {
          organizationId: orgId,
          name: 'Optimizer Analyst',
          email: 'analyst@optimization-test.com',
          passwordHash: 'hashed',
          role: 'ANALYST',
        },
      });
      analystToken = jwt.sign(
        { userId: analystUser.id, organizationId: orgId, role: 'ANALYST' },
        env.JWT_ACCESS_SECRET,
        { expiresIn: '1h' }
      );

      // 2. Create Job
      const job = await testPrisma.job.create({
        data: {
          organizationId: orgId,
          title: 'Principal Machine Learning Architect',
          description: 'Build predictive AI and optimization platforms',
          category: 'Engineering',
          location: 'San Francisco, CA',
        },
      });

      // 3. Create 5 Publishers
      const [pubA, pubB, pubC, pubD, pubE] = await Promise.all([
        testPrisma.publisher.create({
          data: { organizationId: orgId, name: 'JobBoard Prime', type: 'JOB_BOARD' },
        }),
        testPrisma.publisher.create({
          data: { organizationId: orgId, name: 'SocialReach', type: 'SOCIAL' },
        }),
        testPrisma.publisher.create({
          data: { organizationId: orgId, name: 'SearchHire', type: 'SEARCH' },
        }),
        testPrisma.publisher.create({
          data: { organizationId: orgId, name: 'AggregatorX', type: 'AGGREGATOR' },
        }),
        testPrisma.publisher.create({
          data: { organizationId: orgId, name: 'ReferralNet', type: 'REFERRAL' },
        }),
      ]);
      pubAId = pubA.id;
      pubBId = pubB.id;
      pubCId = pubC.id;
      pubDId = pubD.id;
      pubEId = pubE.id;

      // 4. Create Campaign with 20% split each
      const campaign = await testPrisma.campaign.create({
        data: {
          organizationId: orgId,
          jobId: job.id,
          name: 'ML Talent Acquisition Q4',
          budget: 60000,
          status: 'ACTIVE',
          startDate: new Date('2026-09-01'),
          publishers: {
            create: [
              { publisherId: pubAId, allocationPct: 20.0, bidCpc: 20.0, dailyBudget: 400 },
              { publisherId: pubBId, allocationPct: 20.0, bidCpc: 20.0, dailyBudget: 400 },
              { publisherId: pubCId, allocationPct: 20.0, bidCpc: 20.0, dailyBudget: 400 },
              { publisherId: pubDId, allocationPct: 20.0, bidCpc: 20.0, dailyBudget: 400 },
              { publisherId: pubEId, allocationPct: 20.0, bidCpc: 20.0, dailyBudget: 400 },
            ],
          },
        },
      });
      campaignId = campaign.id;

      // 5. Seed historical events over current 7d and prior 7d windows:
      // Publisher B (SocialReach): CPA increased sharply (CPA up >10%), application rate collapsed
      // Publisher D (AggregatorX): CPA decreased (CPA down >10%), qualified applications high
      const now = new Date();
      const dayMs = 24 * 3600 * 1000;

      // Prior 7 days (days -14 to -8)
      // Pub B in prior: 200 clicks, 20 apps ($100 spend -> CPA $5)
      // Pub D in prior: 200 clicks, 15 apps ($150 spend -> CPA $10)
      for (let day = 8; day <= 14; day++) {
        const d = new Date(now.getTime() - day * dayMs);

        await testPrisma.campaignSpend.createMany({
          data: [
            { organizationId: orgId, campaignId, publisherId: pubAId, date: d, amount: 50 },
            { organizationId: orgId, campaignId, publisherId: pubBId, date: d, amount: 20 },
            { organizationId: orgId, campaignId, publisherId: pubCId, date: d, amount: 50 },
            { organizationId: orgId, campaignId, publisherId: pubDId, date: d, amount: 30 },
            { organizationId: orgId, campaignId, publisherId: pubEId, date: d, amount: 40 },
          ],
        });

        // Pub B prior events: healthy
        await testPrisma.campaignEvent.createMany({
          data: [
            {
              organizationId: orgId,
              campaignId,
              publisherId: pubBId,
              eventId: `b-prior-click-${day}`,
              eventType: 'CLICK',
              quantity: 25,
              timestamp: d,
            },
            {
              organizationId: orgId,
              campaignId,
              publisherId: pubBId,
              eventId: `b-prior-app-${day}`,
              eventType: 'APPLICATION',
              quantity: 3,
              qualifiedQuantity: 2,
              timestamp: d,
            },
            // Pub D prior events
            {
              organizationId: orgId,
              campaignId,
              publisherId: pubDId,
              eventId: `d-prior-click-${day}`,
              eventType: 'CLICK',
              quantity: 25,
              timestamp: d,
            },
            {
              organizationId: orgId,
              campaignId,
              publisherId: pubDId,
              eventId: `d-prior-app-${day}`,
              eventType: 'APPLICATION',
              quantity: 2,
              qualifiedQuantity: 1,
              timestamp: d,
            },
          ],
        });
      }

      // Current 7 days (days -7 to -1)
      // Pub B current: 200 clicks, only 5 apps, spend $200 -> CPA $40 (huge CPA jump >10%, app rate down)
      // Pub D current: 300 clicks, 35 apps, 25 qualified, spend $120 -> CPA $3.4 (CPA down >10%, qualified apps up)
      for (let day = 1; day <= 7; day++) {
        const d = new Date(now.getTime() - day * dayMs);

        await testPrisma.campaignSpend.createMany({
          data: [
            { organizationId: orgId, campaignId, publisherId: pubAId, date: d, amount: 50 },
            { organizationId: orgId, campaignId, publisherId: pubBId, date: d, amount: 50 },
            { organizationId: orgId, campaignId, publisherId: pubCId, date: d, amount: 50 },
            { organizationId: orgId, campaignId, publisherId: pubDId, date: d, amount: 20 },
            { organizationId: orgId, campaignId, publisherId: pubEId, date: d, amount: 40 },
          ],
        });

        await testPrisma.campaignEvent.createMany({
          data: [
            // Pub A: steady baseline
            {
              organizationId: orgId,
              campaignId,
              publisherId: pubAId,
              eventId: `a-curr-click-${day}`,
              eventType: 'CLICK',
              quantity: 20,
              timestamp: d,
            },
            {
              organizationId: orgId,
              campaignId,
              publisherId: pubAId,
              eventId: `a-curr-app-${day}`,
              eventType: 'APPLICATION',
              quantity: 2,
              qualifiedQuantity: 1,
              timestamp: d,
            },
            // Pub B: degrading
            {
              organizationId: orgId,
              campaignId,
              publisherId: pubBId,
              eventId: `b-curr-click-${day}`,
              eventType: 'CLICK',
              quantity: 30,
              timestamp: d,
            },
            {
              organizationId: orgId,
              campaignId,
              publisherId: pubBId,
              eventId: `b-curr-app-${day}`,
              eventType: 'APPLICATION',
              quantity: 1,
              qualifiedQuantity: 0,
              timestamp: d,
            },
            // Pub D: top performing
            {
              organizationId: orgId,
              campaignId,
              publisherId: pubDId,
              eventId: `d-curr-click-${day}`,
              eventType: 'CLICK',
              quantity: 45,
              timestamp: d,
            },
            {
              organizationId: orgId,
              campaignId,
              publisherId: pubDId,
              eventId: `d-curr-app-${day}`,
              eventType: 'APPLICATION',
              quantity: 6,
              qualifiedQuantity: 5,
              timestamp: d,
            },
            {
              organizationId: orgId,
              campaignId,
              publisherId: pubDId,
              eventId: `d-curr-hire-${day}`,
              eventType: 'HIRE',
              quantity: 1,
              qualifiedQuantity: 1,
              timestamp: d,
            },
          ],
        });
      }
    });

    it('POST /api/optimization/propose generates recommendation reducing Pub B and increasing Pub D', async () => {
      const res = await request(app)
        .post('/api/optimization/propose')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ campaignId });

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data).toBeDefined();
      expect(data.type).toBe('CAMPAIGN_ALLOCATION');
      expect(data.status).toBe('PROPOSED');
      expect(data.modelVersion).toBe('rules+score-v1');
      expect(data.confidence).toBeGreaterThanOrEqual(0.7);

      createdRecommendationId = data.id;

      const decision = data.decision;
      expect(decision.current).toBeDefined();
      expect(decision.recommended).toBeDefined();
      expect(decision.actions).toBeInstanceOf(Array);

      // Verify allocations sum to 100%
      const recValues = Object.values(decision.recommended) as number[];
      const totalRec = recValues.reduce((acc, v) => acc + v, 0);
      expect(Math.round(totalRec * 100) / 100).toBe(100.0);

      // Gate Verification: Optimizer reduces Publisher B (SocialReach) and increases Publisher D (AggregatorX)
      const bRec = decision.recommended[pubBId]!;
      const dRec = decision.recommended[pubDId]!;
      expect(bRec).toBeLessThan(20.0); // reduced below original 20%
      expect(dRec).toBeGreaterThan(20.0); // increased above original 20%

      // Verify Rule action for Publisher B is reduce_allocation
      const bAction = decision.actions.find(
        (a: { publisherId: string; action: string }) => a.publisherId === pubBId
      );
      expect(bAction).toBeDefined();
      expect(bAction.action).toBe('reduce_allocation');
    });

    it('GET /api/optimization/recommendations allows ANALYST to list and view proposals', async () => {
      const listRes = await request(app)
        .get(`/api/optimization/recommendations?campaignId=${campaignId}`)
        .set('Authorization', `Bearer ${analystToken}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data).toBeInstanceOf(Array);
      expect(listRes.body.data.length).toBeGreaterThan(0);

      const itemRes = await request(app)
        .get(`/api/optimization/recommendations/${createdRecommendationId}`)
        .set('Authorization', `Bearer ${analystToken}`);

      expect(itemRes.status).toBe(200);
      expect(itemRes.body.data.id).toBe(createdRecommendationId);
    });

    it('POST /api/optimization/recommendations/:id/approve strictly blocks ANALYST role with 403', async () => {
      const res = await request(app)
        .post(`/api/optimization/recommendations/${createdRecommendationId}/approve`)
        .set('Authorization', `Bearer ${analystToken}`);

      expect(res.status).toBe(403);
    });

    it('POST /api/optimization/recommendations/:id/approve applies allocations atomically for ADMIN', async () => {
      const approveRes = await request(app)
        .post(`/api/optimization/recommendations/${createdRecommendationId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.status).toBe('APPLIED');
      expect(approveRes.body.data.decidedBy).toBe(adminUserId);
      expect(approveRes.body.data.decidedAt).toBeDefined();

      // Verify DB CampaignPublisher table was atomically updated
      const updatedCampaign = await testPrisma.campaign.findUniqueOrThrow({
        where: { id: campaignId },
        include: { publishers: true },
      });

      const bPublisher = updatedCampaign.publishers.find((p) => p.publisherId === pubBId);
      const dPublisher = updatedCampaign.publishers.find((p) => p.publisherId === pubDId);

      expect(Number(bPublisher?.allocationPct)).toBeLessThan(20.0);
      expect(Number(dPublisher?.allocationPct)).toBeGreaterThan(20.0);
    });

    it('rejects duplicate approval on already APPLIED recommendation', async () => {
      const dupRes = await request(app)
        .post(`/api/optimization/recommendations/${createdRecommendationId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(dupRes.status).toBe(400);
      expect(dupRes.body.error.message).toContain('already in');
    });

    it('handles reject workflow on a fresh proposal', async () => {
      // 1. Propose second recommendation with Recruiter
      const propRes = await request(app)
        .post('/api/optimization/propose')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ campaignId });
      expect(propRes.status).toBe(200);
      const recId = propRes.body.data.id;

      // 2. Analyst cannot reject
      const analystReject = await request(app)
        .post(`/api/optimization/recommendations/${recId}/reject`)
        .set('Authorization', `Bearer ${analystToken}`);
      expect(analystReject.status).toBe(403);

      // 3. Recruiter can reject
      const recruiterReject = await request(app)
        .post(`/api/optimization/recommendations/${recId}/reject`)
        .set('Authorization', `Bearer ${recruiterToken}`);
      expect(recruiterReject.status).toBe(200);
      expect(recruiterReject.body.data.status).toBe('REJECTED');
    });

    it('AI Pipeline seamlessly generates optimization recommendation and chart for campaign_recommendation intent', async () => {
      const result = await runAiPipeline({
        organizationId: orgId,
        userId: adminUserId,
        question: 'What are the recommended budget reallocations for our current campaign?',
      });

      expect(result.intent).toBe('campaign_recommendation');
      expect(result.answer).toContain('Budget Optimization Proposal');
      expect(result.chart).toBeDefined();
      expect(result.chart?.type).toBe('bar');
      expect(result.chart?.series).toEqual(['current', 'recommended']);
      expect(result.recommendations).toBeInstanceOf(Array);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    afterAll(async () => {
      await testPrisma.$disconnect();
      const { redis } = await import('../src/lib/redis');
      redis.disconnect();
    });
  });
});
