/**
 * nutrition-week-plan.spec.ts — structural contracts for the C2 week-plan grid.
 *
 * Source-text analysis (no DOM render) verifies:
 *  - read-only invariants (no mutations, CTA routes to grocery/chat)
 *  - empty state handled inside the component
 *  - loading/error states delegated to NutritionWorkspace (not inlined here)
 *  - correct grid template applied
 *  - today-row highlight tokens present
 *  - Russian copy verbatim (chips, header labels, coach note, allergy line)
 *  - no diagnosis / treatment language
 *  - NutritionWeekDay type used (from @health/types)
 *  - CoachNotes, Icon primitives reused; SectionError/SkeletonCard live in workspace
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "nutrition-week-plan.tsx"),
  "utf8",
);

const workspaceSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "nutrition-workspace.tsx"),
  "utf8",
);

// ── nutrition-week-plan.tsx contracts ──────────────────────────────

describe("NutritionWeekPlan: grid layout", () => {
  it("uses the exact grid template from the design spec", () => {
    expect(src).toContain("128px repeat(4, 1fr) 92px");
  });

  it("renders all four meal column headers with correct Russian labels", () => {
    expect(src).toContain("Завтрак");
    expect(src).toContain("Обед");
    expect(src).toContain("Перекус");
    expect(src).toContain("Ужин");
  });

  it("renders day column header 'День' and kcal column 'Σ ккал'", () => {
    expect(src).toContain("День");
    expect(src).toContain("Σ ккал");
  });

  it("uses meal icons: sun / fork / drop / moon", () => {
    expect(src).toContain('"sun"');
    expect(src).toContain('"fork"');
    expect(src).toContain('"drop"');
    expect(src).toContain('"moon"');
  });
});

describe("NutritionWeekPlan: today highlight", () => {
  it("applies green row background tint for today (rgba token)", () => {
    expect(src).toContain("rgba(25,195,125,0.06)");
  });

  it("renders 'сегодня' label for the today row", () => {
    expect(src).toContain("сегодня");
  });

  it("uses green badge background for today day chip", () => {
    expect(src).toContain("var(--color-metric-green");
  });

  it("applies green kcal color for today row", () => {
    expect(src).toContain("color-metric-green");
    expect(src).toContain("isToday");
  });
});

describe("NutritionWeekPlan: header chips", () => {
  it("renders '≈ {avg} ккал / день в среднем' chip", () => {
    expect(src).toContain("ккал / день в среднем");
  });

  it("renders 'Только просмотр' chip with lock icon", () => {
    expect(src).toContain("Только просмотр");
    expect(src).toContain('"lock"');
  });
});

describe("NutritionWeekPlan: allergy/corridor note", () => {
  it("contains verbatim allergy/corridor info line", () => {
    expect(src).toContain("Орехи — только без арахиса (аллергия учтена)");
    expect(src).toContain("коридоре ±10% от цели — это норма");
  });
});

describe("NutritionWeekPlan: CTA", () => {
  it("has 'Собрать список покупок' CTA routing to grocery screen", () => {
    expect(src).toContain("Собрать список покупок");
    expect(src).toContain("/nutrition/grocery-list");
  });
});

describe("NutritionWeekPlan: CoachNotes", () => {
  it("renders weekly-rhythm coach note about Saturday/Sunday", () => {
    expect(src).toContain("субботу");
    expect(src).toContain("воскресенье");
    expect(src).toContain("CoachNotes");
  });
});

describe("NutritionWeekPlan: empty state", () => {
  it("renders empty state when weeklyPlan is null or empty", () => {
    expect(src).toContain("Недельный план ещё не задан");
    expect(src).toContain("Открыть чат с коучем");
    expect(src).toContain("/chat");
  });
});

describe("NutritionWeekPlan: loading state", () => {
  it("loading and error states are handled by NutritionWorkspace, not this component", () => {
    // NutritionWeekPlan is a pure presentational component; the workspace owns
    // loading (LoadingScreen) and error (ErrorState / SectionError) gating before
    // rendering <NutritionWeekPlan weeklyPlan={...} />.
    expect(workspaceSrc).toContain("isLoading");
    expect(workspaceSrc).toContain("LoadingScreen");
  });
});

describe("NutritionWeekPlan: error state", () => {
  it("error state is handled by NutritionWorkspace via ErrorState", () => {
    expect(workspaceSrc).toContain("isError");
    expect(workspaceSrc).toContain("ErrorState");
  });
});

describe("NutritionWeekPlan: read-only invariants", () => {
  it("has no mutation calls or edit controls", () => {
    expect(src).not.toContain("useMutation");
    expect(src).not.toContain("applyProposal");
    expect(src).not.toContain('type="checkbox"');
    expect(src).not.toContain("<textarea");
    expect(src).not.toContain('type="number"');
  });

  it("uses NutritionWeekDay type from @health/types", () => {
    expect(src).toContain("NutritionWeekDay");
    expect(src).toContain("@health/types");
  });
});

describe("NutritionWeekPlan: safety — wellness not medical", () => {
  it("avoids diagnosis or treatment language", () => {
    expect(src).not.toMatch(/diagnos/i);
    expect(src).not.toMatch(/treatment/i);
    expect(src).not.toMatch(/clinical/i);
    expect(src).not.toMatch(/prescription/i);
  });
});

describe("NutritionWeekPlan: reuses existing UI atoms", () => {
  it("uses Icon and CoachNotes from shared UI", () => {
    expect(src).toContain('from "../ui"');
    expect(src).toContain("Icon");
    expect(src).toContain("CoachNotes");
  });
});

// ── nutrition-workspace.tsx integration ───────────────────────────

describe("NutritionWorkspace integrates NutritionWeekPlan", () => {
  it("imports NutritionWeekPlan", () => {
    expect(workspaceSrc).toContain("NutritionWeekPlan");
    expect(workspaceSrc).toContain("nutrition-week-plan");
  });

  it("renders NutritionWeekPlan in the done state with weeklyPlan from payload", () => {
    expect(workspaceSrc).toContain("payload.weeklyPlan");
    expect(workspaceSrc).toContain("<NutritionWeekPlan");
  });
});
