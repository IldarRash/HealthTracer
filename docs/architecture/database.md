# Database Plan

## Database Choice

Use PostgreSQL with Drizzle ORM and Drizzle Kit migrations.

Default environments:

- Local development: Docker Postgres or a dedicated Railway development database.
- Staging: Railway Postgres with non-production data.
- Production: Railway Postgres with strict access controls and backups.

## Package Ownership

All schema and migrations should live in `packages/db`.

Expected layout:

```text
packages/db/
  src/
    schema/
    relations.ts
    index.ts
  drizzle/
  drizzle.config.ts
```

## Table Inventory

Source of truth is [`packages/db/src/schema/*`](../../packages/db/src/schema)
(every table is a `pgTable` there). Grouped by domain:

**Identity & profile** — `users`, `user_profiles`, `goals`.

**Chat & AI** — `chat_threads`, `chat_messages`, `chat_attachments`,
`ai_proposals`.

**Workouts** — `workout_plans`, `workout_plan_revisions`, `workout_sessions`
(planned + `ad_hoc`), `exercises` (catalog).

**Nutrition** — `nutrition_plans`, `nutrition_plan_revisions`,
`nutrition_adherence`, `nutrition_incidents`, `food_photo_analyses`, `recipes`,
`user_recipe_recommendations`.

**Today & habits** — `daily_checklists`, `habit_plans`, `habit_plan_revisions`,
`habit_templates`, `habit_completions`.

**Wellbeing & recovery** — `wellbeing_check_ins`, `recovery_check_ins`,
`recovery_context_snapshots`.

**Body composition** — `body_composition_analyses`.

**Progress** — `weekly_progress_summaries`, `trend_observations`.

**Metrics & devices** — `health_metric_snapshots`, `health_metric_aggregates`,
`device_connections`, `device_consents`.

**Documents** — `health_documents`, `health_document_summaries`,
`document_signals`.

**Billing & usage** — `subscriptions`, `stripe_webhook_events`,
`chat_ai_usage_daily`.

**Infra** — `migration_checks`.

Each domain maps to a NestJS module under
[`apps/api/src/modules/*`](../../apps/api/src/modules) (registered in
[`apps/api/src/app.module.ts`](../../apps/api/src/app.module.ts)).

## Revision Pattern

Plan identity tables hold stable metadata and point to the active revision. Revision tables hold immutable versions.

```text
workout_plans
  id
  user_id
  active_revision_id
  status

workout_plan_revisions
  id
  workout_plan_id
  revision_number
  reason
  source
  payload
  created_at
```

The same pattern is used for any user-facing plan that AI can change
(`workout_plans` / `nutrition_plans` / `habit_plans` and their `*_revisions`).
Most accepted workout/nutrition proposals reference the revision they create
after user approval.

**Performed vs planned.** `workout_sessions` is the performed side and never
mutates a revision. Its `source` is `planned` (materialized from a revision) or
`ad_hoc` (a logged one-off with **nullable** `workout_plan_id` /
`workout_plan_revision_id`, an `activity_type`, and `estimated_calories`). NULLs
are distinct in the `(user_id, workout_plan_id, workout_plan_revision_id,
planned_date)` unique index, so multiple ad-hoc rows insert cleanly on one day.
`nutrition_incidents` is the eaten/performed side and likewise never changes
plan targets.

## Proposal Status Pattern

AI-generated changes are persisted before they are applied.

```text
ai_proposals
  id
  user_id
  intent
  target_domain
  status -- pending, accepted, rejected, superseded
  validation_status
  proposed_changes
  user_decision_at
  applied_revision_id
  created_at
```

Pending proposals must not change active plan state. Rejected proposals must remain auditable without applying changes. `applied_revision_id` (the `applied`
reference) points to the created revision for plan intents, or to the created row
for LOG (revision-free) intents (e.g. `workout_session:<id>` /
`nutrition_incident:<id>`). A proposal payload may carry an optional,
non-authoritative `displayContract` render hint; it is recomputed/clamped on
accept and stripped before any revision is written, so it never persists on a
revision (see [`../product/features/editable-proposals-performed-log.md`](../product/features/editable-proposals-performed-log.md)).

## Attachment And Incident Pattern

Message attachments and nutrition incidents are structured records. Attachments are
context-only image records for chat turns; nutrition incidents are written only through
accepted proposals.

```text
chat_attachments
  id
  user_id
  thread_id
  message_id
  category -- currently unclassified at runtime
  status
  mime_type
  storage_key
  recognition -- legacy readable field, not a runtime branch
  retention_policy
  expires_at

nutrition_incidents
  id
  user_id
  source_proposal_id
  incident_datetime
  items
  confidence
  provenance
```

Chat attachments are ownership scoped and may expire. They do not run a separate
food/workout/medical recognition pipeline and do not create proposal candidates outside
the unified LLM proposal path. Medical document save from an image is deferred; **no
attachment path may auto-create `health_documents`**. Nutrition incidents are written only
after an accepted `log_nutrition_incident` proposal.

## Document Tables (explicit, consent-gated upload)

`health_documents`, `health_document_summaries`, and `document_signals` back the
**Profile** document feature ([`apps/api/src/modules/documents`](../../apps/api/src/modules/documents)) —
an explicit user upload of a PDF/text file, never an attachment behavior. Consent
is a **five-scope, per-operation** model on `health_documents` (`upload_storage`,
`parse_ocr`, `ai_summarization`, `semantic_indexing`, `coach_chat_context`;
[`packages/db/src/schema/documents.ts`](../../packages/db/src/schema/documents.ts))
with revoke + delete. Raw bytes live on the storage adapter (encrypted store
required in production), **extracted text is never persisted or logged**,
summaries are governed/non-diagnostic, and `document_signals` holds only
approved, consent-eligible wellness signals that may enter coaching context.

## Migration Rules

- Do not manually change production schema.
- Generate migrations from `packages/db`.
- Review generated SQL before applying it.
- Add indexes for foreign keys and frequent lookup fields.
- Prefer explicit timestamps: `created_at`, `updated_at`, and domain-specific dates.
- Avoid storing sensitive health documents in plain database fields.
- Require explicit consent records before storing device sync data or document-derived AI context.

## Data Access Rules

- Domain repositories access Drizzle.
- Controllers must not query the database directly.
- AI tools must call domain services, not repositories.
- Postgres MCP may inspect schema and run read-only dev queries, but it must not be the migration authority.
- Domain services must verify user ownership before applying accepted AI proposals.
