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



