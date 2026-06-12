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
6. Feature Planner launches **GitHub Agent (`mode: open`)** to open the GitHub lifecycle: search for an existing issue (dedupe), create the feature issue, and create the `feature/<slug>` branch. The returned issue number and branch are threaded through the rest of the run. GitHub Agent owns branch/commit/push and issue/PR creation and runs automatically.
7. After subagent confirmation, Feature Planner invokes the needed implementation, testing, and review subagents in order:
   - N Backend Implementer subagents build NestJS, Drizzle, Zod, repositories, services, and backend tests.
   - N Frontend Implementer subagents build Next.js, Expo, TanStack Query integration, and UI states.
   - Visual Designer subagent audits implemented UI and produces screen-level visual direction or a prioritized design plan.
   - Design System Agent defines reusable tokens, primitives, accessibility, and cross-platform patterns.
   - UI Polish Implementer subagent applies approved visual-only polish without changing routing, data flow, or domain logic.
   - Test Writer subagent adds focused domain, API, schema, AI, and UI state tests.
   - Implementation Reviewer subagent checks correctness, architecture fit, security, tests, and docs impact.
8. App Runner subagent starts the local stack from database dependencies through API and frontend, verifies the target routes or smoke flow, and returns running URLs, commands, status, screenshots or browser notes when useful, blockers, and the next required owner.
9. If runtime, review, test, or live design verification fails, Feature Planner assigns the smallest corrective task to the right subagent and repeats the verification loop.
10. After a feature is implemented and verified, Feature Planner updates the project knowledge base before final reporting. Use `agents-memory-updater` for durable agent knowledge and update relevant docs/rules when implementation changes product or architecture guidance.
11. Once App Runner reports `working`, Feature Planner launches **GitHub Agent (`mode: ship`)** to close the GitHub lifecycle: stage the relevant files, commit (with `Closes #<issue>`), push the branch, and open a pull request to `main` linked to the issue. This runs automatically without further user confirmation.
12. Feature Planner integrates subagent outputs, keeps the main dialog coherent, and reports the final result only after App Runner reports `working` for the relevant flow and GitHub Agent has opened the PR, or after a specific blocker prevents runtime verification or shipping.

Role templates live in `.claude/agents`.

## Model Policy

- This repo runs under the Claude Code operating layer in `.claude/` (subagents, skills, rules); there is no Cursor model policy.
- Do not hardcode external model slugs in agent guidance. Defer model choice to the harness or the user's configuration.

## Development Workflow

1. Inspect relevant architecture and product docs before changing code.
2. Use `.cursor/references/best-practices.md` for external reference inspiration (reference material still lives under `.cursor/references`).
3. Make the smallest vertical change that satisfies the task.
4. When the change supersedes existing code, **delete the old object/logic in the same change** — pre-launch with no live users or persisted production data, the default is removal, not compatibility shims. See `.claude/rules/refactor-cleanup.md`.
5. Keep business logic out of UI components and controllers.
6. Add or update focused tests for domain logic, schemas, UI states, and AI output handling.
7. Run the narrowest useful validation command before summarizing.
8. For Railway deployments, if a pushed change includes Drizzle migrations under `packages/db/drizzle`, do not consider deployment complete until the migration has been applied manually through Railway CLI, for example:
   `railway.cmd run --service health-api powershell -NoProfile -Command '$env:DATABASE_URL=$env:MIGRATION_DATABASE_URL; pnpm --dir packages/db db:migrate'`.
   Keep API runtime `DATABASE_URL` pointed at Railway private networking; use the public migration URL only for the explicit migration command.

## Safety

- Never commit secrets or health data.
- Do not log sensitive user data.
- Do not run destructive database operations without explicit approval.
- Do not bypass Drizzle migrations for schema changes.
- For unfamiliar framework APIs, consult Context7 or current docs first.

## Claude Operating Layer

- Specialized subagents live in `.claude/agents`.
- Invocable skills live in `.claude/skills`.
- Project rules live in `.claude/rules`.
- Reference inspiration lives in `.cursor/references` (mirrored from the original `.cursor` setup).
- Architecture and feature roadmap live in `docs`.

## Runtime LLM Pipeline

The unified chat/AI pipeline is a **multi-domain fan-out + synthesis** design. It runs:
`ChatService.sendMessage` → attachment turn stages (context-only plumbing) →
code-owned pre-AI gates (crisis, proposal explainer, direct chat paths) →
`AgentOrchestratorService` → `MessagePreprocessorService` (message normalization) →
`RouterLlmService` (first LLM: selects ≤3 relevant domains, read-only/clamped) →
`SystemPlannerService` (deterministic fan-out plan: budget, executor modes, allowlists)
→ `CoachingContextService` (one bounded `AgentContextPacket` per selected domain) →
**parallel domain LLMs** via `DomainLlmExecutorService` (only-selected: workout /
nutrition / health) → `DecisionMakerExecutorService` (final synthesis LLM) →
`ActionResolverService` (typed proposal/action, allowlist-filtered) → per-intent
proposal normalization (`ProposalNormalizationService`) → full validation stack
(schema-class failures get one bounded payload-only self-repair, then full
re-validation) → persistence. LLM budget per turn: 1 router + N≤3 parallel domain LLMs
+ 1 decision-maker (+ ≤2 proposal-repair calls). `docs/architecture/llm-pipeline.md` is
the canonical, file-by-file map and must be read before changing the AI/chat subsystem.

## Useful Docs

- `docs/architecture/llm-pipeline.md`
- `docs/architecture/overview.md`
- `docs/architecture/product-surface-architecture.md`
- `docs/architecture/domain-model.md`
- `docs/architecture/ai-behavior-config.md`
- `docs/architecture/database.md`
- `docs/architecture/auth.md`
- `docs/architecture/mcp.md`
- `docs/product/feature-roadmap.md`

## Learned Workspace Facts

- AI/chat behavior is files-first and repo-backed via `packages/ai-behavior/config/ai-behavior.json`, `packages/ai-behavior/config/attachments.json`, `packages/ai-behavior/config/domains/*.yml`, and the `@health/ai-behavior` loaders; there is no DB overlay.
- `ai-behavior.json` owns chat/LLM behavior and live fan-out `promptTemplates`; `attachments.json` owns attachment consent, categories, retention, and plumbing stage order (no classification/recognition); per-domain `domains/*.yml` own each domain's `intents[]/tools[]/signals[]/prompts[]`, but YAML `prompts[]` are not directly injected into `OpenAiCoachProvider.generateDomainStep` today.
- Domain YAML can only **narrow** the capability-catalog allowlists, never widen them; the loader is fail-closed per file and drops anything outside the catalog.
- Attachments are context-only plumbing stages (validate→link→apply disposition); there is no recognition/classification machinery — the multimodal router and domain LLMs read attachment content directly.
- RouterLlm runs for eligible turns (revision/explainer excluded) before SystemPlanner and returns strictly typed, read-only domain selections (≤3 domains); it never emits replies or proposals.
- SystemPlanner consumes RouterLlm output when confident into a deterministic `DomainFanoutPlan`, otherwise rule-routes from repo config; it caps selected domains at 3 and never widens catalog allowlists.
- Domain LLMs run only-selected and in parallel; each enforces its own read-only tool allowlist and reply safety, and a failed/timed-out domain degrades to a safe empty output. The decision-maker LLM synthesizes their outputs and emits typed proposals only.
- Future AI/chat and domain behavior changes should prefer repo config plus focused tests over service hardcoding; safety floors stay in code.
- Direct chat paths are deterministic and explicit only — three kinds: today summary read, nutrition plan read, and marking today's workout done (the one narrow write); they resolve only when there is no attachment, and plan changes remain proposal-only.
- Proposal explainer is read-only, rule-routed, excluded from router domain selection, and must not create proposals or mutations.
- Context budgets deny documents and sensitive health context by default, re-applied to every per-domain packet; config cannot enable those contexts because code-level safety floors remain authoritative.
- Preserve chat safety invariants in code when changing orchestration: schemas, fail-closed config loading, safety floors, proposal validation, permissions, consent, no raw documents, no direct LLM mutation, executor guards, crisis boundaries, and provider isolation.
- Runtime verification for the unified AI pipeline: AppModule/API startup OK, config sources are `file`, health/ready pass, and authenticated chat E2E requires a Clerk bearer token.
- Image attachments, including photos of medical documents, are currently sent to the LLM as context without an upfront upload consent gate; the consent-gated medical special-save proposal is deferred, and no attachment path may auto-persist a `health_document`.
- Raw proposals are normalized per intent before the validation stack (`ProposalNormalizationService` — legacy workout exercises bridged to catalog form; `log_nutrition_incident` gets trusted server-side stamping of imageRefs/provenance/incidentDateTime from turn state, never LLM authority); schema-class validation failures get one budgeted payload-only LLM self-repair (`ProposalRepairService`, 2/turn, 10s, `OPENAI_REPAIR_MODEL` override) that re-enters the full normalize+validate stack — safety-/ownership-class failures are never repaired. Proposals are processed before the assistant message so `metadata.agent.repair {attempted, succeeded}` rides it; a validation-stack crash degrades only that proposal to `["proposal_validation_unavailable"]`.
- The client proposal contract is tolerant: `aiProposalSchema` checks `proposedChanges` per intent only when `validationStatus === "valid"` (`AiProposal = ValidatedAiProposal | UnvalidatedAiProposal`, `isValidatedProposal` guard), `tolerantArraySchema` keeps a turn/thread/proposals response renderable when one entity is malformed, and the web SSE path never falls back to sync on a `final_unparseable` frame (the backend turn already succeeded — re-send would duplicate a paid LLM turn).
