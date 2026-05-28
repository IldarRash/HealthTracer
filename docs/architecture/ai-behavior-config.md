# Repo-Backed AI Behavior Config

## Policy

Chat/AI **behavior policy** (direct paths, revision routing, context budgets, prompt templates, attachment routing, explainer detection, deterministic triggers) lives in version-controlled repo files first. Runtime code is a generic engine that loads, validates, and enforces safety invariants.

- **Source of truth:** `packages/ai-behavior/config/ai-behavior.json` (override path via `AI_BEHAVIOR_CONFIG_PATH`).
- **No DB overlay** in this phase. Policy changes ship with the deploy artifact and code review.
- **Schema validation:** Zod schemas in `@health/types` (`aiBehaviorConfigSchema` and section schemas).
- **Fail-closed loading:** Missing, malformed JSON, or invalid schema → built-in defaults from `buildDefaultAiBehaviorConfig()`.

## Ownership

| Area | Owner | Notes |
| --- | --- | --- |
| Config file edits | Backend / AI platform | Require PR review; pair with focused tests when changing regex or budgets |
| Schema & safety floor | Backend platform | Code-owned; config cannot relax safety boundaries |
| Prompt templates | Backend + product copy | Placeholder contracts validated at compile time |
| Capability catalog | Backend | Optional overrides in config merge with code catalog |

## Safety invariants (code-enforced)

These cannot be disabled by config:

- No direct LLM mutation of structured state (proposals only).
- Tool allowlist and bounded agent loop.
- Context budget **document** and **sensitive health** exposure floors (`allowDocuments=false`, `allowSensitiveHealthContext=false`) applied after load/normalize.
- Absolute numeric clamps on context budgets (`CONTEXT_BUDGET_ABSOLUTE_LIMITS`).
- Invalid regex patterns (direct paths, explainer, context budget triggers) compile to safe fallbacks, not startup crashes.
- Crisis, consent, and medical-safety guards remain in orchestration/services.

## How config is loaded

1. `loadAiBehaviorConfig()` reads JSON from disk (or uses defaults on failure).
2. `resolveLoadedAiBehaviorConfig()` parses with Zod; invalid files → full defaults.
3. `normalizeAiBehaviorConfig()` merges partial values onto defaults and **sanitizes** context budgets (safety floor + trigger regex validation).
4. `AiBehaviorConfigService` exposes typed getters; facades/matchers compile regex and templates at init.

Startup logs warnings for sanitized values (e.g. invalid trigger regex, rejected document/sensitive-health flags).

## Editing config

1. Edit `packages/ai-behavior/config/ai-behavior.json` (or env-pointed file).
2. Keep `version` at `1` until a migration is defined.
3. Run narrow validation:
   - `pnpm --dir packages/types test -- src/ai-behavior-config.spec.ts src/ai-behavior-safety-invariants.spec.ts src/context-budget.spec.ts`
   - `pnpm --dir packages/ai-behavior test`
   - `pnpm --dir apps/api test -- src/modules/coaching-context/context-budget-policy.service.spec.ts`
4. Restart API to pick up file changes (no hot reload of behavior config today).

### Context budget triggers

`contextBudgets.triggers.monthlyReviewMessagePattern` and `multiDomainMessagePattern` must be valid JavaScript regex strings. Invalid patterns fall back to built-in defaults and emit a startup warning.

### Context budget profiles

`default` and `deep_review` profiles tune slice counts, depth, lookback, and compression. **Do not set** `allowDocuments` or `allowSensitiveHealthContext` to `true`; the loader forces both to `false`.

## Rollback

1. **Revert the config commit** (or restore the previous `ai-behavior.json` from git) and redeploy/restart API.
2. **Emergency:** unset `AI_BEHAVIOR_CONFIG_PATH` or point it at a known-good file; missing/invalid files load built-in defaults.
3. **Verify:** check API logs for `Loaded repo-backed AI behavior config` vs default warnings; run chat smoke paths (direct path, explainer, deep-review monthly message).

DB-backed policy overlays, audit history, and version pinning are deferred until files-first policy is stable in production.

## Related docs

- Feature brief: `docs/product/features/repo-backed-ai-behavior-config.md`
- AI update flow: `docs/architecture/ai-update-flow.md`
- Capability chat pipeline: `docs/architecture/capability-based-chat-flow.md`
