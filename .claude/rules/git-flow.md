# Git Flow & Deployment

**Always applies.**

- For new feature work, create (or ask the user to create) a dedicated feature branch before code changes — a short slug like `feature/message-first-attachments` or `fix/recipe-proposal-logging`. Do not implement feature work directly on `main` unless the user explicitly requests it.
- Preferred handoff: inspect `git status`, `git diff`, and recent `git log`; stage only files relevant to the user-approved change; run the narrowest useful validation; commit/push only when the user asks.
- Do not disturb unrelated staged or unstaged user changes. If staged changes already exist, preserve them unless the user asks otherwise.
- Never stage or commit `.env`, secrets, credentials, private health data, `.idea/`, `.turbo/`, `.next/`, `tsconfig.tsbuildinfo`, or local runtime artifacts (`.data/`, logs, caches, generated test output).
- **Railway deploys with Drizzle migrations under `packages/db/drizzle` are not complete until the migration is applied manually via Railway CLI.** Keep API runtime `DATABASE_URL` on private networking; use the public migration URL only for the explicit migrate command. See `docs/deployment/railway.md`.

> Note: the legacy `.cursor` rule forbidding `Co-authored-by: Cursor` authorship was Cursor-specific. In Claude Code, follow the harness's commit conventions and the user's instructions.
