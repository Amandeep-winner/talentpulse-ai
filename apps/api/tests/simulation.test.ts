import request from 'supertest';
import { createApp } from '../src/app';
import { testPrisma, truncateAllTables } from './helpers/db';
import {
  simulateDay,
  createMulberry32,
  STANDARD_PROFILES,
  getPublisherProfile,
} from '../src/modules/simulation';

describe('Publisher Simulation Engine & Allocation Management (Task 17)', () => {
  const app = createApp();

  let orgId: string;
  let adminToken: string;
  let analystToken: string;
  let campaignId: string;
  let publisherAId: string;
  let publisherBId: string;

  beforeAll(async () => {
    await truncateAllTables();

    // 1. Create Organization & Admin
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        organizationName: 'Simulation Testing Co',
        name: 'Sim Admin',
        email: 'admin@simulation.com',
        password: 'Password123!',
      });
    adminToken = regRes.body.data.accessToken;
    orgId = regRes.body.data.user.organizationId;

    // 2. Create Analyst User
    const analystUser = await testPrisma.user.create({
      data: {
        organizationId: orgId,
        name: 'Sim Analyst',
        email: 'analyst@simulation.com',
        passwordHash: 'hashed',
        role: 'ANALYST',
      },
    });

    const jwt = await import('jsonwebtoken');
    const { env } = await import('../src/config/env');
    analystToken = jwt.sign(
      { userId: analystUser.id, organizationId: orgId, role: 'ANALYST' },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '1h' }
    );

    // 3. Create Job
    const job = await testPrisma.job.create({
      data: {
        organizationId: orgId,
        title: 'Cloud Infrastructure Architect',
        description: 'Terraform, AWS, and Kubernetes architect',
        category: 'Engineering',
        location: 'Bengaluru',
        minExperienceYears: 7,
        requiredSkills: ['AWS', 'Kubernetes', 'Terraform'],
      },
    });

    // 4. Create Publishers
    const pubA = await testPrisma.publisher.create({
      data: {
        organizationId: orgId,
        name: 'JobBoard Prime',
        type: 'JOB_BOARD',
      },
    });
    publisherAId = pubA.id;

    const pubB = await testPrisma.publisher.create({
      data: {
        organizationId: orgId,
        name: 'SocialReach',
        type: 'SOCIAL',
      },
    });
    publisherBId = pubB.id;

    // 5. Create Campaign with Allocations
    const camp = await testPrisma.campaign.create({
      data: {
        organizationId: orgId,
        jobId: job.id,
        name: 'Q4 Cloud Architect Sourcing',
        budget: 60000,
        status: 'ACTIVE',
        startDate: new Date(),
      },
    });
    campaignId = camp.id;

    await testPrisma.campaignPublisher.createMany({
      data: [
        {
          campaignId,
          publisherId: publisherAId,
          allocationPct: 60,
          bidCpc: 22.0,
          dailyBudget: 1200,
        },
        {
          campaignId,
          publisherId: publisherBId,
          allocationPct: 40,
          bidCpc: 14.0,
          dailyBudget: 800,
        },
      ],
    });
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  describe('Simulation Unit Math & Physics', () => {
    it('is strictly deterministic when called with the same seed and parameters', () => {
      const profile = STANDARD_PROFILES.JOB_BOARD;

      const run1 = simulateDay({
        publisher: profile,
        bid: 20,
        budget: 1000,
        rng: createMulberry32(12345),
        dayIndex: 5,
      });

      const run2 = simulateDay({
        publisher: profile,
        bid: 20,
        budget: 1000,
        rng: createMulberry32(12345),
        dayIndex: 5,
      });

      expect(run1).toEqual(run2);
      expect(run1.clicks).toBeGreaterThan(0);
      expect(run1.spend).toBeGreaterThan(0);
    });

    it('demonstrates monotonic budget to clicks with diminishing returns', () => {
      const profile = STANDARD_PROFILES.JOB_BOARD;

      // Fixed seed for zero noise discrepancy
      const res0 = simulateDay({
        publisher: profile,
        bid: 20,
        budget: 0,
        rng: createMulberry32(42),
        dayIndex: 0,
      });

      const res500 = simulateDay({
        publisher: profile,
        bid: 20,
        budget: 500,
        rng: createMulberry32(42),
        dayIndex: 0,
      });

      const res1000 = simulateDay({
        publisher: profile,
        bid: 20,
        budget: 1000,
        rng: createMulberry32(42),
        dayIndex: 0,
      });

      const res2000 = simulateDay({
        publisher: profile,
        bid: 20,
        budget: 2000,
        rng: createMulberry32(42),
        dayIndex: 0,
      });

      // 1. Monotonicity: higher budget gives more clicks
      expect(res0.clicks).toBe(0);
      expect(res500.clicks).toBeGreaterThan(0);
      expect(res1000.clicks).toBeGreaterThan(res500.clicks);
      expect(res2000.clicks).toBeGreaterThan(res1000.clicks);

      // 2. Diminishing returns: marginal clicks for first 1,000 budget > marginal clicks for next 1,000 budget
      const marginalFirst1000 = res1000.clicks - res0.clicks;
      const marginalSecond1000 = res2000.clicks - res1000.clicks;

      expect(marginalFirst1000).toBeGreaterThan(marginalSecond1000);
    });

    it('demonstrates bid effects: higher bid increases impressions and CPC', () => {
      const profile = STANDARD_PROFILES.JOB_BOARD;

      const lowBid = simulateDay({
        publisher: profile,
        bid: 10,
        budget: 1000,
        rng: createMulberry32(999),
        dayIndex: 0,
      });

      const highBid = simulateDay({
        publisher: profile,
        bid: 40,
        budget: 1000,
        rng: createMulberry32(999),
        dayIndex: 0,
      });

      // Higher bid yields higher impression auction win rate
      expect(highBid.impressions).toBeGreaterThan(lowBid.impressions);

      // Higher bid causes higher effective CPC (fewer clicks per budget rupee)
      const lowCpc = lowBid.spend / lowBid.clicks;
      const highCpc = highBid.spend / highBid.clicks;
      expect(highCpc).toBeGreaterThan(lowCpc);
    });

    it('demonstrates conversion drift: negative drift degrades conversion over days', () => {
      const socialProfile = STANDARD_PROFILES.SOCIAL; // has negative driftPerDay (-0.012)
      expect(socialProfile.driftPerDay).toBeLessThan(0);

      // Day 0
      const day0 = simulateDay({
        publisher: socialProfile,
        bid: 15,
        budget: 2000,
        rng: createMulberry32(777),
        dayIndex: 0,
      });

      // Day 30
      const day30 = simulateDay({
        publisher: socialProfile,
        bid: 15,
        budget: 2000,
        rng: createMulberry32(777),
        dayIndex: 30,
      });

      const convRateDay0 = day0.applications / day0.clicks;
      const convRateDay30 = day30.applications / day30.clicks;

      expect(convRateDay30).toBeLessThan(convRateDay0);
    });

    it('demonstrates conversion drift: positive drift improves conversion over days', () => {
      const aggProfile = STANDARD_PROFILES.AGGREGATOR; // has positive driftPerDay (+0.008)
      expect(aggProfile.driftPerDay).toBeGreaterThan(0);

      const day0 = simulateDay({
        publisher: aggProfile,
        bid: 15,
        budget: 2000,
        rng: createMulberry32(888),
        dayIndex: 0,
      });

      const day30 = simulateDay({
        publisher: aggProfile,
        bid: 15,
        budget: 2000,
        rng: createMulberry32(888),
        dayIndex: 30,
      });

      const convRateDay0 = day0.applications / day0.clicks;
      const convRateDay30 = day30.applications / day30.clicks;

      expect(convRateDay30).toBeGreaterThan(convRateDay0);
    });

    it('enforces strict funnel invariants: impressions >= clicks >= applications >= qualified >= interviews >= hires', () => {
      for (const prof of Object.values(STANDARD_PROFILES)) {
        const res = simulateDay({
          publisher: prof,
          bid: prof.baseCpc,
          budget: 1500,
          rng: createMulberry32(101),
          dayIndex: 3,
        });

        expect(res.impressions).toBeGreaterThanOrEqual(res.clicks);
        expect(res.clicks).toBeGreaterThanOrEqual(res.applications);
        expect(res.applications).toBeGreaterThanOrEqual(res.qualified);
        expect(res.qualified).toBeGreaterThanOrEqual(res.interviews);
        expect(res.interviews).toBeGreaterThanOrEqual(res.hires);
        expect(res.spend).toBeLessThanOrEqual(1500);
      }
    });

    it('retrieves publisher profiles by type or name gracefully', () => {
      expect(getPublisherProfile('JOB_BOARD').name).toBe('JobBoard Prime');
      expect(getPublisherProfile('SocialReach').type).toBe('SOCIAL');
      expect(getPublisherProfile('Unknown Channel').name).toBe('JobBoard Prime'); // fallback
    });
  });

  describe('POST /api/campaigns/:id/simulate Endpoint', () => {
    it('simulates 7 days of campaign events and spends with idempotent IDs', async () => {
      const res = await request(app)
        .post(`/api/campaigns/${campaignId}/simulate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          days: 7,
          seed: 42,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.campaignId).toBe(campaignId);
      expect(res.body.data.days).toBe(7);
      expect(res.body.data.eventsCreated).toBeGreaterThan(0);
      expect(res.body.data.spendsCreated).toBe(14); // 7 days * 2 publishers
      expect(res.body.data.totalImpressions).toBeGreaterThan(0);
      expect(res.body.data.totalClicks).toBeGreaterThan(0);
      expect(res.body.data.totalApplications).toBeGreaterThan(0);
      expect(res.body.data.totalSpend).toBeGreaterThan(0);

      // Verify records written to PostgreSQL
      const eventCount = await testPrisma.campaignEvent.count({
        where: { campaignId },
      });
      expect(eventCount).toBeGreaterThan(0);

      const spendCount = await testPrisma.campaignSpend.count({
        where: { campaignId },
      });
      expect(spendCount).toBe(14);
    });

    it('re-running simulation with the same seed is completely idempotent', async () => {
      const res = await request(app)
        .post(`/api/campaigns/${campaignId}/simulate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          days: 7,
          seed: 42,
        });

      expect(res.status).toBe(200);

      // Count remains 14 spends (upserted without duplicates)
      const spendCount = await testPrisma.campaignSpend.count({
        where: { campaignId },
      });
      expect(spendCount).toBe(14);
    });

    it('blocks ANALYST role from triggering simulation (RBAC check)', async () => {
      const res = await request(app)
        .post(`/api/campaigns/${campaignId}/simulate`)
        .set('Authorization', `Bearer ${analystToken}`)
        .send({
          days: 7,
        });

      expect(res.status).toBe(403);
    });

    it('returns 404 for non-existent campaign', async () => {
      const res = await request(app)
        .post('/api/campaigns/00000000-0000-0000-0000-000000000000/simulate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          days: 7,
        });

      expect(res.status).toBe(404);
    });
  });
});
