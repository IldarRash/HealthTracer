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

const activeHabitPayload = {
  habits: [
    {
      habitDefinitionId: "c1000001-0000-4000-8000-000000000001",
      title: "Morning hydration",
      category: "hydration",
      status: "active",
      schedule: { type: "daily" },
      target: { type: "boolean" },
      required: true,
      timeOfDayHint: "morning",
      displayOrder: 0,
    },
    {
      habitDefinitionId: "c1000002-0000-4000-8000-000000000002",
      title: "Daily walk",
      category: "movement",
      status: "active",
      schedule: { type: "daily" },
      target: { type: "duration_minutes", value: 20 },
      required: true,
      displayOrder: 1,
    },
  ],
};

function createCoachingContextService(overrides: {
  workoutsRepository?: Record<string, unknown>;
  habitsRepository?: Record<string, unknown>;
  habitsService?: Record<string, unknown>;
} = {}) {
  return new CoachingContextService(
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
    (overrides.workoutsRepository ??
      {
        findActivePlanByUserId: async () => ({
          id: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
          activeRevisionId: "880099c6-3b5f-4383-8246-97b72bf61818",
        }),
        findActiveRevisionByPlanId: async () => ({
          payload: activeWorkoutPayload,
        }),
      }) as never,
    {
      findActivePlanByUserId: async () => null,
    } as never,
    (overrides.habitsRepository ??
      {
        findActivePlanByUserId: async () => null,
      }) as never,
    (overrides.habitsService ??
      {
        getRecentAdherenceForCoaching: async () => null,
      }) as never,
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
}

describe("CoachingContextService", () => {
  it("includes active workout plan summary and weekly progress in prompt context", async () => {
    const service = createCoachingContextService();

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

  it("includes active habit plan summary in snapshot and prompt context", async () => {
    const service = createCoachingContextService({
      workoutsRepository: {
        findActivePlanByUserId: async () => null,
      },
      habitsRepository: {
        findActivePlanByUserId: async () => ({
          id: "7a8b9c0d-1111-4222-8333-444455556666",
          activeRevisionId: "9b0c1d2e-3333-4444-8555-666677778888",
        }),
        findActiveRevisionByPlanId: async () => ({
          payload: activeHabitPayload,
        }),
      },
    });

    const snapshot = await service.buildSnapshot(auth);
    const promptContext = service.toPromptContext(snapshot);

    expect(snapshot.activeHabitPlanSummary).toMatchObject({
      activeHabitCount: 2,
      habits: [
        expect.objectContaining({
          habitDefinitionId: "c1000001-0000-4000-8000-000000000001",
          title: "Morning hydration",
          category: "hydration",
          targetType: "boolean",
        }),
        expect.objectContaining({
          habitDefinitionId: "c1000002-0000-4000-8000-000000000002",
          title: "Daily walk",
          category: "movement",
          targetType: "duration_minutes",
          targetValue: 20,
        }),
      ],
    });
    expect(promptContext.activeHabitPlan).toEqual(snapshot.activeHabitPlanSummary);
    expect(promptContext.activeHabitRevisionId).toBe(
      "9b0c1d2e-3333-4444-8555-666677778888",
    );
    expect(promptContext.activeWorkoutPlan).toBeNull();
  });

  it("includes workout and habit summaries when both plans are active", async () => {
    const service = createCoachingContextService({
      habitsRepository: {
        findActivePlanByUserId: async () => ({
          id: "7a8b9c0d-1111-4222-8333-444455556666",
          activeRevisionId: "9b0c1d2e-3333-4444-8555-666677778888",
        }),
        findActiveRevisionByPlanId: async () => ({
          payload: activeHabitPayload,
        }),
      },
    });

    const snapshot = await service.buildSnapshot(auth);
    const promptContext = service.toPromptContext(snapshot);

    expect(snapshot.activeWorkoutPlanSummary).toMatchObject({
      title: "Three day strength base",
    });
    expect(snapshot.activeHabitPlanSummary).toMatchObject({
      activeHabitCount: 2,
    });
    expect(promptContext.activeWorkoutPlan).toEqual(snapshot.activeWorkoutPlanSummary);
    expect(promptContext.activeHabitPlan).toEqual(snapshot.activeHabitPlanSummary);
    expect(promptContext.activeWorkoutRevisionId).toBe(
      "880099c6-3b5f-4383-8246-97b72bf61818",
    );
    expect(promptContext.activeHabitRevisionId).toBe(
      "9b0c1d2e-3333-4444-8555-666677778888",
    );
  });

  it("omits habit plan summary when active revision payload is invalid", async () => {
    const service = createCoachingContextService({
      workoutsRepository: {
        findActivePlanByUserId: async () => null,
      },
      habitsRepository: {
        findActivePlanByUserId: async () => ({
          id: "7a8b9c0d-1111-4222-8333-444455556666",
          activeRevisionId: "9b0c1d2e-3333-4444-8555-666677778888",
        }),
        findActiveRevisionByPlanId: async () => ({
          payload: { habits: [{ title: "Missing required fields" }] },
        }),
      },
    });

    const snapshot = await service.buildSnapshot(auth);
    const promptContext = service.toPromptContext(snapshot);

    expect(snapshot.activeHabitPlanSummary).toBeNull();
    expect(snapshot.activeHabitRevisionId).toBe(
      "9b0c1d2e-3333-4444-8555-666677778888",
    );
    expect(promptContext.activeHabitPlan).toBeNull();
  });

  it("includes recent habit adherence summary in snapshot and prompt context", async () => {
    const recentHabitAdherenceSummary = {
      windowDays: 7 as const,
      windowStart: "2026-05-18",
      windowEnd: "2026-05-24",
      requiredCompletionRate: 0.7143,
      scheduledRequired: 7,
      completedRequired: 5,
      habits: [
        {
          habitDefinitionId: "c1000001-0000-4000-8000-000000000001",
          title: "Morning hydration",
          required: true,
          completionRate: 0.7143,
          currentStreak: 3,
        },
      ],
    };

    const service = createCoachingContextService({
      workoutsRepository: {
        findActivePlanByUserId: async () => null,
      },
      habitsRepository: {
        findActivePlanByUserId: async () => ({
          id: "7a8b9c0d-1111-4222-8333-444455556666",
          activeRevisionId: "9b0c1d2e-3333-4444-8555-666677778888",
        }),
        findActiveRevisionByPlanId: async () => ({
          payload: activeHabitPayload,
        }),
      },
      habitsService: {
        getRecentAdherenceForCoaching: async () => recentHabitAdherenceSummary,
      },
    });

    const snapshot = await service.buildSnapshot(auth);
    const promptContext = service.toPromptContext(snapshot);

    expect(snapshot.recentHabitAdherenceSummary).toEqual(recentHabitAdherenceSummary);
    expect(promptContext.recentHabitAdherenceSummary).toEqual(recentHabitAdherenceSummary);
    expect(promptContext.activeHabitPlan).toEqual(snapshot.activeHabitPlanSummary);
  });

  it("omits recent habit adherence summary when no active habits exist", async () => {
    const service = createCoachingContextService({
      workoutsRepository: {
        findActivePlanByUserId: async () => null,
      },
      habitsRepository: {
        findActivePlanByUserId: async () => ({
          id: "7a8b9c0d-1111-4222-8333-444455556666",
          activeRevisionId: "9b0c1d2e-3333-4444-8555-666677778888",
        }),
        findActiveRevisionByPlanId: async () => ({
          payload: activeHabitPayload,
        }),
      },
      habitsService: {
        getRecentAdherenceForCoaching: async () => null,
      },
    });

    const snapshot = await service.buildSnapshot(auth);
    const promptContext = service.toPromptContext(snapshot);

    expect(snapshot.recentHabitAdherenceSummary).toBeNull();
    expect(promptContext.recentHabitAdherenceSummary).toBeNull();
    expect(snapshot.activeHabitPlanSummary).not.toBeNull();
  });
});
