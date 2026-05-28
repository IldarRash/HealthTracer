import { z } from "zod";
import { isoDateSchema, isoDateTimeSchema } from "./dates.js";
import {
  coachingNotesSchema,
  goalHorizonsStoredOnGoalsSchema,
  longevityDirectionSchema,
  MAX_ACTIVE_WEEKLY_FOCUS,
  onboardingQuarterlyGoalSchema,
} from "./goal-hierarchy.js";
import { proposalCorrelationEvidenceRefsSchema } from "./document-signals.js";
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
import { recoveryContextSourceRefSchema, recoveryProgressAggregateSchema } from "./recovery.js";
import { todayChecklistPayloadSchema } from "./today.js";
import { captureWellbeingCheckinProposalPayloadSchema } from "./chat-action-proposals.js";
import { chatAttachmentOutcomeSchema } from "./chat-attachments.js";
import { logNutritionIncidentProposalPayloadSchema } from "./nutrition-incidents.js";
import {
  recipeConfidenceBandSchema,
  recipeProvenanceSchema,
} from "./recipes.js";
import {
  adaptWorkoutPlanFromProgressChangesSchema,
  workoutPlanProposalChangesSchema,
} from "./workouts.js";

export { isoDateSchema, isoDateTimeSchema, isCalendarValidIsoDate } from "./dates.js";

export const apiStatusSchema = z.enum(["ok"]);

export type ApiStatus = z.infer<typeof apiStatusSchema>;

export const healthResponseSchema = z.object({
  status: apiStatusSchema,
  service: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const activityLevelSchema = z.enum([
  "sedentary",
  "lightly_active",
  "moderately_active",
  "very_active",
  "athlete",
]);

export type ActivityLevel = z.infer<typeof activityLevelSchema>;

export const trainingExperienceSchema = z.enum([
  "beginner",
  "intermediate",
  "advanced",
]);

export type TrainingExperience = z.infer<typeof trainingExperienceSchema>;

export const goalTypeSchema = z.enum([
  "fat_loss",
  "muscle_gain",
  "maintenance",
  "endurance",
  "general_wellness",
]);

export type GoalType = z.infer<typeof goalTypeSchema>;

export const goalStatusSchema = z.enum(["active", "paused", "completed", "archived"]);

export type GoalStatus = z.infer<typeof goalStatusSchema>;

export const goalPrioritySchema = z.enum(["primary", "secondary"]);

export type GoalPriority = z.infer<typeof goalPrioritySchema>;

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(1).max(120).nullable(),
  timezone: z.string().min(1).max(80),
  onboardingCompletedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type User = z.infer<typeof userSchema>;

export const updateCurrentUserSchema = z.object({
  displayName: z.string().min(1).max(120).optional(),
  timezone: z.string().min(1).max(80).optional(),
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

export const chatMessageRoleSchema = z.enum(["user", "assistant", "system"]);

export type ChatMessageRole = z.infer<typeof chatMessageRoleSchema>;

export const chatThreadSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  title: z.string().min(1).max(160).nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type ChatThread = z.infer<typeof chatThreadSchema>;

export const chatMessageSchema = z.object({
  id: z.string().uuid(),
  threadId: z.string().uuid(),
  role: chatMessageRoleSchema,
  content: z.string().min(1).max(8000),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: isoDateTimeSchema,
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

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

export const proposalStatusSchema = z.enum([
  "pending",
  "accepted",
  "rejected",
  "superseded",
]);

export type ProposalStatus = z.infer<typeof proposalStatusSchema>;

export const proposalValidationStatusSchema = z.enum([
  "pending_validation",
  "valid",
  "invalid",
]);

export type ProposalValidationStatus = z.infer<
  typeof proposalValidationStatusSchema
>;

export const proposalTargetDomainSchema = z.enum([
  "profile",
  "goal",
  "workout",
  "nutrition",
  "recipe",
  "today",
  "general",
]);

export type ProposalTargetDomain = z.infer<typeof proposalTargetDomainSchema>;

export const proposalIntentSchema = z.enum([
  "update_profile",
  "create_goal",
  "update_goal",
  "create_workout_plan",
  "adapt_workout_plan",
  "adapt_workout_plan_from_progress",
  "create_nutrition_plan",
  "adjust_nutrition_plan",
  "recommend_recipes",
  "create_today_checklist",
  "summarize_progress",
  "create_habit_plan",
  "adapt_habit_plan",
  "capture_wellbeing_checkin",
  "log_nutrition_incident",
]);

export type ProposalIntent = z.infer<typeof proposalIntentSchema>;

export {
  activeWorkoutPlanResponseSchema,
  adaptWorkoutPlanFromProgressChangesSchema,
  buildExerciseDisplaySnapshotFromInput,
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
  inferWeekdayFromDayLabel,
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
  stripWorkoutPlanProposalExtras,
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

export const nutritionMealSlotSchema = z.object({
  label: z.string().min(1).max(80),
  timingHint: z.string().min(1).max(120).nullable().default(null),
});

export type NutritionMealSlot = z.infer<typeof nutritionMealSlotSchema>;

export const nutritionPlanPayloadSchema = z.object({
  title: z.string().min(1).max(160),
  summary: z.string().min(1).max(1000),
  caloriesPerDay: z.number().int().positive().max(10000).nullable(),
  proteinGrams: z.number().int().nonnegative().max(1000).nullable(),
  carbsGrams: z.number().int().nonnegative().max(1500).nullable(),
  fatGrams: z.number().int().nonnegative().max(1000).nullable(),
  hydrationLiters: z.number().positive().max(20).nullable(),
  mealStructure: z.array(nutritionMealSlotSchema).max(8).default([]),
  preferences: z.array(z.string().min(1).max(160)).max(20).default([]),
  restrictions: z.array(z.string().min(1).max(160)).max(20).default([]),
  allergies: z.array(z.string().min(1).max(160)).max(20).default([]),
  notes: z.array(z.string().min(1).max(240)).max(20).default([]),
});

export type NutritionPlanPayload = z.infer<typeof nutritionPlanPayloadSchema>;

export const adjustNutritionPlanFromProgressChangesSchema = z.object({
  plan: nutritionPlanPayloadSchema,
  sourceSummaryId: z.string().uuid().optional(),
  sourceTrendObservationIds: z.array(z.string().uuid()).max(10).default([]),
});

export type AdjustNutritionPlanFromProgressChanges = z.infer<
  typeof adjustNutritionPlanFromProgressChangesSchema
>;

export const nutritionPlanProposalChangesSchema = z.union([
  nutritionPlanPayloadSchema,
  adjustNutritionPlanFromProgressChangesSchema,
]);

export type NutritionPlanProposalChanges = z.infer<
  typeof nutritionPlanProposalChangesSchema
>;

export const adaptHabitPlanFromProgressChangesSchema = z.object({
  plan: habitPlanPayloadSchema,
  sourceSummaryId: z.string().uuid().optional(),
  sourceTrendObservationIds: z.array(z.string().uuid()).max(10).default([]),
  recoverySourceRefs: z.array(recoveryContextSourceRefSchema).max(5).optional(),
});

export type AdaptHabitPlanFromProgressChanges = z.infer<
  typeof adaptHabitPlanFromProgressChangesSchema
>;

export const habitPlanProposalChangesSchema = z.union([
  adaptHabitPlanFromProgressChangesSchema,
  habitPlanPayloadSchema,
]);

export type HabitPlanProposalChanges = z.infer<typeof habitPlanProposalChangesSchema>;

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

export const recipeMacroEstimatesSchema = z.object({
  estimatedCalories: z.number().int().positive().max(10000),
  proteinGrams: z.number().int().nonnegative().max(1000),
  carbsGrams: z.number().int().nonnegative().max(1500),
  fatGrams: z.number().int().nonnegative().max(1000),
  fiberGrams: z.number().int().nonnegative().max(500).nullable().optional(),
});

export type RecipeMacroEstimates = z.infer<typeof recipeMacroEstimatesSchema>;

export const recipeSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(160),
  description: z.string().min(1).max(2000),
  ingredients: z.array(recipeIngredientSchema).min(1).max(50),
  preparationSteps: z.array(z.string().min(1).max(1000)).min(1).max(30),
  servings: z.number().int().positive().max(20),
  macroEstimates: recipeMacroEstimatesSchema,
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
  minEstimatedCalories: z.coerce.number().int().nonnegative().max(10000).optional(),
  maxEstimatedCalories: z.coerce.number().int().positive().max(10000).optional(),
  minProteinGrams: z.coerce.number().int().nonnegative().max(1000).optional(),
  maxProteinGrams: z.coerce.number().int().nonnegative().max(1000).optional(),
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

export const recipeRecommendationItemProposalSchema = z.object({
  recipeId: z.string().uuid(),
  reason: z.string().min(1).max(1000),
  fitSummary: z.string().min(1).max(500),
});

export type RecipeRecommendationItemProposal = z.infer<
  typeof recipeRecommendationItemProposalSchema
>;

export const recipeRecommendationProposalPayloadSchema = z.object({
  relatedNutritionPlanRevisionId: z.string().uuid().nullable().optional(),
  recommendations: z.array(recipeRecommendationItemProposalSchema).min(1).max(10),
});

export type RecipeRecommendationProposalPayload = z.infer<
  typeof recipeRecommendationProposalPayloadSchema
>;

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

/** Strict so optional profile fields cannot match and strip other domain payloads in unions. */
export const profileProposalChangesSchema = upsertUserProfileSchema.strict();

export const createGoalProposalChangesSchema = createGoalSchema;

export const updateGoalProposalChangesSchema = z.object({
  goalId: z.string().uuid(),
  changes: updateGoalSchema,
});

export const emptyProposalChangesSchema = z.object({}).strict();

export function getProposedChangesSchemaForIntent(
  intent: ProposalIntent,
): z.ZodTypeAny {
  switch (intent) {
    case "update_profile":
      return profileProposalChangesSchema;
    case "create_goal":
      return createGoalProposalChangesSchema;
    case "update_goal":
      return updateGoalProposalChangesSchema;
    case "create_workout_plan":
    case "adapt_workout_plan":
      return workoutPlanProposalChangesSchema;
    case "adapt_workout_plan_from_progress":
      return adaptWorkoutPlanFromProgressChangesSchema;
    case "create_nutrition_plan":
      return nutritionPlanPayloadSchema;
    case "adjust_nutrition_plan":
      return nutritionPlanProposalChangesSchema;
    case "recommend_recipes":
      return recipeRecommendationProposalPayloadSchema;
    case "create_today_checklist":
      return todayChecklistPayloadSchema;
    case "create_habit_plan":
      return habitPlanPayloadSchema;
    case "adapt_habit_plan":
      return habitPlanProposalChangesSchema;
    case "summarize_progress":
      return emptyProposalChangesSchema;
    case "capture_wellbeing_checkin":
      return captureWellbeingCheckinProposalPayloadSchema;
    case "log_nutrition_incident":
      return logNutritionIncidentProposalPayloadSchema;
    default: {
      const _exhaustive: never = intent;
      return _exhaustive;
    }
  }
}

function addProposedChangesIssues(
  intent: ProposalIntent,
  proposedChanges: unknown,
  ctx: z.RefinementCtx,
) {
  const schema = getProposedChangesSchemaForIntent(intent);
  const result = schema.safeParse(proposedChanges);

  if (!result.success) {
    for (const issue of result.error.issues) {
      ctx.addIssue({
        ...issue,
        path: ["proposedChanges", ...issue.path],
      });
    }
  }
}

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
  emptyProposalChangesSchema,
]);

export type ProposalChanges = z.infer<typeof proposalChangesSchema>;

const proposalTitleReasonFields = {
  title: z.string().min(1).max(160),
  reason: z.string().min(1).max(1000),
  evidenceRefs: proposalCorrelationEvidenceRefsSchema.optional(),
};

export const rawAiProposalSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("update_profile"),
    targetDomain: proposalTargetDomainSchema,
    ...proposalTitleReasonFields,
    proposedChanges: profileProposalChangesSchema,
  }),
  z.object({
    intent: z.literal("create_goal"),
    targetDomain: proposalTargetDomainSchema,
    ...proposalTitleReasonFields,
    proposedChanges: createGoalProposalChangesSchema,
  }),
  z.object({
    intent: z.literal("update_goal"),
    targetDomain: proposalTargetDomainSchema,
    ...proposalTitleReasonFields,
    proposedChanges: updateGoalProposalChangesSchema,
  }),
  z.object({
    intent: z.literal("create_workout_plan"),
    targetDomain: proposalTargetDomainSchema,
    ...proposalTitleReasonFields,
    proposedChanges: workoutPlanProposalChangesSchema,
  }),
  z.object({
    intent: z.literal("adapt_workout_plan"),
    targetDomain: proposalTargetDomainSchema,
    ...proposalTitleReasonFields,
    proposedChanges: workoutPlanProposalChangesSchema,
  }),
  z.object({
    intent: z.literal("adapt_workout_plan_from_progress"),
    targetDomain: proposalTargetDomainSchema,
    ...proposalTitleReasonFields,
    proposedChanges: adaptWorkoutPlanFromProgressChangesSchema,
  }),
  z.object({
    intent: z.literal("create_nutrition_plan"),
    targetDomain: proposalTargetDomainSchema,
    ...proposalTitleReasonFields,
    proposedChanges: nutritionPlanPayloadSchema,
  }),
  z.object({
    intent: z.literal("adjust_nutrition_plan"),
    targetDomain: proposalTargetDomainSchema,
    ...proposalTitleReasonFields,
    proposedChanges: nutritionPlanProposalChangesSchema,
  }),
  z.object({
    intent: z.literal("recommend_recipes"),
    targetDomain: proposalTargetDomainSchema,
    ...proposalTitleReasonFields,
    proposedChanges: recipeRecommendationProposalPayloadSchema,
  }),
  z.object({
    intent: z.literal("create_today_checklist"),
    targetDomain: proposalTargetDomainSchema,
    ...proposalTitleReasonFields,
    proposedChanges: todayChecklistPayloadSchema,
  }),
  z.object({
    intent: z.literal("create_habit_plan"),
    targetDomain: proposalTargetDomainSchema,
    ...proposalTitleReasonFields,
    proposedChanges: habitPlanPayloadSchema,
  }),
  z.object({
    intent: z.literal("adapt_habit_plan"),
    targetDomain: proposalTargetDomainSchema,
    ...proposalTitleReasonFields,
    proposedChanges: habitPlanProposalChangesSchema,
  }),
  z.object({
    intent: z.literal("summarize_progress"),
    targetDomain: proposalTargetDomainSchema,
    ...proposalTitleReasonFields,
    proposedChanges: emptyProposalChangesSchema,
  }),
  z.object({
    intent: z.literal("capture_wellbeing_checkin"),
    targetDomain: proposalTargetDomainSchema,
    ...proposalTitleReasonFields,
    proposedChanges: captureWellbeingCheckinProposalPayloadSchema,
  }),
  z.object({
    intent: z.literal("log_nutrition_incident"),
    targetDomain: proposalTargetDomainSchema,
    ...proposalTitleReasonFields,
    proposedChanges: logNutritionIncidentProposalPayloadSchema,
  }),
]);

export type RawAiProposal = z.infer<typeof rawAiProposalSchema>;

export const chatProposalRevisionSchema = z.object({
  supersededProposalId: z.string().uuid(),
  originalProposal: rawAiProposalSchema,
  modificationFeedback: z.string().min(1).max(2000),
});

export type ChatProposalRevision = z.infer<typeof chatProposalRevisionSchema>;

const aiProposalCoreSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  threadId: z.string().uuid(),
  sourceMessageId: z.string().uuid().nullable(),
  intent: proposalIntentSchema,
  targetDomain: proposalTargetDomainSchema,
  title: z.string().min(1).max(160),
  reason: z.string().min(1).max(1000),
  evidenceRefs: proposalCorrelationEvidenceRefsSchema.optional(),
  proposedChanges: z.unknown(),
  status: proposalStatusSchema,
  validationStatus: proposalValidationStatusSchema,
  validationErrors: z.array(z.string().min(1).max(500)).default([]),
  userDecisionAt: isoDateTimeSchema.nullable(),
  appliedReference: z.string().min(1).max(200).nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

type AiProposalPersistedFields = Omit<
  z.infer<typeof aiProposalCoreSchema>,
  "intent" | "proposedChanges"
>;

export type AiProposal = AiProposalPersistedFields & RawAiProposal;

export const aiProposalSchema = aiProposalCoreSchema.superRefine((proposal, ctx) => {
  addProposedChangesIssues(proposal.intent, proposal.proposedChanges, ctx);
}) as z.ZodType<AiProposal>;

export const aiStructuredOutputSchema = z.object({
  reply: z.string().min(1).max(8000),
  proposals: z.array(rawAiProposalSchema).max(5).default([]),
});

export type AiStructuredOutput = z.infer<typeof aiStructuredOutputSchema>;
export type AiStructuredOutputInput = z.input<typeof aiStructuredOutputSchema>;

export const proposalDecisionSchema = z
  .object({
    decision: z.enum(["accept", "reject", "modify"]),
    modificationFeedback: z.string().min(1).max(2000).optional(),
    proposedChanges: z.unknown().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.decision === "modify" && !value.modificationFeedback?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "modificationFeedback is required when decision is modify.",
        path: ["modificationFeedback"],
      });
    }

    if (value.decision !== "accept" && value.proposedChanges !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: "proposedChanges is only supported when decision is accept.",
        path: ["proposedChanges"],
      });
    }
  });

export type ProposalDecisionInput = z.infer<typeof proposalDecisionSchema>;

export const proposalModifyResponseSchema = z.object({
  proposal: aiProposalSchema,
  revisionContext: z.object({
    supersededProposalId: z.string().uuid(),
    originalIntent: proposalIntentSchema,
    originalTitle: z.string().min(1).max(160),
    originalReason: z.string().min(1).max(1000),
    modificationFeedback: z.string().min(1).max(2000),
    nextAction: z.literal("send_chat_message"),
    suggestedUserMessage: z.string().min(1).max(4000),
  }),
});

export type ProposalModifyResponse = z.infer<typeof proposalModifyResponseSchema>;

export const chatTurnResponseSchema = z.object({
  thread: chatThreadSchema,
  userMessage: chatMessageSchema,
  assistantMessage: chatMessageSchema,
  proposals: z.array(aiProposalSchema),
  attachmentOutcomes: z.array(z.lazy(() => chatAttachmentOutcomeSchema)).optional(),
});

export type ChatTurnResponse = z.infer<typeof chatTurnResponseSchema>;

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
export * from "./device-metrics.js";
export * from "./document-signals.js";
export * from "./documents.js";
export * from "./exercises.js";
export * from "./wellbeing-check-ins.js";
export * from "./nutrition-incidents.js";
export * from "./recipes.js";
export * from "./chat-action-proposals.js";
export * from "./chat-attachments.js";
export * from "./chat-attachment-classification.js";
export * from "./chat-attachment-category-source.js";
export * from "./chat-attachment-upload-disposition.js";
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
  aggregateRecipesActivityWeek,
  aggregateTodayChecklists,
  countSufficientDomains,
  detectCrossDomainProposalConflict,
  domainSufficiencyLevelSchema,
  evaluateWeeklyReviewLaneEligibility,
  habitsProgressAggregateSchema,
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
  type NutritionProgressAggregate,
  type RecipesProgressAggregate,
  type TodayProgressAggregate,
  type WeeklyReviewCandidateProposal,
  type WeeklyReviewLane,
  type WeeklyReviewLaneOutcome,
  type WeeklyReviewPackMeta,
} from "./progress-cross-domain.js";

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
  agentGetDocumentContextToolResultSchema,
  agentGetUserContextSliceToolResultSchema,
  agentGetWeeklyProgressContextToolResultSchema,
  agentToolCallRequestSchema,
  agentToolCallResultSchema,
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
  llmIntentRouterOutputSchema,
  normalRouterCatalogIntentIdSchema,
  attachmentCatalogIntentIdSchema,
  catalogIntentIdSchema,
  MAX_AGENT_LOOP_ITERATIONS,
  MAX_CONTEXT_SLICES,
  mergeLlmRouterOutputIntoRoute,
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
  validateLlmRouterOutputShape,
  weeklyProgressContextSummarySchema,
  workoutExecutionSummarySchema,
  agentRoutingMetadataSchema,
  agentSafetyFlagSchema,
  type AgentLoopFinalAnswer,
  type AgentLoopOutput,
  type AgentLoopOutputInput,
  type AgentLoopToolRequest,
  type AgentRoutingMethod,
  type AgentRoutingMetadata,
  type AgentSafetyFlag,
  type ContextSliceRequest,
  type ExpectedResponseMode,
  type LlmIntentRouterOutput,
  type LlmIntentRouterOutputInput,
  type NormalRouterCatalogIntentId,
  type AgentCitation,
  type AgentContextPacket,
  type AgentIntent,
  type AttachmentCatalogIntentId,
  type CatalogIntentId,
  type AgentSafetyMetadata,
  type AgentSafetyStatus,
  type AgentGetDocumentContextToolResult,
  type AgentGetUserContextSliceToolResult,
  type AgentGetWeeklyProgressContextToolResult,
  type AgentToolCallRequest,
  type AgentToolCallResult,
  type AgentToolName,
  type AgentTurnCapabilityDescriptor,
  type AgentTurnCapabilityPresentation,
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
  resolveAttachmentCatalogIntentId,
  resolveMappedAgentIntent,
  resolvePrimaryAttachmentCatalogIntentId,
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
  OPENAI_COACH_LOOP_TEMPLATE_KEY,
  OPENAI_INTENT_ROUTER_TEMPLATE_KEY,
  PROMPT_TEMPLATE_KEYS,
  PROMPT_TEMPLATE_REQUIRED_PLACEHOLDERS,
  type PromptTemplateKey,
} from "./prompt-template-defaults.js";
export {
  AI_BEHAVIOR_CONFIG_VERSION,
  aiBehaviorConfigSchema,
  aiBehaviorConfigVersionSchema,
  attachmentRoutingConfigSchema,
  buildDefaultAiBehaviorConfig,
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
  resolvePrimaryAttachmentCapabilityId,
  resolveProposalRevisionCapabilityId,
  responseModesBehaviorConfigSchema,
  safeParseAiBehaviorConfig,
  validateAiBehaviorConfig,
  type AiBehaviorConfig,
  type AiBehaviorConfigLoadResult,
  type AiBehaviorConfigLoadSource,
  type AiBehaviorConfigParseResult,
  type AiBehaviorConfigVersion,
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
