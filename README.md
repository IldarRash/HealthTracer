# HealthTracer — AI Health Coach

> A stateful, adaptive AI **health coach** built as a system, not a chatbot: structured domain state is the single source of truth, and chat is only an interface that proposes changes the user must approve.

![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-API-E0234E?logo=nestjs&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-App%20Router-000000?logo=nextdotjs&logoColor=white)
![Expo](https://img.shields.io/badge/Expo-Mobile-000020?logo=expo&logoColor=white)
![Drizzle](https://img.shields.io/badge/Drizzle-ORM-C5F74F?logo=drizzle&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-DB-4169E1?logo=postgresql&logoColor=white)
![Turborepo](https://img.shields.io/badge/Turborepo-monorepo-EF4444?logo=turborepo&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-10-F69220?logo=pnpm&logoColor=white)

## What & why

Most "AI coach" products are stateless chat assistants: they forget context and can silently edit your plan with no audit trail. HealthTracer inverts that. Plans, goals, metrics, and progress live in a Postgres-backed structured domain model that is **authoritative**; the AI interprets a user message into a **typed proposal**, the backend **validates** it (schema, ownership, provenance, safety), and only a user-approved proposal becomes an immutable **revision** in the database. The result is coaching adaptation that is traceable, reversible, and safe by construction. (Scope is wellness/coaching only — the product never emits diagnosis, treatment, or medical-certainty language; medical uploads are consent-gated coaching *context*, never a diagnosis engine.)

### Structured-state-first design (the four invariants)

1. **Wellness only** — never diagnosis, treatment, or medical-certainty output.
2. **Chat is an interaction layer, not the source of truth** — structured domain state is authoritative.
3. **AI emits typed proposals, never direct DB mutations** — backend services validate every proposal and decide accept / reject / supersede.
4. **Workout and nutrition changes create new revisions** — plan identity is stable while each change appends an immutable revision (auditability + rollback).

## Architecture

The core subsystem is a unified, multi-domain **fan-out + synthesis** LLM pipeline: one router LLM selects up to 3 relevant domains, the selected domain LLMs run in parallel, and a single decision-maker LLM synthesizes their output into typed proposals. A deterministic planner sits between the LLMs and clamps their output to a hard capability allowlist — "the LLM suggests, the planner finalizes."

```text
User message (+ optional attachments)
  → ChatService.sendMessage          resolve user, load thread, persist message
  → attachment turn stages           context-only plumbing (validate → link → apply disposition)
  → code-owned PRE-AI gates          crisis support / proposal explainer / direct paths (bypass the LLM)
  → AiService → AgentOrchestrator
       → MessagePreprocessor         deterministic normalization (no LLM)
       → RouterLlm        (LLM 1)    selects ≤3 domains, read-only + clamped to the allowlist
       → SystemPlanner               deterministic fan-out plan (budget, executor modes, allowlists)
       → CoachingContext             one bounded context packet per selected domain
       → Domain LLMs (parallel)      workout / nutrition / health; a failed domain → safe empty output
       → DecisionMaker    (LLM N+2)  synthesizes domain outputs into typed proposals only
       → ActionResolver              resolves a typed proposal, filtered to the active allowlist
  → ProposalValidation + persist     reviewable proposals (NOT applied)
  → user accepts a valid proposal → workout/nutrition NEW REVISION
```

**Safety floors live in code, not config:** crisis support bypasses all LLMs; per-domain context budgets deny documents + sensitive health context by default; the router is read-only and cannot reply or propose; the decision-maker emits typed proposals only and never writes domain state. YAML/JSON config can only *narrow* capability allowlists, never widen them, and loading is fail-closed. A deterministic **stub provider** mirrors every LLM method, so the whole pipeline is testable in CI without external API access.

## Tech stack

- **Monorepo:** Turborepo + pnpm 10 workspaces; shared Zod contracts and Drizzle migrations are reviewed alongside app changes.
- **Backend (`apps/api`):** NestJS modular monolith, one module per domain, strict layering (thin controllers → services own domain logic → repositories own DB access). All API inputs and AI outputs validated with Zod.
- **Web (`apps/web`):** Next.js App Router — the primary product surface (Chat · Today · Longevity · Profile).
- **Mobile (`apps/mobile`):** Expo / Expo Router shell.
- **Data:** PostgreSQL with Drizzle ORM owning schema + migrations; plan entities are revision-safe.
- **Auth:** Clerk (the API verifies JWTs via a Clerk JWKS URL).

## Getting started

Requires Node, pnpm 10 (via corepack), and Docker (for local Postgres).

```bash
pnpm install

# env files (fill local values only — never commit real keys / DB URLs / health data)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp packages/db/.env.example packages/db/.env

pnpm db:up        # start local Postgres (docker compose)
pnpm db:migrate   # apply Drizzle migrations (needed before seeding; pnpm dev also applies them)
pnpm db:seed      # seed reference data: exercises, recipes, and habit templates
pnpm dev          # apply migrations + run the dev stack — API on :3000, Web on :3001 (fails fast if Postgres is down)

pnpm db:down      # stop Postgres when finished
```

Validation: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`. Generate new migrations after schema changes with `pnpm --filter @health/db db:generate`.

> Protected API/web flows require a Clerk application — set `CLERK_JWKS_URL` (API) and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` (web). Without Clerk credentials, lint/typecheck/build still run.

## Project structure

```text
apps/
  api       NestJS REST API (modular monolith, one module per domain)
  web       Next.js App Router — primary product surface
  mobile    Expo / Expo Router shell
packages/
  types         shared Zod contracts + pure domain helpers (contract source of truth)
  db            Drizzle schema + migrations (the only place schema/migrations live)
  ai            prompt helpers, tool schemas, proposal helpers, stub provider, safety fns
  ai-behavior   file-backed AI/chat + attachment behavior config (no DB overlay)
  config        shared TypeScript / eslint / env config
  ui            shared UI tokens / primitives
docs/         product + architecture docs (ADRs, LLM pipeline, auth, MCP)
```

## Documentation

Start at [`docs/README.md`](docs/README.md) for the full index.

- `docs/architecture/` — the LLM-pipeline spec, AI-behavior config, domain model, database, auth, MCP, and ADRs.
- `docs/product/` — the phased feature roadmap, open feature briefs, and the mobile-parity deferral note.
- `CLAUDE.md` / `AGENTS.md` — engineering invariants and contributor guidance.
