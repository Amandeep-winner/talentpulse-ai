# TalentPulse AI - Engineering Diary

This diary documents non-trivial architecture challenges, technical decisions, alternatives explored, and outcomes achieved.

---

## Task 01 - Monorepo Bootstrap & Project Foundation

### Problem
Monorepo architectures can suffer from build friction and dependency divergence across micro-packages for types, schemas, and configurations.

### Decision
Consolidate cross-cutting Zod schemas and inferred TypeScript types into a single `@talentpulse/shared` package.

### Alternative
Create separate `@talentpulse/types`, `@talentpulse/validation`, and `@talentpulse/config` packages.

### Why
Merging into `@talentpulse/shared` eliminates multiple build steps, avoids cyclic workspace dependencies, and simplifies packaging between Next.js and Express.

### Result
Monorepo workspace initialized cleanly with uniform TypeScript configurations and fast compile times.

---

## Task 06 - Authentication & Authorization Architecture

### Problem
Multi-tenant recruitment platforms require secure access control, protection against stolen refresh tokens, and programmatic ingest capabilities without storing API keys in plaintext.

### Decision
Implement short-lived JWT access tokens held purely in client memory paired with cryptographically random 48-byte refresh tokens stored as SHA-256 hashes in PostgreSQL and delivered via HttpOnly cookies.
Enforce family-based refresh token rotation where reuse of any previously revoked token terminates and revokes the entire token family.
Implement role-based access control with ADMIN, RECRUITER, and ANALYST roles, and generate high-entropy prefix-hashed API keys for ingestion routes.

### Alternative
Store long-lived access tokens or session state directly in client localStorage, or use external SaaS authentication like Auth0/Clerk.

### Why
Self-contained JWT with family token rotation provides zero-trust security without external vendor costs or latency.
Keeping access tokens in memory prevents XSS extraction, while HttpOnly cookies with SameSite lax prevent CSRF attacks.
Hashing refresh tokens and API keys with SHA-256 ensures that even a database snapshot leak will not compromise live client credentials.

### Result
End-to-end authentication and authorization flow verified across Express and Next.js.
Passes full test suite including rotation, token reuse detection, cross-tenant isolation, role boundaries, and API key authentication.
Smoke test scripts in bash and PowerShell execute all steps successfully against live endpoints.

---

## Task 07 - Jobs, Candidates, and Resilient Caching Architecture

### Problem
High-volume recruitment dashboards create frequent read spikes on job requisitions and candidate records.
Candidate resumes come in variable formats (PDF, plain text) and require memory-bounded parsing.
Additionally, freeform user skill inputs lead to fragmentation, complicating future vector search and matching.

### Decision
Implement versioned namespace caching in Redis with single-flight mutex deduplication.
When writing new or updated job records, the organization namespace version is incremented atomically.
This invalidates all cached query variations instantly without scanning Redis keys.
For candidate resumes, enforce a 5MB memory storage limit in multer with stream-safe PDF text extraction using `pdf-parse`.
For skills, introduce a canonical taxonomy normalizer that lowercases, strips punctuation, and maps aliases to standardized tags on both write and query paths.

### Alternative
Use Redis SCAN/KEYS pattern matching for cache invalidation, and rely on external document parsing APIs.

### Why
Namespace version bumping is an O(1) atomic Redis operation that completely avoids blocking the Redis event loop with `KEYS *` scans.
In-memory PDF parsing with strict buffer ceilings avoids disk footprint and external SaaS dependencies.
Taxonomy normalization ensures consistent downstream vector embeddings and high-fidelity candidate matching.

### Result
Verified with 9 new API integration tests covering RBAC boundaries, cache HIT/MISS headers, cache invalidation on mutations, and PDF/text resume parsing.
Full web test suite and production build pass with complete static and dynamic route generation.

---

## Task 08 - Applications Pipeline State Machine and Kanban Architecture

### Problem
Recruitment pipelines require rigid stage progression and terminal state immutability to prevent corrupt recruitment histories.
Invalid stage skipping (such as moving straight from applied to hired) or altering decisions on terminal records (such as rehiring or re-evaluating rejected candidates directly) degrades audit trails and breaks downstream funnel analytics.
At the same time, recruiters need a responsive Kanban interface to monitor volume per stage and advance candidates with zero friction.

### Decision
Enforce a finite state machine in the service layer with deterministic allowed transitions: APPLIED to SCREENING to INTERVIEW to OFFER to HIRED.
Permit transitions to REJECTED or WITHDRAWN from any non-terminal state.
Strictly prohibit any state transitions once an application enters HIRED, REJECTED, or WITHDRAWN.
Enforce unique compound index `(candidateId, jobId)` returning a 409 CONFLICT on duplicate applications.
Build an interactive Next.js Kanban board showing stage counts, quick stage advance actions, inline move selectors, and dual Kanban/Table views.

### Alternative
Allow arbitrary stage transitions and rely solely on client-side UI disabling, or soft-delete applications on rejection.

### Why
Client-side validation alone cannot guarantee data integrity against direct API or programmatic integration calls.
Enforcing state transitions and terminal immutability in the service layer ensures downstream conversion metrics and funnels remain statistically valid and auditable.
Preserving rejected and withdrawn records in terminal states provides indispensable funnel conversion data for the analytics engine.

### Result
Verified with 7 new API integration tests covering valid linear transitions, any-to-rejected/withdrawn, invalid stage skips, terminal state locking, duplicate detection, and tenant/RBAC boundaries.
Automated React Testing Library suite verifies Kanban board column rendering, candidate stage advancement, and view toggling.
Next.js production build confirms static generation of `/applications` route.

---

## Task 09 - High-Throughput Idempotent Funnel Ingestion & Campaign Allocation Architecture

### Problem
Recruitment marketing platforms consume high-frequency event streams (impressions, clicks, application starts, applications) from third-party job boards, aggregators, and social networks.
These external publishers deliver events asynchronously over unreliable connections with automated retries, causing duplicate deliveries and out-of-order events.
Double counting events directly corrupts candidate acquisition cost (CAC), cost per click (CPC), and funnel conversion metrics.
Furthermore, manual budget allocations across publisher networks risk misallocation if percentages do not sum to 100%.

### Decision
Implement an idempotent event ingestion engine supporting single events and batches up to 500 records authenticated via either JWT Bearer or high-entropy API keys (`x-api-key`).
Require an immutable `eventId` on every incoming event.
Verify that both `campaignId` and `publisherId` exist and belong to the authenticated organization before ingestion.
Enforce funnel ordering sanity by rejecting events where `qualifiedQuantity > quantity`.
Deduplicate incoming batches against both the database and intra-batch duplicates, leveraging PostgreSQL unique constraints with `skipDuplicates` to safely absorb concurrent race conditions.
Replayed events return HTTP 200 with `{ accepted, duplicates, rejected }` reporting, guaranteeing at-least-once delivery without double counting.
For campaign management, enforce strict 100% allocation sum checks across publishers in both the service layer and the interactive web interface.

### Alternative
Reject entire batches with HTTP 409 when duplicate events appear, or offload deduplication to distributed stream consumers like Kafka.

### Why
Returning errors on duplicate events causes external job boards and webhook emitters to enter exponential backoff retry storms, saturating server capacity.
Returning HTTP 200 with duplicate counts fulfills idempotent ingest contracts cleanly.
Enforcing 100% budget allocation constraints ensures campaign simulation and downstream spend optimization algorithms receive mathematically consistent inputs.

### Result
Verified with 7 new API integration tests, including a 50-thread parallel concurrent ingestion test confirming exactly 1 database insert and 49 duplicate detections.
Web interface provides real-time allocation percentage validation, publisher management, and an interactive event simulator for administrators.
Full test suite across monorepo passes with 61 green tests and static route generation for `/campaigns`.


---

## Task 10 - Analytics Engine, Deterministic Synthetic Seeding & Interactive Intelligence Dashboards

### Problem
Recruitment marketing and funnel optimization require accurate statistical metrics that protect against division by zero while preserving period-over-period comparison velocity.
Without a single source of truth for metric calculations, different platform components compute divergent formulas for CTR, CPA, CPQA, and CPH.
Additionally, developing and validating downstream AI agents, Bayesian multi-armed bandits, and text-to-SQL capabilities requires a realistic, deterministic synthetic dataset.
This synthetic data must reflect genuine operational anomalies, including channel degradation and seasonal trends, rather than naive random distributions.

### Decision
Implement `modules/analytics/metrics.ts` as a pure, functional calculation module with 100% test coverage.
Enforce division-by-zero protection by returning `null` whenever denominators are non-positive, while returning `0` when numerators are zero.
Build `analytics.service.ts` to compute tenant-scoped aggregations for overview totals, period deltas, 7-stage funnels, publisher comparisons, campaign summaries, and daily/weekly timeseries.
Implement Redis caching with a 120-second TTL to accelerate repeated analytical queries.
Author `prisma/seed.ts` using the Mulberry32 seeded pseudo-random number generator (seed 42) to produce an idempotent, production-grade synthetic dataset.
Seed Demo Talent Co with 3 standard users, 161 categorized skills, 30 jobs across 6 Indian tech hubs and remote, 400 candidate profiles with substantive resumes, 1,500 state-machine applications, 12 campaigns, 22,056 events, 5,400 daily spends, 8 comprehensive knowledge documents (460-603 words each), and 1 running headline optimization experiment.
Engineered key diagnostic scenarios into the seed data: SocialReach application rates degrade by ~35% over the last 21 days with rising CPA, AggregatorX steadily improves over 30 days, ReferralNet delivers low volume with high conversion, and total applications fall by ~18% in the last 30 days vs the prior period.
Build responsive, dark-themed frontend dashboards in Next.js at `/dashboard` and `/analytics` using Recharts area, line, and bar charts with loading skeletons, anomaly banners, and parametric filters.

### Alternative
Compute analytics dynamically on the client side from raw event streams, or rely on non-deterministic faker libraries for seed generation.

### Why
Client-side aggregations degrade client performance when processing tens of thousands of event rows and compromise multi-tenant security boundaries.
Non-deterministic seed generation produces unpredictable test fixtures that break regression tests and impede reproducible automated evaluations.
Pure functional metric calculation guarantees mathematical consistency across REST endpoints, SQL views, and future AI analysis tools.

### Result
Verified with 18 pure metric unit tests and 6 API integration tests validating funnel computations, period deltas, and multi-tenant isolation.
Full monorepo verification gate passes with 0 lint errors, 0 type errors, and 87/87 passing tests across all workspaces.
Production builds cleanly prerender both `/dashboard` and `/analytics` routes.

---

## Task 11 - Candidate and Job Embedding Pipeline with Paragraph-Aware Chunking and Pgvector Storage

### Problem
Vector semantic search and hybrid candidate-job matching require consistent, high-dimensional vector representations for unstructured requisitions, candidate profiles, and multi-paragraph resumes.
Resumes often exceed standard embedding model context windows or dilute specific competency signals when embedded as single large text blocks.
Candidate embeddings must also represent the unified signal of multiple resume sections without skewing distance metrics.
Furthermore, vector indexing operations in high-throughput recruitment environments must execute asynchronously via background job queues while providing deterministic, synchronous execution for database seeding.
Re-indexing operations must remain completely idempotent, preventing duplicate chunks and vector drift upon profile updates.

### Decision
Build a comprehensive embedding pipeline supporting both deterministic local feature hashing (384 dimensions) and OpenAI-compatible embedding providers.
Implement a pure, paragraph-aware text chunker in `utils/chunk.ts` with strict boundary constraints (800 max characters, 100 character overlap, 80 minimum characters) that preserves paragraph cohesion and splits gracefully down to sentence and token boundaries.
Implement `LocalFeatureHashingEmbedder` using unigram and bigram extraction, sublinear term-frequency weighting (`1 + log(tf)`), signed 32-bit FNV-1a hashing, canonical skill boosting from taxonomy (weight multiplier 2.0 plus canonical alias injection), and Euclidean L2-normalization to produce unit vectors.
Implement `CandidateChunk` database storage with pgvector `vector(384)` columns.
For candidate profiles, decompose text into chunks, generate chunk vectors, store chunk rows, compute the coordinate-wise arithmetic mean vector across chunks, and re-normalize the mean vector to unit length before updating `Candidate.embedding` and `embeddedAt`.
Implement idempotent re-embedding by purging existing candidate chunks prior to inserting updated chunk vectors.
Wire BullMQ queue workers in `worker.ts` to process candidate and job embedding jobs asynchronously on record creation, updates, and resume uploads.
Expose authenticated HTTP endpoints `POST /api/jobs/:id/embed` and `POST /api/candidates/:id/embed` for manual triggers, alongside an admin-restricted endpoint `POST /api/admin/reindex` for full organization re-indexing.
Update `prisma/seed.ts` to synchronously generate embeddings for all 30 jobs and 400 candidate profiles (producing 800 candidate chunks).

### Alternative
Embed entire resumes as single truncated blocks without chunking, or compute candidate vectors by simple unnormalized vector addition.

### Why
Unsegmented resume embedding causes specific technical skills and achievement details to get lost in bulk background noise.
Paragraph-aware chunking with overlap retains localized context while ensuring comprehensive coverage across distinct career milestones.
Re-normalizing candidate mean vectors to unit length is mathematically essential for cosine distance (`<=>`) operations in pgvector to remain valid unit dot products.
Integrating background BullMQ queues decouples user-facing API response times from vector generation while retaining synchronous pipeline access for deterministic test fixtures and seed runs.

### Result
Full monorepo verification passed with 0 lint errors, 0 type errors, 111/111 passing tests across all workspaces, and zero production build warnings.

---

## Task 12 - Semantic Candidate Vector Search via Pgvector with Parametric Filtering and Dynamic Similarity Chips

### Problem
Traditional recruitment searches rely on keyword matching, which fails to surface candidates who use synonyms, adjacent technologies, or contextual descriptions rather than exact keywords.
Recruiters searching for "Kubernetes DevOps Engineer" frequently miss qualified candidates whose resumes highlight "container orchestration, Docker swarm, microservices deployment, and cloud infrastructure".
At the same time, pure vector similarity search without operational filtering ignores hard constraints such as candidate remote availability or minimum required years of experience.
Furthermore, vector similarity queries over thousands of candidates require low-latency indexing, multi-tenant query isolation, and intelligent caching to avoid redundant embedding generations.

### Decision
Implement `GET /api/candidates/search?q=` powered by pgvector cosine distance (`<=>`) queries with pre-order parametric SQL filters.
Enforce non-empty query validation via `candidateSearchQuerySchema` in `@talentpulse/shared`, rejecting blank or whitespace-only inputs with HTTP 400 Bad Request.
Embed incoming search prompts dynamically into 384-dimensional unit vectors using the embedding pipeline.
Execute an organization-scoped SQL query using `(embedding <=> $1::vector)` for cosine distance and compute cosine similarity as `ROUND((1 - (embedding <=> $1::vector))::numeric, 4)::float`.
Incorporate parametric filters (`minExperience`, `remoteOk`) directly into the SQL `WHERE` clause prior to distance sorting and `LIMIT 20` capping.
Cache search results in Redis for 60 seconds using tenant-scoped versioned keys (`tp:{orgId}:candidates-search:{hash(params)}`) and return `X-Cache: HIT|MISS` headers.
Invalidate candidate search caches automatically upon candidate creations, updates, deletions, and resume uploads.
Build an interactive Semantic Vector Search card and table view on the Next.js `/candidates` frontend with prompt suggestions ("Kubernetes DevOps Engineer", "React & Next.js Frontend Architect", "Clinical Intensive Care Specialist", "Distributed Systems Python Data Lead").
Display dynamic similarity match badges with color coding (emerald for >= 70% match, blue for >= 40% match) and exact cosine similarity metrics alongside location, experience, and skill tags.
Provide a clear vector search action that immediately resets the view back to the standard paginated candidate directory.

### Alternative
Perform keyword-based full text search using PostgreSQL `tsvector`, or compute cosine distances in Node.js application memory after loading all candidates.

### Why
In-memory vector similarity computation transfers large vector payloads across the network and scales poorly as candidate pools expand into tens of thousands of records.
Executing distance calculations in PostgreSQL with pgvector utilizes hardware-accelerated vector instructions and existing HNSW cosine indexes while enforcing tenant isolation at the database layer.
Combining SQL `WHERE` filters with vector distance sorting ensures that only eligible candidates are evaluated and ranked.
Redis caching absorbs repeated recruiter searches and common candidate role queries with sub-millisecond response times.

### Result
Verified with 6 integration tests covering input validation, semantic relevance ranking, parametric filtering (`remoteOk`, `minExperience`), multi-tenant isolation, ANALYST read-only access, and 60-second Redis caching.
Verified with 2 React Testing Library tests confirming semantic search input, prompt suggestion clicks, API invocation, similarity chip rendering, and view reset interactions.
Monorepo verification gate passed with 0 lint errors, 0 type errors, 119/119 passing tests across all workspaces, and zero production build warnings.

---

## Task 13 - Explainable Hybrid Candidate Ranking Engine with Audit Trails and Multi-Factor Sub-Score Breakdown

### Problem
Recruiters making hiring recommendations cannot rely solely on opaque black-box neural vector similarities or crude keyword filters.
Pure vector embeddings capture semantic intent but frequently miss hard constraints, such as mandatory certifications, specific years of professional experience, location requirements, and salary ceilings.
Conversely, strict boolean filters eliminate high-potential adjacent talent who might fall slightly short in one non-critical dimension but excel across all other requisites.
Furthermore, enterprise hiring standards require transparent explainability to justify candidate shortlisting, prevent algorithmic bias, eliminate disparate impact, and provide immutable audit records for compliance.
Scoring algorithms must also operate strictly on job-relevant candidate qualifications, entirely quarantined from protected demographic attributes such as age, gender, race, or photo.

### Decision
Architect a modular, multi-factor hybrid candidate ranking engine governed by a pure, deterministic ranker function.
Define an explicit scoring configuration (`apps/api/src/modules/matching/matching.config.ts`) with strictly normalized weights summing exactly to 1.0: Semantic Fit (0.35), Skills Alignment (0.25), Experience Match (0.15), Location Compatibility (0.10), Education Level (0.10), and Role Preferences (0.05).
Implement isolated, unit-tested sub-scorers for each evaluation dimension:
`scoreSemantic` rescales cosine similarities from [-1, 1] into a normalized [0, 1] interval.
`scoreSkills` canonicalizes candidate skills against a technical taxonomy with aliases (such as "golang" to "Go" and "k8s" to "Kubernetes"), scoring required skills at 80% weight and preferred skills at 20% weight while producing explicit explainable reason strings and gap notifications.
`scoreExperience` gives full 1.0 credit when candidate years equal or exceed minimum requirements, applying a linear ramp for junior candidates and producing natural language justifications.
`scoreLocation` grants 1.0 for matching cities or remote candidates, 0.5 for relocation willingness, and 0.0 otherwise.
`scoreEducation` enforces an educational ladder hierarchy (Doctorate, Master's, Bachelor's, Associate's, High School) with bonus incentives for preferred certifications.
`scorePreferences` checks employment type compatibility and aligns candidate salary expectations against budget ceilings.
Enforce non-discriminatory algorithmic safeguards by passing only sanitized `ScoringCandidateInput` data structures to the ranking pipeline, completely excluding candidate names, emails, ages, genders, and photos.
Calibrate match confidence scores dynamically based on the statistical separation margin between the candidate and nearest lower-tier competitors.
Implement `GET /api/jobs/:id/matches?limit=20` to retrieve top candidates, compute explainable hybrid ranks, and persist an immutable `Recommendation` audit record in PostgreSQL with model metadata, input hashes, and full scoring logs.
Build an interactive "AI Matches" tab in Next.js on `/jobs/[id]` featuring candidate rank cards, fit badges, confidence indicators, reason checkmarks, gap warnings, an interactive 6-factor score breakdown drawer, and client-side CSV export functionality.

### Alternative
Utilize an end-to-end uninterpretable black-box cross-encoder LLM to rank candidates, or sort purely by pgvector cosine distance without multidimensional sub-scores or audit trails.

### Why
Black-box LLM ranking provides zero mathematical consistency, suffers from prompt drift, hallucinates qualifications, and offers no auditable explanation for adverse employment decisions.
Sorting purely by vector distance fails to enforce critical hiring constraints like experience thresholds and mandatory skills.
The hybrid ranking architecture combines the best of semantic recall and deterministic rule scoring, ensuring 100% reproducibility and mathematical transparency.
Persisting immutable audit recommendation records satisfies compliance requirements and enables longitudinal quality tracking.

### Result
Verified with 21 Jest unit and integration tests validating weight normalizations, sub-scorers, monotonicity, canonical skill aliases, protected attribute safeguards, API authentication, limit validation, and database audit persistence.
Verified with React Testing Library tests confirming tab switching, API communication, score badge rendering, reasons, gaps, and interactive breakdown toggling.
Full monorepo verification gate passed with 0 lint errors, 0 type errors, 141/141 passing tests across all workspaces, and zero production build warnings.

---

## Task 14 - Retrieval-Augmented Generation (RAG) Knowledge System with Citation Verification and Threshold Gating

### Problem
Hiring policies, interview guidelines, job requisition templates, and sourcing playbooks are frequently buried in static documentation, leading to inconsistent recruiter practices and compliance violations.
Directly querying large language models without grounding induces severe hallucinations, invent policies that do not exist, and exposes the enterprise to adversarial prompt injections embedded in external text.
Furthermore, ungrounded queries generate responses that cannot be audited or attributed to verified source material.
An enterprise recruitment platform requires a trusted, multi-tenant knowledge retrieval engine that answers recruiter inquiries strictly from verified organizational documents, provides verifiable citations with exact passage snippets, and enforces deterministic threshold gating to avoid hallucinating when no relevant documentation exists.

### Decision
Implement a complete Retrieval-Augmented Generation (RAG) system with pgvector cosine distance search, configurable similarity threshold gating, citation synthesis, and strict prompt injection defenses.
Add pgvector helpers `insertKnowledgeChunk`, `deleteKnowledgeChunks`, and `knnKnowledgeChunks` in `apps/api/src/lib/vector.ts` with organization-scoped multi-tenant isolation and category pre-filtering.
Implement `KnowledgeService` supporting document ingestion, paragraph-aware text chunking via `chunkText`, deterministic embedding generation via `embedText`, and Q&A inference.
Enforce similarity threshold gating (`RAG_MIN_SIMILARITY`, default 0.15): when no retrieved chunk passes the similarity threshold, the service immediately returns `"I couldn't find relevant information in the knowledge base."` with an empty citation array, completely bypassing the LLM provider.
When qualified passages exist, construct citations mapping directly to verified database chunks (`documentId`, `title`, `snippet`, `similarity`).
Enforce prompt injection boundaries by strictly isolating retrieved passages within `<untrusted_context>` tags and instructing the LLM to treat context as untrusted data that must never override system directives.
Implement an extractive `MockLlmProvider` that tokenizes questions, ignores adversarial directives, and extracts top-scoring sentences with source citations `[n]`.
Update `prisma/seed.ts` to chunk and embed all 8 knowledge documents into 56 vector chunks across policies, playbooks, templates, and sourcing guides.
Mount authenticated endpoints under `/api/knowledge` with role-based access control (ADMIN and RECRUITER can create documents, ADMIN can delete documents, all authenticated users can query).
Build the Next.js `/knowledge` interface featuring dual tabs for an interactive chat-style Q&A assistant with suggested prompt chips, citation popover dialogs, and a document library with chunk counters.

### Alternative
Pass all retrieved passages unconditionally to a generative LLM without similarity threshold gating, or omit source citation metadata from answers.

### Why
Unconditional generation without threshold gating guarantees that the LLM will hallucinate convincing but completely false policies when users ask about topics outside the knowledge base.
Short-circuiting retrieval below the 0.15 similarity threshold eliminates unnecessary LLM API costs and ensures absolute factual reliability.
Delimiting context into untrusted blocks defends against indirect prompt injections embedded in ingested documents.
Verifiable citation chips provide full transparency and empower recruiters to trace every policy assertion back to the authoritative handbook passage.

### Result
Verified with 15 Supertest and Prisma integration tests validating document ingestion, chunking, RBAC, threshold gating, spy assertion that LLM is never called on irrelevant queries, prompt injection defense, and multi-tenant isolation.
Verified with 2 React Testing Library web tests confirming Q&A submission, answer card display, citation snippet modals, and document library listing.
Full monorepo verification gate passed with 0 lint errors, 0 type errors, 158/158 passing tests across 27 suites, and zero production build warnings.

---

## Task 15 - Ask TalentPulse Conversational Analyst with Metric Diagnosis, Charts, and Execution Tracing

### Problem
Talent acquisition teams and recruitment executives need quick answers to complex diagnostic questions such as "Why did applications fall this month?" or "Which publisher has the lowest CPA?".
Standard chat interfaces that pass conversational queries blindly to unconstrained generative language models frequently hallucinate quantitative metrics, fabricate causality, and lack access to underlying relational database state.
Furthermore, enterprise recruiters require full explainability for analytical assertions, including the exact SQL queries executed, interactive chart breakdowns, step-by-step pipeline execution traces, and actionable recommendations.
The system must also safely route diverse user intents across analytical aggregation, multi-period metric diagnosis, policy handbook retrieval, and candidate semantic search while logging immutable tool execution traces.

### Decision
Build the Ask TalentPulse conversational analyst pipeline (`apps/api/src/modules/ai/pipeline.ts`) governed by a structured router, deterministic diagnostic engine, and full database persistence.
Implement an intent classifier (`classifier.ts`) mapping user queries into structured categories: `metric_diagnosis`, `analytics_sql`, `knowledge`, `candidate_search`, `campaign_recommendation`, `smalltalk`, and `unsupported`.
Build the deterministic `diagnoseMetricChange` tool (`tools/diagnose.ts`) that compares the current 30-day period against the previous 30-day period across all publishers, decomposing conversion rate shifts across funnel stages.
On seeded data, the diagnostic tool identifies `SocialReach` as the primary cause of macro application decline, pinpointing a ~35% drop in application conversion rate with a corresponding rise in acquisition cost.
Build the analytical SQL tool (`tools/sql.ts`) computing exact CPA rankings, campaign volume breakdowns, and formatted SQL queries with Recharts bar chart specifications.
Build the candidate vector search tool (`tools/candidateSearch.ts`) embedding recruiter prompts and querying pgvector candidate embeddings.
Route knowledge inquiries directly through `KnowledgeService` with similarity threshold gating and verifiable citations.
Log each execution step in PostgreSQL via `AiToolCall` with agent name, tool identifier, SHA-256 arguments hash, latency in milliseconds, and success status.
Persist user and assistant messages in `AiConversation` and `AiMessage` tables with rich structured payloads.
Mount `/api/ai` endpoints with authentication, conversation history management, and rate limiting (60 queries per 15 minutes).
Build the Next.js `/ai` chat UI featuring a recent conversations sidebar, suggestion chips, expandable "View Executed SQL" panels, interactive Recharts bar and line charts, actionable recommendations cards, and collapsible pipeline execution traces.

### Alternative
Rely on an external end-to-end autonomous agent with direct arbitrary database write access, or generate ungrounded free-form text without deterministic analytical tools.

### Why
Direct LLM generation over raw database credentials invites prompt injection vulnerabilities, unauthorized data mutation, and hallucinated calculations.
Grounding the conversational analyst strictly on deterministic tools (`diagnoseMetricChange`, `executeAnalyticalQuery`, `knnCandidates`, `knowledgeService`) guarantees mathematical accuracy and consistency.
Logging every tool invocation into `AiToolCall` satisfies enterprise compliance and debugging requirements.
Displaying interactive charts alongside executed SQL queries provides complete transparency for recruitment leadership.

### Result
Verified with 11 Supertest and Prisma integration tests validating all intent routing branches (`metric_diagnosis` naming SocialReach as primary cause, `analytics_sql`, `knowledge`, `candidate_search`, `smalltalk`, `campaign_recommendation`, `unsupported`), conversation persistence, tool call logging, and conversation deletions.
Verified with React Testing Library tests confirming query submission, diagnosis answer rendering, recommendation cards, confidence badges, and pipeline trace toggling.
Full monorepo verification gate passed with 0 lint errors, 0 type errors, 170/170 passing tests across 29 test suites, and clean Next.js production builds.

---

## Task 16 - Guarded Text-to-SQL with AST Validation, Dedicated Read-Only Role, and Tenant Isolation

### Problem
Enabling natural language questions to query relational database tables introduces severe security, stability, and privacy risks.
Unconstrained text-to-SQL generation is vulnerable to prompt injection attacks attempting to execute destructive DML or DDL (`DROP TABLE`, `UPDATE`, `INSERT`).
Malicious or malformed prompts can attempt to smuggle multi-statement semicolon chains, comments, or administrative PostgreSQL catalog functions (`pg_sleep`, `pg_read_file`, `set_config`, `lo_import`).
Furthermore, multi-tenant recruitment systems must ensure that one organization can never access another organization's candidate or campaign records.
Exposing raw candidate tables (`Candidate`, `Application`, `User`) directly to text-to-SQL can leak sensitive Personally Identifiable Information (PII) such as candidate names, phone numbers, and emails.
Finally, unoptimized queries can cause denial-of-service without strict execution timeouts and row limit caps.

### Decision
Implement an end-to-end multi-layer defense-in-depth architecture for all text-to-SQL generation and execution.
First, restrict all text-to-SQL access exclusively to 5 whitelisted analytical views (`v_job_funnel_daily`, `v_publisher_performance_daily`, `v_campaign_summary`, `v_applications_overview`, `v_jobs_overview`).
Ensure `v_applications_overview` is strictly privacy-safe by omitting candidate names and emails.
Second, build a strict AST SQL validator (`modules/ai/sql/validator.ts`) using `node-sql-parser` configured for PostgreSQL dialect.
Enforce single-statement verification, allow only `select` queries (including CTEs where each statement is a `select`), enforce a 2,000-character length limit, and strictly reject comments (`--`, `/* */`) and semicolon chaining (`;`).
Enforce a blocklist of forbidden keywords (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `CREATE`, `GRANT`, `REVOKE`, `COPY`, `CALL`, `DO`, `EXECUTE`, `SET`, `RESET`, `VACUUM`) and functions (`pg_sleep`, `pg_read_file`, `lo_import`, `dblink`, `set_config`, `current_setting`).
Extract all referenced tables from the query AST and verify they exist strictly in the view allowlist or active CTE declarations, rejecting any schema-qualified names (`public.*`) or catalog tables (`pg_*`, `information_schema.*`).
Enforce automatic `LIMIT` injection (injecting `LIMIT 100` if absent, or clamping explicit limits > 500 down to 500).
Third, execute all queries through a dedicated read-only connection pool using the `tp_readonly` role with zero base table permissions.
Fourth, execute each query inside an isolated transaction that applies `SET LOCAL statement_timeout = '5000'` and database-enforced tenant isolation via `SELECT set_config('app.org_id', $1, true)`.
Fifth, implement a mock template library covering >= 12 question patterns (lowest/highest CPA by publisher, applications by week, hires by campaign, spend by publisher last 30 days, CTR by campaign, funnel counts per job, interview rate by publisher, cost per hire ranking, top campaigns by qualified applications, jobs by status, applications by source, month-over-month applications).
Sixth, build a result analyzer (`modules/ai/sql/analyzer.ts`) producing executive natural language answers, recommendations, and Recharts visualization specs.
Seventh, expose `POST /api/ai/sql/preview` for query validation dry-runs and integrate execution time and row counts into the `/ai` chat UI with security refusal alerts.

### Alternative
Allow direct raw SQL execution using the primary application Prisma pool, or rely solely on LLM prompt engineering without AST parsing.

### Why
Prompt engineering alone cannot prevent jailbreaks, prompt injection, or SQL hallucination.
AST parsing with `node-sql-parser` inspects the true structural syntax tree of the query, catching disguised keywords, subqueries, and non-whitelisted tables before execution.
A dedicated read-only database role (`tp_readonly`) ensures that even if an invalid query bypassed application checks, PostgreSQL permissions would prevent any data mutations.
Database-level tenant isolation via `set_config('app.org_id', $1, true)` guarantees multi-tenant boundaries at the database kernel level.
Statement timeouts prevent runaway cross-joins and unindexed aggregations from degrading API performance.

### Result
Verified with 26 comprehensive unit, integration, and security tests in `apps/api/tests/sql.test.ts`.
Tests confirm AST validation across all 5 views, LIMIT injection, LIMIT clamping, rejection of DML/DDL/admin keywords, rejection of forbidden functions and comments, rejection of hallucinated tables with `SQL_REJECTED`, preview endpoint validation, read-only role enforcement, statement timeout abortion, and strict tenant isolation across two independent organizations over both direct execution and HTTP API.
Verified with React Testing Library tests in `apps/web/tests/ai-analyst.test.tsx` confirming validated SQL rendering with execution time and row count badges, and security refusal card display upon guardrail triggers.
Monorepo verification gate passed with 0 lint errors, 0 type errors, 198/198 passing tests across 30 test suites, and clean Next.js production builds.

---

## Task 17 - Publisher Simulation Engine and Interactive Allocation Management

### Problem
Evaluating recruitment marketing strategies in production requires historical data that may not exist for new campaigns or nascent channels.
Recruiters and talent acquisition leaders need to forecast how budget adjustments and bid variations impact impressions, candidate volume, and recruitment cost metrics before committing financial capital.
However, naive simulation models produce unrealistic linear projections that ignore auction dynamics, audience saturation, diminishing marginal returns, stochastic variance, and publisher performance drift.
Furthermore, campaign managers need interactive allocation management tools that enforce strict mathematical constraints (allocations summing to 100%) and prevent unmanaged budget deficits.

### Decision
Architect a deterministic publisher simulation engine and full-featured campaign allocation management system.
First, build a pure mathematical simulator in `apps/api/src/modules/simulation/simulator.ts` adhering to realistic ad auction physics:
Implement diminishing returns via a concave saturation curve where marginal clicks decrease as daily budget approaches publisher capacity.
Model bid dynamics such that higher bids expand auction win rates and impression reach while increasing clearing cost per click (CPC).
Incorporate pseudo-random stochastic noise using the deterministic Mulberry32 algorithm, introducing plus or minus 5 to 15 percent variance based on an explicit integer seed.
Incorporate channel conversion drift over time (dayIndex) to simulate real-world phenomena such as audience fatigue or publisher optimization.
Enforce strict funnel invariants across all generated stages: impressions >= clicks >= applications >= qualified >= interviews >= hires, with spend capped at budget.
Second, define standard calibration profiles for 5 primary publisher types (`JobBoard Prime`, `SocialReach` with negative conversion drift, `SearchHire`, `AggregatorX` with positive conversion drift, and `ReferralNet`).
Third, expose an authenticated API endpoint `POST /api/campaigns/:id/simulate` restricted to ADMIN and RECRUITER roles via RBAC.
Generate synthetic events and daily spends across the requested simulation horizon, using deterministic event and spend identifiers to guarantee idempotent reruns.
Fourth, build Next.js campaign detail views at `/campaigns/[id]` featuring KPI summary cards (Total Budget, Daily Budget, Pacing Indicator, Timeline), a Recharts donut chart visualizing channel allocation share, a publisher configuration table, an interactive allocation modal with real-time 100% sum validation, and a simulation runner dialog.

### Alternative
Generate synthetic traffic using uniform random distributions or unconstrained linear scaling without diminishing returns.

### Why
Linear simulations fail to prepare recruitment teams for the reality of audience saturation and increasing marginal acquisition costs.
Concave saturation curves accurately mirror real-world pay-per-click recruitment platforms where expanding reach yields diminishing marginal returns.
Mulberry32 seeded pseudo-random generation provides realistic daily variability while ensuring tests, demonstration scenarios, and reproducible analyses remain strictly deterministic.
Idempotent database upserts prevent runaway data duplication when simulations are re-executed.

### Result
Verified with 11 unit and integration tests in `apps/api/tests/simulation.test.ts` validating Mulberry32 determinism, concave diminishing returns monotonicity, bid effects on impression reach and clearing CPC, negative and positive conversion drift, funnel invariants across all standard publisher profiles, RBAC authorization, and idempotent event ingestion.
Verified with 2 React Testing Library tests in `apps/web/tests/campaign-detail.test.tsx` verifying campaign metadata rendering, donut chart display, channel tables, and simulation dialog execution.
Monorepo verification gate passed with 0 lint errors, 0 type errors, 211/211 passing tests across 32 test suites, and clean Next.js production builds.

---

## Task 18 - Campaign & Publisher Performance Analytics with 7-Day Trend Deltas

### Problem
Recruiters and marketing campaign managers need to evaluate publisher performance across multiple funnel dimensions simultaneously (impressions, clicks, applications, qualified applications, interviews, and hires).
Without real-time unit economics (CTR, CPC, CPA, CPQA, and CPH), organizations risk over-allocating capital to channels that generate deceptive raw application volume with low qualification rates.
Furthermore, static snapshot numbers do not reveal whether publisher efficiency is improving, stagnating, or degrading over time.
Talent acquisition teams require continuous velocity indicators (such as 7-day vs prior 7-day trend deltas) to quickly catch degrading channels (like SocialReach's rising CPA) and double down on high-performing sources (like AggregatorX and ReferralNet).
Finally, enterprise campaign pages need dedicated performance tabs, comparative bar charts, and publisher ranking tables with strict empty-data resilience.

### Decision
Architect a publisher performance analytics engine supporting trend deltas, ranking, and multi-tenant campaign isolation.
First, enrich `@talentpulse/shared` with `PublisherPerformanceTrends` (tracking percentage deltas for CTR, CPC, CPA, CPQA, CPH, impressions, clicks, applications, and spend), `PublisherFunnelMetrics`, `cpqa`, and `rank`.
Second, update `getPublishers` in `apps/api/src/modules/analytics/analytics.service.ts` to evaluate the current analysis window against the immediately preceding baseline window of identical duration (defaulting to 7 days).
Calculate Cost Per Qualified Application (`calculateCPQA`) alongside CTR, CPC, CPA, and CPH.
Compute directional trend deltas between the current and previous evaluation periods using `calculateDelta` with division-by-zero protection.
Implement an efficiency-first ranking algorithm sorting publishers by Cost Per Application (CPA) ascending, with tiebreakers on application volume and clicks.
Cache publisher analytics in Redis for 60 seconds using tenant-scoped versioned keys (`tp:{orgId}:v{ns}:analytics:{hash(params)}`).
Third, build an interactive Performance & Analytics tab on the Next.js campaign detail page (`/campaigns/[id]`) featuring:
Time horizon selectors (Last 7d, 14d, 30d, 90d).
Publisher Performance Cards displaying CTR, CPA, CPH, and CPQA with colored trend velocity arrows (green indicating cost reductions or volume increases).
A comparative Recharts bar chart contrasting CPA and spend across campaign publishers.
A full publisher efficiency ranking table and channel funnel progression breakdown.
Fourth, enhance the main `/analytics` page channels tab with publisher benchmark cards and CPQA columns.

### Alternative
Compute trend comparisons on the frontend by fetching two separate full-range queries, or rank publishers solely on raw application counts.

### Why
Server-side trend computation ensures that data aggregation, date alignment, and division-by-zero safeguards execute deterministically across all client platforms.
Ranking by CPA rather than raw applications prevents low-quality, high-volume channels from masking escalating acquisition costs.
Color-coded trend arrows with contextual inversion (where decreasing cost is marked as positive) enable recruiters to identify anomalies at a glance.
Redis caching shields the database from repeated analytical aggregations across high-frequency dashboard reloads.

### Result
Verified with 4 dedicated unit and integration tests in `apps/api/tests/campaign-analytics.test.ts` testing empty-data resilience, exact 7d vs prior 7d trend deltas, strict CPA-ascending publisher ranking, and campaign-specific filter isolation.
Verified with updated React Testing Library test suites in `apps/web/tests/campaign-detail.test.tsx` and `apps/web/tests/analytics.test.tsx`.
Monorepo verification gate passed with 0 lint errors, 0 type errors, 216/216 passing tests across 33 test suites, and clean Next.js production builds.

## 2026-10-02 - Task 19: Optimization Engine (Deterministic Rules, Publisher Scoring & Constrained Softmax Allocation)

### Context
Recruitment campaigns spanning multiple publisher channels require continuous capital allocation rebalancing to maximize qualified candidate yield while controlling unit acquisition costs.
Relying solely on unconstrained mathematical models risks extreme volatility and publisher starvation.
Conversely, relying only on static heuristic rules fails to account for global budget balance, multi-objective trade-offs, and diminishing returns.
The system requires an optimization engine that blends deterministic rule-based safety guards with multi-metric scoring and constrained Softmax allocation.
Furthermore, the engine must produce an auditable recommendation trail adhering to responsible-AI practices, with strict role-based access control preventing analysts from modifying live budget allocations.

### Decision
Architect and implement `apps/api/src/modules/optimization/` composed of four core layers:
1. Rule Engine (`rules.ts`): Evaluates publisher velocity over 7-day windows against prior-7-day baselines with a strict minimum-volume guard (clicks >= 50 required to act).
Triggers `reduce_allocation` when CPA rises >10% and application rate falls >5%.
Triggers `increase_allocation` when CPA drops >10% and qualified applications rise.
Triggers `review_landing_quality` when CTR is healthy (>=2.5%) but conversion rate collapses (<= -20%).
Triggers `adjust_pacing` when budget pacing exceeds 120% or falls below 70%.
Falls back to `maintain_allocation` when metrics are stable, and `insufficient_volume` when clicks < 50.
2. Scoring Engine (`score.ts`): Computes min-max normalized metrics for CPA and CPH across campaign publishers.
Calculates publisher quality score as (qualified_applications / applications) * (1 + hireRate).
Evaluates the composite objective score = w_q * quality - lambda1 * cpa_norm - lambda2 * cph_norm with configurable weights.
3. Constrained Allocation (`allocate.ts`): Transforms composite scores into channel budget percentages via Softmax with temperature tau=0.5 and numerical stability shifts.
Applies per-publisher dynamic bounds enforcing a 5.0% floor, a 50.0% cap, and a stability dampener clamping maximum change per run to +-10 percentage points from current allocation.
Uses iterative clip-and-renormalize to achieve convergence and step-wise 0.01-increment remainder assignment guaranteeing an exact 100.00% sum without bound violations.
4. Recommendation Management & RBAC (`optimization.service.ts`, `optimization.controller.ts`, `optimization.routes.ts`):
Persists recommendations as `CAMPAIGN_ALLOCATION` with modelVersion `rules+score-v1`, volume-driven confidence scores, and natural language rationale.
Mounts `POST /api/optimization/propose`, `GET /api/optimization/recommendations`, `GET /api/optimization/recommendations/:id`, `POST /api/optimization/recommendations/:id/approve`, and `POST /api/optimization/recommendations/:id/reject`.
Enforces RBAC blocking ANALYST users from approving or rejecting recommendations with HTTP 403 Forbidden.
On approval by ADMIN or RECRUITER, transactionally updates `CampaignPublisher` allocations and daily budgets while invalidating Redis cache namespaces.
5. AI Pipeline Integration (`apps/api/src/modules/ai/pipeline.ts`): Re-enables the `campaign_recommendation` intent, querying the optimization engine to provide natural language advice, action lists, and comparative Recharts bar charts.
6. Web Interface (`apps/web/app/optimize/page.tsx`): Built the `/optimize` page with campaign selection, "Propose Reallocation" triggering, side-by-side Recharts bar charts comparing current vs recommended percentages, heuristic diagnostics table, recommendation audit trail, and role-aware Approve/Reject controls.

### Alternative
A purely heuristic allocation without scoring would lack smooth multi-publisher trade-offs.
An unconstrained optimization model without +-10 pp dampening would cause severe budget whiplash across consecutive runs.

### Why
Combining rule-based guards with constrained Softmax achieves high unit efficiency while preventing destabilizing allocation swings.
Preserving an audit trail in `Recommendation` records satisfies responsible-AI explainability requirements.
Enforcing RBAC both in route middleware and service logic guarantees tenant safety and prevents unauthorized spend adjustments.

### Result
Verified with 15 unit and integration tests in `apps/api/tests/optimization.test.ts` covering rule logic, scoring, constrained Softmax convergence, seeded scenario reallocations (reducing SocialReach and increasing AggregatorX), RBAC enforcement, and AI pipeline routing.
Verified with 4 tests in `apps/web/tests/optimize.test.tsx` verifying UI rendering, proposal generation, approval flow, rejection flow, and Analyst read-only alerts.
Monorepo verification gate passed with 0 lint errors, 0 type errors, 235/235 passing tests across 35 test suites, and clean Next.js production builds.

## 2026-10-02 - Task 20: Contextual Bandit Engine (LinUCB, Epsilon-Greedy) and A/B Testing Framework

### Context
Recruitment advertising campaigns face dynamic publisher performance drift, fluctuating bid prices, and non-stationary conversion rates across diverse job categories and temporal periods.
Static rule engines and batch reallocations adapt slowly to shifting publisher efficiencies and cannot explore uncertain options systematically.
Conversely, unguided multi-armed bandits ignore requisition context such as job seniority, engineering department, time of day, and day of week.
Furthermore, evaluating novel campaign strategies and channel allocations requires an empirical A/B experimentation platform with deterministic user variant assignment, conversion tracking, and statistical hypothesis testing (two-sample z-tests).
The system requires a robust, pure TypeScript linear algebra and bandit engine supporting LinUCB with Sherman-Morrison rank-1 updates, decaying epsilon-greedy, and baseline policies, alongside an interactive simulation lab and A/B experiment dashboard.

### Decision
Architect and implement the contextual bandit and experimentation modules in pure TypeScript:
1. Pure Matrix Algebra (`apps/api/src/modules/optimization/bandit/matrix.ts`):
Implemented vector dot products, outer products, matrix-vector multiplications, scalar additions, and identity matrices without external heavy C++ dependencies.
Implemented Gauss-Jordan elimination with partial pivoting for full matrix inversion.
Implemented Sherman-Morrison rank-1 inverse update formula allowing O(d^2) updates of the precision matrix A_inv = (A + x x^T)^(-1) rather than O(d^3) re-inversion.
Implemented Frobenius distance checks ensuring numerical drift between Sherman-Morrison rank-1 updates and direct Gauss-Jordan matrix inversion remains below 1e-5.
2. Context Vectorization & Arm Formulation (`types.ts`, `context.ts`):
Designed a 12-dimensional normalized feature vector encoding job seniority (entry, mid, senior, lead/exec), job department (engineering, product, sales, marketing, other), publisher category (general, technical, niche), and cyclical temporal indicators (hour of day normalized by 24, day of week normalized by 7).
Configured 5 discrete publisher arms matching the seeded publisher network (JobBoard Prime, SocialReach, SearchHire, AggregatorX, ReferralNet).
Formulated bounded scalar rewards r = 1.0 * application + 2.0 * qualified - 0.5 * normalized_spend, clipped strictly to [-2.0, 2.0].
3. Disjoint LinUCB Policy (`linucb.ts`):
Maintained per-arm precision matrices A_a and reward vectors b_a initialized with ridge regularization parameter lambda=1.0.
Computed ridge regression coefficient vectors theta_hat_a = A_a^(-1) b_a.
Evaluated upper confidence bounds p_a = theta_hat_a^T x + alpha * sqrt(x^T A_a^(-1) x) with exploration parameter alpha=0.8.
Updated parameters upon reward receipt in O(d^2) operations via Sherman-Morrison rank-1 updates.
4. Epsilon-Greedy Policy (`epsilonGreedy.ts`):
Implemented contextual ridge regression estimator predicting expected reward given context x.
Explored uniformly at random with probability epsilon and exploited arm with maximum predicted reward with probability 1 - epsilon.
Decayed epsilon smoothly from 0.10 to 0.02 over time to transition from exploration to exploitation.
5. Baseline Policies & Offline Simulator (`baselines.ts`, `simulation.ts`):
Implemented Random and Static baseline policies.
Built offline simulation runner with deterministic Mulberry32 pseudo-random number generator for reproducible policy comparisons.
Computed cumulative rewards, cumulative regret against an oracle policy, and action selection distributions over arbitrary round horizons.
6. A/B Experimentation Engine (`apps/api/src/modules/optimization/experiments/`):
Implemented Abramowitz and Stegun polynomial approximation of the standard normal cumulative distribution function (normalCdf) with maximum error < 7.5e-8.
Implemented two-sample pooled two-proportion z-tests computing z-scores, p-values, 95% confidence intervals, and relative conversion lift.
Guarded against false discovery by returning not significant when sample size per variant is below 30.
Implemented deterministic variant hashing using MD5 hash of (experimentId:subjectId) modulo 100 mapped to cumulative variant weight boundaries.
7. API & Route Mounting (`bandit.routes.ts`, `experiments.routes.ts`):
Mounted contextual bandit routes at `/api/optimization/bandit` (`POST /decide`, `POST /reward`, `GET /state`, `POST /reset`, `POST /simulate`).
Mounted A/B experiment routes at `/api/experiments` (`POST /`, `GET /`, `GET /:id`, `PATCH /:id/status`, `POST /:id/assign`, `POST /:id/convert`).
Enforced RBAC requiring ADMIN role for policy reset and experiment status changes.
8. Interactive UI & Visualization:
Built Bandit Lab tab in `/optimize` featuring interactive round controls, policy selection checkboxes, Recharts line charts (cumulative reward and cumulative regret), Recharts action distribution bar chart, KPI summary cards, and policy reset button.
Built Experiments Dashboard in `/experiments` with experiment status filters, variant performance comparison tables, statistical significance badges, deterministic variant assignment sandbox, and new experiment modal.
Added "Experiments" navigation item with Flask icon to the main sidebar.
9. Documentation (`docs/optimization.md`):
Authored formal mathematical documentation covering problem formulation, LinUCB confidence intervals, Sherman-Morrison derivation, regret bounds, two-proportion z-test statistics, and verification gates.

### Alternative
Relying on external Python microservices for matrix operations and bandit updates would introduce inter-process network latency into high-frequency decision loops.
Running batch regressions without Sherman-Morrison rank-1 updates would incur O(d^3) overhead per recommendation round.

### Why
Pure TypeScript implementation enables low-latency in-process arm decisions and fast offline simulations directly within the API server.
Sherman-Morrison rank-1 updates provide an order-of-magnitude algorithmic speedup while maintaining strict mathematical equivalence verified by Frobenius distance tests.
Deterministic MD5 hashing guarantees that users experience consistent experiment variants across sessions without requiring database lookup roundtrips on every impression.

### Result
Verified with 9 mathematical unit tests in `apps/api/tests/bandit-math.test.ts` validating Sherman-Morrison Frobenius drift < 1e-5, LinUCB reward convergence > Random over 2,000 rounds, epsilon decay, state serialization roundtrips, normal CDF accuracy, z-test significance, and variant distribution uniformity.
Verified with 10 API integration tests in `apps/api/tests/bandit-api.test.ts` verifying decide, reward, state inspection, admin reset, simulation policy ordering (LinUCB > epsilon-greedy > Random), experiment creation, status modification, deterministic assignment, conversion tracking, and statistical significance calculations.
Verified with 3 web tests in `apps/web/tests/bandit-lab.test.tsx` and 4 web tests in `apps/web/tests/experiments.test.tsx`.
Monorepo verification gate passed with 0 lint errors, 0 type errors, 261/261 passing tests across 39 test suites, and clean Next.js production builds.

## 2026-10-02 - Task 21: Predictive Intelligence Microservice (FastAPI, Scikit-Learn)

### Context
Recruitment campaigns and hiring requisitions require probabilistic predictive intelligence to forecast candidate application likelihood and requisition fill rates.
Heuristic models cannot accurately capture non-linear interactions between salary bands, required skills, candidate volume, and historical publisher channel efficiency.
Furthermore, recruiters and hiring managers need explainable predictions with concrete contributing factors to understand why a requisition is at risk and how to optimize campaign performance.
The architecture demands a dedicated Python FastAPI ML microservice decoupled from database access, backed by a persistent model registry and integrated with robust client circuit breakers.

### Decision
Architect and implement the predictive intelligence system across Python ML microservice, API client, and Next.js frontend:
1. Python FastAPI Microservice (services/ml):
Built lightweight, high-performance microservice with endpoints GET /health, GET /models, POST /train/{model_name}, and POST /predict/{model_name}.
Enforced service-to-service token authentication (x-service-token == ML_SERVICE_TOKEN).
2. Application Conversion Probability Model (services/ml/app/models/application_prob.py):
Implemented dual-model training evaluating Logistic Regression baseline against Gradient Boosting Classifier.
Automated model selection via stratified train/test validation ROC-AUC score, gating production acceptance at ROC-AUC > 0.60.
Extracted top feature importances and directionalities to explain channel conversion likelihood.
3. Requisition Fill Probability Model (services/ml/app/models/fill_prob.py):
Trained Random Forest Classifier predicting 45-day requisition fill likelihood based on salary band, skills count, first 7 days applications, qualified rate, spend, and experience requirements.
Assigned calibrated risk tiers (High for probability < 0.35, Medium for 0.35 to 0.65, Low for >= 0.65).
Calculated explainability factors by standardizing individual feature deviations against baseline training medians and standard deviations.
4. Model Versioning & Registry (services/ml/app/models/registry.py):
Persisted serialized .joblib model artifacts, scalers, and metrics.json to /models/{name}/{version}.
Maintained active version pointers and metadata inspection endpoints.
5. Containerization & Compose Configuration:
Authored Dockerfile.ml with Python 3.11 slim image and non-root user.
Added ml service to docker-compose.yml with persistent named volume ml_models_data and HTTP healthcheck.
6. Typed API Client & Circuit Breaker (pps/api/src/modules/ml/ml.client.ts):
Implemented MlClient with 5s timeout, 2x exponential retries, and a 3-failure circuit-breaker-lite that opens for 30s.
Provided graceful fallback heuristics when the ML microservice is unreachable, ensuring zero downtime.
7. Core API Integration & Database Persistence:
Built ml.service.ts with training dataset exporters for PostgreSQL event and requisition tables.
Persisted model metadata transactionally in ModelVersion table upon training completion.
Mounted routes under /api/ml with ADMIN role restrictions for training.
8. Frontend Integration (pps/web):
Integrated Predictive Intelligence card on Job Detail page (/jobs/[id]) displaying fill likelihood percentage gauge, risk tier badge, and top contributing factors.
Added predicted conversion rate column to Campaign Detail page (/campaigns/[id]) with ML badges and active model version tooltips.

### Alternative
Embedding Python runtime inside Node.js or executing Python scripts via child processes would degrade API responsiveness and hinder container horizontal scaling.
Using black-box deep learning architectures would sacrifice inference explainability and inflate memory requirements.

### Why
FastAPI provides high-performance asynchronous request handling and native Scikit-Learn compatibility.
Tree-based ensemble models (Random Forest, Gradient Boosting) deliver superior accuracy on tabular data compared to deep neural networks, while offering fast training and direct explainability.
Decoupling the ML service from database access adheres strictly to the single-responsibility principle and simplifies container scaling.
Circuit breakers and heuristic fallbacks ensure zero downtime on critical hiring workflows.

### Result
Verified with 13 passing unit and integration tests in services/ml/tests validating ROC-AUC > 0.60, schema conformity, service token authentication, and registry persistence.
Verified with 10 passing integration and unit tests in pps/api/tests/ml.test.ts covering circuit breaker trip/reset, retry backoff, RBAC authorization, heuristic fallback predictions, and transactional ModelVersion persistence.
Verified with 3 passing React Testing Library tests in pps/web/tests/ml-intelligence.test.tsx validating job fill cards, risk badges, explainability factors, graceful error states, and campaign publisher conversion rates.

## 2026-10-02 - Task 22: Time-Series Forecasting Engine (Holt-Winters, Backtesting, Shortfall Alerts)

### Context
Recruitment advertising campaigns and hiring pipelines require forward-looking projections of application volume, interviews, hires, and ad spend to guide budget allocation.
Static pacing assumptions fail to account for weekly day-of-week demand seasonality and non-linear trend dynamics.
Furthermore, early campaigns with limited operational history require reliable fallback forecasting mechanisms.
To proactively mitigate hiring delays, recruitment teams need automated shortfall alerts that trigger actionable budget optimization recommendations whenever projected applicant pacing lags behind campaign goals.

### Decision
Architect and implement a robust, dual-tier time-series forecasting engine with holdout validation and pacing alerts:
1. Python ML Forecasting Service (services/ml/app/models/forecast.py):
Implemented Holt-Winters Exponential Smoothing via statsmodels with additive trend and 7-day weekly seasonality (	rend='add', seasonal='add', seasonal_periods=7).
Applied Holt-Winters whenever 28 or more historical daily observations are available.
Implemented an automated moving-average fallback with empirical standard deviations for series with fewer than 28 observations.
Computed 95% confidence intervals expanding over the forecast horizon using residual standard error scaling.
Implemented rolling-origin holdout backtesting on the last 14 days, computing MAE, RMSE, MAPE, and seasonal-naive baseline comparison.
2. Service Authentication & Route (services/ml/app/routes/forecast.py):
Mounted authenticated endpoint POST /forecast secured by x-service-token == ML_SERVICE_TOKEN.
3. Typed Client Integration (pps/api/src/modules/ml/ml.client.ts):
Added typed orecast() method to MlClient with 5s timeout, 2x retry backoff, and circuit-breaker protection.
4. Contiguous SQL Series Generation (pps/api/src/modules/forecast/forecast.service.ts):
Constructed a zero-filled 35-day contiguous calendar sequence via SQL queries across campaign events, direct applications, and spend tables.
5. In-Process Moving Average Fallback & Redis Caching:
Implemented allback_moving_average in orecast.service.ts to guarantee zero-downtime availability when the ML service is unreachable.
Cached forecast results in Redis for 5 minutes (300s TTL) using versioned namespace caching.
6. Proactive Shortfall Alerter:
Derived campaign target daily pacing from total budget and standard ₹25 CPA benchmark.
Evaluated projected 7-day application volume against required target pace.
When a shortfall is detected, automatically created a persistent Recommendation(type: 'FORECAST_ALERT', status: 'PROPOSED') with severity and advice.
7. Next.js Forecasting Dashboard (pps/web/app/forecast/page.tsx):
Built interactive dashboard with metric selector tabs (applications, interviews, hires, spend), horizon filters (7d, 14d, 30d), and campaign dropdown.
Displayed prominent amber shortfall alert banner with direct navigation to /optimize.
Rendered KPI summary cards for projected volume, trend velocity vs prior 7 days, model engine badge, and pacing progress.
Rendered Recharts time-series line chart with 95% confidence interval bands.
Rendered backtest validation table comparing model MAE, RMSE, and MAPE against the seasonal-naive baseline.
8. Sidebar Navigation:
Connected existing /forecast sidebar link to the new route.

### Alternative
Relying exclusively on complex deep learning sequence models (such as LSTMs or Transformers) would add heavy GPU dependencies and excessive inference latency for daily recruitment series.
Omitting contiguous zero-filling in SQL queries would distort lag calculations and produce invalid seasonal period alignments.

### Why
Holt-Winters Exponential Smoothing provides fast, statistically sound forecasts on weekly seasonal tabular data while naturally adapting to recent level and trend changes.
Guaranteed in-process fallback and circuit breakers maintain uninterrupted hiring operations even during ML service maintenance.
Direct linkage between pacing shortfalls and optimization recommendations closes the loop between predictive insights and actionable budget reallocations.

### Result
Verified with 4 pytest tests in services/ml/tests/test_forecast.py validating weekly seasonality capture, MAE < baseline MAE, short series fallback, token authentication, and non-negative confidence bands.
Verified with 10 passing unit and integration tests in pps/api/tests/forecast.test.ts covering 35-day zero-fill generation, moving-average math, ML client communication, upstream error fallbacks, shortfall detection, and FORECAST_ALERT Recommendation creation.
Verified with 4 React Testing Library tests in pps/web/tests/forecast.test.tsx verifying KPI card rendering, shortfall alert banners, backtest tables, and metric tab switching.
Verified entire monorepo quality gate with 17/17 pytest tests, 242/242 API tests, 46/46 Web tests, 0 lint errors, 0 typecheck errors, and clean Next.js production builds.
