import { describe, expect, it } from "vitest";
import {
  collectHardFilters,
  isRecipeCompatibleWithHardFilters,
  scoreRecipeMacroFit,
} from "./recipe-compatibility.js";

describe("recipe compatibility", () => {
  it("blocks recipes that conflict with dairy allergies", () => {
    const filters = collectHardFilters([], ["dairy"], []);
    const compatible = isRecipeCompatibleWithHardFilters(
      {
        allergenTags: ["dairy"],
        restrictionTags: ["contains_dairy"],
      },
      filters,
    );

    expect(compatible).toBe(false);
  });

  it("blocks recipes that conflict with vegan restrictions", () => {
    const filters = collectHardFilters(["vegan"], [], []);
    const compatible = isRecipeCompatibleWithHardFilters(
      {
        allergenTags: [],
        restrictionTags: ["contains_fish"],
      },
      filters,
    );

    expect(compatible).toBe(false);
  });

  it("does not treat matching restriction tags as conflicts", () => {
    const filters = collectHardFilters(["vegan"], [], []);
    const compatible = isRecipeCompatibleWithHardFilters(
      {
        allergenTags: [],
        restrictionTags: ["vegan"],
      },
      filters,
    );

    expect(compatible).toBe(true);
  });

  it("allows compatible recipes when hard filters do not match tags", () => {
    const filters = collectHardFilters(["gluten_free"], ["peanuts"], ["low_sodium"]);
    const compatible = isRecipeCompatibleWithHardFilters(
      {
        allergenTags: ["tree_nuts"],
        restrictionTags: ["balanced"],
      },
      filters,
    );

    expect(compatible).toBe(true);
  });

  it("ranks closer macro estimates higher", () => {
    const closer = scoreRecipeMacroFit(
      { estimatedCalories: 700, proteinGrams: 45 },
      { caloriesPerDay: 2100, proteinGrams: 150 },
    );
    const farther = scoreRecipeMacroFit(
      { estimatedCalories: 1200, proteinGrams: 10 },
      { caloriesPerDay: 2100, proteinGrams: 150 },
    );

    expect(closer).toBeGreaterThan(farther);
  });
});
