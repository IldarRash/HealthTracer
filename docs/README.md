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
- [`features/`](product/features) — feature briefs (open briefs; completed ones
  are folded back into the roadmap and architecture docs).
  - [`editable-proposals-performed-log.md`](product/features/editable-proposals-performed-log.md)
    — universal editable display contract + plan-vs-performed log.
- [`mobile-parity.md`](product/mobile-parity.md) — explicit mobile (Expo)
  deferral, what web has that mobile lacks, and the trigger to revisit.

## Deployment (`deployment/`)

- [`railway.md`](deployment/railway.md) — Railway deploy + manual Drizzle
  migration procedure.

## Design handoff

- [`design_handoff_plan_screens/`](design_handoff_plan_screens/README.md) —
  high-fidelity design references (tokens, atoms, screens) for the Longevity /
  Workouts / Nutrition surfaces and all their states.

> A newer end-to-end interactive prototype lands under
> `docs/design_handoff_prototype/` via PR #26. If that directory is not yet
> present on this branch, it will be once #26 merges.
