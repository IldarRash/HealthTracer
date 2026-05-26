import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workspaceSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "nutrition-workspace.tsx"),
  "utf8",
);

const recipePanelSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../recipes/recipe-recommendations-panel.tsx"),
  "utf8",
);

const recipeCardSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../recipes/recipe-recommendation-card.tsx"),
  "utf8",
);

const logDraftSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../recipes/recipe-nutrition-log-draft.tsx"),
  "utf8",
);

describe("Nutrition recipe recommendations placement", () => {
  it("embeds recipe recommendations in the nutrition workspace without top-level nav", () => {
    expect(workspaceSource).toContain("RecipeRecommendationsPanel");
    expect(workspaceSource).toContain('titleId="nutrition-recipe-recommendations"');
    expect(workspaceSource).toContain("does not change your targets");
    expect(workspaceSource).not.toContain('href="/recipes"');
  });

  it("scopes recommendation query invalidation to recipe keys only", () => {
    expect(recipePanelSource).toContain("apiQueryKeys.recipeRecommendations");
    expect(recipePanelSource).not.toContain("nutritionRevisions");
    expect(recipePanelSource).not.toContain("nutritionActive");
  });

  it("shows confidence, provenance, and approximate estimate copy on cards", () => {
    expect(recipeCardSource).toContain("RECIPE_CONFIDENCE_LABELS");
    expect(recipeCardSource).toContain("formatRecipeProvenanceMeta");
    expect(recipeCardSource).toContain("formatMacroEstimateSummary");
    expect(recipeCardSource).toContain("recipeConfidenceNotice");
  });

  it("exposes save, dismiss, complete, and log actions without target mutation affordances", () => {
    expect(recipeCardSource).toContain("Save recipe");
    expect(recipeCardSource).toContain("Dismiss");
    expect(recipeCardSource).toContain("Mark completed");
    expect(recipeCardSource).toContain("Log this recipe");
    expect(recipeCardSource).not.toContain("adjust_nutrition");
    expect(recipeCardSource).not.toContain("macro target");
    expect(recipePanelSource).toContain("restriction targets");
  });

  it("routes recipe logging through persisted proposal draft with inline accept", () => {
    expect(logDraftSource).toContain("buildRecipeNutritionIncidentProposal");
    expect(logDraftSource).toContain("parseNutritionIncidentProposalPayload");
    expect(logDraftSource).toContain("getNutritionIncidentAcceptBlockReason");
    expect(logDraftSource).toContain("buildNutritionIncidentAcceptPayload");
    expect(logDraftSource).toContain("useInlineProposalActions");
    expect(logDraftSource).toContain("Log food entry");
    expect(logDraftSource).toContain("nutritionConfidenceNotice");
    expect(logDraftSource).toContain("disabled={!canConfirm || isActionPending}");
    expect(logDraftSource).toContain('decisionMutation.mutate("accept")');
    expect(logDraftSource).toContain("/chat?threadId=");
    expect(logDraftSource).toContain("Nothing is saved until you");
    expect(logDraftSource).not.toContain("Confirm in Chat");
    expect(logDraftSource).not.toContain("adjust_nutrition");
    expect(logDraftSource).not.toContain("nutritionRevisions");
  });
});
