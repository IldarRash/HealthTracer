# AI Behavior Config

How the chat/AI and attachment behavior is configured. **Files-first and
repo-backed — there is no database overlay.** Config can only *narrow* what the
code already allows; the safety floors live in code, not config.

Package: [`packages/ai-behavior`](../../packages/ai-behavior). Schemas and
defaults: [`packages/types/src/ai-behavior-config.ts`](../../packages/types/src/ai-behavior-config.ts),
[`attachment-behavior-config.ts`](../../packages/types/src/attachment-behavior-config.ts),
[`domain-config.ts`](../../packages/types/src/domain-config.ts).

## The three config surfaces

| Surface | File | Owns |
|---------|------|------|
| Chat / LLM behavior | [`config/ai-behavior.json`](../../packages/ai-behavior/config/ai-behavior.json) | Routing, direct-path patterns/order, live fan-out prompt templates, empty-attachment message. |
| Attachments | [`config/attachments.json`](../../packages/ai-behavior/config/attachments.json) | Image + `document_file` categories with allowed MIME types/size, retention map, consent metadata, plumbing stage order, attachment safety floors. **No classification/recognition.** |
| Per-domain | [`config/domains/*.yml`](../../packages/ai-behavior/config/domains) | One file per domain (`workout.yml`, `nutrition.yml`, `health.yml`): `intents[]` (each mapping to a catalog capability), `tools[]`, and `safetyNotes[]`. |

## Loaders (fail-closed)

Loaders live in [`packages/ai-behavior/src`](../../packages/ai-behavior/src):

- [`loader.ts`](../../packages/ai-behavior/src/loader.ts) — `loadAiBehaviorConfig`.
  On any read/parse failure it returns the **built-in defaults** with `source:
  "defaults"` and records the error/warning rather than throwing.
- [`attachment-loader.ts`](../../packages/ai-behavior/src/attachment-loader.ts) —
  same fail-closed pattern for `attachments.json`.
- [`domain-config-loader.ts`](../../packages/ai-behavior/src/domain-config-loader.ts) —
  `loadDomainConfigs`. **Fail-closed per file**: a missing/unreadable/invalid
  domain YAML falls back to that domain's built-in default with a warning; one
  broken domain never blocks the others.

Loading is **fail-closed everywhere**: a bad config degrades to safe built-in
defaults; it can never crash the pipeline or silently widen behavior.

## YAML narrows only — never widens

After a domain YAML parses, `loadDomainConfigs` runs
`intersectDomainConfigWithCatalog`: any `tool` or `mapsToCapabilityId` **not in
the capability catalog is dropped** and a warning is recorded. The catalog is the
floor; YAML (and the router) can only **narrow** the allowlists, never add a
capability or tool that code does not already permit. The domain enum itself is
fixed in code — `workout | nutrition | health`
([`domain-config.ts`](../../packages/types/src/domain-config.ts)).

## Direct paths & quick actions (`ai-behavior.json`)

`directPaths` configures the deterministic pre-AI shortcuts (matched in
`detectionOrder`). There are **three** kinds:

- `mark_today_workout_done` — the one narrow **write**.
- `today_summary_read` — read-only Today summary.
- `nutrition_plan_read` — read-only active-nutrition-plan readback. Its `matchPatterns`
  cover **RU + EN** phrasings (e.g. "show my nutrition plan", "покажи мой план питания")
  and a `negativePatterns` guard against advice/mutation phrasing.

`directPaths.replyTemplates` holds the deterministic reply copy per kind:
`todaySummary`, `markWorkoutDone`, and **`nutritionPlan`** (`introTemplate`,
`mealLineTemplate`, `macrosLineTemplate`, `noActivePlanLine`). The nutrition-plan
formatter (`apps/api/src/modules/chat/direct-chat-path-formatters.ts`) interpolates these
templates; safety floors are unaffected (all three are read/write product boundaries, not
LLM routes).

`suggestedQuickActions.actions[]` configures the chips attached after **LLM (fan-out)**
turns. Each action declares an `id` (a direct-path kind), `labelEn`/`labelRu`, and a
localized `messageText` (`{ en, ru }`). The pure helper
`deriveQuickActionsForTurn` ([`packages/types/src/suggested-quick-actions.ts`](../../packages/types/src/suggested-quick-actions.ts))
selects which chips to show from the fan-out's selected domains (always
`today_summary_read`; `mark_today_workout_done` when `workout` is selected;
`nutrition_plan_read` when `nutrition` is selected). Tapping a chip sends its localized
`messageText`, which then matches the matching deterministic direct path. See
[`llm-pipeline.md`](./llm-pipeline.md) "Suggested Quick Actions".

## Attachment categories & retention (`attachments.json`)

`categories.entries[]` declares each attachment category with its `allowedMimeTypes`,
`maxBytes`, and `label`; `retention.byCategory` maps each category to a retention
policy. Two kinds of attachment are accepted:

- **Image categories** (`unclassified`, `food_photo`, `medical_document`,
  `workout_attachment`) — `image/jpeg`, `image/png`, `image/webp`.
- **`document_file`** — `application/pdf`, `text/plain`, `text/markdown`,
  `text/x-markdown`, capped at **5 MB** (`maxBytes: 5000000`), retention
  `ephemeral_recognition`. The category is **MIME-inferred** (no user-declared
  category): the deterministic MIME→category map resolves these types to
  `document_file`. Document text is extracted per-turn and fed to the domain LLMs as
  context — never persisted or logged (see [`llm-pipeline.md`](./llm-pipeline.md)
  Stage 1).

`turnStages.order` is the plumbing stage order
(`validate_refs → link_to_message → apply_upload_disposition`); there are no
classification/recognition stages.

## What is NOT configurable (code safety floors)

Config cannot relax these — they are enforced in code and regression-tested:

- **Context budgets deny documents and sensitive health context by default**
  (`allowDocuments=false`), re-applied to every per-domain packet. Config cannot
  relax this floor.
- **The router is read-only and clamped** — it selects ≤3 domains and emits
  hints only, never replies or proposals.
- **The decision-maker emits typed proposals only** and never writes domain
  state; only the workout domain LLM may set a workout calorie estimate.
- **Crisis support and the other pre-AI gates** bypass the LLM entirely.
- **Attachments are images + document files (PDF/TXT/Markdown), context-only** —
  no attachment path may create or parse `health_documents`. Document text is
  extracted per-turn and never persisted or logged.

See [`llm-pipeline.md`](./llm-pipeline.md) for the full pipeline and the
"Removed Legacy Paths" list.

## Recent truth-cleanup

- **`getDocumentContext` is no longer advertised to domain LLMs.** Under the
  `allowDocuments=false` context-budget floor it always returns empty, so
  exposing it would promise a capability that cannot fire. It is intentionally
  excluded from `AgentToolRegistry.listAvailableTools`
  ([`apps/api/src/modules/ai/agent-tool-registry.service.ts`](../../apps/api/src/modules/ai/agent-tool-registry.service.ts))
  and commented out of `health.yml`. Document context for health questions is not
  available via any domain config.
- **`medical.yml` was deleted — `health.yml` owns the domain.** There is no
  separate `medical` domain; the health domain config carries the health/wellness
  intents (general context, longevity, body-photo analysis) and its own
  non-diagnostic safety notes.

> `document_file` chat attachments are **context-only**: their text is extracted
> per-turn and never persisted. **Durable** document upload/parse/storage is a
> separate, explicit **Profile** feature
> ([`apps/api/src/modules/documents`](../../apps/api/src/modules/documents)) under
> a five-scope per-operation consent model — it is not an attachment behavior and
> is not driven by this config, and no attachment path may create or parse a
> `health_document`. See [`domain-model.md`](./domain-model.md) and
> [`database.md`](./database.md).
