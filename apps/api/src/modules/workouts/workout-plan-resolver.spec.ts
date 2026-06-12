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
            modalities: ["strength"],
            difficulty: "beginner",
            instructions: ["Pull with control."],
            safetyNotes: ["Use a light band."],
            media: { refs: [], fallbackLabel: "Demonstration coming soon" },
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
            modalities: ["strength"],
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

  it("resolves a pendingExerciseRef repeated across days with ONE findOrCreateExercise call and a shared exerciseId (live regression)", async () => {
    let createCalls = 0;

    const resolved = await resolveWorkoutPlanProposalForApply(
      {
        findOrCreateExercise: async (input: { name: string; userId: string | null }) => {
          createCalls += 1;
          // Yield so concurrent day resolution would race a naive value cache.
          await Promise.resolve();
          return {
            id: "d1000001-0000-4000-8000-000000000088",
            name: input.name,
            normalizedName: input.name.toLowerCase(),
            aliases: [],
            primaryMuscles: ["calves"],
            secondaryMuscles: [],
            equipment: ["bodyweight"],
            movementPatterns: ["plyometric"],
            modalities: ["plyometrics"],
            difficulty: "intermediate",
            instructions: ["Jump repeatedly with minimal ground contact time."],
            safetyNotes: ["Land softly."],
            media: { refs: [], fallbackLabel: "Demonstration coming soon" },
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
        title: "Week 2 power",
        summary: "Repeats the same exercise on two days.",
        days: [
          {
            weekday: "monday",
            focus: "Power",
            exercises: [
              {
                pendingExerciseRef: "pogo-jump",
                snapshot: { name: "Pogo Jump" },
                sets: 2,
                reps: "20",
              },
            ],
          },
          {
            weekday: "thursday",
            focus: "Power",
            exercises: [
              {
                pendingExerciseRef: "pogo-jump",
                snapshot: { name: "Pogo Jump" },
                sets: 3,
                reps: "15",
              },
            ],
          },
        ],
        notes: [],
        pendingExercises: {
          "pogo-jump": {
            name: "Pogo Jump",
            aliases: [],
            primaryMuscles: ["calves"],
            secondaryMuscles: [],
            equipment: ["bodyweight"],
            movementPatterns: ["plyometric"],
            modalities: ["plyometrics"],
            difficulty: "intermediate",
            instructions: ["Jump repeatedly with minimal ground contact time."],
            safetyNotes: ["Land softly."],
            source: "ai_generated",
          },
        },
      },
    );

    expect(createCalls).toBe(1);

    const first = resolved.days[0]?.exercises[0] as { exerciseId?: string };
    const second = resolved.days[1]?.exercises[0] as { exerciseId?: string };
    expect(first.exerciseId).toBe("d1000001-0000-4000-8000-000000000088");
    expect(second.exerciseId).toBe(first.exerciseId);
  });

  it("rejects a pendingExerciseRef without a matching pendingExercises definition", async () => {
    await expect(
      resolveWorkoutPlanProposalForApply(
        {
          findOrCreateExercise: async () => {
            throw new Error("findOrCreateExercise should not be called");
          },
        } as never,
        "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
        {
          title: "Missing definition",
          summary: "Ref without catalog metadata.",
          days: [
            {
              weekday: "monday",
              focus: "Power",
              exercises: [
                {
                  pendingExerciseRef: "pogo-jump",
                  snapshot: { name: "Pogo Jump" },
                  sets: 2,
                  reps: "20",
                },
              ],
            },
          ],
          notes: [],
        },
      ),
    ).rejects.toThrow('Pending exercise definition "pogo-jump" was not found in the proposal.');
  });
});
