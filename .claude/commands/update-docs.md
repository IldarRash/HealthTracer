---
description: Sync docs/, README, and AGENTS.md with the current code via the doc-updater agent.
argument-hint: "[area, e.g. llm-pipeline | database | readme]  (optional)"
---

Sync documentation with the current codebase. Area: **$ARGUMENTS** (default: infer from the current branch diff). Delegate to the **doc-updater** subagent.

Source of truth is the **code**, plus `package.json` scripts and `.env.example` — do not invent endpoints, scripts, env vars, tables, or pipeline stages.

1. Determine affected docs from the diff:
   - AI/chat changes → `docs/architecture/llm-pipeline.md` + the "Learned Workspace Facts" in `AGENTS.md`.
   - Schema/migration changes → `docs/architecture/database.md` and `domain-model.md`.
   - New module/endpoint → `docs/architecture/overview.md` / `product-surface-architecture.md`.
   - Config behavior → `docs/architecture/ai-behavior-config.md`.
   - Setup/scripts → `README.md`.
2. Read the relevant code and confirm module/service/file names, Drizzle tables, Zod contracts, and `package.json` scripts.
3. Update only what changed; keep stable sections intact. For `llm-pipeline.md`, preserve the documented invariants and move any removed path into "Removed Legacy Paths".
4. Validate: every referenced file/dir exists, every listed command is a real script, internal links resolve, snippets match current signatures.
5. Never write secrets, real DB URLs, or sample health data into docs.

Report which docs changed, what was synced, paths/links corrected, and anything flagged obsolete for manual review.
