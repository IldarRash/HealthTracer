import {
  bodyCompositionAnalysisResponseSchema,
  type BodyCompositionAnalysisResponse,
  updateCurrentUserSchema,
  activeHabitPlanResponseSchema,
  activeNutritionPlanResponseSchema,
  activeWorkoutPlanResponseSchema,
  aiMetricsContextSummarySchema,
  aiProposalSchema,
  chatAttachmentRecordSchema,
  chatMessageSchema,
  chatThreadSchema,
  chatTurnResponseSchema,
  createChatAttachmentSchema,
  sendChatMessageSchema,
  completeWorkoutSessionSchema,
  connectDeviceSchema,
  deviceConnectionSchema,
  deviceConsentSchema,
  generateWeeklyProgressSummarySchema,
  grantDeviceConsentSchema,
  healthMetricAggregateSchema,
  healthMetricSnapshotSchema,
  getProgressProvenanceFromProposal,
  goalSchema,
  generateRecipeRecommendationsResponseSchema,
  habitAdherenceQuerySchema,
  habitAdherenceResponseSchema,
  habitPlanRevisionsResponseSchema,
  groceryListResponseSchema,
  nutritionAdherenceResponseSchema,
  nutritionMealCaloriesReadModelSchema,
  nutritionPlanRevisionSchema,
  proposalDecisionSchema,
  proposalModifyResponseSchema,
  upsertNutritionAdherenceSchema,
  recipeListQuerySchema,
  recipeListResponseSchema,
  recipeSchema,
  logNutritionIncidentProposalPayloadSchema,
  syncHealthMetricsSchema,
  scheduleWorkoutSessionSchema,
  todayWorkoutDetailSchema,
  updateRecipeRecommendationStatusSchema,
  updateWorkoutSessionExerciseSchema,
  userRecipeRecommendationListResponseSchema,
  userRecipeRecommendationSchema,
  workoutPlanRevisionSchema,
  workoutSessionSchema,
  subscriptionSummarySchema,
  entitlementSchema,
  createCheckoutSessionResponseSchema,
  createPortalSessionResponseSchema,
  tolerantArraySchema,
  type ActiveHabitPlanResponse,
  type ActiveNutritionPlanResponse,
  type GroceryListResponse,
  type ActiveWorkoutPlanResponse,
  type AiMetricsContextSummary,
  type AiProposal,
  type ChatAttachmentRecord,
  type ChatMessage,
  type ChatThread,
  type ChatTurnResponse,
  type DirectChatPathRefreshHint,
  type CreateChatAttachmentInput,
  type SendChatMessageInput,
  type ConnectDeviceInput,
  type DeviceConnection,
  type DeviceConsent,
  type CompleteWorkoutSessionInput,
  type GenerateRecipeRecommendationsResponse,
  type GrantDeviceConsentInput,
  type Goal,
  type HabitAdherenceResponse,
  type HabitAdherenceWindow,
  type HabitPlanRevision,
  type HealthMetricAggregate,
  type HealthMetricSnapshot,
  type ListHealthMetricAggregatesQuery,
  type ListHealthMetricSnapshotsQuery,
  type NutritionAdherenceResponse,
  type NutritionMealCaloriesReadModel,
  type NutritionPlanRevision,
  type UpsertNutritionAdherenceInput,
  type Recipe,
  type RecipeListQuery,
  type RecipeListResponse,
  type UpdateRecipeRecommendationStatusInput,
  type UserRecipeRecommendation,
  type UserRecipeRecommendationListResponse,
  type SyncHealthMetricsInput,
  type ScheduleWorkoutSessionInput,
  type User,
  type UserProfile,
  type TodayDayResponse,
  type TodayHistoryResponse,
  type TodayWorkoutDetail,
  type UpdateTodayFeedbackInput,
  type UpdateTodayItemStatusInput,
  type UpdateWorkoutSessionExerciseInput,
  type WeeklyProgressSummaryResponse,
  type WeeklyReviewRequest,
  type WeeklyReviewResponse,
  type ProposalModifyResponse,
  type WorkoutPlanRevision,
  type WorkoutSession,
  biomarkerHistoryResponseSchema,
  biomarkerReadingSchema,
  biomarkersDashboardResponseSchema,
  createBiomarkerReadingSchema,
  createLabReportSchema,
  labReportDetailSchema,
  labReportListResponseSchema,
  labReportSchema,
  updateBiomarkerReadingSchema,
  updateLabReportConsentSchema,
  type BiomarkerHistoryResponse,
  type BiomarkerKey,
  type BiomarkerReading,
  type BiomarkersDashboardResponse,
  type CreateBiomarkerReadingInput,
  type CreateLabReportInput,
  type LabReport,
  type LabReportDetail,
  type UpdateBiomarkerReadingInput,
  type UpdateLabReportConsentInput,
  currentUserStateSchema,
  onboardingSchema,
  todayDayResponseSchema,
  todayHistoryResponseSchema,
  updateTodayFeedbackSchema,
  updateTodayItemStatusSchema,
  upsertWellbeingCheckInSchema,
  upsertRecoveryCheckInSchema,
  recoveryContextResponseSchema,
  recoveryWeeklyContextResponseSchema,
  recoveryCheckInUpsertResponseSchema,
  userProfileSchema,
  userSchema,
  weeklyProgressSummaryResponseSchema,
  weeklyReviewRequestSchema,
  weeklyReviewResponseSchema,
  wellbeingCheckInAggregatesResponseSchema,
  wellbeingCheckInHistoryResponseSchema,
  wellbeingCheckInResponseSchema,
  wellbeingCheckInUpsertResponseSchema,
  type CurrentUserState,
  type OnboardingInput,
  type UpsertWellbeingCheckInInput,
  type UpsertRecoveryCheckInInput,
  type RecoveryContextResponse,
  type RecoveryWeeklyContextResponse,
  type RecoveryCheckInUpsertResponse,
  type WellbeingCheckInAggregatesResponse,
  type WellbeingCheckInHistoryResponse,
  type WellbeingCheckInResponse,
  type WellbeingCheckInUpsertResponse,
  type SubscriptionSummary,
  type Entitlement,
  type CreateCheckoutSessionResponse,
  type CreatePortalSessionResponse,
} from "@health/types";
import { z } from "zod";
import { clientApiBaseUrl } from "../env";
import {
  REQUEST_ID_HEADER,
  createRequestId,
  getApiErrorMessage,
  normalizeRequestId,
} from "./request-correlation";

export type InspectorState = {
  user: User | null;
  profile: UserProfile | null;
  goals: Goal[];
  errors: string[];
};

export type ChatThreadDetail = {
  thread: ChatThread;
  messages: ChatMessage[];
};

export type ApiResult<T> = {
  data?: T;
  error?: string;
  requestId?: string;
};

export { getApiErrorMessage };

export const apiQueryKeys = {
  currentUser: ["current-user"],
  currentUserState: ["current-user-state"],
  profile: ["profile"],
  goals: ["goals"],
  dashboardState: ["dashboard-state"],
  longevityState: ["longevity-state"],
  proposals: ["proposals"],
  workoutActive: ["workout-active"],
  workoutRevisions: ["workout-revisions"],
  nutritionActive: ["nutrition-active"],
  nutritionMealsBreakdown: ["nutrition-meals-breakdown"],
  nutritionRevisions: ["nutrition-revisions"],
  nutritionGroceryList: ["nutrition-grocery-list"],
  habitActive: ["habit-active"],
  habitRevisions: ["habit-revisions"],
  habitAdherence: (window: HabitAdherenceWindow = 7) => ["habit-adherence", window] as const,
  habitAdherencePrefix: ["habit-adherence"] as const,
  nutritionAdherenceToday: ["nutrition-adherence-today"],
  nutritionAdherence: (date: string) => ["nutrition-adherence", date] as const,
  nutritionAdherencePrefix: ["nutrition-adherence"] as const,
  todayDay: (date: string) => ["today-day", date] as const,
  todayHistory: (limit = 7) => ["today-history", limit] as const,
  todayDayPrefix: ["today-day"] as const,
  todayHistoryPrefix: ["today-history"] as const,
  progressWeeklyLatest: ["progress-weekly-latest"],
  progressWeeklyCurrent: ["progress-weekly-current"],
  progressWeeklyReview: ["progress-weekly-review"],
  recipesCatalog: ["recipes-catalog"],
  recipeDetail: (recipeId: string) => ["recipe-detail", recipeId] as const,
  recipeRecommendations: ["recipe-recommendations"],
  deviceConnections: ["device-connections"],
  healthMetricSnapshots: ["health-metric-snapshots"],
  healthMetricAggregates: ["health-metric-aggregates"],
  healthMetricsAiPreview: ["health-metrics-ai-preview"],
  labReports: ["lab-reports"] as const,
  labReportDetail: (reportId: string) => ["lab-report-detail", reportId] as const,
  biomarkersDashboard: ["biomarkers-dashboard"] as const,
  biomarkerHistory: (markerKey: string) => ["biomarker-history", markerKey] as const,
  biomarkerHistoryPrefix: ["biomarker-history"] as const,
  wellbeingCheckIn: (date: string) => ["wellbeing-check-in", date] as const,
  wellbeingCheckInPrefix: ["wellbeing-check-in"] as const,
  wellbeingHistory: (limit = 7) => ["wellbeing-history", limit] as const,
  wellbeingHistoryPrefix: ["wellbeing-history"] as const,
  wellbeingAggregates: (limit = 7) => ["wellbeing-aggregates", limit] as const,
  wellbeingAggregatesPrefix: ["wellbeing-aggregates"] as const,
  recoveryContext: (date: string) => ["recovery-context", date] as const,
  recoveryContextPrefix: ["recovery-context"] as const,
  billingSubscription: ["billing-subscription"] as const,
  billingEntitlement: ["billing-entitlement"] as const,
  bodyAnalysisLatest: ["body-analysis-latest"] as const,
} as const;

const syncHealthMetricsResultSchema = z.object({
  inserted: healthMetricSnapshotSchema.array(),
  skipped: z.number().int().nonnegative(),
  aggregatesRefreshed: z.number().int().nonnegative(),
});

export type SyncHealthMetricsResult = z.infer<typeof syncHealthMetricsResultSchema>;

const chatThreadDetailSchema = z.object({
  thread: chatThreadSchema,
  // Tolerant: one malformed persisted message must never make the whole
  // conversation unloadable.
  messages: tolerantArraySchema(chatMessageSchema, "chatThread.message"),
});

export async function getCurrentUser(token: string): Promise<ApiResult<User>> {
  return apiFetch("/users/me", token, userSchema);
}

export async function updateUserLocale(
  token: string,
  locale: string,
): Promise<ApiResult<User>> {
  const body = updateCurrentUserSchema.parse({ locale });
  return apiFetch("/users/me", token, userSchema, { method: "PATCH", body });
}

export async function getCurrentUserState(
  token: string,
): Promise<ApiResult<CurrentUserState>> {
  return apiFetch("/users/me/state", token, currentUserStateSchema);
}

export async function completeOnboarding(
  token: string,
  input: OnboardingInput,
): Promise<ApiResult<CurrentUserState>> {
  const body = onboardingSchema.parse(input);
  return apiFetch("/onboarding", token, currentUserStateSchema, {
    method: "POST",
    body,
  });
}

export function getOnboardingRefreshQueryKeys(): ReadonlyArray<readonly unknown[]> {
  return [
    apiQueryKeys.currentUserState,
    apiQueryKeys.currentUser,
    apiQueryKeys.profile,
    apiQueryKeys.goals,
    apiQueryKeys.dashboardState,
    apiQueryKeys.longevityState,
  ];
}

export async function getCurrentProfile(
  token: string,
): Promise<ApiResult<UserProfile | null>> {
  return apiFetch("/profile", token, userProfileSchema.nullable());
}

export async function listGoals(token: string): Promise<ApiResult<Goal[]>> {
  return apiFetch("/goals", token, goalSchema.array());
}

export async function getInspectorState(token: string): Promise<InspectorState> {
  const [user, profile, goals] = await Promise.all([
    getCurrentUser(token),
    getCurrentProfile(token),
    listGoals(token),
  ]);

  return {
    user: user.data ?? null,
    profile: profile.data ?? null,
    goals: goals.data ?? [],
    errors: [user.error, profile.error, goals.error].filter(isString),
  };
}

export async function listChatThreads(token: string): Promise<ApiResult<ChatThread[]>> {
  return apiFetch("/chat/threads", token, chatThreadSchema.array());
}

export async function createChatThread(
  token: string,
  title?: string,
): Promise<ApiResult<ChatThread>> {
  return apiFetch("/chat/threads", token, chatThreadSchema, {
    method: "POST",
    body: title ? { title } : {},
  });
}

export async function getChatThread(
  token: string,
  threadId: string,
): Promise<ApiResult<ChatThreadDetail>> {
  return apiFetch(`/chat/threads/${threadId}`, token, chatThreadDetailSchema);
}

export type SendChatMessageOptions = Pick<
  SendChatMessageInput,
  "proposalRevision" | "attachmentRefIds"
>;

export async function sendChatMessage(
  token: string,
  threadId: string,
  content: string,
  options?: SendChatMessageOptions,
): Promise<ApiResult<ChatTurnResponse>> {
  const body = sendChatMessageSchema.parse({
    content,
    ...(options?.proposalRevision ? { proposalRevision: options.proposalRevision } : {}),
    ...(options?.attachmentRefIds?.length
      ? { attachmentRefIds: options.attachmentRefIds }
      : {}),
  });

  return apiFetch(`/chat/threads/${threadId}/messages`, token, chatTurnResponseSchema, {
    method: "POST",
    body,
  });
}

export async function uploadChatAttachment(
  token: string,
  input: CreateChatAttachmentInput,
): Promise<ApiResult<ChatAttachmentRecord>> {
  const body = createChatAttachmentSchema.parse(input);
  return apiFetch("/chat/attachments", token, chatAttachmentRecordSchema, {
    method: "POST",
    body,
  });
}

export async function listProposals(
  token: string,
  threadId?: string,
): Promise<ApiResult<AiProposal[]>> {
  const query = threadId ? `?threadId=${encodeURIComponent(threadId)}` : "";
  // Tolerant: a single malformed proposal row must not hide the rest.
  return apiFetch(
    `/proposals${query}`,
    token,
    tolerantArraySchema(aiProposalSchema, "proposals"),
  );
}

export async function decideProposal(
  token: string,
  proposalId: string,
  decision: "accept" | "reject",
  options?: { proposedChanges?: unknown },
): Promise<ApiResult<AiProposal>> {
  const body = proposalDecisionSchema.parse({
    decision,
    ...(options?.proposedChanges !== undefined
      ? { proposedChanges: options.proposedChanges }
      : {}),
  });
  return apiFetch(`/proposals/${proposalId}/decision`, token, aiProposalSchema, {
    method: "POST",
    body,
  });
}

export async function modifyProposal(
  token: string,
  proposalId: string,
  modificationFeedback: string,
): Promise<ApiResult<ProposalModifyResponse>> {
  const body = proposalDecisionSchema.parse({
    decision: "modify",
    modificationFeedback,
  });
  return apiFetch(
    `/proposals/${proposalId}/decision`,
    token,
    proposalModifyResponseSchema,
    {
      method: "POST",
      body,
    },
  );
}

export function getHabitDependentRefreshQueryKeys(): ReadonlyArray<readonly unknown[]> {
  return [
    apiQueryKeys.habitActive,
    apiQueryKeys.habitRevisions,
    apiQueryKeys.habitAdherencePrefix,
    apiQueryKeys.todayDayPrefix,
    apiQueryKeys.todayHistoryPrefix,
  ];
}

export function getHabitExecutionRefreshQueryKeys(): ReadonlyArray<readonly unknown[]> {
  return [
    ...getHabitDependentRefreshQueryKeys(),
    apiQueryKeys.longevityState,
    apiQueryKeys.dashboardState,
  ];
}

export function getAcceptedProposalRefreshQueryKeys(
  proposal: AiProposal,
): ReadonlyArray<readonly unknown[]> {
  if (proposal.status !== "accepted") {
    return [];
  }

  const commonKeys = [
    apiQueryKeys.dashboardState,
    apiQueryKeys.longevityState,
    apiQueryKeys.proposals,
  ];

  if (
    proposal.intent === "create_habit_plan" ||
    proposal.intent === "adapt_habit_plan"
  ) {
    return [
      ...commonKeys,
      ...getHabitDependentRefreshQueryKeys(),
      ...getProgressLinkedProposalRefreshQueryKeys(proposal),
    ];
  }

  if (proposal.intent === "capture_wellbeing_checkin") {
    return [
      ...commonKeys,
      ...getWellbeingRefreshQueryKeys(),
      apiQueryKeys.todayDayPrefix,
      apiQueryKeys.todayHistoryPrefix,
    ];
  }

  if (proposal.intent === "log_nutrition_incident") {
    const keys: Array<readonly unknown[]> = [
      ...commonKeys,
      apiQueryKeys.nutritionAdherenceToday,
      apiQueryKeys.nutritionAdherencePrefix,
      apiQueryKeys.todayDayPrefix,
      apiQueryKeys.todayHistoryPrefix,
    ];
    const parsedIncident = logNutritionIncidentProposalPayloadSchema.safeParse(
      proposal.proposedChanges,
    );
    if (
      parsedIncident.success &&
      parsedIncident.data.provenance.source === "recipe_recommendation"
    ) {
      keys.push(apiQueryKeys.recipeRecommendations);
    }
    return keys;
  }

  switch (proposal.targetDomain) {
    case "profile":
      return [...commonKeys, apiQueryKeys.profile];
    case "goal":
      return [...commonKeys, apiQueryKeys.goals];
    case "workout":
      return [
        ...commonKeys,
        apiQueryKeys.workoutActive,
        apiQueryKeys.workoutRevisions,
        apiQueryKeys.progressWeeklyLatest,
        apiQueryKeys.progressWeeklyCurrent,
        apiQueryKeys.progressWeeklyReview,
        apiQueryKeys.todayDayPrefix,
        apiQueryKeys.todayHistoryPrefix,
      ];
    case "nutrition":
      return [
        ...commonKeys,
        apiQueryKeys.nutritionActive,
        apiQueryKeys.nutritionRevisions,
        apiQueryKeys.nutritionAdherenceToday,
        apiQueryKeys.nutritionAdherencePrefix,
        apiQueryKeys.todayDayPrefix,
        apiQueryKeys.todayHistoryPrefix,
        ...getProgressLinkedProposalRefreshQueryKeys(proposal),
      ];
    case "recipe":
      return [
        ...commonKeys,
        apiQueryKeys.recipeRecommendations,
        apiQueryKeys.recipesCatalog,
      ];
    case "today":
      return [
        ...commonKeys,
        apiQueryKeys.todayDayPrefix,
        apiQueryKeys.todayHistoryPrefix,
        ...getProgressLinkedProposalRefreshQueryKeys(proposal),
      ];
    case "general":
      if (proposal.intent === "summarize_progress") {
        return [
          ...commonKeys,
          apiQueryKeys.progressWeeklyLatest,
          apiQueryKeys.progressWeeklyCurrent,
          apiQueryKeys.progressWeeklyReview,
        ];
      }

      return commonKeys;
    case "body":
      return [...commonKeys, apiQueryKeys.profile];
  }
}

function getProgressLinkedProposalRefreshQueryKeys(
  proposal: Pick<AiProposal, "intent" | "proposedChanges" | "status">,
): ReadonlyArray<readonly unknown[]> {
  if (!getProgressProvenanceFromProposal(proposal.intent, proposal.proposedChanges)) {
    return [];
  }

  return [
    apiQueryKeys.progressWeeklyLatest,
    apiQueryKeys.progressWeeklyCurrent,
    apiQueryKeys.progressWeeklyReview,
    apiQueryKeys.longevityState,
  ];
}

export function getProposalDecisionRefreshQueryKeys(
  proposal: AiProposal,
): ReadonlyArray<readonly unknown[]> {
  const keys = new Map<string, readonly unknown[]>();

  const addKey = (queryKey: readonly unknown[]) => {
    keys.set(JSON.stringify(queryKey), queryKey);
  };

  addKey(apiQueryKeys.proposals);

  if (proposal.status === "accepted") {
    for (const queryKey of getAcceptedProposalRefreshQueryKeys(proposal)) {
      addKey(queryKey);
    }
  } else {
    for (const queryKey of getProgressLinkedProposalRefreshQueryKeys(proposal)) {
      addKey(queryKey);
    }
  }

  return [...keys.values()];
}

export async function getActiveWorkoutPlan(
  token: string,
): Promise<ApiResult<ActiveWorkoutPlanResponse>> {
  return apiFetch("/workouts/active", token, activeWorkoutPlanResponseSchema);
}

export async function listWorkoutRevisions(
  token: string,
): Promise<ApiResult<WorkoutPlanRevision[]>> {
  return apiFetch("/workouts/revisions", token, workoutPlanRevisionSchema.array());
}

export async function scheduleWorkoutSession(
  token: string,
  input: ScheduleWorkoutSessionInput,
): Promise<ApiResult<WorkoutSession>> {
  const body = scheduleWorkoutSessionSchema.parse(input);
  return apiFetch("/workouts/sessions", token, workoutSessionSchema, {
    method: "POST",
    body,
  });
}

export async function completeWorkoutSession(
  token: string,
  sessionId: string,
  input: CompleteWorkoutSessionInput,
): Promise<ApiResult<WorkoutSession>> {
  const body = completeWorkoutSessionSchema.parse(input);
  return apiFetch(
    `/workouts/sessions/${sessionId}/complete`,
    token,
    workoutSessionSchema,
    { method: "PATCH", body },
  );
}

export async function startTodayWorkout(
  token: string,
  date: string,
): Promise<ApiResult<TodayWorkoutDetail>> {
  return apiFetch(
    `/workouts/today/${encodeURIComponent(date)}/start`,
    token,
    todayWorkoutDetailSchema,
    { method: "POST" },
  );
}

export async function updateWorkoutSessionExercise(
  token: string,
  sessionId: string,
  exerciseId: string,
  input: UpdateWorkoutSessionExerciseInput,
): Promise<ApiResult<WorkoutSession>> {
  const body = updateWorkoutSessionExerciseSchema.parse(input);
  return apiFetch(
    `/workouts/sessions/${sessionId}/exercises/${encodeURIComponent(exerciseId)}`,
    token,
    workoutSessionSchema,
    { method: "PATCH", body },
  );
}

export function getWorkoutExecutionRefreshQueryKeys(): ReadonlyArray<readonly unknown[]> {
  return [
    apiQueryKeys.todayDayPrefix,
    apiQueryKeys.todayHistoryPrefix,
    apiQueryKeys.habitAdherencePrefix,
    apiQueryKeys.workoutActive,
    apiQueryKeys.progressWeeklyLatest,
    apiQueryKeys.progressWeeklyCurrent,
    apiQueryKeys.longevityState,
    apiQueryKeys.wellbeingCheckInPrefix,
    apiQueryKeys.wellbeingHistoryPrefix,
    apiQueryKeys.wellbeingAggregatesPrefix,
  ];
}

export function getTodayItemStatusRefreshQueryKeys(): ReadonlyArray<readonly unknown[]> {
  return getWorkoutExecutionRefreshQueryKeys();
}

export function getDirectChatPathRefreshQueryKeys(
  refreshHints: readonly DirectChatPathRefreshHint[],
): ReadonlyArray<readonly unknown[]> {
  const keys: Array<readonly unknown[]> = [];

  for (const hint of refreshHints) {
    switch (hint) {
      case "today":
        keys.push(apiQueryKeys.todayDayPrefix, apiQueryKeys.todayHistoryPrefix);
        break;
      case "dashboard":
        keys.push(apiQueryKeys.dashboardState);
        break;
      case "longevity":
        keys.push(apiQueryKeys.longevityState);
        break;
      default: {
        const _exhaustive: never = hint;
        return _exhaustive;
      }
    }
  }

  return keys;
}

export function getWellbeingRefreshQueryKeys(): ReadonlyArray<readonly unknown[]> {
  return [
    apiQueryKeys.wellbeingCheckInPrefix,
    apiQueryKeys.wellbeingHistoryPrefix,
    apiQueryKeys.wellbeingAggregatesPrefix,
    apiQueryKeys.longevityState,
  ];
}

export function buildWellbeingHistoryQueryString(limit = 7): string {
  return `?limit=${encodeURIComponent(String(limit))}`;
}

export function buildWellbeingAggregatesQueryString(limit = 7): string {
  return `?periodType=daily&limit=${encodeURIComponent(String(limit))}`;
}

export async function getWellbeingCheckIn(
  token: string,
  date: string,
): Promise<ApiResult<WellbeingCheckInResponse>> {
  return apiFetch(
    `/wellbeing-check-ins/${encodeURIComponent(date)}`,
    token,
    wellbeingCheckInResponseSchema,
  );
}

export async function upsertWellbeingCheckIn(
  token: string,
  date: string,
  input: UpsertWellbeingCheckInInput,
): Promise<ApiResult<WellbeingCheckInUpsertResponse>> {
  const body = upsertWellbeingCheckInSchema.parse(input);
  return apiFetch(
    `/wellbeing-check-ins/${encodeURIComponent(date)}`,
    token,
    wellbeingCheckInUpsertResponseSchema,
    { method: "PUT", body },
  );
}

export async function getWellbeingHistory(
  token: string,
  limit = 7,
): Promise<ApiResult<WellbeingCheckInHistoryResponse>> {
  const query = buildWellbeingHistoryQueryString(limit);
  return apiFetch(
    `/wellbeing-check-ins/history${query}`,
    token,
    wellbeingCheckInHistoryResponseSchema,
  );
}

export async function getWellbeingAggregates(
  token: string,
  limit = 7,
): Promise<ApiResult<WellbeingCheckInAggregatesResponse>> {
  const query = buildWellbeingAggregatesQueryString(limit);
  return apiFetch(
    `/wellbeing-check-ins/aggregates${query}`,
    token,
    wellbeingCheckInAggregatesResponseSchema,
  );
}

export function buildRecoveryContextQueryString(date: string): string {
  return `?date=${encodeURIComponent(date)}`;
}

export function buildRecoveryWeeklyContextQueryString(weekStart: string): string {
  return `?weekStart=${encodeURIComponent(weekStart)}`;
}

export function getRecoveryRefreshQueryKeys(): ReadonlyArray<readonly unknown[]> {
  return [
    apiQueryKeys.recoveryContextPrefix,
    apiQueryKeys.longevityState,
    apiQueryKeys.todayDayPrefix,
  ];
}

export async function getRecoveryContext(
  token: string,
  date: string,
): Promise<ApiResult<RecoveryContextResponse>> {
  const query = buildRecoveryContextQueryString(date);
  return apiFetch(`/recovery/context${query}`, token, recoveryContextResponseSchema);
}

export async function getRecoveryWeeklyContext(
  token: string,
  weekStart: string,
): Promise<ApiResult<RecoveryWeeklyContextResponse>> {
  const query = buildRecoveryWeeklyContextQueryString(weekStart);
  return apiFetch(
    `/recovery/context/weekly${query}`,
    token,
    recoveryWeeklyContextResponseSchema,
  );
}

export async function upsertRecoveryCheckIn(
  token: string,
  input: UpsertRecoveryCheckInInput,
): Promise<ApiResult<RecoveryCheckInUpsertResponse>> {
  const body = upsertRecoveryCheckInSchema.parse(input);
  return apiFetch("/recovery/check-in", token, recoveryCheckInUpsertResponseSchema, {
    method: "POST",
    body,
  });
}

export function getNutritionAdherenceRefreshQueryKeys(): ReadonlyArray<readonly unknown[]> {
  return [
    apiQueryKeys.nutritionAdherenceToday,
    apiQueryKeys.nutritionAdherencePrefix,
    apiQueryKeys.todayDayPrefix,
    apiQueryKeys.todayHistoryPrefix,
    apiQueryKeys.longevityState,
  ];
}

export function getMetricsRefreshQueryKeys(): ReadonlyArray<readonly unknown[]> {
  return [
    apiQueryKeys.deviceConnections,
    apiQueryKeys.healthMetricSnapshots,
    apiQueryKeys.healthMetricAggregates,
    apiQueryKeys.healthMetricsAiPreview,
    apiQueryKeys.longevityState,
  ];
}

export async function getActiveNutritionPlan(
  token: string,
): Promise<ApiResult<ActiveNutritionPlanResponse>> {
  return apiFetch("/nutrition/active", token, activeNutritionPlanResponseSchema);
}

export async function getNutritionMealsBreakdown(
  token: string,
): Promise<ApiResult<NutritionMealCaloriesReadModel | null>> {
  return apiFetch(
    "/nutrition/active/meals-breakdown",
    token,
    nutritionMealCaloriesReadModelSchema.nullable(),
  );
}

export async function listNutritionRevisions(
  token: string,
): Promise<ApiResult<NutritionPlanRevision[]>> {
  return apiFetch("/nutrition/revisions", token, nutritionPlanRevisionSchema.array());
}

/**
 * GET /nutrition/grocery-list
 * Returns the grocery list derived from the active nutrition revision.
 * Pure projection — never writes to the DB or creates a plan revision.
 */
export async function getGroceryList(
  token: string,
): Promise<ApiResult<GroceryListResponse>> {
  return apiFetch("/nutrition/grocery-list", token, groceryListResponseSchema);
}

export async function getActiveHabitPlan(
  token: string,
): Promise<ApiResult<ActiveHabitPlanResponse>> {
  return apiFetch("/habits/plan", token, activeHabitPlanResponseSchema);
}

export async function listHabitRevisions(
  token: string,
): Promise<ApiResult<HabitPlanRevision[]>> {
  const result = await apiFetch(
    "/habits/plan/revisions",
    token,
    habitPlanRevisionsResponseSchema,
  );

  if (result.error) {
    return { error: result.error, requestId: result.requestId };
  }

  return { data: result.data?.revisions ?? [], requestId: result.requestId };
}

export function buildHabitAdherenceQueryString(window: HabitAdherenceWindow): string {
  const parsed = habitAdherenceQuerySchema.parse({ window });
  return `?window=${parsed.window}`;
}

export async function getHabitAdherence(
  token: string,
  window: HabitAdherenceWindow = 7,
): Promise<ApiResult<HabitAdherenceResponse>> {
  return apiFetch(
    `/habits/adherence${buildHabitAdherenceQueryString(window)}`,
    token,
    habitAdherenceResponseSchema,
  );
}

export function buildRecipeListQueryString(query: RecipeListQuery = {}): string {
  const parsed = recipeListQuerySchema.parse(query);
  const params = new URLSearchParams();

  if (parsed.mealType) {
    params.set("mealType", parsed.mealType);
  }

  if (parsed.tags?.length) {
    params.set("tags", parsed.tags.join(","));
  }

  if (parsed.compatibleWithRestrictions?.length) {
    params.set("compatibleWithRestrictions", parsed.compatibleWithRestrictions.join(","));
  }

  if (parsed.minCaloriesPerServing != null) {
    params.set("minCaloriesPerServing", String(parsed.minCaloriesPerServing));
  }

  if (parsed.maxCaloriesPerServing != null) {
    params.set("maxCaloriesPerServing", String(parsed.maxCaloriesPerServing));
  }

  if (parsed.minProteinGramsPerServing != null) {
    params.set("minProteinGramsPerServing", String(parsed.minProteinGramsPerServing));
  }

  if (parsed.maxProteinGramsPerServing != null) {
    params.set("maxProteinGramsPerServing", String(parsed.maxProteinGramsPerServing));
  }

  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}

export async function listRecipes(
  token: string,
  query: RecipeListQuery = {},
): Promise<ApiResult<RecipeListResponse>> {
  return apiFetch(
    `/recipes${buildRecipeListQueryString(query)}`,
    token,
    recipeListResponseSchema,
  );
}

export async function getRecipe(
  token: string,
  recipeId: string,
): Promise<ApiResult<Recipe>> {
  return apiFetch(`/recipes/${recipeId}`, token, recipeSchema);
}

export async function listRecipeRecommendations(
  token: string,
): Promise<ApiResult<UserRecipeRecommendationListResponse>> {
  return apiFetch(
    "/recipes/recommendations",
    token,
    userRecipeRecommendationListResponseSchema,
  );
}

export async function generateRecipeRecommendations(
  token: string,
): Promise<ApiResult<GenerateRecipeRecommendationsResponse>> {
  return apiFetch(
    "/recipes/recommendations/generate",
    token,
    generateRecipeRecommendationsResponseSchema,
    { method: "POST", body: {} },
  );
}

export async function updateRecipeRecommendationStatus(
  token: string,
  recommendationId: string,
  input: UpdateRecipeRecommendationStatusInput,
): Promise<ApiResult<UserRecipeRecommendation>> {
  const body = updateRecipeRecommendationStatusSchema.parse(input);
  return apiFetch(
    `/recipes/recommendations/${recommendationId}/status`,
    token,
    userRecipeRecommendationSchema,
    { method: "PATCH", body },
  );
}

export async function buildRecipeNutritionIncidentProposal(
  token: string,
  recommendationId: string,
): Promise<ApiResult<AiProposal>> {
  return apiFetch(
    `/recipes/recommendations/${recommendationId}/nutrition-incident-proposal`,
    token,
    aiProposalSchema,
    { method: "POST", body: {} },
  );
}

export async function getTodayNutritionAdherence(
  token: string,
): Promise<ApiResult<NutritionAdherenceResponse>> {
  return apiFetch("/nutrition/adherence/today", token, nutritionAdherenceResponseSchema);
}

export async function upsertTodayNutritionAdherence(
  token: string,
  input: UpsertNutritionAdherenceInput,
): Promise<ApiResult<NutritionAdherenceResponse>> {
  const body = upsertNutritionAdherenceSchema.parse(input);
  return apiFetch("/nutrition/adherence/today", token, nutritionAdherenceResponseSchema, {
    method: "PUT",
    body,
  });
}

export async function upsertNutritionAdherence(
  token: string,
  date: string,
  input: UpsertNutritionAdherenceInput,
): Promise<ApiResult<NutritionAdherenceResponse>> {
  const body = upsertNutritionAdherenceSchema.parse(input);
  return apiFetch(
    `/nutrition/adherence/${encodeURIComponent(date)}`,
    token,
    nutritionAdherenceResponseSchema,
    { method: "PUT", body },
  );
}

export async function getLatestWeeklyProgressSummary(
  token: string,
): Promise<ApiResult<WeeklyProgressSummaryResponse>> {
  return apiFetch("/progress/weekly/latest", token, weeklyProgressSummaryResponseSchema);
}

export async function getCurrentWeeklyProgressSummary(
  token: string,
): Promise<ApiResult<WeeklyProgressSummaryResponse>> {
  return apiFetch("/progress/weekly/current", token, weeklyProgressSummaryResponseSchema);
}

export async function generateWeeklyProgressSummary(
  token: string,
  input: { weekStart?: string; refresh?: boolean } = {},
): Promise<ApiResult<WeeklyProgressSummaryResponse>> {
  const body = generateWeeklyProgressSummarySchema.parse(input);
  return apiFetch("/progress/weekly/generate", token, weeklyProgressSummaryResponseSchema, {
    method: "POST",
    body,
  });
}

export async function postWeeklyReview(
  token: string,
  input: { weekStart?: string; refresh?: boolean; candidates?: WeeklyReviewRequest["candidates"] } = {},
): Promise<ApiResult<WeeklyReviewResponse>> {
  const body = weeklyReviewRequestSchema.parse(input);
  return apiFetch("/progress/weekly/review", token, weeklyReviewResponseSchema, {
    method: "POST",
    body,
  });
}

export function getProgressSummaryRefreshQueryKeys(): ReadonlyArray<readonly unknown[]> {
  return [
    apiQueryKeys.dashboardState,
    apiQueryKeys.longevityState,
    apiQueryKeys.progressWeeklyReview,
  ];
}

export async function getTodayDay(
  token: string,
  date: string,
): Promise<ApiResult<TodayDayResponse>> {
  return apiFetch(`/today/${encodeURIComponent(date)}`, token, todayDayResponseSchema);
}

export async function updateTodayItemStatus(
  token: string,
  date: string,
  itemId: string,
  input: UpdateTodayItemStatusInput,
): Promise<ApiResult<TodayDayResponse>> {
  const body = updateTodayItemStatusSchema.parse(input);
  return apiFetch(
    `/today/${encodeURIComponent(date)}/items/${encodeURIComponent(itemId)}`,
    token,
    todayDayResponseSchema,
    { method: "PATCH", body },
  );
}

export async function updateTodayFeedback(
  token: string,
  date: string,
  input: UpdateTodayFeedbackInput,
): Promise<ApiResult<TodayDayResponse>> {
  const body = updateTodayFeedbackSchema.parse(input);
  return apiFetch(
    `/today/${encodeURIComponent(date)}/feedback`,
    token,
    todayDayResponseSchema,
    { method: "PATCH", body },
  );
}

export async function getTodayHistory(
  token: string,
  limit = 7,
): Promise<ApiResult<TodayHistoryResponse>> {
  const query = `?limit=${encodeURIComponent(String(limit))}`;
  return apiFetch(`/today/history${query}`, token, todayHistoryResponseSchema);
}

export async function grantDeviceConsent(
  token: string,
  input: GrantDeviceConsentInput,
): Promise<ApiResult<DeviceConsent>> {
  const body = grantDeviceConsentSchema.parse(input);
  return apiFetch("/device-connections/consent", token, deviceConsentSchema, {
    method: "POST",
    body,
  });
}

export async function listDeviceConnections(
  token: string,
): Promise<ApiResult<DeviceConnection[]>> {
  return apiFetch("/device-connections", token, deviceConnectionSchema.array());
}

export async function connectDevice(
  token: string,
  input: ConnectDeviceInput,
): Promise<ApiResult<DeviceConnection>> {
  const body = connectDeviceSchema.parse(input);
  return apiFetch("/device-connections", token, deviceConnectionSchema, {
    method: "POST",
    body,
  });
}

export async function revokeDeviceConnection(
  token: string,
  connectionId: string,
): Promise<ApiResult<DeviceConnection>> {
  return apiFetch(
    `/device-connections/${connectionId}/revoke`,
    token,
    deviceConnectionSchema,
    { method: "POST" },
  );
}

function buildMetricsQuery(
  params: Record<string, string | number | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export async function listHealthMetricSnapshots(
  token: string,
  query: ListHealthMetricSnapshotsQuery = { limit: 50 },
): Promise<ApiResult<HealthMetricSnapshot[]>> {
  const path = `/health-metrics/snapshots${buildMetricsQuery(query)}`;
  return apiFetch(path, token, healthMetricSnapshotSchema.array());
}

export async function listHealthMetricAggregates(
  token: string,
  query: ListHealthMetricAggregatesQuery = { limit: 50 },
): Promise<ApiResult<HealthMetricAggregate[]>> {
  const path = `/health-metrics/aggregates${buildMetricsQuery(query)}`;
  return apiFetch(path, token, healthMetricAggregateSchema.array());
}

export async function syncHealthMetrics(
  token: string,
  input: SyncHealthMetricsInput,
): Promise<ApiResult<SyncHealthMetricsResult>> {
  const body = syncHealthMetricsSchema.parse(input);
  return apiFetch("/health-metrics/sync", token, syncHealthMetricsResultSchema, {
    method: "POST",
    body,
  });
}

export async function previewHealthMetricsAiContext(
  token: string,
): Promise<ApiResult<AiMetricsContextSummary>> {
  return apiFetch(
    "/health-metrics/ai-context-preview",
    token,
    aiMetricsContextSummarySchema,
  );
}

// ── Lab reports + biomarkers ────────────────────────────────────────────────

/**
 * Queries to refresh after anything that changes biomarker readings:
 * upload+extract, extraction retry, report delete, and reading add/edit/delete.
 * Consent-only changes need just `apiQueryKeys.labReports`.
 */
export function getBiomarkersRefreshQueryKeys(): ReadonlyArray<readonly unknown[]> {
  return [
    apiQueryKeys.labReports,
    apiQueryKeys.biomarkersDashboard,
    apiQueryKeys.biomarkerHistoryPrefix,
  ];
}

export async function listLabReports(token: string): Promise<ApiResult<LabReport[]>> {
  const result = await apiFetch("/lab-reports", token, labReportListResponseSchema);
  if (result.error) {
    return { error: result.error, requestId: result.requestId };
  }

  return { data: result.data?.reports ?? [], requestId: result.requestId };
}

export async function getLabReport(
  token: string,
  reportId: string,
): Promise<ApiResult<LabReportDetail>> {
  return apiFetch(
    `/lab-reports/${encodeURIComponent(reportId)}`,
    token,
    labReportDetailSchema,
  );
}

export async function createLabReport(
  token: string,
  input: CreateLabReportInput,
): Promise<ApiResult<LabReport>> {
  const body = createLabReportSchema.parse(input);
  return apiFetch("/lab-reports", token, labReportSchema, {
    method: "POST",
    body,
  });
}

/**
 * POST /lab-reports/:reportId/extract — synchronous LLM extraction.
 * Called right after upload and as the Retry action on failed reports
 * (returns 409 while a concurrent extraction is processing).
 */
export async function extractLabReport(
  token: string,
  reportId: string,
): Promise<ApiResult<LabReportDetail>> {
  return apiFetch(
    `/lab-reports/${encodeURIComponent(reportId)}/extract`,
    token,
    labReportDetailSchema,
    { method: "POST" },
  );
}

export async function updateLabReportConsent(
  token: string,
  reportId: string,
  input: UpdateLabReportConsentInput,
): Promise<ApiResult<LabReport>> {
  const body = updateLabReportConsentSchema.parse(input);
  return apiFetch(
    `/lab-reports/${encodeURIComponent(reportId)}/consent`,
    token,
    labReportSchema,
    { method: "PATCH", body },
  );
}

export async function deleteLabReport(
  token: string,
  reportId: string,
): Promise<ApiResult<LabReport>> {
  return apiFetch(
    `/lab-reports/${encodeURIComponent(reportId)}`,
    token,
    labReportSchema,
    { method: "DELETE" },
  );
}

export async function getBiomarkersDashboard(
  token: string,
): Promise<ApiResult<BiomarkersDashboardResponse>> {
  return apiFetch("/biomarkers", token, biomarkersDashboardResponseSchema);
}

export async function getBiomarkerHistory(
  token: string,
  markerKey: BiomarkerKey,
): Promise<ApiResult<BiomarkerHistoryResponse>> {
  return apiFetch(
    `/biomarkers/${encodeURIComponent(markerKey)}`,
    token,
    biomarkerHistoryResponseSchema,
  );
}

export async function createBiomarkerReading(
  token: string,
  input: CreateBiomarkerReadingInput,
): Promise<ApiResult<BiomarkerReading>> {
  const body = createBiomarkerReadingSchema.parse(input);
  return apiFetch("/biomarkers/readings", token, biomarkerReadingSchema, {
    method: "POST",
    body,
  });
}

export async function updateBiomarkerReading(
  token: string,
  readingId: string,
  input: UpdateBiomarkerReadingInput,
): Promise<ApiResult<BiomarkerReading>> {
  const body = updateBiomarkerReadingSchema.parse(input);
  return apiFetch(
    `/biomarkers/readings/${encodeURIComponent(readingId)}`,
    token,
    biomarkerReadingSchema,
    { method: "PATCH", body },
  );
}

export async function deleteBiomarkerReading(
  token: string,
  readingId: string,
): Promise<ApiResult<BiomarkerReading>> {
  return apiFetch(
    `/biomarkers/readings/${encodeURIComponent(readingId)}`,
    token,
    biomarkerReadingSchema,
    { method: "DELETE" },
  );
}

export async function getSubscription(
  token: string,
): Promise<ApiResult<SubscriptionSummary>> {
  return apiFetch("/billing/subscription", token, subscriptionSummarySchema);
}

export async function getEntitlement(
  token: string,
): Promise<ApiResult<Entitlement>> {
  return apiFetch("/billing/entitlement", token, entitlementSchema);
}

export async function createBillingCheckoutSession(
  token: string,
): Promise<ApiResult<CreateCheckoutSessionResponse>> {
  return apiFetch("/billing/checkout-session", token, createCheckoutSessionResponseSchema, {
    method: "POST",
    body: {},
  });
}

export async function createBillingPortalSession(
  token: string,
): Promise<ApiResult<CreatePortalSessionResponse>> {
  return apiFetch("/billing/portal-session", token, createPortalSessionResponseSchema, {
    method: "POST",
    body: {},
  });
}

/** GET /body/analysis/latest — latest body-composition analysis for the authenticated user. */
export async function getBodyAnalysisLatest(
  token: string,
): Promise<ApiResult<BodyCompositionAnalysisResponse>> {
  return apiFetch("/body/analysis/latest", token, bodyCompositionAnalysisResponseSchema);
}

type ApiFetchOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
};

export function parseApiErrorBody(
  path: string,
  status: number,
  body: unknown,
): string {
  const fallback = `${path} returned ${status}`;
  const parts: string[] = [];

  const appendStrings = (values: unknown) => {
    if (!Array.isArray(values)) {
      return;
    }

    for (const value of values) {
      if (typeof value === "string" && value.trim()) {
        parts.push(value.trim());
      }
    }
  };

  const appendZodIssues = (issues: unknown) => {
    if (!Array.isArray(issues)) {
      return;
    }

    for (const issue of issues) {
      if (issue && typeof issue === "object" && "message" in issue) {
        const message = (issue as { message?: unknown }).message;
        if (typeof message === "string" && message.trim()) {
          parts.push(message.trim());
        }
      }
    }
  };

  const appendMessage = (value: unknown) => {
    if (typeof value === "string" && value.trim()) {
      parts.push(value.trim());
      return;
    }

    if (!value || typeof value !== "object") {
      return;
    }

    const record = value as Record<string, unknown>;

    if (typeof record.message === "string" && record.message.trim()) {
      parts.push(record.message.trim());
    }

    appendStrings(record.validationErrors);
    appendZodIssues(record.issues);
  };

  if (typeof body === "string" && body.trim()) {
    return body.trim();
  }

  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    appendMessage(record.message);

    if (Array.isArray(record.message)) {
      appendStrings(record.message);
    }

    appendStrings(record.validationErrors);
    appendZodIssues(record.issues);
  }

  if (parts.length > 0) {
    return [...new Set(parts)].join(" ");
  }

  return fallback;
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function resolveResponseRequestId(
  requestId: string,
  response: Response,
): string {
  const headerValue =
    typeof response.headers?.get === "function"
      ? response.headers.get(REQUEST_ID_HEADER)
      : null;

  return normalizeRequestId(headerValue) ?? requestId;
}

function buildApiErrorResult(message: string, requestId: string): ApiResult<never> {
  return { error: message, requestId };
}

async function apiFetch<TSchema extends z.ZodType>(
  path: string,
  token: string,
  schema: TSchema,
  options: ApiFetchOptions = {},
): Promise<ApiResult<z.infer<TSchema>>> {
  const { method = "GET", body } = options;
  const requestId = createRequestId();

  try {
    const response = await fetch(`${clientApiBaseUrl}${path}`, {
      cache: "no-store",
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        [REQUEST_ID_HEADER]: requestId,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    const responseRequestId = resolveResponseRequestId(requestId, response);

    if (!response.ok) {
      const errorBody = await readResponseBody(response);
      return buildApiErrorResult(
        parseApiErrorBody(path, response.status, errorBody),
        responseRequestId,
      );
    }

    const responseBody = await readResponseBody(response);
    return { data: schema.parse(responseBody), requestId: responseRequestId };
  } catch {
    return buildApiErrorResult(`${path} could not be loaded`, requestId);
  }
}

function isString(value: string | undefined): value is string {
  return typeof value === "string";
}
