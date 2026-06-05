# Feature Brief: Remove Stubs & Legacy Compat (Removal Program)

## Context

Pre-launch startup with a **disposable database** and **no backward-compat requirement**
(`.claude/rules/refactor-cleanup.md`). This is a coordinated *removal program*, not a feature
add: delete the keyword-matching stub coach provider, replace it with a real OpenAI provider as
the mandatory production path, implement a real context-compression provider, delete no-backfill
legacy read-compat, and complete the fan-out redesign so the multi-domain path owns every turn
type — then delete `ResponseModeExecutorService`.

**All safety floors stay in code** (proposal-only, reply-safety, capability clamping, crisis /
explainer pre-AI gates, `allowDocuments=false` / sensitive-health context floor, no
`health_documents` auto-persist, workout-calorie provenance). The program touches the most
safety-critical subsystem in the repo, so security-reviewer and app-runner gates are mandatory on
the AI-path clusters.

**Read before implementing:** `docs/reviews/stub-and-legacy-audit.md` and
`docs/architecture/llm-pipeline.md`.

---

## Locked Decisions

1. **DELETE `StubCoachAiProvider` + all `stub-*.ts` entirely.** Replace test usage with a new
   shared `CoachAiProvider` test mock (`@health/ai/testing`). Make the real `OpenAiCoachProvider`
   **mandatory in prod** — no silent fake-coach fallback; missing key fails closed at boot.
2. **IMPLEMENT a real `OpenAiContextCompressionProvider`**; delete the stub compressor and the now
   meaningless primary/fallback double-layer.
3. **DELETE legacy read-compat with no backfill:** `saved_health_document` recognition compat,
   free-text day label, string-exercise union arm, deprecated routing enums.
4. **FULL redesign:** the fan-out path owns proposal-revision / proposal-explainer /
   low-confidence-fallback / deterministic gate-miss turns, then **DELETE
   `ResponseModeExecutorService`.**

Removal-condition waiver: the pipeline doc (lines 778-787) says these compat values are removable
"only behind a stated DB migration that backfills or drops historical rows." Given the
disposable-DB / no-backfill locked decisions, **that condition is waived** — state this in each PR.

---

## Safety-Invariant Checklist (must survive every change)

Each entry names the enforcing code so a reviewer can grep for regressions.

- **S1 — Zod validation of every AI output + API input.** Router/domain/final/loop schemas
  (`apps/api/src/modules/ai/openai-coach-provider.ts:78,119,157,172`) + shape guards
  (`:112,149,165`); compression output `safeParseContextCompressionSummary`
  (`context-compression.service.ts:68`) against `contextCompressionSummarySchema`
  (`packages/types/src/context-budget.ts:161`); attachment `chatAttachmentRecordSchema.parse`
  (`chat-attachment.mapper.ts:17`); proposal payload schemas (`action-resolver.service.ts:11-14`).
- **S2 — Fail-closed config / provider loading.** Domain YAML loader falls back to per-file
  defaults, never partial-merges (`packages/ai-behavior/src/domain-config-loader.ts`).
  `createFallbackRouterDecision` / `createFallbackFinalDecision` / `createFallbackDomainAnswer`
  are the safe degradations (`openai-coach-provider.ts:116,169`;
  `decision-maker-executor.service.ts:206`; `agent-orchestrator.service.ts:506,583`). **C3:** the
  real compressor must degrade to `summary:null`, never throw turn-fatal nor emit unvalidated text.
- **S3 — Proposal-only; no direct LLM mutation.** `ActionResolverService` ignores `directActions`
  and never persists (`action-resolver.service.ts:20,156-167`); decision-maker emits typed
  proposals only (`decision-maker-executor.service.ts:10-12`); router never emits replies/proposals;
  accepted workout/nutrition changes create **new revisions**; `log_workout_activity` creates an
  `ad_hoc` session row, never a revision (doc 556-559).
- **S4 — Crisis + proposal-explainer pre-AI gates stay code-owned and bypass the LLM.** Crisis
  (`evaluateWellbeingCrisisFromText`) and explainer (`proposal-explainer.service.ts` →
  `resolvePreAiTurn`, `chat.service.ts:190`) run **before** `aiService.generateCoachResponse`
  (`chat.service.ts:302`). The *no-proposal* explainer branch returns deterministic copy with zero
  LLM calls (`chat.service.ts:198-224`). **C6 must not move the no-proposal explainer gate into the
  LLM path** — only the *with-proposal* explainer turn reaches the orchestrator.
- **S5 — Context-budget floors: `allowDocuments=false` + sensitive-health denied by default.**
  `ContextBudgetPolicyService` re-applies the floor per selected domain; config cannot relax it
  (doc 366-372, 717-718), re-applied in `buildDomainContextPackets`
  (`agent-orchestrator.service.ts:448-481`). **C3:** the new compressor keeps the document-stripping
  guard (`stub-context-compression.provider.ts:14,46-50`) and never echoes raw document/RAG text
  (regression test `context-compression.service.spec.ts:166-219`).
- **S6 — Provider isolation (DI).** Coach provider constructed once and injected through the turn
  (`agent-orchestrator.service.ts:111`); interface lives in `@health/ai`. Compression provider uses
  the `CONTEXT_COMPRESSION_PROVIDER` DI token. **C1/C3 must keep providers injected**, not singletons.
- **S7 — No `health_documents` auto-persist or parse from attachments** (doc 169-177, 762-764).
  **C4-B3:** the mapper must still not introduce document persistence; `linkedDocumentId` stays a
  passive nullable read-through (`chat-attachment.mapper.ts:29`).
- **S8 — Workout calorie/rate provenance floor.** Only the workout domain LLM may source
  `workoutCalorieEstimate` / `workoutCaloriePerHourRate`; ActionResolver scrubs then re-stamps with
  provenance `workout_llm` (`agent-orchestrator.service.ts:361-362,756-798`;
  `action-resolver.service.ts:235-262`). **C6:** revision proposals must flow through the same
  scrub/stamp (today's single-executor revision uses `resolveProposalOnlyOutput`, which does NOT
  stamp — see C6 risk R1).
- **S9 — Reply safety re-validation after synthesis.** `validateReplySafety` runs on the
  decision-maker's re-synthesized reply (`agent-orchestrator.service.ts:380`) and on the
  single-executor final answer (`response-mode-executor.service.ts:405`). On failure → safe
  fallback + drop all proposals. **C6 must keep this on every surviving path.**

---

## Stub Test-Coupling Map (full file list)

### Production files coupling to the stub class / fixtures (DELETE or re-point)

| File:line | How it couples | Disposition |
|---|---|---|
| `packages/ai/src/stub-provider.ts:189` | The `StubCoachAiProvider` class (~500 lines keyword logic) | DELETE |
| `packages/ai/src/stub-provider.ts:43-87` | **CRITICAL:** `CoachAiRequest` (43), `CoachAiLoopRequest` (74), `CoachAiProvider` (80) interfaces — the real prod contract — live *inside* the file to delete | RELOCATE first to `packages/ai/src/coach-ai-provider.ts` |
| `packages/ai/src/stub-workout-plan.ts` | Fixture for stub-provider + revision + weekly-review | DELETE |
| `packages/ai/src/stub-habit-plan.ts` | Fixture for stub-provider + revision + weekly-review | DELETE |
| `packages/ai/src/stub-wellbeing.ts` | Fixture for stub-provider | DELETE |
| `packages/ai/src/stub-weekly-review.ts` | Fixture for stub-provider | DELETE |
| `packages/ai/src/stub-proposal-revision.ts` | Fixture for stub-provider | DELETE |
| `packages/ai/src/index.ts:16-21` | Barrel re-exports `StubCoachAiProvider` + 3 types from `./stub-provider.js` | CHANGE: drop class export, re-point type exports to `coach-ai-provider.js` |
| `apps/api/src/modules/ai/coach-provider.factory.ts:1` | `import { StubCoachAiProvider, type CoachAiProvider }` | CHANGE import |
| `apps/api/src/modules/ai/coach-provider.factory.ts:20` | `return new StubCoachAiProvider()` — the A2 silent-fake default | CHANGE to throw |

### Production env / mode plumbing for the `"stub"` literal (CHANGE)

| File:line | Coupling |
|---|---|
| `apps/api/src/env.ts:19` | `AI_COACH_PROVIDER: z.enum(["stub","openai"]).default("stub")` — root cause of silent-fake (A2) |
| `apps/api/src/modules/ai/coach-provider.factory.ts:9-10,16` | `resolveAiCoachProviderMode()` + `=== "openai"` gate |
| `apps/api/src/observability/config-diagnostics.ts:7,32,34,58,62` | `aiCoachProvider` field; `openai_api_key` readiness check only fires when `=== "openai"` (`:58`) — never warns on silent fallback (A2) |
| `apps/api/src/observability/startup-diagnostics.ts:14` | Logs `aiCoachProvider` at boot |
| `packages/types/src/agent-context.ts:587-589` | `aiCoachProviderModeSchema = z.enum(["stub","openai"])` + `AiCoachProviderMode` |
| `packages/types/src/agent-context.ts:540` | Turn-metadata `provider: z.enum(["stub","openai"])` — persisted/telemetry provenance (the one cross-cutting coupling outside `modules/ai` + `packages/ai`) |
| `apps/api/src/modules/ai/agent-orchestrator.service.ts:28,111,116-118,645` | Imports factory; constructs `this.provider`; surfaces `getProviderMode()`; stamps `provider` on output metadata |
| `apps/api/src/modules/ai/router-llm.service.ts:21,70` | Second prod caller of `createCoachAiProvider`; constructs `this.provider` in constructor |

### Test files coupling to the stub class DIRECTLY

| File | Coupling | Disposition |
|---|---|---|
| `packages/ai/src/stub-provider.spec.ts` | `new StubCoachAiProvider()` (6,39) | DELETE |
| `packages/ai/src/stub-provider-phase2.spec.ts` | `new StubCoachAiProvider()` (21) | DELETE |
| `packages/ai/src/stub-proposal-revision.spec.ts` | `new StubCoachAiProvider()` (137) + import (6) | DELETE |
| `packages/ai/src/index.spec.ts:15,40,149-534` | ~22 `new StubCoachAiProvider()` shape assertions | REWRITE: strip stub blocks, keep `parseAiStructuredOutput`/safety tests (20-37) |
| `apps/api/src/modules/ai/coach-provider.factory.spec.ts:31-41` | Asserts default returns `"StubCoachAiProvider"` + produces reply | REWRITE: assert factory throws when not `openai`; keep openai-key-missing + openai-success cases (43-58) |
| `apps/api/src/modules/ai/domain-llm-executor.service.spec.ts` | Instantiates stub for domain-step test | RE-POINT to shared mock |
| `apps/api/src/modules/ai/decision-maker-executor.service.spec.ts:28` | `makeProvider` builds stub-style provider | RE-POINT to shared mock |
| `apps/api/src/modules/documents/documents.service.spec.ts` | Instantiates stub | RE-POINT to shared mock |
| `apps/api/src/modules/documents/document-processing.spec.ts` | Instantiates stub | RE-POINT to shared mock |

### Test files coupling INDIRECTLY (by default-stub path or `"stub"` literal)

| File:line | Coupling | Action |
|---|---|---|
| `apps/api/src/modules/ai/agent-orchestrator.service.spec.ts:711-714` | `vi.spyOn(coachProviderFactory,"createCoachAiProvider").mockReturnValue(...)` | survives; keep pattern |
| `apps/api/src/modules/ai/agent-orchestrator.service.spec.ts:282-284,1290,1336,…` | ~14 inline `provider:{...}` / `Object.assign(service,{provider})` fakes | CLEANUP: replace with shared mock |
| `apps/api/src/modules/ai/agent-orchestrator.service.spec.ts:1125,1281,1325` | `resolveAiCoachProviderMode` mock returns `"stub"`/`"openai"`; asserts provenance metadata | RE-POINT `"stub"` → `"openai"` |
| `apps/api/src/observability/config-diagnostics.spec.ts:5,19,27,59-68` | `mockEnv.AI_COACH_PROVIDER="stub"` + assertions | UPDATE literals + throw semantics |
| `apps/api/src/observability/health-readiness.service.spec.ts:5,19,64,80,86` | `"ready with stub"` case (84-102) | REWRITE to `openai` + key |
| `apps/api/src/observability/startup-diagnostics.spec.ts:5,19,27` | `"stub"` boot-log literal | UPDATE literal |
| `apps/api/src/modules/chat/chat.service.spec.ts:147,235,372,415,2147,2267,3008,3134,…` | `provider:"stub"` metadata literals on a *fully-faked* AiService (never boots real provider) | UPDATE literal → `"openai"` |
| `apps/api/src/modules/ai/router-llm.service.spec.ts:71` | `new RouterLlmService(...)` constructor calls `createCoachAiProvider` (router-llm.service.ts:70) — currently relies on silent stub default | **HIGHEST-RISK indirect break:** must ADD `vi.spyOn(createCoachAiProvider)` once default removed |

> There is **no NestJS supertest/e2e harness** in `apps/api` (`Test.createTestingModule` /
> `createNestApplication` absent). All "E2E" chat tests are `chat.service.spec.ts` unit tests that
> inject a fake `AiService` (`wrapAiServiceWithDefaultMetadata`, 165/217) and never boot a real LLM
> key. So no test exercises a real OpenAI key today; chat tests need no key after this change.

---

## Per-Cluster Design

### C1 — Stale comment fixes (audit B2)

- **Files-to-change (comments only, in surviving files):**
  - `apps/api/src/modules/ai/openai-coach-provider.ts:100` — fix stale framing.
  - `apps/api/src/modules/ai/action-resolver.service.ts:20,157` — fix the "Phase 2 dark / not called
    yet" framing; **keep** the correct "direct mutations deferred" invariant wording at `:157`.
  - Spec echoes: `openai-coach-provider.spec.ts:184,287,410`.
- **Skip** comment edits in files C2 deletes (`stub-provider.ts:83,494-497`,
  `stub-provider-phase2.spec.ts:5`).
- **Files-to-delete:** none. **Tests:** none new. **security/app-runner:** no.

### C2 — Delete stub provider + shared `CoachAiProvider` test mock + mandatory prod provider

- **Blocking prerequisite — relocate contracts:** move `CoachAiRequest`, `CoachAiLoopRequest`,
  `CoachAiProvider` (`stub-provider.ts:43-87`) into new `packages/ai/src/coach-ai-provider.ts`.
  Re-point `packages/ai/src/index.ts:16-21` to export the types from there and **drop** the
  `StubCoachAiProvider` value export. Run `packages/ai typecheck` before touching `apps/api`.
- **New shared mock:** `packages/ai/src/testing/coach-ai-provider.mock.ts` exporting
  `createCoachAiProviderMock(overrides)` — a fully-typed `vi.fn()` per method; defaults throw "not
  configured for this test" so each test opts in. Export via a **test-only entrypoint**
  `packages/ai/src/testing/index.ts` + `package.json` subpath `"./testing"` so prod bundles never
  pull in `vi`. Replaces both the ad-hoc inline `provider:{...}` literals and the stub's keyword
  behavior; tests assert on the spy *input* and supply the *output*.
- **Make real provider mandatory:**
  - `apps/api/src/env.ts:19` → `.default("openai")` (or drop `"stub"` from the enum).
  - `packages/types/src/agent-context.ts:587,540` → narrow `aiCoachProviderModeSchema` + turn-metadata
    `provider` to `z.literal("openai")` (no backfill, disposable DB).
  - `apps/api/src/modules/ai/coach-provider.factory.ts:13-21` → remove stub import + fallback;
    `else throw new Error("AI_COACH_PROVIDER must be 'openai'; no stub provider exists.")`.
    `createOpenAiCoachProvider` already throws `OpenAiCoachProviderMissingKeyError`
    (`openai-coach-provider.ts:36`) on missing key → fail-fast at construction.
  - `apps/api/src/observability/config-diagnostics.ts:33-38,58-66` → drop the `=== "openai"` guard;
    `openai_api_key` check becomes **unconditional** (error when `!OPENAI_API_KEY`). Closes A2.
- **Test seam (recommended Option 1 — spy the factory):** every spec constructing real
  `AgentOrchestratorService` / `RouterLlmService` spies
  `createCoachAiProvider → createCoachAiProviderMock(...)`. The one **mandatory new spy** is
  `router-llm.service.spec.ts:71` (currently relies on silent default stub; will throw otherwise).
  Keeps the prod enum at exactly `"openai"` with no test-mode env wiring; matches the existing spy at
  `agent-orchestrator.service.spec.ts:711`. (Option 2 — a `"test"` provider mode — rejected: it
  reintroduces a non-prod enum member.)
- **Files-to-delete:** `stub-provider.ts`, `stub-workout-plan.ts`, `stub-habit-plan.ts`,
  `stub-wellbeing.ts`, `stub-weekly-review.ts`, `stub-proposal-revision.ts`, `stub-provider.spec.ts`,
  `stub-provider-phase2.spec.ts`, `stub-proposal-revision.spec.ts` (all `packages/ai/src/`).
- **Consumers/tests to update:** all rows in the Stub Test-Coupling Map.
- **Safety preserved:** S2 (fail-fast on missing key, A2 closed), S6 (provider stays DI-injected).

### C3 — Real `OpenAiContextCompressionProvider`; delete stub compressor

- **Files-to-add:** `apps/api/src/modules/coaching-context/openai-context-compression.provider.ts` —
  `class OpenAiContextCompressionProvider implements ContextCompressionProvider`
  (interface `context-compression.provider.ts:14-16`). Constructor mirrors
  `OpenAiCoachProviderOptions` (`openai-coach-provider.ts:42-46`); reuse the `requestJsonCompletion`
  pattern (`openai-coach-provider.ts:175-224`), `response_format: json_object`, low temperature.
  Build the prompt **only** from already-bounded packet fields (same fields `appendSliceFindings`
  reads, `stub-context-compression.provider.ts:70-122`) and honor `budget.allowDocuments` exactly as
  `stub-context-compression.provider.ts:46-50` (S5). Parse with `contextCompressionSummarySchema`
  inside the provider; on any parse/fetch failure **throw** so the service degrades to `summary:null`.
- **Files-to-delete:** `stub-context-compression.provider.ts`; `context-compression.factory.ts`
  (always returned the stub).
- **Files-to-change:**
  - `context-compression.service.ts` — delete the `fallbackProvider` field + ctor param (`:39-40,46-52`),
    the `applyFallbackCompression` method (`:83-107`) + its call (`:80`), and imports of
    `createContextCompressionProvider` / `StubContextCompressionProvider` /
    `CONTEXT_COMPRESSION_FALLBACK_PROVIDER` (`:15,18,21`). Collapse `compressForTurn` so a provider
    failure / invalid output returns `{summary:null, notes:[...]}` directly (reuse the note strings at
    `:75,77`). Preserves the fail-closed→null floor (S2) without a second LLM call.
  - `coaching-context.module.ts` — delete the `StubContextCompressionProvider` entry (`:42`), the
    `CONTEXT_COMPRESSION_FALLBACK_PROVIDER` provider (`:47-50`), the
    `useFactory: createContextCompressionProvider` (`:43-46`), related imports (`:16,19-21,23`).
    Replace `CONTEXT_COMPRESSION_PROVIDER` with a factory:
    `env.AI_COACH_PROVIDER === "openai" && env.OPENAI_API_KEY ? new OpenAiContextCompressionProvider({...}) : <no provider>`.
    Make the provider **optional** (`@Optional()` injection already at
    `context-compression.service.ts:43-44`) → service short-circuits to `null` when absent.
  - `context-compression.tokens.ts` — delete `CONTEXT_COMPRESSION_FALLBACK_PROVIDER` (`:2-4`); keep
    `CONTEXT_COMPRESSION_PROVIDER`.
- **Consumers/tests to update:** `context-compression.service.spec.ts` — delete the two-provider tests
  importing `StubContextCompressionProvider` (`:14,91-113`); keep `:55-70` (skip when budget doesn't
  require) and `:115-135` (failure → null), adapt to single-provider shape. **Rewrite the document-leak
  regression test (`:166-219`) against `OpenAiContextCompressionProvider`** — it is a code-level safety
  floor (S5) and must not be dropped. Update the stub reference in
  `agent-orchestrator.service.spec.ts` to the C2 mock convention.
- **Floors preserved:** `buildContextCompressionRequest` already gates
  `includeDocuments: budget.allowDocuments` (`:120`); the post-parse schema drops unexpected
  `documentContent`/`rawDocument` keys.

### C4 — Legacy read-compat removals (no backfill)

**B3 — attachment recognition + `saved_health_document` compat** (`packages/types/src/chat-attachments.ts`):
- Delete `legacyMedicalDocumentPersistenceStatusSchema` (`:142-143`),
  `storedMedicalDocumentRecognitionEnvelopeSchema` (`:197-202`),
  `storedChatAttachmentRecognitionEnvelopeSchema` (`:204-208`),
  `parseStoredChatAttachmentRecognition` (`:528-542`), `sanitizeMedicalRecognitionForClient`
  (`:544-556`), and — after confirming dead via consumer removal — the recognition envelope family:
  `recognitionConfidenceBandSchema`/`recognitionProvenanceSchema` (`:82-95`),
  `foodPhotoRecognitionEnvelopeSchema` (`:122-131`), `medicalDocumentRecognitionEnvelopeSchema`
  (`:145-165`), `workoutAttachmentRecognitionEnvelopeSchema`+`workoutAttachmentSuggestedIntentSchema`
  (`:167-195`), `chatAttachmentRecognitionEnvelopeSchema` (`:210-218`),
  `isAttachmentContextOnlyMedicalRecognition` (`:504-515`),
  `ATTACHMENT_CONTEXT_ONLY_PLACEHOLDER_DOCUMENT_ID` (`:133-134`),
  `medicalDocumentPersistenceStatusSchema` (`:136-140`). Remove the `recognition` field on
  `chatAttachmentRecordSchema` (`:244`) and `chatAttachmentOutcomeSchema.recognition` (`:279`).
- Consumers/tests: `chat-attachment.mapper.ts:5,13-15,32` (remove
  `parseStoredChatAttachmentRecognition` import + `recognition` field; mapper still parses the row and
  does **not** persist documents — S7; `ChatAttachmentRow.recognition` DB column stays readable but
  unused); `chat-attachments.spec.ts`; `ai-behavior-safety-invariants.spec.ts`; `packages/types/src/index.ts`
  (drop exports — grep `RecognitionEnvelope`, `parseStoredChatAttachmentRecognition`,
  `sanitizeMedicalRecognitionForClient`).
- **False positives:** `proposal-validation.service.ts:153,211` ("recognition" in comments / unrelated
  "recognition references have expired" message) — no schema dependency. Check whether
  `foodPhotoAnalysisResultSchema` (imported `:9`) is still used elsewhere before removing its import.

**B5 — free-text day label** (`packages/types/src/workouts.ts`):
- Delete `inferWeekdayFromDayLabel` (`:626-628`); remove the `day` free-text field on
  `workoutPlanDaySchema` (`:153-154`) and the `.refine` allowing `day` as a `weekday` alternative
  (`:158-160`) — make `weekday` **required**. Drop the legacy `day` branches in
  `normalizeWorkoutPlanDay` (`:665`), `collectWorkoutPlanText` (`:686-688`), and
  `getWorkoutPlanDomainErrors` (`:778-806`) including the `unresolvedLegacyLabels` path
  (`:775,783-785,792-794`); simplify the structured-plan weekday check (`:797-799`) to read
  `day.weekday`.

**B6 — string-exercise** (`packages/types/src/workouts.ts`):
- Delete the string arm of `workoutExercisePayloadSchema` (`:86-89`),
  `workoutPlanExerciseEntrySchema` (`:142-146`), `workoutSessionExerciseEntrySchema` (`:345-348`); the
  `typeof entry === "string"` branches in `normalizeWorkoutPlanExerciseEntry` (`:645-649`),
  `collectWorkoutPlanText` (`:691-694`), `getWorkoutPlanDomainErrors` (`:810`),
  `normalizeWorkoutSessionExerciseEntry` (`:1468-1469`).
- **Flag:** `isLegacyWorkoutPlanExerciseObject` (`:636-640`, used at `:810`) handles the legacy *object*
  form — the locked decision targets **string-exercise** specifically, so **keep** the legacy-object
  handling unless explicitly retiring it too. Call this out when implementing.

**B7 — deprecated routing enums + capability-config default** (`agent-context.ts`, `capability-config.ts`):
- From `agentRoutingMethodSchema` (`agent-context.ts:96-105`): delete `"llm_router"` (`:99`),
  `"message_understanding"` (`:101`), `"attachment_family"` (`:104`); keep `"rule_based"` +
  `"unified_turn_decision"`. Delete `messageUnderstandingInvoked` (`:113`) if no live writer remains
  (prod sets only `unifiedTurnDecisionInvoked`, `agent-orchestrator.service.ts:660`).
- `resolveDefaultRoutingMethodForKind` (`capability-config.ts:115-117`) returns deleted enums —
  replace body to return `"unified_turn_decision"` (or `"rule_based"`); update caller `:130`.
- **B7 LANDMINE — flag explicitly:** `ai-behavior-config.ts:224,408`, `attachment-behavior-config.ts:178`,
  `ai-behavior-config.spec.ts:132` set `routingMethod:"attachment_family"`, tied to the
  `attachment_family` *kind* catalog entries (`intent-catalog.ts:277-320`, doc 773-775 keeps them for
  historical schema). The B7 audit scope is the **agent-context enum + capability-config default**;
  the `attachment_family` capability *kind* is a separate concern. **Decide explicitly** whether B7
  also retires the kind. If only the enum is removed, `resolveDefaultRoutingMethodForKind`'s
  `attachment_family` branch must map to a *surviving* routing value.
- Tests: `capability-config.spec.ts:99-108`, `agent-context.spec.ts:79-91` (delete or re-point).
- **Files-to-change consumers (B5/B6 workout day/exercise):** `workout-session-materializer.ts`,
  `workout-plan-resolver.ts`, `workout-catalog-enrichment.ts`, `progress-aggregate.service.ts`,
  `progress-weekly-review.service.ts`, `apps/web/src/lib/training-ui-state.ts`,
  `apps/web/src/lib/api.ts`, `apps/mobile/src/lib/api.ts`. Specs constructing `{day:"Monday",...}` or
  bare-string exercises: `workouts.service.spec.ts`, `workout.mapper.spec.ts`,
  `workout-session-materializer.spec.ts`, `workout-plan-resolver.spec.ts`,
  `workout-catalog-enrichment.spec.ts`, `proposal-apply.service.spec.ts`, `proposals.service.spec.ts`,
  `action-resolver.service.spec.ts`, `today.service.spec.ts`, `workout-validation.spec.ts`,
  `workout-session.spec.ts`, `progress-*` specs. (Filter the 67-file grep superset; `.day` also matches
  dates elsewhere — verify each.) After: grep removed names repo-wide to prove zero references.
- **Floors preserved:** S7 (no `health_document` auto-persist re-opened).

### C5 — Small items (audit A4, A6)

- `apps/api/src/modules/recipes/recipe-catalog.config.ts:9-15` — give `SeededOnlyRecipeCatalogProvider`
  its own `providerName` (stop mislabeling as TheMealDB in telemetry).
- `apps/api/src/modules/nutrition/nutrition.repository.ts:274` — resolve or formally own the
  `TODO(C2)` UTC-vs-user-timezone incident-date bug (thread user timezone into the repo).
- **Tests:** `nutrition` specs + recipes spec. **security/app-runner:** no (app-runner optional only if
  the timezone fix changes incident-day assignment → verify a near-midnight `log_nutrition_incident`).

### C6 — Fan-out owns all turn types; delete `ResponseModeExecutorService`

`ResponseModeExecutorService` is reached only when `isFanOutTurn` is false
(`agent-orchestrator.service.ts:247-251`) — four turn classes. **Absorb-then-delete.**

#### Responsibility-move table

| Turn class | Today (owner) | Moves to (fan-out) |
|---|---|---|
| **A — Proposal-revision** | router skipped (`shouldRunRouter = !input.proposalRevision`, `:130`); planner `resolveProposalRevisionRoute` (`system-planner.service.ts:397-398,440-465`); executor runs loop w/ `coachingContext.proposalRevision`, then `resolveProposalOnlyOutput` (`response-mode-executor.service.ts:416-420`) | **planner:** keep `resolveProposalRevisionRoute`, feed capability into a single-domain fan-out entry (`buildSingleDomainFanout`, `:359-394`); mark revision turns fan-out-eligible. **domain-llm-executor:** one domain loop carrying `proposalRevision` (`agent-orchestrator.service.ts:526-528`); domain shapes `candidateProposals` from original + `modificationFeedback`. **decision-maker:** synthesize single-domain revised proposal. **action-resolver:** `resolveFinalDecisionOutput` replaces `resolveProposalOnlyOutput`. **Supersede linkage** lives in ChatService/persistence (`chat.service.ts:311`) — survives the deletion; confirm. |
| **B — Proposal-explainer (with proposal)** | no-proposal explainer fully handled by pre-AI gate (`chat.service.ts:198-224`) — **STAYS, S4**; with-proposal reaches orchestrator w/ `proposalExplainer`, router skipped, planner `resolveProposalExplainerRoute` (`system-planner.service.ts:407-438`), read-only advice-only loop, plain reply | **router:** still NOT invoked (keep `shouldRunRouter = !input.proposalExplainer`). **planner:** keep `resolveProposalExplainerRoute`; single-domain fan-out entry with **zero proposal intents** (advice-only). **domain-llm-executor:** one read-only loop carrying `proposalExplainer` (`agent-orchestrator.service.ts:529-531`), read-only tool allowlist (S3). **decision-maker:** plain reply; no allowed proposal intents → `resolveFinalDecisionOutput` returns `proposals:[]` (`action-resolver.service.ts:123-129`). Stays read-only. |
| **C — Low-confidence / fallback** | router ran but `source !== "llm"` or `confidence < threshold` (`system-planner.service.ts:498-503`); `isFanOutTurn` false (`:248-249`); planner `resolveSafeFallbackRoute` (`:411,467-486`); single LLM loop on `general` | **router:** already ran; low-confidence → `createFallbackRouterDecision` empty selection. **planner:** keep `resolveSafeFallbackRoute`; `buildFanoutMetadata` emits a single-domain `general` entry (already via `buildSingleDomainFanout`, `:340-342,359-394`). **orchestrator:** **redefine `isFanOutTurn`** so low-confidence turns also fan out the single `general` entry — drop the `source === "llm"`+confidence gate as a fan-out *exclusion*. `createFallbackFinalDecision` covers "nothing useful" (S2). |
| **D — Deterministic gate-miss** (`deterministic_read`/`deterministic_write`) | `isDeterministicResponseModeExecutorMode(executorMode)` → `buildDelegatedResult` canned reply w/ `preAiGateDelegationMissed:true` (`response-mode-executor.service.ts:83,114-156`). Defensive no-op; real owner is the direct-path pre-AI gate (`direct-chat-path.service.ts`, `chat.service.ts:226`) | **pre-AI gate stays the real owner (S4)** — untouched; "mark today's workout done"/"today summary" never reach fan-out. **orchestrator:** move the gate-miss safety net **inline into `orchestrateCoachTurn`**: before fan-out, if `isDeterministicResponseModeExecutorMode(plan.executorMode)`, return the canned reply + `preAiGateDelegationMissed:true` directly (port `buildDelegatedResult` ~40 lines, `response-mode-executor.service.ts:114-156`, into a small private method). |

#### After all four move — DELETE / CHANGE

- **Files-to-delete:** `response-mode-executor.service.ts` (630 lines),
  `response-mode-executor.service.spec.ts`; `packages/types/src/response-mode-executor.ts` + spec
  (if fully dead).
- **Files-to-change:** `agent-orchestrator.service.ts` — remove `ResponseModeExecutorService`
  import + ctor dep (`:33,102`), the single-executor branch (`:264-288`) and the `isFanOutTurn` gate
  (`:247-250`); keep `classifyDirectPathCandidate` only if the inline deterministic net needs it.
  `ai.module.ts` — drop `ResponseModeExecutorService` provider. `ai.service.ts`,
  `domain-llm-executor.service.ts` — remove shared-mode imports. **Provider methods**
  `generateAgentLoopStep` / `generateCoachResponse` (`openai-coach-provider.ts:70-97`) + their
  schemas/coercers become dead — delete from `openai-coach-provider.ts` + the C2 mock **only if**
  grep proves no other path calls them. Retarget/retain `resolveProposalOnlyOutput` per how fan-out
  emits revision proposals. **Update `docs/architecture/llm-pipeline.md`** "Retained Single-Executor
  Path" + Stage 8.
- **Consumers/tests:** port the four turn-class behavioral assertions from
  `agent-orchestrator.service.spec.ts` + `response-mode-executor.service.spec.ts` onto the fan-out path
  **before** deleting; update `chat.service.spec.ts`, `action-resolver.service.spec.ts`,
  `router-llm.service.spec.ts`.
- **C6 cross-cutting risks:** R1 (S8) revision proposals must carry calorie scrub/stamp — route
  workout revisions → workout domain so `resolveFinalDecisionOutput` re-stamps. R2 (S9) confirm
  fan-out reply-safety (`agent-orchestrator.service.ts:380`) covers revision/explainer/fallback.
  R3 metadata parity — `buildFanOutTurnMetadata` (`:625-692`) must emit the `responseModeExecution`
  block (`:679-685`) incl. `delegatedToPreAiGate`/`preAiGateDelegationMissed`.

---

## Dependency Order

**C1 → C2 → C4 → C3 → C5 → C6**

- **C2's new test mock is a hard prerequisite for C3 and C6** (the `CoachAiProvider` interface lives
  *inside* the deleted `stub-provider.ts`; extract first). → C2 before C3/C6.
- **C4 mutates shared `packages/types` contracts** (`workouts.ts`, `chat-attachments.ts`,
  `agent-context.ts`) that C6 imports heavily. Landing contract narrowing **before** the redesign
  means C6 starts from final shapes and avoids a re-typecheck cascade. → C4 before C3/C6 (moved ahead
  of the naive C1-C6 numeric order).
- **C3** is independent of C6 (different module) and only depends on the C2 mock convention.
- **C5** is leaf; sits before C6 to keep the redesign the final isolated large commit.
- **C6** is highest blast-radius → last, so reverting it leaves C1–C5 intact.

One commit per cluster (rollback boundary). C6 may split internally into absorb-then-delete but is one
rollback unit.

---

## Risk Register (top 5 + mitigations)

1. **Deleting `stub-provider.ts` deletes the `CoachAiProvider` interface** (defined there, not in its
   own file). Cascade-breaks `openai-coach-provider.ts`, `coach-provider.factory.ts`,
   `domain-llm-step.ts`, every consumer. → **C2: extract the interface to
   `packages/ai/src/coach-ai-provider.ts` first, repoint imports, then delete; run `packages/ai`
   typecheck before `apps/api`.**
2. **Prod silently boots the fake coach** (`env.ts:19` defaults `"stub"`; `config-diagnostics.ts:58`
   only warns when `openai` is chosen, not on fallback). → **C2: flip default to `openai` / drop the
   enum member, make missing `OPENAI_API_KEY` fail-closed at boot; security-reviewer + app-runner boot
   check before merge.**
3. **C6 drops a turn type on the floor** (executor exclusively owns revision/explainer/low-confidence/
   deterministic). → **absorb-before-delete (two internal commits); add fan-out tests per turn class
   *before* deleting; app-runner verifies all four `working`; C6 last so revert is isolated.**
4. **Removing legacy contract enums/unions (C4) breaks consumers mid-redesign** (`workouts.ts`
   required-`weekday`, routing enum prune ripple into mappers + the AI metadata block C6 touches). →
   **sequence C4 before C3/C6; grep removed names repo-wide; gate on `packages/types` then `apps/api`
   typecheck.**
5. **New OpenAI egress (C3 compressor, C2 mandatory provider) leaks document/sensitive health
   context.** → **real compressor consumes the already-floored `ContextCompressionRequest`
   (`includeDocuments: budget.allowDocuments`, `:120`), re-applies the per-packet floor, never reads
   raw slices; add a test asserting documents/sensitive context excluded even when config requests
   them; security-reviewer gate on C2 and C3.**

---

## Per-Cluster Verification Matrix

| Cluster | Validation commands | security-reviewer | app-runner |
|---|---|---|---|
| **C1** | `pnpm --dir apps/api lint` + `pnpm --dir packages/ai lint` | no | no |
| **C2** | `pnpm --dir packages/ai typecheck\|lint\|test` → `pnpm --dir apps/api typecheck\|test`; single-file `vitest run src/modules/ai/coach-provider.factory.spec.ts` | **yes** — provider selection + fail-closed-on-missing-key; confirm prod cannot boot the fake coach | **yes (light)** — boot w/ `AI_COACH_PROVIDER=openai`; one plain coach reply + one workout-proposal turn reach OpenAI |
| **C3** | `vitest run src/modules/coaching-context/context-compression.service.spec.ts` → `pnpm --dir apps/api typecheck\|lint` | **yes** — new health-context egress; confirm `allowDocuments=false`/sensitive floor re-applied per packet, config cannot relax | **yes** — large multi-domain/monthly review turn (triggers `requiresCompression`) + a small non-compressing turn (regression) |
| **C4** | `pnpm --dir packages/types typecheck\|test` → `pnpm --dir apps/api typecheck\|test`; grep removed names = zero refs | **yes (attachments-scoped)** — confirm `saved_health_document` removal re-opens no `health_document` auto-persist; workout/enum removals not health-sensitive | **yes** — workout-plan proposal accept (revision w/ required `weekday`) + one image-attachment chat turn |
| **C5** | `vitest run src/modules/nutrition` + recipes spec; `typecheck\|lint` | no | optional — near-midnight `log_nutrition_incident` only if timezone fix changes day assignment |
| **C6** | full `pnpm --dir apps/api typecheck\|lint\|test`; targeted `vitest run` agent-orchestrator / action-resolver / router-llm / chat.service specs; then root `pnpm test` | **yes (mandatory)** — redesigns the proposal-emitting path; verify proposal-only, reply-safety, capability clamping, crisis/explainer pre-AI bypass, revision-on-accept | **yes (mandatory, broadest)** — verify all 4 absorbed turn types working: (1) proposal-revision, (2) proposal-explainer (read-only), (3) low-confidence fallback, (4) deterministic gate-miss/direct path; plus a confident multi-domain fan-out regression + a crisis message (must still bypass LLM) |

---

## Remaining legacy to call out (after program)

- `ChatAttachmentRow.recognition` DB column stays readable but unused after C4-B3 (disposable DB;
  drop in a later schema pass).
- `isLegacyWorkoutPlanExerciseObject` (`workouts.ts:636-640`) is **kept** unless the legacy-object
  exercise form is also retired (out of the string-exercise locked scope).
- `attachment_family` capability *kind* (`intent-catalog.ts:277-320`) is **kept** unless B7 explicitly
  retires the kind (vs. only the agent-context routing enum).
