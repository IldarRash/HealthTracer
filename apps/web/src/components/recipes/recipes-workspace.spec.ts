/**
 * recipes-workspace.spec.ts — structural contracts for the RecipesWorkspace
 * (mounted at /recipes — catalog browse + plan-fit recommendations).
 *
 * Source-text analysis verifies:
 *  - RecipeRecommendationsPanel is mounted (panel + catalog side-by-side)
 *  - Loading / error / empty / success states for both queries
 *  - Read-only: no mutations in the workspace itself (mutations live in sub-components)
 *  - Routing: no router.push or redirect to /nutrition
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workspaceSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "recipes-workspace.tsx"),
  "utf8",
);

describe("RecipesWorkspace", () => {
  it("mounts RecipeRecommendationsPanel alongside the catalog", () => {
    expect(workspaceSource).toContain("RecipeRecommendationsPanel");
    expect(workspaceSource).toContain("activeRevision");
  });

  it("covers all async states: loading, error (nutrition), error (catalog), success", () => {
    expect(workspaceSource).toContain("isLoading");
    expect(workspaceSource).toContain("isError");
    expect(workspaceSource).toContain("LoadingState");
    expect(workspaceSource).toContain("ErrorState");
    expect(workspaceSource).toContain("EmptyState");
  });

  it("does not redirect to /nutrition — renders the real surface", () => {
    expect(workspaceSource).not.toContain('redirect("/nutrition")');
    expect(workspaceSource).not.toContain('router.push("/nutrition")');
  });

  it("uses TanStack Query for server state — no direct fetch in render", () => {
    expect(workspaceSource).toContain("useQuery");
    expect(workspaceSource).toContain("apiQueryKeys");
  });

  it("owns only the user-recipe delete mutation — recommendation mutations live in RecipeRecommendationsPanel", () => {
    expect(workspaceSource).toContain("deleteRecipe");
    expect(workspaceSource).not.toContain("updateRecipeRecommendationStatus");
    expect(workspaceSource).not.toContain("generateRecipeRecommendations");
  });

  it("renders catalog with meal-type filter and expandable recipe cards", () => {
    expect(workspaceSource).toContain("mealTypeFilter");
    expect(workspaceSource).toContain("RecipeCatalogCard");
    expect(workspaceSource).toContain("expanded");
    expect(workspaceSource).toContain("onToggle");
  });

  it("avoids diagnosis or treatment language in component copy", () => {
    expect(workspaceSource).not.toMatch(/diagnos/i);
    expect(workspaceSource).not.toMatch(/treatment protocol/i);
    expect(workspaceSource).not.toMatch(/clinical/i);
  });
});
