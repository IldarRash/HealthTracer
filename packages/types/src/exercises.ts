import { z } from "zod";
import { isoDateTimeSchema } from "./dates.js";

export const exerciseSourceSchema = z.enum([
  "system_seed",
  "free_exercise_db",
  "ai_generated",
  "user_created",
]);

export type ExerciseSource = z.infer<typeof exerciseSourceSchema>;

export const exerciseValidationStatusSchema = z.enum([
  "validated",
  "pending_validation",
  "rejected",
]);

export type ExerciseValidationStatus = z.infer<typeof exerciseValidationStatusSchema>;

export const exerciseStatusSchema = z.enum(["active", "archived"]);

export type ExerciseStatus = z.infer<typeof exerciseStatusSchema>;

export const exerciseDifficultySchema = z.enum([
  "beginner",
  "intermediate",
  "advanced",
]);

export type ExerciseDifficulty = z.infer<typeof exerciseDifficultySchema>;

export const exerciseMuscleSchema = z.enum([
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "core",
  "hip_flexors",
  "lats",
  "traps",
]);

export type ExerciseMuscle = z.infer<typeof exerciseMuscleSchema>;

export const exerciseEquipmentSchema = z.enum([
  "barbell",
  "dumbbell",
  "kettlebell",
  "bodyweight",
  "cable",
  "machine",
  "resistance_band",
  "bench",
  "pull_up_bar",
  "medicine_ball",
  "ez_bar",
  "smith_machine",
  "yoga_mat",
  "box",
  "foam_roller",
  "jump_rope",
  "none",
]);

export type ExerciseEquipment = z.infer<typeof exerciseEquipmentSchema>;

export const exerciseMovementPatternSchema = z.enum([
  "push",
  "pull",
  "squat",
  "hinge",
  "lunge",
  "carry",
  "rotation",
  "isolation",
  "cardio",
  "plyometric",
  "mobility",
  "flexibility",
  "balance",
]);

export type ExerciseMovementPattern = z.infer<typeof exerciseMovementPatternSchema>;

export const exerciseModalitySchema = z.enum([
  "strength",
  "athletic_performance",
  "plyometrics",
  "yoga",
  "mobility",
  "conditioning",
  "wellness",
]);

export type ExerciseModality = z.infer<typeof exerciseModalitySchema>;

export const exerciseMediaRefSchema = z.object({
  kind: z.enum(["image", "video"]),
  url: z.string().url().max(2048).optional(),
  label: z.string().min(1).max(120).optional(),
});

export type ExerciseMediaRef = z.infer<typeof exerciseMediaRefSchema>;

export const exerciseMediaSchema = z.object({
  refs: z.array(exerciseMediaRefSchema).max(3).default([]),
  fallbackLabel: z.string().min(1).max(120).nullable().optional(),
});

export type ExerciseMedia = z.infer<typeof exerciseMediaSchema>;

export const exerciseCatalogMetadataSchema = z.object({
  source: z.enum(["catalog", "snapshot"]),
  name: z.string().min(1).max(160),
  primaryMuscles: z.array(exerciseMuscleSchema).max(6).optional(),
  secondaryMuscles: z.array(exerciseMuscleSchema).max(6).optional(),
  equipment: z.array(exerciseEquipmentSchema).max(6).optional(),
  movementPatterns: z.array(exerciseMovementPatternSchema).max(4).optional(),
  modalities: z.array(exerciseModalitySchema).max(3).optional(),
  difficulty: exerciseDifficultySchema.optional(),
  instructions: z.array(z.string().min(1).max(1000)).max(20).optional(),
  safetyNotes: z.array(z.string().min(1).max(500)).max(10).optional(),
  media: exerciseMediaSchema.optional(),
});

export type ExerciseCatalogMetadata = z.infer<typeof exerciseCatalogMetadataSchema>;

export const exerciseSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(160),
  normalizedName: z.string().min(1).max(160),
  aliases: z.array(z.string().min(1).max(160)).default([]),
  primaryMuscles: z.array(exerciseMuscleSchema).min(1).max(6),
  secondaryMuscles: z.array(exerciseMuscleSchema).max(6).default([]),
  equipment: z.array(exerciseEquipmentSchema).min(1).max(6),
  movementPatterns: z.array(exerciseMovementPatternSchema).min(1).max(4),
  modalities: z.array(exerciseModalitySchema).min(1).max(3),
  difficulty: exerciseDifficultySchema,
  instructions: z.array(z.string().min(1).max(1000)).min(1).max(20),
  safetyNotes: z.array(z.string().min(1).max(500)).max(10).default([]),
  media: exerciseMediaSchema.default({ refs: [], fallbackLabel: null }),
  source: exerciseSourceSchema,
  validationStatus: exerciseValidationStatusSchema,
  status: exerciseStatusSchema,
  userId: z.string().uuid().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type Exercise = z.infer<typeof exerciseSchema>;

export const createExerciseInputSchema = z.object({
  name: z.string().min(1).max(160),
  aliases: z.array(z.string().min(1).max(160)).max(10).default([]),
  primaryMuscles: z.array(exerciseMuscleSchema).min(1).max(6),
  secondaryMuscles: z.array(exerciseMuscleSchema).max(6).default([]),
  equipment: z.array(exerciseEquipmentSchema).min(1).max(6),
  movementPatterns: z.array(exerciseMovementPatternSchema).min(1).max(4),
  modalities: z.array(exerciseModalitySchema).min(1).max(3),
  difficulty: exerciseDifficultySchema,
  instructions: z.array(z.string().min(1).max(1000)).min(1).max(20),
  safetyNotes: z.array(z.string().min(1).max(500)).min(1).max(10),
  media: exerciseMediaSchema.optional(),
  source: exerciseSourceSchema.extract(["ai_generated", "user_created"]),
});

export type CreateExerciseInput = z.infer<typeof createExerciseInputSchema>;

export const exerciseListQuerySchema = z.object({
  search: z.string().min(1).max(160).optional(),
  equipment: z.array(exerciseEquipmentSchema).max(6).optional(),
  primaryMuscle: exerciseMuscleSchema.optional(),
  movementPattern: exerciseMovementPatternSchema.optional(),
  modality: exerciseModalitySchema.optional(),
  difficulty: exerciseDifficultySchema.optional(),
  source: exerciseSourceSchema.optional(),
  includeUserCreated: z
    .preprocess((value) => {
      if (value === "true") {
        return true;
      }

      if (value === "false") {
        return false;
      }

      return value;
    }, z.boolean())
    .default(true),
});

export type ExerciseListQuery = z.infer<typeof exerciseListQuerySchema>;

export const exerciseListResponseSchema = z.object({
  exercises: z.array(exerciseSchema),
});

export type ExerciseListResponse = z.infer<typeof exerciseListResponseSchema>;

export function normalizeExerciseName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildExerciseDedupeKey(input: {
  normalizedName: string;
  equipment: readonly string[];
  primaryMuscles: readonly string[];
}): string {
  const equipmentKey = [...input.equipment].sort().join("|");
  const musclesKey = [...input.primaryMuscles].sort().join("|");

  return `${input.normalizedName}::${equipmentKey}::${musclesKey}`;
}

export function buildExerciseDedupeKeyFromName(input: {
  name: string;
  equipment: readonly string[];
  primaryMuscles: readonly string[];
}): string {
  return buildExerciseDedupeKey({
    normalizedName: normalizeExerciseName(input.name),
    equipment: input.equipment,
    primaryMuscles: input.primaryMuscles,
  });
}

export function inferExerciseModalitiesFromMovementPatterns(
  movementPatterns: readonly ExerciseMovementPattern[],
): ExerciseModality[] {
  if (movementPatterns.includes("cardio")) {
    return ["conditioning"];
  }

  if (movementPatterns.includes("plyometric")) {
    return ["plyometrics", "athletic_performance"];
  }

  if (
    movementPatterns.includes("mobility") ||
    movementPatterns.includes("flexibility") ||
    movementPatterns.includes("balance")
  ) {
    return ["mobility"];
  }

  return ["strength"];
}

export function buildExerciseCatalogMetadataFromExercise(
  exercise: Exercise,
): ExerciseCatalogMetadata {
  return {
    source: "catalog",
    name: exercise.name,
    primaryMuscles: exercise.primaryMuscles,
    secondaryMuscles:
      exercise.secondaryMuscles.length > 0 ? exercise.secondaryMuscles : undefined,
    equipment: exercise.equipment,
    movementPatterns: exercise.movementPatterns,
    modalities: exercise.modalities,
    difficulty: exercise.difficulty,
    instructions: exercise.instructions,
    safetyNotes: exercise.safetyNotes.length > 0 ? exercise.safetyNotes : undefined,
    media: exercise.media,
  };
}

export function buildExerciseCatalogMetadataFromSnapshot(input: {
  name: string;
  primaryMuscles?: ExerciseMuscle[];
  secondaryMuscles?: ExerciseMuscle[];
  equipment?: ExerciseEquipment[];
}): ExerciseCatalogMetadata {
  return {
    source: "snapshot",
    name: input.name,
    primaryMuscles: input.primaryMuscles,
    secondaryMuscles: input.secondaryMuscles,
    equipment: input.equipment,
    media: {
      refs: [],
      fallbackLabel: "Demonstration coming soon",
    },
  };
}
