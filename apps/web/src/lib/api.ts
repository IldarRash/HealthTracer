import {
  activeNutritionPlanResponseSchema,
  activeWorkoutPlanResponseSchema,
  aiMetricsContextSummarySchema,
  aiProposalSchema,
  chatMessageSchema,
  chatThreadSchema,
  chatTurnResponseSchema,
  completeWorkoutSessionSchema,
  connectDeviceSchema,
  deviceConnectionSchema,
  deviceConsentSchema,
  generateWeeklyProgressSummarySchema,
  grantDeviceConsentSchema,
  healthMetricAggregateSchema,
  healthMetricSnapshotSchema,
  goalSchema,
  generateRecipeRecommendationsResponseSchema,
  nutritionAdherenceResponseSchema,
  nutritionPlanRevisionSchema,
  proposalDecisionSchema,
  upsertNutritionAdherenceSchema,
  recipeListQuerySchema,
  recipeListResponseSchema,
  recipeSchema,
  syncHealthMetricsSchema,
  scheduleWorkoutSessionSchema,
  updateRecipeRecommendationStatusSchema,
  userRecipeRecommendationListResponseSchema,
  userRecipeRecommendationSchema,
  workoutPlanRevisionSchema,
  workoutSessionSchema,
  type ActiveNutritionPlanResponse,
  type ActiveWorkoutPlanResponse,
  type AiMetricsContextSummary,
  type AiProposal,
  type ChatMessage,
  type ChatThread,
  type ChatTurnResponse,
  type ConnectDeviceInput,
  type DeviceConnection,
  type DeviceConsent,
  type CompleteWorkoutSessionInput,
  type GenerateRecipeRecommendationsResponse,
  type GrantDeviceConsentInput,
  type Goal,
  type HealthMetricAggregate,
  type HealthMetricSnapshot,
  type ListHealthMetricAggregatesQuery,
  type ListHealthMetricSnapshotsQuery,
  type NutritionAdherenceResponse,
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
  type UpdateTodayFeedbackInput,
  type UpdateTodayItemStatusInput,
  type WeeklyProgressSummaryResponse,
  type WorkoutPlanRevision,
  type WorkoutSession,
  createHealthDocumentSchema,
  documentSearchResponseSchema,
  healthDocumentDetailSchema,
  healthDocumentListResponseSchema,
  healthDocumentSchema,
  healthDocumentSummarySchema,
  todayDayResponseSchema,
  todayHistoryResponseSchema,
  updateDocumentConsentSchema,
  updateDocumentSummaryReviewSchema,
  updateTodayFeedbackSchema,
  updateTodayItemStatusSchema,
  userProfileSchema,
  userSchema,
  weeklyProgressSummaryResponseSchema,
  type CreateHealthDocumentInput,
  type DocumentSearchResponse,
  type HealthDocument,
  type HealthDocumentDetail,
  type HealthDocumentSummary,
  type UpdateDocumentConsentInput,
  type UpdateDocumentSummaryReviewInput,
} from "@health/types";
import { z } from "zod";
import { webEnv } from "../env";

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
};

export const apiQueryKeys = {
  currentUser: ["current-user"],
  profile: ["profile"],
  goals: ["goals"],
  dashboardState: ["dashboard-state"],
  proposals: ["proposals"],
  workoutActive: ["workout-active"],
  workoutRevisions: ["workout-revisions"],
  nutritionActive: ["nutrition-active"],
  nutritionRevisions: ["nutrition-revisions"],
  nutritionAdherenceToday: ["nutrition-adherence-today"],
  nutritionAdherence: (date: string) => ["nutrition-adherence", date] as const,
  nutritionAdherencePrefix: ["nutrition-adherence"] as const,
  todayDay: (date: string) => ["today-day", date] as const,
  todayHistory: (limit = 7) => ["today-history", limit] as const,
  todayDayPrefix: ["today-day"] as const,
  todayHistoryPrefix: ["today-history"] as const,
  progressWeeklyLatest: ["progress-weekly-latest"],
  progressWeeklyCurrent: ["progress-weekly-current"],
  recipesCatalog: ["recipes-catalog"],
  recipeRecommendations: ["recipe-recommendations"],
  deviceConnections: ["device-connections"],
  healthMetricSnapshots: ["health-metric-snapshots"],
  healthMetricAggregates: ["health-metric-aggregates"],
  healthMetricsAiPreview: ["health-metrics-ai-preview"],
  documents: ["documents"] as const,
  documentDetail: (documentId: string) => ["document-detail", documentId] as const,
  documentSearch: (query: string) => ["document-search", query] as const,
} as const;

const syncHealthMetricsResultSchema = z.object({
  inserted: healthMetricSnapshotSchema.array(),
  skipped: z.number().int().nonnegative(),
  aggregatesRefreshed: z.number().int().nonnegative(),
});

export type SyncHealthMetricsResult = z.infer<typeof syncHealthMetricsResultSchema>;

const chatThreadDetailSchema = z.object({
  thread: chatThreadSchema,
  messages: z.array(chatMessageSchema),
});

export async function getCurrentUser(token: string): Promise<ApiResult<User>> {
  return apiFetch("/users/me", token, userSchema);
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

export async function sendChatMessage(
  token: string,
  threadId: string,
  content: string,
): Promise<ApiResult<ChatTurnResponse>> {
  return apiFetch(`/chat/threads/${threadId}/messages`, token, chatTurnResponseSchema, {
    method: "POST",
    body: { content },
  });
}

export async function listProposals(
  token: string,
  threadId?: string,
): Promise<ApiResult<AiProposal[]>> {
  const query = threadId ? `?threadId=${encodeURIComponent(threadId)}` : "";
  return apiFetch(`/proposals${query}`, token, aiProposalSchema.array());
}

export async function getProposal(
  token: string,
  proposalId: string,
): Promise<ApiResult<AiProposal>> {
  return apiFetch(`/proposals/${proposalId}`, token, aiProposalSchema);
}

export async function decideProposal(
  token: string,
  proposalId: string,
  decision: "accept" | "reject",
): Promise<ApiResult<AiProposal>> {
  const body = proposalDecisionSchema.parse({ decision });
  return apiFetch(`/proposals/${proposalId}/decision`, token, aiProposalSchema, {
    method: "POST",
    body,
  });
}

export function getAcceptedProposalRefreshQueryKeys(
  proposal: AiProposal,
): ReadonlyArray<readonly unknown[]> {
  if (proposal.status !== "accepted") {
    return [];
  }

  const commonKeys = [apiQueryKeys.dashboardState, apiQueryKeys.proposals];

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
      ];
    case "nutrition":
      return [
        ...commonKeys,
        apiQueryKeys.nutritionActive,
        apiQueryKeys.nutritionRevisions,
        apiQueryKeys.nutritionAdherenceToday,
        apiQueryKeys.nutritionAdherencePrefix,
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
      ];
    case "general":
      return commonKeys;
  }
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

export async function getActiveNutritionPlan(
  token: string,
): Promise<ApiResult<ActiveNutritionPlanResponse>> {
  return apiFetch("/nutrition/active", token, activeNutritionPlanResponseSchema);
}

export async function listNutritionRevisions(
  token: string,
): Promise<ApiResult<NutritionPlanRevision[]>> {
  return apiFetch("/nutrition/revisions", token, nutritionPlanRevisionSchema.array());
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

  if (parsed.minEstimatedCalories != null) {
    params.set("minEstimatedCalories", String(parsed.minEstimatedCalories));
  }

  if (parsed.maxEstimatedCalories != null) {
    params.set("maxEstimatedCalories", String(parsed.maxEstimatedCalories));
  }

  if (parsed.minProteinGrams != null) {
    params.set("minProteinGrams", String(parsed.minProteinGrams));
  }

  if (parsed.maxProteinGrams != null) {
    params.set("maxProteinGrams", String(parsed.maxProteinGrams));
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

export async function getNutritionAdherenceForDate(
  token: string,
  date: string,
): Promise<ApiResult<NutritionAdherenceResponse>> {
  return apiFetch(
    `/nutrition/adherence/${encodeURIComponent(date)}`,
    token,
    nutritionAdherenceResponseSchema,
  );
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

export async function listDocuments(token: string): Promise<ApiResult<HealthDocument[]>> {
  const result = await apiFetch("/documents", token, healthDocumentListResponseSchema);
  if (result.error) {
    return { error: result.error };
  }

  return { data: result.data?.documents ?? [] };
}

export async function getDocument(
  token: string,
  documentId: string,
): Promise<ApiResult<HealthDocumentDetail>> {
  return apiFetch(`/documents/${encodeURIComponent(documentId)}`, token, healthDocumentDetailSchema);
}

export async function createDocument(
  token: string,
  input: CreateHealthDocumentInput,
): Promise<ApiResult<HealthDocumentDetail>> {
  const body = createHealthDocumentSchema.parse(input);
  return apiFetch("/documents", token, healthDocumentDetailSchema, {
    method: "POST",
    body,
  });
}

export async function parseDocument(
  token: string,
  documentId: string,
): Promise<ApiResult<HealthDocumentDetail>> {
  return apiFetch(
    `/documents/${encodeURIComponent(documentId)}/parse`,
    token,
    healthDocumentDetailSchema,
    { method: "POST" },
  );
}

export async function updateDocumentConsent(
  token: string,
  documentId: string,
  input: UpdateDocumentConsentInput,
): Promise<ApiResult<HealthDocument>> {
  const body = updateDocumentConsentSchema.parse(input);
  return apiFetch(
    `/documents/${encodeURIComponent(documentId)}/consent`,
    token,
    healthDocumentSchema,
    { method: "PATCH", body },
  );
}

export async function reviewDocumentSummary(
  token: string,
  documentId: string,
  input: UpdateDocumentSummaryReviewInput,
): Promise<ApiResult<HealthDocumentSummary>> {
  const body = updateDocumentSummaryReviewSchema.parse(input);
  return apiFetch(
    `/documents/${encodeURIComponent(documentId)}/summary/review`,
    token,
    healthDocumentSummarySchema,
    { method: "PATCH", body },
  );
}

export async function searchDocuments(
  token: string,
  query: string,
  limit = 20,
): Promise<ApiResult<DocumentSearchResponse>> {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
  });
  return apiFetch(`/documents/search?${params.toString()}`, token, documentSearchResponseSchema);
}

export async function deleteDocument(
  token: string,
  documentId: string,
): Promise<ApiResult<HealthDocument>> {
  return apiFetch(
    `/documents/${encodeURIComponent(documentId)}`,
    token,
    healthDocumentSchema,
    { method: "DELETE" },
  );
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

async function apiFetch<TSchema extends z.ZodType>(
  path: string,
  token: string,
  schema: TSchema,
  options: ApiFetchOptions = {},
): Promise<ApiResult<z.infer<TSchema>>> {
  const { method = "GET", body } = options;

  try {
    const response = await fetch(`${webEnv.NEXT_PUBLIC_API_BASE_URL}${path}`, {
      cache: "no-store",
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      const errorBody = await readResponseBody(response);
      return { error: parseApiErrorBody(path, response.status, errorBody) };
    }

    const responseBody = await readResponseBody(response);
    return { data: schema.parse(responseBody) };
  } catch {
    return { error: `${path} could not be loaded` };
  }
}

function isString(value: string | undefined): value is string {
  return typeof value === "string";
}
