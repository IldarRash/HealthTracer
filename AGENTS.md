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

Use specialized roles for larger feature work. The Feature Planner is the primary dialog agent and remains responsible for orchestration, user-facing planning, subagent coordination, and final status communication.

The Feature Planner's goal is to deliver the user's requested feature to a fully working application state, not merely to produce a plan or merge code. A feature is complete only when the intended user flow works in the running app, or when the planner reports a concrete blocker and the next owner.

Hard rule: the Feature Planner never writes implementation code for feature work. The planner may inspect code, refine plans and docs, synthesize subagent results, and assign follow-up tasks, but all source changes, tests, migrations, UI, styling, design polish, and runtime fixes must be done by the appropriate subagent. If the planner discovers a needed code change, it must create the smallest corrective task for the right subagent instead of editing directly.

Subagent scope rule: before launching a subagent, estimate whether the task is likely to consume more than 30% of that subagent's context window. If so, split the work into smaller role-specific tasks and launch additional subagents instead of assigning one oversized task. Prefer several narrow subagents with clear handoff outputs over one broad subagent that risks losing context.

1. The user describes the feature they want to build.
2. Feature Planner launches Product Analyst as a subagent to clarify the problem, scope, acceptance criteria, risks, and an initial implementation plan.
3. Product Analyst writes the analyzed feature brief to `docs/product/features/<feature-slug>.md`.
4. Feature Planner reviews and refines the feature brief into the final implementation plan, breaks it into smaller role-specific tasks, then asks the user for approval before implementation starts. If Product Analyst added to or changed the feature brief, those latest changes are authoritative planning input and must be considered by every implementation, testing, review, and runtime-verification subagent before source changes begin.
5. After the plan is approved, Feature Planner explicitly asks the user to confirm which subagents should be used or skipped. The planner should propose a default subagent list and call out any roles that are unnecessary for the narrowed scope.
6. After subagent confirmation, Feature Planner invokes the needed implementation, testing, and review subagents in order:
   - N Backend Implementer subagents build NestJS, Drizzle, Zod, repositories, services, and backend tests.
   - N Frontend Implementer subagents build Next.js, Expo, TanStack Query integration, and UI states.
   - Visual Designer subagent audits implemented UI and produces screen-level visual direction or a prioritized design plan.
   - Design System Agent defines reusable tokens, primitives, accessibility, and cross-platform patterns.
   - UI Polish Implementer subagent applies approved visual-only polish without changing routing, data flow, or domain logic.
   - Test Writer subagent adds focused domain, API, schema, AI, and UI state tests.
   - Implementation Reviewer subagent checks correctness, architecture fit, security, tests, and docs impact.
7. App Runner subagent starts the local stack from database dependencies through API and frontend, verifies the target routes or smoke flow, and returns running URLs, commands, status, screenshots or browser notes when useful, blockers, and the next required owner.
8. If runtime, review, test, or live design verification fails, Feature Planner assigns the smallest corrective task to the right subagent and repeats the verification loop.
9. After a feature is implemented and verified, Feature Planner updates the project knowledge base before final reporting. Use `agents-memory-updater` for durable agent knowledge and update relevant docs/rules when implementation changes product or architecture guidance.
10. Feature Planner integrates subagent outputs, keeps the main dialog coherent, and reports the final result only after App Runner reports `working` for the relevant flow, or after a specific blocker prevents runtime verification.

Role templates live in `.cursor/agents`.

## Model Policy

- Feature Planner must use GPT-5.5 for planning and task decomposition.
- Backend Implementer and Frontend Implementer subagents must use the latest Composer model available in Cursor.
- UI Polish Implementer subagents must use the latest Composer model available in Cursor.
- If model slugs are required by tooling, use `gpt-5.5-medium` for GPT-5.5 and `composer-2.5-fast` for the latest Composer currently available.

## Development Workflow

1. Inspect relevant architecture and product docs before changing code.
2. Use `.cursor/references/best-practices.md` for external reference inspiration.
3. Make the smallest vertical change that satisfies the task.
4. Keep business logic out of UI components and controllers.
5. Add or update focused tests for domain logic, schemas, UI states, and AI output handling.
6. Run the narrowest useful validation command before summarizing.
7. For Railway deployments, if a pushed change includes Drizzle migrations under `packages/db/drizzle`, do not consider deployment complete until the migration has been applied manually through Railway CLI, for example:
   `railway.cmd run --service health-api powershell -NoProfile -Command '$env:DATABASE_URL=$env:MIGRATION_DATABASE_URL; pnpm --dir packages/db db:migrate'`.
   Keep API runtime `DATABASE_URL` pointed at Railway private networking; use the public migration URL only for the explicit migration command.

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

## Learned Workspace Facts

- AI/chat behavior policy is files-first and repo-backed via `packages/ai-behavior/config/ai-behavior.json` and the `@health/ai-behavior` loader; DB-backed policy overlay is explicitly deferred.
- Repo behavior config covers direct paths, proposal revision routing, response modes, context budgets/triggers, prompt templates, attachment routing, proposal explainer detection, and deterministic proposal trigger phrases.
- Future AI/chat behavior changes should prefer repo config plus focused tests over service hardcoding.
- Capability-specific generation should use registry-provided policy metadata for prompts, safety rules, context strategy, allowed tools, and proposal allowlists; preserve the bounded max-3 `AgentToolRegistryService` loop.
- Direct chat paths are deterministic and explicit only: today summary read and marking today's workout done; plan changes remain proposal-only.
- Proposal explainer is read-only, rule-routed, excluded from the LLM router catalog, and must not create proposals or mutations.
- Context budgets deny documents and sensitive health context by default; config cannot enable those contexts because code-level safety floors remain authoritative.
- Preserve chat safety invariants in code when changing orchestration: schemas, fail-closed config loading, safety floors, proposal validation, permissions, consent, no raw documents, no direct LLM mutation, executor guards, crisis boundaries, and provider isolation.
- Runtime verification for repo-backed AI behavior config: AppModule starts, config source is `file`, API health/ready pass, and authenticated chat E2E requires Clerk credentials.
