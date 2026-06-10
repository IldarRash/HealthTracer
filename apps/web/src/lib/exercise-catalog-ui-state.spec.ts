import { describe, expect, it } from "vitest";
import type { WorkoutPlanExercise, WorkoutSessionExercise } from "@health/types";
import {
  buildExerciseCatalogDetailView,
  buildExerciseExecutionUpdatePayload,
  canSubmitExerciseExecutionUpdate,
  exerciseFeedbackToFormState,
  formatExerciseFeedbackSummary,
  formatPlanExercisePrescriptionDetailLines,
  getExerciseMediaFallbackLabel,
  resolvePlanExerciseCatalogMetadata,
  resolveSessionExerciseCatalogMetadata,
} from "./exercise-catalog-ui-state.js";

const catalogExercise: WorkoutPlanExercise = {
  exerciseId: "b1000001-0000-4000-8000-000000000047",
  snapshot: {
    name: "Back squat",
    primaryMuscles: ["quads", "glutes"],
    equipment: ["barbell"],
  },
  sets: 4,
  reps: "5",
  recommendedLoadGuidance: "RPE 8",
  restBetweenSetsSeconds: 90,
  catalog: {
    source: "catalog",
    name: "Back squat",
    primaryMuscles: ["quads", "glutes"],
    equipment: ["barbell"],
    movementPatterns: ["squat"],
    modalities: ["strength"],
    difficulty: "intermediate",
    instructions: ["Brace core before descending."],
    safetyNotes: ["Stop if knee pain increases."],
    media: { refs: [], fallbackLabel: "Demonstration coming soon" },
  },
};

const sessionExercise = (
  overrides: Partial<WorkoutSessionExercise> = {},
): WorkoutSessionExercise => ({
  id: "78d40655-b4b5-47b3-b28e-470192e05f04",
  exerciseId: catalogExercise.exerciseId ?? null,
  prescription: {
    snapshot: catalogExercise.snapshot,
    sets: 4,
    reps: "5",
    recommendedLoadGuidance: "RPE 8",
    restBetweenSetsSeconds: 90,
  },
  execution: { status: "planned" },
  catalog: catalogExercise.catalog,
  ...overrides,
});

describe("exercise catalog UI state", () => {
  it("resolves catalog metadata from plan and session exercises", () => {
    expect(resolvePlanExerciseCatalogMetadata(catalogExercise)?.source).toBe("catalog");
    // B6 removal: string exercise form removed; legacy object form still returns null (no catalog).
    expect(resolvePlanExerciseCatalogMetadata({ name: "Goblet squat" })).toBeNull();
    expect(
      resolvePlanExerciseCatalogMetadata({
        snapshot: { name: "Legacy press" },
        sets: 3,
        reps: "8",
      })?.source,
    ).toBe("snapshot");

    expect(resolveSessionExerciseCatalogMetadata(sessionExercise()).name).toBe("Back squat");
  });

  it("builds catalog detail sections and media fallback labels", () => {
    const view = buildExerciseCatalogDetailView(catalogExercise.catalog!);

    expect(view.sections.some((section) => section.label === "Equipment")).toBe(true);
    expect(view.instructions).toContain("Brace core before descending.");
    expect(view.safetyNotes).toContain("Stop if knee pain increases.");
    expect(getExerciseMediaFallbackLabel(catalogExercise.catalog!)).toBe(
      "Demonstration coming soon",
    );
    // No renderable images in the fixture → mediaImages empty, fallback shown.
    expect(view.mediaImages).toHaveLength(0);
    expect(view.mediaFallbackLabel).toBe("Demonstration coming soon");
  });

  it("populates mediaImages from image refs with URLs, capped at 3", () => {
    const catalogWithMedia = {
      ...catalogExercise.catalog!,
      media: {
        refs: [
          { kind: "image" as const, url: "https://example.com/img1.gif", label: "Start" },
          { kind: "image" as const, url: "https://example.com/img2.gif", label: "End" },
          { kind: "video" as const, url: "https://example.com/v.mp4" },
          { kind: "image" as const, url: "https://example.com/img3.gif" },
          // 4th image beyond cap of 3 — should be excluded
          { kind: "image" as const, url: "https://example.com/img4.gif" },
        ],
        fallbackLabel: "Demonstration coming soon",
      },
    };
    const view = buildExerciseCatalogDetailView(catalogWithMedia);
    // Only image refs with URLs, max 3
    expect(view.mediaImages).toHaveLength(3);
    expect(view.mediaImages[0]).toEqual({ url: "https://example.com/img1.gif", label: "Start" });
    expect(view.mediaImages[1]).toEqual({ url: "https://example.com/img2.gif", label: "End" });
    expect(view.mediaImages[2]).toEqual({ url: "https://example.com/img3.gif", label: undefined });
    // fallback suppressed when images are present
    expect(view.mediaFallbackLabel).toBeNull();
  });

  it("excludes image refs that have no URL", () => {
    const catalogWithNoUrlRef = {
      ...catalogExercise.catalog!,
      media: {
        refs: [{ kind: "image" as const, label: "No url yet" }],
        fallbackLabel: "Demonstration coming soon",
      },
    };
    const view = buildExerciseCatalogDetailView(catalogWithNoUrlRef);
    expect(view.mediaImages).toHaveLength(0);
    expect(view.mediaFallbackLabel).toBe("Demonstration coming soon");
  });

  it("formats plan prescription detail lines with rest guidance", () => {
    expect(formatPlanExercisePrescriptionDetailLines(catalogExercise)).toEqual([
      "4 sets × 5 reps",
      "Load guidance: RPE 8",
      "1m 30s rest",
    ]);
  });

  it("builds bounded execution update payloads for status and feedback", () => {
    const form = exerciseFeedbackToFormState({
      status: "planned",
      perceivedEffort: 7,
      perceivedDifficulty: 6,
      discomfortFlag: true,
      notes: "Felt solid.",
      actualReps: "5",
      actualWeightKg: 80,
    });

    expect(
      buildExerciseExecutionUpdatePayload({
        form,
        status: "completed",
      }),
    ).toMatchObject({
      status: "completed",
      perceivedEffort: 7,
      perceivedDifficulty: 6,
      discomfortFlag: true,
      notes: "Felt solid.",
      actualReps: "5",
      actualWeightKg: 80,
    });

    expect(
      canSubmitExerciseExecutionUpdate({
        form: exerciseFeedbackToFormState({ status: "planned" }),
        status: "skipped",
      }),
    ).toBe(true);
  });

  it("rejects invalid bounded feedback values", () => {
    expect(
      buildExerciseExecutionUpdatePayload({
        form: {
          ...exerciseFeedbackToFormState({ status: "planned" }),
          perceivedEffort: "12",
        },
        status: "completed",
      }),
    ).toBeNull();
  });

  it("formats execution feedback summaries for logged exercises", () => {
    expect(
      formatExerciseFeedbackSummary({
        status: "completed",
        actualReps: "5",
        actualWeightKg: 80,
        perceivedEffort: 8,
        perceivedDifficulty: 7,
        discomfortFlag: true,
        notes: "Stable tempo.",
      }),
    ).toBe("5 · 80 kg · Effort 8/10 · Difficulty 7/10 · Discomfort noted · Stable tempo.");
  });
});
