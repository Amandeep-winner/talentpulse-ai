import {
  ForecastMetric,
  ForecastResponse,
  ForecastSeriesPoint,
  ForecastItem,
  BacktestMetrics,
} from '@talentpulse/shared';
import { prisma } from '../../lib/prisma';
import { cached } from '../../lib/cache';
import { logger } from '../../lib/logger';
import { mlClient } from '../ml/ml.client';

export interface ForecastOptions {
  metric: ForecastMetric;
  horizon: number;
  campaignId?: string;
  userId?: string;
}

export class ForecastService {
  /**
   * Generates time-series forecast with backtesting metrics and shortfall alerts.
   * Caches in Redis for 5 minutes (300 seconds).
   */
  async getForecast(organizationId: string, options: ForecastOptions): Promise<ForecastResponse> {
    const { metric, horizon, campaignId, userId } = options;

    const cacheKey = {
      metric,
      horizon,
      campaignId: campaignId || 'all',
    };

    const cachedRes = await cached(organizationId, 'forecast', cacheKey, 300, async () => {
      // 1. Query zero-filled daily series from SQL (last 35 days to ensure >= 28 points)
      const { series, campaignName, campaignBudget } = await this.buildZeroFilledSeries(
        organizationId,
        metric,
        campaignId
      );

      // 2. Call ML microservice with API-side fallback if down
      let forecastItems: ForecastItem[];
      let method: string;
      let backtest: BacktestMetrics;

      try {
        const mlRes = await mlClient.forecast({
          series,
          horizon,
          metric,
        });
        forecastItems = mlRes.forecast;
        method = mlRes.method;
        backtest = mlRes.backtest;
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.warn({
          msg: 'ML service forecast call failed, using API-side moving average fallback',
          error: errorMsg,
        });

        const fallback = this.computeMovingAverageFallback(series, horizon);
        forecastItems = fallback.forecast;
        method = 'fallback_moving_average';
        backtest = fallback.backtest;
      }

      // 3. Compute deterministic insights: expected total, trend %, and shortfall alert
      const horizonDays = Math.min(horizon, forecastItems.length);
      const expectedTotalNext7d = forecastItems
        .slice(0, Math.min(7, horizonDays))
        .reduce((sum, item) => sum + item.value, 0);

      const actualLast7d = series
        .slice(-7)
        .reduce((sum, item) => sum + item.value, 0);

      const trendPctVsLast7d =
        ((expectedTotalNext7d - actualLast7d) / Math.max(actualLast7d, 1)) * 100;

      // Campaign target pace derivation (benchmarked at 25 per application default)
      let targetPace7d: number | undefined;
      let shortfallAlert = false;
      let recommendationId: string | undefined;

      if (metric === 'applications') {
        const benchmarkCpa = 25.0;
        let effectiveBudget = campaignBudget;

        if (!effectiveBudget) {
          // Aggregate active campaigns budget
          const activeCampaigns = await prisma.campaign.findMany({
            where: { organizationId, status: 'ACTIVE' },
            select: { budget: true },
          });
          effectiveBudget = activeCampaigns.reduce((sum, c) => sum + Number(c.budget), 0);
        }

        const totalExpectedTarget = (effectiveBudget || 5000) / benchmarkCpa;
        const dailyTargetPace = totalExpectedTarget / 30;
        targetPace7d = Math.round(dailyTargetPace * 7);

        if (expectedTotalNext7d < targetPace7d) {
          shortfallAlert = true;

          // Check if a recent FORECAST_ALERT was created in the last 24 hours
          const recentAlert = await prisma.recommendation.findFirst({
            where: {
              organizationId,
              type: 'FORECAST_ALERT',
              createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            },
          });

          if (!recentAlert) {
            const createdRec = await prisma.recommendation.create({
              data: {
                organizationId,
                userId: userId || null,
                type: 'FORECAST_ALERT',
                modelVersion: method,
                inputRef: {
                  metric,
                  horizon,
                  campaignId: campaignId || null,
                  targetPace7d,
                  expectedTotalNext7d: Number(expectedTotalNext7d.toFixed(1)),
                  actualLast7d: Number(actualLast7d.toFixed(1)),
                },
                decision: {
                  alert: 'APPLICATION_SHORTFALL_DETECTED',
                  shortfallUnits: Math.max(0, Number((targetPace7d - expectedTotalNext7d).toFixed(1))),
                  action: 'REALLOCATE_OR_INCREASE_BIDS',
                },
                explanation: {
                  summary: `Projected 7-day applications (${expectedTotalNext7d.toFixed(0)}) fall short of target pace (${targetPace7d}).`,
                  advice: 'Reallocate budget towards channels with higher conversion rates or increase bids to recover pacing.',
                },
                confidence: 0.85,
                status: 'PROPOSED',
              },
            });
            recommendationId = createdRec.id;
          } else {
            recommendationId = recentAlert.id;
          }
        }
      }

      const insightMessage = `Projected ${metric}: ${expectedTotalNext7d.toFixed(0)} over the next 7 days (${trendPctVsLast7d >= 0 ? '+' : ''}${trendPctVsLast7d.toFixed(1)}% vs prior 7 days). ${
        shortfallAlert
          ? `Shortfall alert: pacing below target pace of ${targetPace7d} applications.`
          : 'Pacing on track.'
      }`;

      const response: ForecastResponse = {
        metric,
        horizon,
        campaignId,
        campaignName,
        history: series,
        forecast: forecastItems,
        method,
        backtest,
        insight: {
          expectedTotalNext7d: Number(expectedTotalNext7d.toFixed(2)),
          actualLast7d: Number(actualLast7d.toFixed(2)),
          trendPctVsLast7d: Number(trendPctVsLast7d.toFixed(1)),
          shortfallAlert,
          targetPace7d,
          message: insightMessage,
        },
        recommendationId,
      };

      return response;
    });

    return cachedRes.data;
  }

  /**
   * Queries historical metric data and seeds a zero-filled contiguous daily sequence.
   */
  public async buildZeroFilledSeries(
    organizationId: string,
    metric: ForecastMetric,
    campaignId?: string
  ): Promise<{
    series: ForecastSeriesPoint[];
    campaignName?: string;
    campaignBudget?: number;
  }> {
    const daysBack = 35; // 5 full weeks ensures >= 28 data points
    const now = new Date();
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    const from = new Date(to.getTime() - (daysBack - 1) * 24 * 60 * 60 * 1000);
    from.setUTCHours(0, 0, 0, 0);

    // Initialize contiguous zero-filled daily sequence
    const dailyMap = new Map<string, number>();
    const cur = new Date(from);
    while (cur <= to) {
      const key = cur.toISOString().split('T')[0]!;
      dailyMap.set(key, 0);
      cur.setUTCDate(cur.getUTCDate() + 1);
    }

    let campaignName: string | undefined;
    let campaignBudget: number | undefined;

    if (campaignId) {
      const campaign = await prisma.campaign.findFirst({
        where: { id: campaignId, organizationId },
        select: { name: true, budget: true },
      });
      if (campaign) {
        campaignName = campaign.name;
        campaignBudget = Number(campaign.budget);
      }
    }

    if (metric === 'spend') {
      const spends = await prisma.campaignSpend.findMany({
        where: {
          organizationId,
          ...(campaignId ? { campaignId } : {}),
          date: { gte: from, lte: to },
        },
        select: { date: true, amount: true },
      });

      for (const s of spends) {
        const key = s.date.toISOString().split('T')[0]!;
        if (dailyMap.has(key)) {
          dailyMap.set(key, (dailyMap.get(key) || 0) + Number(s.amount));
        }
      }
    } else {
      // Event-based metric aggregation
      const eventTypeMap: Record<'applications' | 'interviews' | 'hires', string[]> = {
        applications: ['APPLICATION'],
        interviews: ['INTERVIEW'],
        hires: ['HIRE'],
      };

      const eventTypes = eventTypeMap[metric] as Array<'APPLICATION' | 'INTERVIEW' | 'HIRE'>;

      const events = await prisma.campaignEvent.findMany({
        where: {
          organizationId,
          ...(campaignId ? { campaignId } : {}),
          eventType: { in: eventTypes },
          timestamp: { gte: from, lte: to },
        },
        select: { timestamp: true, quantity: true },
      });

      for (const ev of events) {
        const key = ev.timestamp.toISOString().split('T')[0]!;
        if (dailyMap.has(key)) {
          dailyMap.set(key, (dailyMap.get(key) || 0) + ev.quantity);
        }
      }

      // If metric is applications and event counts were zero, check direct Application records
      if (metric === 'applications' && events.length === 0) {
        const applications = await prisma.application.findMany({
          where: {
            organizationId,
            ...(campaignId ? { job: { campaigns: { some: { id: campaignId } } } } : {}),
            appliedAt: { gte: from, lte: to },
          },
          select: { appliedAt: true },
        });

        for (const app of applications) {
          const key = app.appliedAt.toISOString().split('T')[0]!;
          if (dailyMap.has(key)) {
            dailyMap.set(key, (dailyMap.get(key) || 0) + 1);
          }
        }
      }
    }

    const series: ForecastSeriesPoint[] = Array.from(dailyMap.entries())
      .map(([date, value]) => ({ date, value: Number(value.toFixed(2)) }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { series, campaignName, campaignBudget };
  }

  /**
   * API-side moving average fallback computation when ML microservice is unreachable.
   */
  public computeMovingAverageFallback(
    series: ForecastSeriesPoint[],
    horizon: number
  ): {
    forecast: ForecastItem[];
    backtest: BacktestMetrics;
  } {
    const values = series.map((s) => s.value);
    const windowSize = Math.min(7, values.length);
    const recentValues = values.slice(-windowSize);

    const mean = recentValues.length > 0
      ? recentValues.reduce((sum, v) => sum + v, 0) / recentValues.length
      : 0;

    const variance = recentValues.length > 1
      ? recentValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (recentValues.length - 1)
      : Math.max(1, mean * 0.15);

    const std = Math.max(1, Math.sqrt(variance));

    let lastDate = new Date();
    if (series.length > 0) {
      const parsed = new Date(series[series.length - 1]!.date);
      if (!isNaN(parsed.getTime())) {
        lastDate = parsed;
      }
    }

    const forecast: ForecastItem[] = [];
    for (let i = 1; i <= horizon; i++) {
      const forecastDate = new Date(lastDate.getTime() + i * 24 * 60 * 60 * 1000);
      const width = 1.96 * std * Math.sqrt(1 + 0.03 * i);
      const val = Number(Math.max(0, mean).toFixed(2));
      const lower = Number(Math.max(0, val - width).toFixed(2));
      const upper = Number((val + width).toFixed(2));

      forecast.push({
        date: forecastDate.toISOString().split('T')[0]!,
        value: val,
        lower,
        upper,
      });
    }

    // 14-day holdout backtest approximation
    const holdoutLen = Math.min(14, Math.max(1, Math.floor(values.length / 3)));
    const trainValues = values.slice(0, -holdoutLen);
    const holdoutValues = values.slice(-holdoutLen);

    const trainMean = trainValues.length > 0
      ? trainValues.slice(-windowSize).reduce((sum, v) => sum + v, 0) / Math.min(windowSize, trainValues.length)
      : 0;

    let totalAbsErr = 0;
    let totalSqErr = 0;
    let totalPctErr = 0;
    let totalBaselineErr = 0;

    for (let i = 0; i < holdoutValues.length; i++) {
      const actual = holdoutValues[i]!;
      const absErr = Math.abs(actual - trainMean);
      totalAbsErr += absErr;
      totalSqErr += Math.pow(actual - trainMean, 2);
      totalPctErr += absErr / Math.max(Math.abs(actual), 1);

      // Baseline: lag 7 or last observation
      const baselineVal = i >= 7 ? holdoutValues[i - 7]! : (trainValues[trainValues.length - (7 - i)] ?? trainMean);
      totalBaselineErr += Math.abs(actual - baselineVal);
    }

    const count = Math.max(1, holdoutValues.length);
    const backtest: BacktestMetrics = {
      mae: Number((totalAbsErr / count).toFixed(3)),
      rmse: Number(Math.sqrt(totalSqErr / count).toFixed(3)),
      mape: Number((totalPctErr / count).toFixed(4)),
      baselineMae: Number((totalBaselineErr / count).toFixed(3)),
    };

    return { forecast, backtest };
  }
}

export const forecastService = new ForecastService();
