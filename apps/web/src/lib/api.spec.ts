import { describe, expect, it, vi, afterEach } from "vitest";
import type { AiProposal } from "@health/types";
import {
  completeWorkoutSession,
  decideProposal,
  apiQueryKeys,
  getAcceptedProposalRefreshQueryKeys,
  getActiveNutritionPlan,
  getActiveWorkoutPlan,
  getInspectorState,
  listNutritionRevisions,
  listWorkoutRevisions,
  parseApiErrorBody,
  scheduleWorkoutSession,
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
        targetDomain: "today",
      }),
    ).toEqual([apiQueryKeys.dashboardState, apiQueryKeys.proposals]);
    expect(
      getAcceptedProposalRefreshQueryKeys({
        ...baseProposal,
        status: "rejected",
      }),
    ).toEqual([]);
  });
});
