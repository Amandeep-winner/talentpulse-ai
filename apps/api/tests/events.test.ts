import request from 'supertest';
import { createApp } from '../src/app';
import { truncateAllTables } from './helpers/db';

const app = createApp();

describe('Events and Campaigns Module Integration Tests', () => {
  let adminToken: string;
  let recruiterToken: string;
  let apiKey: string;
  let jobId: string;
  let publisherId1: string;
  let publisherId2: string;
  let campaignId: string;

  beforeEach(async () => {
    await truncateAllTables();

    // 1. Register main org & admin
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        organizationName: 'Events Corp',
        name: 'Admin User',
        email: 'admin@eventscorp.com',
        password: 'Password123!',
      });
    adminToken = regRes.body.data.accessToken;

    // 2. Create recruiter user
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Recruiter User',
        email: 'recruiter@eventscorp.com',
        password: 'Password123!',
        role: 'RECRUITER',
      });
    const recLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'recruiter@eventscorp.com', password: 'Password123!' });
    recruiterToken = recLogin.body.data.accessToken;

    // 3. Create API Key for programmatic ingestion
    const keyRes = await request(app)
      .post('/api/api-keys')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Ingestion Key' });
    apiKey = keyRes.body.data.plaintextKey;

    // 4. Create sample job
    const jobRes = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${recruiterToken}`)
      .send({
        title: 'Backend Engineer',
        description: 'Design distributed event systems',
        category: 'Engineering',
        location: 'Remote',
        remote: true,
        requiredSkills: ['nodejs', 'postgresql', 'kafka'],
      });
    jobId = jobRes.body.data.id;

    // 5. Create 2 publishers
    const pub1Res = await request(app)
      .post('/api/publishers')
      .set('Authorization', `Bearer ${recruiterToken}`)
      .send({
        name: 'LinkedIn Jobs',
        type: 'JOB_BOARD',
      });
    publisherId1 = pub1Res.body.data.id;

    const pub2Res = await request(app)
      .post('/api/publishers')
      .set('Authorization', `Bearer ${recruiterToken}`)
      .send({
        name: 'Google Search Ads',
        type: 'SEARCH',
      });
    publisherId2 = pub2Res.body.data.id;

    // 6. Create campaign with initial 60/40 allocations
    const campRes = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${recruiterToken}`)
      .send({
        jobId,
        name: 'Q4 Engineering Hiring Campaign',
        budget: 10000,
        startDate: new Date().toISOString(),
        allocations: [
          {
            publisherId: publisherId1,
            allocationPct: 60,
            bidCpc: 2.5,
            dailyBudget: 200,
          },
          {
            publisherId: publisherId2,
            allocationPct: 40,
            bidCpc: 1.8,
            dailyBudget: 150,
          },
        ],
      });
    campaignId = campRes.body.data.id;
  });

  describe('Campaigns & Allocations', () => {
    it('should reject campaign creation if allocations do not sum to 100%', async () => {
      const res = await request(app)
        .post('/api/campaigns')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({
          jobId,
          name: 'Invalid Allocation Campaign',
          budget: 5000,
          startDate: new Date().toISOString(),
          allocations: [
            {
              publisherId: publisherId1,
              allocationPct: 50,
              bidCpc: 2.0,
              dailyBudget: 100,
            },
            {
              publisherId: publisherId2,
              allocationPct: 30, // Sum = 80%, not 100%
              bidCpc: 1.5,
              dailyBudget: 80,
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('allocations must sum to exactly 100%');
    });

    it('should update allocations and record spend per day', async () => {
      // 1. Update allocations to 70/30
      const putRes = await request(app)
        .put(`/api/campaigns/${campaignId}/allocations`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({
          allocations: [
            {
              publisherId: publisherId1,
              allocationPct: 70,
              bidCpc: 3.0,
              dailyBudget: 250,
            },
            {
              publisherId: publisherId2,
              allocationPct: 30,
              bidCpc: 1.5,
              dailyBudget: 100,
            },
          ],
        });
      expect(putRes.status).toBe(200);
      expect(putRes.body.data.length).toBe(2);

      // 2. Record daily spend
      const spendRes = await request(app)
        .post(`/api/campaigns/${campaignId}/spend`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({
          publisherId: publisherId1,
          date: '2026-10-01',
          amount: 145.5,
        });
      expect(spendRes.status).toBe(200);
    });
  });

  describe('Events Ingestion & Idempotency', () => {
    it('should accept single event via API Key (x-api-key)', async () => {
      const res = await request(app)
        .post('/api/events')
        .set('x-api-key', apiKey)
        .send({
          eventId: 'evt-001',
          campaignId,
          publisherId: publisherId1,
          eventType: 'IMPRESSION',
          timestamp: new Date().toISOString(),
          quantity: 1,
        });

      expect(res.status).toBe(200);
      expect(res.body.accepted).toBe(1);
      expect(res.body.duplicates).toBe(0);
      expect(res.body.rejected).toHaveLength(0);
    });

    it('should perform idempotent replay and never double count identical eventId', async () => {
      const payload = {
        eventId: 'evt-repeat-01',
        campaignId,
        publisherId: publisherId1,
        eventType: 'CLICK',
        timestamp: new Date().toISOString(),
        quantity: 1,
      };

      // 1st delivery
      const firstRes = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send(payload);
      expect(firstRes.status).toBe(200);
      expect(firstRes.body.accepted).toBe(1);
      expect(firstRes.body.duplicates).toBe(0);

      // 2nd delivery (identical replay)
      const secondRes = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send(payload);
      expect(secondRes.status).toBe(200);
      expect(secondRes.body.accepted).toBe(0);
      expect(secondRes.body.duplicates).toBe(1);
      expect(secondRes.body.rejected).toHaveLength(0);
    });

    it('should handle batch partial rejection (funnel sanity & valid event)', async () => {
      const res = await request(app)
        .post('/api/events')
        .set('x-api-key', apiKey)
        .send({
          events: [
            {
              eventId: 'evt-batch-valid',
              campaignId,
              publisherId: publisherId1,
              eventType: 'APPLICATION',
              timestamp: new Date().toISOString(),
              quantity: 2,
              qualifiedQuantity: 1, // valid: qualifiedQuantity <= quantity
            },
            {
              eventId: 'evt-batch-invalid',
              campaignId,
              publisherId: publisherId1,
              eventType: 'APPLICATION',
              timestamp: new Date().toISOString(),
              quantity: 1,
              qualifiedQuantity: 3, // invalid: qualifiedQuantity > quantity
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.accepted).toBe(1);
      expect(res.body.rejected).toHaveLength(1);
      expect(res.body.rejected[0].eventId).toBe('evt-batch-invalid');
      expect(res.body.rejected[0].reason).toContain('qualifiedQuantity cannot exceed quantity');
    });

    it('should reject event referencing cross-organization campaignId', async () => {
      // Create another org and campaign
      const org2 = await request(app)
        .post('/api/auth/register')
        .send({
          organizationName: 'Org 2 Events',
          name: 'Org2 Admin',
          email: 'admin@org2events.com',
          password: 'Password123!',
        });
      const org2Token = org2.body.data.accessToken;

      const org2Job = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${org2Token}`)
        .send({
          title: 'Org2 Job',
          description: 'Testing cross org rejection',
          category: 'QA',
          location: 'Remote',
          requiredSkills: ['jest'],
        });

      const org2Camp = await request(app)
        .post('/api/campaigns')
        .set('Authorization', `Bearer ${org2Token}`)
        .send({
          jobId: org2Job.body.data.id,
          name: 'Org2 Campaign',
          budget: 5000,
          startDate: new Date().toISOString(),
        });

      // Try ingesting with main org's apiKey referencing Org2's campaignId
      const res = await request(app)
        .post('/api/events')
        .set('x-api-key', apiKey)
        .send({
          eventId: 'evt-cross-org',
          campaignId: org2Camp.body.data.id,
          publisherId: publisherId1,
          eventType: 'IMPRESSION',
          timestamp: new Date().toISOString(),
        });

      expect(res.status).toBe(200);
      expect(res.body.accepted).toBe(0);
      expect(res.body.rejected).toHaveLength(1);
      expect(res.body.rejected[0].reason).toContain('does not exist or belong to organization');
    });

    it('should handle concurrency safely: 50 parallel identical events results in exactly 1 row', async () => {
      const concurrentEventId = 'evt-concurrent-test-50';
      const payload = {
        eventId: concurrentEventId,
        campaignId,
        publisherId: publisherId1,
        eventType: 'IMPRESSION',
        timestamp: new Date().toISOString(),
        quantity: 1,
      };

      // Fire 50 requests in parallel
      const requests = Array.from({ length: 50 }, () =>
        request(app)
          .post('/api/events')
          .set('x-api-key', apiKey)
          .send(payload),
      );

      const responses = await Promise.all(requests);

      let totalAccepted = 0;
      let totalDuplicates = 0;

      for (const r of responses) {
        expect(r.status).toBe(200);
        totalAccepted += r.body.accepted;
        totalDuplicates += r.body.duplicates;
      }

      // Exactly 1 request accepted, 49 reported as duplicates
      expect(totalAccepted).toBe(1);
      expect(totalDuplicates).toBe(49);

      // Verify database has exactly 1 row
      const listRes = await request(app)
        .get('/api/events')
        .set('x-api-key', apiKey);

      const matching = listRes.body.data.filter((e: { eventId: string }) => e.eventId === concurrentEventId);
      expect(matching).toHaveLength(1);
    });
  });
});
