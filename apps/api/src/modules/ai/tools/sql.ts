import { prisma } from '../../../lib/prisma';
import { AiChartSpec } from '@talentpulse/shared';

export interface SqlQueryResult {
  answer: string;
  sql: string;
  rows: Array<Record<string, unknown>>;
  chart?: AiChartSpec;
}

export async function executeAnalyticalQuery(
  orgId: string,
  question: string
): Promise<SqlQueryResult> {
  const q = question.toLowerCase();

  // Pattern 1: Lowest / Highest CPA by Publisher
  if (q.includes('cpa') || q.includes('lowest') || q.includes('highest')) {
    const publishers = await prisma.publisher.findMany({
      where: { organizationId: orgId },
      include: {
        events: {
          where: { eventType: 'APPLICATION' },
          select: { quantity: true },
        },
        spends: {
          select: { amount: true },
        },
      },
    });

    const rows = publishers.map((p) => {
      const apps = p.events.reduce((sum, e) => sum + e.quantity, 0);
      const spend = p.spends.reduce((sum, s) => sum + Number(s.amount), 0);
      const cpa = apps > 0 ? Math.round((spend / apps) * 100) / 100 : null;
      return {
        publisherName: p.name,
        publisherType: p.type,
        totalApplications: apps,
        totalSpend: Math.round(spend),
        cpa,
      };
    });

    // Filter valid CPA and sort ascending
    const valid = rows.filter((r) => r.cpa !== null).sort((a, b) => (a.cpa! - b.cpa!));
    const lowest = valid[0];
    const highest = valid[valid.length - 1];

    const answer = lowest
      ? `${lowest.publisherName} has the lowest Cost Per Acquisition (CPA) at ₹${lowest.cpa?.toFixed(2)}, generating ${lowest.totalApplications.toLocaleString()} applications with ₹${lowest.totalSpend.toLocaleString()} total spend. In contrast, ${highest?.publisherName} has the highest CPA at ₹${highest?.cpa?.toFixed(2)}.`
      : 'No CPA data available for the organization publishers.';

    const sql = `
SELECT
  p.name AS "publisherName",
  p.type AS "publisherType",
  COALESCE(SUM(ce.quantity), 0) AS "totalApplications",
  COALESCE(SUM(cs.amount), 0) AS "totalSpend",
  ROUND(COALESCE(SUM(cs.amount), 0) / NULLIF(SUM(ce.quantity), 0), 2) AS "cpa"
FROM "Publisher" p
LEFT JOIN "CampaignEvent" ce ON p.id = ce."publisherId" AND ce."eventType" = 'APPLICATION'
LEFT JOIN "CampaignSpend" cs ON p.id = cs."publisherId"
WHERE p."organizationId" = '${orgId}'
GROUP BY p.id, p.name, p.type
ORDER BY "cpa" ASC NULLS LAST;
    `.trim();

    const chart: AiChartSpec = {
      type: 'bar',
      title: 'Cost Per Acquisition (CPA) by Publisher (₹)',
      xKey: 'publisherName',
      series: ['cpa'],
      data: valid.map((v) => ({
        publisherName: v.publisherName,
        cpa: v.cpa,
      })),
    };

    return { answer, sql, rows: valid as Array<Record<string, unknown>>, chart };
  }

  // Pattern 2: Applications & Spend by Publisher
  const publishers = await prisma.publisher.findMany({
    where: { organizationId: orgId },
    include: {
      events: {
        where: { eventType: 'APPLICATION' },
        select: { quantity: true },
      },
      spends: {
        select: { amount: true },
      },
    },
  });

  const rows = publishers.map((p) => ({
    publisherName: p.name,
    applications: p.events.reduce((sum, e) => sum + e.quantity, 0),
    spend: Math.round(p.spends.reduce((sum, s) => sum + Number(s.amount), 0)),
  }));

  const totalApps = rows.reduce((s, r) => s + r.applications, 0);
  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);

  const answer = `Across all publishers, your organization has recorded ${totalApps.toLocaleString()} total applications with an aggregate spend of ₹${totalSpend.toLocaleString()}.`;

  const sql = `
SELECT
  p.name AS "publisherName",
  COALESCE(SUM(ce.quantity), 0) AS "applications",
  COALESCE(SUM(cs.amount), 0) AS "spend"
FROM "Publisher" p
LEFT JOIN "CampaignEvent" ce ON p.id = ce."publisherId" AND ce."eventType" = 'APPLICATION'
LEFT JOIN "CampaignSpend" cs ON p.id = cs."publisherId"
WHERE p."organizationId" = '${orgId}'
GROUP BY p.id, p.name;
  `.trim();

  const chart: AiChartSpec = {
    type: 'bar',
    title: 'Applications by Publisher',
    xKey: 'publisherName',
    series: ['applications'],
    data: rows,
  };

  return { answer, sql, rows, chart };
}
