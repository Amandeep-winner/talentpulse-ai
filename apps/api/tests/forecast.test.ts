import request from 'supertest';
import { randomUUID } from 'crypto';
import { createApp } from '../src/app';
import { testPrisma, truncateAllTables } from './helpers/db';
import { forecastService } from '../src/modules/forecast/forecast.service';
import { mlClient } from '../src/modules/ml/ml.client';

const app = createApp();

describe('Forecasting Module & Service Tests', () => {
  let adminToken: string;
  let organizationId: string;
  let campaignId: string;

  beforeEach(async () => {
    await truncateAllTables();
    mlClient.resetCircuit();

    // 1. Register organization and ADMIN
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        organizationName: 'Forecast Corp',
        name: 'Forecast Admin',
        email: 'admin@forecast.com',
        password: 'Password123!',
      });
    adminToken = regRes.body.data.accessToken;

    const user = await testPrisma.user.findUniqueOrThrow({
      where: { email: 'admin@forecast.com' },
    });
    organizationId = user.organizationId;

    // 2. Create Job
    const job = await testPrisma.job.create({
      data: {
        organizationId,
        title: 'Senior Time Series Specialist',
        description: 'Forecasting pipelines and ML models',
        category: 'ENGINEERING',
        location: 'Remote',
        minExperienceYears: 4,
        salaryMin: 120000,
        salaryMax: 160000,
        requiredSkills: ['Python', 'Statsmodels'],
      },
    });

    // 3. Create Publisher
    const publisher = await testPrisma.publisher.create({
      data: {
        organizationId,
        name: 'TechJobs Network',
        type: 'JOB_BOARD',
      },
    });

    // 4. Create Campaign
    const campaign = await testPrisma.campaign.create({
      data: {
        organizationId,
        jobId: job.id,
        name: 'Hiring Sprint Q1',
        budget: 3000,
        status: 'ACTIVE',
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        publishers: {
          create: [
            {
              publisherId: publisher.id,
              allocationPct: 100,
              dailyBudget: 100,
              bidCpc: 2.0,
            },
          ],
        },
      },
    });
    campaignId = campaign.id;

    // 5. Seed historical campaign events and spends across the past 14 days
    const now = new Date();
    for (let i = 0; i < 14; i++) {
      const eventDate = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      await testPrisma.campaignEvent.create({
        data: {
          eventId: randomUUID(),
          organizationId,
          campaignId: campaign.id,
          publisherId: publisher.id,
          eventType: 'APPLICATION',
          quantity: 5 + (i % 3),
          qualifiedQuantity: 2,
          timestamp: eventDate,
        },
      });

      await testPrisma.campaignSpend.create({
        data: {
          organizationId,
          campaignId: campaign.id,
          publisherId: publisher.id,
          amount: 50.0 + i * 5,
          date: eventDate,
        },
      });
    }
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  describe('Zero-filled Series Builder Unit Tests', () => {
    it('generates a contiguous 35-day series with zero-filling for gaps', async () => {
      const { series, campaignName } = await forecastService.buildZeroFilledSeries(
        organizationId,
        'applications',
        campaignId
      );

      expect(series).toBeDefined();
      expect(series.length).toBe(35);
      expect(campaignName).toBe('Hiring Sprint Q1');

      // Verify dates are sorted ascending
      for (let i = 1; i < series.length; i++) {
        expect(series[i]!.date > series[i - 1]!.date).toBe(true);
      }

      // Verify that days with seeded events have values > 0
      const positivePoints = series.filter((p) => p.value > 0);
      expect(positivePoints.length).toBeGreaterThanOrEqual(10);

      // Verify older unseeded days are correctly zero-filled
      const zeroPoints = series.filter((p) => p.value === 0);
      expect(zeroPoints.length).toBeGreaterThan(0);
    });

    it('correctly aggregates spend metric across daily spend records', async () => {
      const { series } = await forecastService.buildZeroFilledSeries(
        organizationId,
        'spend',
        campaignId
      );

      expect(series.length).toBe(35);
      const totalSpend = series.reduce((acc, p) => acc + p.value, 0);
      expect(totalSpend).toBeGreaterThan(500);
    });
  });

  describe('Moving Average Fallback Logic', () => {
    it('computes valid forecast points with monotonic confidence bounds and backtest metrics', () => {
      const mockSeries = Array.from({ length: 35 }, (_, i) => ({
        date: `2026-01-${String(i + 1).padStart(2, '0')}`,
        value: 10 + (i % 5),
      }));

      const fallback = forecastService.computeMovingAverageFallback(mockSeries, 7);

      expect(fallback.forecast.length).toBe(7);
      for (const item of fallback.forecast) {
        expect(item.value).toBeGreaterThan(0);
        expect(item.lower).toBeLessThanOrEqual(item.value);
        expect(item.upper).toBeGreaterThanOrEqual(item.value);
        expect(item.lower).toBeGreaterThanOrEqual(0);
      }

      expect(fallback.backtest.mae).toBeGreaterThanOrEqual(0);
      expect(fallback.backtest.rmse).toBeGreaterThanOrEqual(0);
      expect(fallback.backtest.mape).toBeGreaterThanOrEqual(0);
      expect(fallback.backtest.baselineMae).toBeGreaterThanOrEqual(0);
    });
  });

  describe('ML Client Integration & Fallback', () => {
    it('uses ML microservice response when available', async () => {
      const forecastSpy = jest.spyOn(mlClient, 'forecast').mockResolvedValueOnce({
        forecast: [
          { date: '2026-03-01', value: 12.0, lower: 9.0, upper: 15.0 },
          { date: '2026-03-02', value: 14.0, lower: 10.5, upper: 17.5 },
          { date: '2026-03-03', value: 16.0, lower: 12.0, upper: 20.0 },
          { date: '2026-03-04', value: 15.0, lower: 11.0, upper: 19.0 },
          { date: '2026-03-05', value: 13.0, lower: 9.5, upper: 16.5 },
          { date: '2026-03-06', value: 6.0, lower: 3.5, upper: 8.5 },
          { date: '2026-03-07', value: 5.0, lower: 2.5, upper: 7.5 },
        ],
        method: 'holt_winters',
        backtest: {
          mae: 1.15,
          rmse: 1.45,
          mape: 0.09,
          baselineMae: 2.85,
        },
      });

      const res = await forecastService.getForecast(organizationId, {
        metric: 'applications',
        horizon: 7,
        campaignId,
      });

      expect(forecastSpy).toHaveBeenCalled();
      expect(res.method).toBe('holt_winters');
      expect(res.forecast.length).toBe(7);
      expect(res.backtest.mae).toBe(1.15);
      expect(res.insight.expectedTotalNext7d).toBe(81);
    });

    it('gracefully falls back to fallback_moving_average when ML service fails', async () => {
      jest.spyOn(mlClient, 'forecast').mockRejectedValueOnce(new Error('Connection timeout to ML service'));

      const res = await forecastService.getForecast(organizationId, {
        metric: 'applications',
        horizon: 7,
        campaignId,
      });

      expect(res.method).toBe('fallback_moving_average');
      expect(res.forecast.length).toBe(7);
      expect(res.backtest).toBeDefined();
      expect(res.insight).toBeDefined();
    });

    it('triggers shortfall alert and creates a FORECAST_ALERT recommendation when pacing falls below target', async () => {
      // Mock a low forecast (e.g. total 14 applications next 7d, while target pace for $3000 budget is 28)
      jest.spyOn(mlClient, 'forecast').mockResolvedValueOnce({
        forecast: Array.from({ length: 7 }, (_, i) => ({
          date: `2026-03-0${i + 1}`,
          value: 2.0,
          lower: 1.0,
          upper: 3.0,
        })),
        method: 'holt_winters',
        backtest: { mae: 0.5, rmse: 0.6, mape: 0.1, baselineMae: 1.2 },
      });

      const res = await forecastService.getForecast(organizationId, {
        metric: 'applications',
        horizon: 7,
        campaignId,
      });

      expect(res.insight.shortfallAlert).toBe(true);
      expect(res.recommendationId).toBeDefined();

      // Verify recommendation row persisted in database
      const rec = await testPrisma.recommendation.findUnique({
        where: { id: res.recommendationId },
      });
      expect(rec).toBeDefined();
      expect(rec?.type).toBe('FORECAST_ALERT');
      expect(rec?.status).toBe('PROPOSED');
    });
  });

  describe('GET /api/forecast HTTP Route', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/forecast');
      expect(res.status).toBe(401);
    });

    it('rejects invalid query parameters with 400', async () => {
      const res = await request(app)
        .get('/api/forecast?horizon=99')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 200 with forecast data for valid authenticated query', async () => {
      const res = await request(app)
        .get(`/api/forecast?metric=applications&horizon=7&campaignId=${campaignId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data;

      expect(data.metric).toBe('applications');
      expect(data.horizon).toBe(7);
      expect(data.campaignId).toBe(campaignId);
      expect(data.campaignName).toBe('Hiring Sprint Q1');
      expect(data.history.length).toBe(35);
      expect(data.forecast.length).toBe(7);
      expect(data.method).toBeDefined();
      expect(data.backtest).toBeDefined();
      expect(data.insight).toBeDefined();
    });

    it('handles metric switching (spend)', async () => {
      const res = await request(app)
        .get(`/api/forecast?metric=spend&horizon=14&campaignId=${campaignId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.metric).toBe('spend');
      expect(res.body.data.horizon).toBe(14);
      expect(res.body.data.forecast.length).toBe(14);
    });
  });
});
