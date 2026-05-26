# Recipe API Intake and Nutrition Recommendations

## Problem Statement

The domain model already anticipates `Recipe` and `UserRecipeRecommendation`, but recipe intake and recommendation flow are not yet defined as a provider-safe, typed pipeline. Nutrition coaching needs a practical way to ingest external/open recipe data, normalize it into internal contracts, and surface confidence-aware recommendations in chat and nutrition flows without leaking private health context or bypassing revision-safe plan rules.

## Goals

- Add a provider-adapter intake path for external/open recipe APIs.
- Normalize provider responses into internal recipe contracts with ingredients, instructions, calories/macros, servings, tags, source, and confidence/provenance.
- Use normalized recipes in nutrition suggestions/recommendations in chat and nutrition contexts.
- Let accepted recipes become:
  - planned meal entries,
  - food log entries,
  - or recommendation records.
- Preserve revision-safe boundaries: nutrition target or plan changes remain separate typed proposals requiring approval.
- Keep external provider calls least-privilege and free of sensitive private health context.

## Non-Goals

- Turning recipes into a standalone primary navigation surface.
- Sending private health documents, raw wellbeing notes, or broad personal context to third-party recipe providers.
- Automatic nutrition target mutation from recipe acceptance.
- Building diagnosis/treatment nutrition logic or medical meal plans.
- Building a full marketplace/CMS for user-generated recipe publishing.

## User Stories

- As a user asking for meal ideas, I receive recipe recommendations that fit my nutrition context and preferences.
- As a user, I can see recipe confidence/provenance before accepting.
- As a user, I can accept a recipe as a planned meal, food log entry, or saved recommendation.
- As a user, I can reject/skip recipes without changing my nutrition plan targets.
- As a user, if I want macro/target adjustments, I receive a separate proposal card rather than silent target changes.
- As a product team, we can switch recipe providers behind a stable adapter contract.

## Accepted UX Behavior

- **Recipe retrieval**
  - Assistant can fetch recipes through a provider adapter when nutrition recommendation intent is detected.
  - Recommendations show recipe title, serving size, estimated calories/macros, key tags/restrictions, and source label.
- **Confidence/provenance**
  - Recipe cards include confidence/provenance indicators for nutrition estimates and source quality.
  - Low-confidence estimates display caution copy and encourage user edits/verification.
- **Acceptance paths**
  - User can accept a recipe as:
    - planned meal (future),
    - food log entry (now),
    - recommendation bookmark/history item.
  - Acceptance writes structured records and links to recipe source/provenance.
- **Plan mutation boundary**
  - Accepting a recipe does not auto-change nutrition targets.
  - Any target or macro redistribution change appears as a separate typed proposal requiring user approval and revision-safe apply.

## Data And Contracts

- Provider adapter interface (illustrative):
  - `searchRecipes(query, filters)`
  - `getRecipeByExternalId(externalId)`
  - `mapToNormalizedRecipe(rawPayload)`
- Normalized recipe contract fields (minimum):
  - `name`, `ingredients[]`, `instructions[]`, `servingSize`, `servings`, `estimatedCalories`, `estimatedMacros`, `tags[]`, `dietaryFlags[]`, `source`, `provenance`, `confidence`.
- Persistence alignment with domain model:
  - `Recipe` table for normalized recipe records.
  - `UserRecipeRecommendation` for shown/accepted/dismissed lifecycle.
  - Mapping to nutrition-today or food log/planned meal records on acceptance.
- Privacy boundary:
  - External calls may include generic nutrition intent and explicit dietary filters.
  - External calls must not include raw health docs, sensitive notes, or unnecessary personal health context.

## First Epic Implementation Slices

1. **Types and adapter contracts**
   - Add shared schemas for normalized recipes, provider raw-to-normalized mapping, confidence/provenance payloads, and recommendation status transitions.
2. **Backend ingestion and recommendation services**
   - Implement provider adapter abstraction and at least one concrete provider integration.
   - Add normalization, deduplication, persistence, and recommendation lifecycle writes.
   - Add acceptance handlers for planned meal/food log/recommendation outcomes.
3. **Frontend recommendation UX**
   - Render recipe recommendation cards with nutrition summary and confidence/provenance.
   - Support accept/dismiss/edit intent and route target changes to separate proposal flow.
4. **Tests**
   - Add contract tests for adapter mapping and normalization safety.
   - Add backend tests for acceptance lifecycle and no-auto-target-change guarantee.
   - Add frontend tests for recommendation card states and acceptance paths.

## Acceptance Criteria

1. At least one recipe provider adapter is implemented behind a stable internal interface.
2. Provider responses are normalized into internal recipe schema with required fields and validated confidence/provenance metadata.
3. Recommendation cards can be surfaced in nutrition coaching flow with source and estimate visibility.
4. Users can accept recipes into planned meal, food log, or recommendation records.
5. Dismissed or pending recommendations do not mutate nutrition targets.
6. Nutrition target/macro changes from recipe discussions always require separate typed proposal approval and revision-safe apply.
7. External provider requests exclude private health-document and sensitive-wellbeing context by default.
8. Recommendation lifecycle is auditable via structured status records.

## Risks And Assumptions

- Third-party provider quality and field consistency can vary and require robust normalization/fallbacks.
- Macro/calorie estimates may be approximate; confidence display must avoid false precision.
- Provider rate limits or outages can degrade recommendation UX without caching/fallback strategy.
- Duplicate recipes across sources can fragment recommendation history if deduping is weak.
- Assumes existing nutrition logging/planned-meal write paths can be reused for accepted recipes.

## Subagent Implementation Order

1. **Backend Implementer**
   - Adapter abstraction, provider integration, normalization, persistence, and acceptance lifecycle handlers.
2. **Frontend Implementer**
   - Recipe recommendation cards, acceptance actions, and proposal handoff for target changes.
3. **Test Writer**
   - Adapter/contract tests, backend lifecycle tests, and UI-state tests.
4. **Implementation Reviewer**
   - Privacy boundary checks, revision-safety checks, and architecture-fit review.
5. **App Runner**
   - Runtime verification for recommendation retrieval and acceptance flows.

Skip by default for this scope: Visual Designer, Design System Agent, UI Polish Implementer.

## Verification Plan

- Run shared-contract tests for normalized recipe and adapter schemas.
- Run backend tests for:
  - provider mapping and validation,
  - dedupe and persistence,
  - recommendation status transitions,
  - acceptance writes to meal/log/recommendation records,
  - no direct nutrition target mutation.
- Run frontend tests for:
  - recommendation card rendering,
  - confidence/provenance display,
  - accept/dismiss/edit transitions,
  - handoff to separate proposal flow for target changes.
- Run integration smoke tests:
  - recommendation request -> card display -> accept as meal/log,
  - recommendation request -> dismiss,
  - recipe-triggered target adjustment request -> separate proposal card.
- App Runner validates end-to-end web + API flow and reports runtime blockers.
