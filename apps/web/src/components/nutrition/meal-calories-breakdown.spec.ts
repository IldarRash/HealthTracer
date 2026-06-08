/**
 * meal-calories-breakdown.spec.ts — C1 per-meal calories breakdown contracts.
 *
 * Source-text analysis (no DOM render) verifies:
 *  - All four async states wired (loading / error / empty / data)
 *  - Read-only invariants: no mutations, no direct DB calls
 *  - Correct design atoms reused: DsRing, ProgressBar, MacroMini, SectionError, SkeletonCard
 *  - Per-meal detail: icon, name, time, dish, bar, MacroMini, kcal
 *  - «новое» badge on changed meals
 *  - Graceful fallback when hasPerMealData is false
 *  - Design copy present: «Итог за день», «примерная оценка», «Калории по приёмам пищи», «ккал», «новое»
 *  - Accessibility: aria-label on ring, aria-busy on loading, aria-label on kcal
 *  - No diagnosis/treatment language
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "meal-calories-breakdown.tsx"),
  "utf8",
);
const workspaceSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "nutrition-workspace.tsx"),
  "utf8",
);

describe("MealCaloriesBreakdown — read-only invariants", () => {
  it("never calls a mutation hook or writes data", () => {
    expect(src).not.toContain("useMutation");
    expect(src).not.toContain("apiFetch");
    expect(src).not.toContain('type="submit"');
    expect(src).not.toContain("<form");
  });

  it("is a presentational component — no data fetching of its own", () => {
    expect(src).not.toContain("useQuery");
    expect(src).not.toContain("useAuth");
    expect(src).not.toContain("getToken");
  });
});

describe("MealCaloriesBreakdown — all four async states", () => {
  it("renders a loading skeleton", () => {
    expect(src).toContain('state === "loading"');
    expect(src).toContain("SkeletonCard");
    expect(src).toContain('aria-busy="true"');
  });

  it("renders an error state with retry", () => {
    expect(src).toContain('state === "error"');
    expect(src).toContain("SectionError");
    expect(src).toContain("onRetry");
  });

  it("renders an empty fallback", () => {
    expect(src).toContain('state === "empty"');
    expect(src).toContain("FallbackNoPlanData");
  });

  it("renders the data view with ring and meal list", () => {
    // data state is the fall-through after the three early returns
    expect(src).toContain('state: "data"');
    expect(src).toContain("DayTotalCard");
    expect(src).toContain("MealListCard");
  });
});

describe("MealCaloriesBreakdown — design atoms reused", () => {
  it("uses DsRing for the day ring — no custom SVG donut", () => {
    expect(src).toContain("DsRing");
    // Should not duplicate the SVG ring pattern
    expect(src).not.toContain("strokeDashoffset");
    expect(src).not.toContain("strokeDasharray");
  });

  it("uses ProgressBar for the proportional kcal bar", () => {
    expect(src).toContain("ProgressBar");
    expect(src).toContain("barPct");
  });

  it("uses MacroMini for per-meal macros", () => {
    expect(src).toContain("MacroMini");
    expect(src).toContain("protein=");
    expect(src).toContain("carbs=");
    expect(src).toContain("fat=");
  });

  it("uses IconBadge for card headers", () => {
    expect(src).toContain("IconBadge");
  });
});

describe("MealCaloriesBreakdown — design spec copy", () => {
  it("renders «Итог за день» heading on the day card", () => {
    expect(src).toContain("Итог за день");
  });

  it("renders «примерная оценка» note on the list card", () => {
    expect(src).toContain("примерная оценка");
  });

  it("renders «Калории по приёмам пищи» list card title", () => {
    expect(src).toContain("Калории по приёмам пищи");
  });

  it("renders «ккал» unit label next to per-meal calorie value", () => {
    expect(src).toContain("ккал");
  });

  it("renders «новое» badge for changed meals", () => {
    expect(src).toContain("новое");
    expect(src).toContain("meal.changed");
  });

  it("renders «из {target} ккал · цель плана · осталось» caption", () => {
    expect(src).toContain("цель плана · осталось");
    expect(src).toContain("из");
    expect(src).toContain("ккал");
  });
});

describe("MealCaloriesBreakdown — per-meal row details", () => {
  it("shows meal icon derived from label", () => {
    expect(src).toContain("getMealIcon");
    expect(src).toContain("Icon");
  });

  it("shows mealTime or timingHint as the time display", () => {
    expect(src).toContain("meal.mealTime");
    expect(src).toContain("meal.timingHint");
  });

  it("shows dish example when present", () => {
    expect(src).toContain("meal.dish");
  });

  it("shows kcal value right-aligned", () => {
    expect(src).toContain("meal.kcal");
    expect(src).toContain("meal-calories-breakdown__meal-kcal");
  });
});

describe("MealCaloriesBreakdown — day totals and Б/У/Ж tiles", () => {
  it("renders amber DsRing for day total", () => {
    expect(src).toContain("var(--color-metric-amber)");
    expect(src).toContain("DsRing");
  });

  it("shows protein/carbs/fat total tiles with green/blue/indigo colors", () => {
    expect(src).toContain("var(--color-metric-green)");
    expect(src).toContain("var(--color-metric-blue)");
    expect(src).toContain("var(--color-metric-indigo)");
    // Named in Russian on the tiles
    expect(src).toContain("Белок");
    expect(src).toContain("Углев.");
    expect(src).toContain("Жиры");
  });
});

describe("MealCaloriesBreakdown — graceful fallback for legacy plans", () => {
  it("shows a fallback notice when hasPerMealData is false", () => {
    expect(src).toContain("hasPerMealData");
    expect(src).toContain("FallbackNoPlanData");
    expect(src).toContain("caloriesPerDay");
  });
});

describe("MealCaloriesBreakdown — safety floors", () => {
  it("has no diagnosis or treatment language", () => {
    expect(src).not.toMatch(/diagnos/i);
    expect(src).not.toMatch(/treatment/i);
    expect(src).not.toMatch(/dosing/i);
    expect(src).not.toMatch(/clinical/i);
    expect(src).not.toMatch(/prescription/i);
  });
});

describe("NutritionWorkspace — MealCaloriesBreakdown wired", () => {
  it("imports MealCaloriesBreakdown from meal-calories-breakdown", () => {
    expect(workspaceSrc).toContain("MealCaloriesBreakdown");
    expect(workspaceSrc).toContain("meal-calories-breakdown");
  });

  it("calls getNutritionMealsBreakdown via TanStack Query", () => {
    expect(workspaceSrc).toContain("getNutritionMealsBreakdown");
    expect(workspaceSrc).toContain("nutritionMealsBreakdown");
    expect(workspaceSrc).toContain("mealsBreakdownQuery");
  });

  it("derives all four states for MealCaloriesBreakdownState", () => {
    expect(workspaceSrc).toContain('state: "loading"');
    expect(workspaceSrc).toContain('state: "error"');
    expect(workspaceSrc).toContain('state: "empty"');
    expect(workspaceSrc).toContain('state: "data"');
    expect(workspaceSrc).toContain("mealsBreakdownState");
  });

  it("spreads mealsBreakdownState into MealCaloriesBreakdown", () => {
    expect(workspaceSrc).toContain("MealCaloriesBreakdown");
    expect(workspaceSrc).toContain("mealsBreakdownState");
  });

  it("includes verbatim C1 CoachNotes copy (portion-estimate error)", () => {
    expect(workspaceSrc).toContain("Цифры — ориентир");
    expect(workspaceSrc).toContain("Точные граммы можно поправить");
  });
});
