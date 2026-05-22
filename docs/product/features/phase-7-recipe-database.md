# Phase 7: Recipe Database

## Summary

Phase 7 adds recipes as structured nutrition knowledge that can be searched, displayed, and recommended against a user's active nutrition plan. Recipes include ingredients, macro estimates, tags, restrictions, meal types, and preparation metadata. The AI may explain why a recipe fits the current plan and create recipe recommendation proposals, but recipe acceptance does not silently change calorie, macro, hydration, or restriction targets.

Nutrition targets remain authoritative in immutable `nutrition_plan_revisions`. If the coach recommends changing calorie or macro targets after recipe discussion, that must be a separate nutrition-plan proposal that the user approves and the backend applies as a new nutrition plan revision.

## Problem / Opportunity

The Nutrition tab can currently show structured targets and revision history, but it does not help users turn targets into concrete meals. Chat can suggest meal ideas conversationally, yet those suggestions are not reusable, filterable, auditable, or validated against structured restrictions.

A recipe database creates a safe bridge between nutrition targets and daily eating choices: the app can recommend meals that approximately fit the active plan while preserving the product invariant that structured plan revisions, not chat, own targets and constraints.

## Goals

- Add a structured recipe catalog with ingredients, estimated macros, meal type, tags, dietary metadata, and preparation details.
- Let authenticated users browse or receive recipe recommendations that fit their active nutrition plan and known restrictions.
- Persist recipe recommendations shown to a user with status and rationale for auditability.
- Support AI-generated recipe recommendation proposals through the existing proposal approval pattern.
- Keep nutrition target changes separate from recipe recommendations and route target changes through nutrition plan revisions only.
- Provide web/API first implementation readiness, with Expo mobile remaining optional unless explicitly included in the implementation scope.

## Non-Goals

- Recipe recommendations must not diagnose, treat, or claim to improve medical conditions.
- Accepting or saving a recipe must not mutate nutrition target fields such as calories, macros, hydration, or restrictions.
- This phase does not require full meal planning, grocery ordering, pantry management, barcode scanning, or food logging.
- This phase does not require AI-generated recipes to be persisted directly without backend validation.
- This phase does not require device sync, document-derived restrictions, or medical nutrition therapy workflows.
- This phase does not replace the Nutrition tab's active revision model.

## Product Rules

- Structured recipe and recommendation state is authoritative for recipes shown in the Recipes surface; chat is only an interaction layer.
- Nutrition targets, restrictions, and preferences remain in active `nutrition_plan_revisions`.
- Recipe recommendations may reference the active nutrition plan revision they were evaluated against.
- Pending and rejected recipe proposals must not create accepted recommendations or alter plan state.
- Accepted recipe recommendation proposals create or update `user_recipe_recommendations`, not nutrition plan revisions.
- Any proposed target adjustment from recipe discussion must use `targetDomain: "nutrition"` and create a new nutrition plan revision only after separate user approval.
- Recipe matching must filter out known incompatible restrictions and allergies before ranking or explanation.
- User-facing explanations must use wellness, preference, and fit language, avoiding treatment claims or medical certainty.

## User Stories

- As an authenticated user, I can open a Recipes surface and browse recipe cards with meal type, ingredients, estimated macros, tags, restrictions, and prep details.
- As an authenticated user, I can see recipe recommendations that fit my active nutrition targets and dietary restrictions.
- As an authenticated user, I can accept, dismiss, or mark a recipe recommendation as completed without changing my nutrition targets.
- As an authenticated user, I can understand why a recipe was recommended in terms of plan fit, preferences, restrictions, and meal type.
- As an authenticated user, I can reject an AI recipe proposal and trust that no recipe status or nutrition plan state changed.
- As a developer, I can audit which active nutrition plan revision was used when a recipe recommendation was shown.

## Acceptance Criteria

- Recipes are stored as structured records with at least name, ingredients, estimated calories/macros, serving count or serving size, meal type, tags, restrictions/allergen metadata, prep time, instructions or preparation summary, source metadata, status, and timestamps.
- Recipe APIs and repositories enforce authenticated user boundaries for user-specific recommendation state.
- Catalog recipes are readable through a validated API contract and can be filtered by meal type, tags, restrictions, and approximate macro fit.
- Users with no active nutrition plan can browse recipes, but plan-fit recommendations show an explicit empty or limited state.
- Recommendations are generated against the active nutrition plan revision and store `relatedNutritionPlanRevisionId` when available.
- Recommendation generation filters out recipes that conflict with known restrictions/allergies before ranking or AI explanation.
- Accepting a recipe recommendation updates recommendation status only; it does not mutate `nutrition_plans`, `nutrition_plan_revisions`, calorie targets, macro targets, hydration targets, or restriction fields.
- If the AI suggests changing nutrition targets because of recipes, the system creates a separate `adjust_nutrition_plan` proposal that requires its own approval and creates a new nutrition plan revision if accepted.
- Pending and rejected recipe proposals do not create accepted recommendation records and do not change nutrition plan state.
- Web UI shows recipe cards, recipe detail, recommendation rationale, compatibility signals, empty/loading/error states, and accept/dismiss/complete actions.
- Shared Zod schemas validate recipe payloads, recommendation payloads, proposal payloads, and API responses.
- Focused tests cover recipe filtering, restriction/allergy incompatibility, proposal apply behavior, nutrition revision non-mutation, ownership, and unsafe medical wording rejection.

## Domain / Data Model Notes

Add two main domain concepts:

- `Recipe`: global or curated catalog entry. Initial fields should include `id`, `name`, `description`, `ingredients`, `instructions` or `preparationSteps`, `servings`, `estimatedCalories`, `proteinGrams`, `carbsGrams`, `fatGrams`, `fiberGrams` if supported, `mealTypes`, `tags`, `restrictionTags`, `allergenTags`, `prepMinutes`, `cookMinutes`, `source`, `status`, `createdAt`, and `updatedAt`.
- `UserRecipeRecommendation`: user-specific recommendation state. Initial fields should include `id`, `userId`, `recipeId`, `relatedNutritionPlanRevisionId`, `reason`, `fitSummary`, `status`, `shownAt`, `decidedAt`, `completedAt`, `createdAt`, and `updatedAt`.

Modeling guidance:

- Keep catalog recipe records separate from user-specific recommendation status.
- Store recipe macro values as estimates and label them as such in UI.
- Normalize enums where useful: `mealType` such as breakfast, lunch, dinner, snack; recommendation `status` such as pending, accepted, dismissed, completed; recipe `status` such as active, archived.
- Use structured arrays or JSON payloads only where schemas are owned and validated, especially ingredients and preparation steps.
- Index frequent lookups: recipe status, meal type/tags where practical, user recommendation status, `userId`, `recipeId`, and `relatedNutritionPlanRevisionId`.
- Restrictions and allergies need clear matching semantics before implementation: incompatible metadata should block recommendation, while preference tags should influence ranking but not block unless configured as hard constraints.

## API / Contract Expectations

Shared contracts in `packages/types` should add:

- Recipe schemas for list/detail responses and filter query inputs.
- Recipe macro estimate and ingredient schemas with explicit units where possible.
- Recommendation schemas for list, create/propose, decision, and completion responses.
- Proposal target/intent extensions for recipe recommendations, for example `targetDomain: "recipe"` and an intent such as `recommend_recipes`.
- AI output schema for recipe recommendation proposals that references existing recipe IDs or provides candidate recipe data for backend validation.

Backend API expectations:

- `GET /recipes` lists active catalog recipes with filters for meal type, tags, restrictions, and macro ranges.
- `GET /recipes/:id` returns a recipe detail record.
- `GET /recipes/recommendations` lists current user recommendations and their statuses.
- `POST /recipes/recommendations/generate` may generate rule-based recommendations from active nutrition revision and catalog metadata, or delegate through the AI proposal path depending on implementation choice.
- `PATCH /recipes/recommendations/:id/status` accepts, dismisses, or completes a recommendation without changing nutrition targets.
- Existing proposal decision endpoints should apply accepted recipe proposals through a recipe domain service, not by direct repository writes from the AI layer.

## AI Proposal Flow Expectations

The AI can participate in two safe ways:

1. Explain or rank existing catalog recipes against structured context and return a typed recipe recommendation proposal.
2. Suggest that nutrition targets may need adjustment, but only as a separate nutrition proposal using the existing nutrition revision flow.

Recipe recommendation proposals should contain:

- Recipe IDs or validated candidate recipe payloads.
- The nutrition plan revision used for fit evaluation.
- Per-recipe rationale grounded in macro estimate, meal type, preferences, restrictions, and tags.
- Compatibility metadata showing which restrictions were checked.
- Safe copy that avoids diagnosis, treatment, or medical certainty.

The backend should validate that proposed recipes exist or can be accepted into the catalog, that they do not conflict with hard restrictions/allergies, and that the authenticated user owns the related nutrition plan revision. Accepted recipe proposals should create recommendation records and return an applied reference such as `recipe_recommendation:<id>`.

## UI Expectations

The web Recipes surface should include:

- Navigation entry from the existing app shell.
- Empty state when no recipes or no active nutrition plan exists.
- Recipe list cards with meal type, estimated calories/macros, tags, restriction/allergen indicators, and prep time.
- Recipe detail view or expandable card with ingredients, preparation summary, servings, macro estimate, and compatibility notes.
- Recommended recipes section tied to the active nutrition revision.
- Recommendation rationale that explains fit without overclaiming precision.
- Actions to accept/save, dismiss, and mark completed.
- Clear copy that accepting a recipe does not change nutrition targets.
- Loading, error, and unauthenticated states consistent with existing Training and Nutrition surfaces.

The Nutrition tab can link to recommended recipes but should continue reading targets from the active nutrition revision. It should not become the recipe source of truth.

## Safety / Privacy Constraints

- Do not collect or infer medical allergies beyond user-provided restrictions/allergies in structured state.
- Treat allergies and hard restrictions as safety filters; do not recommend incompatible recipes.
- Avoid medical treatment claims such as recipes curing, treating, preventing, or managing diseases.
- Keep language framed around wellness, preferences, training goals, and approximate nutrition fit.
- Do not log sensitive health context, raw AI prompts containing private data, or private recipe decisions.
- Do not use health documents or device-derived data for recipe personalization unless those later phases add explicit consent.
- Recipe macro estimates should be presented as estimates, not guaranteed nutrition facts.

## Risks

- The phase can expand into full meal planning; keep the first implementation to catalog, recommendations, and recommendation status.
- Restriction/allergy metadata can be ambiguous; implementation needs explicit hard-filter semantics and tests.
- AI may overstate nutrition precision or health benefits; safety checks and copy constraints must be applied to recipe rationale.
- Recipe proposals could accidentally reuse nutrition proposal paths; tests must prove recipe acceptance does not create nutrition revisions or mutate targets.
- Catalog seeding and source attribution need a clear policy before adding nontrivial recipe content.
- Macro matching may be poor without serving-size normalization; start with simple estimates and transparent UI labels.

## Dependencies

- Phase 6 nutrition plan/revision model and active nutrition read APIs.
- Existing chat and proposal persistence/decision flow.
- Shared Zod contract package for API and AI output validation.
- Drizzle schema/migration workflow in `packages/db`.
- Web app shell and TanStack Query API patterns.
- Product decision on initial catalog source: hand-curated seed data, admin-created recipes, or backend-validated AI candidates.

## Open Questions

- Should Phase 7 include an admin or developer-only recipe creation surface, or should the first catalog be seeded through migrations/fixtures?
- Are allergies represented separately from dietary restrictions, and which profile or nutrition revision field is authoritative for hard filters?
- Should accepted recommendations mean "saved for later" or "selected for an upcoming meal" in the first UI?
- Should recipe completion feed Today adherence in this phase or wait for a later Today/Nutrition integration pass?
- Are user-created recipes in scope, or only curated catalog entries?
- Should AI be allowed to propose new recipe candidates, or only recommend existing catalog recipes for the first pass?

## Proposed Implementation Sequence

1. Extend product contracts with recipe, recipe filter, recommendation, and recipe proposal schemas.
2. Add Drizzle schema and migration for `recipes` and `user_recipe_recommendations`, including indexes for catalog filtering and user recommendation reads.
3. Build a NestJS recipes module with repository, service, controller, ownership checks, restriction filtering, and recommendation status updates.
4. Extend proposal enums, validation, and apply services for recipe recommendation proposals while proving nutrition revisions are untouched.
5. Add web API helpers, query keys, Recipes route/navigation, recipe cards, recommendation states, and decision actions.
6. Add focused tests for contracts, filtering, restriction/allergy exclusion, proposal lifecycle, no-op rejected proposals, and no nutrition target mutation.
7. Seed or otherwise provide a minimal active recipe catalog for local verification.
8. Run API/web validation and verify the Recipes surface with an active nutrition plan and at least one incompatible restriction case.
