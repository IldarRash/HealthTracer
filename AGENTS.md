# AI Health Coach Agent Guide

## Product Invariants

- This is an AI Health Coach for wellness, fitness, tracking, and coaching.
- Chat is not the source of truth; structured state is.
- AI creates structured proposals. Backend services validate and apply them.
- Workout and nutrition plans must be revision-safe.
- Do not generate diagnosis or treatment workflows.

## Architecture

- Use a TypeScript monorepo with Turborepo and pnpm.
- Apps belong in `apps/*`.
- Shared packages belong in `packages/*`.
- Backend is a NestJS modular monolith.
- Database schema and migrations belong in `packages/db`.
- Shared API contracts and Zod schemas belong in `packages/types`.

## Agent Workflow

Use specialized roles for larger work:

1. Product Analyst clarifies problem, scope, acceptance criteria, and risks.
2. Feature Planner breaks the feature into vertical slices and role-specific tasks.
3. Backend Implementer builds NestJS, Drizzle, Zod, repositories, services, and backend tests.
4. Frontend Implementer builds Next.js, Expo, TanStack Query integration, and UI states.
5. Design System Agent defines reusable tokens, primitives, accessibility, and cross-platform patterns.
6. Test Writer adds focused domain, API, schema, AI, and UI state tests.
7. Implementation Reviewer checks correctness, architecture fit, security, tests, and docs impact.

Role templates live in `.cursor/agents`.

## Model Policy

- Feature Planner must use GPT-5.5 for planning and task decomposition.
- Backend Implementer and Frontend Implementer must use the latest Composer model available in Cursor.
- If model slugs are required by tooling, use `gpt-5.5-medium` for GPT-5.5 and `composer-2.5-fast` for the latest Composer currently available.

## Development Workflow

1. Inspect relevant architecture and product docs before changing code.
2. Use `.cursor/references/best-practices.md` for external reference inspiration.
3. Make the smallest vertical change that satisfies the task.
4. Keep business logic out of UI components and controllers.
5. Add or update focused tests for domain logic, schemas, UI states, and AI output handling.
6. Run the narrowest useful validation command before summarizing.

## Safety

- Never commit secrets or health data.
- Do not log sensitive user data.
- Do not run destructive database operations without explicit approval.
- Do not bypass Drizzle migrations for schema changes.
- For unfamiliar framework APIs, consult Context7 or current docs first.

## Cursor Operating Layer

- Project rules live in `.cursor/rules`.
- Consolidated skills live in `.cursor/skills`.
- Agent role templates live in `.cursor/agents`.
- Reference inspiration lives in `.cursor/references`.
- Architecture and feature roadmap live in `docs`.

## Useful Docs

- `docs/product/mvp-scope.md`
- `docs/product/mvp-slices.md`
- `docs/architecture/overview.md`
- `docs/architecture/domain-model.md`
- `docs/architecture/ai-update-flow.md`
- `docs/architecture/database.md`
- `docs/architecture/auth.md`
- `docs/architecture/foundation-slice.md`
- `docs/architecture/mcp.md`
