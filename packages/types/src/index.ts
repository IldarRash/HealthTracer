import { z } from "zod";
import { isoDateSchema, isoDateTimeSchema } from "./dates.js";
import {
  coachingNotesSchema,
  goalHorizonsStoredOnGoalsSchema,
  longevityDirectionSchema,
  MAX_ACTIVE_WEEKLY_FOCUS,
  onboardingQuarterlyGoalSchema,
} from "./goal-hierarchy.js";
import { habitPlanPayloadSchema } from "./habits.js";
import {
  habitsProgressAggregateSchema,
  nutritionProgressAggregateSchema,
  recipesProgressAggregateSchema,
  todayProgressAggregateSchema,
  weeklyReviewCandidateProposalSchema,
  weeklyReviewLaneOutcomeSchema,
  weeklyReviewPackMetaSchema,
} from "./progress-cross-domain.js";
import { recoveryProgressAggregateSchema } from "./recovery.js";
import { todayChecklistPayloadSchema } from "./today.js";
import {
  recipeConfidenceBandSchema,
  recipeProvenanceSchema,
} from "./recipes.js";
import {
  adaptWorkoutPlanFromProgressChangesSchema,
  workoutPlanProposalChangesSchema,
} from "./workouts.js";
import { saveBodyAnalysisProposalPayloadSchema } from "./body-composition.js";
// nutrition-meal.ts holds the canonical nutrition meal/plan schemas.
// NutritionMealSlot and NutritionPlanPayload are used in local function signatures.
import {
  type NutritionMealSlot,
  type NutritionPlanPayload,
} from "./nutrition-meal.js";
// user-enums.ts, ai-proposal.ts, and chat-turn.ts are the canonical homes for
// proposal domain schemas. Index.ts re-exports from them for backward compat.
import {
  activityLevelSchema,
  goalPrioritySchema,
  goalStatusSchema,
  goalTypeSchema,
  trainingExperienceSchema,
} from "./user-enums.js";
// ai-proposal.ts holds the canonical proposal domain schemas.
// Only import names that are actually used in local expressions below.
import {
  adaptHabitPlanFromProgressChangesSchema,
  adjustNutritionPlanFromProgressChangesSchema,
  chatProposalRevisionSchema,
  createGoalProposalChangesSchema,
  emptyProposalChangesSchema,
  nutritionPlanPayloadSchema,
  profileProposalChangesSchema,
  recipeRecommendationProposalPayloadSchema,
  updateGoalProposalChangesSchema,
  type AdjustNutritionPlanFromProgressChanges,
  type HabitPlanProposalChanges,
  type NutritionPlanProposalChanges,
  type ProposalIntent,
} from "./ai-proposal.js";

export { isoDateSchema, isoDateTimeSchema, isCalendarValidIsoDate, isoDateOnly } from "./dates.js";

export const apiStatusSchema = z.enum(["ok"]);

export type ApiStatus = z.infer<typeof apiStatusSchema>;

export const healthResponseSchema = z.object({
  status: apiStatusSchema,
  service: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

// Re-exported from user-enums.ts (canonical home).
export {
  activityLevelSchema,
  goalPrioritySchema,
  goalStatusSchema,
  goalTypeSchema,
  trainingExperienceSchema,
} from "./user-enums.js";
export type {
  ActivityLevel,
  GoalPriority,
  GoalStatus,
  GoalType,
  TrainingExperience,
} from "./user-enums.js";

export const userLocaleSchema = z.enum(["en", "ru"]);
export type UserLocale = z.infer<typeof userLocaleSchema>;

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(1).max(120).nullable(),
  timezone: z.string().min(1).max(80),
  locale: userLocaleSchema,
  onboardingCompletedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type User = z.infer<typeof userSchema>;

export const updateCurrentUserSchema = z.object({
  displayName: z.string().min(1).max(120).optional(),
  timezone: z.string().min(1).max(80).optional(),
  locale: userLocaleSchema.optional(),
});

export type UpdateCurrentUserInput = z.infer<typeof updateCurrentUserSchema>;

export const userProfileSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  birthDate: isoDateSchema.nullable(),
  heightCm: z.number().int().positive().max(260).nullable(),
  baselineWeightKg: z.number().positive().max(500).nullable(),
  activityLevel: activityLevelSchema.nullable(),
  trainingExperience: trainingExperienceSchema.nullable(),
  preferences: z.array(z.string().min(1).max(160)).default([]),
  constraints: z.array(z.string().min(1).max(160)).default([]),
  longevityDirection: longevityDirectionSchema.nullable(),
  longevityDirectionTags: z.array(z.string().min(1).max(80)).max(10).default([]),
  coachingNotes: coachingNotesSchema.default([]),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type UserProfile = z.infer<typeof userProfileSchema>;

export const upsertUserProfileSchema = z.object({
  birthDate: isoDateSchema.nullable().optional(),
  heightCm: z.number().int().positive().max(260).nullable().optional(),
  baselineWeightKg: z.number().positive().max(500).nullable().optional(),
  activityLevel: activityLevelSchema.nullable().optional(),
  trainingExperience: trainingExperienceSchema.nullable().optional(),
  preferences: z.array(z.string().min(1).max(160)).max(30).optional(),
  constraints: z.array(z.string().min(1).max(160)).max(30).optional(),
  longevityDirection: longevityDirectionSchema.nullable().optional(),
  longevityDirectionTags: z.array(z.string().min(1).max(80)).max(10).optional(),
  coachingNotes: coachingNotesSchema.optional(),
});

export type UpsertUserProfileInput = z.infer<typeof upsertUserProfileSchema>;

export const goalTargetSchema = z.record(z.string(), z.unknown());

export const goalSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  type: goalTypeSchema,
  status: goalStatusSchema,
  priority: goalPrioritySchema,
  title: z.string().min(1).max(160),
  target: goalTargetSchema,
  horizon: goalHorizonsStoredOnGoalsSchema.nullable(),
  parentGoalId: z.string().uuid().nullable(),
  weekStart: isoDateSchema.nullable(),
  startDate: isoDateSchema.nullable(),
  targetDate: isoDateSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type Goal = z.infer<typeof goalSchema>;

export const createGoalSchema = z.object({
  type: goalTypeSchema,
  priority: goalPrioritySchema.default("secondary"),
  title: z.string().min(1).max(160),
  target: goalTargetSchema.default({}),
  horizon: goalHorizonsStoredOnGoalsSchema.nullable().optional(),
  parentGoalId: z.string().uuid().nullable().optional(),
  weekStart: isoDateSchema.nullable().optional(),
  startDate: isoDateSchema.nullable().optional(),
  targetDate: isoDateSchema.nullable().optional(),
});

export type CreateGoalInput = z.infer<typeof createGoalSchema>;

export const updateGoalSchema = z.object({
  type: goalTypeSchema.optional(),
  status: goalStatusSchema.optional(),
  priority: goalPrioritySchema.optional(),
  title: z.string().min(1).max(160).optional(),
  target: goalTargetSchema.optional(),
  horizon: goalHorizonsStoredOnGoalsSchema.nullable().optional(),
  parentGoalId: z.string().uuid().nullable().optional(),
  weekStart: isoDateSchema.nullable().optional(),
  startDate: isoDateSchema.nullable().optional(),
  targetDate: isoDateSchema.nullable().optional(),
});

export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;

export const onboardingUserSchema = z.object({
  displayName: z.string().min(1).max(120),
  timezone: z.string().min(1).max(80),
});

export const onboardingProfileSchema = upsertUserProfileSchema
  .omit({ longevityDirectionTags: true })
  .extend({
    birthDate: isoDateSchema,
    heightCm: z.number().int().positive().max(260),
    baselineWeightKg: z.number().positive().max(500),
    longevityDirection: longevityDirectionSchema,
  });

export const onboardingSchema = z.object({
  user: onboardingUserSchema,
  profile: onboardingProfileSchema,
  quarterlyGoal: onboardingQuarterlyGoalSchema,
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

export const coachingHierarchySummarySchema = z.object({
  direction: longevityDirectionSchema.nullable(),
  activeQuarterlyGoal: goalSchema.nullable(),
  weeklyFocus: z.array(goalSchema).max(MAX_ACTIVE_WEEKLY_FOCUS),
});

export type CoachingHierarchySummary = z.infer<typeof coachingHierarchySummarySchema>;

export const currentUserStateSchema = z.object({
  user: userSchema,
  profile: userProfileSchema.nullable(),
  goals: z.array(goalSchema),
  onboardingCompleted: z.boolean(),
  hierarchy: coachingHierarchySummarySchema,
});

export type CurrentUserState = z.infer<typeof currentUserStateSchema>;

// Re-exported from chat-turn.ts (canonical home).
export {
  chatMessageRoleSchema,
  chatMessageSchema,
  chatThreadSchema,
} from "./chat-turn.js";
export type {
  ChatMessage,
  ChatMessageRole,
  ChatThread,
} from "./chat-turn.js";

export const createChatThreadSchema = z.object({
  title: z.string().min(1).max(160).optional(),
});

export type CreateChatThreadInput = z.infer<typeof createChatThreadSchema>;

export const sendChatMessageSchema = z
  .object({
    content: z.string().max(4000).default(""),
    proposalRevision: z.lazy(() => chatProposalRevisionSchema).optional(),
    attachmentRefIds: z.array(z.string().uuid()).max(5).optional(),
  })
  .superRefine((input, ctx) => {
    const hasContent = input.content.trim().length > 0;
    const hasAttachments = Boolean(input.attachmentRefIds && input.attachmentRefIds.length > 0);

    if (!hasContent && !hasAttachments) {
      ctx.addIssue({
        code: "custom",
        message: "Chat messages require content or at least one attachment reference.",
        path: ["content"],
      });
    }
  });

export type SendChatMessageInput = z.infer<typeof sendChatMessageSchema>;


// Re-exported from ai-proposal.ts (canonical home).
export {
  classifyProposalValidationFailure,
  proposalIntentSchema,
  proposalStatusSchema,
  proposalTargetDomainSchema,
  proposalValidationFailureClassSchema,
  proposalValidationStatusSchema,
} from "./ai-proposal.js";
export type {
  ProposalIntent,
  ProposalStatus,
  ProposalTargetDomain,
  ProposalValidationFailureClass,
  ProposalValidationStatus,
} from "./ai-proposal.js";

export {
  activeWorkoutPlanResponseSchema,
  adaptWorkoutPlanFromProgressChangesSchema,
  buildExerciseDisplaySnapshotFromInput,
  calorieEstimateProvenanceSchema,
  collectPendingExerciseRefs,
  collectWorkoutPlanExerciseIds,
  completeWorkoutSessionSchema,
  countStructuredWorkoutSessionExerciseProgress,
  deriveWorkoutSessionStatusFromExercises,
  findReusableWorkoutSession,
  findWorkoutPlanDayForWeekday,
  getWorkoutPlanDomainErrors,
  getWorkoutProposalDomainErrors,
  getResolvedWorkoutPlanCatalogErrors,
  // inferWeekdayFromDayLabel deleted (B5 removal, C4 cluster)
  isLegacyWorkoutPlanExerciseObject,
  isStructuredWorkoutPlanExercise,
  isStructuredWorkoutSessionExercise,
  deterministicWorkoutSessionExerciseId,
  normalizeWorkoutPlanDay,
  normalizeWorkoutSessionExerciseEntry,
  normalizeWorkoutSessionExercises,
  normalizeWorkoutPlanExerciseEntry,
  normalizeWorkoutPlanPayload,
  pendingExerciseDefinitionSchema,
  resolveWeekdayFromIsoDate,
  scheduleWorkoutSessionSchema,
  toWorkoutSessionExercisePrescription,
  updateWorkoutSessionExerciseSchema,
  getLogWorkoutActivityDomainErrors,
  logWorkoutActivityProposalPayloadSchema,
  stripWorkoutPlanProposalExtras,
  recomputeWorkoutProposalCaloriesFromDisplayContract,
  recomputeCaloriesFromDisplayContract,
  clampWorkoutCalories,
  deriveActivityCalories,
  WORKOUT_CALORIE_MAX,
  summarizeWorkoutPlanForCoaching,
  estimateWorkoutPlanLoadMetrics,
  workoutAdaptationIncreasesVolumeOrLoad,
  mergeRecoveryMetadataIntoWorkoutPlanProposal,
  workoutAdaptationOperationRecordSchema,
  workoutAdaptationOperationSchema,
  workoutCompletionFeedbackSchema,
  workoutExerciseDisplaySnapshotSchema,
  workoutExercisePayloadSchema,
  workoutExerciseSchema,
  workoutPlanAdaptationMetadataSchema,
  workoutPlanDaySchema,
  workoutPlanExerciseEntrySchema,
  workoutPlanExerciseSchema,
  workoutPlanPayloadSchema,
  workoutPlanProposalChangesSchema,
  workoutPlanProposalExtrasSchema,
  workoutPlanRevisionSchema,
  workoutPlanSchema,
  workoutPlanStatusSchema,
  workoutSessionExerciseEntrySchema,
  workoutSessionExerciseExecutionSchema,
  workoutSessionExercisePrescriptionSchema,
  workoutSessionExerciseSchema,
  workoutSessionExerciseStatusSchema,
  workoutSessionSchema,
  workoutSessionStatusSchema,
  workoutWeekdaySchema,
  WORKOUT_WEEKDAYS,
  type ActiveWorkoutPlanResponse,
  type AdaptWorkoutPlanFromProgressChanges,
  type CalorieEstimateProvenance,
  type CompleteWorkoutSessionInput,
  type PendingExerciseDefinition,
  type ScheduleWorkoutSessionInput,
  type UpdateWorkoutSessionExerciseInput,
  type WorkoutAdaptationOperation,
  type WorkoutAdaptationOperationRecord,
  type WorkoutCompletionFeedback,
  type WorkoutExercise,
  type WorkoutExerciseDisplaySnapshot,
  type WorkoutExercisePayload,
  type WorkoutPlan,
  type WorkoutPlanAdaptationMetadata,
  type WorkoutPlanCoachingDaySummary,
  type WorkoutPlanCoachingSummary,
  type WorkoutPlanLoadMetrics,
  type WorkoutPlanDay,
  type WorkoutPlanDomainValidationOptions,
  type WorkoutPlanExercise,
  type WorkoutPlanExerciseEntry,
  type WorkoutPlanPayload,
  type WorkoutPlanProposalChanges,
  type WorkoutPlanProposalExtras,
  type WorkoutProposalRecomputeResult,
  type RecomputeCaloriesResult,
  type CalorieRecomputeFields,
  type LogWorkoutActivityProposalPayload,
  type WorkoutPlanRevision,
  type WorkoutPlanStatus,
  type WorkoutSession,
  type WorkoutSessionExercise,
  type WorkoutSessionExerciseEntry,
  type WorkoutSessionExerciseExecution,
  type WorkoutSessionExercisePrescription,
  type WorkoutSessionExerciseProgressCounts,
  type WorkoutSessionExerciseStatus,
  type WorkoutSessionStatus,
  type WorkoutWeekday,
} from "./workouts.js";

// Re-exported from nutrition-meal.ts (canonical home).
export {
  nutritionMealIngredientSchema,
  nutritionMealSlotSchema,
  nutritionWeekDaySchema,
} from "./nutrition-meal.js";
export type {
  NutritionMealIngredient,
  NutritionMealSlot,
  NutritionWeekDay,
} from "./nutrition-meal.js";

// Re-exported from ai-proposal.ts (canonical home).
export {
  adaptHabitPlanFromProgressChangesSchema,
  adjustNutritionPlanFromProgressChangesSchema,
  habitPlanProposalChangesSchema,
  nutritionPlanPayloadSchema,
  nutritionPlanProposalChangesSchema,
  nutritionSwapItemSchema,
} from "./ai-proposal.js";
export type {
  AdaptHabitPlanFromProgressChanges,
  AdjustNutritionPlanFromProgressChanges,
  HabitPlanProposalChanges,
  NutritionPlanPayload,
  NutritionPlanProposalChanges,
  NutritionSwapItem,
} from "./ai-proposal.js";

export function extractNutritionPlanPayload(
  proposedChanges: NutritionPlanProposalChanges,
): NutritionPlanPayload {
  if ("plan" in proposedChanges && proposedChanges.plan) {
    return proposedChanges.plan;
  }

  return proposedChanges as NutritionPlanPayload;
}

export function extractHabitPlanPayload(
  proposedChanges: HabitPlanProposalChanges,
): z.infer<typeof habitPlanPayloadSchema> {
  const wrapped = adaptHabitPlanFromProgressChangesSchema.safeParse(proposedChanges);

  if (wrapped.success) {
    return wrapped.data.plan;
  }

  return habitPlanPayloadSchema.parse(proposedChanges);
}

export function parseHabitPlanProposalChanges(
  proposedChanges: unknown,
): HabitPlanProposalChanges {
  const wrapped = adaptHabitPlanFromProgressChangesSchema.safeParse(proposedChanges);

  if (wrapped.success) {
    return wrapped.data;
  }

  return habitPlanPayloadSchema.parse(proposedChanges);
}

export function getProgressProvenanceFromProposal(
  intent: ProposalIntent,
  proposedChanges: unknown,
): {
  sourceSummaryId?: string;
  sourceTrendObservationIds: string[];
} | null {
  if (intent === "adapt_workout_plan_from_progress") {
    const parsed = adaptWorkoutPlanFromProgressChangesSchema.safeParse(proposedChanges);

    return parsed.success
      ? {
          sourceSummaryId: parsed.data.sourceSummaryId,
          sourceTrendObservationIds: parsed.data.sourceTrendObservationIds,
        }
      : null;
  }

  if (intent === "adjust_nutrition_plan") {
    const parsed = adjustNutritionPlanFromProgressChangesSchema.safeParse(proposedChanges);

    return parsed.success
      ? {
          sourceSummaryId: parsed.data.sourceSummaryId,
          sourceTrendObservationIds: parsed.data.sourceTrendObservationIds,
        }
      : null;
  }

  if (intent === "adapt_habit_plan") {
    const parsed = adaptHabitPlanFromProgressChangesSchema.safeParse(proposedChanges);

    return parsed.success
      ? {
          sourceSummaryId: parsed.data.sourceSummaryId,
          sourceTrendObservationIds: parsed.data.sourceTrendObservationIds,
        }
      : null;
  }

  return null;
}

export function usesProgressLinkedProposalShape(
  intent: ProposalIntent,
  proposedChanges: unknown,
): boolean {
  if (intent === "adjust_nutrition_plan") {
    return adjustNutritionPlanFromProgressChangesSchema.safeParse(proposedChanges).success;
  }

  if (intent === "adapt_habit_plan") {
    return adaptHabitPlanFromProgressChangesSchema.safeParse(proposedChanges).success;
  }

  return false;
}

export function getProgressLinkedProvenanceRequiredErrors(
  intent: ProposalIntent,
  proposedChanges: unknown,
): string[] {
  if (!usesProgressLinkedProposalShape(intent, proposedChanges)) {
    return [];
  }

  const provenance = getProgressProvenanceFromProposal(intent, proposedChanges);

  if (provenance?.sourceSummaryId) {
    return [];
  }

  return [
    "proposedChanges.sourceSummaryId: Progress-linked proposals require a weekly progress summary reference.",
  ];
}

export function getNutritionPlanDomainErrors(payload: NutritionPlanPayload): string[] {
  const errors: string[] = [];

  const hasTarget =
    payload.caloriesPerDay != null ||
    payload.proteinGrams != null ||
    payload.carbsGrams != null ||
    payload.fatGrams != null ||
    payload.hydrationLiters != null;

  if (!hasTarget) {
    errors.push(
      "nutrition: At least one daily target (calories, macros, or hydration) is required.",
    );
  }

  if (payload.mealStructure.length === 0) {
    errors.push("nutrition: mealStructure must include at least one meal slot.");
  }

  const mealLabels = payload.mealStructure.map((meal) => meal.label.trim().toLowerCase());
  if (new Set(mealLabels).size !== mealLabels.length) {
    errors.push("nutrition: mealStructure labels must be unique.");
  }

  return errors;
}

/**
 * Validates the protein-floor constraint for an adjust_nutrition_plan proposal
 * that carries swap metadata (C4 dietary draft).
 *
 * Safety floor: when an AI proposal explicitly lowers calories (fromCaloriesPerDay
 * is provided and is higher than plan.caloriesPerDay), protein must not be
 * simultaneously cut below the reference floor.
 *
 * @param changes      The parsed adjustNutritionPlanFromProgressChanges payload.
 * @param currentProteinGrams  The proteinGrams from the currently active revision
 *                             (null if no active plan exists). When provided, the
 *                             proposed protein must not be lower.
 */
export function getAdjustNutritionPlanProteinFloorErrors(
  changes: AdjustNutritionPlanFromProgressChanges,
  currentProteinGrams: number | null | undefined,
): string[] {
  const { plan, fromCaloriesPerDay } = changes;

  // Only run the check when the proposal explicitly lowers calories.
  const isLoweringCalories =
    fromCaloriesPerDay != null &&
    plan.caloriesPerDay != null &&
    plan.caloriesPerDay < fromCaloriesPerDay;

  if (!isLoweringCalories) {
    return [];
  }

  // When lowering calories, protein must remain set (non-null).
  if (plan.proteinGrams == null) {
    return [
      "nutrition: Protein target must remain set when lowering calories — do not remove the protein floor.",
    ];
  }

  // When the current plan's protein is known, the proposed protein must not drop below it.
  if (
    currentProteinGrams != null &&
    plan.proteinGrams < currentProteinGrams
  ) {
    return [
      `nutrition: Protein must not be cut while lowering calories. Current floor: ${currentProteinGrams} g, proposed: ${plan.proteinGrams} g.`,
    ];
  }

  return [];
}

export const nutritionPlanStatusSchema = z.enum(["active", "archived"]);

export type NutritionPlanStatus = z.infer<typeof nutritionPlanStatusSchema>;

export const nutritionPlanSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  activeRevisionId: z.string().uuid().nullable(),
  status: nutritionPlanStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type NutritionPlan = z.infer<typeof nutritionPlanSchema>;

export const nutritionPlanRevisionSchema = z.object({
  id: z.string().uuid(),
  nutritionPlanId: z.string().uuid(),
  revisionNumber: z.number().int().positive(),
  reason: z.string().min(1).max(1000),
  source: z.string().min(1).max(80),
  payload: nutritionPlanPayloadSchema,
  createdAt: isoDateTimeSchema,
});

export type NutritionPlanRevision = z.infer<typeof nutritionPlanRevisionSchema>;

export const activeNutritionPlanResponseSchema = z.object({
  plan: nutritionPlanSchema.nullable(),
  activeRevision: nutritionPlanRevisionSchema.nullable(),
});

export type ActiveNutritionPlanResponse = z.infer<
  typeof activeNutritionPlanResponseSchema
>;

// ─── C1: per-meal calorie breakdown read model ─────────────────────────────

/**
 * One enriched meal row in the C1 read model.
 * `changed` is computed by diffing the active revision's slot against the
 * previous revision — it is never persisted.
 */
export const nutritionMealCaloriesRowSchema = z.object({
  label: z.string(),
  timingHint: z.string().nullable(),
  mealTime: z.string().optional(),
  dish: z.string().optional(),
  kcal: z.number().int().nonnegative().optional(),
  proteinGrams: z.number().int().nonnegative().optional(),
  carbsGrams: z.number().int().nonnegative().optional(),
  fatGrams: z.number().int().nonnegative().optional(),
  /** True when this slot changed between the previous and active revision. */
  changed: z.boolean(),
});

export type NutritionMealCaloriesRow = z.infer<typeof nutritionMealCaloriesRowSchema>;

/**
 * Full C1 read model: per-meal rows + day-level aggregates.
 *
 * `totalKcal` = Σ of meals with kcal populated.
 * `remaining` = `caloriesPerDay ?? 0` − `totalKcal` (can be negative if over target).
 * `hasPerMealData` = true when at least one meal slot has a kcal value.
 */
export const nutritionMealCaloriesReadModelSchema = z.object({
  revisionNumber: z.number().int().positive(),
  caloriesPerDay: z.number().int().positive().nullable(),
  proteinTarget: z.number().int().nonnegative().nullable(),
  carbsTarget: z.number().int().nonnegative().nullable(),
  fatTarget: z.number().int().nonnegative().nullable(),
  meals: z.array(nutritionMealCaloriesRowSchema),
  totalKcal: z.number().int().nonnegative(),
  totalProtein: z.number().int().nonnegative(),
  totalCarbs: z.number().int().nonnegative(),
  totalFat: z.number().int().nonnegative(),
  remaining: z.number().int(),
  hasPerMealData: z.boolean(),
});

export type NutritionMealCaloriesReadModel = z.infer<
  typeof nutritionMealCaloriesReadModelSchema
>;

/**
 * Compute the C1 per-meal calories read model from revision payloads.
 *
 * @param revisionNumber - the active revision number (from the DB row).
 * @param activePayload - the active nutrition plan revision payload.
 * @param previousPayload - the previous revision payload (null for first revision),
 *   used to compute the `changed` flag by comparing slot labels and field values.
 */
export function computeMealCaloriesBreakdown(
  revisionNumber: number,
  activePayload: NutritionPlanPayload,
  previousPayload: NutritionPlanPayload | null,
): NutritionMealCaloriesReadModel {
  const prevSlotLabels = new Set<string>(
    previousPayload?.mealStructure.map((s) => s.label.trim().toLowerCase()) ?? [],
  );

  // Compare slot kcal/macros/dish to detect changes; fall back to label-presence diff
  // for legacy previous revisions that predate per-meal fields.
  const previousSlotByLabel = new Map<string, NutritionMealSlot>(
    previousPayload?.mealStructure.map((s) => [s.label.trim().toLowerCase(), s]) ?? [],
  );

  const meals: NutritionMealCaloriesRow[] = activePayload.mealStructure.map((slot) => {
    const key = slot.label.trim().toLowerCase();
    const prevSlot = previousSlotByLabel.get(key);
    const isNew = !prevSlotLabels.has(key);
    const isChanged =
      isNew ||
      (prevSlot !== undefined &&
        (prevSlot.kcal !== slot.kcal ||
          prevSlot.dish !== slot.dish ||
          prevSlot.proteinGrams !== slot.proteinGrams ||
          prevSlot.carbsGrams !== slot.carbsGrams ||
          prevSlot.fatGrams !== slot.fatGrams));

    return {
      label: slot.label,
      timingHint: slot.timingHint ?? null,
      mealTime: slot.mealTime,
      dish: slot.dish,
      kcal: slot.kcal,
      proteinGrams: slot.proteinGrams,
      carbsGrams: slot.carbsGrams,
      fatGrams: slot.fatGrams,
      changed: isChanged,
    };
  });

  const totalKcal = meals.reduce((sum, m) => sum + (m.kcal ?? 0), 0);
  const totalProtein = meals.reduce((sum, m) => sum + (m.proteinGrams ?? 0), 0);
  const totalCarbs = meals.reduce((sum, m) => sum + (m.carbsGrams ?? 0), 0);
  const totalFat = meals.reduce((sum, m) => sum + (m.fatGrams ?? 0), 0);
  const remaining = (activePayload.caloriesPerDay ?? 0) - totalKcal;
  const hasPerMealData = meals.some((m) => m.kcal !== undefined);

  return {
    revisionNumber,
    caloriesPerDay: activePayload.caloriesPerDay,
    proteinTarget: activePayload.proteinGrams,
    carbsTarget: activePayload.carbsGrams,
    fatTarget: activePayload.fatGrams,
    meals,
    totalKcal,
    totalProtein,
    totalCarbs,
    totalFat,
    remaining,
    hasPerMealData,
  };
}

/**
 * The five aisle categories for the C3 grocery list.
 * Maps to the Russian labels shown in the design spec.
 */
export const groceryCategorySchema = z.enum([
  "protein",
  "vegetables",
  "grains",
  "fruits",
  "pantry",
]);

export type GroceryCategory = z.infer<typeof groceryCategorySchema>;

/** A single aggregated item on the grocery list. */
export const groceryItemSchema = z.object({
  /** Normalised ingredient name (lowercased for aggregation key). */
  name: z.string().min(1).max(160),
  /** Human-readable quantity string, e.g. "1.2 кг", "20 шт", "600 г". Empty string when unknown. */
  quantity: z.string().max(80),
  /** Aisle category bucket. */
  category: groceryCategorySchema,
  /** True when the ingredient matches a user allergy (allergen items are still returned but flagged). */
  isAllergen: z.boolean(),
});

export type GroceryItem = z.infer<typeof groceryItemSchema>;

/** A single category bucket with its items. */
export const groceryCategoryGroupSchema = z.object({
  category: groceryCategorySchema,
  items: z.array(groceryItemSchema),
});

export type GroceryCategoryGroup = z.infer<typeof groceryCategoryGroupSchema>;

/**
 * Response from GET /nutrition/grocery-list.
 * The list is a deterministic projection of the active revision — never persisted.
 * revisionId and revisionNumber are null when no active plan exists (empty state).
 */
export const groceryListResponseSchema = z.object({
  /** Id of the active nutrition revision this list was derived from. Null when no active plan. */
  revisionId: z.string().uuid().nullable(),
  /** Revision number for display (e.g. "Собрано из рациона · v8"). Null when no active plan. */
  revisionNumber: z.number().int().positive().nullable(),
  /** Total ingredient count across all categories. */
  totalItems: z.number().int().nonnegative(),
  /** Grouped by category in the canonical display order. Empty categories are omitted. */
  categories: z.array(groceryCategoryGroupSchema),
  /** User's declared allergies (for subtitle rendering on the frontend). */
  allergies: z.array(z.string().min(1).max(160)),
  /** Number of meal slots per day included in derivation (for the "N meals per day" subtitle). */
  mealsPerDay: z.number().int().nonnegative(),
});

export type GroceryListResponse = z.infer<typeof groceryListResponseSchema>;

export const nutritionMealCompletionSchema = z.object({
  label: z.string().min(1).max(80),
  completed: z.boolean().default(false),
});

export type NutritionMealCompletion = z.infer<typeof nutritionMealCompletionSchema>;

export const nutritionTargetCompletionSchema = z.object({
  caloriesOnTarget: z.boolean().nullable().default(null),
  proteinOnTarget: z.boolean().nullable().default(null),
  carbsOnTarget: z.boolean().nullable().default(null),
  fatOnTarget: z.boolean().nullable().default(null),
});

export type NutritionTargetCompletion = z.infer<typeof nutritionTargetCompletionSchema>;

export const nutritionAdherenceStateSchema = z.object({
  date: isoDateSchema,
  hydrationLitersConsumed: z.number().nonnegative().max(20).nullable().default(null),
  mealCompletion: z.array(nutritionMealCompletionSchema).max(8).default([]),
  targetCompletion: nutritionTargetCompletionSchema.default({
    caloriesOnTarget: null,
    proteinOnTarget: null,
    carbsOnTarget: null,
    fatOnTarget: null,
  }),
  notes: z.array(z.string().min(1).max(240)).max(10).default([]),
});

export type NutritionAdherenceState = z.infer<typeof nutritionAdherenceStateSchema>;

export const upsertNutritionAdherenceSchema = z.object({
  hydrationLitersConsumed: z.number().nonnegative().max(20).nullable().optional(),
  mealCompletion: z.array(nutritionMealCompletionSchema).max(8).optional(),
  targetCompletion: nutritionTargetCompletionSchema.partial().optional(),
  notes: z.array(z.string().min(1).max(240)).max(10).optional(),
});

export type UpsertNutritionAdherenceInput = z.infer<typeof upsertNutritionAdherenceSchema>;

export const nutritionAdherenceRecordSchema = nutritionAdherenceStateSchema.extend({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type NutritionAdherenceRecord = z.infer<typeof nutritionAdherenceRecordSchema>;

export const nutritionAdherenceResponseSchema = z.object({
  adherence: nutritionAdherenceRecordSchema.nullable(),
});

export type NutritionAdherenceResponse = z.infer<typeof nutritionAdherenceResponseSchema>;

export const todayNutritionDetailSchema = z.object({
  date: isoDateSchema,
  plan: nutritionPlanSchema.nullable(),
  activeRevision: nutritionPlanRevisionSchema.nullable(),
  adherence: nutritionAdherenceRecordSchema.nullable(),
  /**
   * Aggregated totals from confirmed nutrition_incidents for this date.
   * Null when no incidents have been logged for the date.
   * Optional at the API response level for backward compatibility — absent means no incidents.
   */
  eaten: z
    .object({
      calories: z.number().int().nonnegative(),
      proteinGrams: z.number().int().nonnegative(),
      carbsGrams: z.number().int().nonnegative(),
      fatGrams: z.number().int().nonnegative(),
      incidentCount: z.number().int().nonnegative(),
    })
    .nullable()
    .optional(),
});

export type TodayNutritionDetail = z.infer<typeof todayNutritionDetailSchema>;

export const recipeMealTypeSchema = z.enum([
  "breakfast",
  "lunch",
  "dinner",
  "snack",
]);

export type RecipeMealType = z.infer<typeof recipeMealTypeSchema>;

export const recipeStatusSchema = z.enum(["active", "archived"]);

export type RecipeStatus = z.infer<typeof recipeStatusSchema>;

export const recipeIngredientSchema = z.object({
  name: z.string().min(1).max(160),
  quantity: z.number().positive().max(10000).nullable().optional(),
  unit: z.string().min(1).max(40).nullable().optional(),
  notes: z.string().min(1).max(240).nullable().optional(),
});

export type RecipeIngredient = z.infer<typeof recipeIngredientSchema>;

/** Per-serving macro values for a recipe. All fields represent a single serving. */
export const recipePerServingMacrosSchema = z.object({
  caloriesPerServing: z.number().int().positive().max(10000),
  proteinGramsPerServing: z.number().int().nonnegative().max(1000),
  carbsGramsPerServing: z.number().int().nonnegative().max(1500),
  fatGramsPerServing: z.number().int().nonnegative().max(1000),
  fiberGramsPerServing: z.number().int().nonnegative().max(500).nullable().optional(),
});

export type RecipePerServingMacros = z.infer<typeof recipePerServingMacrosSchema>;

export const recipeSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(160),
  description: z.string().min(1).max(2000),
  ingredients: z.array(recipeIngredientSchema).min(1).max(50),
  preparationSteps: z.array(z.string().min(1).max(1000)).min(1).max(30),
  servings: z.number().int().positive().max(20),
  perServingMacros: recipePerServingMacrosSchema,
  mealTypes: z.array(recipeMealTypeSchema).min(1).max(4),
  tags: z.array(z.string().min(1).max(80)).max(20).default([]),
  restrictionTags: z.array(z.string().min(1).max(80)).max(20).default([]),
  allergenTags: z.array(z.string().min(1).max(80)).max(20).default([]),
  prepMinutes: z.number().int().nonnegative().max(600).nullable(),
  cookMinutes: z.number().int().nonnegative().max(600).nullable(),
  source: z.string().min(1).max(160),
  provider: z.string().min(1).max(80).nullable().optional(),
  externalId: z.string().min(1).max(80).nullable().optional(),
  confidence: recipeConfidenceBandSchema,
  provenance: recipeProvenanceSchema,
  status: recipeStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type Recipe = z.infer<typeof recipeSchema>;

export const recipeListQuerySchema = z.object({
  mealType: recipeMealTypeSchema.optional(),
  tags: z.array(z.string().min(1).max(80)).max(10).optional(),
  compatibleWithRestrictions: z.array(z.string().min(1).max(80)).max(20).optional(),
  minCaloriesPerServing: z.coerce.number().int().nonnegative().max(10000).optional(),
  maxCaloriesPerServing: z.coerce.number().int().positive().max(10000).optional(),
  minProteinGramsPerServing: z.coerce.number().int().nonnegative().max(1000).optional(),
  maxProteinGramsPerServing: z.coerce.number().int().nonnegative().max(1000).optional(),
});

export type RecipeListQuery = z.infer<typeof recipeListQuerySchema>;

export const recipeListResponseSchema = z.object({
  recipes: z.array(recipeSchema),
});

export type RecipeListResponse = z.infer<typeof recipeListResponseSchema>;

export const userRecipeRecommendationStatusSchema = z.enum([
  "pending",
  "accepted",
  "dismissed",
  "completed",
]);

export type UserRecipeRecommendationStatus = z.infer<
  typeof userRecipeRecommendationStatusSchema
>;

export const userRecipeRecommendationSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  recipeId: z.string().uuid(),
  recipe: recipeSchema.optional(),
  relatedNutritionPlanRevisionId: z.string().uuid().nullable(),
  reason: z.string().min(1).max(1000),
  fitSummary: z.string().min(1).max(500),
  status: userRecipeRecommendationStatusSchema,
  shownAt: isoDateTimeSchema,
  decidedAt: isoDateTimeSchema.nullable(),
  completedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type UserRecipeRecommendation = z.infer<typeof userRecipeRecommendationSchema>;

export const userRecipeRecommendationListResponseSchema = z.object({
  recommendations: z.array(userRecipeRecommendationSchema),
});

export type UserRecipeRecommendationListResponse = z.infer<
  typeof userRecipeRecommendationListResponseSchema
>;

export const updateRecipeRecommendationStatusSchema = z.object({
  status: userRecipeRecommendationStatusSchema.extract([
    "accepted",
    "dismissed",
    "completed",
  ]),
});

export type UpdateRecipeRecommendationStatusInput = z.infer<
  typeof updateRecipeRecommendationStatusSchema
>;

export const recipeRecommendationLimitedReasonSchema = z.enum([
  "no_active_nutrition_plan",
  "no_compatible_recipes",
]);

export type RecipeRecommendationLimitedReason = z.infer<
  typeof recipeRecommendationLimitedReasonSchema
>;

export const generateRecipeRecommendationsResponseSchema = z.object({
  recommendations: z.array(userRecipeRecommendationSchema),
  relatedNutritionPlanRevisionId: z.string().uuid().nullable(),
  limitedReason: recipeRecommendationLimitedReasonSchema.nullable(),
});

export type GenerateRecipeRecommendationsResponse = z.infer<
  typeof generateRecipeRecommendationsResponseSchema
>;

// Re-exported from ai-proposal.ts (canonical home).
export {
  recipeRecommendationItemProposalSchema,
  recipeRecommendationProposalPayloadSchema,
} from "./ai-proposal.js";
export type {
  RecipeRecommendationItemProposal,
  RecipeRecommendationProposalPayload,
} from "./ai-proposal.js";

export {
  calculateTodayAdherence,
  filterChecklistItemsConflictingWithHabitItems,
  filterProposalItemsConflictingWithHabitItems,
  normalizeChecklistLabelForComparison,
  resolveProposalItemSource,
  resolveProposalItemStatus,
  todayAdherenceSummarySchema,
  todayChecklistItemKindSchema,
  todayChecklistItemSchema,
  todayChecklistItemSourceRefSchema,
  todayChecklistItemSourceTypeSchema,
  todayChecklistItemStatusSchema,
  todayChecklistProposalItemSchema,
  todayChecklistRecordSchema,
  todayChecklistPayloadSchema,
  todayDailyFeedbackSchema,
  todayDayResponseBaseSchema,
  todayHistoryEntrySchema,
  todayHistoryQuerySchema,
  todayHistoryResponseSchema,
  todayWorkoutDetailSchema,
  updateTodayFeedbackSchema,
  updateTodayItemStatusSchema,
  type TodayAdherenceSummary,
  type TodayChecklistItem,
  type TodayChecklistItemKind,
  type TodayChecklistItemSourceRef,
  type TodayChecklistItemSourceType,
  type TodayChecklistItemStatus,
  type TodayChecklistPayload,
  type TodayChecklistProposalItem,
  type TodayChecklistRecord,
  type TodayDailyFeedback,
  type TodayDayResponseBase,
  type TodayHistoryEntry,
  type TodayHistoryQuery,
  type TodayHistoryResponse,
  type TodayWorkoutDetail,
  type UpdateTodayFeedbackInput,
  type UpdateTodayItemStatusInput,
} from "./today.js";
import { todayDayResponseBaseSchema } from "./today.js";

export const todayDayResponseSchema = todayDayResponseBaseSchema.extend({
  nutrition: todayNutritionDetailSchema.nullable(),
});

export type TodayDayResponse = z.infer<typeof todayDayResponseSchema>;

// Re-exported from ai-proposal.ts (canonical home, avoids circular dep via
// chat-turn-stream.ts). The schemas defined there are the authoritative source.
export {
  aiProposalSchema,
  aiStructuredOutputSchema,
  chatProposalRevisionSchema,
  createGoalProposalChangesSchema,
  emptyProposalChangesSchema,
  getProposedChangesSchemaForIntent,
  profileProposalChangesSchema,
  proposalDecisionSchema,
  proposalModifyResponseSchema,
  rawAiProposalSchema,
  updateGoalProposalChangesSchema,
} from "./ai-proposal.js";
export type {
  AiProposal,
  AiStructuredOutput,
  AiStructuredOutputInput,
  ChatProposalRevision,
  ProposalDecisionInput,
  ProposalModifyResponse,
  RawAiProposal,
} from "./ai-proposal.js";

/** Union for untyped contexts; domain-specific intents use getProposedChangesSchemaForIntent. */
export const proposalChangesSchema = z.union([
  workoutPlanProposalChangesSchema,
  adaptWorkoutPlanFromProgressChangesSchema,
  nutritionPlanPayloadSchema,
  recipeRecommendationProposalPayloadSchema,
  todayChecklistPayloadSchema,
  habitPlanPayloadSchema,
  createGoalProposalChangesSchema,
  updateGoalProposalChangesSchema,
  profileProposalChangesSchema,
  saveBodyAnalysisProposalPayloadSchema,
  emptyProposalChangesSchema,
]);

export type ProposalChanges = z.infer<typeof proposalChangesSchema>;

// Re-exported from chat-turn.ts (canonical home).
export {
  chatTurnResponseSchema,
  chatTurnDegradedReasonSchema,
  chatMessageDegradedTurnSchema,
  parseChatMessageDegradedTurn,
} from "./chat-turn.js";
export type {
  ChatTurnResponse,
  ChatTurnDegradedReason,
  ChatMessageDegradedTurn,
} from "./chat-turn.js";

export {
  activeHabitPlanResponseSchema,
  buildAdherenceWindowDates,
  collectHabitTemplateReferences,
  computeHabitAdherenceSummary,
  createEmptyHabitAdherenceResponse,
  dedupeHabitCompletionRows,
  filterScheduledHabitDefinitions,
  formatIsoDateInTimezone,
  getHabitPlanAdaptationContinuityErrors,
  getHabitPlanDomainErrors,
  getHabitPlanIntentStateErrors,
  getHabitTemplateUsageErrors,
  getTodayIsoDateInTimezone,
  habitAdherenceCountsSchema,
  habitAdherenceHabitSummarySchema,
  habitAdherencePlanSummarySchema,
  habitAdherenceQuerySchema,
  habitAdherenceResponseSchema,
  habitAdherenceWindowSchema,
  habitHasTemplateReference,
  habitScheduleMatchesDate,
  resolveHabitAdherenceOutcome,
  resolveIsoDateDayOfWeek,
  shiftIsoDate,
  summarizeHabitAdherenceForCoaching,
  summarizeHabitPlanForCoaching,
  habitBooleanTargetSchema,
  habitCategorySchema,
  habitCompletionSchema,
  habitCompletionStatusSchema,
  habitCountTargetSchema,
  habitDefinitionSchema,
  habitDefinitionStatusSchema,
  habitDurationTargetSchema,
  habitLinkedSourceSchema,
  habitNumericTargetSchema,
  habitPlanPayloadSchema,
  habitPlanRevisionSchema,
  habitPlanRevisionsResponseSchema,
  habitPlanSchema,
  habitPlanStatusSchema,
  habitScheduleSchema,
  habitTargetSchema,
  habitTemplateListResponseSchema,
  habitTemplateSchema,
  habitTemplateStatusSchema,
  habitTemplateTargetConstraintsSchema,
  habitTimeOfDayHintSchema,
  type ActiveHabitPlanResponse,
  type HabitAdherenceCoachingSummary,
  type HabitAdherenceCounts,
  type HabitAdherenceHabitSummary,
  type HabitAdherenceOutcome,
  type HabitAdherencePlanSummary,
  type HabitAdherenceQuery,
  type HabitAdherenceResponse,
  type HabitAdherenceWindow,
  type HabitCategory,
  type HabitCompletion,
  type HabitCompletionStatus,
  type HabitDefinition,
  type HabitDefinitionStatus,
  type HabitLinkedSource,
  type HabitPlanCoachingHabitSummary,
  type HabitPlanCoachingSummary,
  type HabitPlan,
  type HabitPlanPayload,
  type HabitPlanProposalIntent,
  type HabitPlanRevision,
  type HabitPlanRevisionsResponse,
  type HabitPlanStatus,
  type HabitSchedule,
  type HabitTarget,
  type HabitTemplate,
  type HabitTemplateListResponse,
  type HabitTemplateStatus,
  type HabitTemplateTargetConstraints,
  type HabitTimeOfDayHint,
} from "./habits.js";
export * from "./body-composition.js";
export * from "./device-metrics.js";
export * from "./document-signals.js";
export * from "./documents.js";
export * from "./exercises.js";
export * from "./wellbeing-check-ins.js";
export * from "./nutrition-incidents.js";
export * from "./recipes.js";
export * from "./chat-action-proposals.js";
export * from "./chat-attachments.js";
export * from "./chat-attachment-category-source.js";
export * from "./recovery.js";
export {
  buildCoachingHierarchySummary,
  coachingNoteCategorySchema,
  coachingNoteSchema,
  coachingNotesSchema,
  countActiveGoalsByHorizon,
  getActiveHierarchyLimitErrors,
  getGoalHierarchyFieldErrors,
  getGoalHierarchyValidationErrors,
  getGoalParentReferenceErrors,
  hasCompletedOnboardingState,
  mergeGoalHierarchyState,
  getWeekStartIsoDate,
  goalHorizonSchema,
  goalHorizonsStoredOnGoalsSchema,
  goalHierarchyFieldsSchema,
  goalListQuerySchema,
  longevityDirectionSchema,
  MAX_ACTIVE_QUARTERLY_GOALS,
  MAX_ACTIVE_WEEKLY_FOCUS,
  onboardingQuarterlyGoalSchema,
  personalContextSummarySchema,
  summarizePersonalContext,
  type CoachingNote,
  type CoachingNoteCategory,
  type GoalHorizon,
  type GoalHorizonStoredOnGoal,
  type GoalHierarchyState,
  type GoalListQuery,
  type ParentGoalContext,
  type LongevityDirection,
  type OnboardingQuarterlyGoalInput,
  type PersonalContextSummary,
} from "./goal-hierarchy.js";

export const progressDomainSchema = z.enum([
  "workout",
  "today",
  "nutrition",
  "recipes",
  "recovery",
]);

export type ProgressDomain = z.infer<typeof progressDomainSchema>;

export const progressDataStatusSchema = z.enum([
  "sufficient",
  "partial",
  "insufficient",
]);

export type ProgressDataStatus = z.infer<typeof progressDataStatusSchema>;

export const trendDataSufficiencySchema = z.enum([
  "sufficient",
  "partial",
  "insufficient",
]);

export type TrendDataSufficiency = z.infer<typeof trendDataSufficiencySchema>;

export const trendDirectionSchema = z.enum(["up", "down", "stable", "unknown"]);

export type TrendDirection = z.infer<typeof trendDirectionSchema>;

export const trendTypeSchema = z.enum([
  "completion_rate",
  "consistency",
  "skip_rate",
  "fatigue_pattern",
  "cross_domain_execution",
  "habit_consistency",
  "recovery_load_balance",
]);

export type TrendType = z.infer<typeof trendTypeSchema>;

export const deferredProgressDomainSchema = z.object({
  domain: progressDomainSchema,
  reason: z.string().min(1).max(240),
  message: z.string().min(1).max(500),
});

export type DeferredProgressDomain = z.infer<typeof deferredProgressDomainSchema>;

export const workoutProgressAggregateSchema = z.object({
  plannedCount: z.number().int().nonnegative(),
  completedCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  adherencePercent: z.number().min(0).max(100).nullable(),
  activeDays: z.number().int().min(0).max(7),
  sessionIds: z.array(z.string().uuid()).max(50),
  averageFatigue: z.number().min(1).max(10).nullable(),
  exercisePlannedCount: z.number().int().nonnegative().default(0),
  exerciseCompletedCount: z.number().int().nonnegative().default(0),
  exerciseSkippedCount: z.number().int().nonnegative().default(0),
  exerciseAdjustedCount: z.number().int().nonnegative().default(0),
  exerciseCompletionPercent: z.number().min(0).max(100).nullable().default(null),
  partialSessionCount: z.number().int().nonnegative().default(0),
  /** Number of ad-hoc activity sessions completed this week (source = 'ad_hoc', status = 'completed'). */
  adHocCompletedCount: z.number().int().nonnegative().default(0),
  /**
   * Number of *planned* sessions (source != 'ad_hoc') that were marked completed this week.
   * Use this — not completedCount — whenever the narrative refers to "X of Y planned sessions".
   * Defaults to 0 for back-compat with callers that don't provide it yet.
   */
  plannedCompletedCount: z.number().int().nonnegative().default(0),
});

export type WorkoutProgressAggregate = z.infer<typeof workoutProgressAggregateSchema>;

export const progressSourceAggregatesSchema = z.object({
  workout: workoutProgressAggregateSchema.nullable(),
  today: todayProgressAggregateSchema.nullable().optional(),
  nutrition: nutritionProgressAggregateSchema.nullable().optional(),
  habits: habitsProgressAggregateSchema.nullable().optional(),
  recipes: recipesProgressAggregateSchema.nullable().optional(),
  recovery: recoveryProgressAggregateSchema.nullable().optional(),
});

export type ProgressSourceAggregates = z.infer<typeof progressSourceAggregatesSchema>;

export const trendObservationSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  summaryId: z.string().uuid(),
  weekStart: isoDateSchema,
  weekEnd: isoDateSchema,
  domain: progressDomainSchema,
  trendType: trendTypeSchema,
  direction: trendDirectionSchema,
  dataSufficiency: trendDataSufficiencySchema,
  supportingAggregate: z.record(z.string(), z.unknown()),
  message: z.string().min(1).max(500),
  createdAt: isoDateTimeSchema,
});

export type TrendObservation = z.infer<typeof trendObservationSchema>;

export const weeklyProgressSummarySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  weekStart: isoDateSchema,
  weekEnd: isoDateSchema,
  generatedAt: isoDateTimeSchema,
  dataStatus: progressDataStatusSchema,
  sourceAggregates: progressSourceAggregatesSchema,
  deferredDomains: z.array(deferredProgressDomainSchema),
  userMessage: z.string().min(1).max(1000),
  supersededById: z.string().uuid().nullable(),
  createdAt: isoDateTimeSchema,
});

export type WeeklyProgressSummary = z.infer<typeof weeklyProgressSummarySchema>;

export const weeklyProgressSummaryResponseSchema = z.object({
  summary: weeklyProgressSummarySchema,
  trends: z.array(trendObservationSchema),
});

export type WeeklyProgressSummaryResponse = z.infer<
  typeof weeklyProgressSummaryResponseSchema
>;

export const generateWeeklyProgressSummarySchema = z.object({
  weekStart: isoDateSchema.optional(),
  refresh: z.boolean().default(false),
});

export type GenerateWeeklyProgressSummaryInput = z.infer<
  typeof generateWeeklyProgressSummarySchema
>;

export {
  aggregateHabitsProgressWeek,
  aggregateNutritionAdherenceWeek,
  aggregateNutritionIncidentsWeek,
  aggregateRecipesActivityWeek,
  aggregateTodayChecklists,
  countSufficientDomains,
  detectCrossDomainProposalConflict,
  domainSufficiencyLevelSchema,
  evaluateWeeklyReviewLaneEligibility,
  habitsProgressAggregateSchema,
  nutritionPerformedAggregateSchema,
  nutritionProgressAggregateSchema,
  packWeeklyReviewProposals,
  recipesProgressAggregateSchema,
  todayProgressAggregateSchema,
  weeklyReviewCandidateProposalSchema,
  weeklyReviewLaneOutcomeSchema,
  weeklyReviewLaneSchema,
  weeklyReviewPackMetaSchema,
  WEEKLY_REVIEW_CHAT_PROMPT,
  WEEKLY_REVIEW_MAX_PROPOSALS,
  WEEKLY_REVIEW_TARGET_PROPOSALS,
  isWeeklyReviewChatMessage,
  markExplanationOnlyLanes,
  type DailyChecklistSnapshot,
  type DomainSufficiencyLevel,
  type HabitsProgressAggregate,
  type HabitCompletionSnapshot,
  type NutritionAdherenceSnapshot,
  type NutritionIncidentSnapshot,
  type NutritionPerformedAggregate,
  type NutritionProgressAggregate,
  type RecipesProgressAggregate,
  type TodayProgressAggregate,
  type WeeklyReviewCandidateProposal,
  type WeeklyReviewLane,
  type WeeklyReviewLaneOutcome,
  type WeeklyReviewPackMeta,
} from "./progress-cross-domain.js";

export {
  aggregateWorkoutWeek,
  formatWorkoutWeekLabel,
  type WorkoutDayState,
  type WorkoutWeekDaySummary,
  type WorkoutWeekStats,
} from "./workout-week-stats.js";

export const weeklyReviewResponseSchema = z.object({
  summary: weeklyProgressSummaryResponseSchema,
  laneOutcomes: z.array(weeklyReviewLaneOutcomeSchema),
  packMeta: weeklyReviewPackMetaSchema,
  candidateProposals: z.array(weeklyReviewCandidateProposalSchema),
});

export type WeeklyReviewResponse = z.infer<typeof weeklyReviewResponseSchema>;

export const weeklyReviewRequestSchema = z.object({
  weekStart: isoDateSchema.optional(),
  refresh: z.boolean().default(false),
  candidates: z.array(weeklyReviewCandidateProposalSchema).max(3).default([]),
});

export type WeeklyReviewRequest = z.infer<typeof weeklyReviewRequestSchema>;

export {
  agentCitationSchema,
  agentContextPacketSchema,
  agentIntentSchema,
  agentLoopFinalAnswerSchema,
  agentLoopOutputSchema,
  agentLoopToolRequestSchema,
  agentRoutingMethodSchema,
  agentSafetyMetadataSchema,
  agentSafetyStatusSchema,
  agentGetUserContextSliceToolResultSchema,
  agentGetWeeklyProgressContextToolResultSchema,
  agentToolCallRequestSchema,
  agentToolCallResultSchema,
  searchExerciseCatalogInputSchema,
  exerciseCatalogItemSchema,
  searchExerciseCatalogResultSchema,
  searchRecipeCatalogInputSchema,
  recipeCatalogItemSchema,
  searchRecipeCatalogResultSchema,
  getActivePlanDetailInputSchema,
  activePlanDetailSchema,
  getRecentAdherenceInputSchema,
  recentAdherenceResultSchema,
  agentToolNameSchema,
  agentTurnCapabilityCompositionStrategySchema,
  agentTurnCapabilityDescriptorSchema,
  agentTurnCapabilityPresentationSchema,
  agentTurnMetadataSchema,
  aiCoachProviderModeSchema,
  buildAgentContextRequestSchema,
  buildContextSliceRequestForIntent,
  buildRouteFromCatalogIntent,
  contextDepthSchema,
  contextSlicePurposeSchema,
  contextSliceRequestSchema,
  contextSnapshotItemSchema,
  contextSnapshotTypeSchema,
  contextSourceRefSchema,
  contextTimeRangeSchema,
  DEFAULT_AGENT_SAFETY_CONSTRAINTS,
  expectedResponseModeSchema,
  getUserContextSliceInputSchema,
  goalContextSummarySchema,
  habitPlanCoachingSummarySchema,
  INTENT_TO_SLICE_PURPOSE,
  intentRouteResultSchema,
  attachmentCatalogIntentIdSchema,
  catalogIntentIdSchema,
  MAX_AGENT_LOOP_ITERATIONS,
  MAX_CONTEXT_SLICES,
  normalizeContextSlicePlan,
  nutritionPlanContextSummarySchema,
  ragContextResultSchema,
  resolveDefaultDepthForPurpose,
  resolveDefaultExpectedResponseMode,
  resolveDefaultTimeRangeForPurpose,
  RULE_ROUTE_CONFIDENCE_THRESHOLD,
  shouldIncludeDocumentsForPurpose,
  userContextSliceSchema,
  userMemoryCategorySchema,
  userMemoryItemSchema,
  userMemorySourceSchema,
  validateAgentLoopOutputShape,
  weeklyProgressContextSummarySchema,
  workoutExecutionSummarySchema,
  agentUnifiedTurnDecisionMetadataSchema,
  agentFanOutDiagnosticsSchema,
  agentTurnTelemetrySchema,
  agentProviderUsageSchema,
  agentRoutingMetadataSchema,
  agentSafetyFlagSchema,
  type AgentFanOutDiagnostics,
  type AgentTurnTelemetry,
  type AgentProviderUsage,
  type AgentLoopFinalAnswer,
  type AgentLoopOutput,
  type AgentLoopOutputInput,
  type AgentLoopToolRequest,
  type AgentRoutingMethod,
  type AgentRoutingMetadata,
  type AgentSafetyFlag,
  type ContextSliceRequest,
  type ExpectedResponseMode,
  type AgentCitation,
  type AgentContextPacket,
  type AgentIntent,
  type AttachmentCatalogIntentId,
  type CatalogIntentId,
  type AgentSafetyMetadata,
  type AgentSafetyStatus,
  type AgentGetUserContextSliceToolResult,
  type AgentGetWeeklyProgressContextToolResult,
  type AgentToolCallRequest,
  type AgentToolCallResult,
  type AgentToolName,
  type SearchExerciseCatalogInput,
  type ExerciseCatalogItem,
  type SearchExerciseCatalogResult,
  type SearchRecipeCatalogInput,
  type RecipeCatalogItem,
  type SearchRecipeCatalogResult,
  type GetActivePlanDetailInput,
  type ActivePlanDetail,
  type GetRecentAdherenceInput,
  type RecentAdherenceResult,
  type AgentTurnCapabilityDescriptor,
  type AgentTurnCapabilityPresentation,
  type AgentUnifiedTurnDecisionMetadata,
  type AgentTurnCapabilityCompositionStrategy,
  type AgentTurnMetadata,
  type AiCoachProviderMode,
  type BuildAgentContextRequest,
  type ContextDepth,
  type ContextSlicePurpose,
  type ContextSnapshotItem,
  type ContextSnapshotType,
  type ContextSourceRef,
  type ContextTimeRange,
  type GetUserContextSliceInput,
  type ParsedGetUserContextSliceInput,
  type GoalContextSummary,
  type IntentRouteResult,
  type NutritionPlanContextSummary,
  type RagContextResult,
  type UserContextSlice,
  type UserMemoryCategory,
  type UserMemoryItem,
  type UserMemorySource,
  type WeeklyProgressContextSummary,
  type WorkoutExecutionSummary,
} from "./agent-context.js";
export {
  buildResponseModeExecutionMetadata,
  isDeterministicResponseModeExecutorMode,
  isLlmResponseModeExecutorMode,
  mapExpectedResponseModeToDefaultExecutorMode,
  resolveResponseModeExecutorLoopPolicy,
  resolveResponseModeExecutorMode,
  responseModeExecutionMetadataSchema,
  responseModeExecutorHandlerPathSchema,
  responseModeExecutorModeSchema,
  type ResolveResponseModeExecutorModeInput,
  type ResponseModeExecutionMetadata,
  type ResponseModeExecutorHandlerPath,
  type ResponseModeExecutorLoopPolicy,
  type ResponseModeExecutorMode,
} from "./response-mode-executor.js";
export {
  AGENT_INTENT_CATALOG,
  AGENT_INTENT_CATALOG_BY_ID,
  filterProposalsToAllowedIntents,
  filterProposalsToCatalogAllowlist,
  getAllowedProposalIntentsForCatalogIntent,
  getAllowedToolsForCatalogIntent,
  getDefaultContextSliceForCatalogIntent,
  getIntentCatalogEntry,
  intentCatalogEntrySchema,
  intentCatalogKindSchema,
  isCatalogIntentId,
  listRouterCatalogEntries,
  resolveMappedAgentIntent,
  serializeIntentCatalogForRouter,
  type CatalogProposalIntent,
  type IntentCatalogEntry,
  type IntentCatalogKind,
} from "./intent-catalog.js";
export {
  AGENT_CAPABILITY_CONFIGS,
  AGENT_CAPABILITY_CONFIG_BY_ID,
  capabilityActionDescriptorSchema,
  capabilityCompositionMetadataSchema,
  capabilityCompositionStrategySchema,
  capabilityConfigSchema,
  capabilityContextStrategySchema,
  capabilityKindSchema,
  capabilityResponseMetadataSchema,
  capabilityWidgetDescriptorSchema,
  convertCatalogEntryToCapabilityConfig,
  DEFAULT_CAPABILITY_COMPOSITION_METADATA,
  formatCapabilityConfigValidationErrors,
  getActionDescriptorsForCapability,
  getAllowedProposalsForCapability,
  getAllowedToolsForCapability,
  getCapabilityConfig,
  getCompositionMetadataForCapability,
  getDefaultContextStrategyForCapability,
  getWidgetDescriptorsForCapability,
  listCapabilityConfigs,
  listRouterCapabilityConfigs,
  resolveCapabilityPresentationMetadata,
  resolveMappedAgentIntentForCapability,
  resolveSelectedCapabilityIds,
  resolveSelectedCapabilityIdsFromComposition,
  safeParseCapabilityConfig,
  serializeCapabilityConfigsForRouter,
  validateCapabilityConfig,
  type CapabilityActionDescriptor,
  type CapabilityCompositionMetadata,
  type CapabilityCompositionStrategy,
  type CapabilityConfig,
  type CapabilityConfigParseResult,
  type CapabilityContextStrategy,
  type CapabilityKind,
  type CapabilityProposalIntent,
  type CapabilityResponseMetadata,
  type CapabilityWidgetDescriptor,
  type ResolvedCapabilityPresentationMetadata,
  type RouterSerializedCapabilityConfig,
} from "./capability-config.js";
export {
  createFallbackPreprocessorResult,
  detectPreprocessorLanguage,
  detectPreprocessorSimpleSignals,
  EMPTY_MESSAGE_PREPROCESSOR_SIMPLE_SIGNALS,
  extractMentionedPreprocessorDates,
  messagePreprocessorInputSchema,
  messagePreprocessorLanguageCodeSchema,
  messagePreprocessorMentionedDateSchema,
  messagePreprocessorMentionedDateTokenSchema,
  messagePreprocessorResultSchema,
  messagePreprocessorSimpleSignalsSchema,
  normalizePreprocessorText,
  preprocessMessage,
  resolvePreprocessorResponseLanguage,
  type MessagePreprocessorInput,
  type MessagePreprocessorLanguageCode,
  type MessagePreprocessorMentionedDate,
  type MessagePreprocessorMentionedDateToken,
  type MessagePreprocessorResult,
  type MessagePreprocessorSimpleSignals,
} from "./message-preprocessor.js";
export {
  defaultRefreshHintsForDirectPathKind,
  directChatPathCandidateSchema,
  directChatPathKindSchema,
  directChatPathMetadataSchema,
  directChatPathOutcomeSchema,
  directChatPathOutcomeStatusSchema,
  directChatPathRefreshHintSchema,
  directChatPathRoutingMethodSchema,
  type DetectDirectChatPathCandidateOptions,
  type DirectChatPathCandidate,
  type DirectChatPathKind,
  type DirectChatPathMetadata,
  type DirectChatPathOutcome,
  type DirectChatPathOutcomeStatus,
  type DirectChatPathRefreshHint,
  type DirectChatPathRoutingMethod,
} from "./direct-chat-path.js";
export {
  compileDirectPathMatcher,
  detectDirectChatPathCandidate,
  detectDirectChatPathCandidateFromConfig,
  detectDirectChatPathCandidateWithCompiledMatcher,
  getDefaultCompiledDirectPathMatcher,
  type CompiledDirectPathMatcher,
} from "./direct-chat-path-matcher.js";
export {
  buildDefaultDirectPathKindMatchers,
  buildDefaultDirectPathsBehaviorConfig,
  DEFAULT_DIRECT_PATH_DETECTION_ORDER,
  DEFAULT_DIRECT_PATH_SHARED_PATTERNS,
  type DefaultDirectPathsPatternConfig,
} from "./direct-chat-path-default-patterns.js";
export {
  DEFAULT_DIRECT_PATH_REPLY_TEMPLATES,
  directPathItemStatusLabelsSchema,
  directPathMarkWorkoutDoneRepliesSchema,
  directPathReplyTemplatesSchema,
  directPathTodaySummaryRepliesSchema,
  formatTodaySummaryReadMessage,
  formatWorkoutMarkedDoneMessage,
  type DirectPathItemStatusLabels,
  type DirectPathMarkWorkoutDoneReplies,
  type DirectPathReplyTemplates,
  type DirectPathTodaySummaryReplies,
} from "./direct-chat-path-replies.js";
export { interpolateBehaviorTemplate } from "./behavior-template.js";
export {
  buildProposalExplainerTurnContext,
  compileProposalExplainerMatcher,
  detectProposalExplainerRequest,
  detectProposalExplainerRequestFromConfig,
  detectProposalExplainerRequestFromMessage,
  detectProposalExplainerRequestWithCompiledMatcher,
  getDefaultCompiledProposalExplainerMatcher,
  PROPOSAL_EXPLAINER_NO_PROPOSAL_REPLY,
  proposalExplainerEvidenceSummarySchema,
  proposalExplainerTurnContextSchema,
  type CompiledProposalExplainerMatcher,
  type DetectProposalExplainerRequestOptions,
  type ProposalExplainerEvidenceSummary,
  type ProposalExplainerTurnContext,
} from "./proposal-explainer.js";
export {
  buildDefaultPromptTemplateEntries,
  compilePromptTemplates,
  getDefaultCompiledPromptTemplates,
  renderPromptTemplateBody,
  validatePromptTemplateBody,
  type CompiledPromptTemplate,
  type CompiledPromptTemplates,
  type PromptTemplateRenderValues,
} from "./prompt-template-renderer.js";
export {
  DEFAULT_PROMPT_TEMPLATE_BODIES,
  DOMAIN_HEALTH_TEMPLATE_KEY,
  DOMAIN_NUTRITION_TEMPLATE_KEY,
  DOMAIN_WORKOUT_TEMPLATE_KEY,
  FINAL_DECISION_TEMPLATE_KEY,
  PROMPT_TEMPLATE_KEYS,
  PROMPT_TEMPLATE_REQUIRED_PLACEHOLDERS,
  ROUTER_DECISION_TEMPLATE_KEY,
  type PromptTemplateKey,
} from "./prompt-template-defaults.js";
export {
  AI_BEHAVIOR_CONFIG_VERSION,
  aiBehaviorConfigSchema,
  aiBehaviorConfigVersionSchema,
  attachmentRoutingConfigSchema,
  chatBehaviorConfigSchema,
  buildDefaultAiBehaviorConfig,
  DEFAULT_CHAT_BEHAVIOR,
  contextBudgetProfilesConfigSchema,
  contextBudgetTriggersConfigSchema,
  contextBudgetsBehaviorConfigSchema,
  deterministicProposalTriggersConfigSchema,
  directPathKindConfigSchema,
  directPathKindMatcherConfigSchema,
  directPathsBehaviorConfigSchema,
  directPathsSharedPatternsConfigSchema,
  regexPatternFlagsSchema,
  regexPatternRuleSchema,
  formatAiBehaviorConfigValidationErrors,
  mergeCapabilityConfigOverrides,
  normalizeAiBehaviorConfig,
  promptTemplateEntrySchema,
  promptTemplatesBehaviorConfigSchema,
  proposalExplainerBehaviorConfigSchema,
  proposalExplainerDetectionPatternsConfigSchema,
  proposalRevisionRouteRuleSchema,
  proposalRevisionIntentSchema,
  proposalRevisionRoutingConfigSchema,
  resolveContextBudgetProfilePolicy,
  resolveDirectPathRefreshHintsFromConfig,
  resolveLoadedAiBehaviorConfig,
  sanitizeContextBudgetProfiles,
  sanitizeContextBudgetTriggers,
  sanitizeContextBudgetsBehaviorConfig,
  resolveProposalRevisionCapabilityId,
  responseModesBehaviorConfigSchema,
  safeParseAiBehaviorConfig,
  validateAiBehaviorConfig,
  type AiBehaviorConfig,
  type AiBehaviorConfigLoadResult,
  type AiBehaviorConfigLoadSource,
  type AiBehaviorConfigParseResult,
  type AiBehaviorConfigVersion,
  type ChatBehaviorConfig,
  type AttachmentRoutingConfig,
  type ContextBudgetProfilesConfig,
  type ContextBudgetTriggersConfig,
  type ContextBudgetsBehaviorConfig,
  wellbeingCheckinTriggerConfigSchema,
  nutritionIncidentTriggerConfigSchema,
  recipeRecommendationTriggerConfigSchema,
  type DeterministicProposalTriggersConfig,
  type DirectPathKindConfig,
  type DirectPathKindMatcherConfig,
  type DirectPathsSharedPatternsConfig,
  type RegexPatternRule,
  type DirectPathsBehaviorConfig,
  type PromptTemplateEntry,
  type PromptTemplatesBehaviorConfig,
  type ProposalExplainerBehaviorConfig,
  type ProposalExplainerDetectionPatternsConfig,
  type ProposalRevisionRouteRule,
  type NutritionIncidentTriggerConfig,
  type RecipeRecommendationTriggerConfig,
  type WellbeingCheckinTriggerConfig,
  type ProposalRevisionIntent,
  type ProposalRevisionRoutingConfig,
  type ResponseModesBehaviorConfig,
} from "./ai-behavior-config.js";
export {
  ATTACHMENT_BEHAVIOR_CONFIG_VERSION,
  DEFAULT_ATTACHMENT_SAFETY_FLOORS,
  DEFAULT_ATTACHMENT_TURN_STAGE_ORDER,
  applyAttachmentBehaviorSafetyFloors,
  attachmentBehaviorConfigSchema,
  attachmentBehaviorConfigVersionSchema,
  attachmentCategoriesConfigSchema,
  attachmentCategoryEntrySchema,
  attachmentRetentionConfigSchema,
  attachmentSafetyFloorsConfigSchema,
  attachmentTurnStageSchema,
  attachmentTurnStagesConfigSchema,
  buildDefaultAttachmentBehaviorConfig,
  formatAttachmentBehaviorConfigValidationErrors,
  normalizeAttachmentBehaviorConfig,
  resolveLoadedAttachmentBehaviorConfig,
  safeParseAttachmentBehaviorConfig,
  validateAttachmentBehaviorConfig,
  type AttachmentBehaviorConfig,
  type AttachmentBehaviorConfigLoadResult,
  type AttachmentBehaviorConfigLoadSource,
  type AttachmentBehaviorConfigParseResult,
  type AttachmentBehaviorConfigVersion,
  type AttachmentCategoriesConfig,
  type AttachmentCategoryEntry,
  type AttachmentRetentionConfig,
  type AttachmentSafetyFloorsConfig,
  type AttachmentTurnStage,
  type AttachmentTurnStagesConfig,
} from "./attachment-behavior-config.js";
export {
  clampContextBudgetPolicy,
  clampContextDepth,
  CONTEXT_BUDGET_ABSOLUTE_LIMITS,
  CONTEXT_BUDGET_CONFIG_SAFETY_FLOOR,
  applyContextBudgetSafetyFloor,
  tryCompileContextBudgetMessagePattern,
  contextBudgetPolicySchema,
  contextBudgetProfileSchema,
  contextCompressionConfidenceSchema,
  contextCompressionQualitySchema,
  contextCompressionRequestSchema,
  contextCompressionReviewKindSchema,
  contextCompressionSourceRangeSchema,
  contextCompressionSourceRefSchema,
  contextCompressionSummarySchema,
  contextExpansionDecisionResultSchema,
  contextExpansionDecisionSchema,
  contextExpansionLimitsSchema,
  contextExpansionRequestSchema,
  DEFAULT_CONTEXT_BUDGET_POLICY,
  DEEP_REVIEW_CONTEXT_BUDGET_POLICY,
  denyContextExpansionRequest,
  evaluateContextExpansionRequest,
  resolveContextBudgetPolicyForProfile,
  safeParseContextBudgetPolicy,
  safeParseContextCompressionSummary,
  validateContextBudgetPolicy,
  validateContextCompressionOutputShape,
  type ContextBudgetPolicy,
  type ContextBudgetPolicyInput,
  type ContextBudgetPolicyParseResult,
  type ContextBudgetProfile,
  type ContextCompressionConfidence,
  type ContextCompressionQuality,
  type ContextCompressionRequest,
  type ContextCompressionReviewKind,
  type ContextCompressionSourceRange,
  type ContextCompressionSourceRef,
  type ContextCompressionSummary,
  type ContextExpansionDecision,
  type ContextExpansionDecisionResult,
  type ContextExpansionLimits,
  type ContextExpansionRequest,
  type ContextExpansionValidationResult,
} from "./context-budget.js";
export {
  DEFAULT_DOMAIN_CONFIGS,
  domainConfigDomainSchema,
  domainConfigSchema,
  domainIntentEntrySchema,
  intersectDomainConfigWithCatalog,
  type DomainConfig,
  type DomainConfigBundle,
  type DomainConfigDomain,
  type DomainConfigLoadResult,
  type DomainConfigLoadSource,
  type DomainIntentEntry,
} from "./domain-config.js";
export {
  clampRouterDecisionOutput,
  createFallbackRouterDecision,
  MAX_ROUTER_SELECTED_DOMAINS,
  routerAttachmentHintSchema,
  routerAvailableDomainSchema,
  routerDecisionOutputSchema,
  routerDecisionRequestSchema,
  routerDirectCommandSchema,
  routerDomainSchema,
  routerRecentMessageHintSchema,
  routerSelectedDomainSchema,
  validateRouterDecisionOutputShape,
  type RouterAttachmentHint,
  type RouterAvailableDomain,
  type RouterDecisionOutput,
  type RouterDecisionOutputInput,
  type RouterDecisionRequest,
  type RouterDirectCommand,
  type RouterDomain,
  type RouterRecentMessageHint,
  type RouterSelectedDomain,
} from "./router-decision.js";
export {
  createFallbackDomainAnswer,
  domainAnswerSchema,
  domainAttachmentContextSchema,
  domainAttachmentItemSchema,
  domainLlmStepOutputSchema,
  domainLlmStepRequestSchema,
  domainLlmToolRequestSchema,
  validateDomainLlmStepOutputShape,
  type DomainAnswer,
  type DomainAttachmentContext,
  type DomainAttachmentItem,
  type DomainLlmStepOutput,
  type DomainLlmStepOutputInput,
  type DomainLlmStepRequest,
  type DomainLlmToolRequest,
} from "./domain-llm-step.js";
export {
  actionVariantSchema,
  candidateProposalSummarySchema,
  createFallbackFinalDecision,
  finalDecisionOutputSchema,
  finalDecisionRequestSchema,
  validateFinalDecisionOutputShape,
  type ActionVariant,
  type CandidateProposalSummary,
  type FinalDecisionOutput,
  type FinalDecisionOutputInput,
  type FinalDecisionRequest,
} from "./final-decision.js";
export {
  createCheckoutSessionResponseSchema,
  createPortalSessionResponseSchema,
  entitlementSchema,
  subscriptionStatusSchema,
  subscriptionSummarySchema,
  subscriptionTierSchema,
  type CreateCheckoutSessionResponse,
  type CreatePortalSessionResponse,
  type Entitlement,
  type SubscriptionStatus,
  type SubscriptionSummary,
  type SubscriptionTier,
} from "./billing.js";
export {
  clampFieldValue,
  computeDerivedValues,
  displayContractSchema,
  displayDerivedSchema,
  displayFieldKindSchema,
  displayFieldSchema,
  extractEditableFieldValues,
  type DisplayContract,
  type DisplayDerived,
  type DisplayField,
  type DisplayFieldKind,
} from "./display-contract.js";
export {
  chatTurnStreamEventSchema,
  chatTurnStreamStageSchema,
  type ChatTurnStreamEvent,
  type ChatTurnStreamErrorEvent,
  type ChatTurnStreamFinalEvent,
  type ChatTurnStreamStageEvent,
  type ChatTurnStreamStage,
  type ChatTurnStreamTurnAcceptedEvent,
  type ProgressReporter,
} from "./chat-turn-stream.js";
