# TalentPulse AI

**TalentPulse AI - Agentic Recruitment Intelligence & Optimization Platform.**

Built an end-to-end AI recruitment platform using Next.js, React, TypeScript, Node.js, Express and PostgreSQL, combining semantic candidate-job matching, RAG, LLM-powered text-to-SQL analytics, recruitment funnel intelligence and campaign optimization.
Implemented an event-driven ATS integration with webhooks, explainable candidate ranking, predictive hiring analytics and a contextual-bandit optimizer for simulated recruitment budget allocation, with Docker, automated testing and CI/CD.

> **Synthetic Demo Data**: All seeded data, campaigns, candidates, and metrics are synthetic and generated deterministically for demonstration purposes.

## Architecture

- **Frontend**: Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, TanStack Query v5, Recharts.
- **Backend API**: Express 4, TypeScript, Zod, Prisma 5, PostgreSQL 16 with pgvector, Redis 7 with BullMQ.
- **ML Service**: Python 3.11/3.13, FastAPI, scikit-learn, statsmodels, pandas.
- **Mock ATS**: Express app simulating external ATS with OAuth2 and HMAC-SHA256 signed webhooks.

## Getting Started

Refer to [docs/deployment.md](docs/deployment.md) and individual application READMEs for detailed setup guides.
