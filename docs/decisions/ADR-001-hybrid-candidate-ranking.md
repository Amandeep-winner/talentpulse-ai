# ADR-001: Hybrid Explainable Candidate Ranking and Bias Mitigation Architecture

## Status
Accepted

## Context
Recruitment decision-making systems increasingly rely on automated algorithms to rank candidate pools for open job requisitions.
Pure vector semantic search often identifies candidates with related domain vocabulary but disregards essential operational requirements, such as hard skills coverage, minimum experience thresholds, geographic constraints, and compensation boundaries.
Conversely, rule-based keyword filters disqualify highly capable candidates who express equivalent competencies using synonymy or contextual descriptions.
Furthermore, algorithmic candidate evaluation introduces severe compliance and ethical risks if protected demographic attributes influence scoring.
Transparency is paramount: recruiters must understand exactly why a candidate received a particular ranking, and compliance teams require immutable audit trails for every automated recommendation.

## Decision
We implement a hybrid explainable candidate ranking pipeline combining vector semantic similarity with five deterministic rule-based criteria:
1. Mathematical Formulation:
`finalScore = 0.35 * semantic + 0.25 * skills + 0.15 * experience + 0.10 * location + 0.10 * education + 0.05 * preferences`
All weights sum strictly to 1.0, asserted at runtime and verified by automated unit tests.
2. Complete Exclusion of Protected Demographic Attributes:
The candidate scoring interface accepts only a specialized `ScoringCandidateInput` data structure.
Candidate name, email address, age, gender, race, religion, photos, and demographic indicators are strictly stripped prior to score evaluation.
Automated compiler type definitions and runtime boundary tests guarantee that protected characteristics cannot reach the scoring function.
3. Deterministic Explainability (Reasons and Gaps):
Every candidate evaluation emits structured evidence arrays detailing positive alignment factors (`reasons`) and disqualifying criteria or shortfalls (`gaps`).
Recruiters receive granular insights such as "Matches 4/5 required skills: python, sql, postgresql" alongside specific warnings such as "Missing required skill: kubernetes".
4. Two-Stage Retrieval and Reranking:
To maintain sub-second response times over large candidate repositories, the engine executes high-speed pgvector approximate nearest neighbor retrieval (K=50) using the requisition embedding vector.
The top 50 candidates are subsequently reranked in memory using the full hybrid scoring formula, returning the top N candidates (default 20).
5. Immutable Recommendation Audit Trail:
Every ranking execution records an immutable `Recommendation` row in PostgreSQL.
The record captures the requisition identifier, an SHA-256 hash of the candidate evaluation pool, the model version (`hybrid-v1`), the decision array, and the weights configuration.

## Consequences
- Positive: Recruiters receive balanced, highly relevant candidate shortlists that combine contextual resume comprehension with rigorous compliance and requirements verification.
- Positive: Full explainability builds recruiter confidence and eliminates "black-box" decision paralysis.
- Positive: Stripping protected attributes mitigates algorithmic bias and ensures compliance with fair-hiring regulations and corporate diversity policies.
- Positive: Immutable audit logging satisfies governance and algorithmic accountability requirements.
- Negative: Re-evaluating 50 candidate profiles per requisition requires fetching complete candidate metadata, necessitating efficient indexed queries and batch hydration.
