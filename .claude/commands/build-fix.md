---
description: Incrementally fix typecheck/build/lint errors, one at a time, re-verifying after each.
argument-hint: "[package path, e.g. apps/api]  (optional — defaults to whole repo)"
---

Incrementally fix TypeScript, build, and lint errors. Target: **$ARGUMENTS** (a package path like `apps/api`, or the whole repo if empty).

For a non-trivial set of errors, delegate to the **build-error-resolver** subagent; otherwise fix inline.

1. Reproduce with the narrowest command:
   - Scoped: `corepack pnpm --dir $ARGUMENTS typecheck` then `lint` then `build`.
   - Whole repo: `pnpm typecheck`, `pnpm lint`, `pnpm build`.
2. Parse errors, group by file, sort by severity (errors before warnings).
3. For **each** error, one at a time:
   - Show context (a few lines around the error) and explain the root cause, not the symptom.
   - Apply the minimal fix. For unfamiliar framework/SDK APIs, check Context7 / current docs before guessing.
   - Re-run the same command and verify the error is resolved.
4. **Stop** if a fix introduces new errors, the same error persists after 3 attempts, or the user asks to pause.

Rules:
- `lint` runs `--max-warnings=0` — fix warnings, don't blanket-disable rules.
- Don't add `as any` or change product behavior / API contracts / domain logic to silence an error. If a correct fix would change behavior, stop and report.
- Preserve Zod contracts and the chat/AI safety invariants.

Summary: errors fixed, errors remaining, any new errors introduced, and commands run.
