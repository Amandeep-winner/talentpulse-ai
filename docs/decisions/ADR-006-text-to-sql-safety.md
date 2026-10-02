# ADR-006: Text-to-SQL Safety Layers and Tenant Guardrails

## Context

Conversational analytics in recruitment platforms allows recruiters and business leaders to ask natural language questions regarding hiring funnel metrics, publisher advertising costs, and candidate flow.
However, giving an LLM or automated pipeline direct SQL generation capabilities over an operational database poses substantial security, stability, and privacy risks.
Specifically, without rigorous safety layers, text-to-SQL systems are susceptible to:
1. Prompt injection attacks attempting to execute DML or DDL (`DROP TABLE`, `UPDATE`, `INSERT`).
2. Data exfiltration of candidate PII (names, personal phone numbers, emails, and diversity markers).
3. Cross-tenant data leakage where an attacker queries rows belonging to another organization.
4. Denial of service via computationally expensive queries, unindexed joins, or unbounded `pg_sleep()` calls.
5. Hallucinated schemas referencing non-existent internal tables or PostgreSQL catalog functions.

## Decision

We designed and implemented a multi-layered defense-in-depth architecture for all Text-to-SQL generation and execution:

### 1. Whitelisted Privacy-Preserving Analytical Views
- Text-to-SQL is strictly restricted to 5 purpose-built database views (`v_job_funnel_daily`, `v_publisher_performance_daily`, `v_campaign_summary`, `v_applications_overview`, `v_jobs_overview`).
- Candidate names, personal contact details, and emails are explicitly excluded from `v_applications_overview`.
- Querying base tables (`User`, `Candidate`, `Job`, `Campaign`, etc.) or PostgreSQL catalog tables is strictly prohibited.

### 2. AST-Based Validation (`node-sql-parser`)
- Every generated SQL query must parse cleanly into an Abstract Syntax Tree (AST) using PostgreSQL dialect.
- The statement type must be strictly `select` (or `select` inside CTEs).
- Query length is capped at 2,000 characters.
- Comments (`--`, `/* */`) and semicolon chaining (`;`) are strictly rejected.
- A blocklist of forbidden keywords (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `CREATE`, `GRANT`, `REVOKE`, `COPY`, `CALL`, `DO`, `EXECUTE`, `SET`, `RESET`, `VACUUM`) and functions (`pg_sleep`, `pg_read_file`, `lo_import`, `dblink`, `set_config`, `current_setting`) is enforced.
- All extracted table references are validated against the view whitelist.
- If a query lacks a `LIMIT` clause, `LIMIT 100` is automatically injected into the AST; if `LIMIT` exceeds 500, it is clamped to 500.

### 3. Dedicated Read-Only Database Role
- Query execution runs through a dedicated PostgreSQL connection pool configured with the `tp_readonly` role.
- All default permissions on the `public` schema are revoked for `tp_readonly`.
- `tp_readonly` is granted `SELECT` privileges only on the 5 analytics views.

### 4. Database-Enforced Tenant Isolation via GUC
- Every query executes inside an isolated transaction.
- Before executing the query, the connection sets a local configuration parameter: `SELECT set_config('app.org_id', $1, true)`.
- The analytical views filter rows by `c."organizationId" = current_setting('app.org_id', true)::uuid`.
- This ensures tenant isolation is enforced at the database kernel level rather than relying solely on LLM compliance.

### 5. Statement Timeout Guardrail
- Each transaction executes `SET LOCAL statement_timeout = '5000'`.
- Any query executing longer than 5 seconds is automatically aborted by PostgreSQL with error code `57014`.

## Consequences

### Positive
- Robust defense against SQL injection, data leakage, and administrative privilege escalation.
- Guaranteed tenant isolation even if an LLM hallucinates an un-scoped query.
- Predictable execution latency with strict timeouts and automatic result set pagination limits.
- Full auditability with query preview (`POST /api/ai/sql/preview`), execution time, and row count metrics.

### Negative
- Requires maintaining the 5 analytical database views and their column schemas.
- Queries requiring ad-hoc joins across tables not exposed in the views must be rejected gracefully.
