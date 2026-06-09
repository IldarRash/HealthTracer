# Repository Audit — 2026-06-08

This is a read-only architecture and product audit of the Health Tracer repository. It consolidates backend, frontend, security/privacy, test/tooling, documentation, and repo hygiene findings. It is intentionally backlog-shaped: each finding includes impact and a suggested fix direction, but no code changes are bundled here.

## Executive Summary

The repository has a strong core architecture for an AI wellness coach: chat is not the source of truth, AI changes flow through typed proposals, workout and habit state is revision-safe, and the LLM pipeline has explicit router/domain/decision-maker boundaries with code-level safety floors. The docs around the LLM pipeline and product roadmap are unusually useful and should remain canonical.

The most urgent issue is secret hygiene: a Context7 API key is present in `.cursor/mcp.json`. Treat it as exposed, rotate it, remove it from tracked config, and add a guardrail so this does not recur.

The highest engineering risks after that are production-sensitive defaults and invariants: permissive CORS when `CORS_ORIGINS` is unset, local filesystem storage for health documents and attachments, the attachment consent/config mismatch, and nutrition plans lacking the same database active-plan/revision integrity as workouts and habits.

The largest quality gaps are integration coverage and product-surface parity. The API has many strong unit tests, especially around AI stages and contracts, but controller, repository, provider, orchestration, DB, and end-to-end coverage are thin. Web has strong UI-state tests and IA, but the design system is fragmented by inline styles, i18n coverage is narrow, mobile lags product architecture, and body/nutrition handoff atoms are not implemented.

After a deeper product-completeness pass, the biggest user-visible gap is not only test coverage. Several surfaces look implemented from a route/API perspective but are still shallow in real content: Training "videos" are simulated posters, recipes have no media model, local seed commands are under-documented, recipe recommendations are rule-based, and LLM tools do not yet reach several product data sources.

## Approve And Preserve

### Product And Architecture

- Keep the invariant that structured state is authoritative and chat is only the interaction layer.
- Keep the typed proposal lifecycle: AI output is persisted as proposals, user approval is required, backend validation applies changes, and accepted plan changes create revisions.
- Keep the multi-domain AI pipeline shape documented in `docs/architecture/llm-pipeline.md`: router LLM, deterministic planner, selected domain LLMs, decision-maker, action resolver, validation, persistence.
- Keep code-level safety floors for context budgets, document handling, proposal validation, crisis handling, and provider isolation. Do not rely on config alone for health-data safety.

### Backend

- `packages/types` is doing the right job as a shared Zod contract and invariant layer.
- Workout and habit plan schemas enforce single active plan and same-plan active revision integrity.
- Proposal acceptance uses a transaction and row lock in `apps/api/src/modules/proposals/proposals.repository.ts`, which is the right place to protect state transitions.
- Controller inputs mostly use Zod parsing helpers from `apps/api/src/common/zod.ts`.

### Frontend

- The four-surface IA is clear: Chat, Today, Longevity, Profile, with Training/Nutrition as secondary read-only plan surfaces.
- The `*-ui-state.ts` pattern is a strong frontend testing seam; keep business/state logic out of React components where practical.
- `apps/web/src/lib/api.ts` centralizes response validation and query keys well.
- The light/dark "two-world" visual language exists in tokens and route themes; body/nutrition work should extend it rather than introduce another system.

### Tooling And Docs

- CI already runs the right broad sequence: typecheck, lint, test, build.
- `docs/architecture/llm-pipeline.md`, `docs/product/feature-roadmap.md`, `docs/architecture/product-surface-architecture.md`, `docs/deployment/railway.md`, and `docs/product/features/body-and-nutrition/*` are high-value docs.
- Migration journal integrity tests in `packages/db/src/migrations.spec.ts` are a good guardrail.

## P0 — Fix Immediately

### Exposed Context7 API Key

Evidence:

- `.cursor/mcp.json` stores `CONTEXT7_API_KEY` as a literal secret instead of reading from the environment.
- Root `.mcp.json` already shows the safer pattern for other secrets by using `${DATABASE_URL}` / `${GITHUB_PERSONAL_ACCESS_TOKEN}`.

Impact:

- The key should be considered compromised if the file is tracked or shared.
- This also makes agent and local tooling guidance unsafe by example.

Fix direction:

- Rotate the Context7 key.
- Replace the literal value with `${CONTEXT7_API_KEY}`.
- Decide whether `.cursor/mcp.json` should be tracked. If it stays tracked, only non-secret templates should live there.
- Add secret scanning or a pre-commit/CI guard before allowing more MCP or env config changes.

## P1 — High Priority

### Deployment-Sensitive CORS Default

Evidence:

- `apps/api/src/main.ts` returns a callback that allows every origin when `env.CORS_ORIGINS` is empty.
- CORS is enabled with `credentials: true`.

Impact:

- Safe enough for local development, risky if a deployed environment misses `CORS_ORIGINS`.
- This is especially important because the API handles health and coaching data.

Fix direction:

- Make production fail closed when `CORS_ORIGINS` is unset.
- Keep permissive reflection only for local/dev environments.
- Add a startup diagnostic or test for the production branch.

### Local Filesystem Storage For Health Documents And Attachments

Evidence:

- `apps/api/src/modules/documents/local-document-storage.ts` stores files under a configured local root.
- `apps/api/src/modules/chat-attachments/local-chat-attachment-storage.ts` does the same and maps more MIME extensions than the runtime image-only contract allows.
- Both adapters do best-effort deletes and join storage references directly to root paths.

Impact:

- This is acceptable for dev but not enough for production health-document storage.
- Production needs encrypted storage, scoped access, retention, auditability, and better cleanup guarantees.

Fix direction:

- Introduce explicit dev vs production storage adapter selection.
- Add path canonicalization guards even for local dev.
- Define production storage requirements before enabling document upload in a production environment.

### Attachment Consent Config Does Not Match Runtime

Evidence:

- `packages/ai-behavior/config/attachments.json` and `packages/types/src/attachment-behavior-config.ts` define `safetyFloors.requireMedicalConsent`.
- Source search shows runtime API code does not read that flag.
- `apps/api/src/modules/ai/openai-coach-provider.ts` explicitly documents that image content, including medical-document photos, reaches the LLM without pre-upload consent.

Impact:

- The config can mislead contributors into thinking a medical consent floor is active.
- This is a product/legal/privacy decision, not only an implementation detail.

Fix direction:

- Either wire the floor into upload/send/orchestration paths, or remove/rename the flag and docs so they match the current architecture.
- Add user-facing disclosure and legal/product review for image uploads that can contain medical content.

### Nutrition Plan DB Invariants Lag Workouts And Habits

Evidence:

- `packages/db/src/schema/workouts.ts` and `packages/db/src/schema/habits.ts` use a partial unique index for one active plan per user.
- Workout and habit revisions also have plan/revision unique indexes, and migrations add same-plan active revision foreign keys.
- `packages/db/src/schema/nutrition.ts` has `activeRevisionId` but only an ordinary `userId` index for `nutrition_plans`.
- `apps/api/src/modules/nutrition/nutrition.repository.ts` resolves active nutrition plans by ordering active rows and taking the newest.

Impact:

- Multiple active nutrition plans per user are possible at the database level.
- Active revision references are protected by application reads, not DB integrity.
- This conflicts with the product invariant that workout and nutrition changes create revisions instead of ambiguous active state.

Fix direction:

- Add a partial unique index for active nutrition plans per user.
- Add plan/revision unique indexes and a same-plan active revision FK similar to workout/habit migrations.
- Add migration tests and repository/service tests for duplicate-active and cross-plan active revision failure cases.

### AI Orchestration And Provider Gaps

Evidence:

- `apps/api/src/modules/ai/agent-orchestrator.service.ts` is a large coordinator with many injected services and no dedicated spec file.
- `apps/api/src/modules/ai/openai-coach-provider.ts` handles live HTTP, JSON extraction, multimodal calls, schema validation, and fail-safe fallbacks, but has no provider spec.
- Stage services are well tested, but the glue path is not.

Impact:

- The most important runtime path can regress even if stage-level tests keep passing.
- Provider parsing and failure behavior is a high-risk external dependency.

Fix direction:

- Add focused orchestrator integration tests with mocked router, planner, context, domain executors, decision-maker, and action resolver.
- Add provider tests with mocked `fetch` for valid JSON, malformed JSON, provider error payloads, multimodal payload construction, and fallback behavior.

### Product Completeness: Training Videos Are Simulated, Not Working Media

Evidence:

- `packages/types/src/exercises.ts` and `packages/db/src/schema/exercises.ts` have an exercise `media.refs[]` model that can represent images/videos.
- `packages/db/drizzle/seeds/exercises.sql` mostly seeds exercises without media and later rows explicitly use `{"refs":[],"fallbackLabel":"Demonstration coming soon"}`.
- The seed file contains 60 curated system exercises, but `packages/db/scripts/generate-exercises-seed.mjs` is behind the SQL shape and only covers the older 45-row generator path; the extra rows/media defaults are hand-maintained.
- `apps/web/src/components/ui/media-card.tsx` renders deterministic CSS gradient posters and a play badge, not a real poster/video URL.
- `apps/web/src/components/training/training-workspace.tsx` `ExerciseVideo` renders a fake video surface: a gradient background, static progress bar, `HD · no sound`, and `Technique guidance coming soon`.
- `deriveTodayExercises` in the same file drops catalog `media`, `instructions`, muscles, equipment, and safety notes from the enriched workout payload into a reduced local `ExerciseCardData`.
- `apps/web/src/components/today/today-workspace.tsx` shows session-level workout actions, while the existing API/client path for per-exercise PATCH feedback is not wired to a Today UI.

Impact:

- Users reasonably perceive Training video as broken: the UI advertises watchable content but there is no actual media playback.
- Backend already has enough shape to hold media refs, but the current seed/UI path does not use it end to end.
- Exercise technique content exists in the catalog seed as instructions, but Training's video/detail view does not surface it.
- Workout execution feels shallower than the backend: the API can update individual exercises, but Today mostly exposes start/mark-done at the session level.

Fix direction:

- Rename the current UI state from "video" to "technique preview" until real video exists, or implement real media playback.
- Add seeded media refs for a small curated subset before claiming video support.
- Thread `catalog.media`, `catalog.instructions`, `catalog.safetyNotes`, equipment, and muscles into `ExerciseCardData`.
- Reuse `apps/web/src/components/ui/exercise-catalog-details.tsx` or extract a shared technique panel so Training does not show "coming soon" when catalog instructions are present.
- Add a Today workout drill-down that uses the existing per-exercise update API and `exercise-catalog-ui-state` helpers for complete/skip/adjust feedback.
- Bring `generate-exercises-seed.mjs` back in sync with `exercises.sql` or move all seed rows to a single source of truth.

### Product Completeness: Recipes Are Seed-Limited And Have No Media Model

Evidence:

- `packages/db/drizzle/seeds/recipes.sql` has a very small curated starter catalog. Static count by seeded ids shows five starter recipes.
- `packages/db/src/schema/recipes.ts` and `packages/types/src/index.ts` model ingredients, steps, macros, tags, provider metadata, and confidence, but no image, thumbnail, video, source URL, or media refs.
- `apps/web/src/components/nutrition/nutrition-workspace.tsx` uses `MediaCard` for recipe ideas, so recipes visually look like media cards, but the poster is generated CSS.
- `apps/api/src/modules/recipes/recipes.service.ts` hydrates TheMealDB provider data only inside `generateCurrentRecommendations`; `listRecipes` returns only rows already present in the DB.
- `apps/web/src/components/recipes/recipes-workspace.tsx` contains a fuller catalog/recommendations UI, but `apps/web/app/recipes/page.tsx` redirects to `/nutrition`, so that panel is not reachable as a standalone surface.
- `apps/web/src/components/recipes/recipes-workspace.tsx` empty copy says "check back after the catalog is seeded."
- `apps/api/src/modules/recipes/themealdb-recipe.mapper.ts` assigns one approximate macro estimate to provider recipes and does not map media fields.
- `apps/api/src/modules/recipes/recipes.service.ts` generates recommendations by rule-based macro/restriction scoring, not by an LLM/tool loop.

Impact:

- Recipes can appear "not filled" if seed scripts were not run.
- Even when recipes exist, they feel sample-like because the catalog is tiny and has no images/media.
- Browse and "Meal ideas" can stay empty even with the provider enabled, because provider hydration is lazy and tied to recommendation generation, not catalog reads.
- Accepted recipe proposals can route users back to `/nutrition`, where the richer `RecipeRecommendationsPanel` is not mounted.
- The Nutrition recipe cards imply richer media than the data model can currently provide.
- External provider recipes are useful for breadth but have low-confidence approximate macros, which should be made more visible in UX.

Fix direction:

- Add recipe media fields (`imageUrl`/`thumbnailUrl`/`sourceUrl` or a generic `media.refs[]`) to contracts, DB, mapper, and UI.
- Increase curated seed coverage or make provider import explicit in setup/admin tooling.
- Hydrate or sync provider catalog on browse/startup/scheduled job, not only on `POST /recipes/recommendations/generate`.
- Either restore `/recipes` as a real route or mount `RecipeRecommendationsPanel` in `NutritionWorkspace`.
- Add a catalog health indicator or admin/debug endpoint showing recipe count, source mix, and last provider import.
- Make recommendation generation explain whether it used seeded-only, provider fallback, or active nutrition-plan matching.
- Replace uniform provider macro estimates with computed estimates or clearer "generic estimate" labeling.

### Product Completeness: Local Setup Does Not Seed The Data Users Expect

Evidence:

- Root `package.json` exposes `db:seed:recipes` and `db:seed:exercises`.
- `packages/db/package.json` has `db:seed:recipes`, `db:seed:exercises`, and `db:seed:habit-templates`.
- Root `README.md` local setup instructs `pnpm db:up`, `pnpm db:migrate`, and `pnpm dev`, but does not mention recipe/exercise/habit seed commands.
- `docs/deployment/railway.md` mentions Railway recipe/exercise seeding, and `CLAUDE.md` mentions seed commands, but the main developer entry point does not.

Impact:

- A fresh local database can boot successfully while Training/Recipes look empty or fake.
- This blurs whether the product is broken, unseeded, or intentionally sparse.

Fix direction:

- Add a documented local bootstrap command or script: migrate plus seed recipes, exercises, and habit templates.
- Add a small health/readiness check for catalog counts.
- Make empty states say exactly what is missing: no active plan, no catalog seed, no provider import, or no recommendations for current filters.

## Detailed Completion Backlog For Product Gaps

The findings above should be treated as product-completion work, not cosmetic polish. The app currently has strong backend/contracts in several areas, but the user-facing surfaces overpromise: media cards imply playable content, recipes imply a richer catalog than exists, and AI/tooling config implies capabilities that runtime does not consistently provide.

### A. Training Media And Technique Completion

Current state:

- Exercise contracts and DB can store `media.refs[]` with `kind: "image" | "video"`.
- Seeded exercises mostly have no media URLs and fall back to `Demonstration coming soon`.
- Training renders `MediaCard` and `ExerciseVideo` as if content is playable, but both are CSS/demo chrome.
- Training drops catalog details when deriving `ExerciseCardData`, so instructions and safety notes that exist in seed data do not reach the detail view.

Correct target behavior:

- A card should show a play affordance only when a playable video exists.
- If no video exists, the UI should be honest: show a technique/instructions card, not a fake player.
- Exercise detail should surface the best available catalog data in this order:
  - Real video/image media, when present and allowed.
  - Written instructions, safety notes, muscles, equipment, and difficulty.
  - A clear `Demonstration coming soon` fallback only when no useful catalog content exists.
- Seed data should be generated from one source of truth, not partly generated and partly hand-patched.

Implementation slices:

1. **Truthful UI slice**
   - Rename the current `ExerciseVideo` route/state to `ExerciseTechniquePreview` unless real media is implemented in the same PR.
   - Hide `PlayBadge`, fake progress, `HD · no sound`, pause icon, and hardcoded `1:04` when no video URL exists.
   - Reuse or extend `apps/web/src/components/ui/exercise-catalog-details.tsx` in Training.

2. **Catalog threading slice**
   - Extend `ExerciseCardData` in `apps/web/src/components/training/training-workspace.tsx` to carry `catalog.media`, `catalog.instructions`, `catalog.safetyNotes`, `catalog.equipment`, `catalog.primaryMuscles`, `catalog.secondaryMuscles`, `catalog.difficulty`, and prescription fields.
   - Update `deriveTodayExercises` to preserve structured `WorkoutPlanExercise.catalog` data instead of reducing it to name/sets/reps only.

3. **Seed/media slice**
   - Bring `packages/db/scripts/generate-exercises-seed.mjs` in sync with the 60-row `packages/db/drizzle/seeds/exercises.sql`.
   - Add media refs only for licensed/owned content. If URLs are external, define an allowlist and failure fallback.
   - Add a seed verification test or script that reports total active system exercises and count with usable media refs.

Definition of done:

- No fake video chrome is shown for exercises with empty `media.refs`.
- At least one exercise with a seeded video/image renders real media in Training, or the product explicitly labels all exercise detail as text-based technique guidance.
- Training detail displays instructions/safety/equipment for seeded exercises.
- Tests cover both media-present and media-missing states.
- Roadmap wording no longer claims video/demo support unless real media exists.

Suggested validation:

- `corepack pnpm --dir apps/web typecheck`
- `corepack pnpm --dir apps/web lint`
- `corepack pnpm --dir apps/web exec vitest run src/components/training/training-workspace.spec.ts src/components/ui/exercise-catalog-details.render.spec.ts`
- A browser check after sign-in: `/training` → open an exercise → verify media or honest technique fallback.

### B. Today Workout Execution Completion

Current state:

- Backend already supports per-exercise execution updates.
- Web API client has the per-exercise update path.
- Today UI mainly exposes session-level start / mark done behavior.
- There is no user-facing drill-down for completing, skipping, adjusting, or giving feedback per exercise.

Correct target behavior:

- Today is the execution surface, so it should own per-exercise logging.
- Training remains read-only plan review and technique lookup.
- A started workout should show each exercise with status and editable execution fields where appropriate.
- Completing all required exercises should derive or strongly guide the session-level completion state.

Implementation slices:

1. **Workout drill-down shell**
   - Add a Today workout detail panel or route-level modal under `apps/web/src/components/today`.
   - Show exercises from `TodayWorkoutDetail.session.exercises`, preserving catalog metadata.
   - Keep the existing session-level start flow, then reveal exercise-level actions after start.

2. **Exercise execution controls**
   - Use existing helpers from `apps/web/src/lib/exercise-catalog-ui-state.ts`.
   - Support `complete`, `skip`, and partial adjustment fields already accepted by `updateWorkoutSessionExerciseSchema`.
   - Show RPE, actual reps/sets/duration/weight only where the contract supports them.

3. **Data refresh and consistency**
   - On per-exercise update, invalidate Today, Training active plan/sessions, and progress-related query keys.
   - Avoid plan mutation from Today; execution updates write session state only.

Definition of done:

- User can start today's workout, update individual exercise status, and see the state persist after refresh.
- Training week/session status reflects Today execution updates.
- Marking a whole session done remains available but no longer replaces exercise-level logging.
- Empty/rest/no-plan states remain clear.

Suggested validation:

- Add or update web tests for Today execution state.
- Add API/controller tests for per-exercise PATCH ownership and validation.
- Browser smoke after sign-in: `/today` → start workout → complete one exercise → refresh → state remains → `/training` reflects progress.

### C. Recipes, Recommendations, And Nutrition Catalog Completion

Current state:

- Recipe schema has ingredients, steps, macros, meal types, tags, provider metadata, confidence, and provenance.
- Recipe schema has no media fields.
- Local curated seed contains five starter recipes.
- TheMealDB provider hydration runs only during recommendation generation, not catalog browse.
- The richer `RecipesWorkspace` and `RecipeRecommendationsPanel` exist but `/recipes` redirects to `/nutrition`.
- Nutrition page shows a generic 4-card `Meal ideas` grid, not full recommendation management.
- TheMealDB macros use one hardcoded estimate for all provider recipes.

Correct target behavior:

- Catalog browse should reliably populate from either local seed or an explicit provider sync path.
- Users should have a reachable place to view, accept, dismiss, complete, and log recommendations.
- Nutrition should distinguish:
  - Generic recipe catalog browsing.
  - Plan-aware recommendations.
  - Accepted/saved/completed recommendations.
  - Nutrition incidents logged from recipes.
- Recipe cards should not imply media unless media exists.

Implementation slices:

1. **Catalog hydration slice**
   - Decide one of:
     - Hydrate provider recipes on `GET /recipes` when catalog is empty/stale.
     - Run provider sync on API startup or scheduled/admin command.
     - Keep provider sync manual but expose catalog health and make empty states explicit.
   - Log provider failures instead of silently swallowing them in `ensureProviderCatalogLoaded`.
   - Document `RECIPE_CATALOG_PROVIDER` and seed/sync behavior.

2. **Recommendations surface slice**
   - Either restore `/recipes` as a real page rendering `RecipesWorkspace`, or mount `RecipeRecommendationsPanel` inside `NutritionWorkspace`.
   - Ensure accepted `recommend_recipes` proposals route to a surface where the user can see and manage the accepted recommendations.
   - Show `limitedReason` copy for `no_active_nutrition_plan` and `no_compatible_recipes`.

3. **Plan-aware Meal Ideas slice**
   - Pass active nutrition plan restrictions/allergies into recipe queries.
   - If macro target filters are used, keep them soft enough that a small catalog does not always return zero.
   - Label whether cards are generic catalog ideas or plan-fit recommendations.

4. **Recipe media slice**
   - Add `media` or `imageUrl`/`thumbnailUrl`/`sourceUrl` to `packages/types/src/index.ts`, `packages/db/src/schema/recipes.ts`, migrations, mappers, and API client.
   - Map provider images/source URLs where available.
   - Update `MediaCard` so recipe cards use real images when present and no play badge when only a static image exists.

5. **Macro confidence slice**
   - Replace uniform TheMealDB macro constants with computed estimates, nutrition-provider data, or very explicit low-confidence labeling.
   - Avoid making all provider cards look identical in calories/protein unless the data is genuinely identical.

Definition of done:

- Fresh local setup has a documented way to populate recipes.
- `/nutrition` or `/recipes` exposes recommendation management, not just a generic 4-card grid.
- `GET /recipes` behavior is predictable and documented.
- Recipe cards do not show fake media affordances.
- Provider recipes visibly show low confidence and source/provenance.
- Tests cover empty catalog, seeded catalog, provider hydration failure, recommendation limited reasons, and accepted proposal navigation.

Suggested validation:

- `corepack pnpm --dir apps/api exec vitest run src/modules/recipes`
- `corepack pnpm --dir apps/web exec vitest run src/components/nutrition/nutrition-workspace.spec.ts src/components/recipes`
- Browser smoke after sign-in: `/nutrition` shows catalog/recommendations; accepted recipe proposal is visible and actionable.

### D. Local Data Bootstrap Completion

Current state:

- `db:migrate` applies schema, but does not seed exercises, recipes, or habit templates.
- Root README does not mention seed commands in local setup.
- A developer can boot a valid empty app that looks broken.

Correct target behavior:

- Local setup should produce a minimally useful product: exercise catalog, recipe catalog, and habit templates present.
- Empty states should separate "no user plan" from "catalog not seeded".

Implementation slices:

1. Add a root command such as `pnpm db:seed` or `pnpm db:bootstrap`.
2. Wire it to:
   - `pnpm db:seed:exercises`
   - `pnpm db:seed:recipes`
   - `pnpm --dir packages/db db:seed:habit-templates`
3. Update `README.md`, `docs/deployment/railway.md`, and relevant agent docs.
4. Add a catalog readiness check for counts:
   - active system exercises
   - active recipes
   - active habit templates

Definition of done:

- New developer follows README and sees non-empty Training/Recipes supporting data after sign-in.
- Runtime health/readiness or a dev-only diagnostic can explain missing catalogs.
- CI or a focused DB test catches accidentally empty seed files.

### E. LLM Tooling And Proposal Reliability Completion

Current state:

- The fan-out architecture is strong and safety-first.
- Tool registry only exposes three broad read-only tools.
- `getDocumentContext` is advertised but mostly empty under current budget floors.
- Recipes, exercise catalog lookup, active plan detail, and adherence are not first-class tools.
- Domain YAML prompts/signals and `medical.yml` create drift because they are not fully wired into runtime behavior.
- Router confidence plus decision-maker `plain_reply` can produce text without proposal cards when users expect actionable cards.

Correct target behavior:

- Every advertised tool/config path should either work in runtime or be removed/marked historical.
- LLM product quality should be measurable by turn-level telemetry and repeatable evals.
- Actionable plan/recommendation requests should reliably produce proposal cards when validation passes.

Implementation slices:

1. **Tool truth cleanup**
   - Make `getDocumentContext` real under explicit `coach_chat_context` consent, or remove it from live allowlists/prompts.
   - Decide whether `medical.yml` is merged into `health` runtime or deleted/archived.
   - Remove or mark unused YAML `prompts[]`, YAML `signals[]`, and legacy `openai_coach_loop` template.

2. **New read-only tools**
   - Add `searchExerciseCatalog` for workout domain.
   - Add `searchRecipeCatalog` for nutrition domain.
   - Add `getActivePlanDetail` for workout/nutrition domains.
   - Add `getRecentAdherence` for Today/nutrition/habit review.
   - Keep all tools ownership-scoped and read-only.

3. **Proposal reliability**
   - Add deterministic boosts or overrides for explicit create/adapt plan language, including Russian phrases.
   - Reorder or guard action selection so `plain_reply` does not win when the user asked for a plan change and domain candidates exist.
   - Track proposal validation failures by class so prompt/config issues are visible.

4. **Telemetry and evals**
   - Persist or export per-stage latency, model, selected domains, router confidence, requested tools, allowed/denied tools, degraded domains, final action, proposal count, and validation errors.
   - Add a small eval set covering:
     - create/adapt workout plan
     - create/adapt nutrition plan
     - recipe request
     - food photo
     - body/photo request
     - Russian plan requests
     - proposal explainer
     - crisis boundary

Definition of done:

- No stale config advertises behavior that runtime cannot perform.
- Tool usage and degradation are visible in logs/metadata/dashboard.
- Golden evals can detect "text but no card" regressions.
- Document-context behavior is explicit: either consent-scoped and working, or intentionally unavailable in chat.

## P2 — Medium Priority

### Controller, Repository, And E2E Test Gaps

Evidence:

- Only two controller specs were found under `apps/api/src`: `health.controller.spec.ts` and `wellbeing-check-ins.controller.spec.ts`.
- Nine repository specs were found, while many repositories remain untested.
- No `*e2e*` files were found in the repo.
- CI has no Postgres service or migration-apply step.

Impact:

- Zod body validation is strong, but HTTP boundary behavior, auth wiring, ownership scoping, and database interactions need broader tests.
- Current CI can miss route-level regressions and DB migration/runtime issues.

Fix direction:

- Start with the highest-risk routes: chat send, proposal accept/reject, document upload/parse/revoke/delete, attachment upload/content, billing webhook.
- Add repository integration tests for ownership-scoped repositories and revision writes.
- Add one Postgres-backed CI job before trying broad E2E coverage.

### Dependency Reproducibility

Evidence:

- Root `package.json`, `apps/api/package.json`, `apps/web/package.json`, and `apps/mobile/package.json` use many `"latest"` dependencies.
- `apps/mobile/package.json` declares `@health/types` twice with different workspace ranges.
- `turbo.json` makes lint/test/typecheck depend on upstream build.

Impact:

- Install results can drift over time despite a lockfile.
- Duplicate manifest entries and excessive build dependencies add noise and slow validation.

Fix direction:

- Pin major framework/runtime dependencies deliberately.
- Remove duplicate mobile dependency keys.
- Add root `engines` and a `verify` script.
- Revisit Turbo task dependencies so fast checks do not rebuild unnecessarily.

### Frontend Design-System Drift

Evidence:

- Large inline style counts appear in `today-workspace.tsx`, `nutrition-workspace.tsx`, `training-workspace.tsx`, and `profile-workspace.tsx`.
- `docs/product/features/body-and-nutrition/design-system-and-backend-foundations.md` confirms missing atoms: `Stat`, `MacroMini`, `BodyFigure`, `MuscleMap`, `PhotoGuide`, `PhotoStripMsg`, `PhotoThumb`, `BodyAnalysisCard`, and `GroceryCheck`.
- `packages/ui` currently holds tokens, while many reusable primitives live only in `apps/web/src/components/ui`.

Impact:

- Body/nutrition work will likely copy/paste another layer of inline styles unless shared atoms are extracted first.
- Mobile cannot share web-only atoms.

Fix direction:

- Extract the body/nutrition handoff atoms before implementing the screens.
- Decide which primitives remain web-local and which move into `packages/ui`.
- Add at least lightweight render/a11y tests for new shared atoms.

### i18n And Mobile Product Parity

Evidence:

- Web has `next-intl` scaffolding, but many major surfaces still use hardcoded English.
- Body/nutrition handoff docs and screenshots are Russian-first.
- Mobile routes and palette do not match the documented web IA and visual identity.

Impact:

- Russian handoff screens will feel bolted on if implemented without broader translation coverage.
- Mobile can drift into a separate product.

Fix direction:

- Define web-only vs mobile-parity scope for body/nutrition.
- Expand translation coverage by route/surface, not one component at a time.
- Add a mobile parity doc or explicitly mark mobile as deferred.

### Documentation Drift

Evidence:

- `README.md` says only phases 1-4 are implemented and links to missing `docs/product/phase-audit.md`.
- `docs/product/feature-roadmap.md` links to missing `features/editable-proposals-performed-log.md`.
- `docs/README.md` is a design handoff document, not a docs index.
- `docs/architecture/database.md` and `docs/architecture/domain-model.md` retain MVP framing and omit several implemented domains.

Impact:

- New contributors and agents can start from stale entry points.
- Stale docs are dangerous in this repo because agent workflow relies heavily on project docs.

Fix direction:

- Add a real docs index.
- Update root README scope and remove broken links.
- Create or retarget `docs/architecture/ai-behavior-config.md` references.
- Refresh database/domain docs from `packages/db/src/schema/*` and `apps/api/src/app.module.ts`.

### LLM Pipeline Product Gaps Beyond Safety

Evidence:

- `apps/api/src/modules/ai/agent-tool-registry.service.ts` exposes only three read-only tools: `getUserContextSlice`, `getDocumentContext`, and `getWeeklyProgressContext`.
- `getDocumentContext` is advertised in capability/tool config but usually returns empty under current context-budget floors, so Profile Documents do not meaningfully reach chat context through that tool today.
- `apps/api/src/modules/recipes/recipes.service.ts` recommendation generation is rule-based and not available as a domain-loop tool.
- `apps/api/src/modules/coaching-context/user-context-slice.builder.ts` comments that persisted `user_memory` rows and context snapshots are not wired yet; profile-derived memories and placeholder weekly snapshots are used instead.
- `apps/api/src/modules/ai/domain-llm-executor.service.ts` safely degrades on invalid tool requests, provider errors, and timeouts, but there is no eval harness or product telemetry in this audit showing how often turns degrade.
- `packages/ai-behavior/config/domains/*.yml` lists domain prompts, tools, and signals, but live OpenAI prompt rendering still comes through compiled prompt templates in `packages/ai-behavior/config/ai-behavior.json`.
- `packages/ai-behavior/config/domains/medical.yml` is effectively stale unless explicitly folded into `health` routing/planning; YAML `signals[]` and `prompts[]` are not deterministic runtime inputs in the current path.
- The domain loop uses JSON `kind: "tool_request"` outputs rather than native OpenAI tool/function calling; that can be intentional, but should be documented as the runtime contract.
- Router confidence and decision-maker `plain_reply` selection can produce helpful prose without proposal cards for plan-like turns, especially short, typoed, or non-English requests.

Impact:

- The LLM pipeline is safe and structured, but product intelligence is bounded by broad context packets and a tiny tool surface.
- Recipe recommendations, exercise catalog lookup, body-analysis persistence, and active-plan media enrichment are outside the domain tool loop.
- Without evals/telemetry, safe degradation can mask poor user experience.
- Config drift makes it easy to think documents, medical routing, YAML prompts, or attachment consent behave differently than runtime.

Fix direction:

- Add narrow read-only tools for high-value product questions: recipe catalog search, exercise catalog lookup, active plan detail, recent adherence, and proposal/revision history.
- Make `getDocumentContext` real under a consent-scoped budget or remove it from catalog/prompts until it has runtime effect.
- Add per-turn observability for router confidence, selected domains, tool calls requested/allowed/denied, degraded domains, final fallback, and proposal validation failure classes.
- Add a small eval suite of realistic coaching turns, especially Russian-language turns, photo/food turns, recipe requests, workout adaptation, and "what should I do today" flows.
- Clarify which prompt/config source is canonical for live domain behavior and remove or document config that is not injected into runtime prompts.
- Revisit proposal-card routing: explicit plan/recommendation turns should not silently end as `plain_reply` when domain candidates exist.

## P3 — Lower Priority But Useful

- Add coverage tooling and thresholds once high-risk integration tests exist.
- Add Dependabot/Renovate after dependency pinning strategy is chosen.
- Add `.editorconfig` or formatter policy if team wants consistent formatting enforcement.
- Decide whether `.cursor` or `.claude` is the canonical operating layer; keep only one source of truth or document synchronization.
- Consolidate design handoff directories with an index describing which artifacts are intent, prototype, or production-source truth.

## Runtime Verification Status

- App Runner reused a running local stack: API on `3000`, web on `3001`, and Postgres on `5432`.
- `GET http://localhost:3000/health` returned `200` with API status OK.
- `GET http://localhost:3000/recipes` returned `401` without a bearer token, which matches the guarded API boundary.
- `http://localhost:3001/training`, `/nutrition`, and `/recipes` all redirected to Clerk sign-in, so authenticated surface verification is still blocked until a Clerk session is available.
- Local DB evidence showed 17 active recipes in this environment, while `packages/db/drizzle/seeds/recipes.sql` contains five curated starter rows; this supports the conclusion that recipe population is environment/setup dependent.
- Scoped validation reported by App Runner: `apps/web` and `apps/api` typecheck/lint passed; focused web Training/Nutrition specs passed; API recipes module specs passed. Full root `pnpm typecheck` was blocked by local pnpm 11.2.2 vs repo-required pnpm 10.0.0.
- The product-completeness findings above are now grounded in source, DB/API/static runtime evidence, and scoped tests. Authenticated browser verification remains outstanding.

## Watch And Verify At Runtime

- Production Railway environment: `CORS_ORIGINS`, `CLERK_JWKS_URL`, `OPENAI_API_KEY`, Stripe secrets, database URLs, and storage configuration.
- OpenAI data-handling posture for image attachments that may contain medical information.
- Document consent lifecycle: upload, parse, summarize, signal approval, coach context, revoke, delete.
- Attachment retention and byte deletion.
- IDOR checks across document, attachment, proposal, thread, and plan routes with two users.
- Crisis path with attachments: static review suggests the crisis gate bypasses AI, but this should be verified end to end.
- Stripe webhook replay/idempotency under concurrent delivery.
- Authenticated web verification after sign-in: Training exercise cards/video surface, Today workout execution, Nutrition meal ideas, recipe detail, and recipe recommendations management.

## Suggested Remediation Roadmap

### PR 1 — Secret And Config Hygiene

- Rotate the exposed Context7 key.
- Replace literal MCP secrets with environment references.
- Add a secret scanning guard.
- Decide tracking policy for `.cursor/mcp.json`.

### PR 2 — Production Safety Defaults

- Fail closed for production CORS when origins are unset.
- Add storage adapter selection guardrails.
- Add local path canonicalization.
- Clarify or enforce attachment medical-consent runtime behavior.

### PR 3 — Nutrition Invariant Parity

- Add nutrition active-plan and same-plan active revision constraints.
- Add migration and schema tests.
- Add repository/service tests for duplicate-active and cross-plan active revision cases.

### PR 4 — High-Risk Test Coverage

- Add orchestrator tests.
- Add OpenAI provider tests.
- Add controller tests for proposals, documents, attachments, and chat.
- Start a Postgres-backed CI lane for migration/application behavior.

### PR 5 — Product Completeness: Catalogs And Media

- Replace fake Training video state with honest technique preview or real video playback.
- Surface exercise catalog instructions/safety notes/media in Training.
- Add Today per-exercise execution UI on top of the existing PATCH path.
- Add recipe media fields and richer seed/provider import path.
- Hydrate recipes on browse/startup or restore a reachable recipes/recommendations surface.
- Add local bootstrap seeding docs/scripts and catalog count checks.

### PR 6 — LLM Tooling And Product Evals

- Add narrow read-only tools for exercise search, recipe search, plan detail, and adherence.
- Make document context tooling match consent/runtime behavior, or remove stale advertising.
- Remove or fold stale YAML/runtime config (`medical.yml`, unused YAML prompts/signals, legacy coach-loop template).
- Add turn-level telemetry for tool use, degraded domains, fallbacks, and validation failures.
- Add realistic eval prompts for workout, nutrition, recipe, photo, and Russian-language flows.

### PR 7 — Docs And Contributor Truth

- Update README.
- Add docs index.
- Fix broken roadmap links.
- Refresh database/domain docs.
- Add or retarget AI behavior config docs.

### PR 8 — Frontend Foundations Before Body/Nutrition

- Extract shared handoff atoms.
- Reduce duplicate token definitions and inline style drift.
- Decide web-only vs mobile parity for the body/nutrition track.
- Add focused render/a11y tests for the new atoms.

## Files Directly Verified

- `.cursor/mcp.json`
- `apps/api/src/main.ts`
- `apps/api/src/modules/documents/local-document-storage.ts`
- `apps/api/src/modules/chat-attachments/local-chat-attachment-storage.ts`
- `apps/api/src/modules/ai/agent-orchestrator.service.ts`
- `apps/api/src/modules/ai/openai-coach-provider.ts`
- `apps/api/src/modules/ai/domain-llm-executor.service.ts`
- `apps/api/src/modules/ai/agent-tool-registry.service.ts`
- `apps/api/src/modules/ai/coach-provider.factory.ts`
- `apps/api/src/modules/coaching-context/user-context-slice.builder.ts`
- `apps/api/src/modules/nutrition/nutrition.repository.ts`
- `apps/api/src/modules/recipes/recipes.service.ts`
- `apps/api/src/modules/recipes/recipes.controller.ts`
- `apps/api/src/modules/recipes/themealdb-catalog-provider.ts`
- `apps/api/src/modules/recipes/themealdb-recipe.mapper.ts`
- `apps/api/src/modules/exercises/exercises.controller.ts`
- `apps/api/src/modules/exercises/exercise.mapper.ts`
- `apps/api/src/modules/workouts/workouts.service.ts`
- `packages/db/src/schema/nutrition.ts`
- `packages/db/src/schema/workouts.ts`
- `packages/db/src/schema/habits.ts`
- `packages/db/src/schema/exercises.ts`
- `packages/db/src/schema/recipes.ts`
- `packages/db/drizzle/seeds/exercises.sql`
- `packages/db/drizzle/seeds/recipes.sql`
- `packages/db/scripts/seed-exercises.mjs`
- `packages/db/scripts/seed-recipes.mjs`
- `packages/types/src/exercises.ts`
- `packages/types/src/index.ts`
- `packages/ai-behavior/config/ai-behavior.json`
- `packages/ai-behavior/config/domains/workout.yml`
- `packages/ai-behavior/config/domains/nutrition.yml`
- `apps/web/src/components/ui/media-card.tsx`
- `apps/web/src/components/training/training-workspace.tsx`
- `apps/web/src/components/nutrition/nutrition-workspace.tsx`
- `apps/web/src/components/recipes/recipes-workspace.tsx`
- `apps/web/src/lib/api.ts`
- `package.json`
- `packages/db/package.json`
- `apps/api/package.json`
- `apps/web/package.json`
- `apps/mobile/package.json`
- `turbo.json`
- `.github/workflows/ci.yml`
- `README.md`
- `docs/README.md`
- `docs/architecture/database.md`
- `docs/architecture/domain-model.md`
- `docs/product/feature-roadmap.md`
- `docs/product/features/body-and-nutrition/design-system-and-backend-foundations.md`

