-- Create View: v_job_funnel_daily
CREATE OR REPLACE VIEW v_job_funnel_daily AS
SELECT
    c."organizationId" AS organization_id,
    e.event_date AS date,
    c.id AS campaign_id,
    c.name AS campaign_name,
    j.id AS job_id,
    j.title AS job_title,
    COALESCE(e.impressions, 0)::BIGINT AS impressions,
    COALESCE(e.clicks, 0)::BIGINT AS clicks,
    COALESCE(e.application_starts, 0)::BIGINT AS application_starts,
    COALESCE(e.applications, 0)::BIGINT AS applications,
    COALESCE(e.qualified_applications, 0)::BIGINT AS qualified_applications,
    COALESCE(e.interviews, 0)::BIGINT AS interviews,
    COALESCE(e.hires, 0)::BIGINT AS hires,
    COALESCE(s.spend, 0)::NUMERIC(12,2) AS spend
FROM "Campaign" c
JOIN "Job" j ON c."jobId" = j.id
LEFT JOIN (
    SELECT
        ce."campaignId",
        DATE(ce."timestamp") AS event_date,
        SUM(CASE WHEN ce."eventType" = 'IMPRESSION' THEN ce.quantity ELSE 0 END) AS impressions,
        SUM(CASE WHEN ce."eventType" = 'CLICK' THEN ce.quantity ELSE 0 END) AS clicks,
        SUM(CASE WHEN ce."eventType" = 'APPLICATION_START' THEN ce.quantity ELSE 0 END) AS application_starts,
        SUM(CASE WHEN ce."eventType" = 'APPLICATION' THEN ce.quantity ELSE 0 END) AS applications,
        SUM(CASE WHEN ce."eventType" = 'APPLICATION' THEN ce."qualifiedQuantity" ELSE 0 END) AS qualified_applications,
        SUM(CASE WHEN ce."eventType" = 'INTERVIEW' THEN ce.quantity ELSE 0 END) AS interviews,
        SUM(CASE WHEN ce."eventType" = 'HIRE' THEN ce.quantity ELSE 0 END) AS hires
    FROM "CampaignEvent" ce
    GROUP BY ce."campaignId", DATE(ce."timestamp")
) e ON c.id = e."campaignId"
LEFT JOIN (
    SELECT
        cs."campaignId",
        cs.date AS spend_date,
        SUM(cs.amount) AS spend
    FROM "CampaignSpend" cs
    GROUP BY cs."campaignId", cs.date
) s ON c.id = s."campaignId" AND e.event_date = s.spend_date
WHERE (
    current_setting('app.org_id', true) IS NULL
    OR current_setting('app.org_id', true) = ''
    OR c."organizationId" = current_setting('app.org_id', true)::uuid
);

-- Create View: v_publisher_performance_daily
CREATE OR REPLACE VIEW v_publisher_performance_daily AS
SELECT
    c."organizationId" AS organization_id,
    e.event_date AS date,
    c.id AS campaign_id,
    p.id AS publisher_id,
    p.name AS publisher_name,
    COALESCE(e.impressions, 0)::BIGINT AS impressions,
    COALESCE(e.clicks, 0)::BIGINT AS clicks,
    COALESCE(e.applications, 0)::BIGINT AS applications,
    COALESCE(e.qualified_applications, 0)::BIGINT AS qualified_applications,
    COALESCE(e.interviews, 0)::BIGINT AS interviews,
    COALESCE(e.hires, 0)::BIGINT AS hires,
    COALESCE(s.amount, 0)::NUMERIC(12,2) AS spend,
    ROUND((COALESCE(e.clicks, 0)::NUMERIC / NULLIF(COALESCE(e.impressions, 0), 0)), 4) AS ctr,
    ROUND((COALESCE(e.applications, 0)::NUMERIC / NULLIF(COALESCE(e.clicks, 0), 0)), 4) AS application_rate,
    ROUND((COALESCE(s.amount, 0)::NUMERIC / NULLIF(COALESCE(e.clicks, 0), 0)), 2) AS cpc,
    ROUND((COALESCE(s.amount, 0)::NUMERIC / NULLIF(COALESCE(e.applications, 0), 0)), 2) AS cpa,
    ROUND((COALESCE(s.amount, 0)::NUMERIC / NULLIF(COALESCE(e.hires, 0), 0)), 2) AS cph
FROM "Campaign" c
CROSS JOIN "Publisher" p
LEFT JOIN (
    SELECT
        ce."campaignId",
        ce."publisherId",
        DATE(ce."timestamp") AS event_date,
        SUM(CASE WHEN ce."eventType" = 'IMPRESSION' THEN ce.quantity ELSE 0 END) AS impressions,
        SUM(CASE WHEN ce."eventType" = 'CLICK' THEN ce.quantity ELSE 0 END) AS clicks,
        SUM(CASE WHEN ce."eventType" = 'APPLICATION' THEN ce.quantity ELSE 0 END) AS applications,
        SUM(CASE WHEN ce."eventType" = 'APPLICATION' THEN ce."qualifiedQuantity" ELSE 0 END) AS qualified_applications,
        SUM(CASE WHEN ce."eventType" = 'INTERVIEW' THEN ce.quantity ELSE 0 END) AS interviews,
        SUM(CASE WHEN ce."eventType" = 'HIRE' THEN ce.quantity ELSE 0 END) AS hires
    FROM "CampaignEvent" ce
    GROUP BY ce."campaignId", ce."publisherId", DATE(ce."timestamp")
) e ON c.id = e."campaignId" AND p.id = e."publisherId"
LEFT JOIN "CampaignSpend" s ON c.id = s."campaignId" AND p.id = s."publisherId" AND e.event_date = s.date
WHERE (
    current_setting('app.org_id', true) IS NULL
    OR current_setting('app.org_id', true) = ''
    OR c."organizationId" = current_setting('app.org_id', true)::uuid
);

-- Create View: v_campaign_summary
CREATE OR REPLACE VIEW v_campaign_summary AS
SELECT
    c."organizationId" AS organization_id,
    c.id AS campaign_id,
    c.name AS campaign_name,
    j.title AS job_title,
    c.status AS status,
    c.budget AS budget,
    COALESCE(s.total_spend, 0)::NUMERIC(12,2) AS spend_to_date,
    COALESCE(e.total_impressions, 0)::BIGINT AS impressions,
    COALESCE(e.total_clicks, 0)::BIGINT AS clicks,
    COALESCE(e.total_applications, 0)::BIGINT AS applications,
    COALESCE(e.total_interviews, 0)::BIGINT AS interviews,
    COALESCE(e.total_hires, 0)::BIGINT AS hires,
    ROUND((COALESCE(s.total_spend, 0)::NUMERIC / NULLIF(COALESCE(e.total_applications, 0), 0)), 2) AS cpa,
    ROUND((COALESCE(s.total_spend, 0)::NUMERIC / NULLIF(COALESCE(e.total_hires, 0), 0)), 2) AS cph
FROM "Campaign" c
JOIN "Job" j ON c."jobId" = j.id
LEFT JOIN (
    SELECT
        ce."campaignId",
        SUM(CASE WHEN ce."eventType" = 'IMPRESSION' THEN ce.quantity ELSE 0 END) AS total_impressions,
        SUM(CASE WHEN ce."eventType" = 'CLICK' THEN ce.quantity ELSE 0 END) AS total_clicks,
        SUM(CASE WHEN ce."eventType" = 'APPLICATION' THEN ce.quantity ELSE 0 END) AS total_applications,
        SUM(CASE WHEN ce."eventType" = 'INTERVIEW' THEN ce.quantity ELSE 0 END) AS total_interviews,
        SUM(CASE WHEN ce."eventType" = 'HIRE' THEN ce.quantity ELSE 0 END) AS total_hires
    FROM "CampaignEvent" ce
    GROUP BY ce."campaignId"
) e ON c.id = e."campaignId"
LEFT JOIN (
    SELECT
        cs."campaignId",
        SUM(cs.amount) AS total_spend
    FROM "CampaignSpend" cs
    GROUP BY cs."campaignId"
) s ON c.id = s."campaignId"
WHERE (
    current_setting('app.org_id', true) IS NULL
    OR current_setting('app.org_id', true) = ''
    OR c."organizationId" = current_setting('app.org_id', true)::uuid
);

-- Create View: v_applications_overview (privacy safe: NO candidate name or email)
CREATE OR REPLACE VIEW v_applications_overview AS
SELECT
    a."organizationId" AS organization_id,
    a.id AS application_id,
    j.title AS job_title,
    a.status AS status,
    a.source AS source,
    a."appliedAt" AS applied_at,
    c."experienceYears" AS candidate_experience_years,
    c.location AS candidate_location
FROM "Application" a
JOIN "Job" j ON a."jobId" = j.id
JOIN "Candidate" c ON a."candidateId" = c.id
WHERE (
    current_setting('app.org_id', true) IS NULL
    OR current_setting('app.org_id', true) = ''
    OR a."organizationId" = current_setting('app.org_id', true)::uuid
);

-- Create View: v_jobs_overview
CREATE OR REPLACE VIEW v_jobs_overview AS
SELECT
    j."organizationId" AS organization_id,
    j.id AS job_id,
    j.title AS title,
    j.category AS category,
    j.location AS location,
    j.status AS status,
    j."requiredSkills" AS required_skills,
    j."createdAt" AS created_at
FROM "Job" j
WHERE (
    current_setting('app.org_id', true) IS NULL
    OR current_setting('app.org_id', true) = ''
    OR j."organizationId" = current_setting('app.org_id', true)::uuid
);

-- Grant SELECT only on the views to tp_readonly
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'tp_readonly') THEN
    GRANT SELECT ON v_job_funnel_daily TO tp_readonly;
    GRANT SELECT ON v_publisher_performance_daily TO tp_readonly;
    GRANT SELECT ON v_campaign_summary TO tp_readonly;
    GRANT SELECT ON v_applications_overview TO tp_readonly;
    GRANT SELECT ON v_jobs_overview TO tp_readonly;
  END IF;
END $$;
