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

