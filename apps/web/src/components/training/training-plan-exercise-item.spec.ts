import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const itemSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "training-plan-exercise-item.tsx"),
  "utf8",
);

describe("TrainingPlanExerciseItem catalog rendering", () => {
  it("renders prescription lines and shared catalog metadata primitives", () => {
    expect(itemSource).toContain("resolvePlanExerciseCatalogMetadata");
    expect(itemSource).toContain("formatPlanExercisePrescriptionDetailLines");
    expect(itemSource).toContain("DetailLineList");
    expect(itemSource).toContain("ExerciseCatalogDetails");
    expect(itemSource).toContain("training-exercise-prescription-details");
  });

  it("shows catalog details only when metadata resolves", () => {
    expect(itemSource).toContain("{catalog ? <ExerciseCatalogDetails catalog={catalog} /> : null}");
    expect(itemSource).toContain("formatExerciseLabel");
  });

  it("avoids diagnosis or treatment language in component copy", () => {
    expect(itemSource).not.toMatch(/diagnos/i);
    expect(itemSource).not.toMatch(/treatment protocol/i);
  });
});
