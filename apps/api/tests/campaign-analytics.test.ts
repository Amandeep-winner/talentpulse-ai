import request from 'supertest';
import { createApp } from '../src/app';
import { testPrisma, truncateAllTables } from './helpers/db';

const app = createApp();

describe('Campaign Analytics & Publisher Performance with Trend Deltas (Task 18)', () => {
  let analystToken: string;
  let orgId: string;
  let jobAId: string;
  let jobBId: string;
  let publisherAId: string;
  let publisherBId: string;
  let campaignAId: string;
  let campaignBId: string;

  beforeAll(async () => {
    await truncateAllTables();

    // 1. Register main org & admin
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        organizationName: 'Campaign Analytics Org',
        name: 'Analytics Admin',
        email: 'admin@camp-analytics.com',
        password: 'Password123!',
      });
    orgId = regRes.body.data.user.organizationId;

    // 2. Create analyst user
    const analystUser = await testPrisma.user.create({
      data: {
        organizationId: orgId,
        name: 'Analytics Analyst',
        email: 'analyst@camp-analytics.com',
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

    // 3. Create two jobs
    const jobA = await testPrisma.job.create({
      data: {
        organizationId: orgId,
        title: 'Backend Scalability Engineer',
        description: 'Distributed systems and Go',
        category: 'Engineering',
        location: 'Remote',
      },
    });
    jobAId = jobA.id;

    const jobB = await testPrisma.job.create({
      data: {
        organizationId: orgId,
        title: 'Lead Frontend Architect',
        description: 'Next.js and WebGL',
        category: 'Engineering',
        location: 'Bengaluru',
      },
    });
    jobBId = jobB.id;

    // 4. Create two publishers
    const pubA = await testPrisma.publisher.create({
      data: {
        organizationId: orgId,
        name: 'JobBoard Alpha',
        type: 'JOB_BOARD',
      },
    });
    publisherAId = pubA.id;

    const pubB = await testPrisma.publisher.create({
      data: {
        organizationId: orgId,
        name: 'Social Beta',
        type: 'SOCIAL',
      },
    });
    publisherBId = pubB.id;

    // 5. Create two campaigns
    const campA = await testPrisma.campaign.create({
      data: {
        organizationId: orgId,
        jobId: jobAId,
        name: 'Backend Growth Sprint',
        budget: 50000,
        status: 'ACTIVE',
        startDate: new Date(Date.now() - 30 * 86400000),
      },
    });
    campaignAId = campA.id;

    const campB = await testPrisma.campaign.create({
      data: {
        organizationId: orgId,
        jobId: jobBId,
        name: 'Frontend Growth Sprint',
        budget: 40000,
        status: 'ACTIVE',
        startDate: new Date(Date.now() - 30 * 86400000),
      },
    });
    campaignBId = campB.id;
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  describe('Empty Data Handling', () => {
    it('returns 200 with zero metrics, null rates/CPAs, null trends, and empty funnel when no events exist in range', async () => {
      // Pick a future date range with 0 activity
      const futureFrom = new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0];
      const futureTo = new Date(Date.now() + 17 * 86400000).toISOString().split('T')[0];

      const res = await request(app)
        .get(`/api/analytics/publishers?from=${futureFrom}&to=${futureTo}`)
        .set('Authorization', `Bearer ${analystToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(2); // Both publishers present

      for (const pub of res.body.data) {
        expect(pub.impressions).toBe(0);
        expect(pub.clicks).toBe(0);
        expect(pub.applications).toBe(0);
        expect(pub.qualifiedApplications).toBe(0);
        expect(pub.spend).toBe(0);
        expect(pub.ctr).toBeNull();
        expect(pub.cpc).toBeNull();
        expect(pub.cpa).toBeNull();
        expect(pub.cpqa).toBeNull();
        expect(pub.cph).toBeNull();
        expect(pub.rank).toBeDefined();
        expect(pub.trends).toBeDefined();
        expect(pub.trends.cpaDelta).toBeNull();
        expect(pub.funnel).toEqual({
          impressions: 0,
          clicks: 0,
          applications: 0,
          qualifiedApplications: 0,
          interviews: 0,
          hires: 0,
        });
      }
    });
  });

  describe('Trend Computation (Last 7d vs Prior 7d)', () => {
    it('accurately computes trend deltas comparing current 7d window against prior 7d window', async () => {
      const now = Date.now();
      const currentDay = (offsetDays: number) => new Date(now - offsetDays * 86400000);

      // Ingest events for Publisher A:
      // Prior period: 10 days ago (within [now - 14d, now - 7d])
      // Spend = 1000, Clicks = 50, Apps = 10 -> Prior CPA = 100
      await testPrisma.campaignSpend.create({
        data: {
          organizationId: orgId,
          campaignId: campaignAId,
          publisherId: publisherAId,
          date: currentDay(10),
          amount: 1000,
        },
      });

      await testPrisma.campaignEvent.createMany({
        data: [
          {
            eventId: 'trend-prior-a-imp',
            organizationId: orgId,
            campaignId: campaignAId,
            publisherId: publisherAId,
            eventType: 'IMPRESSION',
            quantity: 1000,
            timestamp: currentDay(10),
          },
          {
            eventId: 'trend-prior-a-clk',
            organizationId: orgId,
            campaignId: campaignAId,
            publisherId: publisherAId,
            eventType: 'CLICK',
            quantity: 50,
            timestamp: currentDay(10),
          },
          {
            eventId: 'trend-prior-a-app',
            organizationId: orgId,
            campaignId: campaignAId,
            publisherId: publisherAId,
            eventType: 'APPLICATION',
            quantity: 10,
            qualifiedQuantity: 5,
            timestamp: currentDay(10),
          },
        ],
      });

      // Current period: 3 days ago (within [now - 7d, now])
      // Spend = 1200, Clicks = 60, Apps = 10 -> Current CPA = 120 (CPA increased by +20%)
      await testPrisma.campaignSpend.create({
        data: {
          organizationId: orgId,
          campaignId: campaignAId,
          publisherId: publisherAId,
          date: currentDay(3),
          amount: 1200,
        },
      });

      await testPrisma.campaignEvent.createMany({
        data: [
          {
            eventId: 'trend-curr-a-imp',
            organizationId: orgId,
            campaignId: campaignAId,
            publisherId: publisherAId,
            eventType: 'IMPRESSION',
            quantity: 1500,
            timestamp: currentDay(3),
          },
          {
            eventId: 'trend-curr-a-clk',
            organizationId: orgId,
            campaignId: campaignAId,
            publisherId: publisherAId,
            eventType: 'CLICK',
            quantity: 60,
            timestamp: currentDay(3),
          },
          {
            eventId: 'trend-curr-a-app',
            organizationId: orgId,
            campaignId: campaignAId,
            publisherId: publisherAId,
            eventType: 'APPLICATION',
            quantity: 10,
            qualifiedQuantity: 8,
            timestamp: currentDay(3),
          },
        ],
      });

      const fromStr = currentDay(7).toISOString();
      const toStr = currentDay(0).toISOString();

      const res = await request(app)
        .get(`/api/analytics/publishers?from=${fromStr}&to=${toStr}&campaignId=${campaignAId}`)
        .set('Authorization', `Bearer ${analystToken}`);

      expect(res.status).toBe(200);
      const pubA = res.body.data.find((p: { publisherId: string }) => p.publisherId === publisherAId);
      expect(pubA).toBeDefined();

      // Current metrics
      expect(pubA.spend).toBe(1200);
      expect(pubA.clicks).toBe(60);
      expect(pubA.applications).toBe(10);
      expect(pubA.cpa).toBe(120); // 1200 / 10
      expect(pubA.cpqa).toBe(150); // 1200 / 8 = 150

      // Trend deltas:
      // CPA went from 100 to 120 -> +20%
      expect(pubA.trends.cpaDelta).toBeCloseTo(20, 1);
      // Spend went from 1000 to 1200 -> +20%
      expect(pubA.trends.spendDelta).toBeCloseTo(20, 1);
      // Clicks went from 50 to 60 -> +20%
      expect(pubA.trends.clicksDelta).toBeCloseTo(20, 1);
      // Impressions went from 1000 to 1500 -> +50%
      expect(pubA.trends.impressionsDelta).toBeCloseTo(50, 1);
    });
  });

  describe('Publisher Ranking Order', () => {
    it('ranks publishers strictly by CPA ascending (lowest acquisition cost receives rank 1)', async () => {
      const now = Date.now();
      const currentDay = (offsetDays: number) => new Date(now - offsetDays * 86400000);

      // Give Publisher B lower CPA (e.g. Spend = 600, Apps = 10 -> CPA = 60)
      await testPrisma.campaignSpend.create({
        data: {
          organizationId: orgId,
          campaignId: campaignAId,
          publisherId: publisherBId,
          date: currentDay(2),
          amount: 600,
        },
      });

      await testPrisma.campaignEvent.createMany({
        data: [
          {
            eventId: 'rank-curr-b-imp',
            organizationId: orgId,
            campaignId: campaignAId,
            publisherId: publisherBId,
            eventType: 'IMPRESSION',
            quantity: 800,
            timestamp: currentDay(2),
          },
          {
            eventId: 'rank-curr-b-clk',
            organizationId: orgId,
            campaignId: campaignAId,
            publisherId: publisherBId,
            eventType: 'CLICK',
            quantity: 40,
            timestamp: currentDay(2),
          },
          {
            eventId: 'rank-curr-b-app',
            organizationId: orgId,
            campaignId: campaignAId,
            publisherId: publisherBId,
            eventType: 'APPLICATION',
            quantity: 10,
            qualifiedQuantity: 7,
            timestamp: currentDay(2),
          },
        ],
      });

      const fromStr = currentDay(7).toISOString();
      const toStr = currentDay(0).toISOString();

      const res = await request(app)
        .get(`/api/analytics/publishers?from=${fromStr}&to=${toStr}&campaignId=${campaignAId}`)
        .set('Authorization', `Bearer ${analystToken}`);

      expect(res.status).toBe(200);
      const list = res.body.data;

      // Publisher B has CPA 60, Publisher A has CPA 120
      expect(list[0].publisherId).toBe(publisherBId);
      expect(list[0].cpa).toBe(60);
      expect(list[0].rank).toBe(1);

      expect(list[1].publisherId).toBe(publisherAId);
      expect(list[1].cpa).toBe(120);
      expect(list[1].rank).toBe(2);
    });
  });

  describe('Campaign-specific Filter Isolation', () => {
    it('isolates publisher performance to the requested campaignId', async () => {
      const now = Date.now();
      const currentDay = (offsetDays: number) => new Date(now - offsetDays * 86400000);

      // Add spend and events to Campaign B
      await testPrisma.campaignSpend.create({
        data: {
          organizationId: orgId,
          campaignId: campaignBId,
          publisherId: publisherAId,
          date: currentDay(1),
          amount: 5000,
        },
      });

      await testPrisma.campaignEvent.create({
        data: {
          eventId: 'camp-b-isolate-app',
          organizationId: orgId,
          campaignId: campaignBId,
          publisherId: publisherAId,
          eventType: 'APPLICATION',
          quantity: 25,
          qualifiedQuantity: 20,
          timestamp: currentDay(1),
        },
      });

      const fromStr = currentDay(7).toISOString();
      const toStr = currentDay(0).toISOString();

      // Query specifically for Campaign A
      const resA = await request(app)
        .get(`/api/analytics/publishers?from=${fromStr}&to=${toStr}&campaignId=${campaignAId}`)
        .set('Authorization', `Bearer ${analystToken}`);

      const pubAInCampA = resA.body.data.find(
        (p: { publisherId: string }) => p.publisherId === publisherAId
      );
      // Campaign A spend should NOT include the 5000 from Campaign B
      expect(pubAInCampA.spend).toBe(1200);
      expect(pubAInCampA.applications).toBe(10);

      // Query specifically for Campaign B
      const resB = await request(app)
        .get(`/api/analytics/publishers?from=${fromStr}&to=${toStr}&campaignId=${campaignBId}`)
        .set('Authorization', `Bearer ${analystToken}`);

      const pubAInCampB = resB.body.data.find(
        (p: { publisherId: string }) => p.publisherId === publisherAId
      );
      expect(pubAInCampB.spend).toBe(5000);
      expect(pubAInCampB.applications).toBe(25);
    });
  });
});
