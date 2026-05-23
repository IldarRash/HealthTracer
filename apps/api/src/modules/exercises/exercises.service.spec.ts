import { BadRequestException } from "@nestjs/common";
import type { CreateExerciseInput } from "@health/types";
import { describe, expect, it, vi } from "vitest";
import { ExercisesService } from "./exercises.service.js";

const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
const auth = {
  clerkUserId: "user_123",
  displayName: "Test User",
  email: "test@example.com",
};

const createInput: CreateExerciseInput = {
  name: "Tempo Split Squat",
  aliases: [],
  primaryMuscles: ["quads", "glutes"],
  secondaryMuscles: ["hamstrings"],
  equipment: ["dumbbell", "bench"],
  movementPatterns: ["lunge"],
  difficulty: "intermediate",
  instructions: ["Lower under control for three seconds."],
  safetyNotes: ["Stop if knee discomfort increases."],
  source: "ai_generated",
};

const existingRow = {
  id: "b1000001-0000-4000-8000-000000000099",
  name: "Tempo Split Squat",
  normalizedName: "tempo split squat",
  aliases: [],
  primaryMuscles: ["quads", "glutes"],
  secondaryMuscles: ["hamstrings"],
  equipment: ["bench", "dumbbell"],
  movementPatterns: ["lunge"],
  difficulty: "intermediate",
  instructions: ["Lower under control for three seconds."],
  safetyNotes: ["Stop if knee discomfort increases."],
  source: "ai_generated",
  validationStatus: "pending_validation",
  status: "active",
  userId,
  dedupeKey: "tempo split squat::bench|dumbbell::glutes|quads",
  createdAt: new Date("2026-05-22T12:00:00.000Z"),
  updatedAt: new Date("2026-05-22T12:00:00.000Z"),
};

const usersService = {
  resolveFromAuth: async () => ({
    id: userId,
    email: "user@example.com",
    displayName: null,
    timezone: "UTC",
    createdAt: "2026-05-22T12:00:00.000Z",
    updatedAt: "2026-05-22T12:00:00.000Z",
  }),
};

function createRepositoryMock(overrides: Record<string, unknown> = {}) {
  return {
    listActiveExercises: async () => [existingRow],
    findActiveExerciseById: async () => existingRow,
    findActiveExercisesByIds: async () => [existingRow],
    findActiveByDedupeKey: async () => null,
    createExercise: async () => existingRow,
    ...overrides,
  };
}

describe("ExercisesService", () => {
  it("returns an existing exercise when dedupe key matches", async () => {
    const createExercise = vi.fn();
    const service = new ExercisesService(
      createRepositoryMock({
        findActiveByDedupeKey: async () => existingRow,
        createExercise,
      }) as never,
      usersService as never,
    );

    const result = await service.createExercise(auth, createInput);

    expect(result.id).toBe(existingRow.id);
    expect(createExercise).not.toHaveBeenCalled();
  });

  it("creates a new exercise when no dedupe match exists", async () => {
    const createExercise = vi.fn(async () => existingRow);
    const service = new ExercisesService(
      createRepositoryMock({
        findActiveByDedupeKey: async () => null,
        createExercise,
      }) as never,
      usersService as never,
    );

    const result = await service.createExercise(auth, createInput);

    expect(createExercise).toHaveBeenCalledOnce();
    expect(result.name).toBe("Tempo Split Squat");
  });

  it("rejects resolveExerciseIds when any id is missing", async () => {
    const service = new ExercisesService(
      createRepositoryMock({
        findActiveExercisesByIds: async () => [],
      }) as never,
      usersService as never,
    );

    await expect(
      service.resolveExerciseIds(["b1000001-0000-4000-8000-000000000001"], userId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
