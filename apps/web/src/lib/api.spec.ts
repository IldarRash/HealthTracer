import { describe, expect, it, vi, afterEach } from "vitest";
import { aiProposalSchema, type AiProposal, type UpdateRecipeRecommendationStatusInput } from "@health/types";
import {
  completeWorkoutSession,
  completeOnboarding,
  decideProposal,
  sendChatMessage,
  apiQueryKeys,
  getAcceptedProposalRefreshQueryKeys,
  getProposalDecisionRefreshQueryKeys,
  getCurrentUserState,
  getHabitDependentRefreshQueryKeys,
  getHabitExecutionRefreshQueryKeys,
  getOnboardingRefreshQueryKeys,
  getActiveNutritionPlan,
  getActiveWorkoutPlan,
  getActiveHabitPlan,
  getDocumentsRefreshQueryKeys,
  getHabitAdherence,
  buildHabitAdherenceQueryString,
  buildWellbeingAggregatesQueryString,
  buildWellbeingHistoryQueryString,
  getInspectorState,
  generateWeeklyProgressSummary,
  postWeeklyReview,
  getCurrentWeeklyProgressSummary,
  getLatestWeeklyProgressSummary,
  getMetricsRefreshQueryKeys,
  getNutritionAdherenceRefreshQueryKeys,
  getProgressSummaryRefreshQueryKeys,
  getTodayNutritionAdherence,
  getTodayItemStatusRefreshQueryKeys,
  upsertNutritionAdherence,
  upsertTodayNutritionAdherence,
  getWorkoutExecutionRefreshQueryKeys,
  getWellbeingRefreshQueryKeys,
  getWellbeingAggregates,
  getWellbeingCheckIn,
  getWellbeingHistory,
  upsertWellbeingCheckIn,
  buildRecoveryContextQueryString,
  buildRecoveryWeeklyContextQueryString,
  getRecoveryContext,
  getRecoveryRefreshQueryKeys,
  getRecoveryWeeklyContext,
  upsertRecoveryCheckIn,
  getTodayDay,
  getTodayHistory,
  buildRecipeListQueryString,
  createDocument,
  deleteDocument,
  extractDocumentSignals,
  generateRecipeRecommendations,
  getDocument,
  grantDeviceConsent,
  listDocumentSignals,
  listDocuments,
  listDeviceConnections,
  listHealthMetricSnapshots,
  previewCorrelationInsights,
  previewHealthMetricsAiContext,
  parseDocument,
  reviewDocumentSignal,
  syncHealthMetrics,
  listRecipeRecommendations,
  listRecipes,
  listNutritionRevisions,
  listHabitRevisions,
  listWorkoutRevisions,
  parseApiErrorBody,
  getApiErrorMessage,
  reviewDocumentSummary,
  scheduleWorkoutSession,
  startTodayWorkout,
  searchDocuments,
  updateDocumentConsent,
  updateTodayFeedback,
  updateRecipeRecommendationStatus,
  updateTodayItemStatus,
  updateWorkoutSessionExercise,
} from "./api.js";

const token = "test-token";

const acceptedProposalFixtureIds = {
  id: "14a08176-64a7-4a2d-8a44-581807368394",
  userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
  threadId: "24b19287-75b8-4a3e-9c10-691908479405",
};

function createAcceptedProposal(
  intent: AiProposal["intent"],
  targetDomain: AiProposal["targetDomain"],
  proposedChanges: unknown,
): AiProposal {
  return aiProposalSchema.parse({
    ...acceptedProposalFixtureIds,
    sourceMessageId: null,
    intent,
    targetDomain,
    title: "Test proposal",
    reason: "Test reason for the proposal.",
    proposedChanges,
    status: "accepted",
    validationStatus: "valid",
    validationErrors: [],
    userDecisionAt: "2026-05-22T12:00:00.000Z",
    appliedReference: "ref:test",
    createdAt: "2026-05-22T12:00:00.000Z",
    updatedAt: "2026-05-22T12:00:00.000Z",
  });
}

const sampleNutritionProposalChanges = {
  title: "Balanced base",
  summary: "Consistent meals with moderate targets.",
  caloriesPerDay: 2200,
  proteinGrams: 140,
  carbsGrams: 220,
  fatGrams: 70,
  hydrationLiters: 2.5,
  mealStructure: [{ label: "Breakfast", timingHint: null }],
  preferences: [],
  restrictions: [],
  allergies: [],
  notes: [],
};

const sampleWorkoutProposalChanges = {
  title: "Strength base",
  summary: "Three-day split with compound lifts.",
  days: [{ day: "Day 1", focus: "Strength", exercises: ["Squat"] }],
};

const sampleAdaptWorkoutFromProgressChanges = {
  plan: sampleWorkoutProposalChanges,
  sourceTrendObservationIds: [],
};

const sampleRecipeRecommendationChanges = {
  recommendations: [
    {
      recipeId: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
      reason: "Matches your protein target.",
      fitSummary: "High-protein lunch option.",
    },
  ],
};

const sampleTodayChecklistChanges = {
  date: "2026-05-22",
  items: [{ label: "Drink water", kind: "hydration" as const }],
};

const sampleHabitProposalChanges = {
  habits: [
    {
      habitDefinitionId: "a1000001-0000-4000-8000-000000000001",
      title: "Morning hydration",
      category: "hydration" as const,
      status: "active" as const,
      schedule: { type: "daily" as const },
      target: { type: "boolean" as const },
      required: true,
      displayOrder: 0,
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("web api helpers", () => {
  it("aggregates inspector fetch errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);

        if (path.endsWith("/users/me")) {
          return new Response(JSON.stringify({ id: "not-a-valid-user" }), {
            status: 200,
          });
        }

        if (path.endsWith("/profile")) {
          return new Response("upstream failed", { status: 500 });
        }

        return new Response(JSON.stringify([]), { status: 200 });
      }),
    );

    const state = await getInspectorState(token);

    expect(state.user).toBeNull();
    expect(state.errors).toEqual(
      expect.arrayContaining(["/users/me could not be loaded", "upstream failed"]),
    );
  });

  it("sends chat messages with optional proposalRevision metadata", async () => {
    const threadId = "24b19287-75b8-4a3e-9c10-691908479405";
    const requestBodies: unknown[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const method = init?.method ?? "GET";

      if (method === "POST" && path.includes(`/chat/threads/${threadId}/messages`)) {
        requestBodies.push(JSON.parse(String(init?.body)));

        return new Response(
          JSON.stringify({
            thread: {
              id: threadId,
              userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
              title: "Coaching",
              createdAt: "2026-05-22T12:00:00.000Z",
              updatedAt: "2026-05-22T12:00:00.000Z",
            },
            userMessage: {
              id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              threadId,
              role: "user",
              content:
                'Please revise the proposal "Adjust hydration" with these changes: keep weekdays only.',
              metadata: {},
              createdAt: "2026-05-22T12:00:00.000Z",
            },
            assistantMessage: {
              id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              threadId,
              role: "assistant",
              content: "I'll draft a revised hydration suggestion.",
              metadata: {},
              createdAt: "2026-05-22T12:00:01.000Z",
            },
            proposals: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendChatMessage(
      token,
      threadId,
      'Please revise the proposal "Adjust hydration" with these changes: keep weekdays only.',
      {
        proposalRevision: {
          supersededProposalId: "14a08176-64a7-4a2d-8a44-581807368394",
          modificationFeedback: "keep weekdays only",
          originalProposal: {
            intent: "adapt_habit_plan",
            targetDomain: "general",
            title: "Adjust hydration",
            reason: "Make the hydration target easier.",
            evidenceRefs: [],
            proposedChanges: sampleHabitProposalChanges,
          },
        },
      },
    );

    expect(result.error).toBeUndefined();
    expect(result.data?.assistantMessage.content).toContain("revised hydration");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestBodies[0]).toEqual({
      content:
        'Please revise the proposal "Adjust hydration" with these changes: keep weekdays only.',
      proposalRevision: {
        supersededProposalId: "14a08176-64a7-4a2d-8a44-581807368394",
        modificationFeedback: "keep weekdays only",
        originalProposal: {
          intent: "adapt_habit_plan",
          targetDomain: "general",
          title: "Adjust hydration",
          reason: "Make the hydration target easier.",
          evidenceRefs: [],
          proposedChanges: sampleHabitProposalChanges,
        },
      },
    });
  });

  it("omits proposalRevision from chat send body when not provided", async () => {
    const threadId = "24b19287-75b8-4a3e-9c10-691908479405";
    const requestBodies: unknown[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input);
        const method = init?.method ?? "GET";

        if (method === "POST" && path.includes(`/chat/threads/${threadId}/messages`)) {
          requestBodies.push(JSON.parse(String(init?.body)));

          return new Response(
            JSON.stringify({
              thread: {
                id: threadId,
                userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
                title: "Coaching",
                createdAt: "2026-05-22T12:00:00.000Z",
                updatedAt: "2026-05-22T12:00:00.000Z",
              },
              userMessage: {
                id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                threadId,
                role: "user",
                content: "Can you adapt my workout this week?",
                metadata: {},
                createdAt: "2026-05-22T12:00:00.000Z",
              },
              assistantMessage: {
                id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                threadId,
                role: "assistant",
                content: "Sure, let's review your plan.",
                metadata: {},
                createdAt: "2026-05-22T12:00:01.000Z",
              },
              proposals: [],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        return new Response("not found", { status: 404 });
      }),
    );

    const result = await sendChatMessage(token, threadId, "Can you adapt my workout this week?");

    expect(result.error).toBeUndefined();
    expect(requestBodies[0]).toEqual({
      content: "Can you adapt my workout this week?",
    });
    expect(requestBodies[0]).not.toHaveProperty("proposalRevision");
  });

  it("returns API errors for non-OK proposal decisions", async () => {
    const requestId = "11111111-1111-4111-8111-111111111111";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect((init?.headers as Record<string, string>)["x-request-id"]).toBeTruthy();

        return new Response("forbidden", {
          status: 403,
          headers: { "x-request-id": requestId },
        });
      }),
    );

    const result = await decideProposal(token, "14a08176-64a7-4a2d-8a44-581807368394", "reject");

    expect(result.data).toBeUndefined();
    expect(result.requestId).toBe(requestId);
    expect(result.error).toBe("forbidden");
    expect(getApiErrorMessage(result)).toBe(
      `forbidden (Request ID: ${requestId})`,
    );
  });

  it("preserves request id when fetch fails before a response is received", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    const result = await getActiveWorkoutPlan(token);

    expect(result.data).toBeUndefined();
    expect(result.error).toBe("/workouts/active could not be loaded");
    expect(result.requestId).toMatch(
      /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i,
    );
  });

  it("sends x-request-id on every API call", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const headers = init?.headers as Record<string, string>;
        expect(headers["x-request-id"]).toMatch(
          /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i,
        );

        return new Response(JSON.stringify({ plan: null, activeRevision: null, sessions: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    const result = await getActiveWorkoutPlan(token);

    expect(result.error).toBeUndefined();
    expect(result.requestId).toMatch(
      /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i,
    );
  });

  it("surfaces Nest validation errors from JSON error bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            statusCode: 400,
            message: {
              message: "Proposal failed validation and cannot be applied.",
              validationErrors: ["Goal target must be positive."],
            },
            error: "Bad Request",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await decideProposal(token, "14a08176-64a7-4a2d-8a44-581807368394", "accept");

    expect(result.data).toBeUndefined();
    expect(result.error).toBe(
      "Proposal failed validation and cannot be applied. Goal target must be positive.",
    );
  });

  it("parses string, array, and zod issue Nest error bodies", () => {
    expect(parseApiErrorBody("/goals", 400, { message: "Only pending proposals can be decided." })).toBe(
      "Only pending proposals can be decided.",
    );

    expect(
      parseApiErrorBody("/profile", 400, {
        message: ["Title is required.", "Title is required."],
      }),
    ).toBe("Title is required.");

    expect(
      parseApiErrorBody("/chat/threads", 400, {
        message: "Invalid request body",
        issues: [{ message: "Required" }, { message: "Expected string" }],
      }),
    ).toBe("Invalid request body Required Expected string");
  });

  it("rejects invalid proposal decisions before calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      decideProposal(token, "14a08176-64a7-4a2d-8a44-581807368394", "maybe" as "accept"),
    ).rejects.toThrow();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parses active workout plan responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            plan: null,
            activeRevision: null,
            sessions: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await getActiveWorkoutPlan(token);

    expect(result.error).toBeUndefined();
    expect(result.data).toEqual({
      plan: null,
      activeRevision: null,
      sessions: [],
    });
  });

  it("parses active nutrition plan responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            plan: null,
            activeRevision: null,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await getActiveNutritionPlan(token);

    expect(result.error).toBeUndefined();
    expect(result.data).toEqual({
      plan: null,
      activeRevision: null,
    });
  });

  it("parses active habit plan responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            plan: null,
            activeRevision: null,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await getActiveHabitPlan(token);

    expect(result.error).toBeUndefined();
    expect(result.data).toEqual({
      plan: null,
      activeRevision: null,
    });
  });

  it("rejects invalid workout completion payloads before calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      completeWorkoutSession(token, "78d40655-b4b5-47b3-b28e-470192e05f04", {
        status: "planned" as "completed" | "skipped",
        feedback: {},
      }),
    ).rejects.toThrow();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parses workout revision history responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify([
            {
              id: "880099c6-3b5f-4383-8246-97b72bf61818",
              workoutPlanId: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
              revisionNumber: 1,
              reason: "Initial plan",
              source: "ai_proposal",
              payload: {
                title: "Strength base",
                summary: "Three repeatable training days.",
                days: [{ day: "Day 1", focus: "Strength", exercises: [] }],
                notes: [],
              },
              createdAt: "2026-05-22T12:00:00.000Z",
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await listWorkoutRevisions(token);

    expect(result.error).toBeUndefined();
    expect(result.data).toHaveLength(1);
    expect(result.data?.[0]?.revisionNumber).toBe(1);
  });

  it("parses nutrition revision history responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify([
            {
              id: "880099c6-3b5f-4383-8246-97b72bf61818",
              nutritionPlanId: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
              revisionNumber: 1,
              reason: "Initial plan",
              source: "ai_proposal",
              payload: {
                title: "Balanced base",
                summary: "Moderate targets for consistent meals.",
                caloriesPerDay: 2200,
                proteinGrams: 140,
                carbsGrams: 220,
                fatGrams: 70,
                hydrationLiters: 2.5,
                mealStructure: [{ label: "Breakfast", timingHint: null }],
                preferences: ["Higher protein"],
                restrictions: [],
                allergies: [],
                notes: [],
              },
              createdAt: "2026-05-22T12:00:00.000Z",
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await listNutritionRevisions(token);

    expect(result.error).toBeUndefined();
    expect(result.data).toHaveLength(1);
    expect(result.data?.[0]?.revisionNumber).toBe(1);
    expect(result.data?.[0]?.payload.mealStructure).toHaveLength(1);
  });

  it("parses habit revision history responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            revisions: [
              {
                id: "880099c6-3b5f-4383-8246-97b72bf61818",
                habitPlanId: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
                revisionNumber: 1,
                reason: "Initial plan",
                source: "ai_proposal",
                payload: {
                  habits: [
                    {
                      habitDefinitionId: "a1000001-0000-4000-8000-000000000001",
                      title: "Morning hydration",
                      category: "hydration",
                      status: "active",
                      schedule: { type: "daily" },
                      target: { type: "boolean" },
                      required: true,
                      displayOrder: 0,
                    },
                  ],
                },
                createdAt: "2026-05-22T12:00:00.000Z",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await listHabitRevisions(token);

    expect(result.error).toBeUndefined();
    expect(result.data).toHaveLength(1);
    expect(result.data?.[0]?.revisionNumber).toBe(1);
    expect(result.data?.[0]?.payload.habits).toHaveLength(1);
  });

  it("builds habit adherence query strings", () => {
    expect(buildHabitAdherenceQueryString(7)).toBe("?window=7");
    expect(buildHabitAdherenceQueryString(30)).toBe("?window=30");
    expect(() => buildHabitAdherenceQueryString(14 as 7)).toThrow();
  });

  it("parses habit adherence responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toContain("/habits/adherence?window=7");

        return new Response(
          JSON.stringify({
            plan: {
              window: 7,
              windowStart: "2026-05-18",
              windowEnd: "2026-05-24",
              scheduled: 7,
              completed: 5,
              skipped: 1,
              missed: 1,
              requiredCompletionRate: 0.7143,
            },
            habits: [
              {
                habitDefinitionId: "a1000001-0000-4000-8000-000000000001",
                title: "Morning hydration",
                required: true,
                scheduled: 7,
                completed: 5,
                skipped: 1,
                missed: 1,
                completionRate: 0.7143,
                currentStreak: 3,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const result = await getHabitAdherence(token, 7);

    expect(result.error).toBeUndefined();
    expect(result.data?.plan.requiredCompletionRate).toBeCloseTo(0.7143);
    expect(result.data?.habits).toHaveLength(1);
    expect(result.data?.habits[0]?.currentStreak).toBe(3);
  });

  it("rejects invalid habit adherence payloads before returning data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            plan: {
              window: 7,
              windowStart: "2026-05-18",
              windowEnd: "2026-05-24",
              scheduled: 7,
              completed: 5,
              skipped: 1,
              missed: 1,
              requiredCompletionRate: 1.5,
            },
            habits: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await getHabitAdherence(token, 7);

    expect(result.data).toBeUndefined();
    expect(result.error).toBe("/habits/adherence?window=7 could not be loaded");
  });

  it("parses today nutrition adherence responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ adherence: null }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await getTodayNutritionAdherence(token);

    expect(result.error).toBeUndefined();
    expect(result.data).toEqual({ adherence: null });
  });

  it("upserts today nutrition adherence via the today endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toContain("/nutrition/adherence/today");
        expect(init?.method).toBe("PUT");
        expect(JSON.parse(String(init?.body))).toEqual({
          hydrationLitersConsumed: 2,
          notes: ["Updated"],
        });

        return new Response(
          JSON.stringify({
            adherence: {
              id: "880099c6-3b5f-4383-8246-97b72bf61818",
              userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
              date: "2026-05-23",
              hydrationLitersConsumed: 2,
              mealCompletion: [],
              targetCompletion: {
                caloriesOnTarget: null,
                proteinOnTarget: null,
                carbsOnTarget: null,
                fatOnTarget: null,
              },
              notes: ["Updated"],
              createdAt: "2026-05-22T12:00:00.000Z",
              updatedAt: "2026-05-22T13:00:00.000Z",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const result = await upsertTodayNutritionAdherence(token, {
      hydrationLitersConsumed: 2,
      notes: ["Updated"],
    });

    expect(result.error).toBeUndefined();
    expect(result.data?.adherence?.date).toBe("2026-05-23");
    expect(result.data?.adherence?.hydrationLitersConsumed).toBe(2);
    expect(result.data?.adherence?.notes).toEqual(["Updated"]);
  });

  it("upserts nutrition adherence for a date", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toContain("/nutrition/adherence/2026-05-22");
        expect(init?.method).toBe("PUT");
        expect(JSON.parse(String(init?.body))).toEqual({
          hydrationLitersConsumed: 2,
          notes: ["Updated"],
        });

        return new Response(
          JSON.stringify({
            adherence: {
              id: "880099c6-3b5f-4383-8246-97b72bf61818",
              userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
              date: "2026-05-22",
              hydrationLitersConsumed: 2,
              mealCompletion: [],
              targetCompletion: {
                caloriesOnTarget: null,
                proteinOnTarget: null,
                carbsOnTarget: null,
                fatOnTarget: null,
              },
              notes: ["Updated"],
              createdAt: "2026-05-22T12:00:00.000Z",
              updatedAt: "2026-05-22T13:00:00.000Z",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const result = await upsertNutritionAdherence(token, "2026-05-22", {
      hydrationLitersConsumed: 2,
      notes: ["Updated"],
    });

    expect(result.error).toBeUndefined();
    expect(result.data?.adherence?.hydrationLitersConsumed).toBe(2);
    expect(result.data?.adherence?.notes).toEqual(["Updated"]);
  });

  it("rejects invalid nutrition adherence payloads before calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      upsertTodayNutritionAdherence(token, {
        hydrationLitersConsumed: -1,
      }),
    ).rejects.toThrow();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects invalid date-based nutrition adherence payloads before calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      upsertNutritionAdherence(token, "2026-05-22", {
        hydrationLitersConsumed: -1,
      }),
    ).rejects.toThrow();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects invalid session scheduling payloads before calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      scheduleWorkoutSession(token, {
        workoutPlanRevisionId: "not-a-uuid",
        plannedDate: "2026-05-23",
        title: "Strength day",
        exercises: [],
      }),
    ).rejects.toThrow();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parses successful workout completion responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            id: "78d40655-b4b5-47b3-b28e-470192e05f04",
            userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
            workoutPlanId: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
            workoutPlanRevisionId: "880099c6-3b5f-4383-8246-97b72bf61818",
            plannedDate: "2026-05-23",
            title: "Strength day",
            status: "completed",
            exercises: ["Squat"],
            feedback: { notes: "Felt strong." },
            completedAt: "2026-05-23T12:00:00.000Z",
            createdAt: "2026-05-22T12:00:00.000Z",
            updatedAt: "2026-05-23T12:00:00.000Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await completeWorkoutSession(
      token,
      "78d40655-b4b5-47b3-b28e-470192e05f04",
      {
        status: "completed",
        feedback: { notes: "Felt strong." },
      },
    );

    expect(result.error).toBeUndefined();
    expect(result.data?.status).toBe("completed");
    expect(result.data?.feedback.notes).toBe("Felt strong.");
  });

  it("returns targeted refresh keys for accepted proposal domains", () => {
    const baseProposal = createAcceptedProposal(
      "adjust_nutrition_plan",
      "nutrition",
      sampleNutritionProposalChanges,
    );

    expect(getAcceptedProposalRefreshQueryKeys(baseProposal)).toEqual([
      apiQueryKeys.dashboardState,
      apiQueryKeys.longevityState,
      apiQueryKeys.proposals,
      apiQueryKeys.nutritionActive,
      apiQueryKeys.nutritionRevisions,
      apiQueryKeys.nutritionAdherenceToday,
      apiQueryKeys.nutritionAdherencePrefix,
      apiQueryKeys.todayDayPrefix,
      apiQueryKeys.todayHistoryPrefix,
    ]);
    expect(
      getAcceptedProposalRefreshQueryKeys(
        createAcceptedProposal("create_workout_plan", "workout", sampleWorkoutProposalChanges),
      ),
    ).toEqual([
      apiQueryKeys.dashboardState,
      apiQueryKeys.longevityState,
      apiQueryKeys.proposals,
      apiQueryKeys.workoutActive,
      apiQueryKeys.workoutRevisions,
      apiQueryKeys.progressWeeklyLatest,
      apiQueryKeys.progressWeeklyCurrent,
      apiQueryKeys.progressWeeklyReview,
      apiQueryKeys.todayDayPrefix,
      apiQueryKeys.todayHistoryPrefix,
    ]);
    expect(
      getAcceptedProposalRefreshQueryKeys(
        createAcceptedProposal(
          "adapt_workout_plan_from_progress",
          "workout",
          sampleAdaptWorkoutFromProgressChanges,
        ),
      ),
    ).toEqual([
      apiQueryKeys.dashboardState,
      apiQueryKeys.longevityState,
      apiQueryKeys.proposals,
      apiQueryKeys.workoutActive,
      apiQueryKeys.workoutRevisions,
      apiQueryKeys.progressWeeklyLatest,
      apiQueryKeys.progressWeeklyCurrent,
      apiQueryKeys.progressWeeklyReview,
      apiQueryKeys.todayDayPrefix,
      apiQueryKeys.todayHistoryPrefix,
    ]);
    expect(
      getAcceptedProposalRefreshQueryKeys(
        createAcceptedProposal("summarize_progress", "general", {}),
      ),
    ).toEqual([
      apiQueryKeys.dashboardState,
      apiQueryKeys.longevityState,
      apiQueryKeys.proposals,
      apiQueryKeys.progressWeeklyLatest,
      apiQueryKeys.progressWeeklyCurrent,
      apiQueryKeys.progressWeeklyReview,
    ]);
    expect(
      getAcceptedProposalRefreshQueryKeys(
        createAcceptedProposal("create_goal", "goal", {
          type: "fat_loss",
          title: "Lose 5 kg",
        }),
      ),
    ).toEqual([
      apiQueryKeys.dashboardState,
      apiQueryKeys.longevityState,
      apiQueryKeys.proposals,
      apiQueryKeys.goals,
    ]);
    expect(
      getAcceptedProposalRefreshQueryKeys(
        createAcceptedProposal("update_profile", "profile", {}),
      ),
    ).toEqual([
      apiQueryKeys.dashboardState,
      apiQueryKeys.longevityState,
      apiQueryKeys.proposals,
      apiQueryKeys.profile,
    ]);
    expect(
      getAcceptedProposalRefreshQueryKeys(
        createAcceptedProposal(
          "recommend_recipes",
          "recipe",
          sampleRecipeRecommendationChanges,
        ),
      ),
    ).toEqual([
      apiQueryKeys.dashboardState,
      apiQueryKeys.longevityState,
      apiQueryKeys.proposals,
      apiQueryKeys.recipeRecommendations,
      apiQueryKeys.recipesCatalog,
    ]);
    expect(
      getAcceptedProposalRefreshQueryKeys(
        createAcceptedProposal("create_today_checklist", "today", sampleTodayChecklistChanges),
      ),
    ).toEqual([
      apiQueryKeys.dashboardState,
      apiQueryKeys.longevityState,
      apiQueryKeys.proposals,
      apiQueryKeys.todayDayPrefix,
      apiQueryKeys.todayHistoryPrefix,
    ]);
    expect(
      getAcceptedProposalRefreshQueryKeys(
        createAcceptedProposal("create_habit_plan", "general", sampleHabitProposalChanges),
      ),
    ).toEqual([
      apiQueryKeys.dashboardState,
      apiQueryKeys.longevityState,
      apiQueryKeys.proposals,
      apiQueryKeys.habitActive,
      apiQueryKeys.habitRevisions,
      apiQueryKeys.habitAdherencePrefix,
      apiQueryKeys.todayDayPrefix,
      apiQueryKeys.todayHistoryPrefix,
    ]);
    expect(
      getAcceptedProposalRefreshQueryKeys(
        createAcceptedProposal("adapt_habit_plan", "general", sampleHabitProposalChanges),
      ),
    ).toEqual([
      apiQueryKeys.dashboardState,
      apiQueryKeys.longevityState,
      apiQueryKeys.proposals,
      apiQueryKeys.habitActive,
      apiQueryKeys.habitRevisions,
      apiQueryKeys.habitAdherencePrefix,
      apiQueryKeys.todayDayPrefix,
      apiQueryKeys.todayHistoryPrefix,
    ]);
    expect(
      getAcceptedProposalRefreshQueryKeys({
        ...baseProposal,
        status: "rejected",
      }),
    ).toEqual([]);
  });

  it("returns habit refresh keys for habit intents regardless of targetDomain", () => {
    const expectedHabitKeys = [
      apiQueryKeys.dashboardState,
      apiQueryKeys.longevityState,
      apiQueryKeys.proposals,
      apiQueryKeys.habitActive,
      apiQueryKeys.habitRevisions,
      apiQueryKeys.habitAdherencePrefix,
      apiQueryKeys.todayDayPrefix,
      apiQueryKeys.todayHistoryPrefix,
    ];

    for (const targetDomain of ["today", "workout", "nutrition"] as const) {
      expect(
        getAcceptedProposalRefreshQueryKeys(
          createAcceptedProposal("create_habit_plan", targetDomain, sampleHabitProposalChanges),
        ),
      ).toEqual(expectedHabitKeys);
      expect(
        getAcceptedProposalRefreshQueryKeys(
          createAcceptedProposal("adapt_habit_plan", targetDomain, sampleHabitProposalChanges),
        ),
      ).toEqual(expectedHabitKeys);
    }
  });

  it("preserves targetDomain refresh keys for non-habit intents", () => {
    expect(
      getAcceptedProposalRefreshQueryKeys(
        createAcceptedProposal("create_today_checklist", "today", sampleTodayChecklistChanges),
      ),
    ).toEqual([
      apiQueryKeys.dashboardState,
      apiQueryKeys.longevityState,
      apiQueryKeys.proposals,
      apiQueryKeys.todayDayPrefix,
      apiQueryKeys.todayHistoryPrefix,
    ]);
    expect(
      getAcceptedProposalRefreshQueryKeys({
        ...createAcceptedProposal("summarize_progress", "general", {}),
        status: "rejected",
      }),
    ).toEqual([]);
  });

  it("returns shared habit-dependent refresh keys", () => {
    expect(getHabitDependentRefreshQueryKeys()).toEqual([
      apiQueryKeys.habitActive,
      apiQueryKeys.habitRevisions,
      apiQueryKeys.habitAdherencePrefix,
      apiQueryKeys.todayDayPrefix,
      apiQueryKeys.todayHistoryPrefix,
    ]);

    expect(getHabitExecutionRefreshQueryKeys()).toEqual([
      ...getHabitDependentRefreshQueryKeys(),
      apiQueryKeys.longevityState,
      apiQueryKeys.dashboardState,
    ]);

    expect(getTodayItemStatusRefreshQueryKeys()).toEqual(getWorkoutExecutionRefreshQueryKeys());
    expect(getTodayItemStatusRefreshQueryKeys()).toEqual(
      expect.arrayContaining([
        apiQueryKeys.todayDayPrefix,
        apiQueryKeys.todayHistoryPrefix,
        apiQueryKeys.habitAdherencePrefix,
        apiQueryKeys.longevityState,
      ]),
    );
  });

  it("parses today day and history responses", async () => {
    const dayPayload = {
      id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
      date: "2026-05-22",
      items: [
        {
          id: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
          label: "Strength session",
          kind: "workout",
          status: "pending",
          required: true,
          source: { type: "workout_session", id: "78d40655-b4b5-47b3-b28e-470192e05f04" },
        },
      ],
      source: "generated",
      feedback: null,
      adherence: {
        score: 0,
        completedRequired: 0,
        totalRequired: 1,
        completedOptional: 0,
        skippedRequired: 0,
        skippedOptional: 0,
      },
      createdAt: "2026-05-22T08:00:00.000Z",
      updatedAt: "2026-05-22T08:00:00.000Z",
      workout: null,
      nutrition: null,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);

        if (path.includes("/today/history")) {
          return new Response(
            JSON.stringify({
              entries: [
                {
                  date: "2026-05-22",
                  adherence: dayPayload.adherence,
                  itemCount: 1,
                  hasFeedback: false,
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        return new Response(JSON.stringify(dayPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    const dayResult = await getTodayDay(token, "2026-05-22");
    expect(dayResult.error).toBeUndefined();
    expect(dayResult.data?.items).toHaveLength(1);
    expect(dayResult.data?.nutrition).toBeNull();

    const historyResult = await getTodayHistory(token, 14);
    expect(historyResult.error).toBeUndefined();
    expect(historyResult.data?.entries).toHaveLength(1);
    expect(String(vi.mocked(fetch).mock.calls[1]?.[0])).toContain("limit=14");
  });

  it("parses selected-date today nutrition detail without dropping workout or checklist fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toContain("/today/2026-05-23");

        return new Response(
          JSON.stringify({
            id: "a1b2c3d4-e5f6-4890-abcd-ef1234567890",
            userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
            date: "2026-05-23",
            items: [
              {
                id: "b2c3d4e5-f6a7-4901-bcde-f12345678901",
                label: "Recovery walk",
                kind: "recovery",
                status: "pending",
                required: false,
                source: { type: "weekly_focus", id: "33333333-3333-4333-8333-333333333333" },
              },
            ],
            source: "generated",
            feedback: { notes: "Easy day", energy: 6 },
            adherence: {
              score: null,
              completedRequired: 0,
              totalRequired: 0,
              completedOptional: 0,
              skippedRequired: 0,
              skippedOptional: 0,
            },
            createdAt: "2026-05-23T08:00:00.000Z",
            updatedAt: "2026-05-23T08:00:00.000Z",
            workout: {
              sessionId: "78d40655-b4b5-47b3-b28e-470192e05f04",
              workoutPlanId: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
              workoutPlanRevisionId: "880099c6-3b5f-4383-8246-97b72bf61818",
              plannedDate: "2026-05-23",
              weekday: "saturday",
              title: "Zone 2 run",
              focus: "Aerobic base",
              status: "planned",
              exercises: [],
              isRestDay: false,
            },
            nutrition: {
              date: "2026-05-23",
              plan: {
                id: "33333333-3333-4333-8333-333333333333",
                userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
                activeRevisionId: "44444444-4444-4444-8444-444444444444",
                status: "active",
                createdAt: "2026-05-22T08:00:00.000Z",
                updatedAt: "2026-05-22T08:00:00.000Z",
              },
              activeRevision: {
                id: "44444444-4444-4444-8444-444444444444",
                nutritionPlanId: "33333333-3333-4333-8333-333333333333",
                revisionNumber: 1,
                reason: "Initial plan",
                source: "ai_proposal",
                payload: {
                  title: "Balanced base",
                  summary: "Consistent meals.",
                  caloriesPerDay: 2200,
                  proteinGrams: 140,
                  carbsGrams: 220,
                  fatGrams: 70,
                  hydrationLiters: 2.5,
                  mealStructure: [{ label: "Breakfast", timingHint: "Morning" }],
                  preferences: [],
                  restrictions: [],
                  allergies: [],
                  notes: [],
                },
                createdAt: "2026-05-22T08:00:00.000Z",
              },
              adherence: {
                id: "66666666-6666-4666-8666-666666666666",
                userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
                date: "2026-05-23",
                hydrationLitersConsumed: 2,
                mealCompletion: [{ label: "Breakfast", completed: true }],
                targetCompletion: {
                  caloriesOnTarget: true,
                  proteinOnTarget: null,
                  carbsOnTarget: null,
                  fatOnTarget: null,
                },
                notes: ["Steady appetite"],
                createdAt: "2026-05-23T08:00:00.000Z",
                updatedAt: "2026-05-23T09:00:00.000Z",
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const result = await getTodayDay(token, "2026-05-23");

    expect(result.error).toBeUndefined();
    expect(result.data?.date).toBe("2026-05-23");
    expect(result.data?.items[0]?.kind).toBe("recovery");
    expect(result.data?.feedback?.energy).toBe(6);
    expect(result.data?.workout?.title).toBe("Zone 2 run");
    expect(result.data?.nutrition?.date).toBe("2026-05-23");
    expect(result.data?.nutrition?.adherence?.hydrationLitersConsumed).toBe(2);
  });

  it("rejects invalid today item status updates before calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      updateTodayItemStatus(token, "2026-05-22", "b2c3d4e5-f6a7-8901-bcde-f12345678901", {
        status: "pending" as "completed",
      }),
    ).rejects.toThrow();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects invalid today feedback before calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      updateTodayFeedback(token, "2026-05-22", {
        notes: "x".repeat(501),
      }),
    ).rejects.toThrow();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("updates today item status and feedback", async () => {
    const updatedDay = {
      id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
      date: "2026-05-22",
      items: [
        {
          id: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
          label: "Strength session",
          kind: "workout",
          status: "completed",
          required: true,
          source: { type: "workout_session" },
        },
      ],
      source: "generated",
      feedback: { notes: "Solid day", energy: 7, difficulty: 5 },
      adherence: {
        score: 1,
        completedRequired: 1,
        totalRequired: 1,
        completedOptional: 0,
        skippedRequired: 0,
        skippedOptional: 0,
      },
      createdAt: "2026-05-22T08:00:00.000Z",
      updatedAt: "2026-05-22T12:00:00.000Z",
      workout: null,
      nutrition: null,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input);
        const method = init?.method ?? "GET";

        if (method === "PATCH" && path.includes("/items/")) {
          return new Response(JSON.stringify(updatedDay), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (method === "PATCH" && path.endsWith("/feedback")) {
          return new Response(JSON.stringify(updatedDay), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response("not found", { status: 404 });
      }),
    );

    const statusResult = await updateTodayItemStatus(
      token,
      "2026-05-22",
      "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      { status: "completed" },
    );
    expect(statusResult.data?.items[0]?.status).toBe("completed");

    const feedbackResult = await updateTodayFeedback(token, "2026-05-22", {
      notes: "Solid day",
      energy: 7,
      difficulty: 5,
    });
    expect(feedbackResult.data?.feedback?.notes).toBe("Solid day");
  });

  it("parses weekly progress summary responses", async () => {
    const payload = {
      summary: {
        id: "14a08176-64a7-4a2d-8a44-581807368394",
        userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
        weekStart: "2026-05-18",
        weekEnd: "2026-05-24",
        generatedAt: "2026-05-22T12:00:00.000Z",
        dataStatus: "partial",
        sourceAggregates: {
          workout: {
            plannedCount: 3,
            completedCount: 2,
            skippedCount: 1,
            adherencePercent: 67,
            activeDays: 2,
            sessionIds: ["78d40655-b4b5-47b3-b28e-470192e05f04"],
            averageFatigue: 6,
          },
        },
        deferredDomains: [
          {
            domain: "nutrition",
            reason: "adherence_not_included",
            message: "Nutrition adherence is not included in this weekly summary yet.",
          },
        ],
        userMessage:
          "Based on the workout entries available, you completed 2 of 3 planned sessions this week.",
        supersededById: null,
        createdAt: "2026-05-22T12:00:00.000Z",
      },
      trends: [],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input);
        const method = init?.method ?? "GET";

        if (method === "POST" && path.endsWith("/progress/weekly/generate")) {
          return new Response(JSON.stringify(payload), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (path.endsWith("/progress/weekly/latest")) {
          return new Response(JSON.stringify(payload), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    const latest = await getLatestWeeklyProgressSummary(token);
    expect(latest.data?.summary.dataStatus).toBe("partial");

    const current = await getCurrentWeeklyProgressSummary(token);
    expect(current.data?.summary.weekStart).toBe("2026-05-18");

    const generated = await generateWeeklyProgressSummary(token, { refresh: true });
    expect(generated.data?.summary.userMessage).toContain("2 of 3");
  });

  it("posts weekly review packs with lane outcomes and candidate previews", async () => {
    const summaryPayload = {
      summary: {
        id: "14a08176-64a7-4a2d-8a44-581807368394",
        userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
        weekStart: "2026-05-18",
        weekEnd: "2026-05-24",
        generatedAt: "2026-05-22T12:00:00.000Z",
        dataStatus: "partial",
        sourceAggregates: {
          workout: {
            plannedCount: 3,
            completedCount: 2,
            skippedCount: 0,
            adherencePercent: 67,
            activeDays: 2,
            sessionIds: ["78d40655-b4b5-47b3-b28e-470192e05f04"],
            averageFatigue: null,
            exercisePlannedCount: 0,
            exerciseCompletedCount: 0,
            exerciseSkippedCount: 0,
            exerciseAdjustedCount: 0,
            exerciseCompletionPercent: null,
            partialSessionCount: 0,
          },
        },
        deferredDomains: [],
        userMessage: "Partial cross-domain weekly review.",
        supersededById: null,
        createdAt: "2026-05-22T12:00:00.000Z",
      },
      trends: [],
    };

    const reviewPayload = {
      summary: summaryPayload,
      laneOutcomes: [
        {
          lane: "workout",
          eligible: true,
          blockedReason: null,
          confidence: 0.8,
          explanationOnly: false,
        },
      ],
      packMeta: {
        selectedLanes: [],
        droppedLanes: [],
        adaptationMessage: "No safe adaptation was packaged for this weekly review.",
      },
      candidateProposals: [],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input);
        const method = init?.method ?? "GET";

        if (method === "POST" && path.endsWith("/progress/weekly/review")) {
          return new Response(JSON.stringify(reviewPayload), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ statusCode: 404, message: "not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    const review = await postWeeklyReview(token, { refresh: true });

    expect(review.data?.laneOutcomes).toHaveLength(1);
    expect(review.data?.packMeta.adaptationMessage).toContain("No safe adaptation");
  });

  it("returns progress refresh keys after rejected progress-linked proposals", () => {
    expect(
      getProposalDecisionRefreshQueryKeys({
        ...createAcceptedProposal(
          "adapt_workout_plan_from_progress",
          "workout",
          sampleAdaptWorkoutFromProgressChanges,
        ),
        status: "rejected",
      }),
    ).toEqual(
      expect.arrayContaining([
        apiQueryKeys.proposals,
        apiQueryKeys.progressWeeklyLatest,
        apiQueryKeys.progressWeeklyCurrent,
        apiQueryKeys.progressWeeklyReview,
        apiQueryKeys.longevityState,
      ]),
    );
  });

  it("returns API errors for missing weekly summaries", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ statusCode: 404, message: "Weekly progress summary not found." }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await getLatestWeeklyProgressSummary(token);

    expect(result.data).toBeUndefined();
    expect(result.error).toBe("Weekly progress summary not found.");
  });

  it("builds recipe list query strings from validated filters", () => {
    expect(buildRecipeListQueryString({ mealType: "lunch" })).toBe("?mealType=lunch");
    expect(
      buildRecipeListQueryString({
        tags: ["high-protein"],
        minProteinGrams: 20,
      }),
    ).toBe("?tags=high-protein&minProteinGrams=20");
  });

  it("parses recipe catalog and recommendation responses", async () => {
    const recipe = {
      id: "a1000001-0000-4000-8000-000000000001",
      name: "Greek yogurt bowl",
      description: "A quick breakfast with fruit and seeds.",
      ingredients: [{ name: "Greek yogurt", quantity: 1, unit: "cup" }],
      preparationSteps: ["Combine ingredients in a bowl."],
      servings: 1,
      macroEstimates: {
        estimatedCalories: 320,
        proteinGrams: 24,
        carbsGrams: 30,
        fatGrams: 10,
        fiberGrams: 4,
      },
      mealTypes: ["breakfast"],
      tags: ["high-protein"],
      restrictionTags: ["vegetarian"],
      allergenTags: ["dairy"],
      prepMinutes: 5,
      cookMinutes: null,
      source: "Curated catalog",
      status: "active",
      createdAt: "2026-05-22T12:00:00.000Z",
      updatedAt: "2026-05-22T12:00:00.000Z",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);

        if (path.includes("/recipes/recommendations/generate")) {
          return new Response(
            JSON.stringify({
              recommendations: [],
              relatedNutritionPlanRevisionId: null,
              limitedReason: "no_active_nutrition_plan",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        if (path.endsWith("/recipes/recommendations")) {
          return new Response(JSON.stringify({ recommendations: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ recipes: [recipe] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    const catalog = await listRecipes(token, { mealType: "breakfast" });
    expect(catalog.data?.recipes).toHaveLength(1);

    const recommendations = await listRecipeRecommendations(token);
    expect(recommendations.data?.recommendations).toEqual([]);

    const generated = await generateRecipeRecommendations(token);
    expect(generated.data?.limitedReason).toBe("no_active_nutrition_plan");
  });

  it("rejects invalid recommendation status updates before calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      updateRecipeRecommendationStatus(token, "a1000001-0000-4000-8000-000000000002", {
        status: "pending",
      } as unknown as UpdateRecipeRecommendationStatusInput),
    ).rejects.toThrow();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parses device connection list responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify([
            {
              id: "55555555-5555-4555-8555-555555555555",
              userId: "22222222-2222-4222-8222-222222222222",
              consentId: "33333333-3333-4333-8333-333333333333",
              provider: "wearable",
              platform: "web",
              status: "connected",
              grantedScopes: ["steps"],
              connectedAt: "2026-05-22T12:00:00.000Z",
              revokedAt: null,
              lastSyncAt: null,
              lastSyncCursor: null,
              createdAt: "2026-05-22T12:00:00.000Z",
              updatedAt: "2026-05-22T12:00:00.000Z",
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await listDeviceConnections(token);
    expect(result.error).toBeUndefined();
    expect(result.data?.[0]?.status).toBe("connected");
  });

  it("parses health metric sync results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            inserted: [],
            skipped: 2,
            aggregatesRefreshed: 1,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await syncHealthMetrics(token, {
      deviceConnectionId: "55555555-5555-4555-8555-555555555555",
      records: [
        {
          metricType: "steps",
          observedAt: "2026-05-22T12:00:00.000Z",
          unit: "count",
          normalizedPayload: {
            stepCount: 1000,
            intervalStart: "2026-05-22T12:00:00.000Z",
            intervalEnd: "2026-05-22T13:00:00.000Z",
          },
        },
      ],
    });

    expect(result.error).toBeUndefined();
    expect(result.data?.skipped).toBe(2);
    expect(result.data?.aggregatesRefreshed).toBe(1);
  });

  it("rejects consent grants without scopes before calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      grantDeviceConsent(token, {
        provider: "wearable",
        grantedScopes: [],
        allowAiContext: true,
        consentVersion: "v1",
      }),
    ).rejects.toThrow();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parses AI metrics context preview responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            items: [
              {
                metricType: "steps",
                label: "Daily steps",
                summary: "Average 8,200 steps over the last 7 days.",
                periodStart: "2026-05-15",
                periodEnd: "2026-05-21",
                freshness: "2026-05-22T12:00:00.000Z",
                sourceProvider: "wearable",
              },
            ],
            generatedAt: "2026-05-22T12:00:00.000Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await previewHealthMetricsAiContext(token);
    expect(result.error).toBeUndefined();
    expect(result.data?.items).toHaveLength(1);
  });

  it("parses health metric snapshot list responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const result = await listHealthMetricSnapshots(token, { limit: 10 });
    expect(result.error).toBeUndefined();
    expect(result.data).toEqual([]);
  });

  it("calls document API helpers across upload, parse, approve, search, revoke, and delete", async () => {
    const documentId = "3f98f3dd-806d-4386-8c5f-43499626c5d6";
    const summaryId = "14a08176-64a7-4a2d-8a44-581807368394";
    const now = "2026-05-22T12:00:00.000Z";
    const baseDocument = {
      id: documentId,
      userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
      documentType: "other",
      title: "Synthetic wellness note",
      storageReference: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81/doc.txt",
      mimeType: "text/plain",
      fileSizeBytes: 128,
      parseStatus: "uploaded",
      signalExtractionStatus: "not_started",
      signalExtractionFailureReason: null,
      signalExtractedAt: null,
      consentScopes: [
        "upload_storage",
        "parse_ocr",
        "ai_summarization",
        "semantic_indexing",
        "coach_chat_context",
      ],
      consentVersion: "v1",
      consentGrantedAt: now,
      parseFailureReason: null,
      revokedAt: null,
      deletedAt: null,
      uploadedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    const summary = {
      id: summaryId,
      healthDocumentId: documentId,
      userId: baseDocument.userId,
      summaryText: "Synthetic wellness summary for coaching context review.",
      extractedConstraints: ["Prefers low-impact cardio"],
      reviewStatus: "pending_review",
      reviewedAt: null,
      generatedAt: now,
      generatorVersion: "dev-v1",
      createdAt: now,
      updatedAt: now,
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const method = init?.method ?? "GET";

      if (method === "GET" && path.endsWith("/documents")) {
        return new Response(JSON.stringify({ documents: [baseDocument] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (method === "POST" && path.endsWith("/documents")) {
        return new Response(JSON.stringify({ ...baseDocument, summary: null }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (method === "GET" && path.endsWith(`/documents/${documentId}`)) {
        return new Response(JSON.stringify({ ...baseDocument, summary }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (method === "POST" && path.endsWith(`/documents/${documentId}/parse`)) {
        return new Response(
          JSON.stringify({ ...baseDocument, parseStatus: "summary_ready", summary }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (method === "PATCH" && path.endsWith(`/documents/${documentId}/summary/review`)) {
        return new Response(
          JSON.stringify({ ...summary, reviewStatus: "approved", reviewedAt: now }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (method === "GET" && path.includes("/documents/search?")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                documentId,
                summaryId,
                documentType: "other",
                title: baseDocument.title,
                summarySnippet: "Synthetic wellness summary for coaching context review.",
                extractedConstraints: ["Prefers low-impact cardio"],
                generatedAt: now,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (method === "PATCH" && path.endsWith(`/documents/${documentId}/consent`)) {
        return new Response(
          JSON.stringify({
            ...baseDocument,
            parseStatus: "revoked",
            revokedAt: now,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (method === "DELETE" && path.endsWith(`/documents/${documentId}`)) {
        return new Response(
          JSON.stringify({
            ...baseDocument,
            deletedAt: now,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    expect((await listDocuments(token)).data).toHaveLength(1);
    expect(
      (
        await createDocument(token, {
          documentType: "other",
          title: "Synthetic wellness note",
          consentScopes: ["upload_storage", "parse_ocr", "ai_summarization"],
          consentVersion: "v1",
          mimeType: "text/plain",
          sampleText: "Synthetic wellness note for test coverage only.",
        })
      ).data?.summary,
    ).toBeNull();
    expect((await getDocument(token, documentId)).data?.summary?.reviewStatus).toBe(
      "pending_review",
    );
    expect((await parseDocument(token, documentId)).data?.parseStatus).toBe("summary_ready");
    expect(
      (await reviewDocumentSummary(token, documentId, { reviewStatus: "approved" })).data
        ?.reviewStatus,
    ).toBe("approved");
    expect((await searchDocuments(token, "low-impact", 5)).data?.results).toHaveLength(1);
    expect((await updateDocumentConsent(token, documentId, { revoke: true })).data?.revokedAt).toBe(
      now,
    );
    expect((await deleteDocument(token, documentId)).data?.deletedAt).toBe(now);

    expect(String(fetchMock.mock.calls[5]?.[0])).toContain("/documents/search?q=low-impact&limit=5");
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      title: "Synthetic wellness note",
      sampleText: "Synthetic wellness note for test coverage only.",
    });
    expect(JSON.parse(String(fetchMock.mock.calls[6]?.[1]?.body))).toEqual({ revoke: true });
  });

  it("posts fileContentBase64 payloads for supported document uploads", async () => {
    const token = "test-token";
    const now = "2026-05-22T12:00:00.000Z";
    const documentId = "aa639495-cf87-4110-a1b0-b11900a01285";
    const fileContentBase64 = Buffer.from("%PDF-1.4 wellness sample", "utf8").toString("base64");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const method = init?.method ?? "GET";

      if (method === "POST" && path.endsWith("/documents")) {
        return new Response(
          JSON.stringify({
            id: documentId,
            userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
            documentType: "lab_report",
            title: "Lab PDF upload",
            storageReference: "local://documents/lab.pdf",
            mimeType: "application/pdf",
            fileSizeBytes: Buffer.from(fileContentBase64, "base64").byteLength,
            parseStatus: "uploaded",
            signalExtractionStatus: "not_started",
            signalExtractionFailureReason: null,
            signalExtractedAt: null,
            consentScopes: ["upload_storage", "parse_ocr"],
            consentVersion: "v1",
            consentGrantedAt: now,
            parseFailureReason: null,
            revokedAt: null,
            deletedAt: null,
            uploadedAt: now,
            createdAt: now,
            updatedAt: now,
            summary: null,
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createDocument(token, {
      documentType: "lab_report",
      title: "Lab PDF upload",
      consentScopes: ["upload_storage", "parse_ocr"],
      consentVersion: "v1",
      mimeType: "application/pdf",
      fileContentBase64,
    });

    expect(result.data?.mimeType).toBe("application/pdf");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      documentType: "lab_report",
      title: "Lab PDF upload",
      consentScopes: ["upload_storage", "parse_ocr"],
      consentVersion: "v1",
      mimeType: "application/pdf",
      fileContentBase64,
    });
  });

  it("calls document signal and correlation preview API helpers", async () => {
    const documentId = "3f98f3dd-806d-4386-8c5f-43499626c5d6";
    const signalId = "4a98f3dd-806d-4386-8c5f-43499626c5d7";
    const now = "2026-05-22T12:00:00.000Z";
    const signal = {
      id: signalId,
      userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
      healthDocumentId: documentId,
      signalKey: "vitamin_d",
      displayLabel: "Vitamin D",
      valueText: "28",
      unit: "ng/mL",
      referenceRangeText: "30-100 ng/mL",
      observedAt: "2026-05-01",
      sourceSection: "Lab results",
      confidenceScore: 0.85,
      reviewStatus: "pending_review",
      ignoredReason: null,
      extractedAt: now,
      reviewedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const signalListResponse = {
      documentId,
      extractionStatus: "ready",
      extractionFailureReason: null,
      extractedAt: now,
      signals: [signal],
      ignoredContentExplanation: null,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input);
        const method = init?.method ?? "GET";

        if (method === "GET" && path.endsWith(`/documents/${documentId}/signals`)) {
          return new Response(JSON.stringify(signalListResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (method === "POST" && path.endsWith(`/documents/${documentId}/extract-signals`)) {
          return new Response(JSON.stringify(signalListResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (
          method === "PATCH" &&
          path.endsWith(`/documents/${documentId}/signals/${signalId}/review`)
        ) {
          return new Response(
            JSON.stringify({ ...signal, reviewStatus: "approved", reviewedAt: now }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        if (method === "GET" && path.endsWith("/documents/correlations/preview")) {
          return new Response(
            JSON.stringify({
              insights: [
                {
                  id: "insight-abc",
                  headline: "Sleep and training completion may be linked",
                  summary:
                    "Recent sleep summaries and lower training completion appeared around the same period.",
                  coachingDomain: "recovery",
                  evidenceRefs: [
                    {
                      type: "health_metric_aggregate",
                      id: "sleep:2026-05-15:2026-05-21",
                      label: "Recent sleep summary",
                    },
                  ],
                  confidence: "medium",
                },
              ],
              generatedAt: now,
              dataStatus: "sufficient",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        return new Response("not found", { status: 404 });
      }),
    );

    expect((await listDocumentSignals(token, documentId)).data?.signals).toHaveLength(1);
    expect((await extractDocumentSignals(token, documentId)).data?.extractionStatus).toBe("ready");
    expect(
      (await reviewDocumentSignal(token, documentId, signalId, { reviewStatus: "approved" })).data
        ?.reviewStatus,
    ).toBe("approved");
    expect((await previewCorrelationInsights(token)).data?.insights).toHaveLength(1);
  });

  it("rejects invalid document signal reviews before calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      reviewDocumentSignal(
        token,
        "3f98f3dd-806d-4386-8c5f-43499626c5d6",
        "4a98f3dd-806d-4386-8c5f-43499626c5d7",
        { reviewStatus: "pending_review" as "approved" },
      ),
    ).rejects.toThrow();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed correlation preview responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            insights: [
              {
                id: "insight-missing-evidence",
                headline: "Sleep and training completion may be linked",
                summary: "Recent sleep summaries and lower training completion appeared together.",
                coachingDomain: "recovery",
                evidenceRefs: [],
                confidence: "medium",
              },
            ],
            generatedAt: "2026-05-22T12:00:00.000Z",
            dataStatus: "sufficient",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await previewCorrelationInsights(token);

    expect(result.data).toBeUndefined();
    expect(result.error).toBe("/documents/correlations/preview could not be loaded");
  });

  it("parses proposal evidence refs from API payloads", () => {
    const parsed = aiProposalSchema.parse({
      ...acceptedProposalFixtureIds,
      sourceMessageId: null,
      intent: "summarize_progress",
      targetDomain: "general",
      title: "Recovery-focused week",
      reason: "Training completion dipped alongside lower sleep summaries.",
      evidenceRefs: [
        {
          type: "document_signal",
          id: "4a98f3dd-806d-4386-8c5f-43499626c5d7",
          label: "Energy level from uploaded document",
        },
      ],
      proposedChanges: {},
      status: "pending",
      validationStatus: "valid",
      validationErrors: [],
      userDecisionAt: null,
      appliedReference: null,
      createdAt: "2026-05-22T12:00:00.000Z",
      updatedAt: "2026-05-22T12:00:00.000Z",
    });

    expect(parsed.evidenceRefs).toHaveLength(1);
  });

  it("surfaces document parse failures from API error bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ statusCode: 400, message: "Document processing failed." }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const result = await parseDocument(token, "3f98f3dd-806d-4386-8c5f-43499626c5d6");

    expect(result.data).toBeUndefined();
    expect(result.error).toBe("Document processing failed.");
  });

  it("starts today workouts and updates session exercises", async () => {
    const sessionId = "78d40655-b4b5-47b3-b28e-470192e05f04";
    const exerciseId = "11111111-1111-4111-8111-111111111111";

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input);
        const method = init?.method ?? "GET";

        if (method === "POST" && path.endsWith("/workouts/today/2026-05-23/start")) {
          return new Response(
            JSON.stringify({
              sessionId,
              workoutPlanId: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
              workoutPlanRevisionId: "880099c6-3b5f-4383-8246-97b72bf61818",
              plannedDate: "2026-05-23",
              weekday: "friday",
              title: "Strength day",
              focus: "Lower body",
              status: "planned",
              exercises: [
                {
                  id: exerciseId,
                  prescription: { snapshot: { name: "Back squat" }, sets: 4, reps: "5" },
                  execution: { status: "planned" },
                },
              ],
              isRestDay: false,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        if (
          method === "PATCH" &&
          path.endsWith(`/workouts/sessions/${sessionId}/exercises/${exerciseId}`)
        ) {
          return new Response(
            JSON.stringify({
              id: sessionId,
              userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
              workoutPlanId: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
              workoutPlanRevisionId: "880099c6-3b5f-4383-8246-97b72bf61818",
              plannedDate: "2026-05-23",
              title: "Strength day",
              status: "planned",
              exercises: [
                {
                  id: exerciseId,
                  prescription: { snapshot: { name: "Back squat" }, sets: 4, reps: "5" },
                  execution: { status: "completed" },
                },
              ],
              feedback: {},
              completedAt: null,
              createdAt: "2026-05-22T12:00:00.000Z",
              updatedAt: "2026-05-23T12:00:00.000Z",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        return new Response("not found", { status: 404 });
      }),
    );

    const started = await startTodayWorkout(token, "2026-05-23");
    expect(started.data?.sessionId).toBe(sessionId);

    const updated = await updateWorkoutSessionExercise(token, sessionId, exerciseId, {
      status: "completed",
    });
    expect(updated.data?.exercises[0]).toMatchObject({
      execution: { status: "completed" },
    });
  });

  it("rejects empty workout exercise update payloads before calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      updateWorkoutSessionExercise(
        token,
        "78d40655-b4b5-47b3-b28e-470192e05f04",
        "11111111-1111-4111-8111-111111111111",
        {},
      ),
    ).rejects.toThrow();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns workout execution refresh query keys", () => {
    expect(getWorkoutExecutionRefreshQueryKeys()).toEqual(
      expect.arrayContaining([
        apiQueryKeys.todayDayPrefix,
        apiQueryKeys.habitAdherencePrefix,
        apiQueryKeys.workoutActive,
        apiQueryKeys.progressWeeklyCurrent,
        apiQueryKeys.longevityState,
        apiQueryKeys.wellbeingCheckInPrefix,
        apiQueryKeys.wellbeingHistoryPrefix,
        apiQueryKeys.wellbeingAggregatesPrefix,
      ]),
    );
  });

  it("returns nutrition adherence refresh query keys with longevity state", () => {
    expect(getNutritionAdherenceRefreshQueryKeys()).toEqual(
      expect.arrayContaining([
        apiQueryKeys.nutritionAdherenceToday,
        apiQueryKeys.nutritionAdherencePrefix,
        apiQueryKeys.todayDayPrefix,
        apiQueryKeys.todayHistoryPrefix,
        apiQueryKeys.longevityState,
      ]),
    );
  });

  it("returns metrics refresh query keys with longevity state", () => {
    expect(getMetricsRefreshQueryKeys()).toEqual(
      expect.arrayContaining([
        apiQueryKeys.deviceConnections,
        apiQueryKeys.healthMetricSnapshots,
        apiQueryKeys.healthMetricAggregates,
        apiQueryKeys.healthMetricsAiPreview,
        apiQueryKeys.longevityState,
      ]),
    );
  });

  it("returns documents refresh query keys with longevity state", () => {
    expect(getDocumentsRefreshQueryKeys()).toEqual([
      apiQueryKeys.documents,
      apiQueryKeys.longevityState,
      apiQueryKeys.correlationPreview,
    ]);
  });

  it("returns progress summary refresh query keys with longevity state", () => {
    expect(getProgressSummaryRefreshQueryKeys()).toEqual([
      apiQueryKeys.dashboardState,
      apiQueryKeys.longevityState,
      apiQueryKeys.progressWeeklyReview,
    ]);
  });

  it("builds wellbeing query strings", () => {
    expect(buildWellbeingHistoryQueryString(7)).toBe("?limit=7");
    expect(buildWellbeingAggregatesQueryString(7)).toBe("?periodType=daily&limit=7");
  });

  it("returns wellbeing refresh query keys", () => {
    expect(getWellbeingRefreshQueryKeys()).toEqual(
      expect.arrayContaining([
        apiQueryKeys.wellbeingCheckInPrefix,
        apiQueryKeys.wellbeingHistoryPrefix,
        apiQueryKeys.wellbeingAggregatesPrefix,
        apiQueryKeys.longevityState,
      ]),
    );
  });

  it("loads and upserts wellbeing check-ins", async () => {
    const checkIn = {
      id: "11111111-1111-4111-8111-111111111111",
      userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
      date: "2026-05-25",
      moodScore: 3,
      stressScore: 4,
      tags: [],
      note: null,
      source: "user_entry",
      crisisFlagReasons: [],
      createdAt: "2026-05-25T12:00:00.000Z",
      updatedAt: "2026-05-25T12:00:00.000Z",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.includes("/wellbeing-check-ins/2026-05-25") && init?.method === "PUT") {
          return new Response(
            JSON.stringify({
              checkIn,
              crisisSupport: {
                shouldShowCrisisSupport: false,
                reasons: [],
                copy: null,
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        if (url.includes("/wellbeing-check-ins/2026-05-25")) {
          return new Response(JSON.stringify({ checkIn }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (url.includes("/wellbeing-check-ins/history")) {
          return new Response(JSON.stringify({ entries: [checkIn] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (url.includes("/wellbeing-check-ins/aggregates")) {
          return new Response(
            JSON.stringify({
              periodType: "daily",
              aggregates: [{ date: "2026-05-25", moodScore: 3, stressScore: 4 }],
              summary: {
                windowDays: 7,
                checkInCount: 1,
                moodAverage: 3,
                stressAverage: 4,
                moodTrendDirection: "unknown",
                stressTrendDirection: "unknown",
                currentStreak: 1,
                dataSufficiency: "partial",
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    const getResult = await getWellbeingCheckIn(token, "2026-05-25");
    expect(getResult.error).toBeUndefined();
    expect(getResult.data?.checkIn?.moodScore).toBe(3);

    const upsertResult = await upsertWellbeingCheckIn(token, "2026-05-25", {
      moodScore: 3,
      stressScore: 4,
      source: "user_entry",
    });
    expect(upsertResult.error).toBeUndefined();
    expect(upsertResult.data?.checkIn.date).toBe("2026-05-25");

    const historyResult = await getWellbeingHistory(token, 7);
    expect(historyResult.error).toBeUndefined();
    expect(historyResult.data?.entries).toHaveLength(1);

    const aggregatesResult = await getWellbeingAggregates(token, 7);
    expect(aggregatesResult.error).toBeUndefined();
    expect(aggregatesResult.data?.summary.checkInCount).toBe(1);
  });

  it("rejects invalid wellbeing upsert payloads before calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      upsertWellbeingCheckIn(token, "2026-05-25", {
        moodScore: 6,
        stressScore: 3,
      }),
    ).rejects.toThrow();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unknown wellbeing upsert fields before calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      upsertWellbeingCheckIn(token, "2026-05-25", {
        moodScore: 3,
        stressScore: 3,
        rawNoteForAi: "private text should never be accepted",
      } as never),
    ).rejects.toThrow();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("builds recovery context query strings", () => {
    expect(buildRecoveryContextQueryString("2026-05-25")).toBe("?date=2026-05-25");
    expect(buildRecoveryContextQueryString("2026-05-25?bad=true")).toBe(
      "?date=2026-05-25%3Fbad%3Dtrue",
    );
    expect(buildRecoveryWeeklyContextQueryString("2026-05-19")).toBe(
      "?weekStart=2026-05-19",
    );
  });

  it("returns recovery refresh query keys", () => {
    expect(getRecoveryRefreshQueryKeys()).toEqual(
      expect.arrayContaining([
        apiQueryKeys.recoveryContextPrefix,
        apiQueryKeys.longevityState,
        apiQueryKeys.todayDayPrefix,
      ]),
    );
  });

  it("loads and upserts recovery check-ins", async () => {
    const checkIn = {
      id: "11111111-1111-4111-8111-111111111111",
      userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
      date: "2026-05-25",
      soreness: 2,
      fatigue: 3,
      moodScore: 4,
      perceivedStress: null,
      source: "user_entry",
      createdAt: "2026-05-25T12:00:00.000Z",
      updatedAt: "2026-05-25T12:00:00.000Z",
    };
    const context = {
      id: "33333333-3333-4333-8333-333333333333",
      userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
      date: "2026-05-25",
      band: "moderate_load",
      payload: {
        band: "moderate_load",
        dataSufficiency: "partial",
        signals: [
          {
            source: "manual_check_in",
            label: "Soreness check-in",
            detail: "Low soreness",
          },
        ],
        focusMessage:
          "Based on what you logged, today may carry a moderate load. A balanced pace could help you stay consistent.",
      },
      calculatedAt: "2026-05-25T12:00:00.000Z",
      createdAt: "2026-05-25T12:00:00.000Z",
      updatedAt: "2026-05-25T12:00:00.000Z",
    };

    const requests: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requests.push({
          url,
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });

        if (url.includes("/recovery/check-in") && init?.method === "POST") {
          return new Response(JSON.stringify({ checkIn, context }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (url.includes("/recovery/context")) {
          return new Response(JSON.stringify({ checkIn, context }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    const getResult = await getRecoveryContext(token, "2026-05-25");
    expect(getResult.error).toBeUndefined();
    expect(getResult.data?.context.payload.band).toBe("moderate_load");
    expect(getResult.data?.checkIn?.soreness).toBe(2);
    expect(JSON.stringify(getResult.data?.context)).not.toMatch(/readiness score|recovery score/i);

    const upsertResult = await upsertRecoveryCheckIn(token, {
      soreness: 2,
      fatigue: 3,
      moodScore: 4,
      perceivedStress: null,
      date: "2026-05-25",
      source: "user_entry",
    });
    expect(upsertResult.error).toBeUndefined();
    expect(upsertResult.data?.context.date).toBe("2026-05-25");
    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: expect.stringContaining("/recovery/context?date=2026-05-25"),
        }),
        expect.objectContaining({
          url: expect.stringContaining("/recovery/check-in"),
          body: expect.objectContaining({
            date: "2026-05-25",
            source: "user_entry",
          }),
        }),
      ]),
    );
  });

  it("loads weekly recovery context summaries without score framing", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          weekStart: "2026-05-19",
          weekEnd: "2026-05-25",
          entries: [
            {
              date: "2026-05-25",
              band: "moderate_load",
              dataSufficiency: "partial",
              signalCount: 2,
            },
          ],
          summary: {
            daysWithContext: 1,
            checkInCount: 1,
            bandCounts: {
              well_supported: 0,
              moderate_load: 1,
              prioritize_recovery: 0,
              insufficient_data: 6,
            },
            dominantBand: "moderate_load",
            dataSufficiency: "insufficient",
            message: "This week shows a mixed recovery pattern based on the entries available.",
          },
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getRecoveryWeeklyContext(token, "2026-05-19");

    expect(result.error).toBeUndefined();
    expect(result.data?.summary.dominantBand).toBe("moderate_load");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/recovery/context/weekly?weekStart=2026-05-19"),
      expect.any(Object),
    );
    expect(JSON.stringify(result.data)).not.toMatch(/readiness score|recovery score/i);
  });

  it("rejects invalid recovery upsert payloads before calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      upsertRecoveryCheckIn(token, {
        soreness: 6,
        fatigue: 3,
      }),
    ).rejects.toThrow();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads current user state from /users/me/state", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          user: {
            id: "11111111-1111-4111-8111-111111111111",
            clerkUserId: "user_123",
            email: "alex@example.com",
            displayName: "Alex",
            timezone: "UTC",
            onboardingCompletedAt: null,
            createdAt: "2026-05-25T12:00:00.000Z",
            updatedAt: "2026-05-25T12:00:00.000Z",
          },
          profile: null,
          goals: [
            {
              id: "33333333-3333-4333-8333-333333333333",
              userId: "11111111-1111-4111-8111-111111111111",
              type: "general_wellness",
              status: "active",
              priority: "primary",
              title: "Complete 36 workouts this quarter",
              target: {},
              horizon: "quarterly",
              parentGoalId: null,
              weekStart: null,
              startDate: "2026-04-01",
              targetDate: "2026-06-30",
              createdAt: "2026-05-25T12:00:00.000Z",
              updatedAt: "2026-05-25T12:00:00.000Z",
            },
            {
              id: "44444444-4444-4444-8444-444444444444",
              userId: "11111111-1111-4111-8111-111111111111",
              type: "general_wellness",
              status: "active",
              priority: "secondary",
              title: "Mobility focus this week",
              target: {},
              horizon: "weekly",
              parentGoalId: "33333333-3333-4333-8333-333333333333",
              weekStart: "2026-05-25",
              startDate: "2026-05-25",
              targetDate: null,
              createdAt: "2026-05-25T12:00:00.000Z",
              updatedAt: "2026-05-25T12:00:00.000Z",
            },
          ],
          onboardingCompleted: true,
          hierarchy: {
            direction: {
              statement: "Stay strong and mobile.",
              tags: ["strength"],
            },
            activeQuarterlyGoal: {
              id: "33333333-3333-4333-8333-333333333333",
              userId: "11111111-1111-4111-8111-111111111111",
              type: "general_wellness",
              status: "active",
              priority: "primary",
              title: "Complete 36 workouts this quarter",
              target: {},
              horizon: "quarterly",
              parentGoalId: null,
              weekStart: null,
              startDate: "2026-04-01",
              targetDate: "2026-06-30",
              createdAt: "2026-05-25T12:00:00.000Z",
              updatedAt: "2026-05-25T12:00:00.000Z",
            },
            weeklyFocus: [
              {
                id: "44444444-4444-4444-8444-444444444444",
                userId: "11111111-1111-4111-8111-111111111111",
                type: "general_wellness",
                status: "active",
                priority: "secondary",
                title: "Mobility focus this week",
                target: {},
                horizon: "weekly",
                parentGoalId: "33333333-3333-4333-8333-333333333333",
                weekStart: "2026-05-25",
                startDate: "2026-05-25",
                targetDate: null,
                createdAt: "2026-05-25T12:00:00.000Z",
                updatedAt: "2026-05-25T12:00:00.000Z",
              },
            ],
          },
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getCurrentUserState(token);

    expect(result.error).toBeUndefined();
    expect(result.data?.onboardingCompleted).toBe(true);
    expect(result.data?.hierarchy.activeQuarterlyGoal?.title).toBe(
      "Complete 36 workouts this quarter",
    );
    expect(result.data?.hierarchy.weeklyFocus[0]?.title).toBe("Mobility focus this week");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/users/me/state"),
      expect.objectContaining({ method: "GET" }),
    );
  });

  const validOnboardingInput = {
    user: {
      displayName: "Alex",
      timezone: "UTC",
    },
    profile: {
      birthDate: "1992-04-12",
      heightCm: 180,
      baselineWeightKg: 82.5,
      activityLevel: "moderately_active" as const,
      longevityDirection: {
        statement: "Stay strong and mobile.",
        tags: ["strength"],
      },
    },
    quarterlyGoal: {
      type: "general_wellness" as const,
      title: "Complete 36 workouts this quarter",
      startDate: "2026-04-01",
      targetDate: "2026-06-30",
      priority: "primary" as const,
      horizon: "quarterly" as const,
      target: {},
    },
  };

  it("submits onboarding with required baseline profile fields to POST /onboarding", async () => {
    const requestBodies: unknown[] = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBodies.push(JSON.parse(String(init?.body)));

      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            user: {
              id: "11111111-1111-4111-8111-111111111111",
              clerkUserId: "user_123",
              email: "alex@example.com",
              displayName: "Alex",
              timezone: "UTC",
              onboardingCompletedAt: "2026-05-25T12:00:00.000Z",
              updatedAt: "2026-05-25T12:00:00.000Z",
              createdAt: "2026-05-25T12:00:00.000Z",
            },
            profile: {
              id: "22222222-2222-4222-8222-222222222222",
              userId: "11111111-1111-4111-8111-111111111111",
              birthDate: "1992-04-12",
              heightCm: 180,
              baselineWeightKg: 82.5,
              activityLevel: "moderately_active",
              trainingExperience: "beginner",
              preferences: [],
              constraints: [],
              longevityDirection: {
                statement: "Stay strong and mobile.",
                tags: ["strength"],
              },
              longevityDirectionTags: ["strength"],
              coachingNotes: [],
              createdAt: "2026-05-25T12:00:00.000Z",
              updatedAt: "2026-05-25T12:00:00.000Z",
            },
            goals: [],
            onboardingCompleted: true,
            hierarchy: {
              direction: {
                statement: "Stay strong and mobile.",
                tags: ["strength"],
              },
              activeQuarterlyGoal: null,
              weeklyFocus: [],
            },
          }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await completeOnboarding(token, validOnboardingInput);

    expect(result.error).toBeUndefined();
    expect(result.data?.onboardingCompleted).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/onboarding"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(requestBodies[0]).toMatchObject({
      profile: {
        birthDate: "1992-04-12",
        heightCm: 180,
        baselineWeightKg: 82.5,
      },
    });
  });

  it("rejects onboarding payloads missing baseline profile fields before calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const incompleteProfilePayload = {
      user: validOnboardingInput.user,
      profile: {
        activityLevel: "moderately_active" as const,
        longevityDirection: validOnboardingInput.profile.longevityDirection,
      },
      quarterlyGoal: validOnboardingInput.quarterlyGoal,
    };

    await expect(completeOnboarding(token, incompleteProfilePayload as never)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects onboarding payloads missing birthDate before calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      completeOnboarding(token, {
        ...validOnboardingInput,
        profile: {
          heightCm: 180,
          baselineWeightKg: 82.5,
          longevityDirection: validOnboardingInput.profile.longevityDirection,
        },
      } as never),
    ).rejects.toThrow();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns onboarding refresh query keys", () => {
    expect(getOnboardingRefreshQueryKeys()).toEqual(
      expect.arrayContaining([
        apiQueryKeys.currentUserState,
        apiQueryKeys.profile,
        apiQueryKeys.goals,
      ]),
    );
  });
});
