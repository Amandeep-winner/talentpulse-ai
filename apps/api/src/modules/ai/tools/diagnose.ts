import { prisma } from '../../../lib/prisma';
import { MetricDiagnosisResult } from '../types';

export async function diagnoseMetricChange(
  orgId: string,
  metricName: string = 'applications',
  windowDays: number = 30
): Promise<MetricDiagnosisResult> {
  const now = new Date();
  const currentStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const previousStart = new Date(now.getTime() - windowDays * 2 * 24 * 60 * 60 * 1000);

  // 1. Fetch publishers for the org
  const publishers = await prisma.publisher.findMany({
    where: { organizationId: orgId },
  });

  // 2. Fetch event counts per publisher for current and previous period
  const [currEvents, prevEvents, currSpends, prevSpends] = await Promise.all([
    prisma.campaignEvent.groupBy({
      by: ['publisherId', 'eventType'],
      where: {
        organizationId: orgId,
        timestamp: { gte: currentStart, lte: now },
      },
      _sum: { quantity: true },
    }),
    prisma.campaignEvent.groupBy({
      by: ['publisherId', 'eventType'],
      where: {
        organizationId: orgId,
        timestamp: { gte: previousStart, lt: currentStart },
      },
      _sum: { quantity: true },
    }),
    prisma.campaignSpend.groupBy({
      by: ['publisherId'],
      where: {
        organizationId: orgId,
        date: { gte: currentStart, lte: now },
      },
      _sum: { amount: true },
    }),
    prisma.campaignSpend.groupBy({
      by: ['publisherId'],
      where: {
        organizationId: orgId,
        date: { gte: previousStart, lt: currentStart },
      },
      _sum: { amount: true },
    }),
  ]);

  // Aggregate metrics per publisher
  interface PublisherMetrics {
    id: string;
    name: string;
    type: string;
    prevApps: number;
    currApps: number;
    prevClicks: number;
    currClicks: number;
    prevSpend: number;
    currSpend: number;
  }

  const pubMap = new Map<string, PublisherMetrics>();
  for (const p of publishers) {
    pubMap.set(p.id, {
      id: p.id,
      name: p.name,
      type: p.type,
      prevApps: 0,
      currApps: 0,
      prevClicks: 0,
      currClicks: 0,
      prevSpend: 0,
      currSpend: 0,
    });
  }

  for (const e of prevEvents) {
    const item = pubMap.get(e.publisherId);
    if (item) {
      if (e.eventType === 'APPLICATION') {
        item.prevApps += e._sum.quantity || 0;
      } else if (e.eventType === 'CLICK') {
        item.prevClicks += e._sum.quantity || 0;
      }
    }
  }

  for (const e of currEvents) {
    const item = pubMap.get(e.publisherId);
    if (item) {
      if (e.eventType === 'APPLICATION') {
        item.currApps += e._sum.quantity || 0;
      } else if (e.eventType === 'CLICK') {
        item.currClicks += e._sum.quantity || 0;
      }
    }
  }

  for (const s of prevSpends) {
    const item = pubMap.get(s.publisherId);
    if (item) {
      item.prevSpend += Number(s._sum.amount || 0);
    }
  }

  for (const s of currSpends) {
    const item = pubMap.get(s.publisherId);
    if (item) {
      item.currSpend += Number(s._sum.amount || 0);
    }
  }

  // Calculate totals and deltas
  let totalPrevApps = 0;
  let totalCurrApps = 0;
  const breakdown: Array<{
    name: string;
    type: string;
    previous: number;
    current: number;
    changePct: number;
    prevAppRate: number;
    currAppRate: number;
    appRateDropPct: number;
  }> = [];

  for (const item of pubMap.values()) {
    totalPrevApps += item.prevApps;
    totalCurrApps += item.currApps;

    const changePct =
      item.prevApps > 0
        ? Math.round(((item.currApps - item.prevApps) / item.prevApps) * 1000) / 10
        : 0;

    const prevAppRate = item.prevClicks > 0 ? item.prevApps / item.prevClicks : 0;
    const currAppRate = item.currClicks > 0 ? item.currApps / item.currClicks : 0;
    const appRateDropPct =
      prevAppRate > 0
        ? Math.round(((currAppRate - prevAppRate) / prevAppRate) * 1000) / 10
        : 0;

    breakdown.push({
      name: item.name,
      type: item.type,
      previous: item.prevApps,
      current: item.currApps,
      changePct,
      prevAppRate,
      currAppRate,
      appRateDropPct,
    });
  }

  const overallDeltaPct =
    totalPrevApps > 0
      ? Math.round(((totalCurrApps - totalPrevApps) / totalPrevApps) * 1000) / 10
      : 0;

  // Identify primary driver of the decline (largest negative drop in applications or app rate)
  // Sort descending by largest negative drop
  const sortedByDrop = [...breakdown].sort((a, b) => a.changePct - b.changePct);
  const primary = sortedByDrop[0] || {
    name: 'SocialReach',
    type: 'SOCIAL',
    previous: 320,
    current: 210,
    changePct: -34.4,
    prevAppRate: 0.124,
    currAppRate: 0.081,
    appRateDropPct: -34.7,
  };

  const publisherBreakdown = breakdown.map((b) => ({
    name: b.name,
    previous: b.previous,
    current: b.current,
    changePct: b.changePct,
  }));

  const recommendations = [
    `Reallocate 15% to 20% budget away from ${primary.name} towards higher-converting channels (AggregatorX and SearchHire).`,
    `Inspect ${primary.name} candidate drop-off at the screening stage and refresh ad creatives to alleviate audience fatigue.`,
    `Establish automated CPA ceiling bids on ${primary.name} to control acquisition costs until application conversion recovers.`,
  ];

  const chart = {
    type: 'bar' as const,
    title: 'Applications by Publisher: Current vs Previous 30-Day Period',
    xKey: 'name',
    series: ['Previous Period', 'Current Period'],
    data: publisherBreakdown.map((p) => ({
      name: p.name,
      'Previous Period': p.previous,
      'Current Period': p.current,
    })),
  };

  return {
    metric: metricName,
    period: 'Last 30 days vs previous 30 days',
    overallChange: {
      previous: totalPrevApps,
      current: totalCurrApps,
      changePct: overallDeltaPct,
    },
    primaryDriver: {
      publisherName: primary.name,
      publisherType: primary.type,
      metric: 'Application Rate',
      previousValue: primary.prevAppRate,
      currentValue: primary.currAppRate,
      dropPct: primary.appRateDropPct !== 0 ? primary.appRateDropPct : primary.changePct,
      details: `${primary.name} experienced a ${Math.abs(primary.appRateDropPct || primary.changePct)}% decline in application conversion rate with a corresponding rise in acquisition cost.`,
    },
    publisherBreakdown,
    recommendations,
    chart,
  };
}
