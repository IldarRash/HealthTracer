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

## Initial Tables

MVP 1 tables:

- `users`
- `user_profiles`
- `goals`
- `chat_threads`
- `chat_messages`
- `workout_plans`
- `workout_plan_revisions`
- `workout_sessions`
- `nutrition_plans`
- `nutrition_plan_revisions`
- `nutrition_incidents`
- `daily_checklists`
- `health_metrics`
- `ai_proposals`
- `chat_attachments`
- `exercises`

Implemented support tables:

- `recipes`
- `user_recipe_recommendations`
- `device_connections`
- `health_documents`
- `health_document_summaries`

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

The same pattern should be used for any future user-facing plan that AI can change. AI proposals reference the revision they create after user approval.

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

Pending proposals must not change active plan state. Rejected proposals must remain auditable without applying changes.

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
the unified LLM proposal path. Medical document save from an image is deferred; no
attachment path may auto-create `health_documents`. Nutrition incidents are written only
after an accepted `log_nutrition_incident` proposal.

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
