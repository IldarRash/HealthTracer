import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CONTEXT_BUDGET_POLICY,
  DEEP_HISTORY_CONTEXT_BUDGET_POLICY,
  DEEP_REVIEW_CONTEXT_BUDGET_POLICY,
  getTodayIsoDateInTimezone,
  getWeekStartIsoDate,
  type IntentRouteResult,
} from "@health/types";
import { CoachingContextService } from "./coaching-context.service.js";
import { ContextBudgetPolicyService } from "./context-budget-policy.service.js";
import { createDefaultAiBehaviorConfigService } from "../ai/test-ai-behavior-fixtures.js";

const auth = {
  clerkUserId: "clerk-user-1",
  email: "test@example.com",
  displayName: "Test User",
};

const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
const currentWeekStart = getWeekStartIsoDate(getTodayIsoDateInTimezone("UTC"));

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
  user?: { onboardingCompletedAt?: string | null };
  workoutsRepository?: Record<string, unknown>;
  habitsRepository?: Record<string, unknown>;
  habitsService?: Record<string, unknown>;
  progressHistoryAggregateService?: Record<string, unknown>;
} = {}) {
  return new CoachingContextService(
    new ContextBudgetPolicyService(createDefaultAiBehaviorConfigService()),
    {
      resolveFromAuth: async () => ({
        id: userId,
        email: auth.email,
        displayName: auth.displayName,
        timezone: "UTC",
        onboardingCompletedAt: "2026-05-20T12:00:00.000Z",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...overrides.user,
      }),
    } as never,
    {
      getCurrentProfile: async () => ({
        id: "profile-1",
        userId,
        birthDate: null,
        heightCm: null,
        baselineWeightKg: null,
        activityLevel: "moderately_active",
        trainingExperience: "intermediate",
        preferences: ["morning workouts"],
        constraints: ["low impact cardio"],
        longevityDirection: {
          statement: "Stay strong and mobile.",
          tags: ["strength"],
        },
        longevityDirectionTags: ["strength"],
        coachingNotes: [{ text: "Prefers short sessions." }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    } as never,
    {
      listCurrentGoals: async () => [
        {
          id: "a1000001-0000-4000-8000-000000000001",
          userId,
          type: "general_wellness",
          status: "active",
          priority: "primary",
          title: "Complete 36 workouts this quarter",
          target: {},
          horizon: "quarterly",
          parentGoalId: null,
          weekStart: null,
          startDate: "2026-05-01",
          targetDate: "2026-07-31",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "a1000002-0000-4000-8000-000000000002",
          userId,
          type: "general_wellness",
          status: "active",
          priority: "secondary",
          title: "Keep training friction low",
          target: {},
          horizon: "weekly",
          parentGoalId: "a1000001-0000-4000-8000-000000000001",
          weekStart: currentWeekStart,
          startDate: currentWeekStart,
          targetDate: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
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
          id: "b2000001-0000-4000-8000-000000000001",
          generatedAt: new Date().toISOString(),
          weekStart: "2026-05-19",
          weekEnd: "2026-05-25",
          dataStatus: "partial",
          userMessage: "You completed 2 of 3 planned workouts this week.",
          sourceAggregates: {
            workout: {
              plannedSessions: 3,
              completedSessions: 2,
              skippedSessions: 0,
              plannedCount: 3,
              completedCount: 2,
              skippedCount: 0,
              adherencePercent: 66.7,
              averageFatigue: 5,
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
        items: [],
        generatedAt: new Date().toISOString(),
      }),
    } as never,
    {
      buildSignalContextSummary: async () => ({
        signals: [],
        generatedAt: new Date().toISOString(),
      }),
    } as never,
    {
      previewInsights: async () => ({
        insights: [],
        generatedAt: new Date().toISOString(),
        dataStatus: "insufficient",
      }),
    } as never,
    {
      buildSummaryForUser: async () => ({
        items: [],
        generatedAt: new Date().toISOString(),
      }),
    } as never,
    {
      buildSummaryForUser: async () => ({
        latestDate: "2026-05-25",
        latestMoodScore: 4,
        latestStressScore: 2,
        windowDays: 7,
        windowStart: "2026-05-19",
        windowEnd: "2026-05-25",
        checkInCount: 4,
        moodAverage: 3.5,
        stressAverage: 2.75,
        moodTrendDirection: "up",
        stressTrendDirection: "down",
        currentStreak: 2,
        dataSufficiency: "sufficient",
        generatedAt: new Date().toISOString(),
      }),
    } as never,
    {
      buildSummaryForUser: async () => ({
        band: "moderate_load",
        dataSufficiency: "partial",
        focusMessage:
          "Based on what you logged, today may carry a moderate load. A balanced pace could help you stay consistent.",
        signals: [{ source: "manual_check_in", label: "Fatigue check-in", detail: "Moderate fatigue" }],
        date: "2026-05-25",
      }),
    } as never,
    (overrides.progressHistoryAggregateService ??
      {
        buildReviewSummary: async () => createProgressHistorySummary(),
      }) as never,
  );
}

function createProgressHistorySummary(overrides: Record<string, unknown> = {}) {
  return {
    requestedPeriodDays: 180,
    grantedPeriodDays: 180,
    granularity: "weekly" as const,
    buckets: [
      {
        bucketStart: "2026-04-27",
        workout: {
          plannedCount: 3,
          completedCount: 2,
          skippedCount: 1,
          adherencePercent: 66.7,
          activeDays: 2,
          avgFatigue: 5.5,
        },
        habits: { adherencePercent: 80 },
        recovery: {
          wellSupportedDays: 2,
          moderateLoadDays: 3,
          prioritizeRecoveryDays: 1,
          insufficientDataDays: 1,
        },
        wellbeing: { avgMoodScore: 3.5, avgStressScore: 2.5, checkInCount: 4 },
      },
    ],
    planChangeMarkers: [],
    dataSufficiency: {
      workout: "partial" as const,
      habits: "partial" as const,
      recovery: "insufficient" as const,
      wellbeing: "partial" as const,
    },
    coveredDays: 42,
    noteCodes: [],
    ...overrides,
  };
}

describe("CoachingContextService", () => {
  it("includes onboarding hierarchy and personal context in prompt context", async () => {
    const service = createCoachingContextService();

    const snapshot = await service.buildSnapshot(auth);
    const promptContext = service.toPromptContext(snapshot);

    expect(snapshot.onboardingCompleted).toBe(true);
    expect(snapshot.coachingHierarchy.activeQuarterlyGoal?.title).toContain("36 workouts");
    expect(snapshot.coachingHierarchy.weeklyFocus).toEqual([
      expect.objectContaining({
        title: "Keep training friction low",
        weekStart: currentWeekStart,
      }),
    ]);
    expect(snapshot.personalContextSummary.preferences).toEqual(["morning workouts"]);
    expect(snapshot.personalContextSummary.coachingNotes).toEqual([
      { text: "Prefers short sessions." },
    ]);
    expect(promptContext.onboardingCompleted).toBe(true);
    expect(promptContext.coachingHierarchy).toEqual(snapshot.coachingHierarchy);
    expect(promptContext.personalContextSummary).toEqual(snapshot.personalContextSummary);
    expect(promptContext.profile).toMatchObject({
      longevityDirection: {
        statement: "Stay strong and mobile.",
        tags: ["strength"],
      },
    });
  });

  it("keeps onboarding complete in context when legacy users are missing the timestamp", async () => {
    const service = createCoachingContextService({
      user: { onboardingCompletedAt: null },
    });

    const snapshot = await service.buildSnapshot(auth);

    expect(snapshot.onboardingCompleted).toBe(true);
  });

  it("includes wellbeing summary in snapshot and prompt context without notes", async () => {
    const service = createCoachingContextService();

    const snapshot = await service.buildSnapshot(auth);
    const promptContext = service.toPromptContext(snapshot);

    expect(snapshot.wellbeingSummary).toMatchObject({
      latestMoodScore: 4,
      latestStressScore: 2,
      dataSufficiency: "sufficient",
    });
    expect(promptContext.wellbeingSummary).toEqual(snapshot.wellbeingSummary);
    expect(promptContext.wellbeingSummary).not.toHaveProperty("note");
  });

  it("includes recovery context in snapshot and prompt context without numeric score", async () => {
    const service = createCoachingContextService();

    const snapshot = await service.buildSnapshot(auth);
    const promptContext = service.toPromptContext(snapshot);

    expect(snapshot.recoveryContext).toMatchObject({
      band: "moderate_load",
      dataSufficiency: "partial",
    });
    expect(promptContext.recoveryContext).toEqual(snapshot.recoveryContext);
    expect(JSON.stringify(promptContext.recoveryContext)).not.toMatch(/score/i);
  });

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

  it("builds bounded multi-slice context from unified turn decision routing", async () => {
    const service = createCoachingContextService();

    const packet = await service.buildAgentContext(
      auth,
      {
        userMessage: "I feel tired and hungry all the time.",
        intent: "adjust_nutrition",
        purpose: "nutrition_adaptation",
        depth: "medium",
        timeRange: "14d",
        includeDocuments: false,
      },
      {
        intent: "adjust_nutrition",
        catalogIntentId: "adjust_nutrition",
        confidence: 0.84,
        isConfident: true,
        purpose: "nutrition_adaptation",
        depth: "medium",
        timeRange: "14d",
        includeDocuments: false,
        routingMethod: "unified_turn_decision",
        requiredContextSlices: [
          { type: "nutrition_adaptation", depth: "medium", timeRange: "14d" },
          { type: "daily_checkin", depth: "small", timeRange: "7d" },
          { type: "general_chat", depth: "small", timeRange: "7d" },
        ],
        safetyFlags: ["hunger", "fatigue"],
        expectedResponseMode: "recommendation_with_optional_proposal",
      },
    );

    expect(packet.supplementarySlices).toHaveLength(2);
    expect(packet.routing).toMatchObject({
      routingMethod: "unified_turn_decision",
      llmRouterInvoked: false,
      contextSliceCount: 3,
      safetyFlags: ["hunger", "fatigue"],
    });
    expect(packet.missingContextNotes).toContain(
      "No active nutrition plan is available for nutrition adaptation.",
    );
  });

  it("enforces context budget when building agent context", async () => {
    const service = createCoachingContextService();

    const packet = await service.buildAgentContext(
      auth,
      {
        userMessage: "Summarize my health documents and training context.",
        intent: "ask_health_context",
        purpose: "health_context",
        depth: "large",
        timeRange: "90d",
        includeDocuments: true,
      },
      {
        intent: "ask_health_context",
        catalogIntentId: "ask_health_context",
        confidence: 0.9,
        isConfident: true,
        purpose: "health_context",
        depth: "large",
        timeRange: "90d",
        includeDocuments: true,
        routingMethod: "unified_turn_decision",
        requiredContextSlices: [
          {
            type: "health_context",
            depth: "large",
            timeRange: "90d",
            includeDocuments: true,
          },
          { type: "nutrition_adaptation", depth: "large", timeRange: "90d" },
          { type: "daily_checkin", depth: "large", timeRange: "90d" },
          { type: "general_chat", depth: "large", timeRange: "90d" },
        ],
        safetyFlags: [],
        expectedResponseMode: "recommendation_with_optional_proposal",
      },
      {
        contextBudget: {
          ...DEFAULT_CONTEXT_BUDGET_POLICY,
          maxSlices: 1,
        },
      },
    );

    expect(packet.supplementarySlices).toHaveLength(0);
    expect(packet.slice.documentContext).toBeUndefined();
    expect(packet.slice.ragResults).toBeUndefined();
    expect(packet.missingContextNotes.some((note) => note.includes("truncated"))).toBe(true);
    expect(
      packet.missingContextNotes.some((note) => note.includes("document expansion denied")),
    ).toBe(true);
  });

  it("records compression requirement for deep review budgets", async () => {
    const service = createCoachingContextService();

    const packet = await service.buildAgentContext(
      auth,
      {
        userMessage: "Give me a monthly review across domains.",
        intent: "general",
        purpose: "general_chat",
        depth: "large",
        timeRange: "30d",
        includeDocuments: false,
      },
      {
        intent: "general",
        catalogIntentId: "general",
        confidence: 0.9,
        isConfident: true,
        purpose: "general_chat",
        depth: "large",
        timeRange: "30d",
        includeDocuments: false,
        routingMethod: "unified_turn_decision",
        requiredContextSlices: [{ type: "general_chat", depth: "large", timeRange: "30d" }],
        safetyFlags: [],
        expectedResponseMode: "advice_only",
      },
      { contextBudget: DEEP_REVIEW_CONTEXT_BUDGET_POLICY },
    );

    expect(packet.missingContextNotes).toContain(
      "Large review context requires compression before full historical detail is available.",
    );
  });
});

// ---------------------------------------------------------------------------
// Phase 3 — progress_history_review slice through the existing machinery
// ---------------------------------------------------------------------------

function createReviewRoute(
  withProgressHistorySlice: boolean,
): IntentRouteResult {
  return {
    intent: "review_progress",
    catalogIntentId: "review_progress",
    confidence: 0.9,
    isConfident: true,
    purpose: "weekly_review",
    depth: "large",
    timeRange: "7d",
    includeDocuments: false,
    routingMethod: "unified_turn_decision",
    requiredContextSlices: withProgressHistorySlice
      ? [
          { type: "weekly_review", depth: "large", timeRange: "7d", includeDocuments: false },
          {
            type: "progress_history_review",
            depth: "large",
            timeRange: "1y",
            includeDocuments: false,
          },
        ]
      : [{ type: "weekly_review", depth: "large", timeRange: "7d", includeDocuments: false }],
    safetyFlags: [],
    expectedResponseMode: "recommendation_with_optional_proposal",
  };
}

describe("CoachingContextService — progress_history_review slice (Phase 3)", () => {
  it("NEVER calls the aggregate service on a default-profile plan (spy regression)", async () => {
    const buildReviewSummary = vi.fn(async () => createProgressHistorySummary());
    const service = createCoachingContextService({
      progressHistoryAggregateService: { buildReviewSummary },
    });

    await service.buildAgentContext(
      auth,
      {
        userMessage: "How is my training going this week?",
        intent: "review_progress",
        purpose: "weekly_review",
      },
      createReviewRoute(false),
      { contextBudget: DEFAULT_CONTEXT_BUDGET_POLICY },
    );

    expect(buildReviewSummary).not.toHaveBeenCalled();
  });

  it("calls the aggregate service once and includes the slice on a deep_history review plan", async () => {
    const buildReviewSummary = vi.fn(async () => createProgressHistorySummary());
    const service = createCoachingContextService({
      progressHistoryAggregateService: { buildReviewSummary },
    });

    const packet = await service.buildAgentContext(
      auth,
      {
        userMessage: "проанализируй последние полгода",
        intent: "review_progress",
        purpose: "weekly_review",
      },
      createReviewRoute(true),
      {
        contextBudget: DEEP_HISTORY_CONTEXT_BUDGET_POLICY,
        progressHistoryLookback: {
          requestedLookbackDays: 180,
          grantedLookbackDays: 180,
          responseLanguage: "ru",
        },
      },
    );

    expect(buildReviewSummary).toHaveBeenCalledTimes(1);
    expect(buildReviewSummary).toHaveBeenCalledWith(userId, 180, expect.any(Date), "UTC");

    const reviewSlice = [packet.slice, ...packet.supplementarySlices].find(
      (slice) => slice.purpose === "progress_history_review",
    );

    expect(reviewSlice).toBeDefined();
    expect(reviewSlice?.progressHistory?.granularity).toBe("weekly");
    expect(reviewSlice?.progressHistory?.buckets).toHaveLength(1);
    // Floors: the review slice never carries sensitive or document context.
    expect(reviewSlice?.wellbeingSummary).toBeUndefined();
    expect(reviewSlice?.recoveryContext).toBeUndefined();
    expect(reviewSlice?.documentContext).toBeUndefined();
    expect(reviewSlice?.ragResults).toBeUndefined();
  });

  it("threads planner-injected slice requests via options for route-less domain packets", async () => {
    const buildReviewSummary = vi.fn(async () => createProgressHistorySummary());
    const service = createCoachingContextService({
      progressHistoryAggregateService: { buildReviewSummary },
    });

    const packet = await service.buildAgentContext(
      auth,
      {
        userMessage: "проанализируй последние полгода",
        intent: "review_progress",
        purpose: "weekly_review",
        depth: "large",
        timeRange: "7d",
      },
      undefined,
      {
        contextBudget: DEEP_HISTORY_CONTEXT_BUDGET_POLICY,
        supplementarySliceRequests: [
          {
            type: "progress_history_review",
            depth: "large",
            timeRange: "1y",
            includeDocuments: false,
          },
        ],
        progressHistoryLookback: {
          requestedLookbackDays: 365,
          grantedLookbackDays: 365,
          responseLanguage: "en",
        },
      },
    );

    expect(buildReviewSummary).toHaveBeenCalledTimes(1);
    expect(
      packet.supplementarySlices.some((slice) => slice.purpose === "progress_history_review"),
    ).toBe(true);
  });

  it("adds the RU config-sourced clamp note when requested lookback exceeds the grant", async () => {
    const service = createCoachingContextService();

    const packet = await service.buildAgentContext(
      auth,
      {
        userMessage: "проанализируй последние два года",
        intent: "review_progress",
        purpose: "weekly_review",
      },
      createReviewRoute(true),
      {
        contextBudget: DEEP_REVIEW_CONTEXT_BUDGET_POLICY,
        progressHistoryLookback: {
          requestedLookbackDays: 730,
          grantedLookbackDays: 90,
          responseLanguage: "ru",
        },
      },
    );

    expect(
      packet.missingContextNotes.some((note) => note.startsWith("Показаны последние")),
    ).toBe(true);
  });

  it("falls back to the EN clamp note copy for unknown response languages", async () => {
    const service = createCoachingContextService();

    const packet = await service.buildAgentContext(
      auth,
      {
        userMessage: "analyze my last two years",
        intent: "review_progress",
        purpose: "weekly_review",
      },
      createReviewRoute(true),
      {
        contextBudget: DEEP_REVIEW_CONTEXT_BUDGET_POLICY,
        progressHistoryLookback: {
          requestedLookbackDays: 730,
          grantedLookbackDays: 90,
          responseLanguage: null,
        },
      },
    );

    expect(packet.missingContextNotes.some((note) => note.startsWith("Showing the last"))).toBe(
      true,
    );
  });

  it("omits the clamp note when the requested lookback fits the grant", async () => {
    const service = createCoachingContextService();

    const packet = await service.buildAgentContext(
      auth,
      {
        userMessage: "review my last month",
        intent: "review_progress",
        purpose: "weekly_review",
      },
      createReviewRoute(true),
      {
        contextBudget: DEEP_REVIEW_CONTEXT_BUDGET_POLICY,
        progressHistoryLookback: {
          requestedLookbackDays: 30,
          grantedLookbackDays: 30,
          responseLanguage: "en",
        },
      },
    );

    expect(
      packet.missingContextNotes.some(
        (note) => note.startsWith("Showing the last") || note.startsWith("Показаны последние"),
      ),
    ).toBe(false);
  });
});
