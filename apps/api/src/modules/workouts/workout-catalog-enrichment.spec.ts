import { describe, expect, it } from "vitest";
import {
  enrichWorkoutPlanPayload,
  enrichWorkoutSessionExercises,
  indexExercisesById,
} from "./workout-catalog-enrichment.js";

const catalogExercise = {
  id: "b1000001-0000-4000-8000-000000000051",
  name: "Box Jump",
  normalizedName: "box jump",
  aliases: [],
  primaryMuscles: ["quads", "glutes", "calves"] as const,
  secondaryMuscles: ["core"] as const,
  equipment: ["box", "bodyweight"] as const,
  movementPatterns: ["plyometric", "squat"] as const,
  modalities: ["plyometrics", "athletic_performance"] as const,
  difficulty: "intermediate" as const,
  instructions: ["Jump onto box with soft landing."],
  safetyNotes: ["Choose a safe box height."],
  media: { refs: [], fallbackLabel: "Demonstration coming soon" },
  source: "system_seed" as const,
  validationStatus: "validated" as const,
  status: "active" as const,
  userId: null,
  createdAt: "2026-05-22T12:00:00.000Z",
  updatedAt: "2026-05-22T12:00:00.000Z",
};

describe("workout catalog enrichment", () => {
  it("enriches plan exercises from catalog metadata", () => {
    const enriched = enrichWorkoutPlanPayload(
      {
        title: "Athletic base",
        summary: "Plyo day.",
        days: [
          {
            weekday: "monday",
            focus: "Power",
            exercises: [
              {
                exerciseId: catalogExercise.id,
                snapshot: { name: "Box Jump", primaryMuscles: ["quads"], equipment: ["box"] },
                sets: 4,
                reps: "3",
              },
            ],
          },
        ],
        notes: [],
      },
      indexExercisesById([catalogExercise as never]),
    );

    expect(enriched.days[0]?.exercises[0]).toMatchObject({
      catalog: {
        source: "catalog",
        name: "Box Jump",
        modalities: ["plyometrics", "athletic_performance"],
        instructions: ["Jump onto box with soft landing."],
      },
    });
  });

  it("enriches session exercises from catalog metadata for Today payloads", () => {
    const enriched = enrichWorkoutSessionExercises(
      "78d40655-b4b5-47b3-b28e-470192e05f04",
      [
        {
          id: "a1000001-0000-4000-8000-000000000001",
          exerciseId: catalogExercise.id,
          prescription: {
            snapshot: { name: "Box Jump", primaryMuscles: ["quads"], equipment: ["box"] },
            sets: 4,
            reps: "3",
          },
          execution: { status: "planned" },
        },
      ],
      indexExercisesById([catalogExercise as never]),
    );

    expect(enriched[0]?.catalog).toMatchObject({
      source: "catalog",
      name: "Box Jump",
      safetyNotes: ["Choose a safe box height."],
      media: { fallbackLabel: "Demonstration coming soon" },
    });
  });

  it("falls back to snapshot metadata when catalog entry is missing", () => {
    const enriched = enrichWorkoutSessionExercises(
      "78d40655-b4b5-47b3-b28e-470192e05f04",
      [
        {
          id: "a1000001-0000-4000-8000-000000000001",
          exerciseId: "missing-id",
          prescription: {
            snapshot: { name: "Legacy Move", primaryMuscles: ["core"], equipment: ["bodyweight"] },
            sets: 2,
            reps: "10",
          },
          execution: { status: "planned" },
        },
      ],
      new Map(),
    );

    expect(enriched[0]?.catalog).toMatchObject({
      source: "snapshot",
      name: "Legacy Move",
      primaryMuscles: ["core"],
      media: { fallbackLabel: "Demonstration coming soon" },
    });
  });
});
