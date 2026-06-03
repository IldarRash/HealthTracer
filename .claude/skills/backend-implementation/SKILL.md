---
name: backend-implementation
description: Implement backend feature slices in NestJS with Drizzle, Zod contracts, repositories, services, migrations, and focused tests. Use for API, database, domain module, AI proposal application, and backend contract work.
---

# Backend Implementation

## Workflow

1. Read relevant docs in `docs/architecture` and `docs/product` (for AI/chat work, read `docs/architecture/llm-pipeline.md`).
2. Define the domain boundary and API contract before writing code.
3. Add or update Zod schemas in `packages/types`.
4. Add Drizzle schema and migrations in `packages/db` when persistence changes (`pnpm --filter @health/db db:generate`).
5. Implement the NestJS module, controller, service, repository, and tests in `apps/api`.
6. Keep controllers thin, services domain-focused, and repositories database-focused.
7. Run the narrowest useful backend test or typecheck command.

## Rules

- Do not mutate workout or nutrition plans in place; create revisions.
- AI tools must call services, not repositories directly, and return proposals — never direct mutations.
- Do not bypass Drizzle migrations.
- Do not touch frontend code unless the task explicitly asks for a full vertical slice.
