import { describe, expect, it } from "vitest";
import { CoachingContextService } from "./coaching-context.service.js";

const auth = {
  clerkUserId: "clerk-user-1",
  email: "test@example.com",
  displayName: "Test User",
};

const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";

const activeWorkoutPayload = {
  title: "Three day strength base",
  summary: "A simple weekly structure for consistent training.",
  days: [
    {
      weekday: "monday",
      focus: "Full body strength",
      exercises: [
        {
          exerciseId: "b1000001-0000-4000-8000-000000000016",
          snapshot: {
            name: "Goblet Squat",
            primaryMuscles: ["quads", "glutes"],
            equipment: ["dumbbell"],
          },
          sets: 3,
          reps: "8",
        },
      ],
    },
  ],
  notes: [],
};

describe("CoachingContextService", () => {
  it("includes active workout plan summary and weekly progress in prompt context", async () => {
    const service = new CoachingContextService(
      {
        resolveFromAuth: async () => ({
          id: userId,
          email: auth.email,
          displayName: auth.displayName,
          timezone: "UTC",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      } as never,
      {
        getCurrentProfile: async () => null,
      } as never,
      {
        listCurrentGoals: async () => [],
      } as never,
      {
        findActivePlanByUserId: async () => ({
          id: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
          activeRevisionId: "880099c6-3b5f-4383-8246-97b72bf61818",
        }),
        findActiveRevisionByPlanId: async () => ({
          payload: activeWorkoutPayload,
        }),
      } as never,
      {
        findActivePlanByUserId: async () => null,
      } as never,
      {
        getLatestSummarySnapshot: async () => ({
          summary: {
            weekStart: "2026-05-19",
            weekEnd: "2026-05-25",
            dataStatus: "partial",
            userMessage: "You completed 2 of 3 planned workouts this week.",
            sourceAggregates: {
              workout: {
                plannedSessions: 3,
                completedSessions: 2,
                skippedSessions: 0,
              },
            },
            deferredDomains: [],
          },
          trends: [
            {
              id: "24b19287-75b8-4a3e-9c10-691908479405",
              domain: "workout",
              trendType: "completion_rate",
              direction: "up",
              dataSufficiency: "partial",
              message: "Workout completion improved this week.",
            },
          ],
        }),
      } as never,
      {
        buildDocumentContextSummary: async () => ({
          availableDocuments: 0,
          summaries: [],
        }),
      } as never,
      {
        buildSummaryForUser: async () => ({
          availableMetrics: [],
          recentHighlights: [],
        }),
      } as never,
    );

    const snapshot = await service.buildSnapshot(auth);
    const promptContext = service.toPromptContext(snapshot);

    expect(snapshot.activeWorkoutPlanSummary).toMatchObject({
      title: "Three day strength base",
      dayCount: 1,
      days: [
        {
          weekday: "monday",
          focus: "Full body strength",
          exerciseCount: 1,
          exercises: [{ name: "Goblet Squat", sets: 3, reps: "8" }],
        },
      ],
    });
    expect(promptContext.activeWorkoutPlan).toEqual(snapshot.activeWorkoutPlanSummary);
    expect(promptContext.activeWorkoutRevisionId).toBe(
      "880099c6-3b5f-4383-8246-97b72bf61818",
    );
    expect(promptContext.weeklyProgressSummary).toMatchObject({
      userMessage: "You completed 2 of 3 planned workouts this week.",
      workout: {
        plannedSessions: 3,
        completedSessions: 2,
      },
      trends: [
        expect.objectContaining({
          id: "24b19287-75b8-4a3e-9c10-691908479405",
          message: "Workout completion improved this week.",
        }),
      ],
    });
  });
});
