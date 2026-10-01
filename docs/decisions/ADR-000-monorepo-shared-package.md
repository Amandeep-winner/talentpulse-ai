# ADR-000: Consolidate Types, Validation, and Config into Packages/Shared

## Status
Accepted

## Context
The original architecture plan proposed separate packages: `packages/types`, `packages/validation`, and `packages/config`.
In a TypeScript monorepo with Next.js App Router and Express, having three granular internal packages introduces overhead:
- Multiple compilation steps and interdependent build pipelines.
- Inferred types from Zod schemas inherently couple types and validation logic.
- Increased risk of cyclic dependencies and slower local iteration loops.

## Decision
Merge `packages/types`, `packages/validation`, and shared configuration schemas into a single internal package named `@talentpulse/shared` (`packages/shared`).

This package:
- Compiles via `tsc` to produce common JavaScript and declaration files (`dist/`).
- Defines all domain Zod schemas for API contracts, entities, and requests/responses.
- Exports TypeScript types directly inferred from those Zod schemas (`z.infer<...>`).
- Exports shared constants and enum representations used by both web frontend and backend services.

## Alternatives Considered
1. **Three separate packages (`types`, `validation`, `config`)**:
   Rejected due to duplicate synchronization maintenance and multiple `npm run build` steps.
2. **Duplicating schemas in `apps/api` and `apps/web`**:
   Rejected because maintaining two separate definitions violates single-source-of-truth principles and invites contract drift.

## Consequences
- Positive: Single build step for shared code (`npm run build -w packages/shared`).
- Positive: Zero divergence between backend validation and frontend forms.
- Positive: Simpler tsconfig references and clean workspace resolution.
- Negative: Any change to shared code requires rebuilding `@talentpulse/shared` during development (handled smoothly via npm build scripts and workspace linking).
