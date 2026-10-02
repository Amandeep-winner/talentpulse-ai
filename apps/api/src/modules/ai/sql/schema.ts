/**
 * Whitelisted database views and schema context for Text-to-SQL generation.
 * Only views prefixed with 'v_' are accessible to the Text-to-SQL engine.
 */

export const ALLOWED_VIEWS = [
  'v_job_funnel_daily',
  'v_publisher_performance_daily',
  'v_campaign_summary',
  'v_applications_overview',
  'v_jobs_overview',
] as const;

export type AllowedViewName = typeof ALLOWED_VIEWS[number];

export interface ViewColumnDefinition {
  name: string;
  type: string;
  description: string;
}

export interface ViewDefinition {
  name: AllowedViewName;
  description: string;
  columns: ViewColumnDefinition[];
}

export const SCHEMA_VIEWS: ViewDefinition[] = [
  {
    name: 'v_job_funnel_daily',
    description: 'Daily aggregate funnel metrics (impressions, clicks, starts, applications, qualified, interviews, hires, spend) broken down by job and campaign.',
    columns: [
      { name: 'organization_id', type: 'UUID', description: 'Tenant identifier automatically scoped by session' },
      { name: 'date', type: 'DATE', description: 'Date of the events and spend (YYYY-MM-DD)' },
      { name: 'campaign_id', type: 'UUID', description: 'Identifier of the marketing campaign' },
      { name: 'campaign_name', type: 'VARCHAR', description: 'Descriptive title of the campaign' },
      { name: 'job_id', type: 'UUID', description: 'Identifier of the associated job posting' },
      { name: 'job_title', type: 'VARCHAR', description: 'Job role title (e.g., Senior Backend Engineer)' },
      { name: 'impressions', type: 'BIGINT', description: 'Number of ad impressions delivered' },
      { name: 'clicks', type: 'BIGINT', description: 'Number of ad clicks recorded' },
      { name: 'application_starts', type: 'BIGINT', description: 'Number of candidates who started the application form' },
      { name: 'applications', type: 'BIGINT', description: 'Number of submitted job applications' },
      { name: 'qualified_applications', type: 'BIGINT', description: 'Number of applications meeting mandatory qualifications' },
      { name: 'interviews', type: 'BIGINT', description: 'Number of candidates reaching the interview stage' },
      { name: 'hires', type: 'BIGINT', description: 'Number of candidates hired' },
      { name: 'spend', type: 'NUMERIC(12,2)', description: 'Total advertising expenditure in INR (₹)' },
    ],
  },
  {
    name: 'v_publisher_performance_daily',
    description: 'Daily publisher channel performance metrics and calculated conversion rates and costs (CTR, application rate, CPC, CPA, CPH).',
    columns: [
      { name: 'organization_id', type: 'UUID', description: 'Tenant identifier automatically scoped by session' },
      { name: 'date', type: 'DATE', description: 'Date of the performance record' },
      { name: 'campaign_id', type: 'UUID', description: 'Identifier of the marketing campaign' },
      { name: 'publisher_id', type: 'UUID', description: 'Identifier of the recruitment marketing channel/publisher' },
      { name: 'publisher_name', type: 'VARCHAR', description: 'Name of the publisher (JobBoard Prime, SocialReach, SearchHire, AggregatorX, ReferralNet)' },
      { name: 'impressions', type: 'BIGINT', description: 'Impression count' },
      { name: 'clicks', type: 'BIGINT', description: 'Click count' },
      { name: 'applications', type: 'BIGINT', description: 'Submitted applications' },
      { name: 'qualified_applications', type: 'BIGINT', description: 'Qualified application count' },
      { name: 'interviews', type: 'BIGINT', description: 'Interview count' },
      { name: 'hires', type: 'BIGINT', description: 'Hires count' },
      { name: 'spend', type: 'NUMERIC(12,2)', description: 'Advertising spend in INR (₹)' },
      { name: 'ctr', type: 'NUMERIC', description: 'Click-Through Rate (clicks / impressions)' },
      { name: 'application_rate', type: 'NUMERIC', description: 'Application conversion rate (applications / clicks)' },
      { name: 'cpc', type: 'NUMERIC', description: 'Cost Per Click in INR (₹) (spend / clicks)' },
      { name: 'cpa', type: 'NUMERIC', description: 'Cost Per Acquisition/Application in INR (₹) (spend / applications)' },
      { name: 'cph', type: 'NUMERIC', description: 'Cost Per Hire in INR (₹) (spend / hires)' },
    ],
  },
  {
    name: 'v_campaign_summary',
    description: 'All-time cumulative performance summary per campaign with budget, total spend, funnel aggregates, CPA, and CPH.',
    columns: [
      { name: 'organization_id', type: 'UUID', description: 'Tenant identifier automatically scoped by session' },
      { name: 'campaign_id', type: 'UUID', description: 'Campaign unique identifier' },
      { name: 'campaign_name', type: 'VARCHAR', description: 'Campaign name' },
      { name: 'job_title', type: 'VARCHAR', description: 'Job title linked to this campaign' },
      { name: 'status', type: 'VARCHAR', description: 'Campaign lifecycle status (DRAFT, ACTIVE, PAUSED, COMPLETED)' },
      { name: 'budget', type: 'NUMERIC(12,2)', description: 'Total allocated campaign budget in INR (₹)' },
      { name: 'spend_to_date', type: 'NUMERIC(12,2)', description: 'Total cumulative spend to date in INR (₹)' },
      { name: 'impressions', type: 'BIGINT', description: 'Total cumulative impressions' },
      { name: 'clicks', type: 'BIGINT', description: 'Total cumulative clicks' },
      { name: 'applications', type: 'BIGINT', description: 'Total cumulative applications' },
      { name: 'interviews', type: 'BIGINT', description: 'Total cumulative interviews' },
      { name: 'hires', type: 'BIGINT', description: 'Total cumulative hires' },
      { name: 'cpa', type: 'NUMERIC', description: 'Cumulative Cost Per Acquisition in INR (₹)' },
      { name: 'cph', type: 'NUMERIC', description: 'Cumulative Cost Per Hire in INR (₹)' },
    ],
  },
  {
    name: 'v_applications_overview',
    description: 'Privacy-safe application overview records without candidate personal identifiers (NO names, NO emails, NO phone numbers).',
    columns: [
      { name: 'organization_id', type: 'UUID', description: 'Tenant identifier automatically scoped by session' },
      { name: 'application_id', type: 'UUID', description: 'Application unique identifier' },
      { name: 'job_title', type: 'VARCHAR', description: 'Job title the candidate applied for' },
      { name: 'status', type: 'VARCHAR', description: 'Application workflow status (APPLIED, SCREENING, INTERVIEW, OFFER, HIRED, REJECTED, WITHDRAWN)' },
      { name: 'source', type: 'VARCHAR', description: 'Sourcing channel / publisher source' },
      { name: 'applied_at', type: 'TIMESTAMPTZ', description: 'Timestamp when application was submitted' },
      { name: 'candidate_experience_years', type: 'INT', description: 'Years of professional experience of the applicant' },
      { name: 'candidate_location', type: 'VARCHAR', description: 'Location (city / country) of candidate' },
    ],
  },
  {
    name: 'v_jobs_overview',
    description: 'Job catalogue, categories, hiring locations, status, and required skill sets.',
    columns: [
      { name: 'organization_id', type: 'UUID', description: 'Tenant identifier automatically scoped by session' },
      { name: 'job_id', type: 'UUID', description: 'Job unique identifier' },
      { name: 'title', type: 'VARCHAR', description: 'Job title' },
      { name: 'category', type: 'VARCHAR', description: 'Job department/category (engineering, sales, healthcare, operations, design)' },
      { name: 'location', type: 'VARCHAR', description: 'Job primary location (e.g. Bengaluru, Remote)' },
      { name: 'status', type: 'VARCHAR', description: 'Job status (OPEN, PAUSED, CLOSED, FILLED, DRAFT)' },
      { name: 'required_skills', type: 'TEXT[]', description: 'Array of required technical and functional skills' },
      { name: 'created_at', type: 'TIMESTAMPTZ', description: 'Creation timestamp' },
    ],
  },
];

export const FEW_SHOT_EXAMPLES = [
  {
    question: 'Which publisher has the lowest CPA?',
    sql: 'SELECT publisher_name, ROUND(SUM(spend) / NULLIF(SUM(applications), 0), 2) AS cpa, SUM(applications) AS total_applications, SUM(spend) AS total_spend FROM v_publisher_performance_daily GROUP BY publisher_name HAVING SUM(applications) > 0 ORDER BY cpa ASC LIMIT 10;',
  },
  {
    question: 'Show applications by week over time',
    sql: 'SELECT DATE_TRUNC(\'week\', date) AS week, SUM(applications) AS total_applications FROM v_job_funnel_daily GROUP BY week ORDER BY week DESC LIMIT 12;',
  },
  {
    question: 'What is our spend by publisher over the last 30 days?',
    sql: 'SELECT publisher_name, SUM(spend) AS total_spend, SUM(clicks) AS total_clicks FROM v_publisher_performance_daily WHERE date >= CURRENT_DATE - INTERVAL \'30 days\' GROUP BY publisher_name ORDER BY total_spend DESC LIMIT 10;',
  },
  {
    question: 'How many hires do we have by campaign?',
    sql: 'SELECT campaign_name, job_title, SUM(hires) AS total_hires, SUM(applications) AS total_applications FROM v_campaign_summary GROUP BY campaign_name, job_title ORDER BY total_hires DESC LIMIT 10;',
  },
];

/**
 * Builds the schema context prompt describing available views and few-shot examples for text-to-SQL.
 */
export function getSchemaContextPrompt(): string {
  const viewsDescription = SCHEMA_VIEWS.map((v) => {
    const colList = v.columns.map((c) => `    - ${c.name} (${c.type}): ${c.description}`).join('\n');
    return `VIEW: ${v.name}\nDescription: ${v.description}\nColumns:\n${colList}`;
  }).join('\n\n');

  const examples = FEW_SHOT_EXAMPLES.map(
    (ex, i) => `Example ${i + 1}:\nQuestion: "${ex.question}"\nSQL: ${ex.sql}`
  ).join('\n\n');

  return `
You are a specialized SQL generation assistant for TalentPulse AI recruitment intelligence.
You MUST generate ONLY PostgreSQL SELECT queries referencing ONLY the whitelisted views below.

RULES:
1. ONLY reference these views: ${ALLOWED_VIEWS.join(', ')}. Never reference any underlying tables or system schemas.
2. The views are already tenant-isolated by the database session. Do NOT filter by organization_id explicitly unless matching a specific column.
3. NEVER use comments (-- or /* */) or semicolons.
4. Return ONLY valid SELECT statements. No DDL, no DML, no EXECUTE, no administrative statements.
5. Limit results appropriately (maximum 500 rows).

DATABASE SCHEMA:
${viewsDescription}

FEW-SHOT EXAMPLES:
${examples}
`.trim();
}
