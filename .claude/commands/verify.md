---
description: Run CI-parity verification (lint, typecheck, test, build) and report PR-readiness.
argument-hint: "[quick|full|pre-pr]  (default: full)"
---

Run verification on the current codebase state. Mode: **$ARGUMENTS** (default `full`).

Use the repo's real commands (pnpm + turbo). Scope to a package with `corepack pnpm --dir <pkg> <script>` when only one workspace changed.

Run in this order and STOP early only on a hard failure that blocks later steps:

1. **Typecheck** — `pnpm typecheck`. Report every error as `file:line`.
2. **Lint** — `pnpm lint`. Note: eslint runs with `--max-warnings=0`, so **any warning fails**.
3. **Test** — `pnpm test` (vitest). Report passed/failed counts; for failures, name the spec.
4. **Build** — `pnpm build` (skip for `quick`).
5. **Safety scan** (for `pre-pr`): grep changed files for `console.log`, leaked secrets/keys, and any diagnosis/treatment wording or logging of health data.
6. **Git** — `git status` and `git diff --stat` to show what changed.

Modes:
- `quick` — typecheck + lint only.
- `full` — steps 1–4 (default).
- `pre-pr` — steps 1–6, plus note any new migrations under `packages/db/drizzle` (Railway applies them automatically via the `health-api` pre-deploy command; a failure halts the deploy).

Output a concise report:

```
VERIFICATION: [PASS/FAIL]
Types:  [OK | N errors]
Lint:   [OK | N issues]
Tests:  [X/Y passed]
Build:  [OK | FAIL]
Safety: [OK | N findings]
Ready for PR: [YES/NO]
```

List any blocking issues with a concrete fix suggestion. Do not report PASS if any step failed, was skipped without reason, or is still running.
