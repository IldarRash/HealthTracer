# Recipe API Intake and Nutrition Recommendations

## Problem Statement

Recipe support is partially implemented, but the shipped behavior still needs an implementation-ready pass before it can be treated as a complete recipe API and nutrition recommendation feature. The product needs a provider-safe recipe intake path, validated recipe recommendation lifecycle, and clear nutrition UX placement that helps users find meal ideas without leaking private health context or bypassing revision-safe nutrition plan rules.

The important boundary is unchanged: recipes are wellness planning support, not a medical meal plan. Chat may suggest and propose recipe recommendations, but structured records remain authoritative and calorie, macro, hydration, restriction, or allergy target changes must use separate nutrition proposals.

## Current Baseline

Already present:

- Database schema for `recipes` and `user_recipe_recommendations`, including provider/external ID dedupe and links to nutrition plan revisions.
- Shared recipe and recommendation contracts in `packages/types`, including `recommend_recipes` proposal payloads and recommendation status transitions.
- Backend `RecipesModule` with authenticated catalog, recommendation generation, recommendation status update, and accepted recipe proposal apply support.
- A `RecipeCatalogProvider` abstraction with a TheMealDB implementation that fetches only generic categories, normalizes provider payloads, stores approximate macro estimates, and falls back to the seeded catalog when provider calls fail.
- Hard-filter recommendation scoring against active nutrition plan restrictions/allergies and supported profile constraints.
- Tests covering provider query privacy, provider timeout signaling, recommendation dedupe, ownership, compatibility filters, proposal apply, and no direct nutrition revision mutation.
- Web API helpers and a hidden `RecipesWorkspace`, though `/recipes` currently redirects to `/nutrition` and the Nutrition screen does not surface recipe recommendations directly.

Not complete:

- Recipe contracts do not yet expose first-class confidence/provenance fields beyond `source`, approximate macro copy, provider, and external ID in persistence.
- User acceptance is currently recommendation lifecycle only (`accepted`, `dismissed`, `completed`); it does not create a nutrition incident/food log entry or planned meal record.
- Chat can persist `recommend_recipes` proposals if an AI provider emits valid recipe IDs, but there is no deterministic recipe recommendation trigger/tool handoff from chat intent to the recipe service.
- The user-facing recipe recommendation UX is not currently reachable as a stable nested Nutrition surface.
- Provider configuration remains a hard-coded public TheMealDB integration rather than an environment-driven provider registry.

## Goals

- Complete the provider-adapter intake path for external/open recipe APIs without sending private health docs, raw wellbeing notes, or broad personal context to providers.
- Normalize provider responses into internal recipe contracts with ingredients, instructions, servings, calories/macros, tags, dietary restrictions/allergens, source, provider identity, provenance, and confidence.
- Surface recipe recommendations from nutrition contexts and Chat proposal flows using existing structured recommendation records.
- Let accepted recommendations write only explicit structured outcomes:
  - recommendation saved/dismissed/completed lifecycle,
  - optional nutrition incident/food log entry after user confirmation,
  - optional planned meal entry only if a durable planned-meal model exists in scope.
- Preserve revision-safe boundaries: nutrition target or plan changes remain separate typed proposals requiring approval.
- Keep recipe UI nested under Nutrition/Chat and out of primary navigation.

## Non-Goals

- Turning recipes into a standalone primary navigation surface.
- Sending private health documents, raw wellbeing notes, raw chat history, provider secrets, or unnecessary personal health context to third-party recipe providers.
- Automatic nutrition target, macro, hydration, restriction, or allergy mutation from recipe acceptance.
- Diagnosis, treatment nutrition logic, clinical diet planning, medical meal plans, or medical certainty language.
- Building a marketplace/CMS for user-generated recipe publishing.
- Replacing food-photo analysis or nutrition incident proposals with recipe recommendations.

## User Stories

- As a user asking for meal ideas, I receive recipe recommendations that fit my active nutrition revision and known restrictions.
- As a user, I can see source, estimate confidence, and provenance before saving or logging a recipe.
- As a user, I can save, dismiss, or complete a recommendation without changing my nutrition targets.
- As a user, I can confirm a recommended recipe as a food log/nutrition incident only after seeing the estimated calories/macros.
- As a user, if I ask to change macros or targets because of a recipe discussion, I receive a separate nutrition proposal card.
- As a product team, we can switch or add recipe providers behind a stable adapter contract without changing the recommendation lifecycle.

## UX Placement

- Recipe recommendations belong in Chat proposal cards and the secondary Nutrition surface.
- `/recipes` may remain a hidden/nested support route, but it should not be advertised in primary navigation.
- The Nutrition page should be the reachable user-facing home for plan-fit recommendations, with clear copy that saving or completing recipes does not change active targets.
- Today remains the daily execution surface. A recipe can contribute to Today only through an explicit structured log/planned-meal action, not through silent plan edits.

## Accepted UX Behavior

- **Recipe retrieval**
  - Backend can fetch recipes through a provider adapter using generic provider-safe inputs only.
  - Recommendations show recipe title, serving size, estimated calories/macros, key tags/restrictions/allergens, source label, confidence, and provenance.
- **Confidence/provenance**
  - Recipe cards identify approximate nutrition estimates and source quality.
  - Low-confidence estimates display caution copy and require user confirmation/editing before any food log write.
- **Acceptance paths**
  - User can save, dismiss, or complete a recommendation.
  - User can optionally log the recipe as a nutrition incident/food log entry after confirmation.
  - Planned-meal writes are allowed only if an explicit planned-meal model/API exists; otherwise this remains deferred.
- **Plan mutation boundary**
  - Saving, completing, dismissing, or logging a recipe does not mutate nutrition targets.
  - Any target or macro redistribution change appears as a separate typed `adjust_nutrition_plan` proposal requiring approval and revision-safe apply.

## Data And Contracts

- Provider adapter interface should remain stable:
  - fetch by generic categories/search terms that are safe for provider use,
  - fetch/get by external ID where supported,
  - map provider payload to normalized internal draft.
- Normalized recipe contract fields should include:
  - `name`, `description`, `ingredients[]`, `preparationSteps[]`, `servings`, `macroEstimates`, `mealTypes`, `tags[]`, `restrictionTags[]`, `allergenTags[]`, `prepMinutes`, `cookMinutes`, `source`, `provider`, `externalId`, `provenance`, and `confidence`.
- Persistence alignment:
  - `recipes` stores normalized provider/seed catalog records.
  - `user_recipe_recommendations` stores shown/saved/dismissed/completed lifecycle and related nutrition revision.
  - Nutrition incident/food log acceptance should reuse `nutrition_incidents` and `log_nutrition_incident` validation when implemented.
- Privacy boundary:
  - External provider calls may include generic recipe categories/search terms only.
  - Filtering against user restrictions, allergies, nutrition targets, profile constraints, document-derived signals, or wellbeing data happens internally after provider results are normalized.

## Implementation Slices

1. **Baseline alignment and contracts**
   - Add explicit `confidence` and `provenance` recipe fields to shared schemas and persistence, or document a narrow MVP mapping if schema changes are deferred.
   - Ensure provider/external ID and source fields are returned to clients where needed for user-facing provenance.
   - Keep `recommend_recipes` proposal payload focused on existing recipe IDs, reason, fit summary, and related nutrition revision.
2. **Backend provider and recommendation hardening**
   - Keep TheMealDB behind the provider abstraction and make provider selection/configuration environment-driven if needed.
   - Add provider mapping tests for confidence/provenance, malformed provider payloads, dedupe, fallbacks, rate/timeout behavior, and no user-context provider leakage.
   - Add recipe recommendation validation for stale/missing related nutrition revisions and status transitions.
3. **Chat and proposal integration**
   - Add a deterministic or tool-mediated path for recipe recommendation requests that creates `recommend_recipes` proposals or invokes the recipe recommendation service.
   - Ensure recipe discussions that imply target changes create separate `adjust_nutrition_plan` proposals.
   - Do not include health documents or raw wellbeing notes in recipe provider calls.
4. **Nutrition UX integration**
   - Surface recommendation cards inside the secondary Nutrition view or link to a nested support panel that is actually reachable from Nutrition.
   - Show source, approximate-estimate copy, confidence/provenance, restrictions/allergens, and save/dismiss/complete actions.
   - Keep `/recipes` hidden from primary nav and avoid making recipes a new top-level surface.
5. **Confirmed food log path**
   - If in scope, add an explicit "log this recipe" action that creates a `log_nutrition_incident` proposal or calls a validated nutrition incident path after confirmation.
   - Do not implement planned meals unless the data model/API for planned meals is created in this feature; otherwise defer planned meal acceptance.
6. **Verification and runtime pass**
   - Run focused contract, backend, frontend, and integration tests.
   - App Runner verifies authenticated recommendation generation and status actions in the running web app, noting Clerk sign-in as a blocker if it recurs.

## Acceptance Criteria

1. At least one recipe provider adapter remains implemented behind a stable internal interface.
2. Provider requests are least-privilege and use generic recipe inputs only; no private health docs, raw wellbeing notes, raw chat history, email, user ID, personal targets, allergies, or restrictions are sent externally.
3. Provider responses are normalized into validated internal recipe records with required recipe fields, source/provenance, and confidence/estimate visibility.
4. Recommendation generation uses active nutrition revision data only inside backend filtering/scoring and links recommendations to that revision.
5. Recommendation cards are reachable from the Nutrition/Chat flow and show source, approximate nutrition copy, confidence/provenance, and relevant restriction/allergen labels.
6. Users can save, dismiss, and complete recommendations through structured status records.
7. If food logging is included, recipe logging requires explicit user confirmation and writes through validated nutrition incident/food log records.
8. Pending, dismissed, saved, completed, or logged recipes do not mutate nutrition targets, macros, hydration, restrictions, allergies, or active nutrition revisions.
9. Nutrition target/macro changes from recipe discussions always require a separate typed `adjust_nutrition_plan` proposal and revision-safe apply.
10. Recommendation lifecycle remains auditable via structured records and ownership checks.

## Risks And Assumptions

- TheMealDB does not provide verified nutrition facts, so macro values are approximate and should remain clearly labeled.
- Provider outages/rate limits can degrade recommendation generation; seeded catalog fallback should remain tested.
- Current status actions save/complete recommendations but do not create food logs; implementing food logs requires careful reuse of nutrition incident validation.
- Planned meal acceptance depends on whether the product has or adds a durable planned-meal model.
- Provider data can be inconsistent, requiring robust normalization and defensive mapper tests.
- Authenticated browser verification may be blocked by Clerk sign-in, as with prior workflows.

## Role-Specific Tasks

1. **Backend Implementer**
   - Harden recipe contracts/persistence for confidence/provenance, provider config, provider mapper validation, recommendation lifecycle, and optional food-log acceptance through nutrition incidents.
2. **Frontend Implementer**
   - Make recipe recommendations reachable from Nutrition/Chat, render confidence/provenance/source, and keep target-change actions routed to Chat proposals.
3. **Test Writer**
   - Add focused contract, backend, mapper, privacy, proposal, nutrition incident, and UI-state tests for the completed slices.
4. **Implementation Reviewer**
   - Review provider privacy, no-target-mutation guarantees, proposal boundaries, status lifecycle, and architecture placement.
5. **App Runner**
   - Start the stack and verify recommendation generation, save/dismiss/complete, and any confirmed food-log path in the browser/API.

Skip by default for this scope: Visual Designer, Design System Agent, UI Polish Implementer. Reconsider Design System only if the frontend work introduces reusable recipe/provenance primitives beyond this screen.

## Verification Plan

- Run shared contract tests for recipe schemas, recommendation payloads, status transitions, and confidence/provenance fields.
- Run backend tests for:
  - provider mapping and malformed payload handling,
  - provider timeout/fallback behavior,
  - no user-context leakage to provider calls,
  - dedupe and persistence,
  - recommendation status transitions and ownership,
  - proposal apply with active/stale nutrition revision checks,
  - optional recipe-to-nutrition-incident logging,
  - no direct nutrition target or revision mutation.
- Run frontend tests for:
  - Nutrition recipe recommendation placement,
  - source/confidence/provenance display,
  - approximate-estimate and low-confidence copy,
  - save/dismiss/complete actions,
  - no UI affordance that implies target mutation.
- Run integration smoke tests:
  - active nutrition plan -> generate recommendations -> card display -> save/dismiss/complete,
  - no active nutrition plan -> limited reason,
  - provider failure -> seeded catalog fallback,
  - recipe-triggered target adjustment request -> separate nutrition proposal card,
  - optional confirmed recipe log -> nutrition incident record.
- App Runner validates the end-to-end web + API flow and reports runtime blockers, including Clerk sign-in if authenticated browser access is unavailable.
