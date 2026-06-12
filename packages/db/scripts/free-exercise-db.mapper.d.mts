/**
 * Type declarations for free-exercise-db.mapper.mjs
 */

export interface MappedExercise {
  name: string;
  normalizedName: string;
  aliases: string[];
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string[];
  movementPatterns: string[];
  modalities: string[];
  difficulty: string;
  instructions: string[];
  safetyNotes: string[];
  media: { refs: Array<{ kind: string; url: string }>; fallbackLabel: null };
  source: string;
  validationStatus: string;
  status: string;
  userId: null;
  dedupeKey: string;
}

export function normalizeExerciseName(name: string): string;

export function buildExerciseDedupeKey(input: {
  normalizedName: string;
  equipment: string[];
  primaryMuscles: string[];
}): string;

export function inferExerciseModalitiesFromMovementPatterns(
  movementPatterns: string[],
): string[];

export function mapFreeExerciseDbRecord(
  record: Record<string, unknown>,
): MappedExercise | null;
