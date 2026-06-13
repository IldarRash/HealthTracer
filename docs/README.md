# HealthTracer Docs

Index of the docs in this repo. Source of truth is always the code
(`packages/db`, `packages/types`, `apps/api`) plus `package.json` and
`.env.example`; these docs are generated from it.

## Architecture (`architecture/`)

- [`overview.md`](architecture/overview.md) — system shape: monorepo, modular
  monolith, structured-state-first principle.
- [`llm-pipeline.md`](architecture/llm-pipeline.md) — **canonical** file-by-file
  map of the multi-domain fan-out + synthesis chat/AI pipeline, proposal
  lifecycle, and the "Removed Legacy Paths" list. Read before touching `ai`,
  `chat`, `chat-attachments`, or `coaching-context`.
- [`ai-behavior-config.md`](architecture/ai-behavior-config.md) — files-first
  AI/chat + attachment config model, the three config surfaces, fail-closed
  loaders, the YAML narrows-only rule, and code safety floors.
- [`domain-model.md`](architecture/domain-model.md) — core entities, the
  plan-vs-performed split, and modeling rules.
- [`database.md`](architecture/database.md) — Postgres/Drizzle table inventory,
  the revision pattern, and migration/data-access rules.
- [`auth.md`](architecture/auth.md) — authentication decision (Clerk + JWKS).
- [`product-surface-architecture.md`](architecture/product-surface-architecture.md)
  — primary vs secondary surfaces and their data sources.
- [`mcp.md`](architecture/mcp.md) — MCP server setup (`context7`, read-only
  `postgres-dev`).
- [`adr/`](architecture/adr) — architecture decision records
  ([0001: monorepo + modular monolith](architecture/adr/0001-monorepo-modular-monolith.md)).

## Product (`product/`)

- [`feature-roadmap.md`](product/feature-roadmap.md) — product idea, phased
  roadmap, current implementation snapshot, and the open feature-brief index.
- [`features/`](product/features) — briefs for not-yet-implemented work only;
  completed briefs are folded back into the roadmap and architecture docs. The
  one open brief is
  [`llm-live-contract-hardening.md`](product/features/llm-live-contract-hardening.md).
- [`mobile-parity.md`](product/mobile-parity.md) — explicit mobile (Expo)
  deferral, what web has that mobile lacks, and the trigger to revisit.

## Deployment (`deployment/`)

- [`railway.md`](deployment/railway.md) — Railway deploy + manual Drizzle
  migration procedure.
