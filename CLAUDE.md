# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product Invariants (non-negotiable)

- This is an **AI Health Coach** for wellness, fitness, tracking, and coaching. It must **never** produce diagnosis, treatment, or medical-certainty language.
- **Chat is an interaction layer, not the source of truth.** Structured domain state is authoritative for plans, goals, metrics, and progress.
- AI produces **typed proposals**, never direct database mutations. Backend services validate every proposal (schema, ownership, provenance, safety) and decide accept/reject/supersede.
- Workout and nutrition changes **create new revisions** — never overwrite active plan state in place.
- The AI layer never writes directly to domain tables.

## Commands

All commands run from the repo root unless noted. Package manager is **pnpm 10** (via corepack); orchestration is **Turborepo**.

```text
pnpm install              # install all workspaces
pnpm dev                  # run full dev stack (turbo dev) — API :3000, Web :3001
pnpm lint                 # eslint across workspaces (--max-warnings=0, so warnings fail)
pnpm typecheck            # tsc --noEmit across workspaces
pnpm test                 # vitest run across workspaces
pnpm build                # turbo build
```

Database (local Postgres via Docker Compose):

```text
pnpm db:up                # start Postgres container
pnpm db:migrate           # apply Drizzle migrations
pnpm db:down              # stop Postgres
pnpm --filter @health/db db:generate   # generate a new migration after schema changes
pnpm db:seed:recipes      # seed reference data (also :exercises)
```

Scoping to one package/app — prefer the `--dir` form already used by the repo's own scripts:

```text
corepack pnpm --dir apps/api lint
corepack pnpm --dir apps/api typecheck
corepack pnpm --dir apps/api test
```

Running a **single test** (vitest):

```text
corepack pnpm --dir apps/api exec vitest run src/modules/ai/system-planner.service.spec.ts   # one file
corepack pnpm --dir apps/api exec vitest run -t "clamps capabilities"                          # by test name
```

Per-package scripts (`build`, `lint`, `test`, `typecheck`, `dev`) exist in each `apps/*` and `packages/*` package and are run by turbo. After making changes, run the **narrowest useful** validation (single-file test, then package `typecheck`/`lint`) before summarizing.

## Architecture

TypeScript monorepo. Apps live in `apps/*`, shared code in `packages/*`. Never import one app into another; cross-cutting code goes through `packages/*`.

```text
apps/api        NestJS modular monolith (REST API, :3000) — one module per domain
apps/web        Next.js App Router web shell (:3001)
apps/mobile     Expo / Expo Router shell
packages/types  Shared Zod contracts + pure domain helpers (the contract source of truth)
packages/db     Drizzle schema + migrations (the only place schema/migrations live)
packages/ai     Prompt helpers, tool schemas, proposal helpers, stub provider, safety fns
packages/ai-behavior  File-backed AI/chat + attachment behavior config (no DB overlay)
packages/config shared TS/eslint/env config
packages/ui     shared UI tokens/primitives
```

### Backend layering (apps/api)

NestJS modular monolith, one module per domain (`ai`, `chat`, `chat-attachments`, `coaching-context`, `proposals`, `workouts`, `nutrition`, `goals`, `habits`, `today`, `recovery`, `profiles`, etc.). Within a module: **controllers stay thin → services own domain logic → repositories own DB access.** Validate all API inputs and AI outputs with Zod contracts from `packages/types`. Use typed errors / Nest exceptions; never swallow failures.

### The unified LLM / chat pipeline (the most important subsystem)

`docs/architecture/llm-pipeline.md` is the canonical, file-by-file map — **read it before touching anything in `apps/api/src/modules/ai`, `chat`, `chat-attachments`, or `coaching-context`.** The high-level flow:

The pipeline is a **multi-domain fan-out + synthesis** design (one router LLM →
selected domain LLMs in parallel → one decision-maker LLM):

```
ChatService.sendMessage           apps/api/src/modules/chat/chat.service.ts
  → attachment turn stages         chat-attachments/* — context-only plumbing (validate→link→apply disposition)
  → code-owned pre-AI gates        crisis support, proposal-explainer, direct-chat-paths (bypass the LLM)
  → AiService → AgentOrchestrator  ai/ai.service.ts, ai/agent-orchestrator.service.ts
      → MessagePreprocessor        message normalization: language + signals + direct-path candidate hints
      → RouterLlm  (1st LLM)       ai/router-llm.service.ts — selects ≤3 domains, clamped & read-only
      → SystemPlanner              ai/system-planner.service.ts — deterministic fan-out plan; LLM suggests, planner finalizes
      → CoachingContext            coaching-context/* — one bounded AgentContextPacket per selected domain
      → Domain LLMs (parallel)     ai/domain-llm-executor.service.ts — only-selected: workout / nutrition / health
      → DecisionMaker  (final LLM) ai/decision-maker-executor.service.ts — synthesizes domain outputs
          → CoachAiProvider        ai/openai-coach-provider.ts (stub in packages/ai for tests)
          → AgentToolRegistry      read-only context tools only
      → ActionResolver             resolves typed proposal/action, filtered to the active capability allowlist
  → ProposalValidation + persist   proposals/proposal-validation.service.ts, chat/chat.repository.ts
```

Key invariants in this pipeline (preserve them in **code**, not config):

- **RouterLlm** is the only first-LLM routing stage for eligible turns. It selects up to 3 relevant domains and returns read-only planning hints; it must never emit replies or proposals, and its output is clamped to known domains/capabilities/tools. Proposal-revision and proposal-explainer turns are the explicit non-router exceptions.
- **Domain LLMs run only-selected and in parallel.** Each enforces its own read-only tool allowlist and reply safety; a failed/timed-out domain degrades to a safe empty output. The **decision-maker** LLM synthesizes their outputs and emits typed proposals only — only the workout domain LLM may set a workout calorie estimate.
- **SystemPlanner** is the deterministic control layer — it owns the final fan-out plan, context budget, executor modes, and tool/proposal allowlists, and caps selected domains at 3. The LLM only suggests; the catalog is the floor (router/YAML can only narrow it).
- **Pre-AI gates** (crisis support, proposal explainer, direct chat paths) deliberately bypass the LLM and are safety/deterministic product boundaries — not duplicate routers. Direct paths are read-only or the narrow "mark today's workout done" write; **plan changes are always proposal-only**.
- **Context budgets deny documents and sensitive health context by default**, re-applied to every per-domain packet, and config cannot relax those floors — they are code-level safety floors.
- Attachments are **images only and context-only**: there is no recognition/classification machinery (the multimodal domain LLMs read the image content directly), **no upfront classification** (no category picker / `categorySource` declare-before-upload), and **no upfront consent gate** for images. **Temporary, intentional relaxation (for now):** image content — including a photo of a medical document — reaches the LLM before any consent, consciously removing the previous "medical content only when consent is granted" code floor. The `allowDocuments=false` context-budget floor (about DB `health_documents` slices, not the uploaded image) still holds and no attachment path may create or parse `health_documents` rows. PDF/text document upload and the LLM-recognized medical consent-gated **special save** are **deferred follow-ups**. The removed recognizers/classifiers, `prepare_proposal_candidates` stage, pre-upload classification/consent gate, `medical_document_save` variant, and attachment proposal side-channel must not be reintroduced (see "Removed Legacy Paths" in the pipeline doc).

### Config-driven AI behavior

AI/chat behavior is **files-first and repo-backed**, with no DB overlay:

- `packages/ai-behavior/config/ai-behavior.json` — chat/LLM behavior (routing, direct-path patterns, prompts).
- `packages/ai-behavior/config/attachments.json` — attachment consent, categories, retention, and plumbing stage order (no classification/recognition).
- `packages/ai-behavior/config/domains/*.yml` — per-domain `intents[]/tools[]/signals[]/prompts[]` (workout, nutrition, medical, health), merged by one loader. YAML can only **narrow** the capability-catalog allowlists, never widen them.
- Loaders in `packages/ai-behavior/src/*` (incl. `domain-config-loader.ts`); schemas/defaults in `packages/types/src/ai-behavior-config.ts`, `attachment-behavior-config.ts`, and `domain-config.ts`. Loading is **fail-closed**.

When changing AI/chat or attachment behavior, **prefer editing repo config + adding focused tests over hardcoding in services.** Safety floors stay in code.

## Testing expectations

- Test the behavior changed by the task, not framework defaults.
- Unit-test domain services and pure helpers; integration-test when behavior crosses controller/service/repository/DB boundaries.
- Test Zod schemas for API inputs and AI structured outputs.
- Always test workout/nutrition **revision** behavior.
- For AI changes, cover: valid output, invalid output, unsafe intent, and accepted-proposal revision creation.

## Refactoring

When refactoring, **remove the superseded path** — dead files, exports, obsolete tests, stale config keys, duplicate abstractions — in the same change. Don't layer a new path while leaving the old one. **Pre-launch default is to delete, not preserve:** this is a new startup with no live users and a disposable database, so backward-compat (old persisted shapes, deprecated-but-kept enums, dual code paths, "read old shape" parsers) is **not** a reason to keep old code — remove it. Only keep a legacy path when removal would break a still-needed capability; then mark it as compatibility code and state the removal condition. Call out any remaining legacy by name in your final summary. See `.claude/rules/refactor-cleanup.md`.

## Git & deployment

- Create a feature branch (`feature/<slug>` or `fix/<slug>`) before feature work; don't implement features directly on `main`.
- Inspect `git status` / `git diff` first, stage only files relevant to the approved change, and **don't disturb unrelated staged/unstaged user changes.** Commit/push only when the user asks.
- Never stage secrets, `.env`, `.idea/`, `.turbo/`, `.next/`, build info, or local runtime artifacts.
- **Railway deploys with new migrations under `packages/db/drizzle` are not complete until the migration is applied manually via Railway CLI.** Keep API runtime `DATABASE_URL` on private networking; use the public migration URL only for the explicit migrate command. See `docs/deployment/railway.md`.

## MCP servers

`.mcp.json` (repo root) defines `context7` (current library/framework docs — consult before using unfamiliar SDK APIs) and a read-only `postgres-dev`. Both read secrets from the environment, not the file: set `CONTEXT7_API_KEY` and `DATABASE_URL` in your shell/env (the literal Context7 key currently lives only in `.cursor/mcp.json`). Keep production DB MCP disabled unless security-reviewed.

## Operating layer (subagents, skills, rules)

This repo ships a Claude operating layer under `.claude/` (mirrored from the original `.cursor/` setup):

- `.claude/agents/*` — specialized subagents (planner, backend/frontend implementers, reviewer, test-writer, app-runner, security-reviewer, design agents). Delegate role-specific work to them via the Agent tool.
- `.claude/skills/*` — invocable workflows (backend/frontend implementation, feature planning, test writing, security review, design system).
- `.claude/rules/*` — the detailed style/security/AI-orchestrator rules ported from `.cursor/rules`; consult the relevant file when working in its area.

For larger features, the heavier multi-agent workflow is described in `AGENTS.md` and `.claude/rules/agent-workflow.md`: a planner clarifies scope and a feature brief in `docs/product/features/<slug>.md`, then delegates implementation/tests/review/run-verification to subagents, and the feature is "done" only when the flow works in the running app or a concrete blocker is reported.

## Useful docs

`docs/architecture/llm-pipeline.md` (chat pipeline), `overview.md`, `domain-model.md`, `database.md`, `auth.md`, `ai-update-flow.md`, `ai-behavior-config.md`, `product-surface-architecture.md`; `docs/product/feature-roadmap.md`; `docs/deployment/railway.md`.
