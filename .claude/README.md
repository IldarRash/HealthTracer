# Claude Code Operating Layer

This directory is the Claude Code equivalent of the project's `.cursor/` setup, adapted into Claude-native formats and informed by patterns from
[everything-claude-code](https://github.com/worldflowai/everything-claude-code). The root **`CLAUDE.md`** is the entry point loaded into every session.

## Layout

```text
.claude/
  settings.json     Permissions allowlist (validation/db/git-read commands), env, denied destructive ops
  agents/           Subagents invoked via the Agent tool (auto-delegated by their `description`)
  commands/         Slash commands (/verify, /build-fix, /refactor-clean, /update-docs)
  skills/           Invocable workflows (Skill tool) — name + description frontmatter
  rules/            Detailed style/security/AI rules ported from .cursor/rules (consult per area)
```

## Agents (`.claude/agents/`)

| Agent | When to use |
| --- | --- |
| `feature-planner` | Decompose & orchestrate larger features (never writes code itself) |
| `product-analyst` | Clarify scope / write a feature brief before planning |
| `backend-implementer` | NestJS / Drizzle / Zod / repositories / services / backend tests |
| `frontend-implementer` | Next.js / Expo / TanStack Query / UI states |
| `test-writer` | Focused vitest tests, incl. revision & AI safety cases |
| `implementation-reviewer` | Read-only review: correctness, architecture, safety, tests |
| `security-reviewer` | Health-data privacy, secrets, consent, AI/safety boundaries |
| `refactor-cleaner` | Remove superseded legacy code after a refactor |
| `build-error-resolver` | Fix build / typecheck / lint failures |
| `app-runner` | Start the stack and verify a flow works end-to-end |
| `github-agent` | Bookend the feature workflow: open issue + branch, then commit + push + PR |
| `visual-designer` | Screen-level visual direction / UX audit (plans only) |
| `design-system-agent` | Reusable UI primitives, tokens, accessibility |
| `ui-polish-implementer` | Approved visual-only polish |
| `doc-updater` | Keep docs/, README, AGENTS.md in sync with code |

## Commands (`.claude/commands/`)

Adapted from [everything-claude-code](https://github.com/worldflowai/everything-claude-code) for this repo's pnpm/turbo/vitest stack:

| Command | Does |
| --- | --- |
| `/verify [quick\|full\|pre-pr]` | CI-parity: typecheck → lint → test → build, reports PR-readiness |
| `/build-fix [pkg]` | Incrementally fix typecheck/build/lint errors one at a time |
| `/refactor-clean [scope]` | Find & safely remove dead/superseded code with test verification |
| `/update-docs [area]` | Sync docs/README/AGENTS.md with code (via doc-updater) |

## Skills (`.claude/skills/`)

`backend-implementation`, `frontend-implementation`, `feature-planning`, `product-analysis`, `security-review`, `test-writer`, `design-system`.

## Rules (`.claude/rules/`)

`product-overview`, `monorepo-structure`, `backend-style`, `frontend-style`, `testing`, `security`, `ai-orchestrator`, `git-flow`, `refactor-cleanup`, `agent-workflow`. The critical invariants are also summarized in `CLAUDE.md`; consult the matching rule file when working in its area.

> The original `.cursor/` configuration is retained as the source of truth for the Cursor editor. Keep the two layers in sync when project guidance changes.
