import { z } from "zod";
import { sha256Hex } from "./sha256.js";
import { llmInt } from "./llm-coerce.js";
import { isoDateSchema, isoDateTimeSchema } from "./dates.js";
import {
  createExerciseInputSchema,
  exerciseCatalogMetadataSchema,
  exerciseEquipmentSchema,
  exerciseMuscleSchema,
  type CreateExerciseInput,
} from "./exercises.js";
import { recoveryContextSourceRefSchema } from "./recovery.js";
import { displayContractSchema, computeDerivedValues, clampFieldValue } from "./display-contract.js";

// ---------------------------------------------------------------------------
// Calorie ceiling constant — declared early so Zod schemas can reference it.
// See the helper section later in this file for clampWorkoutCalories and
// deriveActivityCalories.
// ---------------------------------------------------------------------------

/**
 * Maximum calorie value accepted by workout schemas and recompute helpers.
 * Used by clampWorkoutCalories, recompute helpers, domain-error guards, and
 * .max() schema validators.  Change only here; do not hardcode 20000 elsewhere.
 */
export const WORKOUT_CALORIE_MAX = 20000;

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

// WEEKDAY_LABEL_TO_ENUM deleted along with inferWeekdayFromDayLabel (B5 removal, C4 cluster).

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

/**
 * Reps is canonically a string ("8-12", "20", "to failure"), but LLM domain
 * outputs routinely emit plain numbers — accept and normalize them instead of
 * invalidating the whole proposal.
 */
const workoutRepsSchema = z.union([
  z.string().min(1).max(80),
  z
    .number()
    .int()
    .positive()
    .max(10_000)
    .transform((value) => String(value)),
]);

/** Session-level and legacy plan exercise object shape. */
export const workoutExerciseSchema = z.object({
  name: z.string().min(1).max(160),
  target: z.string().min(1).max(240).nullable().optional(),
  sets: z.number().int().positive().max(20).nullable().optional(),
  reps: workoutRepsSchema.nullable().optional(),
  notes: z.string().min(1).max(500).nullable().optional(),
});

export type WorkoutExercise = z.infer<typeof workoutExerciseSchema>;

// B6 removal: string arm deleted. Only the structured object form is accepted.
export const workoutExercisePayloadSchema = workoutExerciseSchema;

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
  // LLMs may emit decimal values for integer fields; round instead of failing.
  sets: llmInt(z.number().positive().max(20)).nullable().optional(),
  reps: workoutRepsSchema.nullable().optional(),
  durationSeconds: llmInt(z.number().positive().max(7200)).nullable().optional(),
  recommendedLoadGuidance: z.string().min(1).max(240).nullable().optional(),
  weightKgGuidance: z.number().positive().max(500).nullable().optional(),
  restBetweenSetsSeconds: llmInt(z.number().nonnegative().max(600)).nullable().optional(),
  restBetweenRepsSeconds: llmInt(z.number().nonnegative().max(120)).nullable().optional(),
  circuitGroupId: z.string().min(1).max(40).nullable().optional(),
  circuitGroupLabel: z.string().min(1).max(80).nullable().optional(),
  restInsideCircuitSeconds: llmInt(z.number().nonnegative().max(600)).nullable().optional(),
  restBetweenCircuitRoundsSeconds: llmInt(z.number().nonnegative().max(900)).nullable().optional(),
  notes: z.string().min(1).max(500).nullable().optional(),
  /**
   * LLM-sourced approximate calorie burn for this exercise (kcal).
   * Populated by ActionResolver from the workout domain LLM's estimate and
   * carried into plan revisions. Max 5 000 kcal per exercise is a sane ceiling.
   * Never set by the decision-maker, nutrition domain, or any user-facing form.
   */
  estimatedCalorieBurn: llmInt(z.number().nonnegative().max(5000)).optional(),
  /** Populated at read/materialization time; not persisted on revisions. */
  catalog: exerciseCatalogMetadataSchema.optional(),
});

export type WorkoutPlanExercise = z.infer<typeof workoutPlanExerciseSchema>;

// B6 removal: string arm deleted. Legacy object (workoutExerciseSchema) and structured
// catalog-backed (workoutPlanExerciseSchema) forms remain.
// KEEP: isLegacyWorkoutPlanExerciseObject handles the legacy OBJECT form — only the STRING
// arm was in B6 scope.
export const workoutPlanExerciseEntrySchema = z.union([
  workoutExerciseSchema,
  workoutPlanExerciseSchema,
]);

export type WorkoutPlanExerciseEntry = z.infer<typeof workoutPlanExerciseEntrySchema>;

// B5 removal: free-text `day` field and the `day`-as-fallback `.refine` deleted.
// `weekday` is now required. Pre-launch disposable DB — no backfill needed.
export const workoutPlanDaySchema = z.object({
  weekday: workoutWeekdaySchema,
  focus: z.string().min(1).max(160),
  exercises: z.array(workoutPlanExerciseEntrySchema).max(20).default([]),
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

/**
 * Enum for who provided the session calorie estimate.
 * - 'workout_llm'  — populated by ActionResolver from the workout domain LLM's
 *                    domain_answer.workoutCalorieEstimate; the only valid
 *                    programmatic source.
 * - 'user_manual'  — user explicitly entered or overrode the value.
 * The decision-maker LLM and all non-workout domain LLMs must NEVER set this.
 */
export const calorieEstimateProvenanceSchema = z.enum(["workout_llm", "user_manual"]);

export type CalorieEstimateProvenance = z.infer<typeof calorieEstimateProvenanceSchema>;

export const workoutPlanPayloadSchema = z.object({
  title: z.string().min(1).max(160),
  summary: z.string().min(1).max(1000),
  days: z.array(workoutPlanDaySchema).min(1).max(14),
  notes: z.array(z.string().min(1).max(240)).max(20).default([]),
  adaptationMetadata: workoutPlanAdaptationMetadataSchema.optional(),
  /**
   * LLM-sourced approximate calorie burn for the whole session (kcal).
   * Populated by ActionResolver from the workout domain LLM only.
   * Max 20 000 kcal is an intentionally high ceiling to accommodate long
   * endurance sessions; domain validation enforces a saner practical max.
   * Revisions carry this field so accepted proposals preserve the estimate.
   * If present, calorieEstimateProvenance MUST also be set.
   * LLMs may emit decimals; round to int instead of failing.
   */
  estimatedSessionCalorieBurn: llmInt(z.number().nonnegative().max(WORKOUT_CALORIE_MAX)).optional(),
  /**
   * Who provided estimatedSessionCalorieBurn. Required whenever
   * estimatedSessionCalorieBurn is present (enforced in
   * getWorkoutProposalDomainErrors).
   */
  calorieEstimateProvenance: calorieEstimateProvenanceSchema.optional(),
  /**
   * Trusted kcal/hour burn rate from the workout domain LLM.
   * Used together with displayContract to recompute estimatedSessionCalorieBurn
   * server-side on accept (backend re-computes; client total is discarded).
   * Sourced from workoutCaloriePerHourRate in domain_answer (ActionResolver stamps it).
   * Max 5000 kcal/hour is a generous ceiling for any activity.
   * Never set by the decision-maker, non-workout domains, or client override.
   * LLMs may emit decimals; round to int instead of failing.
   */
  caloriePerHourRate: llmInt(z.number().nonnegative().max(5000)).optional(),
  /**
   * Declarative display contract for the frontend editable card.
   * Render metadata only — DROPPED by stripWorkoutPlanProposalExtras before
   * the plan revision is written. Never persisted on revisions.
   */
  displayContract: displayContractSchema.optional(),
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
  perceivedEffort: z.number().int().min(1).max(10).nullable().optional(),
  perceivedDifficulty: z.number().int().min(1).max(10).nullable().optional(),
  discomfortFlag: z.boolean().nullable().optional(),
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
  perceivedEffort: z.number().int().min(1).max(10).nullable().optional(),
  perceivedDifficulty: z.number().int().min(1).max(10).nullable().optional(),
  discomfortFlag: z.boolean().nullable().optional(),
  /**
   * How long the user actually spent on this exercise, in minutes.
   * USER-SET ONLY — never populated by any LLM or proposal.
   * Set on the session completion/feedback path; not part of the plan payload.
   * Max 600 min (10 h) is a generous upper bound for edge cases.
   */
  userCompletionTimeMinutes: z.number().int().positive().max(600).nullable().optional(),
});

export type WorkoutSessionExerciseExecution = z.infer<
  typeof workoutSessionExerciseExecutionSchema
>;

export const workoutSessionExercisePrescriptionSchema = z.object({
  snapshot: workoutExerciseDisplaySnapshotSchema,
  sets: z.number().int().positive().max(20).nullable().optional(),
  reps: workoutRepsSchema.nullable().optional(),
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
  /** Populated at read/materialization time; not persisted on sessions. */
  catalog: exerciseCatalogMetadataSchema.optional(),
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
  workoutPlanId: z.string().uuid().nullable(),
  workoutPlanRevisionId: z.string().uuid().nullable(),
  plannedDate: isoDateSchema,
  title: z.string().min(1).max(160),
  status: workoutSessionStatusSchema,
  source: z.enum(["planned", "ad_hoc"]).default("planned"),
  activityType: z.string().min(1).max(120).nullable().optional(),
  estimatedCalories: z.number().int().nonnegative().max(WORKOUT_CALORIE_MAX).nullable().optional(),
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
    perceivedEffort: z.number().int().min(1).max(10).nullable().optional(),
    perceivedDifficulty: z.number().int().min(1).max(10).nullable().optional(),
    discomfortFlag: z.boolean().nullable().optional(),
  })
  .refine(
    (value) =>
      value.status != null ||
      value.notes !== undefined ||
      value.actualWeightKg !== undefined ||
      value.actualReps !== undefined ||
      value.loadAdjustmentNotes !== undefined ||
      value.perceivedEffort !== undefined ||
      value.perceivedDifficulty !== undefined ||
      value.discomfortFlag !== undefined,
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
  /** Chat attachment that sourced this proposal; validated for ownership separately. */
  attachmentRefId: z.string().uuid().optional(),
});

export type WorkoutPlanProposalExtras = z.infer<typeof workoutPlanProposalExtrasSchema>;

export const workoutPlanProposalChangesSchema = workoutPlanPayloadSchema.merge(
  workoutPlanProposalExtrasSchema,
);

/**
 * Payload for a log_workout_activity proposal.
 *
 * Logs a one-off activity performed by the user (e.g. "played volleyball 90 min").
 * NEVER creates a workout plan revision — it creates an ad_hoc workout_session row on accept.
 *
 * Validation invariant: estimatedCalories OR ratePerHour must be provided so the
 * backend can always derive a calorie estimate. The backend recomputes the final
 * value from the trusted ratePerHour; any client-submitted estimatedCalories is
 * treated as an advisory fallback only.
 */
export const logWorkoutActivityProposalPayloadSchema = z
  .object({
    activityType: z.string().min(1).max(120),
    title: z.string().min(1).max(160),
    // LLMs may emit decimal durations (e.g. 45.5 min); round to int.
    durationMinutes: llmInt(z.number().positive().max(600)),
    intensity: z.enum(["light", "moderate", "vigorous"]).optional(),
    /**
     * ISO datetime of when the activity was performed.
     * Reuses the same datetime schema as nutrition incidents.
     */
    performedAt: isoDateTimeSchema,
    /**
     * Advisory calorie estimate (kcal). Ignored on accept in favour of
     * ratePerHour * durationMinutes when ratePerHour is present.
     * Never trusted as-is from the client; the backend always recomputes
     * from the stored ratePerHour or falls back to this value.
     * LLMs may emit decimals; round to int instead of failing.
     */
    estimatedCalories: llmInt(z.number().nonnegative().max(WORKOUT_CALORIE_MAX)).optional(),
    /**
     * Trusted kcal/hour rate from the workout domain LLM.
     * Backend uses this to compute final calories: round(ratePerHour * durationMinutes / 60).
     * Max 3000 kcal/hr is a generous ceiling for any typical activity.
     * Never set by the decision-maker, non-workout domains, or client override.
     * LLMs may emit decimals; round to int instead of failing.
     */
    ratePerHour: llmInt(z.number().positive().max(3000)).optional(),
    /**
     * Optional display contract for a client-side editable activity card.
     * Stripped before the workout_session row is written.
     */
    displayContract: displayContractSchema.optional(),
  })
  .strict()
  .refine(
    (payload) =>
      payload.estimatedCalories !== undefined || payload.ratePerHour !== undefined,
    {
      message:
        "log_workout_activity: estimatedCalories or ratePerHour must be provided.",
    },
  );

export type LogWorkoutActivityProposalPayload = z.infer<
  typeof logWorkoutActivityProposalPayloadSchema
>;

/**
 * Domain-level validation errors for a log_workout_activity proposal.
 * Mirrors the shape of getWorkoutPlanDomainErrors — validates calories sanity
 * and rejects unsupported medical/diagnosis wording.
 */
export function getLogWorkoutActivityDomainErrors(
  payload: LogWorkoutActivityProposalPayload,
): string[] {
  const errors: string[] = [];

  // Bound calorie sanity: ratePerHour * durationMinutes / 60 must not exceed WORKOUT_CALORIE_MAX.
  if (payload.ratePerHour !== undefined) {
    const computed = deriveActivityCalories(payload.ratePerHour, payload.durationMinutes);

    if (computed > WORKOUT_CALORIE_MAX) {
      errors.push(
        "log_workout_activity: Computed calorie estimate (ratePerHour × durationMinutes / 60) exceeds 20 000 kcal.",
      );
    }
  }

  if (
    payload.estimatedCalories !== undefined &&
    payload.ratePerHour !== undefined
  ) {
    const computed = deriveActivityCalories(payload.ratePerHour, payload.durationMinutes);
    const diff = Math.abs(computed - payload.estimatedCalories);

    if (diff > 2000) {
      errors.push(
        "log_workout_activity: estimatedCalories differs substantially from the ratePerHour-based estimate.",
      );
    }
  }

  // Reject medical/diagnosis wording in all text fields.
  const textsToCheck = [payload.activityType, payload.title];

  for (const text of textsToCheck) {
    if (UNSAFE_WORKOUT_MEDICAL_PATTERNS.some((pattern) => pattern.test(text))) {
      errors.push(
        "log_workout_activity: Activity copy must avoid diagnosis, treatment, or other unsupported medical wording.",
      );
      break;
    }
  }

  return errors;
}

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

// inferWeekdayFromDayLabel deleted (B5 removal, C4 cluster) — free-text day label no longer
// accepted by workoutPlanDaySchema; weekday is now required.

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
  // B6 removal: typeof entry === "string" branch deleted.
  if (isStructuredWorkoutPlanExercise(entry)) {
    return entry;
  }

  // Legacy object form (WorkoutExercise with name/target/sets/reps/notes).
  // KEEP: isLegacyWorkoutPlanExerciseObject — only the string arm was in B6 scope.
  return {
    snapshot: { name: entry.name },
    sets: entry.sets ?? null,
    reps: entry.reps ?? null,
    recommendedLoadGuidance: entry.target ?? null,
    notes: entry.notes ?? null,
  };
}

export function normalizeWorkoutPlanDay(day: WorkoutPlanDay): WorkoutPlanDay {
  // B5 removal: free-text `day` fallback deleted; weekday is required and already set.
  return {
    ...day,
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
  // B5 removal: day.day branch deleted (free-text label gone).
  // B6 removal: typeof entry === "string" branch deleted.
  const texts = [payload.title, payload.summary, ...payload.notes];

  for (const day of payload.days) {
    texts.push(day.focus);

    for (const entry of day.exercises) {
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

      // Legacy object form (WorkoutExercise with name/target/sets/reps/notes).
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

  // B5 removal: unresolvedLegacyLabels path and day.day fallback deleted.
  // B6 removal: typeof entry === "string" check deleted.
  const resolvedWeekdays: WorkoutWeekday[] = [];

  for (const day of payload.days) {
    resolvedWeekdays.push(day.weekday);
  }

  if (new Set(resolvedWeekdays).size !== resolvedWeekdays.length) {
    errors.push("workout: Weekday assignments must be unique across plan days.");
  }

  if (requireStructuredPlan) {
    // weekday is now required on workoutPlanDaySchema — no need to re-check for missing.

    payload.days.forEach((day, dayIndex) => {
      day.exercises.forEach((entry, exerciseIndex) => {
        // KEEP: isLegacyWorkoutPlanExerciseObject — legacy OBJECT form still checked here.
        if (isLegacyWorkoutPlanExerciseObject(entry)) {
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

export function getResolvedWorkoutPlanCatalogErrors(payload: WorkoutPlanPayload): string[] {
  const errors: string[] = [];

  payload.days.forEach((day, dayIndex) => {
    day.exercises.forEach((entry, exerciseIndex) => {
      if (!isStructuredWorkoutPlanExercise(entry)) {
        errors.push(
          `workout: days[${dayIndex}].exercises[${exerciseIndex}] must use structured catalog-backed exercises.`,
        );
        return;
      }

      if (!entry.exerciseId) {
        errors.push(
          `workout: days[${dayIndex}].exercises[${exerciseIndex}] must resolve to exerciseId before apply.`,
        );
      }
    });
  });

  return errors;
}

export function stripWorkoutPlanProposalExtras(
  changes: WorkoutPlanProposalChanges,
): WorkoutPlanPayload {
  const {
    pendingExercises: _pendingExercises,
    displayContract: _displayContract,
    caloriePerHourRate: _caloriePerHourRate,
    ...plan
  } = changes;

  return workoutPlanPayloadSchema.parse(plan);
}

// ---------------------------------------------------------------------------
// Calorie helpers — clamp and formula (WORKOUT_CALORIE_MAX declared above)
// ---------------------------------------------------------------------------

/**
 * Clamp a raw calorie value to [0, WORKOUT_CALORIE_MAX] after rounding.
 * Use at every site that produces a calorie integer from a float computation.
 */
export function clampWorkoutCalories(value: number): number {
  return Math.min(WORKOUT_CALORIE_MAX, Math.max(0, Math.round(value)));
}

/**
 * Derive an activity calorie value from rate × duration.
 *
 * Formula: Math.round(ratePerHour * durationMinutes / 60)
 * When opts.clampMax is provided, the result is further clamped to [0, clampMax].
 *
 * Use at sites that compute calories from a rate-per-hour and duration in minutes.
 * Do NOT route displayContract recompute helpers through this — those go through
 * computeDerivedValues / rate_per_hour to keep the displayContract formula path
 * self-contained.
 *
 * @param ratePerHour     kcal/hour burn rate.
 * @param durationMinutes Activity duration in minutes.
 * @param opts.clampMax   Optional upper clamp (pass WORKOUT_CALORIE_MAX for accept-time paths).
 */
export function deriveActivityCalories(
  ratePerHour: number,
  durationMinutes: number,
  opts?: { clampMax?: number },
): number {
  const raw = Math.round((ratePerHour * durationMinutes) / 60);

  if (opts?.clampMax !== undefined) {
    return Math.min(opts.clampMax, Math.max(0, raw));
  }

  return raw;
}

// ---------------------------------------------------------------------------
// Recompute result types and generalized contract-driven recompute
// ---------------------------------------------------------------------------

/**
 * Descriptor that tells recomputeCaloriesFromDisplayContract which field keys
 * on the proposal payload carry the trusted rate, the total calorie, and
 * (optionally) the provenance flag.
 *
 * Use:
 *   - Workout-plan intents: { rateField: 'caloriePerHourRate', totalField: 'estimatedSessionCalorieBurn', provenanceField: 'calorieEstimateProvenance' }
 *   - log_workout_activity:  { rateField: 'ratePerHour', totalField: 'estimatedCalories' }
 */
export interface CalorieRecomputeFields {
  /** Key of the trusted kcal/hour rate field on the payload. */
  rateField: string;
  /** Key of the integer calorie total field on the payload. */
  totalField: string;
  /** Optional key of the provenance field; when set, will be forced to 'workout_llm'. */
  provenanceField?: string;
}

/**
 * Result type for recomputeCaloriesFromDisplayContract (and the plan-specific wrapper).
 *
 * `recomputedTotal` is the fresh trusted calorie value when the recompute
 * actually produced a primary-total (non-null/non-undefined, finite number).
 * It is `null` when the recompute was a no-op — i.e. no stored displayContract,
 * no isPrimaryTotal derived entry, or no resolvable rate input.
 *
 * Callers MUST check `recomputedTotal !== null` (NOT the presence of a displayContract) to
 * decide whether to preserve the freshly computed total or to fall back to
 * hard-pinning the stored calorie fields.
 */
export interface RecomputeCaloriesResult<T extends Record<string, unknown>> {
  payload: T;
  /** The fresh recomputed total written into `payload`, or null when the recompute was a no-op. */
  recomputedTotal: number | null;
}

/** Legacy alias kept for the plan-specific call sites; payload key is `changes`. */
export interface WorkoutProposalRecomputeResult {
  changes: WorkoutPlanProposalChanges;
  /** The fresh recomputed total that was written into `changes`, or null if no-op. */
  recomputedTotal: number | null;
}

/**
 * Generalized contract-driven calorie recompute.
 *
 * Recomputes the calorie total on `effective` using:
 *   - the displayContract STRUCTURE from `stored` (never the client's),
 *   - the trusted rate from `stored[fields.rateField]` (never the client's),
 *   - the client-submitted EDITABLE field values from `clientFieldValues` (each
 *     clamped to the stored field's own min/max via clampFieldValue),
 *   - the `isPrimaryTotal` derived entry as the target.
 *
 * Safety invariants (must never be weakened):
 *  - `stored` is the authoritative source for the displayContract STRUCTURE and
 *    the trusted rate.  The client cannot substitute a different contract or a
 *    higher rate.
 *  - `clientFieldValues` provides editable-field overrides ONLY.  Non-editable
 *    fields always use the stored field.value.
 *  - The rate input field (inputs[0] of the rate_per_hour derived with isPrimaryTotal;
 *    fallback: any field whose key equals fields.rateField) is ALWAYS overwritten
 *    with the trusted stored rate, regardless of what the client submitted.
 *  - The resulting total is `Math.round(primaryTotal)` clamped to [0, WORKOUT_CALORIE_MAX].
 *  - When `fields.provenanceField` is set, it is forced to the stored value or 'workout_llm'.
 *  - Returns `{ payload: effective, recomputedTotal: null }` when:
 *      · stored has no displayContract,
 *      · the stored displayContract has no isPrimaryTotal derived entry, or
 *      · the rate input key is unresolvable.
 *    In all null cases the CALLER must hard-pin the stored calorie fields (C1 fix).
 *
 * @param effective         The client-submitted payload (calorie fields may be present
 *                          but are ignored in favour of the recomputed value).
 * @param stored            The STORED proposal's payload — source of the trusted rate
 *                          and the displayContract structure.
 * @param clientFieldValues Editable field values submitted by the client, keyed by
 *                          field key.  Values for non-editable fields are silently discarded.
 * @param fields            Descriptor identifying which keys carry rate / total / provenance.
 */
export function recomputeCaloriesFromDisplayContract<T extends Record<string, unknown>>(
  effective: T,
  stored: T,
  clientFieldValues: Record<string, number>,
  fields: CalorieRecomputeFields,
): RecomputeCaloriesResult<T> {
  // Use the STORED contract as the authoritative structure.
  const storedContract = (stored as Record<string, unknown>)[
    "displayContract"
  ] as import("./display-contract.js").DisplayContract | undefined;

  // No stored displayContract — nothing to recompute.
  if (!storedContract) {
    return { payload: effective, recomputedTotal: null };
  }

  // Read the trusted kcal/hour rate from the STORED payload (never the client value).
  const trustedRate = (stored as Record<string, unknown>)[fields.rateField] as number | undefined;

  // Identify the rate input field:
  //   Primary: inputs[0] of the rate_per_hour derived entry that has isPrimaryTotal.
  //   Fallback: any field whose key equals fields.rateField.
  const primaryTotalEntry = storedContract.derived.find(
    (d) => d.isPrimaryTotal && d.op === "rate_per_hour",
  );
  const rateInputKey: string | undefined =
    primaryTotalEntry?.inputs[0] ??
    storedContract.fields.find((f) => f.key === fields.rateField)?.key;

  // Build fieldValues from the stored contract's own field values as the base,
  // then overlay clamped client values for editable fields only.
  const fieldValues: Record<string, number> = {};

  for (const field of storedContract.fields) {
    if (field.value === undefined) continue;

    if (field.editable && field.key in clientFieldValues) {
      // Apply clamped client override for this editable field.
      fieldValues[field.key] = clampFieldValue(field, clientFieldValues[field.key]!);
    } else {
      // Non-editable field or no client value: keep the stored value.
      fieldValues[field.key] = field.value;
    }
  }

  // Always overwrite the rate input field with the trusted stored rate so the
  // rate_per_hour computation cannot be inflated by a client-submitted value.
  if (trustedRate !== undefined && rateInputKey !== undefined) {
    fieldValues[rateInputKey] = trustedRate;
  }

  // Find the primary total derived entry (any op, not just rate_per_hour).
  const primaryTotalDerived = storedContract.derived.find((d) => d.isPrimaryTotal);

  if (!primaryTotalDerived) {
    // No primary total declared — recompute is a no-op.
    // Return null so the caller knows to hard-pin the stored calorie fields rather
    // than trust whatever the client supplied.
    return { payload: effective, recomputedTotal: null };
  }

  const derivedResults = computeDerivedValues(storedContract, fieldValues);
  const rawTotal = derivedResults[primaryTotalDerived.target];

  if (rawTotal === undefined || !isFinite(rawTotal)) {
    // Rate input unresolvable — treat as no-op so caller pins stored values.
    return { payload: effective, recomputedTotal: null };
  }

  // Clamp to [0, WORKOUT_CALORIE_MAX] — generic output safety floor.
  const recomputed = clampWorkoutCalories(rawTotal);

  const result: Record<string, unknown> = {
    ...(effective as Record<string, unknown>),
    [fields.totalField]: recomputed,
  };

  // Force provenance when descriptor declares it.
  if (fields.provenanceField !== undefined) {
    const storedProvenance = (stored as Record<string, unknown>)[fields.provenanceField];
    result[fields.provenanceField] = storedProvenance ?? "workout_llm";
  }

  return {
    payload: result as T,
    recomputedTotal: recomputed,
  };
}

/**
 * Result type for recomputeWorkoutProposalCaloriesFromDisplayContract.
 *
 * `recomputedTotal` is the fresh trusted calorie value when the recompute
 * actually produced a primary-total (non-null/non-undefined, finite number).
 * It is `null` when the recompute was a no-op — i.e. no stored displayContract,
 * no isPrimaryTotal derived entry, or no resolvable rate input.
 *
 * Callers MUST check `recomputedTotal` (not the presence of a displayContract) to
 * decide whether to preserve the freshly computed estimatedSessionCalorieBurn or to
 * fall back to hard-pinning the stored value.
 */

/**
 * Recompute estimatedSessionCalorieBurn exclusively from the STORED displayContract
 * structure and STORED trustedRate, applying only the client-submitted EDITABLE field
 * values (clamped to the stored field's own min/max).
 *
 * Safety invariants (must never be weakened):
 *  - storedChanges is the source of the displayContract STRUCTURE and the
 *    caloriePerHourRate.  The client cannot substitute a different contract or a
 *    higher rate.
 *  - clientFieldValues is the source of editable-field overrides ONLY.
 *    Non-editable fields always use the stored field.value.
 *  - The rate input field (inputs[0] of the rate_per_hour derived with isPrimaryTotal;
 *    fallback: any field whose key === 'caloriePerHourRate') is ALWAYS set to the
 *    trusted stored rate, regardless of what the client submitted.
 *  - Each editable field override is clamped via clampFieldValue (stored field min/max).
 *  - The resulting estimatedSessionCalorieBurn is Math.round(primaryTotal) and bounded
 *    to [0, 20000] to match workoutPlanPayloadSchema.estimatedSessionCalorieBurn.
 *    This output clamp is the generic safety floor for extreme values.
 *  - calorieEstimateProvenance is hardcoded to 'workout_llm'.
 *  - If no displayContract is present on the STORED changes, the effectiveChanges are
 *    returned unchanged and recomputedTotal is null.
 *  - If the stored displayContract has NO isPrimaryTotal derived entry, the
 *    effectiveChanges are returned unchanged and recomputedTotal is null.  The caller
 *    MUST treat this as a no-op and pin the stored calorie fields (not trust whatever
 *    the client supplied), because a schema-valid displayContract that lacks
 *    isPrimaryTotal cannot produce a trusted total.
 *
 * @param effectiveChanges  The client-submitted proposedChanges (calorie fields may be
 *                          present but are ignored in favour of the recomputed value).
 * @param storedChanges     The STORED proposal's proposedChanges — source of the
 *                          trusted rate and the displayContract structure.
 * @param clientFieldValues Editable field values submitted by the client, keyed by
 *                          field key.  Values for non-editable fields are silently
 *                          discarded.
 * @returns WorkoutProposalRecomputeResult with `changes` containing the rebuilt
 *          proposedChanges and `recomputedTotal` set to the fresh value or null when
 *          the recompute was a no-op (callers must pin stored calorie fields in that
 *          case).
 */
export function recomputeWorkoutProposalCaloriesFromDisplayContract(
  effectiveChanges: WorkoutPlanProposalChanges,
  storedChanges: WorkoutPlanProposalChanges,
  clientFieldValues: Record<string, number>,
): WorkoutProposalRecomputeResult {
  const result = recomputeCaloriesFromDisplayContract(
    effectiveChanges as Record<string, unknown>,
    storedChanges as Record<string, unknown>,
    clientFieldValues,
    {
      rateField: "caloriePerHourRate",
      totalField: "estimatedSessionCalorieBurn",
      provenanceField: "calorieEstimateProvenance",
    },
  );

  return {
    changes: result.payload as WorkoutPlanProposalChanges,
    recomputedTotal: result.recomputedTotal,
  };
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

      // Bound per-exercise calorie estimate.
      if (entry.estimatedCalorieBurn !== undefined) {
        if (!Number.isInteger(entry.estimatedCalorieBurn) || entry.estimatedCalorieBurn < 0) {
          errors.push(
            `workout: ${path}.estimatedCalorieBurn must be a non-negative integer.`,
          );
        } else if (entry.estimatedCalorieBurn > 5000) {  // per-exercise ceiling stays 5000
          errors.push(
            `workout: ${path}.estimatedCalorieBurn must not exceed 5 000 kcal.`,
          );
        }
      }
    });
  });

  // Validate session-level calorie estimate fields on the payload.
  const sessionCalorie = changes.estimatedSessionCalorieBurn;
  const sessionProvenance = changes.calorieEstimateProvenance;

  if (sessionCalorie !== undefined) {
    if (!Number.isInteger(sessionCalorie) || sessionCalorie < 0) {
      errors.push(
        "workout: estimatedSessionCalorieBurn must be a non-negative integer.",
      );
    } else if (sessionCalorie > WORKOUT_CALORIE_MAX) {
      errors.push(
        "workout: estimatedSessionCalorieBurn must not exceed 20 000 kcal.",
      );
    }

    if (sessionProvenance === undefined) {
      errors.push(
        "workout: calorieEstimateProvenance must be present when estimatedSessionCalorieBurn is set.",
      );
    }
  }

  if (sessionProvenance !== undefined && sessionCalorie === undefined) {
    errors.push(
      "workout: calorieEstimateProvenance must not be set without estimatedSessionCalorieBurn.",
    );
  }

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

  // B6 removal: typeof entry === "string" branch deleted.
  const planEntry: WorkoutPlanExerciseEntry = {
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
