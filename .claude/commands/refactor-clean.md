---
description: Find and safely remove dead/superseded code after a refactor, with test verification.
argument-hint: "[scope, e.g. apps/api/src/modules/ai]  (optional)"
---

Safely identify and remove dead or superseded code. Scope: **$ARGUMENTS** (default: the current branch diff). This enforces the project's `.claude/rules/refactor-cleanup.md` rule. Prefer delegating to the **refactor-cleaner** subagent.

This repo has no `knip`/`depcheck`/`ts-prune` installed — find dead code with the tools that exist:

1. **Find candidates:**
   - Grep for old names, removed concepts, and the "Removed Legacy Paths" entries in `docs/architecture/llm-pipeline.md`.
   - Search for symbols exported but never imported, files no longer referenced, and stale config keys in `packages/ai-behavior/config/*.json`.
   - `git diff main...HEAD --stat` to see what the refactor already touched.
2. **Categorize:**
   - SAFE — obsolete tests, unused private helpers, dead exports with zero importers.
   - CAUTION — public-ish exports in `packages/types`/`packages/ai`, NestJS providers, anything imported across packages.
   - DANGER — schema/migrations, persisted-data shapes, public API contracts, active rollout/compat code.
3. Propose **SAFE** deletions (and CAUTION only with explicit confirmation). Never touch DANGER without the user.
4. **Verify before and after each removal:** run the narrowest `corepack pnpm --dir <pkg> typecheck` + targeted vitest, apply the deletion, re-run; roll back if it breaks.
5. Confirm the old path is no longer referenced anywhere (grep the removed names again).

Rules:
- Preserve backward compatibility only for shipped behavior, persisted data, public API contracts, and active rollout safety — mark anything kept as compatibility code with its removal condition.
- Never delete code without running the relevant tests first.

Summary: items removed, what was kept and why (by name), and validation that proves the old path is gone.
