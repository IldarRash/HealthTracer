import { exercises } from "@health/db";
import {
  exerciseDifficultySchema,
  exerciseEquipmentSchema,
  exerciseMovementPatternSchema,
  exerciseMuscleSchema,
  exerciseSchema,
  exerciseSourceSchema,
  exerciseValidationStatusSchema,
  type CreateExerciseInput,
  type Exercise,
  type ExerciseListResponse,
} from "@health/types";
import { InternalServerErrorException } from "@nestjs/common";

type ExerciseRow = typeof exercises.$inferSelect;

export function toExercise(row: ExerciseRow): Exercise {
  return exerciseSchema.parse({
    id: row.id,
    name: row.name,
    normalizedName: row.normalizedName,
    aliases: row.aliases,
    primaryMuscles: row.primaryMuscles.map((muscle) => exerciseMuscleSchema.parse(muscle)),
    secondaryMuscles: row.secondaryMuscles.map((muscle) =>
      exerciseMuscleSchema.parse(muscle),
    ),
    equipment: row.equipment.map((item) => exerciseEquipmentSchema.parse(item)),
    movementPatterns: row.movementPatterns.map((pattern) =>
      exerciseMovementPatternSchema.parse(pattern),
    ),
    difficulty: exerciseDifficultySchema.parse(row.difficulty),
    instructions: row.instructions,
    safetyNotes: row.safetyNotes,
    source: exerciseSourceSchema.parse(row.source),
    validationStatus: exerciseValidationStatusSchema.parse(row.validationStatus),
    status: row.status as Exercise["status"],
    userId: row.userId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export function toCreateExerciseRecordInput(
  input: CreateExerciseInput,
  userId: string,
) {
  return {
    ...input,
    userId,
  };
}

export function assertExerciseRow(row: ExerciseRow | null | undefined): ExerciseRow {
  if (!row) {
    throw new InternalServerErrorException("Exercise record was not persisted.");
  }

  return row;
}

export type { ExerciseListResponse };
