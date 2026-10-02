import { AiChartSpec } from '@talentpulse/shared';

export interface SqlTemplate {
  id: string;
  name: string;
  matches: (q: string) => boolean;
  generateSql: () => string;
  narrate: (
    rows: Array<Record<string, unknown>>,
    question: string
  ) => {
    answer: string;
    recommendations: string[];
    chart?: AiChartSpec;
    confidence: number;
  };
}

export const SQL_TEMPLATES: SqlTemplate[] = [
  // 1. Lowest CPA by Publisher
  {
    id: 'lowest_cpa_by_publisher',
    name: 'Lowest CPA by Publisher',
    matches: (q) =>
      q.includes('cpa') && (q.includes('lowest') || q.includes('cheapest') || q.includes('best') || q.includes('low')),
    generateSql: () =>
      `SELECT publisher_name, ROUND(SUM(spend) / NULLIF(SUM(applications), 0), 2) AS cpa, SUM(applications) AS total_applications, SUM(spend) AS total_spend FROM v_publisher_performance_daily GROUP BY publisher_name HAVING SUM(applications) > 0 ORDER BY cpa ASC LIMIT 10;`,
    narrate: (rows) => {
      const lowest = rows[0];
      const highest = rows[rows.length - 1] || lowest;
      if (!lowest || !highest) {
        return {
          answer: 'No publisher acquisition data was found for the current organization.',
          recommendations: ['Check active campaigns and publisher channel allocations.'],
          confidence: 0.9,
        };
      }
      const answer = `${lowest.publisher_name} delivers the lowest Cost Per Acquisition (CPA) at ₹${Number(lowest.cpa).toFixed(2)}, generating ${Number(lowest.total_applications).toLocaleString()} applications from ₹${Number(lowest.total_spend).toLocaleString()} in spend. In comparison, ${highest.publisher_name} has the highest CPA at ₹${Number(highest.cpa).toFixed(2)}.`;
      const chart: AiChartSpec = {
        type: 'bar',
        title: 'Cost Per Acquisition (CPA) by Publisher (₹)',
        xKey: 'publisher_name',
        series: ['cpa'],
        data: rows.map((r) => ({
          publisher_name: String(r.publisher_name),
          cpa: Number(r.cpa),
        })),
      };
      return {
        answer,
        recommendations: [
          `Increase budget allocation toward ${lowest.publisher_name} to optimize total recruiting spend.`,
          `Audit targeting and landing page conversions on higher-CPA channels like ${highest.publisher_name}.`,
        ],
        chart,
        confidence: 0.96,
      };
    },
  },

  // 2. Highest CPA by Publisher
  {
    id: 'highest_cpa_by_publisher',
    name: 'Highest CPA by Publisher',
    matches: (q) =>
      q.includes('cpa') && (q.includes('highest') || q.includes('most expensive') || q.includes('worst')),
    generateSql: () =>
      `SELECT publisher_name, ROUND(SUM(spend) / NULLIF(SUM(applications), 0), 2) AS cpa, SUM(applications) AS total_applications, SUM(spend) AS total_spend FROM v_publisher_performance_daily GROUP BY publisher_name HAVING SUM(applications) > 0 ORDER BY cpa DESC LIMIT 10;`,
    narrate: (rows) => {
      const highest = rows[0];
      const lowest = rows[rows.length - 1] || highest;
      if (!highest || !lowest) {
        return {
          answer: 'No publisher CPA data found for the current organization.',
          recommendations: [],
          confidence: 0.9,
        };
      }
      const answer = `${highest.publisher_name} has the highest Cost Per Acquisition (CPA) across all channels at ₹${Number(highest.cpa).toFixed(2)} (${Number(highest.total_applications).toLocaleString()} applications at ₹${Number(highest.total_spend).toLocaleString()} spend). The most cost-efficient channel is ${lowest.publisher_name} at ₹${Number(lowest.cpa).toFixed(2)}.`;
      const chart: AiChartSpec = {
        type: 'bar',
        title: 'CPA by Publisher - Highest to Lowest (₹)',
        xKey: 'publisher_name',
        series: ['cpa'],
        data: rows.map((r) => ({
          publisher_name: String(r.publisher_name),
          cpa: Number(r.cpa),
        })),
      };
      return {
        answer,
        recommendations: [
          `Consider reducing or reallocating budget away from ${highest.publisher_name}.`,
          `Investigate whether application conversion drops are publisher-specific or job-specific.`,
        ],
        chart,
        confidence: 0.95,
      };
    },
  },

  // 3. Applications by Week
  {
    id: 'applications_by_week',
    name: 'Applications by Week',
    matches: (q) =>
      (q.includes('week') || q.includes('weekly')) && (q.includes('application') || q.includes('trend') || q.includes('volume')),
    generateSql: () =>
      `SELECT DATE_TRUNC('week', date) AS week, SUM(applications) AS applications, SUM(interviews) AS interviews, SUM(hires) AS hires FROM v_job_funnel_daily GROUP BY week ORDER BY week ASC LIMIT 12;`,
    narrate: (rows) => {
      const totalApps = rows.reduce((sum, r) => sum + Number(r.applications || 0), 0);
      const totalHires = rows.reduce((sum, r) => sum + Number(r.hires || 0), 0);
      const latest = rows[rows.length - 1];
      const formattedLatestWeek = latest ? new Date(String(latest.week)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'recent week';
      const answer = `Over the past ${rows.length} weeks, your recruitment campaigns have generated a cumulative ${totalApps.toLocaleString()} applications and ${totalHires.toLocaleString()} hires. The latest recorded week (${formattedLatestWeek}) yielded ${Number(latest?.applications || 0).toLocaleString()} applications.`;
      const chart: AiChartSpec = {
        type: 'line',
        title: 'Weekly Application and Interview Volume',
        xKey: 'week',
        series: ['applications', 'interviews'],
        data: rows.map((r) => ({
          week: new Date(String(r.week)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          applications: Number(r.applications),
          interviews: Number(r.interviews),
        })),
      };
      return {
        answer,
        recommendations: [
          'Monitor week-over-week conversion fluctuations to detect mid-funnel drop-offs early.',
          'Align recruiter capacity with high-volume application weeks.',
        ],
        chart,
        confidence: 0.94,
      };
    },
  },

  // 4. Hires by Campaign
  {
    id: 'hires_by_campaign',
    name: 'Hires by Campaign',
    matches: (q) =>
      q.includes('hires') && (q.includes('campaign') || q.includes('by campaign') || q.includes('top campaign')),
    generateSql: () =>
      `SELECT campaign_name, job_title, SUM(hires) AS total_hires, SUM(applications) AS total_applications FROM v_campaign_summary GROUP BY campaign_name, job_title ORDER BY total_hires DESC LIMIT 10;`,
    narrate: (rows) => {
      const top = rows[0];
      if (!top) {
        return { answer: 'No campaign hiring records found.', recommendations: [], confidence: 0.9 };
      }
      const totalHires = rows.reduce((acc, r) => acc + Number(r.total_hires || 0), 0);
      const answer = `Top performing campaign for hires is "${top.campaign_name}" (${top.job_title}) with ${Number(top.total_hires).toLocaleString()} hires out of ${Number(top.total_applications).toLocaleString()} applications. Total hires across top campaigns stand at ${totalHires.toLocaleString()}.`;
      const chart: AiChartSpec = {
        type: 'bar',
        title: 'Hires by Campaign',
        xKey: 'campaign_name',
        series: ['total_hires'],
        data: rows.map((r) => ({
          campaign_name: String(r.campaign_name),
          total_hires: Number(r.total_hires),
        })),
      };
      return {
        answer,
        recommendations: [
          `Replicate sourcing channel distribution from "${top.campaign_name}" across other open roles.`,
          `Keep high-hiring campaigns funded through their target fill dates.`,
        ],
        chart,
        confidence: 0.95,
      };
    },
  },

  // 5. Spend by Publisher Last 30 Days
  {
    id: 'spend_by_publisher_last_30_days',
    name: 'Spend by Publisher Last 30 Days',
    matches: (q) =>
      q.includes('spend') && (q.includes('publisher') || q.includes('channel')) && (q.includes('30') || q.includes('month') || q.includes('recent')),
    generateSql: () =>
      `SELECT publisher_name, SUM(spend) AS total_spend, SUM(clicks) AS total_clicks, SUM(applications) AS total_applications FROM v_publisher_performance_daily WHERE date >= CURRENT_DATE - INTERVAL '30 days' GROUP BY publisher_name ORDER BY total_spend DESC LIMIT 10;`,
    narrate: (rows) => {
      const totalSpend = rows.reduce((sum, r) => sum + Number(r.total_spend || 0), 0);
      const topSpender = rows[0];
      const answer = `Total recruitment advertising spend over the last 30 days is ₹${Math.round(totalSpend).toLocaleString()}. Channel "${topSpender?.publisher_name}" accounts for the largest share at ₹${Number(topSpender?.total_spend || 0).toLocaleString()} (${totalSpend > 0 ? Math.round(((Number(topSpender?.total_spend || 0) / totalSpend) * 100)) : 0}% of total).`;
      const chart: AiChartSpec = {
        type: 'bar',
        title: 'Publisher Spend Last 30 Days (₹)',
        xKey: 'publisher_name',
        series: ['total_spend'],
        data: rows.map((r) => ({
          publisher_name: String(r.publisher_name),
          total_spend: Number(r.total_spend),
        })),
      };
      return {
        answer,
        recommendations: [
          `Review efficiency of "${topSpender?.publisher_name}" to ensure return on advertising spend (ROAS).`,
          `Shift incremental budget to high-converting lower-spend publishers.`,
        ],
        chart,
        confidence: 0.95,
      };
    },
  },

  // 6. CTR by Campaign
  {
    id: 'ctr_by_campaign',
    name: 'CTR by Campaign',
    matches: (q) =>
      (q.includes('ctr') || q.includes('click-through') || q.includes('click through')) && (q.includes('campaign') || q.includes('job')),
    generateSql: () =>
      `SELECT campaign_name, ROUND(SUM(clicks)::numeric / NULLIF(SUM(impressions), 0), 4) AS ctr, SUM(impressions) AS impressions, SUM(clicks) AS clicks FROM v_campaign_summary GROUP BY campaign_name ORDER BY ctr DESC NULLS LAST LIMIT 10;`,
    narrate: (rows) => {
      const top = rows[0];
      const answer = `Campaign "${top?.campaign_name}" leads in engagement with a ${(Number(top?.ctr || 0) * 100).toFixed(2)}% Click-Through Rate (CTR) from ${Number(top?.impressions || 0).toLocaleString()} impressions and ${Number(top?.clicks || 0).toLocaleString()} clicks.`;
      const chart: AiChartSpec = {
        type: 'bar',
        title: 'Campaign Click-Through Rate (CTR %)',
        xKey: 'campaign_name',
        series: ['ctr_pct'],
        data: rows.map((r) => ({
          campaign_name: String(r.campaign_name),
          ctr_pct: Number((Number(r.ctr || 0) * 100).toFixed(2)),
        })),
      };
      return {
        answer,
        recommendations: [
          'Examine ad copy and creative formats in top-CTR campaigns to use as templates.',
          'Refresh job titles or headlines on campaigns with CTR below 1.5%.',
        ],
        chart,
        confidence: 0.94,
      };
    },
  },

  // 7. Funnel Counts per Job
  {
    id: 'funnel_counts_per_job',
    name: 'Funnel Counts per Job',
    matches: (q) =>
      q.includes('funnel') && (q.includes('job') || q.includes('counts') || q.includes('stage')),
    generateSql: () =>
      `SELECT job_title, SUM(impressions) AS impressions, SUM(clicks) AS clicks, SUM(applications) AS applications, SUM(interviews) AS interviews, SUM(hires) AS hires FROM v_job_funnel_daily GROUP BY job_title ORDER BY applications DESC LIMIT 10;`,
    narrate: (rows) => {
      const topJob = rows[0];
      const answer = `"${topJob?.job_title}" has recorded the largest candidate pipeline volume: ${Number(topJob?.impressions || 0).toLocaleString()} impressions, ${Number(topJob?.clicks || 0).toLocaleString()} clicks, ${Number(topJob?.applications || 0).toLocaleString()} applications, ${Number(topJob?.interviews || 0).toLocaleString()} interviews, and ${Number(topJob?.hires || 0).toLocaleString()} hires.`;
      const chart: AiChartSpec = {
        type: 'bar',
        title: 'Funnel Volume for Top Jobs',
        xKey: 'job_title',
        series: ['applications', 'interviews', 'hires'],
        data: rows.slice(0, 5).map((r) => ({
          job_title: String(r.job_title),
          applications: Number(r.applications),
          interviews: Number(r.interviews),
          hires: Number(r.hires),
        })),
      };
      return {
        answer,
        recommendations: [
          'Review interview-to-hire conversion velocity across active roles.',
          'Ensure recruiter hiring manager review times do not bottleneck large application pipelines.',
        ],
        chart,
        confidence: 0.96,
      };
    },
  },

  // 8. Interview Rate by Publisher
  {
    id: 'interview_rate_by_publisher',
    name: 'Interview Rate by Publisher',
    matches: (q) =>
      (q.includes('interview rate') || q.includes('interviews')) && q.includes('publisher'),
    generateSql: () =>
      `SELECT publisher_name, ROUND(SUM(interviews)::numeric / NULLIF(SUM(applications), 0), 4) AS interview_rate, SUM(applications) AS applications, SUM(interviews) AS interviews FROM v_publisher_performance_daily GROUP BY publisher_name HAVING SUM(applications) > 0 ORDER BY interview_rate DESC LIMIT 10;`,
    narrate: (rows) => {
      const top = rows[0];
      const answer = `${top?.publisher_name} delivers the highest candidate interview rate at ${(Number(top?.interview_rate || 0) * 100).toFixed(1)}%, converting ${Number(top?.interviews || 0).toLocaleString()} interviewees from ${Number(top?.applications || 0).toLocaleString()} applicants.`;
      const chart: AiChartSpec = {
        type: 'bar',
        title: 'Interview Rate by Publisher (%)',
        xKey: 'publisher_name',
        series: ['interview_rate_pct'],
        data: rows.map((r) => ({
          publisher_name: String(r.publisher_name),
          interview_rate_pct: Number((Number(r.interview_rate || 0) * 100).toFixed(1)),
        })),
      };
      return {
        answer,
        recommendations: [
          `Prioritize candidate qualification pipelines from ${top?.publisher_name}.`,
          'Channel with higher interview rates typically yields better downstream retention.',
        ],
        chart,
        confidence: 0.95,
      };
    },
  },

  // 9. Cost Per Hire (CPH) Ranking
  {
    id: 'cost_per_hire_ranking',
    name: 'Cost Per Hire Ranking',
    matches: (q) =>
      (q.includes('cph') || q.includes('cost per hire')) || (q.includes('hire') && (q.includes('cost') || q.includes('spend'))),
    generateSql: () =>
      `SELECT campaign_name, job_title, ROUND(SUM(spend_to_date) / NULLIF(SUM(hires), 0), 2) AS cph, SUM(hires) AS hires, SUM(spend_to_date) AS spend FROM v_campaign_summary GROUP BY campaign_name, job_title HAVING SUM(hires) > 0 ORDER BY cph ASC LIMIT 10;`,
    narrate: (rows) => {
      const lowest = rows[0];
      const highest = rows[rows.length - 1] || lowest;
      if (!lowest || !highest) {
        return {
          answer: 'No campaign Cost Per Hire (CPH) data is currently recorded with positive hires.',
          recommendations: [],
          confidence: 0.9,
        };
      }
      const answer = `The most cost-effective campaign by Cost Per Hire (CPH) is "${lowest.campaign_name}" (${lowest.job_title}) at ₹${Number(lowest.cph).toLocaleString()} per hire. In contrast, "${highest.campaign_name}" has the highest CPH at ₹${Number(highest.cph).toLocaleString()}.`;
      const chart: AiChartSpec = {
        type: 'bar',
        title: 'Cost Per Hire (CPH) by Campaign (₹)',
        xKey: 'campaign_name',
        series: ['cph'],
        data: rows.map((r) => ({
          campaign_name: String(r.campaign_name),
          cph: Number(r.cph),
        })),
      };
      return {
        answer,
        recommendations: [
          `Leverage the channel mix from "${lowest.campaign_name}" for future similar job openings.`,
          `Set up candidate re-engagement to reduce reliance on paid channels for expensive roles.`,
        ],
        chart,
        confidence: 0.96,
      };
    },
  },

  // 10. Top Campaigns by Qualified Applications
  {
    id: 'top_campaigns_by_qualified_applications',
    name: 'Top Campaigns by Qualified Applications',
    matches: (q) =>
      q.includes('qualified') && (q.includes('campaign') || q.includes('top')),
    generateSql: () =>
      `SELECT campaign_name, job_title, SUM(qualified_applications) AS qualified_applications, SUM(applications) AS total_applications FROM v_job_funnel_daily GROUP BY campaign_name, job_title ORDER BY qualified_applications DESC LIMIT 10;`,
    narrate: (rows) => {
      const top = rows[0];
      const qualRate = Number(top?.total_applications) > 0
        ? ((Number(top?.qualified_applications) / Number(top?.total_applications)) * 100).toFixed(1)
        : '0';
      const answer = `Campaign "${top?.campaign_name}" leads in qualified candidate volume with ${Number(top?.qualified_applications).toLocaleString()} qualified applications out of ${Number(top?.total_applications).toLocaleString()} total (${qualRate}% qualification rate).`;
      const chart: AiChartSpec = {
        type: 'bar',
        title: 'Qualified Applications by Campaign',
        xKey: 'campaign_name',
        series: ['qualified_applications'],
        data: rows.map((r) => ({
          campaign_name: String(r.campaign_name),
          qualified_applications: Number(r.qualified_applications),
        })),
      };
      return {
        answer,
        recommendations: [
          'Review mandatory pre-screening filters to ensure they remain calibrated.',
          'Maintain high recruiter responsiveness on candidates passing qualification gates.',
        ],
        chart,
        confidence: 0.94,
      };
    },
  },

  // 11. Jobs by Status
  {
    id: 'jobs_by_status',
    name: 'Jobs by Status',
    matches: (q) =>
      q.includes('job') && (q.includes('status') || q.includes('open jobs') || q.includes('how many jobs')),
    generateSql: () =>
      `SELECT status, COUNT(*) AS count FROM v_jobs_overview GROUP BY status ORDER BY count DESC LIMIT 10;`,
    narrate: (rows) => {
      const totalJobs = rows.reduce((sum, r) => sum + Number(r.count || 0), 0);
      const openCount = rows.find((r) => String(r.status).toUpperCase() === 'OPEN')?.count || 0;
      const statusBreakdown = rows.map((r) => `${r.status}: ${r.count}`).join(', ');
      const answer = `You currently have ${totalJobs} total jobs across the organization (${openCount} active OPEN positions). Breakdown by status: ${statusBreakdown}.`;
      const chart: AiChartSpec = {
        type: 'bar',
        title: 'Jobs Breakdown by Status',
        xKey: 'status',
        series: ['count'],
        data: rows.map((r) => ({
          status: String(r.status),
          count: Number(r.count),
        })),
      };
      return {
        answer,
        recommendations: [
          'Audit PAUSED and DRAFT jobs to decide whether to activate or close them.',
          'Ensure all OPEN jobs have active marketing campaigns configured.',
        ],
        chart,
        confidence: 0.97,
      };
    },
  },

  // 12. Applications by Source
  {
    id: 'applications_by_source',
    name: 'Applications by Source',
    matches: (q) =>
      q.includes('source') || (q.includes('application') && (q.includes('channel') || q.includes('where'))),
    generateSql: () =>
      `SELECT source, COUNT(*) AS total_applications FROM v_applications_overview GROUP BY source ORDER BY total_applications DESC LIMIT 10;`,
    narrate: (rows) => {
      const total = rows.reduce((sum, r) => sum + Number(r.total_applications || 0), 0);
      const top = rows[0];
      const share = total > 0 ? ((Number(top?.total_applications || 0) / total) * 100).toFixed(1) : '0';
      const answer = `Primary candidate sourcing channel is "${top?.source}" generating ${Number(top?.total_applications || 0).toLocaleString()} applications (${share}% of all ${total.toLocaleString()} applications).`;
      const chart: AiChartSpec = {
        type: 'bar',
        title: 'Applications by Source Channel',
        xKey: 'source',
        series: ['total_applications'],
        data: rows.map((r) => ({
          source: String(r.source),
          total_applications: Number(r.total_applications),
        })),
      };
      return {
        answer,
        recommendations: [
          `Diversify candidate sourcing to prevent over-reliance on "${top?.source}".`,
          'Monitor interview conversion rate across organic vs paid sources.',
        ],
        chart,
        confidence: 0.95,
      };
    },
  },

  // 13. Month-over-Month Applications
  {
    id: 'month_over_month_applications',
    name: 'Month-over-Month Applications',
    matches: (q) =>
      q.includes('month') && (q.includes('application') || q.includes('trend') || q.includes('mom')),
    generateSql: () =>
      `SELECT DATE_TRUNC('month', date) AS month, SUM(applications) AS total_applications, SUM(hires) AS total_hires, SUM(spend) AS total_spend FROM v_job_funnel_daily GROUP BY month ORDER BY month DESC LIMIT 6;`,
    narrate: (rows) => {
      const sorted = [...rows].sort((a, b) => new Date(String(a.month)).getTime() - new Date(String(b.month)).getTime());
      const latest = sorted[sorted.length - 1];
      const previous = sorted.length > 1 ? sorted[sorted.length - 2] : null;
      let trendText = '';
      if (previous && latest) {
        const diff = Number(latest.total_applications) - Number(previous.total_applications);
        const pct = Number(previous.total_applications) > 0
          ? ((diff / Number(previous.total_applications)) * 100).toFixed(1)
          : '0';
        trendText = ` Compared to the previous month (${Number(previous.total_applications).toLocaleString()} applications), volume shifted by ${diff >= 0 ? '+' : ''}${pct}%.`;
      }
      const answer = `Monthly recruitment application tracking across the last ${sorted.length} months shows ${Number(latest?.total_applications || 0).toLocaleString()} applications in the most recent month.${trendText}`;
      const chart: AiChartSpec = {
        type: 'bar',
        title: 'Monthly Application Trends',
        xKey: 'month',
        series: ['total_applications'],
        data: sorted.map((r) => ({
          month: new Date(String(r.month)).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
          total_applications: Number(r.total_applications),
        })),
      };
      return {
        answer,
        recommendations: [
          'Align quarterly headcount goals with month-over-month hiring throughput.',
          'Review recruitment spend pacing relative to seasonal applicant spikes.',
        ],
        chart,
        confidence: 0.94,
      };
    },
  },
];

/**
 * Finds a matching SQL template based on a user question.
 * Falls back to lowest_cpa_by_publisher or spend_by_publisher if no exact match.
 */
export function matchSqlTemplate(question: string): SqlTemplate {
  const q = question.toLowerCase();
  for (const template of SQL_TEMPLATES) {
    if (template.matches(q)) {
      return template;
    }
  }
  // Default fallback to lowest CPA by publisher
  return SQL_TEMPLATES[0]!;
}
