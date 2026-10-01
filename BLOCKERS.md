# TalentPulse AI - Blockers & Workarounds

This document records technical obstacles encountered during implementation and the resolutions applied.

| Issue | Impact | Resolution | Status |
|---|---|---|---|
| Host PostgreSQL 18 service listening on port 5432 | Port binding collision with Docker PostgreSQL pgvector container | Mapped Docker container port to host port 5433 (5433:5432) in docker-compose.yml and updated development environment variables. | Resolved |
