import request from 'supertest';
import { createApp } from '../src/app';
import { truncateAllTables } from './helpers/db';

const app = createApp();

describe('Analytics Engine Integration Tests', () => {
  let adminToken: string;
  let analystToken: string;
  let jobId: string;
  let publisherId: string;
  let campaignId: string;

  beforeEach(async () => {
    await truncateAllTables();

    // 1. Register main org & admin
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        organizationName: 'Analytics Corp',
        name: 'Admin User',
        email: 'admin@analyticscorp.com',
        password: 'Password123!',
      });
    adminToken = regRes.body.data.accessToken;

    // 2. Create analyst user
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Analyst User',
        email: 'analyst@analyticscorp.com',
        password: 'Password123!',
        role: 'ANALYST',
      });
    const anaLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'analyst@analyticscorp.com', password: 'Password123!' });
    analystToken = anaLogin.body.data.accessToken;

    // 3. Create job
    const jobRes = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Data Platform Engineer',
        description: 'Lead analytics data architecture',
        category: 'Data',
        location: 'Remote',
        requiredSkills: ['python', 'sql', 'spark'],
      });
    jobId = jobRes.body.data.id;

    // 4. Create publisher
    const pubRes = await request(app)
      .post('/api/publishers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'JobBoard Alpha',
        type: 'JOB_BOARD',
      });
    publisherId = pubRes.body.data.id;

    // 5. Create campaign
    const campRes = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        jobId,
        name: 'Hiring Sprint Q4',
        budget: 50000,
        startDate: new Date(Date.now() - 15 * 86400000).toISOString(),
        allocations: [
          {
            publisherId,
            allocationPct: 100,
            bidCpc: 20,
            dailyBudget: 1000,
          },
        ],
      });
    campaignId = campRes.body.data.id;

    // 6. Ingest events: impressions, clicks, applications, hires
    const now = new Date();
    await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        events: [
          {
            eventId: 'evt-ana-imp-1',
            campaignId,
            publisherId,
            eventType: 'IMPRESSION',
            timestamp: now.toISOString(),
            quantity: 500,
          },
          {
            eventId: 'evt-ana-clk-1',
            campaignId,
            publisherId,
            eventType: 'CLICK',
            timestamp: now.toISOString(),
            quantity: 50,
          },
          {
            eventId: 'evt-ana-app-1',
            campaignId,
            publisherId,
            eventType: 'APPLICATION',
            timestamp: now.toISOString(),
            quantity: 10,
            qualifiedQuantity: 6,
          },
          {
            eventId: 'evt-ana-hire-1',
            campaignId,
            publisherId,
            eventType: 'HIRE',
            timestamp: now.toISOString(),
            quantity: 2,
          },
        ],
      });

    // 7. Record daily spend
    await request(app)
      .post(`/api/campaigns/${campaignId}/spend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        publisherId,
        date: now.toISOString().split('T')[0],
        amount: 1000,
      });
  });

  describe('GET /api/analytics/overview', () => {
    it('returns aggregated metrics, spend, CPA, CPH, and deltas for Analyst', async () => {
      const res = await request(app)
        .get('/api/analytics/overview')
        .set('Authorization', `Bearer ${analystToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();

      const { totals } = res.body.data;
      expect(totals.jobs).toBe(1);
      expect(totals.impressions).toBe(500);
      expect(totals.clicks).toBe(50);
      expect(totals.applications).toBe(10);
      expect(totals.hires).toBe(2);
      expect(totals.spend).toBe(1000);

      // Verify CTR: 50 / 500 = 0.1
      expect(totals.ctr).toBe(0.1);
      // Verify CPA: 1000 / 10 = 100
      expect(totals.cpa).toBe(100);
      // Verify CPH: 1000 / 2 = 500
      expect(totals.cph).toBe(500);
      // Verify conversion rate: 2 / 10 = 0.2
      expect(totals.conversionRate).toBe(0.2);
    });
  });

  describe('GET /api/analytics/funnel', () => {
    it('returns 7-stage funnel counts and conversion rates', async () => {
      const res = await request(app)
        .get('/api/analytics/funnel')
        .set('Authorization', `Bearer ${analystToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(7);

      const [imp, clk, , appStage, qual, , hire] = res.body.data;
      expect(imp.stage).toBe('Impressions');
      expect(imp.count).toBe(500);

      expect(clk.stage).toBe('Clicks');
      expect(clk.count).toBe(50);
      expect(clk.conversionRate).toBe(10); // 50 / 500 = 10%

      expect(appStage.stage).toBe('Applications');
      expect(appStage.count).toBe(10);

      expect(qual.stage).toBe('Qualified Applications');
      expect(qual.count).toBe(6);

      expect(hire.stage).toBe('Hires');
      expect(hire.count).toBe(2);
    });
  });

  describe('GET /api/analytics/timeseries', () => {
    it('returns daily time-series points including clicks and spend', async () => {
      const res = await request(app)
        .get('/api/analytics/timeseries')
        .set('Authorization', `Bearer ${analystToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);

      const todayKey = new Date().toISOString().split('T')[0];
      const todayPoint = res.body.data.find((p: { date: string }) => p.date === todayKey);
      expect(todayPoint).toBeDefined();
      expect(todayPoint.impressions).toBe(500);
      expect(todayPoint.clicks).toBe(50);
      expect(todayPoint.spend).toBe(1000);
    });
  });

  describe('GET /api/analytics/publishers', () => {
    it('returns publisher-level breakdown with CPC, CPA, and CPH', async () => {
      const res = await request(app)
        .get('/api/analytics/publishers')
        .set('Authorization', `Bearer ${analystToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);

      const pub = res.body.data[0];
      expect(pub.publisherName).toBe('JobBoard Alpha');
      expect(pub.impressions).toBe(500);
      expect(pub.clicks).toBe(50);
      expect(pub.applications).toBe(10);
      expect(pub.spend).toBe(1000);
      expect(pub.cpc).toBe(20); // 1000 / 50 = 20
      expect(pub.cpa).toBe(100); // 1000 / 10 = 100
    });
  });

  describe('GET /api/analytics/campaigns', () => {
    it('returns campaign-level breakdown with budget, spend, and CPA', async () => {
      const res = await request(app)
        .get('/api/analytics/campaigns')
        .set('Authorization', `Bearer ${analystToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);

      const camp = res.body.data[0];
      expect(camp.campaignName).toBe('Hiring Sprint Q4');
      expect(camp.budget).toBe(50000);
      expect(camp.spend).toBe(1000);
      expect(camp.cpa).toBe(100);
    });
  });

  describe('Tenant Isolation', () => {
    it('ensures another organization cannot access analytics', async () => {
      const reg2 = await request(app)
        .post('/api/auth/register')
        .send({
          organizationName: 'Other Org',
          name: 'Other Admin',
          email: 'admin@otheranalytics.com',
          password: 'Password123!',
        });
      const org2Token = reg2.body.data.accessToken;

      const res = await request(app)
        .get('/api/analytics/overview')
        .set('Authorization', `Bearer ${org2Token}`);

      expect(res.status).toBe(200);
      // Other organization should see 0 jobs, 0 spend, 0 events
      expect(res.body.data.totals.jobs).toBe(0);
      expect(res.body.data.totals.spend).toBe(0);
      expect(res.body.data.totals.applications).toBe(0);
    });
  });
});
