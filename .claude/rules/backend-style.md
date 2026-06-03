# Backend Style

Applies to `apps/api`, `packages/db`, `packages/types`, `packages/ai`.

- Follow a NestJS modular monolith: one module per domain.
- Keep controllers thin; put business logic in services and database access in repositories.
- Validate API inputs and AI outputs with Zod-owned contracts from `packages/types`.
- Use Drizzle schema and migrations from `packages/db`; never bypass migrations.
- Plan updates must create revision records instead of overwriting active plan data.
- Prefer explicit types, named exports, dependency injection, and small focused files.
- Handle errors with typed application errors or Nest exceptions; do not swallow failures.
- Add service tests for domain rules and integration tests when controller, service, and repository behavior interact.
