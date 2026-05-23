import { describe, expect, it, vi, afterEach } from "vitest";
import type { AiProposal, UpdateRecipeRecommendationStatusInput } from "@health/types";
import {
  completeWorkoutSession,
  decideProposal,
  apiQueryKeys,
  getAcceptedProposalRefreshQueryKeys,
  getActiveNutritionPlan,
  getActiveWorkoutPlan,
  getInspectorState,
  generateWeeklyProgressSummary,
  getCurrentWeeklyProgressSummary,
  getLatestWeeklyProgressSummary,
  getTodayNutritionAdherence,
  upsertNutritionAdherence,
  upsertTodayNutritionAdherence,
  getTodayDay,
  getTodayHistory,
  buildRecipeListQueryString,
  createDocument,
  deleteDocument,
  generateRecipeRecommendations,
  getDocument,
  grantDeviceConsent,
  listDocuments,
  listDeviceConnections,
  listHealthMetricSnapshots,
  previewHealthMetricsAiContext,
  parseDocument,
  syncHealthMetrics,
  listRecipeRecommendations,
  listRecipes,
  listNutritionRevisions,
  listWorkoutRevisions,
  parseApiErrorBody,
  reviewDocumentSummary,
  scheduleWorkoutSession,
  searchDocuments,
  updateDocumentConsent,
  updateTodayFeedback,
  updateRecipeRecommendationStatus,
  updateTodayItemStatus,
} from "./api.js";

const token = "test-token";

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

  it("returns API errors for non-OK proposal decisions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("forbidden", { status: 403 })),
    );

    const result = await decideProposal(token, "14a08176-64a7-4a2d-8a44-581807368394", "reject");

    expect(result.data).toBeUndefined();
    expect(result.error).toBe("forbidden");
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
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
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
    const baseProposal: AiProposal = {
      id: "14a08176-64a7-4a2d-8a44-581807368394",
      userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
      threadId: "24b19287-75b8-4a3e-9c10-691908479405",
      sourceMessageId: null,
      intent: "adjust_nutrition_plan",
      targetDomain: "nutrition",
      title: "Adjust nutrition targets",
      reason: "Matches your current training context.",
      proposedChanges: {},
      status: "accepted",
      validationStatus: "valid",
      validationErrors: [],
      userDecisionAt: "2026-05-22T12:00:00.000Z",
      appliedReference: "nutrition_revision:880099c6-3b5f-4383-8246-97b72bf61818",
      createdAt: "2026-05-22T12:00:00.000Z",
      updatedAt: "2026-05-22T12:00:00.000Z",
    };

    expect(getAcceptedProposalRefreshQueryKeys(baseProposal)).toEqual([
      apiQueryKeys.dashboardState,
      apiQueryKeys.proposals,
      apiQueryKeys.nutritionActive,
      apiQueryKeys.nutritionRevisions,
      apiQueryKeys.nutritionAdherenceToday,
      apiQueryKeys.nutritionAdherencePrefix,
      apiQueryKeys.todayDayPrefix,
      apiQueryKeys.todayHistoryPrefix,
    ]);
    expect(
      getAcceptedProposalRefreshQueryKeys({
        ...baseProposal,
        targetDomain: "workout",
      }),
    ).toEqual([
      apiQueryKeys.dashboardState,
      apiQueryKeys.proposals,
      apiQueryKeys.workoutActive,
      apiQueryKeys.workoutRevisions,
      apiQueryKeys.progressWeeklyLatest,
      apiQueryKeys.progressWeeklyCurrent,
      apiQueryKeys.todayDayPrefix,
      apiQueryKeys.todayHistoryPrefix,
    ]);
    expect(
      getAcceptedProposalRefreshQueryKeys({
        ...baseProposal,
        targetDomain: "workout",
        intent: "adapt_workout_plan_from_progress",
      }),
    ).toEqual([
      apiQueryKeys.dashboardState,
      apiQueryKeys.proposals,
      apiQueryKeys.workoutActive,
      apiQueryKeys.workoutRevisions,
      apiQueryKeys.progressWeeklyLatest,
      apiQueryKeys.progressWeeklyCurrent,
      apiQueryKeys.todayDayPrefix,
      apiQueryKeys.todayHistoryPrefix,
    ]);
    expect(
      getAcceptedProposalRefreshQueryKeys({
        ...baseProposal,
        targetDomain: "general",
        intent: "summarize_progress",
      }),
    ).toEqual([
      apiQueryKeys.dashboardState,
      apiQueryKeys.proposals,
      apiQueryKeys.progressWeeklyLatest,
      apiQueryKeys.progressWeeklyCurrent,
    ]);
    expect(
      getAcceptedProposalRefreshQueryKeys({
        ...baseProposal,
        targetDomain: "goal",
      }),
    ).toEqual([apiQueryKeys.dashboardState, apiQueryKeys.proposals, apiQueryKeys.goals]);
    expect(
      getAcceptedProposalRefreshQueryKeys({
        ...baseProposal,
        targetDomain: "profile",
      }),
    ).toEqual([apiQueryKeys.dashboardState, apiQueryKeys.proposals, apiQueryKeys.profile]);
    expect(
      getAcceptedProposalRefreshQueryKeys({
        ...baseProposal,
        targetDomain: "recipe",
        intent: "recommend_recipes",
      }),
    ).toEqual([
      apiQueryKeys.dashboardState,
      apiQueryKeys.proposals,
      apiQueryKeys.recipeRecommendations,
      apiQueryKeys.recipesCatalog,
    ]);
    expect(
      getAcceptedProposalRefreshQueryKeys({
        ...baseProposal,
        targetDomain: "today",
      }),
    ).toEqual([
      apiQueryKeys.dashboardState,
      apiQueryKeys.proposals,
      apiQueryKeys.todayDayPrefix,
      apiQueryKeys.todayHistoryPrefix,
    ]);
    expect(
      getAcceptedProposalRefreshQueryKeys({
        ...baseProposal,
        targetDomain: "today",
        intent: "create_today_checklist",
      }),
    ).toEqual([
      apiQueryKeys.dashboardState,
      apiQueryKeys.proposals,
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

    const historyResult = await getTodayHistory(token, 14);
    expect(historyResult.error).toBeUndefined();
    expect(historyResult.data?.entries).toHaveLength(1);
    expect(String(vi.mocked(fetch).mock.calls[1]?.[0])).toContain("limit=14");
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
});
