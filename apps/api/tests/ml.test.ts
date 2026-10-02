import request from 'supertest';
import { createApp } from '../src/app';
import { testPrisma, truncateAllTables } from './helpers/db';
import { MlClient, MlServiceError, mlClient } from '../src/modules/ml/ml.client';

const app = createApp();

describe('ML Module & Client Tests', () => {
  describe('MlClient Circuit Breaker & Retry Unit Tests', () => {
    let originalFetch: typeof global.fetch;

    beforeEach(() => {
      originalFetch = global.fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('retries up to maxRetries on network failure and succeeds if subsequent attempt succeeds', async () => {
      let callCount = 0;
      global.fetch = jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Network timeout');
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'ok' }),
        };
      });

      const client = new MlClient('http://mock-ml:8000', 'mock-token', 1000, 2);
      const isHealthy = await client.isHealthy();

      expect(isHealthy).toBe(true);
      expect(callCount).toBe(2);
      expect(client.getCircuitStatus().status).toBe('CLOSED');
    });

    it('trips circuit breaker to OPEN after 3 consecutive failures and blocks further requests', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Connection refused'));

      const client = new MlClient('http://mock-ml:8000', 'mock-token', 500, 0);

      // Attempt 1
      await expect(client.predict('fill_prob', {})).rejects.toThrow(MlServiceError);
      expect(client.getCircuitStatus().failures).toBe(1);
      expect(client.getCircuitStatus().status).toBe('CLOSED');

      // Attempt 2
      await expect(client.predict('fill_prob', {})).rejects.toThrow(MlServiceError);
      expect(client.getCircuitStatus().failures).toBe(2);
      expect(client.getCircuitStatus().status).toBe('CLOSED');

      // Attempt 3: trips to OPEN
      await expect(client.predict('fill_prob', {})).rejects.toThrow(MlServiceError);
      expect(client.getCircuitStatus().failures).toBe(3);
      expect(client.getCircuitStatus().status).toBe('OPEN');

      // Attempt 4: Should immediately reject without calling fetch
      const fetchCallsBefore = (global.fetch as jest.Mock).mock.calls.length;
      await expect(client.predict('fill_prob', {})).rejects.toThrow(/circuit open/);
      expect((global.fetch as jest.Mock).mock.calls.length).toBe(fetchCallsBefore);

      // Reset circuit
      client.resetCircuit();
      expect(client.getCircuitStatus().status).toBe('CLOSED');
      expect(client.getCircuitStatus().failures).toBe(0);
    });

    it('does not retry on 4xx client errors (e.g. 400 Bad Request)', async () => {
      let callCount = 0;
      global.fetch = jest.fn().mockImplementation(async () => {
        callCount++;
        return {
          ok: false,
          status: 400,
          text: async () => 'Missing required feature',
        };
      });

      const client = new MlClient('http://mock-ml:8000', 'mock-token', 1000, 2);
      await expect(client.predict('application_prob', {})).rejects.toThrow(/400/);
      expect(callCount).toBe(1);
    });
  });

  describe('ML API Routes & Heuristic Fallbacks', () => {
    let adminToken: string;
    let recruiterToken: string;
    let testJobId: string;

    beforeEach(async () => {
      await truncateAllTables();
      mlClient.resetCircuit();

      // Register organization and ADMIN
      const regRes = await request(app)
        .post('/api/auth/register')
        .send({
          organizationName: 'Predictive Corp',
          name: 'ML Admin',
          email: 'admin@predictive.com',
          password: 'Password123!',
        });
      adminToken = regRes.body.data.accessToken;

      // Create RECRUITER
      await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'ML Recruiter',
          email: 'recruiter@predictive.com',
          password: 'Password123!',
          role: 'RECRUITER',
        });
      const recLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'recruiter@predictive.com', password: 'Password123!' });
      recruiterToken = recLogin.body.data.accessToken;

      // Create a test Job
      const jobRes = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Senior ML Engineer',
          description: 'Build predictive AI systems',
          category: 'ENGINEERING',
          location: 'San Francisco, CA',
          minExperienceYears: 5,
          salaryMin: 140000,
          salaryMax: 190000,
          requiredSkills: ['Python', 'PyTorch', 'FastAPI'],
        });
      testJobId = jobRes.body.data.id;
    });

    afterAll(async () => {
      await testPrisma.$disconnect();
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/ml/models');
      expect(res.status).toBe(401);

      const predRes = await request(app).post('/api/ml/predict/fill').send({ jobId: testJobId });
      expect(predRes.status).toBe(401);
    });

    it('rejects non-admin role when attempting model training (403)', async () => {
      const res = await request(app)
        .post('/api/ml/train')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ model: 'application_prob' });

      expect(res.status).toBe(403);
    });

    it('validates training request payload schema', async () => {
      const res = await request(app)
        .post('/api/ml/train')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ model: 'invalid_model_name' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns application prediction with graceful heuristic fallback when ML service is offline', async () => {
      const res = await request(app)
        .post('/api/ml/predict/application')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({
          jobCategory: 'engineering',
          experienceReq: 5,
          locationTier: 'remote',
          publisherType: 'job_board',
          historicalCtr: 0.045,
          historicalCpa: 120,
          historicalConv: 0.18,
          dayOfWeek: 2,
          bid: 2.5,
          budget: 1500,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.data.probability).toBe('number');
      expect(res.body.data.probability).toBeGreaterThan(0);
      expect(res.body.data.probability).toBeLessThanOrEqual(1);
      expect(res.body.data.modelVersion).toBeDefined();
      expect(Array.isArray(res.body.data.topFactors)).toBe(true);
    });

    it('returns 45-day fill probability and risk score for a requisition with fallback', async () => {
      const res = await request(app)
        .post('/api/ml/predict/fill')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({
          jobId: testJobId,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.jobId).toBe(testJobId);
      expect(typeof res.body.data.probability).toBe('number');
      expect(['High', 'Medium', 'Low']).toContain(res.body.data.risk);
      expect(Array.isArray(res.body.data.topFactors)).toBe(true);
    });

    it('lists registered models and active versions', async () => {
      const res = await request(app)
        .get('/api/ml/models')
        .set('Authorization', `Bearer ${recruiterToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('activeModels');
      expect(res.body.data).toHaveProperty('allVersions');
      expect(res.body.data).toHaveProperty('serviceAvailable');
    });

    it('successfully trains and registers model when ML service responds', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          model: 'application_prob',
          version: '20261002_test',
          metrics: { roc_auc: 0.74, precision: 0.71, recall: 0.68, f1: 0.69 },
          trainingRows: 100,
          trainedAt: new Date().toISOString(),
          isActive: true,
        }),
      });

      try {
        const res = await request(app)
          .post('/api/ml/train')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ model: 'application_prob' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.version).toBe('20261002_test');
        expect(res.body.data.metrics.roc_auc).toBe(0.74);

        // Verify persisted in PostgreSQL
        const savedVersion = await testPrisma.modelVersion.findUnique({
          where: {
            name_version: {
              name: 'application_prob',
              version: '20261002_test',
            },
          },
        });
        expect(savedVersion).not.toBeNull();
        expect(savedVersion?.isActive).toBe(true);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});
