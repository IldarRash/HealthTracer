import { describe, expect, it } from "vitest";
import {
  buildExerciseDedupeKey,
  buildExerciseDedupeKeyFromName,
  createExerciseInputSchema,
  exerciseListQuerySchema,
  exerciseSchema,
  normalizeExerciseName,
} from "./exercises.js";

describe("exercise catalog contracts", () => {
  it("normalizes exercise names for dedupe", () => {
    expect(normalizeExerciseName("  Push-Up  ")).toBe("push up");
    expect(normalizeExerciseName("Barbell Bench Press!!!")).toBe("barbell bench press");
  });

  it("builds stable dedupe keys from equipment and primary muscles", () => {
    const first = buildExerciseDedupeKeyFromName({
      name: "Dumbbell Bench Press",
      equipment: ["bench", "dumbbell"],
      primaryMuscles: ["chest"],
    });
    const second = buildExerciseDedupeKey({
      normalizedName: "dumbbell bench press",
      equipment: ["dumbbell", "bench"],
      primaryMuscles: ["chest"],
    });

    expect(first).toBe(second);
    expect(first).toBe("dumbbell bench press::bench|dumbbell::chest");
  });

  it("validates create exercise input and requires safety notes", () => {
    expect(() =>
      createExerciseInputSchema.parse({
        name: "Tempo Split Squat",
        primaryMuscles: ["quads", "glutes"],
        secondaryMuscles: ["hamstrings"],
        equipment: ["dumbbell", "bench"],
        movementPatterns: ["lunge"],
        difficulty: "intermediate",
        instructions: ["Lower under control for three seconds."],
        safetyNotes: ["Stop if knee discomfort increases."],
        source: "ai_generated",
      }),
    ).not.toThrow();
  });

  it("validates exercise records and list query filters", () => {
    expect(() =>
      exerciseSchema.parse({
        id: "b1000001-0000-4000-8000-000000000001",
        name: "Barbell Bench Press",
        normalizedName: "barbell bench press",
        aliases: ["bench press"],
        primaryMuscles: ["chest"],
        secondaryMuscles: ["triceps", "shoulders"],
        equipment: ["barbell", "bench"],
        movementPatterns: ["push"],
        difficulty: "intermediate",
        instructions: ["Lower with control."],
        safetyNotes: ["Use a spotter when needed."],
        source: "system_seed",
        validationStatus: "validated",
        status: "active",
        userId: null,
        createdAt: "2026-05-22T12:00:00.000Z",
        updatedAt: "2026-05-22T12:00:00.000Z",
      }),
    ).not.toThrow();

    expect(
      exerciseListQuerySchema.parse({
        search: "squat",
        equipment: ["barbell"],
        primaryMuscle: "quads",
        includeUserCreated: "false",
      }),
    ).toEqual({
      search: "squat",
      equipment: ["barbell"],
      primaryMuscle: "quads",
      includeUserCreated: false,
    });
  });
});
