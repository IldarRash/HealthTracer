import { z } from "zod";
import { sha256Hex } from "./sha256.js";
import { isoDateSchema, isoDateTimeSchema } from "./dates.js";
import {
  createExerciseInputSchema,
  exerciseEquipmentSchema,
  exerciseMuscleSchema,
  type CreateExerciseInput,
} from "./exercises.js";
import { recoveryContextSourceRefSchema } from "./recovery.js";

export const workoutWeekdaySchema = z.enum([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);

export type WorkoutWeekday = z.infer<typeof workoutWeekdaySchema>;

export const WORKOUT_WEEKDAYS = workoutWeekdaySchema.options;

const WEEKDAY_LABEL_TO_ENUM: Record<string, WorkoutWeekday> = {
  monday: "monday",
  mon: "monday",
  tuesday: "tuesday",
  tue: "tuesday",
  tues: "tuesday",
  wednesday: "wednesday",
  wed: "wednesday",
  thursday: "thursday",
  thu: "thursday",
  thur: "thursday",
  thurs: "thursday",
  friday: "friday",
  fri: "friday",
  saturday: "saturday",
  sat: "saturday",
  sunday: "sunday",
  sun: "sunday",
};

const UNSAFE_WORKOUT_MEDICAL_PATTERNS = [
  /\bdiagnos(e|is|ed|ing)\b/i,
  /\bprescri(be|ption|bed|bing)\b/i,
  /\btreat(ment|ing|ed)\b/i,
  /\bmedication\b/i,
  /\bcure\b/i,
  /\bclinical(?:ly)?\b/i,
  /\bpatholog(y|ical)\b/i,
  /\bdisorder\b/i,
  /\bsymptom\b/i,
  /\bmedical advice\b/i,
  /\brehabilitation protocol\b/i,
];

/** Session-level and legacy plan exercise object shape. */
export const workoutExerciseSchema = z.object({
  name: z.string().min(1).max(160),
  target: z.string().min(1).max(240).nullable().optional(),
  sets: z.number().int().positive().max(20).nullable().optional(),
  reps: z.string().min(1).max(80).nullable().optional(),
  notes: z.string().min(1).max(500).nullable().optional(),
});

export type WorkoutExercise = z.infer<typeof workoutExerciseSchema>;

export const workoutExercisePayloadSchema = z.union([
  z.string().min(1).max(160),
  workoutExerciseSchema,
]);

export type WorkoutExercisePayload = z.infer<typeof workoutExercisePayloadSchema>;

/** Immutable display snapshot stored on revisions for historical readability. */
export const workoutExerciseDisplaySnapshotSchema = z.object({
  name: z.string().min(1).max(160),
  primaryMuscles: z.array(exerciseMuscleSchema).min(1).max(6).optional(),
  secondaryMuscles: z.array(exerciseMuscleSchema).max(6).optional(),
  equipment: z.array(exerciseEquipmentSchema).min(1).max(6).optional(),
});

export type WorkoutExerciseDisplaySnapshot = z.infer<
  typeof workoutExerciseDisplaySnapshotSchema
>;

/** Structured catalog-backed exercise prescription for workout plan revisions. */
export const workoutPlanExerciseSchema = z.object({
  exerciseId: z.string().uuid().nullable().optional(),
  /** Hook for AI proposal apply to resolve newly created catalog exercises (next slice). */
  pendingExerciseRef: z.string().min(1).max(80).optional(),
  snapshot: workoutExerciseDisplaySnapshotSchema,
  sets: z.number().int().positive().max(20).nullable().optional(),
  reps: z.string().min(1).max(80).nullable().optional(),
  durationSeconds: z.number().int().positive().max(7200).nullable().optional(),
  recommendedLoadGuidance: z.string().min(1).max(240).nullable().optional(),
  weightKgGuidance: z.number().positive().max(500).nullable().optional(),
  restBetweenSetsSeconds: z.number().int().nonnegative().max(600).nullable().optional(),
  restBetweenRepsSeconds: z.number().int().nonnegative().max(120).nullable().optional(),
  circuitGroupId: z.string().min(1).max(40).nullable().optional(),
  circuitGroupLabel: z.string().min(1).max(80).nullable().optional(),
  restInsideCircuitSeconds: z.number().int().nonnegative().max(600).nullable().optional(),
  restBetweenCircuitRoundsSeconds: z
    .number()
    .int()
    .nonnegative()
    .max(900)
    .nullable()
    .optional(),
  notes: z.string().min(1).max(500).nullable().optional(),
});

export type WorkoutPlanExercise = z.infer<typeof workoutPlanExerciseSchema>;

export const workoutPlanExerciseEntrySchema = z.union([
  z.string().min(1).max(160),
  workoutExerciseSchema,
  workoutPlanExerciseSchema,
]);

export type WorkoutPlanExerciseEntry = z.infer<typeof workoutPlanExerciseEntrySchema>;

export const workoutPlanDaySchema = z
  .object({
    weekday: workoutWeekdaySchema.optional(),
    /** Legacy free-text day label retained for older revisions. */
    day: z.string().min(1).max(80).optional(),
    focus: z.string().min(1).max(160),
    exercises: z.array(workoutPlanExerciseEntrySchema).max(20).default([]),
  })
  .refine((day) => day.weekday != null || day.day != null, {
    message: "Either weekday or day label is required.",
  });

export type WorkoutPlanDay = z.infer<typeof workoutPlanDaySchema>;

export const workoutAdaptationOperationSchema = z.enum([
  "create",
  "remove_exercise",
  "swap_exercise",
  "reduce_load",
  "reduce_volume",
  "adjust_rest",
  "change_equipment",
  "simplify",
]);

export type WorkoutAdaptationOperation = z.infer<typeof workoutAdaptationOperationSchema>;

export const workoutAdaptationOperationRecordSchema = z.object({
  operation: workoutAdaptationOperationSchema,
  description: z.string().min(1).max(240),
  weekday: workoutWeekdaySchema.optional(),
  exerciseName: z.string().min(1).max(160).optional(),
  replacementExerciseName: z.string().min(1).max(160).optional(),
});

export type WorkoutAdaptationOperationRecord = z.infer<
  typeof workoutAdaptationOperationRecordSchema
>;

export const workoutPlanAdaptationMetadataSchema = z.object({
  operations: z.array(workoutAdaptationOperationRecordSchema).min(1).max(20),
  recoverySourceRefs: z.array(recoveryContextSourceRefSchema).max(5).optional(),
  allowVolumeIncrease: z.boolean().optional(),
});

export type WorkoutPlanAdaptationMetadata = z.infer<
  typeof workoutPlanAdaptationMetadataSchema
>;

export const workoutPlanPayloadSchema = z.object({
  title: z.string().min(1).max(160),
  summary: z.string().min(1).max(1000),
  days: z.array(workoutPlanDaySchema).min(1).max(14),
  notes: z.array(z.string().min(1).max(240)).max(20).default([]),
  adaptationMetadata: workoutPlanAdaptationMetadataSchema.optional(),
});

export type WorkoutPlanPayload = z.infer<typeof workoutPlanPayloadSchema>;

export const workoutPlanStatusSchema = z.enum(["active", "archived"]);

export type WorkoutPlanStatus = z.infer<typeof workoutPlanStatusSchema>;

export const workoutSessionStatusSchema = z.enum([
  "planned",
  "completed",
  "skipped",
]);

export type WorkoutSessionStatus = z.infer<typeof workoutSessionStatusSchema>;

export const workoutCompletionFeedbackSchema = z.object({
  fatigue: z.number().int().min(1).max(10).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export type WorkoutCompletionFeedback = z.infer<
  typeof workoutCompletionFeedbackSchema
>;

export const workoutSessionExerciseStatusSchema = z.enum([
  "planned",
  "completed",
  "skipped",
  "adjusted",
]);

export type WorkoutSessionExerciseStatus = z.infer<
  typeof workoutSessionExerciseStatusSchema
>;

export const workoutSessionExerciseExecutionSchema = z.object({
  status: workoutSessionExerciseStatusSchema.default("planned"),
  notes: z.string().min(1).max(500).nullable().optional(),
  actualWeightKg: z.number().positive().max(500).nullable().optional(),
  actualReps: z.string().min(1).max(80).nullable().optional(),
  loadAdjustmentNotes: z.string().min(1).max(240).nullable().optional(),
});

export type WorkoutSessionExerciseExecution = z.infer<
  typeof workoutSessionExerciseExecutionSchema
>;

export const workoutSessionExercisePrescriptionSchema = z.object({
  snapshot: workoutExerciseDisplaySnapshotSchema,
  sets: z.number().int().positive().max(20).nullable().optional(),
  reps: z.string().min(1).max(80).nullable().optional(),
  durationSeconds: z.number().int().positive().max(7200).nullable().optional(),
  recommendedLoadGuidance: z.string().min(1).max(240).nullable().optional(),
  weightKgGuidance: z.number().positive().max(500).nullable().optional(),
  restBetweenSetsSeconds: z.number().int().nonnegative().max(600).nullable().optional(),
  restBetweenRepsSeconds: z.number().int().nonnegative().max(120).nullable().optional(),
  circuitGroupId: z.string().min(1).max(40).nullable().optional(),
  circuitGroupLabel: z.string().min(1).max(80).nullable().optional(),
  restInsideCircuitSeconds: z.number().int().nonnegative().max(600).nullable().optional(),
  restBetweenCircuitRoundsSeconds: z
    .number()
    .int()
    .nonnegative()
    .max(900)
    .nullable()
    .optional(),
  notes: z.string().min(1).max(500).nullable().optional(),
});

export type WorkoutSessionExercisePrescription = z.infer<
  typeof workoutSessionExercisePrescriptionSchema
>;

export const workoutSessionExerciseSchema = z.object({
  id: z.string().uuid(),
  exerciseId: z.string().uuid().nullable().optional(),
  prescription: workoutSessionExercisePrescriptionSchema,
  execution: workoutSessionExerciseExecutionSchema.default({ status: "planned" }),
});

export type WorkoutSessionExercise = z.infer<typeof workoutSessionExerciseSchema>;

export const workoutSessionExerciseEntrySchema = z.union([
  workoutExercisePayloadSchema,
  workoutSessionExerciseSchema,
]);

export type WorkoutSessionExerciseEntry = z.infer<
  typeof workoutSessionExerciseEntrySchema
>;

export const workoutPlanSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  activeRevisionId: z.string().uuid().nullable(),
  status: workoutPlanStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type WorkoutPlan = z.infer<typeof workoutPlanSchema>;

export const workoutPlanRevisionSchema = z.object({
  id: z.string().uuid(),
  workoutPlanId: z.string().uuid(),
  revisionNumber: z.number().int().positive(),
  reason: z.string().min(1).max(1000),
  source: z.string().min(1).max(80),
  payload: workoutPlanPayloadSchema,
  createdAt: isoDateTimeSchema,
});

export type WorkoutPlanRevision = z.infer<typeof workoutPlanRevisionSchema>;

export const workoutSessionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  workoutPlanId: z.string().uuid(),
  workoutPlanRevisionId: z.string().uuid(),
  plannedDate: isoDateSchema,
  title: z.string().min(1).max(160),
  status: workoutSessionStatusSchema,
  exercises: z.array(workoutSessionExerciseEntrySchema),
  feedback: workoutCompletionFeedbackSchema,
  completedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type WorkoutSession = z.infer<typeof workoutSessionSchema>;

export const activeWorkoutPlanResponseSchema = z.object({
  plan: workoutPlanSchema.nullable(),
  activeRevision: workoutPlanRevisionSchema.nullable(),
  sessions: z.array(workoutSessionSchema),
});

export type ActiveWorkoutPlanResponse = z.infer<
  typeof activeWorkoutPlanResponseSchema
>;

export const scheduleWorkoutSessionSchema = z.object({
  workoutPlanRevisionId: z.string().uuid(),
  plannedDate: isoDateSchema,
  title: z.string().min(1).max(160),
  exercises: z.array(workoutExercisePayloadSchema).max(30).default([]),
});

export type ScheduleWorkoutSessionInput = z.infer<
  typeof scheduleWorkoutSessionSchema
>;

export const completeWorkoutSessionSchema = z.object({
  status: workoutSessionStatusSchema.extract(["completed", "skipped"]).default(
    "completed",
  ),
  feedback: workoutCompletionFeedbackSchema.default({}),
});

export type CompleteWorkoutSessionInput = z.infer<
  typeof completeWorkoutSessionSchema
>;

export const updateWorkoutSessionExerciseSchema = z
  .object({
    status: workoutSessionExerciseStatusSchema
      .extract(["completed", "skipped", "adjusted"])
      .optional(),
    notes: z.string().min(1).max(500).nullable().optional(),
    actualWeightKg: z.number().positive().max(500).nullable().optional(),
    actualReps: z.string().min(1).max(80).nullable().optional(),
    loadAdjustmentNotes: z.string().min(1).max(240).nullable().optional(),
  })
  .refine(
    (value) =>
      value.status != null ||
      value.notes !== undefined ||
      value.actualWeightKg !== undefined ||
      value.actualReps !== undefined ||
      value.loadAdjustmentNotes !== undefined,
    {
      message: "At least one exercise execution field must be provided.",
    },
  );

export type UpdateWorkoutSessionExerciseInput = z.infer<
  typeof updateWorkoutSessionExerciseSchema
>;

/** Catalog exercise definition keyed by pendingExerciseRef for AI proposal apply. */
export const pendingExerciseDefinitionSchema = createExerciseInputSchema.extend({
  source: z.literal("ai_generated").default("ai_generated"),
});

export type PendingExerciseDefinition = z.infer<typeof pendingExerciseDefinitionSchema>;

export const workoutPlanProposalExtrasSchema = z.object({
  pendingExercises: z
    .record(z.string().min(1).max(80), pendingExerciseDefinitionSchema)
    .optional(),
});

export type WorkoutPlanProposalExtras = z.infer<typeof workoutPlanProposalExtrasSchema>;

export const workoutPlanProposalChangesSchema = workoutPlanPayloadSchema.merge(
  workoutPlanProposalExtrasSchema,
);

export type WorkoutPlanProposalChanges = z.infer<typeof workoutPlanProposalChangesSchema>;

export const adaptWorkoutPlanFromProgressChangesSchema = z.object({
  plan: workoutPlanProposalChangesSchema,
  sourceSummaryId: z.string().uuid().optional(),
  sourceTrendObservationIds: z.array(z.string().uuid()).max(10).default([]),
  recoverySourceRefs: z.array(recoveryContextSourceRefSchema).max(5).optional(),
  allowVolumeIncrease: z.boolean().optional(),
});

export type AdaptWorkoutPlanFromProgressChanges = z.infer<
  typeof adaptWorkoutPlanFromProgressChangesSchema
>;

export interface WorkoutPlanCoachingDaySummary {
  weekday?: WorkoutWeekday;
  focus: string;
  exerciseCount: number;
  exercises: Array<{
    name: string;
    sets?: number | null;
    reps?: string | null;
    durationSeconds?: number | null;
  }>;
}

export interface WorkoutPlanCoachingSummary {
  title: string;
  summary: string;
  dayCount: number;
  days: WorkoutPlanCoachingDaySummary[];
}

export interface WorkoutPlanDomainValidationOptions {
  /** Require weekday mapping and structured catalog-backed exercises (AI proposals). */
  requireStructuredPlan?: boolean;
}

export function inferWeekdayFromDayLabel(label: string): WorkoutWeekday | undefined {
  return WEEKDAY_LABEL_TO_ENUM[label.trim().toLowerCase()];
}

export function isStructuredWorkoutPlanExercise(
  entry: WorkoutPlanExerciseEntry,
): entry is WorkoutPlanExercise {
  return typeof entry === "object" && entry !== null && "snapshot" in entry;
}

export function isLegacyWorkoutPlanExerciseObject(
  entry: WorkoutPlanExerciseEntry,
): entry is WorkoutExercise {
  return typeof entry === "object" && entry !== null && "name" in entry && !("snapshot" in entry);
}

export function normalizeWorkoutPlanExerciseEntry(
  entry: WorkoutPlanExerciseEntry,
): WorkoutPlanExercise {
  if (typeof entry === "string") {
    return {
      snapshot: { name: entry },
    };
  }

  if (isStructuredWorkoutPlanExercise(entry)) {
    return entry;
  }

  return {
    snapshot: { name: entry.name },
    sets: entry.sets ?? null,
    reps: entry.reps ?? null,
    recommendedLoadGuidance: entry.target ?? null,
    notes: entry.notes ?? null,
  };
}

export function normalizeWorkoutPlanDay(day: WorkoutPlanDay): WorkoutPlanDay {
  const weekday = day.weekday ?? (day.day ? inferWeekdayFromDayLabel(day.day) : undefined);

  return {
    ...day,
    weekday,
    exercises: day.exercises.map(normalizeWorkoutPlanExerciseEntry),
  };
}

export function normalizeWorkoutPlanPayload(payload: WorkoutPlanPayload): WorkoutPlanPayload {
  return {
    ...payload,
    days: payload.days.map(normalizeWorkoutPlanDay),
  };
}

function collectWorkoutPlanText(payload: WorkoutPlanPayload): string[] {
  const texts = [payload.title, payload.summary, ...payload.notes];

  for (const day of payload.days) {
    texts.push(day.focus);
    if (day.day) {
      texts.push(day.day);
    }

    for (const entry of day.exercises) {
      if (typeof entry === "string") {
        texts.push(entry);
        continue;
      }

      if (isStructuredWorkoutPlanExercise(entry)) {
        texts.push(entry.snapshot.name);
        if (entry.recommendedLoadGuidance) {
          texts.push(entry.recommendedLoadGuidance);
        }
        if (entry.notes) {
          texts.push(entry.notes);
        }
        if (entry.circuitGroupLabel) {
          texts.push(entry.circuitGroupLabel);
        }
        continue;
      }

      texts.push(entry.name);
      if (entry.target) {
        texts.push(entry.target);
      }
      if (entry.notes) {
        texts.push(entry.notes);
      }
    }
  }

  return texts;
}

function containsUnsupportedWorkoutMedicalWording(text: string): boolean {
  return UNSAFE_WORKOUT_MEDICAL_PATTERNS.some((pattern) => pattern.test(text));
}

function validateStructuredExercisePrescription(
  exercise: WorkoutPlanExercise,
  dayIndex: number,
  exerciseIndex: number,
): string[] {
  const errors: string[] = [];
  const path = `days[${dayIndex}].exercises[${exerciseIndex}]`;

  if (!exercise.snapshot?.name?.trim()) {
    errors.push(`workout: ${path} must include a snapshot name.`);
  }

  const hasPrescription =
    exercise.sets != null || exercise.reps != null || exercise.durationSeconds != null;

  if (!hasPrescription) {
    errors.push(
      `workout: ${path} must include sets, reps, or durationSeconds prescription fields.`,
    );
  }

  if (
    exercise.circuitGroupId != null &&
    exercise.restInsideCircuitSeconds == null &&
    exercise.restBetweenCircuitRoundsSeconds == null
  ) {
    errors.push(
      `workout: ${path} circuit exercises should include restInsideCircuitSeconds or restBetweenCircuitRoundsSeconds.`,
    );
  }

  return errors;
}

export function getWorkoutPlanDomainErrors(
  payload: WorkoutPlanPayload,
  options: WorkoutPlanDomainValidationOptions = {},
): string[] {
  const errors: string[] = [];
  const requireStructuredPlan = options.requireStructuredPlan ?? false;

  const workoutDaysWithExercises = payload.days.filter((day) => day.exercises.length > 0);

  if (workoutDaysWithExercises.length === 0) {
    errors.push("workout: At least one plan day must include exercises.");
  }

  const resolvedWeekdays: WorkoutWeekday[] = [];
  const unresolvedLegacyLabels: string[] = [];

  for (const day of payload.days) {
    const weekday =
      day.weekday ?? (day.day ? inferWeekdayFromDayLabel(day.day) : undefined);

    if (weekday) {
      resolvedWeekdays.push(weekday);
    } else if (day.day) {
      unresolvedLegacyLabels.push(day.day.trim().toLowerCase());
    }
  }

  if (new Set(resolvedWeekdays).size !== resolvedWeekdays.length) {
    errors.push("workout: Weekday assignments must be unique across plan days.");
  }

  if (new Set(unresolvedLegacyLabels).size !== unresolvedLegacyLabels.length) {
    errors.push("workout: Legacy day labels must be unique when weekday is absent.");
  }

  if (requireStructuredPlan) {
    const missingWeekday = payload.days.some((day) => {
      const weekday = day.weekday ?? (day.day ? inferWeekdayFromDayLabel(day.day) : undefined);
      return weekday == null;
    });

    if (missingWeekday) {
      errors.push(
        "workout: Structured workout plans must assign a weekday (monday-sunday) to every day.",
      );
    }

    payload.days.forEach((day, dayIndex) => {
      day.exercises.forEach((entry, exerciseIndex) => {
        if (typeof entry === "string" || isLegacyWorkoutPlanExerciseObject(entry)) {
          errors.push(
            `workout: days[${dayIndex}].exercises[${exerciseIndex}] must use structured catalog-backed exercises for new proposals.`,
          );
          return;
        }

        errors.push(
          ...validateStructuredExercisePrescription(entry, dayIndex, exerciseIndex),
        );
      });
    });
  } else {
    payload.days.forEach((day, dayIndex) => {
      day.exercises.forEach((entry, exerciseIndex) => {
        if (isStructuredWorkoutPlanExercise(entry)) {
          errors.push(
            ...validateStructuredExercisePrescription(entry, dayIndex, exerciseIndex),
          );
        }
      });
    });
  }

  for (const text of collectWorkoutPlanText(payload)) {
    if (containsUnsupportedWorkoutMedicalWording(text)) {
      errors.push(
        "workout: Plan copy must avoid diagnosis, treatment, or other unsupported medical wording.",
      );
      break;
    }
  }

  return errors;
}

export function stripWorkoutPlanProposalExtras(
  changes: WorkoutPlanProposalChanges,
): WorkoutPlanPayload {
  const { pendingExercises: _pendingExercises, ...plan } = changes;

  return workoutPlanPayloadSchema.parse(plan);
}

export interface WorkoutPlanLoadMetrics {
  trainingDayCount: number;
  totalSets: number;
  totalExercises: number;
}

export function estimateWorkoutPlanLoadMetrics(payload: WorkoutPlanPayload): WorkoutPlanLoadMetrics {
  let trainingDayCount = 0;
  let totalSets = 0;
  let totalExercises = 0;

  for (const day of payload.days) {
    if (day.exercises.length === 0) {
      continue;
    }

    trainingDayCount += 1;

    for (const entry of day.exercises) {
      totalExercises += 1;
      const normalized = normalizeWorkoutPlanExerciseEntry(entry);
      totalSets += normalized.sets ?? 1;
    }
  }

  return { trainingDayCount, totalSets, totalExercises };
}

export function workoutAdaptationIncreasesVolumeOrLoad(
  current: WorkoutPlanPayload,
  proposed: WorkoutPlanPayload,
): boolean {
  const currentMetrics = estimateWorkoutPlanLoadMetrics(current);
  const proposedMetrics = estimateWorkoutPlanLoadMetrics(proposed);

  return (
    proposedMetrics.trainingDayCount > currentMetrics.trainingDayCount ||
    proposedMetrics.totalSets > currentMetrics.totalSets ||
    proposedMetrics.totalExercises > currentMetrics.totalExercises
  );
}

export function mergeRecoveryMetadataIntoWorkoutPlanProposal(
  changes: WorkoutPlanProposalChanges,
  envelope?: {
    recoverySourceRefs?: z.infer<typeof recoveryContextSourceRefSchema>[];
    allowVolumeIncrease?: boolean;
  },
): WorkoutPlanProposalChanges {
  if (!envelope?.recoverySourceRefs?.length && envelope?.allowVolumeIncrease == null) {
    return changes;
  }

  const existingMetadata = changes.adaptationMetadata;
  const recoverySourceRefs =
    envelope.recoverySourceRefs ?? existingMetadata?.recoverySourceRefs;
  const allowVolumeIncrease =
    envelope.allowVolumeIncrease ?? existingMetadata?.allowVolumeIncrease;

  if (!existingMetadata && !recoverySourceRefs?.length && allowVolumeIncrease == null) {
    return changes;
  }

  return {
    ...changes,
    adaptationMetadata: {
      operations: existingMetadata?.operations ?? [
        {
          operation: "reduce_load",
          description: "Recovery-aware workout adaptation.",
        },
      ],
      recoverySourceRefs,
      allowVolumeIncrease,
    },
  };
}

export function collectWorkoutPlanExerciseIds(payload: WorkoutPlanPayload): string[] {
  const ids: string[] = [];

  for (const day of payload.days) {
    for (const entry of day.exercises) {
      if (isStructuredWorkoutPlanExercise(entry) && entry.exerciseId) {
        ids.push(entry.exerciseId);
      }
    }
  }

  return [...new Set(ids)];
}

export function collectPendingExerciseRefs(payload: WorkoutPlanPayload): string[] {
  const refs: string[] = [];

  for (const day of payload.days) {
    for (const entry of day.exercises) {
      if (isStructuredWorkoutPlanExercise(entry) && entry.pendingExerciseRef) {
        refs.push(entry.pendingExerciseRef);
      }
    }
  }

  return refs;
}

export function getWorkoutProposalDomainErrors(
  changes: WorkoutPlanProposalChanges,
  options: WorkoutPlanDomainValidationOptions = {},
): string[] {
  const plan = stripWorkoutPlanProposalExtras(changes);
  const errors = getWorkoutPlanDomainErrors(plan, options);
  const pendingRefs = collectPendingExerciseRefs(plan);
  const pendingDefinitions = changes.pendingExercises ?? {};

  if (pendingRefs.length > 0) {
    const uniqueRefs = new Set(pendingRefs);

    if (uniqueRefs.size !== pendingRefs.length) {
      errors.push("workout: pendingExerciseRef values must be unique within the plan.");
    }

    for (const ref of uniqueRefs) {
      if (!pendingDefinitions[ref]) {
        errors.push(
          `workout: pendingExercises must define catalog metadata for pendingExerciseRef "${ref}".`,
        );
      }
    }

    for (const ref of Object.keys(pendingDefinitions)) {
      if (!uniqueRefs.has(ref)) {
        errors.push(
          `workout: pendingExercises entry "${ref}" is not referenced by any plan exercise.`,
        );
      }
    }
  }

  plan.days.forEach((day, dayIndex) => {
    day.exercises.forEach((entry, exerciseIndex) => {
      if (!isStructuredWorkoutPlanExercise(entry)) {
        return;
      }

      const path = `days[${dayIndex}].exercises[${exerciseIndex}]`;
      const hasExerciseId = entry.exerciseId != null;
      const hasPendingRef = entry.pendingExerciseRef != null;

      if (options.requireStructuredPlan && !hasExerciseId && !hasPendingRef) {
        errors.push(
          `workout: ${path} must include exerciseId or pendingExerciseRef for catalog-backed proposals.`,
        );
      }

      if (hasExerciseId && hasPendingRef) {
        errors.push(
          `workout: ${path} must not include both exerciseId and pendingExerciseRef.`,
        );
      }
    });
  });

  return errors;
}

export function summarizeWorkoutPlanForCoaching(
  payload: WorkoutPlanPayload,
): WorkoutPlanCoachingSummary {
  const normalized = normalizeWorkoutPlanPayload(payload);

  return {
    title: normalized.title,
    summary: normalized.summary,
    dayCount: normalized.days.length,
    days: normalized.days.map((day) => ({
      weekday: day.weekday,
      focus: day.focus,
      exerciseCount: day.exercises.length,
      exercises: day.exercises.map((entry) => {
        const normalizedEntry = normalizeWorkoutPlanExerciseEntry(entry);

        return {
          name: normalizedEntry.snapshot.name,
          sets: normalizedEntry.sets ?? null,
          reps: normalizedEntry.reps ?? null,
          durationSeconds: normalizedEntry.durationSeconds ?? null,
        };
      }),
    })),
  };
}

export function buildExerciseDisplaySnapshotFromInput(
  input: CreateExerciseInput,
): WorkoutExerciseDisplaySnapshot {
  return {
    name: input.name,
    primaryMuscles: input.primaryMuscles,
    secondaryMuscles: input.secondaryMuscles.length > 0 ? input.secondaryMuscles : undefined,
    equipment: input.equipment,
  };
}

const ISO_DATE_WEEKDAY_ORDER: WorkoutWeekday[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export function resolveWeekdayFromIsoDate(isoDate: string): WorkoutWeekday {
  const date = new Date(`${isoDate}T12:00:00.000Z`);
  return ISO_DATE_WEEKDAY_ORDER[date.getUTCDay()]!;
}

export function findWorkoutPlanDayForWeekday(
  payload: WorkoutPlanPayload,
  weekday: WorkoutWeekday,
): WorkoutPlanDay | null {
  const normalized = normalizeWorkoutPlanPayload(payload);

  return normalized.days.find((day) => day.weekday === weekday) ?? null;
}

export function isStructuredWorkoutSessionExercise(
  entry: WorkoutSessionExerciseEntry,
): entry is WorkoutSessionExercise {
  return typeof entry === "object" && entry !== null && "prescription" in entry;
}

export function deterministicWorkoutSessionExerciseId(
  sessionId: string,
  index: number,
): string {
  const hash = sha256Hex(`${sessionId}:${index}`);

  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `8${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join("-");
}

export function normalizeWorkoutSessionExerciseEntry(
  sessionId: string,
  index: number,
  entry: WorkoutSessionExerciseEntry,
): WorkoutSessionExercise {
  if (isStructuredWorkoutSessionExercise(entry)) {
    return entry;
  }

  const planEntry: WorkoutPlanExerciseEntry =
    typeof entry === "string"
      ? entry
      : {
          name: entry.name,
          target: entry.target ?? null,
          sets: entry.sets ?? null,
          reps: entry.reps ?? null,
          notes: entry.notes ?? null,
        };

  const normalized = normalizeWorkoutPlanExerciseEntry(planEntry);

  return {
    id: deterministicWorkoutSessionExerciseId(sessionId, index),
    exerciseId: normalized.exerciseId ?? null,
    prescription: toWorkoutSessionExercisePrescription(normalized),
    execution: { status: "planned" },
  };
}

export function normalizeWorkoutSessionExercises(
  sessionId: string,
  exercises: readonly WorkoutSessionExerciseEntry[],
): WorkoutSessionExercise[] {
  return exercises.map((entry, index) =>
    normalizeWorkoutSessionExerciseEntry(sessionId, index, entry),
  );
}

export function toWorkoutSessionExercisePrescription(
  exercise: WorkoutPlanExercise,
): WorkoutSessionExercisePrescription {
  return {
    snapshot: exercise.snapshot,
    sets: exercise.sets ?? null,
    reps: exercise.reps ?? null,
    durationSeconds: exercise.durationSeconds ?? null,
    recommendedLoadGuidance: exercise.recommendedLoadGuidance ?? null,
    weightKgGuidance: exercise.weightKgGuidance ?? null,
    restBetweenSetsSeconds: exercise.restBetweenSetsSeconds ?? null,
    restBetweenRepsSeconds: exercise.restBetweenRepsSeconds ?? null,
    circuitGroupId: exercise.circuitGroupId ?? null,
    circuitGroupLabel: exercise.circuitGroupLabel ?? null,
    restInsideCircuitSeconds: exercise.restInsideCircuitSeconds ?? null,
    restBetweenCircuitRoundsSeconds: exercise.restBetweenCircuitRoundsSeconds ?? null,
    notes: exercise.notes ?? null,
  };
}

export interface WorkoutSessionExerciseProgressCounts {
  planned: number;
  completed: number;
  skipped: number;
  adjusted: number;
  total: number;
  completionPercent: number | null;
}

export function countStructuredWorkoutSessionExerciseProgress(
  exercises: readonly WorkoutSessionExerciseEntry[],
): WorkoutSessionExerciseProgressCounts {
  let planned = 0;
  let completed = 0;
  let skipped = 0;
  let adjusted = 0;

  for (const entry of exercises) {
    if (!isStructuredWorkoutSessionExercise(entry)) {
      continue;
    }

    switch (entry.execution.status) {
      case "completed":
        completed += 1;
        break;
      case "skipped":
        skipped += 1;
        break;
      case "adjusted":
        adjusted += 1;
        break;
      default:
        planned += 1;
        break;
    }
  }

  const total = planned + completed + skipped + adjusted;
  const finished = completed + adjusted + skipped;
  const completionPercent =
    total > 0 ? Math.round(((completed + adjusted) / total) * 100) : null;

  return {
    planned,
    completed,
    skipped,
    adjusted,
    total,
    completionPercent: finished === total && skipped === total ? 0 : completionPercent,
  };
}

export function deriveWorkoutSessionStatusFromExercises(
  exercises: readonly WorkoutSessionExerciseEntry[],
  currentStatus: WorkoutSessionStatus,
): WorkoutSessionStatus {
  const progress = countStructuredWorkoutSessionExerciseProgress(exercises);

  if (progress.total === 0) {
    return currentStatus;
  }

  if (progress.planned > 0) {
    return "planned";
  }

  if (progress.skipped === progress.total) {
    return "skipped";
  }

  return "completed";
}

export function findReusableWorkoutSession<
  TSession extends Pick<
    WorkoutSession,
    "id" | "workoutPlanId" | "workoutPlanRevisionId" | "plannedDate"
  >,
>(
  sessions: readonly TSession[],
  match: Pick<WorkoutSession, "workoutPlanId" | "workoutPlanRevisionId" | "plannedDate">,
): TSession | null {
  return (
    sessions.find(
      (session) =>
        session.plannedDate === match.plannedDate &&
        session.workoutPlanId === match.workoutPlanId &&
        session.workoutPlanRevisionId === match.workoutPlanRevisionId,
    ) ?? null
  );
}
