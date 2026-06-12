# Chat Message Flow — One Message, Every Branch

This is the **message-journey / decision-tree** companion to
[`llm-pipeline.md`](./llm-pipeline.md). Where `llm-pipeline.md` is the file-by-file
architecture map, this doc traces what happens to **one user chat message** in
chronological order, naming **every branch point and the condition that selects it**.

It is generated from the code and is meant to mirror it exactly. Every claim carries a
`file.ts` reference (path + function/constant name). When the code and this doc disagree,
the code wins — fix this doc.

> Read `llm-pipeline.md` for the per-file prose and invariants; this doc does not repeat
> them. The safety floors named here (read-only routing, `allowDocuments=false`, proposal-only
> writes, no fake coach prose) are code-level and described there in full.

---

## 1. Entry — controller + input validation

Both endpoints live in `apps/api/src/modules/chat/chat.controller.ts` (`ChatController`),
guarded by `ClerkAuthGuard`.

| Endpoint | Method | Behavior |
| --- | --- | --- |
| `POST /chat/threads/:threadId/messages` | `sendMessage` | Sync. Returns the validated `ChatTurnResponse`. |
| `POST /chat/threads/:threadId/messages/stream` | `sendMessageStream` | SSE. Emits stage events then one `final` event carrying the same `ChatTurnResponse`. |

- **Body validation:** both call `parseBody(sendChatMessageSchema, body)` (`common/zod.ts`).
  In the streaming variant this runs **before** `writer.open()` — an invalid body must
  surface as a normal HTTP 400, not a half-opened SSE stream (`sendMessageStream` comment).
- **20k char cap:** `sendChatMessageSchema` enforces `MAX_CHAT_USER_MESSAGE_CHARS = 20_000`
  (`packages/types/src/message-limits.ts`). A message over the cap fails Zod and returns
  **HTTP 400** before any persistence or LLM call. (The router separately truncates to
  `ROUTER_TEXT_MAX_CHARS = 4_000` via `truncateForRouter` — domain LLMs still receive the
  full text.)
- **Empty-message + attachment substitution:** in `ChatService.sendMessage`
  (`chat.service.ts`), `messageContent` is `input.content` when its trimmed length > 0,
  else `aiBehaviorConfigService.getChat().emptyAttachmentMessage`
  (`"Shared attachment(s) for coaching review."`, from
  `packages/ai-behavior/config/ai-behavior.json` → `chat.emptyAttachmentMessage`). This
  substituted text is what every downstream stage (crisis, gates, preprocessor, router) sees.
- The user message row is persisted first via `chatRepository.createMessage(threadId, "user", messageContent, …)`,
  storing `attachmentRefIds` in metadata when present.

The streaming `turn_accepted` event is written immediately after `writer.open()`; stage
events are forwarded through the `onProgress` reporter threaded into `sendMessage`.

---

## 2. Attachment turn stages (context-only)

When `input.attachmentRefIds.length > 0`, `ChatService.sendMessage`:

1. **Pre-persist validation:** `chatTurnAttachmentStageService.validateRefsForSend(userId, refIds)`
   (`chat-turn-attachment-stage.service.ts`) — ownership + send-eligibility. On failure it
   throws `BadRequestException` (HTTP 400) **before** the user message is created.
2. **Per-turn stages:** after the message row exists, `runTurnStages(...)` runs the
   configured stage order minus `validate_refs` (already done): `link_to_message` →
   `apply_upload_disposition` (`DEFAULT_ATTACHMENT_TURN_STAGE_ORDER`, order from
   `packages/ai-behavior/config/attachments.json`).
   - `runLinkToMessage` links the attachment rows to the message.
   - `runApplyUploadDisposition` only applies the configured retention policy per category.
     **No consent gate, no classification, no medical purge** (method doc).
3. **Outputs:** `attachmentMetadata` (`buildBoundedMetadata`) — `refId`, `category`,
   `mimeType`, `consentState` (`granted` if a consent row exists, else `none`), `storageRef`,
   `filename`. These are forwarded to the AI stage as `attachmentTurn`.

Document files are **not** text-extracted here. Extraction is lazy and happens **inside the
AI stage**, once per turn, just before the domain fan-out (see §4). This boundary is the
context-only invariant: **no attachment path creates or parses a `lab_reports` /
`biomarker_readings` row.**

---

## 3. Pre-AI gates — exact execution order

All gates live in `ChatService.sendMessage` and run in this order. **Each gate: condition →
outcome → if not matched, fall through to the next stage** (the no-dead-end rule, see
`.claude/rules/no-stubs.md`). A matched gate returns early with `proposals: []` and **zero
LLM calls**; the SSE stream emits only `turn_accepted → final` (no stage events).

### 3a. Crisis gate (first)

- **Trigger:** `evaluateWellbeingCrisisFromText(messageContent)` (from `@health/types`)
  returns `shouldShowCrisisSupport && copy`.
- **Outcome:** persists an assistant message with
  `formatWellbeingCrisisSupportReply(copy)` and metadata
  `{ crisisBoundary: true, crisisSupport: … }`. Deterministic product copy, not LLM output.
- **Fall through:** if not a crisis, continue to 3b.

### 3b. Proposal explainer

`proposalExplainerService.resolvePreAiTurn(...)` (`proposal-explainer.service.ts`). Detection
is `ProposalExplainerMatcherService.detect` against the `proposalExplainer.detectionPatterns`
in `ai-behavior.json` (RU/EN). It is **blocked when attachments are present or it is a
proposal-revision turn** (`blockWhenAttachments` / `blockWhenProposalRevision` = `true`).

| Result kind | Condition | Outcome |
| --- | --- | --- |
| `no_proposal` | Explainer detected but no latest proposal in the thread | Returns early with config reply `proposalExplainer.noProposalReply`; metadata `{ proposalExplainer: { status: "no_proposal" } }`. **Zero LLM calls.** |
| `with_proposal` | Explainer detected and a latest proposal exists | Does **not** return early — builds a `ProposalExplainerTurnContext` and runs a **special LLM turn** (router skipped, read-only single-domain fan-out, see §4). `proposalsToPersist` is forced to `[]` (`isProposalExplainerTurn`). |
| `not_explainer` | No match | Fall through. |

Trigger examples (from config): EN `"explain this proposal"`, `"why did you suggest"`;
RU `"объясни это предложение"`, `"почему ты предложил"`. Negative guards exclude
`"why should I"` / `"почему мне стоит"` style questions.

### 3c. Direct chat paths

`directChatPathService.tryExecute({ userMessage, proposalRevision, hasAttachments })`
(`direct-chat-path.service.ts`). The candidate is classified by
`SystemPlannerService.classifyDirectPathCandidate`, which returns **`null` when a
proposal-revision is present or when attachments are present** (config
`directPaths.blockWhenAttachments` / `blockWhenProposalRevision` = `true`) — so a message
**with an attachment never takes a direct path; it falls through to the full LLM fan-out.**
Detection order (config `directPaths.detectionOrder`): `mark_today_workout_done` →
`today_summary_read` → `nutrition_plan_read`.

| Kind | Trigger examples (EN / RU) | Outcome | Notes |
| --- | --- | --- | --- |
| `mark_today_workout_done` | "Mark today's workout done" / "отметь тренировку выполненной" | The narrow **write** path: marks the single pending Today workout item `completed`. | `clarification_required` (no read-only reply, but no write) if zero or >1 pending workouts. |
| `today_summary_read` | "What's today?" / "что у меня сегодня" | Read-only Today summary from `todayService.getOrGenerateDay`. | Requires a "today"/"сегодня" mention (`requireTodayMention`). |
| `nutrition_plan_read` | "Show my nutrition plan" / "мой план питания" | Read-only active nutrition plan from `nutritionService.getCurrentActivePlan`. | `refreshHintsOnExecuted: []` (no UI refresh hints). |

All reply text comes from `directPaths.replyTemplates` in config (`*-formatters.ts`); each
kind has negative patterns excluding advice/mutation phrasing (`should`, `recommend`,
`adapt`, `change`…). On match, returns early with metadata `{ directPath: { candidate, outcome } }`,
**zero LLM calls**. Otherwise fall through to 3d.

### 3d. Free-tier quota gate (last)

`entitlementsService.assertAiMessageAllowed(user.id, todayIsoDate)` (`entitlements.service.ts`).
**Placed after every other gate on purpose** (`ChatService` comment): crisis, explainer-no-proposal,
and direct-path turns are non-LLM and must **not** consume the daily AI-message quota.

- **Condition:** throws `AiMessageQuotaExceededError`.
- **Outcome:** returns early with the typed quota reply
  `"You've reached today's free AI message limit — upgrade to Pro for unlimited coaching."`
  and metadata `{ quota: { limitReached: true, tier: "free" } }`. **Zero LLM calls.**
- Any other error rethrows. If allowed, the turn proceeds into the AI pipeline. Usage is
  recorded **after** a successful LLM response via `recordAiMessageUsage` (increment failure
  is swallowed, never breaks the reply).

---

## 4. AI pipeline (`apps/api/src/modules/ai`)

Reached only after all gates fall through, **or** for the explainer-`with_proposal` and
proposal-revision turns. `ChatService` emits the `preprocessing` stage, then calls
`aiService.generateCoachResponse(...)` → `AgentOrchestratorService.orchestrateCoachTurn`.
The attachment metadata (if any) is forwarded as `attachmentTurn`.

### 4a. MessagePreprocessor

`MessagePreprocessorService.preprocess` (`message-preprocessor.service.ts`). Validates input
with `messagePreprocessorInputSchema` (fail → `createFallbackPreprocessorResult`), then
`preprocessMessage` (`@health/types`) produces:

- **language detection** + resolved `responseLanguage` (`responseLanguageHint ?? detected`,
  where the hint is the persisted user locale — locale wins);
- **signals** + normalized text;
- **`hasAttachments`** signal (`Boolean(attachmentTurn?.attachments.length)`);
- a **direct-path candidate hint** (`directChatPathMatcherService.detect`) — informational
  only; the deterministic SystemPlanner decides routing.

### 4b. Which turns SKIP the router

In `orchestrateCoachTurn`: `shouldRunRouter = !proposalRevision && !proposalExplainer`. So
**proposal-revision** and **proposal-explainer-with-proposal** turns skip the RouterLlm
entirely (the explicit non-router exceptions). They still fan out — via a single-domain plan
derived from the revision/explainer capability. For skipped-router turns, the `routing` stage
event is not emitted and router metadata is recorded as `ran: false`.

### 4c. RouterLlm (first LLM)

`RouterLlmService.route` (`router-llm.service.ts`). Read-only domain selection only.

- **4k truncation:** `buildRequest` truncates `originalText`/`normalizedText` with
  `truncateForRouter` (4 000 chars) so a long paste can't bloat or break the router prompt;
  domain LLMs get the full message.
- **≤3 domains + clamping:** provider output passes `validateRouterDecisionOutputShape`
  (forbidden-key guard → fallback on violation), then `routerDecisionOutputSchema.parse`
  then `clampRouterDecisionOutput` (clamps to known domains/capabilities/tools, read-only).
- **Confidence threshold 0.75:** `RULE_ROUTE_CONFIDENCE_THRESHOLD` (consumed in the planner,
  §4d). Below threshold or zero selected domains → low-confidence/general fallback.
- **Failure:** any provider error → `createFallbackRouterDecision()` with `source: "fallback"`
  (the planner treats non-`llm` source as non-confident).
- **`directCommand` = telemetry only:** the router's command hint never bypasses the
  pipeline (`no-stubs.md`); SystemPlanner decides and the turn always fans out.

### 4d. SystemPlanner (deterministic control layer)

`SystemPlannerService.planTurn` (`system-planner.service.ts`) → `DomainFanoutPlan`.

**Route resolution order** (`resolveRoute`):
1. `proposalRevision` present → `resolveProposalRevisionRoute` (capability from
   `proposalRevisionRouting.routes`, else `fallbackCapabilityId`).
2. else router route via `tryResolveRouterRoute` — only when `source === "llm"` **and**
   `confidence >= RULE_ROUTE_CONFIDENCE_THRESHOLD`; primary domain = `selectedDomains[0]`,
   mapped to a `CatalogIntentId` via `pickCapabilityFromRouterDomain`.
3. else proposal-explainer route (if `isProposalExplainerTurn`).
4. else `resolveSafeFallbackRoute` (`responseModes.fallbackCapabilityId = "general"`,
   confidence `SAFE_FALLBACK_CONFIDENCE = 0.35`).

**Fan-out metadata** (`buildFanoutMetadata`):
- Confident router route (`source==="llm"` && `confidence>=0.75` && `selectedDomains.length>0`
  && not revision) → `buildRouterFanout`: maps router domains to per-domain
  `DomainFanoutEntry`, **capped at `MAX_ROUTER_SELECTED_DOMAINS` (= 3)**, each with its own
  clamped tool allowlist, proposal-intent allowlist, context budget, and executor mode.
- otherwise → `buildSingleDomainFanout` (one entry). `lowConfidenceRoute` is set `true` only
  when the router ran (`source==="llm"`) but confidence < 0.75 or no domains — threaded to the
  decision-maker so it asks a clarifying question instead of guessing.

**Executor-mode coercion (safety floor):** `executorMode` comes from
`resolveResponseModeExecutorMode`. If it returns a deterministic mode
(`isDeterministicResponseModeExecutorMode`), the planner **coerces it to the fan-out default**
(`mapExpectedResponseModeToDefaultExecutorMode`) and logs `{ event: "pre_ai_gate.miss", … }`.
**`planTurn` never returns a deterministic executor mode** — every orchestrated turn fans out
(this is the "gate should have handled it" miss telemetry; the removed deterministic gate-miss
stub must not return).

### 4e. Context budgets + safety floors

`coachingContextService.buildAgentContext` builds the primary packet under
`plan.contextBudget`. The default budget (`contextBudgets.profiles.default` in
`ai-behavior.json`) has **`allowDocuments=false` and `allowSensitiveHealthContext=false`** —
code-level floors re-applied per packet; **config cannot relax them** (`security.md`). Per
selected domain, `buildDomainContextPackets` builds one bounded packet from that domain's OWN
capability (`buildDomainContextRequest`, `includeDocuments: false`); on build failure the
primary packet is reused as a safe fallback.

### 4f. Attachment text extraction (12k cap; once per turn)

Just before the domain fan-out, `runFanOutTurn` calls
`attachmentTextExtractionService.extractTurnAttachmentTexts(...)`
(`attachment-text-extraction.service.ts`). Document-MIME attachments (PDF / `text/*` /
markdown) with a non-null `storageRef` are extracted once; the result map is shared across all
domain executors. Per attachment, status degrades to:

| status | when |
| --- | --- |
| `ok` | text extracted (truncated to `MAX_ATTACHMENT_TEXT_CONTENT_CHARS` = 12 000) |
| `empty` | no text layer / whitespace-only |
| `failed` | storage error or ~5s `EXTRACTION_TIMEOUT_MS` timeout |

**Extracted text is never persisted or logged** (only `refId` + status). Images are not
extracted here; image bytes are loaded into a vision data URI per domain (§4g).

### 4g. Domain LLMs in parallel

`runDomainsConcurrently` → `DomainLlmExecutorService.runDomainLoop`
(`domain-llm-executor.service.ts`), one per selected domain, run with `Promise.all`.

- **30s timeout:** `DOMAIN_LLM_TIMEOUT_MS = 30_000` via `Promise.race` with an
  `AbortController`; on timeout the domain degrades to `createFallbackDomainAnswer(domain)`
  and the in-flight fetch is aborted.
- **Bounded loop:** `DOMAIN_MAX_LOOP_ITERATIONS = 3`.
- **Per-domain tool allowlist:** every `tool_request` is checked against
  `domainEntry.allowedTools`; a tool outside the allowlist → immediate fallback (never falls
  through to `AgentToolRegistryService`). Tools are read-only context tools only.
- **Reply safety per domain:** `validateReplySafety(domainAnswer.summary)` → fallback on
  failure.
- **Silent degradation:** any throw, bad shape, domain-mismatch, loop exhaustion, or timeout
  produces a **safe empty** fallback answer (empty `candidateProposals`); the executor never
  rejects and never blocks sibling domains.
- **Multimodal:** only `nutrition`/`health` domains load image bytes (`needsImages`); images
  over `IMAGE_DATA_URI_MAX_BYTES` (4 MiB) are skipped → text metadata only. `textContent`
  from §4f is attached for document files on **all** domains (workout included).
- **Workout calorie estimate:** only the workout domain answer may carry
  `workoutCalorieEstimate` / `workoutCaloriePerHourRate` (enforced by the domain answer
  schema's superRefine).

### 4h. DecisionMaker (final LLM)

`DecisionMakerExecutorService.execute` (`decision-maker-executor.service.ts`) synthesizes the
domain answers + bounded action-variant catalog + candidate summaries into one
`FinalDecisionOutput` (reply + `selectedAction` + `selectedProposalIds`).

- **Synthesis only:** emits typed proposal **selections by ID**, never payloads, never DB writes.
- **Forbidden-shape throws → fallback:** `validateFinalDecisionOutputShape` (forbidden-key
  guard) then `finalDecisionOutputSchema.safeParse`; either failure degrades that attempt.
- **Retry once:** `execute` retries a degraded attempt once. If the retry also degrades, it
  returns `turnError: { reason: "decision_failed" }` (logs `decision_maker.failed_after_retry`).
- **Low-confidence:** `lowConfidenceRoute` from the plan is threaded so the template asks a
  clarifying question rather than guessing the domain.

### 4i. ActionResolver

`ActionResolverService.resolveFinalDecisionOutput` (`action-resolver.service.ts`).

- `plain_reply` / no action → no proposals.
- Resolves `selectedProposalIds` → canonical payloads from the merged candidate map; unknown
  or duplicate ids are dropped with a diagnostic (`idResolutionDropCount`), never thrown.
- **Allowlist filtering:** resolved proposals are filtered to the **union** of selected
  domains' `allowedProposalIntents` (`buildUnionAllowedIntents` →
  `filterProposalsToAllowedIntents`) — defense-in-depth even though the decision-maker chose
  from a bounded list.
- **Workout calorie re-stamping:** `scrubAndStampWorkoutCalorieEstimate` always **scrubs**
  calorie fields off workout/log proposals, then re-stamps from the trusted workout-domain
  values (`workoutCalorieEstimate` → `estimatedSessionCalorieBurn` with provenance
  `workout_llm`; `workoutCaloriePerHourRate` → `caloriePerHourRate`). The decision-maker can
  never be the source of these numbers.

### 4j. Reply safety validation (bilingual)

Back in `runFanOutTurn`: if the decision did not already fail, `validateReplySafety(resolved.reply)`
(`@health/ai`, bilingual diagnosis/treatment guard) runs.
- `replyBlocked = !decisionFailed && replySafetyErrors.length > 0`.
- On block: reply replaced with `" "`, **proposals dropped** (`finalOutput = { reply: " ", proposals: [] }`),
  `turnError: { reason: "reply_blocked" }`, `consentRequired` forced `false`.

---

## 5. Honest degradation contract

No canned coach prose anywhere in the pipeline (`.claude/rules/no-stubs.md`). When the
pipeline cannot produce an honest reply, it emits a **typed turn error** instead of fake text.

`turnError` is `{ reason: "decision_failed" | "reply_blocked" }` (`chat-turn.ts` →
`chatTurnErrorSchema`):

| reason | when (orchestrator `runFanOutTurn`) | assistant content | UI |
| --- | --- | --- | --- |
| `decision_failed` | decision-maker degraded after its one retry (`decisionResult.turnError`) | `" "` placeholder (satisfies NOT NULL) | error card + Retry |
| `reply_blocked` | reply safety blocked the synthesized reply; proposals dropped | `" "` placeholder | error card + Retry + extra "blocked" body line |

`ChatService` persists `metadata.turnError` and threads `turnError` to the response.
`turnError` and `turnDegraded` are **mutually exclusive** — when `turnError` is set,
`turnDegraded` is not written (`chat.service.ts` createMessage metadata). The web error card
is `apps/web/src/components/chat/chat-turn-error-card.tsx` (`ChatTurnErrorCard`): for the
turn-error variant it renders `Chat.turnError.*` copy and a **Retry** button only
(`reason === "reply_blocked"` adds `bodyBlocked`).

`degraded` (`turnDegraded`) is a separate, weaker signal: a usable reply was produced but a
stage degraded (`AiService.generateCoachResponse` maps `safety.status` to a presentation-safe
`ChatTurnDegradedReason`).

---

## 6. Persistence + response

After the AI pipeline returns, still in `ChatService.sendMessage`:

1. **Deterministic proposal injectors** merge into `proposalsToPersist`:
   `mergeDeterministicChatProposals` (wellbeing check-in, nutrition incident),
   weekly-review packing (`isWeeklyReviewTurn`), and a recipe-recommendation proposal
   (`shouldTriggerRecipeRecommendationRequest`). All pass the same validation stack.
   For explainer-`with_proposal` turns, `proposalsToPersist` is forced to `[]`.
2. **`validating` stage** emitted — reply + proposals only become visible to the user after
   this stage (SSE `final` event); this is the safety floor.
3. **Assistant message persisted** with content `generated.turnError ? " " : generated.output.reply`
   and metadata `{ parseErrors, replySafetyErrors, agent, …, (turnError | turnDegraded) }`.
4. **Proposal validation + persist:** unless it's a proposal-explainer turn, each raw proposal
   runs the full `ProposalValidationService` stack (safety, schema, ownership, provenance,
   progress-linkage, goal hierarchy, today source refs, recovery adaptation, habit/wellbeing
   context, nutrition-incident image refs, recipe context, chat-attachment refs) →
   `validationStatus` valid/invalid; all are persisted via `chatRepository.createProposal`.
5. **suggestedQuickActions** derived for LLM-backed turns only (skipped on `turnError`):
   `deriveQuickActionsForTurn` (`packages/types/src/suggested-quick-actions.ts`) over the
   fan-out selected domains:
   - always include `today_summary_read`;
   - add `mark_today_workout_done` iff `workout` is among selected domains;
   - add `nutrition_plan_read` iff `nutrition` is among selected domains.
   Definitions/labels come from `suggestedQuickActions.actions` in `ai-behavior.json`.
6. **Response shape:** `{ thread, userMessage, assistantMessage, proposals, (attachmentOutcomes),
   (consentRequired), (turnError), (suggestedQuickActions) }`.

**SSE vs sync.** For fan-out turns the stream emits:
`turn_accepted → stage(preprocessing) → stage(routing) → stage(domains_running, selectedDomains)
→ stage(synthesis) → stage(validating) → final`. Pre-AI gate turns emit only
`turn_accepted → final`. Stage events carry **no** user/reply/health content — stage name and
selected-domain names only. The `final` event carries the exact same `ChatTurnResponse` the
sync endpoint returns. On error the stream emits a generic `error` event (no internals);
`sendMessage` still completes so messages/proposals persist regardless of stream state.

---

## 7. Decision table — what the user sends → what happens

LLM-call count is the number of pipeline LLM calls (router + N domains + decision-maker).
"Fan-out" = `1 router + up to 3 domains + 1 decision = up to 5`.

| User sends | Path taken | LLM calls | What they see |
| --- | --- | --- | --- |
| Crisis text (self-harm signal) | §3a crisis gate | 0 | Deterministic crisis-support message |
| "объясни предложение" (no pending proposal) | §3b explainer `no_proposal` | 0 | Config reply: no recent proposal to explain |
| "объясни предложение" (pending proposal exists) | §3b explainer `with_proposal` → §4 (router skipped, single-domain fan-out) | 1 domain + 1 decision (no router) | Explanation reply; `proposals: []` |
| "что у меня сегодня" | §3c `today_summary_read` | 0 | Read-only Today summary |
| "отметь тренировку выполненной" | §3c `mark_today_workout_done` (write) | 0 | "Marked … as done" (or clarification if 0/>1 pending) |
| "мой план питания" | §3c `nutrition_plan_read` | 0 | Read-only active nutrition plan |
| Any of the above **with an attachment** | gates step aside (direct/explainer blocked when attachments) → §4 full fan-out | up to 5 | Coach reply; attachment as context (image vision / extracted text) |
| Free-tier user over daily quota | §3d quota gate | 0 | Upgrade-to-Pro quota message |
| Normal coaching question (1 domain) | §4 fan-out, 1 selected domain | 3 (router + 1 + decision) | Coach reply (+ proposals/quick actions per domain) |
| Multi-domain question (e.g. workout + nutrition) | §4 fan-out, 2–3 domains in parallel | up to 5 | Synthesized reply across domains |
| Message > 20k chars | §1 Zod `MAX_CHAT_USER_MESSAGE_CHARS` | 0 | HTTP 400 (nothing persisted) |
| LLM provider failure (decision-maker fails after retry) | §4h → §5 `turnError: decision_failed` | router + domains + 2 decision attempts | Error card + Retry; assistant content `" "` |
| Reply safety blocks the synthesized reply | §4j → §5 `turnError: reply_blocked` | up to 5 | Error card + Retry (+ blocked line); proposals dropped |

---

## Related

- [`llm-pipeline.md`](./llm-pipeline.md) — canonical file-by-file architecture map + invariants + "Removed Legacy Paths".
- `.claude/rules/no-stubs.md` — no fake coach prose / no dead-end gates.
- `.claude/rules/ai-orchestrator.md` — pipeline invariants (preserve in code, not config).
