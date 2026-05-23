import { describe, expect, it } from "vitest";
import { resolveWorkoutPlanProposalForApply } from "./workout-plan-resolver.js";

describe("resolveWorkoutPlanProposalForApply", () => {
  it("persists pending exercises and replaces refs with catalog ids", async () => {
    let createInput: { name: string; userId: string | null } | undefined;

    const resolved = await resolveWorkoutPlanProposalForApply(
      {
        findOrCreateExercise: async (input: { name: string; userId: string | null }) => {
          createInput = input;
          return {
            id: "d1000001-0000-4000-8000-000000000099",
            name: input.name,
            normalizedName: input.name.toLowerCase(),
            aliases: [],
            primaryMuscles: ["back"],
            secondaryMuscles: [],
            equipment: ["resistance_band"],
            movementPatterns: ["pull"],
            difficulty: "beginner",
            instructions: ["Pull with control."],
            safetyNotes: ["Use a light band."],
            source: "ai_generated",
            validationStatus: "pending_validation",
            status: "active",
            userId: input.userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        },
      } as never,
      "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
      {
        title: "Strength base",
        summary: "Swap in a band option.",
        days: [
          {
            weekday: "monday",
            focus: "Strength",
            exercises: [
              {
                pendingExerciseRef: "band-pull-apart",
                snapshot: {
                  name: "Band Pull-Apart",
                  primaryMuscles: ["back"],
                  equipment: ["resistance_band"],
                },
                sets: 3,
                reps: "12",
              },
            ],
          },
        ],
        notes: [],
        pendingExercises: {
          "band-pull-apart": {
            name: "Band Pull-Apart",
            aliases: [],
            primaryMuscles: ["back"],
            secondaryMuscles: [],
            equipment: ["resistance_band"],
            movementPatterns: ["pull"],
            difficulty: "beginner",
            instructions: ["Pull the band apart with control."],
            safetyNotes: ["Use a light band."],
            source: "ai_generated",
          },
        },
      },
    );

    expect(createInput?.name).toBe("Band Pull-Apart");
    expect(resolved.days[0]?.exercises[0]).toMatchObject({
      exerciseId: "d1000001-0000-4000-8000-000000000099",
    });
    expect(
      (resolved.days[0]?.exercises[0] as { pendingExerciseRef?: string }).pendingExerciseRef,
    ).toBeUndefined();
  });
});
