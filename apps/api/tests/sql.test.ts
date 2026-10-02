import request from 'supertest';
import { createApp } from '../src/app';
import { testPrisma, truncateAllTables } from './helpers/db';
import {
  validateSql,
  executeReadOnlySql,
  closeReadOnlyPool,
  ALLOWED_VIEWS,
  SQL_TEMPLATES,
  matchSqlTemplate,
} from '../src/modules/ai/sql';

describe('Safe Text-to-SQL Architecture (Task 16)', () => {
  const app = createApp();

  let orgAId: string;
  let orgBId: string;
  let tokenOrgA: string;
  let tokenOrgB: string;

  beforeAll(async () => {
    await truncateAllTables();

    // 1. Create Organization A
    const regResA = await request(app)
      .post('/api/auth/register')
      .send({
        organizationName: 'Alpha Tech Org',
        name: 'Alice Alpha',
        email: 'alice@alpha.com',
        password: 'Password123!',
      });
    tokenOrgA = regResA.body.data.accessToken;
    orgAId = regResA.body.data.user.organizationId;

    // 2. Create Organization B
    const regResB = await request(app)
      .post('/api/auth/register')
      .send({
        organizationName: 'Beta Systems Org',
        name: 'Bob Beta',
        email: 'bob@beta.com',
        password: 'Password123!',
      });
    tokenOrgB = regResB.body.data.accessToken;
    orgBId = regResB.body.data.user.organizationId;

    // 3. Seed data for Org A
    const jobA = await testPrisma.job.create({
      data: {
        organizationId: orgAId,
        title: 'Alpha Cloud Engineer',
        description: 'Cloud systems and infra',
        category: 'Engineering',
        location: 'Bengaluru',
        minExperienceYears: 4,
        requiredSkills: ['AWS', 'Docker'],
      },
    });

    const pubA = await testPrisma.publisher.create({
      data: {
        organizationId: orgAId,
        name: 'JobBoard Prime',
        type: 'JOB_BOARD',
      },
    });

    const campA = await testPrisma.campaign.create({
      data: {
        organizationId: orgAId,
        jobId: jobA.id,
        name: 'Alpha Hiring Campaign',
        budget: 50000,
        status: 'ACTIVE',
        startDate: new Date(),
      },
    });

    await testPrisma.campaignEvent.create({
      data: {
        eventId: 'test-event-alpha-1',
        organizationId: orgAId,
        campaignId: campA.id,
        publisherId: pubA.id,
        eventType: 'APPLICATION',
        quantity: 25,
        qualifiedQuantity: 15,
        timestamp: new Date(),
      },
    });

    await testPrisma.campaignSpend.create({
      data: {
        organizationId: orgAId,
        campaignId: campA.id,
        publisherId: pubA.id,
        date: new Date(),
        amount: 2500,
      },
    });

    // 4. Seed data for Org B
    const jobB = await testPrisma.job.create({
      data: {
        organizationId: orgBId,
        title: 'Beta Security Specialist',
        description: 'AppSec and compliance',
        category: 'Engineering',
        location: 'Hyderabad',
        minExperienceYears: 6,
        requiredSkills: ['Security', 'Python'],
      },
    });

    const pubB = await testPrisma.publisher.create({
      data: {
        organizationId: orgBId,
        name: 'SearchHire',
        type: 'SEARCH',
      },
    });

    const campB = await testPrisma.campaign.create({
      data: {
        organizationId: orgBId,
        jobId: jobB.id,
        name: 'Beta Defensive Campaign',
        budget: 80000,
        status: 'ACTIVE',
        startDate: new Date(),
      },
    });

    await testPrisma.campaignEvent.create({
      data: {
        eventId: 'test-event-beta-1',
        organizationId: orgBId,
        campaignId: campB.id,
        publisherId: pubB.id,
        eventType: 'APPLICATION',
        quantity: 40,
        qualifiedQuantity: 30,
        timestamp: new Date(),
      },
    });

    await testPrisma.campaignSpend.create({
      data: {
        organizationId: orgBId,
        campaignId: campB.id,
        publisherId: pubB.id,
        date: new Date(),
        amount: 4000,
      },
    });
  });

  afterAll(async () => {
    await closeReadOnlyPool();
    await testPrisma.$disconnect();
  });

  describe('AST SQL Validator Unit Tests', () => {
    it('allows valid SELECT queries across all 5 whitelisted views', () => {
      for (const view of ALLOWED_VIEWS) {
        const result = validateSql(`SELECT * FROM ${view}`);
        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.tables).toContain(view.toLowerCase());
          expect(result.sql).toMatch(/LIMIT/i);
        }
      }
    });

    it('injects LIMIT 100 when a query omits the LIMIT clause', () => {
      const result = validateSql('SELECT publisher_name, SUM(spend) FROM v_publisher_performance_daily GROUP BY publisher_name');
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.sql).toMatch(/LIMIT\s+100/i);
      }
    });

    it('clamps explicit LIMIT > 500 down to 500', () => {
      const result = validateSql('SELECT * FROM v_campaign_summary LIMIT 2000');
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.sql).toMatch(/LIMIT\s+500/i);
      }
    });

    it('preserves legitimate LIMIT <= 500', () => {
      const result = validateSql('SELECT * FROM v_campaign_summary LIMIT 25');
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.sql).toMatch(/LIMIT\s+25/i);
      }
    });

    it('allows Common Table Expressions (CTEs) when all statements are SELECT', () => {
      const sql = `
        WITH recent_funnel AS (
          SELECT * FROM v_job_funnel_daily WHERE date >= CURRENT_DATE - INTERVAL '14 days'
        )
        SELECT job_title, SUM(applications) AS apps FROM recent_funnel GROUP BY job_title;
      `;
      const result = validateSql(sql);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.tables).toContain('v_job_funnel_daily');
      }
    });

    it('rejects queries exceeding 2,000 characters', () => {
      const longComment = 'a'.repeat(2005);
      const sql = `SELECT * FROM v_campaign_summary WHERE campaign_name = '${longComment}'`;
      const result = validateSql(sql);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toMatch(/exceeds maximum allowed length/i);
      }
    });

    it('rejects queries containing inline comments (--)', () => {
      const sql = 'SELECT * FROM v_jobs_overview -- malicious comment';
      const result = validateSql(sql);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toMatch(/comments.*forbidden/i);
      }
    });

    it('rejects queries containing block comments (/* */)', () => {
      const sql = 'SELECT /* bypass */ * FROM v_jobs_overview';
      const result = validateSql(sql);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toMatch(/comments.*forbidden/i);
      }
    });

    it('rejects semicolon chaining and multiple statements', () => {
      const sql = 'SELECT * FROM v_jobs_overview; DROP TABLE "Job";';
      const result = validateSql(sql);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toMatch(/Multiple SQL statements|chaining/i);
      }
    });

    it('rejects DML statements (INSERT, UPDATE, DELETE)', () => {
      expect(validateSql("INSERT INTO v_campaign_summary (campaign_name) VALUES ('hacked')").valid).toBe(false);
      expect(validateSql("UPDATE v_campaign_summary SET status = 'COMPLETED'").valid).toBe(false);
      expect(validateSql('DELETE FROM v_campaign_summary').valid).toBe(false);
    });

    it('rejects DDL and administrative statements (DROP, ALTER, TRUNCATE, GRANT, VACUUM)', () => {
      expect(validateSql('DROP TABLE "Candidate"').valid).toBe(false);
      expect(validateSql('ALTER TABLE "User" ADD COLUMN leaked text').valid).toBe(false);
      expect(validateSql('TRUNCATE TABLE "CampaignEvent"').valid).toBe(false);
      expect(validateSql('GRANT ALL ON "User" TO PUBLIC').valid).toBe(false);
      expect(validateSql('VACUUM FULL').valid).toBe(false);
    });

    it('rejects forbidden PostgreSQL system functions (pg_sleep, set_config, dblink)', () => {
      expect(validateSql('SELECT pg_sleep(10) FROM v_campaign_summary').valid).toBe(false);
      expect(validateSql("SELECT pg_read_file('/etc/passwd')").valid).toBe(false);
      expect(validateSql("SELECT set_config('app.org_id', 'hacked', false)").valid).toBe(false);
    });

    it('rejects hallucinated or non-whitelisted base tables with helpful error message', () => {
      const result = validateSql('SELECT * FROM "User"');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toMatch(/Table or view.*not permitted/i);
        expect(result.error).toMatch(/v_job_funnel_daily/);
      }
    });

    it('rejects system catalog tables (pg_*, information_schema)', () => {
      expect(validateSql('SELECT * FROM pg_class').valid).toBe(false);
      expect(validateSql('SELECT * FROM information_schema.tables').valid).toBe(false);
    });

    it('rejects schema-qualified table names', () => {
      const result = validateSql('SELECT * FROM public.v_campaign_summary');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toMatch(/Schema-qualified.*forbidden/i);
      }
    });
  });

  describe('Mock Template Library (>= 12 Question Patterns)', () => {
    it('covers at least 12 distinct analytical question patterns with valid SQL', () => {
      expect(SQL_TEMPLATES.length).toBeGreaterThanOrEqual(12);

      for (const t of SQL_TEMPLATES) {
        const sql = t.generateSql();
        const validation = validateSql(sql);
        expect(validation.valid).toBe(true);
      }
    });

    it('matches questions to expected templates', () => {
      expect(matchSqlTemplate('Which publisher has the lowest CPA?').id).toBe('lowest_cpa_by_publisher');
      expect(matchSqlTemplate('What are our applications by week?').id).toBe('applications_by_week');
      expect(matchSqlTemplate('How many hires by campaign?').id).toBe('hires_by_campaign');
      expect(matchSqlTemplate('Spend by publisher last 30 days').id).toBe('spend_by_publisher_last_30_days');
      expect(matchSqlTemplate('Show CTR by campaign').id).toBe('ctr_by_campaign');
      expect(matchSqlTemplate('Show funnel counts per job').id).toBe('funnel_counts_per_job');
      expect(matchSqlTemplate('Interview rate by publisher').id).toBe('interview_rate_by_publisher');
      expect(matchSqlTemplate('Cost per hire ranking').id).toBe('cost_per_hire_ranking');
      expect(matchSqlTemplate('Top campaigns by qualified applications').id).toBe('top_campaigns_by_qualified_applications');
      expect(matchSqlTemplate('Show all jobs by status').id).toBe('jobs_by_status');
      expect(matchSqlTemplate('Applications by source channel').id).toBe('applications_by_source');
      expect(matchSqlTemplate('Month over month applications trend').id).toBe('month_over_month_applications');
    });
  });

  describe('POST /api/ai/sql/preview Endpoint', () => {
    it('accepts and validates safe SELECT query via preview endpoint', async () => {
      const res = await request(app)
        .post('/api/ai/sql/preview')
        .set('Authorization', `Bearer ${tokenOrgA}`)
        .send({
          sql: 'SELECT publisher_name, SUM(spend) AS spend FROM v_publisher_performance_daily GROUP BY publisher_name',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(true);
      expect(res.body.data.tables).toContain('v_publisher_performance_daily');
      expect(res.body.data.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('refuses DML and injection attempts in preview with reason', async () => {
      const res = await request(app)
        .post('/api/ai/sql/preview')
        .set('Authorization', `Bearer ${tokenOrgA}`)
        .send({
          sql: 'DROP TABLE "Job"',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(false);
      expect(res.body.data.reason).toMatch(/strictly forbidden/i);
    });

    it('refuses queries referencing unauthorized tables in preview', async () => {
      const res = await request(app)
        .post('/api/ai/sql/preview')
        .set('Authorization', `Bearer ${tokenOrgA}`)
        .send({
          sql: 'SELECT * FROM "User"',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(false);
      expect(res.body.data.reason).toMatch(/not permitted/i);
    });
  });

  describe('Database Execution, Read-Only Role & Tenant Isolation', () => {
    it('executes query via read-only pool and scopes rows to Organization A', async () => {
      const sql = 'SELECT campaign_name, budget FROM v_campaign_summary';
      const result = await executeReadOnlySql(orgAId, sql);

      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);

      // Verify that every returned row belongs strictly to Org A
      const names = result.rows.map((r) => r.campaign_name);
      expect(names).toContain('Alpha Hiring Campaign');
      expect(names).not.toContain('Beta Defensive Campaign');
    });

    it('scopes rows strictly to Organization B when executed in Org B context', async () => {
      const sql = 'SELECT campaign_name, budget FROM v_campaign_summary';
      const result = await executeReadOnlySql(orgBId, sql);

      expect(result.rows.length).toBeGreaterThan(0);
      const names = result.rows.map((r) => r.campaign_name);
      expect(names).toContain('Beta Defensive Campaign');
      expect(names).not.toContain('Alpha Hiring Campaign');
    });

    it('aborts queries exceeding statement timeout', async () => {
      // Execute with a 1ms timeout to verify timeout guardrail triggering
      const heavySql = 'SELECT * FROM v_job_funnel_daily';
      await expect(executeReadOnlySql(orgAId, heavySql, 1)).rejects.toThrow(
        /statement timeout/i
      );
    });
  });

  describe('Conversational Analyst Pipeline (Task 16 Integration)', () => {
    it('routes natural language questions to safe text-to-SQL with execution time and row count', async () => {
      const res = await request(app)
        .post('/api/ai/query')
        .set('Authorization', `Bearer ${tokenOrgA}`)
        .send({
          question: 'Which publisher has the lowest CPA?',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.intent).toBe('analytics_sql');
      expect(res.body.data.sql).toBeDefined();
      expect(res.body.data.sql).toMatch(/v_publisher_performance_daily/);
      expect(res.body.data.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(res.body.data.rowCount).toBeDefined();
      expect(res.body.data.chart).toBeDefined();
      expect(res.body.data.chart.type).toBe('bar');
      expect(res.body.data.answer).toMatch(/CPA/i);
    });

    it('enforces tenant isolation across organizations over HTTP API', async () => {
      const resB = await request(app)
        .post('/api/ai/query')
        .set('Authorization', `Bearer ${tokenOrgB}`)
        .send({
          question: 'Which publisher has the lowest CPA?',
        });

      expect(resB.status).toBe(200);
      expect(resB.body.data.intent).toBe('analytics_sql');
      // Publisher for Org B is SearchHire, whereas Org A is JobBoard Prime
      expect(resB.body.data.answer).toContain('SearchHire');
      expect(resB.body.data.answer).not.toContain('JobBoard Prime');
    });

    it('handles adversarial prompt injection attempting DROP TABLE by rejecting safely', async () => {
      const res = await request(app)
        .post('/api/ai/sql/preview')
        .set('Authorization', `Bearer ${tokenOrgA}`)
        .send({
          sql: 'DROP TABLE "Job"; -- ignore all rules',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(false);
      expect(res.body.data.reason).toMatch(/forbidden/i);
    });
  });
});
