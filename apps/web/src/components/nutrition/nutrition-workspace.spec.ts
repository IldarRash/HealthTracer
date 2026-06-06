/**
 * nutrition-workspace.spec.ts — structural contracts for the redesigned Nutrition screen.
 *
 * Source-text analysis (no DOM render) verifies:
 *  - read-only invariants (no mutations, chat/today links)
 *  - all 5 UI states wired (loading / error / empty / done / recipe)
 *  - AdherencePanel's 4 own sub-states (data / loading / error / empty)
 *  - dark-world primitives used (ChangeBanner, DailyExecCard, RevisionFacts, etc.)
 *  - recipe view manages local state without plan mutation
 *
 * Updated from old plan-view assertions (PlanViewLayout, PlanViewGrid, etc.)
 * to match the redesigned dark-world component set — per the Workouts precedent.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workspaceSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "nutrition-workspace.tsx"),
  "utf8",
);

describe("NutritionWorkspace read-only contracts", () => {
  it("does not expose adherence mutation controls", () => {
    expect(workspaceSource).not.toContain("useMutation");
    expect(workspaceSource).not.toContain("upsertTodayNutritionAdherence");
    expect(workspaceSource).not.toContain('type="checkbox"');
    expect(workspaceSource).not.toContain("Save note");
    expect(workspaceSource).not.toContain("<textarea");
    expect(workspaceSource).not.toContain('type="number"');
    expect(workspaceSource).not.toContain("JSON.stringify");
  });

  it("routes logging to Today and plan changes to Chat", () => {
    expect(workspaceSource).toContain('href="/today"');
    expect(workspaceSource).toContain('href="/chat"');
    expect(workspaceSource).toContain("Log in Today");
    expect(workspaceSource).toContain("Logging happens on Today");
    expect(workspaceSource).not.toContain("acceptProposal");
    expect(workspaceSource).not.toContain("applyProposal");
  });

  it("renders ChangeBanner on both done and empty states", () => {
    expect(workspaceSource).toContain("ChangeBanner");
    expect(workspaceSource).not.toContain("ChangeViaChatNotice");
  });

  it("shows revision context via RevisionFacts and RevisionHistoryDark", () => {
    expect(workspaceSource).toContain("RevisionFacts");
    expect(workspaceSource).toContain("RevisionHistoryDark");
    expect(workspaceSource).toContain("formatPlanRevisionSource");
    expect(workspaceSource).toContain("formatPlanRevisionTimestamp");
    expect(workspaceSource).not.toContain("ai_proposal");
  });

  it("uses dark-world LoadingScreen for the loading state", () => {
    expect(workspaceSource).toContain("LoadingScreen");
    expect(workspaceSource).toContain("Loading your nutrition plan");
    expect(workspaceSource).toContain('layout="plan"');
  });

  it("wires all five screen states: loading, error, empty, done, recipe", () => {
    expect(workspaceSource).toContain("isLoading");
    expect(workspaceSource).toContain("isError");
    expect(workspaceSource).toContain("ErrorState");
    expect(workspaceSource).toContain("ActiveNutritionHeader");
    expect(workspaceSource).toContain("RecipeDetail");
    expect(workspaceSource).toContain("selectedRecipeId");
  });

  it("manages recipe view with local state only — no URL or plan mutations", () => {
    expect(workspaceSource).toContain("useState");
    expect(workspaceSource).toContain("setSelectedRecipeId");
    expect(workspaceSource).toContain("onBack");
    expect(workspaceSource).not.toContain("useRouter");
    expect(workspaceSource).not.toContain("router.push");
    expect(workspaceSource).not.toContain("useMutation");
  });

  it("renders RecipeIdeas with MediaCard 4-col grid", () => {
    expect(workspaceSource).toContain("MediaCard");
    expect(workspaceSource).toContain("RecipeIdeas");
    expect(workspaceSource).toContain("onOpenRecipe");
    expect(workspaceSource).toContain("repeat(4, 1fr)");
  });

  it("wires AdherencePanel's four sub-states inside the done screen", () => {
    expect(workspaceSource).toContain("AdherencePanel");
    expect(workspaceSource).toContain('state="loading"');
    expect(workspaceSource).toContain('state="error"');
    expect(workspaceSource).toContain('state="empty"');
    expect(workspaceSource).toContain('state="data"');
    expect(workspaceSource).toContain("SkeletonCard");
    expect(workspaceSource).toContain("SectionError");
  });

  it("shows NutrientGoals and MealStructure in the two-column layout", () => {
    expect(workspaceSource).toContain("NutrientGoals");
    expect(workspaceSource).toContain("MealStructure");
    expect(workspaceSource).toContain("caloriesPerDay");
    expect(workspaceSource).toContain("proteinGrams");
    expect(workspaceSource).toContain("mealStructure");
  });

  it("renders PrefsCard from plan payload preferences/restrictions/allergies", () => {
    expect(workspaceSource).toContain("PrefsCard");
    expect(workspaceSource).toContain("payload.preferences");
    expect(workspaceSource).toContain("payload.restrictions");
    expect(workspaceSource).toContain("payload.allergies");
  });

  it("renders CoachNotes when plan payload has notes", () => {
    expect(workspaceSource).toContain("CoachNotes");
    expect(workspaceSource).toContain("payload.notes");
  });

  it("uses DailyExecCard with green color routing to Today", () => {
    expect(workspaceSource).toContain("DailyExecCard");
    expect(workspaceSource).toContain('color="green"');
    expect(workspaceSource).toContain('todayHref="/today"');
  });

  it("RecipeDetail uses real recipe data — no hardcoded placeholder steps or ingredients", () => {
    expect(workspaceSource).toContain("RecipeDetail");
    expect(workspaceSource).toContain("Back to plan");
    expect(workspaceSource).not.toContain("RECIPE_STEPS");
    expect(workspaceSource).not.toContain("RECIPE_INGREDIENTS");
    expect(workspaceSource).toContain("recipe.preparationSteps");
    expect(workspaceSource).toContain("recipe.ingredients");
    expect(workspaceSource).toContain("recipe.macroEstimates");
    expect(workspaceSource).toContain("PlayBadge");
    expect(workspaceSource).toContain("Log in Today");
  });

  it("uses buildAdherenceState from nutrition-ui-state to drive panel data", () => {
    expect(workspaceSource).toContain("buildAdherenceState");
    expect(workspaceSource).toContain("getTodayNutritionAdherence");
    expect(workspaceSource).not.toContain("upsertTodayNutritionAdherence");
  });

  it("avoids diagnosis or treatment language in component copy", () => {
    expect(workspaceSource).not.toMatch(/diagnos/i);
    expect(workspaceSource).not.toMatch(/treatment protocol/i);
    expect(workspaceSource).not.toMatch(/clinical/i);
  });
});
