import {
  AnalyticsOverview,
  FunnelStage,
  TimeSeriesPoint,
  PublisherPerformance,
  CampaignPerformance,
  PublisherType,
} from '@talentpulse/shared';
import { prisma } from '../../lib/prisma';
import { cached } from '../../lib/cache';
import {
  calculateCTR,
  calculateApplicationRate,
  calculateHireRate,
  calculateCPC,
  calculateCPA,
  calculateCPQA,
  calculateCPH,
  calculateDelta,
} from './metrics';

export interface AnalyticsQueryOptions {
  from?: string;
  to?: string;
  campaignId?: string;
  publisherId?: string;
  interval?: 'day' | 'week';
}

function parseDateRange(options: AnalyticsQueryOptions): {
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;
} {
  const to = options.to ? new Date(options.to) : new Date();
  const from = options.from
    ? new Date(options.from)
    : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days default

  const durationMs = to.getTime() - from.getTime();
  const previousTo = new Date(from.getTime());
  const previousFrom = new Date(from.getTime() - durationMs);

  return { from, to, previousFrom, previousTo };
}

export class AnalyticsService {
  async getOverview(
    organizationId: string,
    options: AnalyticsQueryOptions,
  ): Promise<AnalyticsOverview> {
    const { from, to, previousFrom, previousTo } = parseDateRange(options);

    const cacheKey = {
      type: 'overview',
      from: from.toISOString(),
      to: to.toISOString(),
      campaignId: options.campaignId || 'all',
    };

    const cachedRes = await cached(organizationId, 'analytics', cacheKey, 120, async () => {
      // 1. Fetch current period metrics
      const [currentEvents, currentSpends, currentApps, currentJobs] = await Promise.all([
        prisma.campaignEvent.findMany({
          where: {
            organizationId,
            ...(options.campaignId ? { campaignId: options.campaignId } : {}),
            timestamp: { gte: from, lte: to },
          },
          select: { eventType: true, quantity: true, qualifiedQuantity: true },
        }),
        prisma.campaignSpend.findMany({
          where: {
            organizationId,
            ...(options.campaignId ? { campaignId: options.campaignId } : {}),
            date: { gte: from, lte: to },
          },
          select: { amount: true },
        }),
        prisma.application.findMany({
          where: {
            organizationId,
            ...(options.campaignId ? { job: { campaigns: { some: { id: options.campaignId } } } } : {}),
            appliedAt: { gte: from, lte: to },
          },
          select: { status: true },
        }),
        prisma.job.count({
          where: {
            organizationId,
          },
        }),
      ]);

      // 2. Fetch previous period metrics
      const [prevEvents, prevSpends, prevApps] = await Promise.all([
        prisma.campaignEvent.findMany({
          where: {
            organizationId,
            ...(options.campaignId ? { campaignId: options.campaignId } : {}),
            timestamp: { gte: previousFrom, lte: previousTo },
          },
          select: { eventType: true, quantity: true },
        }),
        prisma.campaignSpend.findMany({
          where: {
            organizationId,
            ...(options.campaignId ? { campaignId: options.campaignId } : {}),
            date: { gte: previousFrom, lte: previousTo },
          },
          select: { amount: true },
        }),
        prisma.application.findMany({
          where: {
            organizationId,
            ...(options.campaignId ? { job: { campaigns: { some: { id: options.campaignId } } } } : {}),
            appliedAt: { gte: previousFrom, lte: previousTo },
          },
          select: { status: true },
        }),
      ]);

      // Calculate Current Totals
      let currImpressions = 0;
      let currClicks = 0;
      let currEventApps = 0;
      let currEventHires = 0;

      for (const ev of currentEvents) {
        if (ev.eventType === 'IMPRESSION') currImpressions += ev.quantity;
        if (ev.eventType === 'CLICK') currClicks += ev.quantity;
        if (ev.eventType === 'APPLICATION') currEventApps += ev.quantity;
        if (ev.eventType === 'HIRE') currEventHires += ev.quantity;
      }

      const totalApplications = currentApps.length > 0 ? currentApps.length : currEventApps;
      const totalInterviews = currentApps.filter((a) =>
        ['INTERVIEW', 'OFFER', 'HIRED'].includes(a.status),
      ).length;
      const totalHires = currentApps.filter((a) => a.status === 'HIRED').length || currEventHires;
      const totalSpend = currentSpends.reduce((sum, s) => sum + Number(s.amount), 0);

      const cpa = calculateCPA(totalSpend, totalApplications);
      const cph = calculateCPH(totalSpend, totalHires);
      const ctr = calculateCTR(currClicks, currImpressions);
      const appRate = calculateApplicationRate(totalApplications, currClicks);
      const conversionRate = calculateHireRate(totalHires, totalApplications);

      // Calculate Previous Totals
      let prevEventApps = 0;
      let prevEventHires = 0;
      for (const ev of prevEvents) {
        if (ev.eventType === 'APPLICATION') prevEventApps += ev.quantity;
        if (ev.eventType === 'HIRE') prevEventHires += ev.quantity;
      }

      const prevTotalApps = prevApps.length > 0 ? prevApps.length : prevEventApps;
      const prevTotalInterviews = prevApps.filter((a) =>
        ['INTERVIEW', 'OFFER', 'HIRED'].includes(a.status),
      ).length;
      const prevTotalHires = prevApps.filter((a) => a.status === 'HIRED').length || prevEventHires;
      const prevTotalSpend = prevSpends.reduce((sum, s) => sum + Number(s.amount), 0);

      const prevCpa = calculateCPA(prevTotalSpend, prevTotalApps);
      const prevCph = calculateCPH(prevTotalSpend, prevTotalHires);
      const prevConversionRate = calculateHireRate(prevTotalHires, prevTotalApps);

      return {
        period: { from: from.toISOString(), to: to.toISOString() },
        previousPeriod: { from: previousFrom.toISOString(), to: previousTo.toISOString() },
        totals: {
          jobs: currentJobs,
          applications: totalApplications,
          interviews: totalInterviews,
          hires: totalHires,
          spend: totalSpend,
          impressions: currImpressions,
          clicks: currClicks,
          cpa,
          cph,
          ctr,
          applicationRate: appRate,
          conversionRate,
        },
        deltas: {
          jobs: 0,
          applications: calculateDelta(totalApplications, prevTotalApps),
          interviews: calculateDelta(totalInterviews, prevTotalInterviews),
          hires: calculateDelta(totalHires, prevTotalHires),
          spend: calculateDelta(totalSpend, prevTotalSpend),
          cpa: calculateDelta(cpa, prevCpa),
          cph: calculateDelta(cph, prevCph),
          conversionRate: calculateDelta(conversionRate, prevConversionRate),
        },
      };
    });

    return cachedRes.data;
  }

  async getFunnel(organizationId: string, options: AnalyticsQueryOptions): Promise<FunnelStage[]> {
    const { from, to } = parseDateRange(options);

    const [events, applications] = await Promise.all([
      prisma.campaignEvent.findMany({
        where: {
          organizationId,
          ...(options.campaignId ? { campaignId: options.campaignId } : {}),
          timestamp: { gte: from, lte: to },
        },
        select: { eventType: true, quantity: true, qualifiedQuantity: true },
      }),
      prisma.application.findMany({
        where: {
          organizationId,
          appliedAt: { gte: from, lte: to },
        },
        select: { status: true },
      }),
    ]);

    let impressions = 0;
    let clicks = 0;
    let appStarts = 0;
    let eventApps = 0;
    let qualifiedApps = 0;
    let eventInterviews = 0;
    let eventHires = 0;

    for (const ev of events) {
      if (ev.eventType === 'IMPRESSION') impressions += ev.quantity;
      if (ev.eventType === 'CLICK') clicks += ev.quantity;
      if (ev.eventType === 'APPLICATION_START') appStarts += ev.quantity;
      if (ev.eventType === 'APPLICATION') {
        eventApps += ev.quantity;
        qualifiedApps += ev.qualifiedQuantity;
      }
      if (ev.eventType === 'INTERVIEW') eventInterviews += ev.quantity;
      if (ev.eventType === 'HIRE') eventHires += ev.quantity;
    }

    const appsCount = applications.length > 0 ? applications.length : eventApps;
    const interviewsCount =
      applications.filter((a) => ['INTERVIEW', 'OFFER', 'HIRED'].includes(a.status)).length ||
      eventInterviews;
    const hiresCount = applications.filter((a) => a.status === 'HIRED').length || eventHires;

    const baseImpressions = impressions || clicks * 10 || 1;

    const stages: Array<{ stage: string; count: number }> = [
      { stage: 'Impressions', count: impressions },
      { stage: 'Clicks', count: clicks },
      { stage: 'Application Starts', count: appStarts },
      { stage: 'Applications', count: appsCount },
      { stage: 'Qualified Applications', count: qualifiedApps },
      { stage: 'Interviews', count: interviewsCount },
      { stage: 'Hires', count: hiresCount },
    ];

    return stages.map((st, idx) => {
      const prevCount = idx === 0 ? null : stages[idx - 1]?.count;
      const conversionRate = prevCount && prevCount > 0 ? (st.count / prevCount) * 100 : null;
      const overallConversionRate = (st.count / baseImpressions) * 100;

      return {
        stage: st.stage,
        count: st.count,
        conversionRate: conversionRate !== null ? Number(conversionRate.toFixed(1)) : null,
        overallConversionRate: Number(overallConversionRate.toFixed(2)),
      };
    });
  }

  async getTimeSeries(
    organizationId: string,
    options: AnalyticsQueryOptions,
  ): Promise<TimeSeriesPoint[]> {
    const { from, to } = parseDateRange(options);

    const [events, spends] = await Promise.all([
      prisma.campaignEvent.findMany({
        where: {
          organizationId,
          ...(options.campaignId ? { campaignId: options.campaignId } : {}),
          ...(options.publisherId ? { publisherId: options.publisherId } : {}),
          timestamp: { gte: from, lte: to },
        },
        select: { eventType: true, quantity: true, timestamp: true },
      }),
      prisma.campaignSpend.findMany({
        where: {
          organizationId,
          ...(options.campaignId ? { campaignId: options.campaignId } : {}),
          ...(options.publisherId ? { publisherId: options.publisherId } : {}),
          date: { gte: from, lte: to },
        },
        select: { amount: true, date: true },
      }),
    ]);

    const dailyMap = new Map<string, TimeSeriesPoint>();

    // Seed empty points for date range
    const cur = new Date(from);
    while (cur <= to) {
      const key = cur.toISOString().split('T')[0]!;
      dailyMap.set(key, {
        date: key,
        impressions: 0,
        clicks: 0,
        applications: 0,
        hires: 0,
        spend: 0,
      });
      cur.setDate(cur.getDate() + 1);
    }

    for (const ev of events) {
      const key = ev.timestamp.toISOString().split('T')[0]!;
      const point = dailyMap.get(key);
      if (point) {
        if (ev.eventType === 'IMPRESSION') point.impressions += ev.quantity;
        if (ev.eventType === 'CLICK') point.clicks += ev.quantity;
        if (ev.eventType === 'APPLICATION') point.applications += ev.quantity;
        if (ev.eventType === 'HIRE') point.hires += ev.quantity;
      }
    }

    for (const sp of spends) {
      const key = sp.date.toISOString().split('T')[0]!;
      const point = dailyMap.get(key);
      if (point) {
        point.spend += Number(sp.amount);
      }
    }

    return Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  async getPublishers(
    organizationId: string,
    options: AnalyticsQueryOptions,
  ): Promise<PublisherPerformance[]> {
    const to = options.to ? new Date(options.to) : new Date();
    const from = options.from
      ? new Date(options.from)
      : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days default
    const durationMs = Math.max(24 * 60 * 60 * 1000, to.getTime() - from.getTime());
    const previousTo = new Date(from.getTime());
    const previousFrom = new Date(from.getTime() - durationMs);

    const cacheKey = {
      type: 'publishers',
      from: from.toISOString(),
      to: to.toISOString(),
      campaignId: options.campaignId || 'all',
    };

    const cachedRes = await cached(organizationId, 'analytics', cacheKey, 60, async () => {
      const [publishers, currentEvents, currentSpends, prevEvents, prevSpends] = await Promise.all([
        prisma.publisher.findMany({
          where: { organizationId },
        }),
        prisma.campaignEvent.findMany({
          where: {
            organizationId,
            ...(options.campaignId ? { campaignId: options.campaignId } : {}),
            timestamp: { gte: from, lte: to },
          },
          select: {
            publisherId: true,
            eventType: true,
            quantity: true,
            qualifiedQuantity: true,
          },
        }),
        prisma.campaignSpend.findMany({
          where: {
            organizationId,
            ...(options.campaignId ? { campaignId: options.campaignId } : {}),
            date: { gte: from, lte: to },
          },
          select: { publisherId: true, amount: true },
        }),
        prisma.campaignEvent.findMany({
          where: {
            organizationId,
            ...(options.campaignId ? { campaignId: options.campaignId } : {}),
            timestamp: { gte: previousFrom, lte: previousTo },
          },
          select: {
            publisherId: true,
            eventType: true,
            quantity: true,
            qualifiedQuantity: true,
          },
        }),
        prisma.campaignSpend.findMany({
          where: {
            organizationId,
            ...(options.campaignId ? { campaignId: options.campaignId } : {}),
            date: { gte: previousFrom, lte: previousTo },
          },
          select: { publisherId: true, amount: true },
        }),
      ]);

      const prevMap = new Map<
        string,
        {
          impressions: number;
          clicks: number;
          applications: number;
          qualifiedApplications: number;
          interviews: number;
          hires: number;
          spend: number;
        }
      >();

      for (const p of publishers) {
        prevMap.set(p.id, {
          impressions: 0,
          clicks: 0,
          applications: 0,
          qualifiedApplications: 0,
          interviews: 0,
          hires: 0,
          spend: 0,
        });
      }

      for (const ev of prevEvents) {
        const p = prevMap.get(ev.publisherId);
        if (p) {
          if (ev.eventType === 'IMPRESSION') p.impressions += ev.quantity;
          if (ev.eventType === 'CLICK') p.clicks += ev.quantity;
          if (ev.eventType === 'APPLICATION') {
            p.applications += ev.quantity;
            p.qualifiedApplications += ev.qualifiedQuantity;
          }
          if (ev.eventType === 'INTERVIEW') p.interviews += ev.quantity;
          if (ev.eventType === 'HIRE') p.hires += ev.quantity;
        }
      }

      for (const sp of prevSpends) {
        const p = prevMap.get(sp.publisherId);
        if (p) {
          p.spend += Number(sp.amount);
        }
      }

      const performanceMap = new Map<string, PublisherPerformance>();

      for (const p of publishers) {
        performanceMap.set(p.id, {
          publisherId: p.id,
          publisherName: p.name,
          publisherType: p.type as PublisherType,
          impressions: 0,
          clicks: 0,
          applications: 0,
          qualifiedApplications: 0,
          interviews: 0,
          hires: 0,
          spend: 0,
          ctr: null,
          applicationRate: null,
          cpc: null,
          cpa: null,
          cpqa: null,
          cph: null,
          rank: 1,
          trends: {
            ctrDelta: null,
            cpcDelta: null,
            cpaDelta: null,
            cpqaDelta: null,
            cphDelta: null,
            impressionsDelta: null,
            clicksDelta: null,
            applicationsDelta: null,
            spendDelta: null,
          },
          funnel: {
            impressions: 0,
            clicks: 0,
            applications: 0,
            qualifiedApplications: 0,
            interviews: 0,
            hires: 0,
          },
        });
      }

      for (const ev of currentEvents) {
        const p = performanceMap.get(ev.publisherId);
        if (p) {
          if (ev.eventType === 'IMPRESSION') p.impressions += ev.quantity;
          if (ev.eventType === 'CLICK') p.clicks += ev.quantity;
          if (ev.eventType === 'APPLICATION') {
            p.applications += ev.quantity;
            p.qualifiedApplications += ev.qualifiedQuantity;
          }
          if (ev.eventType === 'INTERVIEW') p.interviews += ev.quantity;
          if (ev.eventType === 'HIRE') p.hires += ev.quantity;
        }
      }

      for (const sp of currentSpends) {
        const p = performanceMap.get(sp.publisherId);
        if (p) {
          p.spend += Number(sp.amount);
        }
      }

      for (const p of performanceMap.values()) {
        p.ctr = calculateCTR(p.clicks, p.impressions);
        p.applicationRate = calculateApplicationRate(p.applications, p.clicks);
        p.cpc = calculateCPC(p.spend, p.clicks);
        p.cpa = calculateCPA(p.spend, p.applications);
        p.cpqa = calculateCPQA(p.spend, p.qualifiedApplications);
        p.cph = calculateCPH(p.spend, p.hires);

        p.funnel = {
          impressions: p.impressions,
          clicks: p.clicks,
          applications: p.applications,
          qualifiedApplications: p.qualifiedApplications,
          interviews: p.interviews,
          hires: p.hires,
        };

        const prev = prevMap.get(p.publisherId);
        if (prev) {
          const prevCtr = calculateCTR(prev.clicks, prev.impressions);
          const prevCpc = calculateCPC(prev.spend, prev.clicks);
          const prevCpa = calculateCPA(prev.spend, prev.applications);
          const prevCpqa = calculateCPQA(prev.spend, prev.qualifiedApplications);
          const prevCph = calculateCPH(prev.spend, prev.hires);

          p.trends = {
            ctrDelta: calculateDelta(p.ctr, prevCtr),
            cpcDelta: calculateDelta(p.cpc, prevCpc),
            cpaDelta: calculateDelta(p.cpa, prevCpa),
            cpqaDelta: calculateDelta(p.cpqa, prevCpqa),
            cphDelta: calculateDelta(p.cph, prevCph),
            impressionsDelta: calculateDelta(p.impressions, prev.impressions),
            clicksDelta: calculateDelta(p.clicks, prev.clicks),
            applicationsDelta: calculateDelta(p.applications, prev.applications),
            spendDelta: calculateDelta(p.spend, prev.spend),
          };
        }
      }

      // Ranking: publishers with lowest CPA come first.
      // If CPA is null or equal, rank by applications descending, then clicks descending.
      const rankedList = Array.from(performanceMap.values()).sort((a, b) => {
        if (a.cpa !== null && b.cpa !== null) {
          if (a.cpa !== b.cpa) return a.cpa - b.cpa;
          return b.applications - a.applications;
        }
        if (a.cpa !== null && b.cpa === null) return -1;
        if (a.cpa === null && b.cpa !== null) return 1;
        if (b.applications !== a.applications) return b.applications - a.applications;
        return b.clicks - a.clicks;
      });

      rankedList.forEach((p, idx) => {
        p.rank = idx + 1;
      });

      return rankedList;
    });

    return cachedRes.data;
  }

  async getCampaigns(
    organizationId: string,
    options: AnalyticsQueryOptions,
  ): Promise<CampaignPerformance[]> {
    const { from, to } = parseDateRange(options);

    const [campaigns, events, spends] = await Promise.all([
      prisma.campaign.findMany({
        where: { organizationId },
        include: {
          job: { select: { title: true } },
        },
      }),
      prisma.campaignEvent.findMany({
        where: {
          organizationId,
          timestamp: { gte: from, lte: to },
        },
        select: { campaignId: true, eventType: true, quantity: true },
      }),
      prisma.campaignSpend.findMany({
        where: {
          organizationId,
          date: { gte: from, lte: to },
        },
        select: { campaignId: true, amount: true },
      }),
    ]);

    const campMap = new Map<string, CampaignPerformance>();

    for (const c of campaigns) {
      campMap.set(c.id, {
        campaignId: c.id,
        campaignName: c.name,
        jobTitle: c.job.title,
        status: c.status,
        budget: Number(c.budget),
        spend: 0,
        impressions: 0,
        clicks: 0,
        applications: 0,
        hires: 0,
        cpa: null,
        cph: null,
      });
    }

    for (const ev of events) {
      const c = campMap.get(ev.campaignId);
      if (c) {
        if (ev.eventType === 'IMPRESSION') c.impressions += ev.quantity;
        if (ev.eventType === 'CLICK') c.clicks += ev.quantity;
        if (ev.eventType === 'APPLICATION') c.applications += ev.quantity;
        if (ev.eventType === 'HIRE') c.hires += ev.quantity;
      }
    }

    for (const sp of spends) {
      const c = campMap.get(sp.campaignId);
      if (c) {
        c.spend += Number(sp.amount);
      }
    }

    for (const c of campMap.values()) {
      c.cpa = calculateCPA(c.spend, c.applications);
      c.cph = calculateCPH(c.spend, c.hires);
    }

    return Array.from(campMap.values()).sort((a, b) => b.spend - a.spend);
  }
}

export const analyticsService = new AnalyticsService();
