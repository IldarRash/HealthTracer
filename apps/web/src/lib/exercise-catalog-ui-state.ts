import {
  buildExerciseCatalogMetadataFromSnapshot,
  isStructuredWorkoutPlanExercise,
  type ExerciseCatalogMetadata,
  type UpdateWorkoutSessionExerciseInput,
  type WorkoutPlanExercise,
  type WorkoutPlanExerciseEntry,
  type WorkoutSessionExercise,
  type WorkoutSessionExerciseExecution,
  type WorkoutSessionExercisePrescription,
} from "@health/types";

export type ExerciseCatalogDetailSection = {
  label: string;
  value: string;
};

export type ExerciseCatalogMediaImage = {
  url: string;
  label?: string;
};

export type ExerciseCatalogDetailView = {
  /** Renderable image refs from catalog.media (kind=image, url present), capped at 3. */
  mediaImages: ExerciseCatalogMediaImage[];
  /** Shown only when there are no renderable images. */
  mediaFallbackLabel: string | null;
  sections: ExerciseCatalogDetailSection[];
  instructions: readonly string[];
  safetyNotes: readonly string[];
  isSnapshotOnly: boolean;
};

export type ExerciseFeedbackFormState = {
  perceivedEffort: string;
  perceivedDifficulty: string;
  discomfortFlag: boolean;
  notes: string;
  actualReps: string;
  actualWeightKg: string;
  loadAdjustmentNotes: string;
};

function humanizeToken(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatEnumList(values: readonly string[] | undefined): string | null {
  if (!values?.length) {
    return null;
  }

  return values.map(humanizeToken).join(", ");
}

function parseOptionalBoundedScore(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 10) {
    return null;
  }

  return parsed;
}

function parseOptionalWeight(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function parseOptionalText(value: string, maxLength: number): string | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.slice(0, maxLength);
}

export function resolvePlanExerciseCatalogMetadata(
  exercise: WorkoutPlanExerciseEntry,
): ExerciseCatalogMetadata | null {
  // B6 removal: typeof exercise === "string" check deleted; string arm no longer in the union.
  if (!isStructuredWorkoutPlanExercise(exercise)) {
    return null;
  }

  return exercise.catalog ?? buildExerciseCatalogMetadataFromSnapshot(exercise.snapshot);
}

export function resolveSessionExerciseCatalogMetadata(
  exercise: WorkoutSessionExercise,
): ExerciseCatalogMetadata {
  return (
    exercise.catalog ??
    buildExerciseCatalogMetadataFromSnapshot(exercise.prescription.snapshot)
  );
}

export function getExerciseMediaFallbackLabel(
  catalog: ExerciseCatalogMetadata,
): string | null {
  const refs = catalog.media?.refs ?? [];
  const hasRenderableMedia = refs.some((ref) => ref.url);

  if (hasRenderableMedia) {
    return null;
  }

  return catalog.media?.fallbackLabel ?? "Demonstration coming soon";
}

export function buildExerciseCatalogDetailView(
  catalog: ExerciseCatalogMetadata,
): ExerciseCatalogDetailView {
  const sections: ExerciseCatalogDetailSection[] = [];

  const equipment = formatEnumList(catalog.equipment);
  if (equipment) {
    sections.push({ label: "Equipment", value: equipment });
  }

  const primaryMuscles = formatEnumList(catalog.primaryMuscles);
  if (primaryMuscles) {
    sections.push({ label: "Primary muscles", value: primaryMuscles });
  }

  const secondaryMuscles = formatEnumList(catalog.secondaryMuscles);
  if (secondaryMuscles) {
    sections.push({ label: "Secondary muscles", value: secondaryMuscles });
  }

  if (catalog.difficulty) {
    sections.push({
      label: "Difficulty",
      value: humanizeToken(catalog.difficulty),
    });
  }

  const modalities = formatEnumList(catalog.modalities);
  if (modalities) {
    sections.push({ label: "Modality", value: modalities });
  }

  const movementPatterns = formatEnumList(catalog.movementPatterns);
  if (movementPatterns) {
    sections.push({ label: "Movement pattern", value: movementPatterns });
  }

  const mediaImages: ExerciseCatalogMediaImage[] = (catalog.media?.refs ?? [])
    .filter((ref): ref is typeof ref & { url: string } => ref.kind === "image" && Boolean(ref.url))
    .slice(0, 3)
    .map((ref) => ({ url: ref.url, label: ref.label }));

  return {
    mediaImages,
    mediaFallbackLabel: mediaImages.length === 0 ? getExerciseMediaFallbackLabel(catalog) : null,
    sections,
    instructions: catalog.instructions ?? [],
    safetyNotes: catalog.safetyNotes ?? [],
    isSnapshotOnly: catalog.source === "snapshot",
  };
}

export function formatPlanExercisePrescriptionDetailLines(
  exercise: WorkoutPlanExercise,
): string[] {
  return formatPrescriptionDetailLines({
    sets: exercise.sets ?? null,
    reps: exercise.reps ?? null,
    durationSeconds: exercise.durationSeconds ?? null,
    recommendedLoadGuidance: exercise.recommendedLoadGuidance ?? null,
    weightKgGuidance: exercise.weightKgGuidance ?? null,
    restBetweenSetsSeconds: exercise.restBetweenSetsSeconds ?? null,
    restBetweenRepsSeconds: exercise.restBetweenRepsSeconds ?? null,
    restInsideCircuitSeconds: exercise.restInsideCircuitSeconds ?? null,
    restBetweenCircuitRoundsSeconds: exercise.restBetweenCircuitRoundsSeconds ?? null,
    notes: exercise.notes ?? null,
  });
}

function formatPrescriptionDetailLines(
  prescription: Pick<
    WorkoutSessionExercisePrescription,
    | "sets"
    | "reps"
    | "durationSeconds"
    | "recommendedLoadGuidance"
    | "weightKgGuidance"
    | "restBetweenSetsSeconds"
    | "restBetweenRepsSeconds"
    | "restInsideCircuitSeconds"
    | "restBetweenCircuitRoundsSeconds"
    | "notes"
  >,
): string[] {
  const lines: string[] = [];

  if (prescription.sets != null && prescription.reps) {
    lines.push(`${prescription.sets} sets × ${prescription.reps} reps`);
  } else if (prescription.reps) {
    lines.push(`${prescription.reps} reps`);
  } else if (prescription.sets != null) {
    lines.push(`${prescription.sets} sets`);
  }

  if (prescription.durationSeconds != null) {
    const minutes = Math.max(1, Math.round(prescription.durationSeconds / 60));
    lines.push(`${minutes} min`);
  }

  if (prescription.recommendedLoadGuidance) {
    lines.push(`Load guidance: ${prescription.recommendedLoadGuidance}`);
  }

  if (prescription.weightKgGuidance != null) {
    lines.push(`Target load: ${prescription.weightKgGuidance} kg`);
  }

  if (prescription.restBetweenSetsSeconds != null) {
    lines.push(formatRestDuration(prescription.restBetweenSetsSeconds));
  }

  if (prescription.restBetweenRepsSeconds != null) {
    lines.push(`Between reps: ${formatRestDuration(prescription.restBetweenRepsSeconds)}`);
  }

  if (prescription.restInsideCircuitSeconds != null) {
    lines.push(`Inside circuit: ${formatRestDuration(prescription.restInsideCircuitSeconds)}`);
  }

  if (prescription.restBetweenCircuitRoundsSeconds != null) {
    lines.push(
      `Between rounds: ${formatRestDuration(prescription.restBetweenCircuitRoundsSeconds)}`,
    );
  }

  if (prescription.notes) {
    lines.push(prescription.notes);
  }

  return lines;
}

export function formatRestDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s rest`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;

  if (remainder === 0) {
    return `${minutes} min rest`;
  }

  return `${minutes}m ${remainder}s rest`;
}

export function exerciseFeedbackToFormState(
  execution: WorkoutSessionExerciseExecution,
): ExerciseFeedbackFormState {
  return {
    perceivedEffort:
      execution.perceivedEffort != null ? String(execution.perceivedEffort) : "",
    perceivedDifficulty:
      execution.perceivedDifficulty != null ? String(execution.perceivedDifficulty) : "",
    discomfortFlag: execution.discomfortFlag === true,
    notes: execution.notes ?? "",
    actualReps: execution.actualReps ?? "",
    actualWeightKg:
      execution.actualWeightKg != null ? String(execution.actualWeightKg) : "",
    loadAdjustmentNotes: execution.loadAdjustmentNotes ?? "",
  };
}

export function buildExerciseExecutionUpdatePayload(input: {
  form: ExerciseFeedbackFormState;
  status?: "completed" | "skipped" | "adjusted";
}): UpdateWorkoutSessionExerciseInput | null {
  const payload: UpdateWorkoutSessionExerciseInput = {};

  if (input.status) {
    payload.status = input.status;
  }

  const perceivedEffort = parseOptionalBoundedScore(input.form.perceivedEffort);
  if (perceivedEffort === null) {
    return null;
  }
  if (perceivedEffort !== undefined) {
    payload.perceivedEffort = perceivedEffort;
  }

  const perceivedDifficulty = parseOptionalBoundedScore(input.form.perceivedDifficulty);
  if (perceivedDifficulty === null) {
    return null;
  }
  if (perceivedDifficulty !== undefined) {
    payload.perceivedDifficulty = perceivedDifficulty;
  }

  const actualWeightKg = parseOptionalWeight(input.form.actualWeightKg);
  if (actualWeightKg === null) {
    return null;
  }
  if (actualWeightKg !== undefined) {
    payload.actualWeightKg = actualWeightKg;
  }

  const actualReps = parseOptionalText(input.form.actualReps, 80);
  if (actualReps) {
    payload.actualReps = actualReps;
  }

  const notes = parseOptionalText(input.form.notes, 500);
  if (notes) {
    payload.notes = notes;
  }

  const loadAdjustmentNotes = parseOptionalText(input.form.loadAdjustmentNotes, 240);
  if (loadAdjustmentNotes) {
    payload.loadAdjustmentNotes = loadAdjustmentNotes;
  }

  if (input.form.discomfortFlag) {
    payload.discomfortFlag = true;
  } else if (
    input.form.discomfortFlag === false &&
    (input.form.perceivedEffort.trim() ||
      input.form.perceivedDifficulty.trim() ||
      input.form.notes.trim() ||
      input.form.actualReps.trim() ||
      input.form.actualWeightKg.trim() ||
      input.form.loadAdjustmentNotes.trim() ||
      input.status)
  ) {
    payload.discomfortFlag = false;
  }

  if (
    payload.status == null &&
    payload.notes === undefined &&
    payload.actualWeightKg === undefined &&
    payload.actualReps === undefined &&
    payload.loadAdjustmentNotes === undefined &&
    payload.perceivedEffort === undefined &&
    payload.perceivedDifficulty === undefined &&
    payload.discomfortFlag === undefined
  ) {
    return null;
  }

  return payload;
}

export function canSubmitExerciseExecutionUpdate(input: {
  form: ExerciseFeedbackFormState;
  status?: "completed" | "skipped" | "adjusted";
}): boolean {
  return buildExerciseExecutionUpdatePayload(input) != null;
}

export function formatExerciseFeedbackSummary(
  execution: WorkoutSessionExerciseExecution,
): string | null {
  const parts: string[] = [];

  if (execution.actualReps) {
    parts.push(execution.actualReps);
  }

  if (execution.actualWeightKg != null) {
    parts.push(`${execution.actualWeightKg} kg`);
  }

  if (execution.loadAdjustmentNotes) {
    parts.push(execution.loadAdjustmentNotes);
  }

  if (execution.perceivedEffort != null) {
    parts.push(`Effort ${execution.perceivedEffort}/10`);
  }

  if (execution.perceivedDifficulty != null) {
    parts.push(`Difficulty ${execution.perceivedDifficulty}/10`);
  }

  if (execution.discomfortFlag === true) {
    parts.push("Discomfort noted");
  }

  if (execution.notes) {
    parts.push(execution.notes);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}
