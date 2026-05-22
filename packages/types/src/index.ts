import { z } from "zod";

export const apiStatusSchema = z.enum(["ok"]);

export type ApiStatus = z.infer<typeof apiStatusSchema>;

export const healthResponseSchema = z.object({
  status: apiStatusSchema,
  service: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: "Expected date in YYYY-MM-DD format",
});

export const isoDateTimeSchema = z.string().datetime();

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
  startDate: isoDateSchema.nullable().optional(),
  targetDate: isoDateSchema.nullable().optional(),
});

export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;

export const onboardingSchema = z.object({
  user: updateCurrentUserSchema.optional(),
  profile: upsertUserProfileSchema,
  goals: z.array(createGoalSchema).min(1),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

export const currentUserStateSchema = z.object({
  user: userSchema,
  profile: userProfileSchema.nullable(),
  goals: z.array(goalSchema),
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

export const sendChatMessageSchema = z.object({
  content: z.string().min(1).max(4000),
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
  "create_nutrition_plan",
  "adjust_nutrition_plan",
  "create_today_checklist",
  "summarize_progress",
]);

export type ProposalIntent = z.infer<typeof proposalIntentSchema>;

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

export const workoutPlanDaySchema = z.object({
  day: z.string().min(1).max(80),
  focus: z.string().min(1).max(160),
  exercises: z.array(workoutExercisePayloadSchema).max(20).default([]),
});

export const workoutPlanPayloadSchema = z.object({
  title: z.string().min(1).max(160),
  summary: z.string().min(1).max(1000),
  days: z.array(workoutPlanDaySchema).min(1).max(14),
  notes: z.array(z.string().min(1).max(240)).max(20).default([]),
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
  exercises: z.array(workoutExercisePayloadSchema),
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

export const nutritionPlanPayloadSchema = z.object({
  title: z.string().min(1).max(160),
  summary: z.string().min(1).max(1000),
  caloriesPerDay: z.number().int().positive().max(10000).nullable(),
  proteinGrams: z.number().int().nonnegative().max(1000).nullable(),
  carbsGrams: z.number().int().nonnegative().max(1500).nullable(),
  fatGrams: z.number().int().nonnegative().max(1000).nullable(),
  hydrationLiters: z.number().positive().max(20).nullable(),
  notes: z.array(z.string().min(1).max(240)).max(20).default([]),
});

export type NutritionPlanPayload = z.infer<typeof nutritionPlanPayloadSchema>;

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

export const todayChecklistItemSchema = z.object({
  label: z.string().min(1).max(160),
  kind: z.enum(["workout", "nutrition", "hydration", "recovery", "habit"]),
  completed: z.boolean().default(false),
});

export const todayChecklistPayloadSchema = z.object({
  date: isoDateSchema,
  items: z.array(todayChecklistItemSchema).min(1).max(30),
});

export type TodayChecklistPayload = z.infer<typeof todayChecklistPayloadSchema>;

export const profileProposalChangesSchema = upsertUserProfileSchema;

export const createGoalProposalChangesSchema = createGoalSchema;

export const updateGoalProposalChangesSchema = z.object({
  goalId: z.string().uuid(),
  changes: updateGoalSchema,
});

export const proposalChangesSchema = z.union([
  profileProposalChangesSchema,
  createGoalProposalChangesSchema,
  updateGoalProposalChangesSchema,
  workoutPlanPayloadSchema,
  nutritionPlanPayloadSchema,
  todayChecklistPayloadSchema,
  z.record(z.string(), z.unknown()),
]);

export type ProposalChanges = z.infer<typeof proposalChangesSchema>;

export const aiProposalSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  threadId: z.string().uuid(),
  sourceMessageId: z.string().uuid().nullable(),
  intent: proposalIntentSchema,
  targetDomain: proposalTargetDomainSchema,
  title: z.string().min(1).max(160),
  reason: z.string().min(1).max(1000),
  proposedChanges: proposalChangesSchema,
  status: proposalStatusSchema,
  validationStatus: proposalValidationStatusSchema,
  validationErrors: z.array(z.string().min(1).max(500)).default([]),
  userDecisionAt: isoDateTimeSchema.nullable(),
  appliedReference: z.string().min(1).max(200).nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type AiProposal = z.infer<typeof aiProposalSchema>;

export const rawAiProposalSchema = z.object({
  intent: proposalIntentSchema,
  targetDomain: proposalTargetDomainSchema,
  title: z.string().min(1).max(160),
  reason: z.string().min(1).max(1000),
  proposedChanges: proposalChangesSchema,
});

export type RawAiProposal = z.infer<typeof rawAiProposalSchema>;

export const aiStructuredOutputSchema = z.object({
  reply: z.string().min(1).max(8000),
  proposals: z.array(rawAiProposalSchema).max(5).default([]),
});

export type AiStructuredOutput = z.infer<typeof aiStructuredOutputSchema>;

export const proposalDecisionSchema = z.object({
  decision: z.enum(["accept", "reject"]),
});

export type ProposalDecisionInput = z.infer<typeof proposalDecisionSchema>;

export const chatTurnResponseSchema = z.object({
  thread: chatThreadSchema,
  userMessage: chatMessageSchema,
  assistantMessage: chatMessageSchema,
  proposals: z.array(aiProposalSchema),
});

export type ChatTurnResponse = z.infer<typeof chatTurnResponseSchema>;
