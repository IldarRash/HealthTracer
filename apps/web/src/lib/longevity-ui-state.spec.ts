import { describe, expect, it } from "vitest";
import type {
  DeviceConnection,
  Goal,
  HealthDocument,
  HealthMetricAggregate,
  NutritionAdherenceRecord,
  TodayDayResponse,
  TodayHistoryEntry,
  WeeklyProgressSummaryResponse,
  WorkoutSession,
} from "@health/types";
import {
  FORBIDDEN_LONGEVITY_TERMS,
  SAFE_BACKEND_MESSAGE_FALLBACK,
  UNSAFE_RECOVERY_INPUT_TYPES,
  buildDocumentsContextView,
  buildGoalsSectionView,
  buildLongevityCoachPrompts,
  buildLongevityTrendsView,
  buildLongevityWeeklyHero,
  buildNutritionConsistencyCardView,
  buildTodayAdherenceCardView,
  buildWellnessSignalsPanelView,
  hasSparseLongevityData,
  isOptionalProgressNotFound,
  mergeTodayHistoryIntoTrend,
  sanitizeLongevityBackendText,
  summarizeActiveGoals,
} from "./longevity-ui-state.js";

const userId = "22222222-2222-4222-8222-222222222222";
const now = new Date("2026-05-22T15:00:00.000Z");

const baseConnection = {
  userId,
  consentId: "33333333-3333-4333-8333-333333333333",
  provider: "wearable" as const,
  platform: "web" as const,
  connectedAt: "2026-05-22T12:00:00.000Z",
  revokedAt: null,
  lastSyncAt: null,
  lastSyncCursor: null,
  createdAt: "2026-05-22T12:00:00.000Z",
  updatedAt: "2026-05-22T12:00:00.000Z",
};

function connectedDevice(
  scopes: DeviceConnection["grantedScopes"],
): DeviceConnection {
  return {
    ...baseConnection,
    id: "55555555-5555-4555-8555-555555555555",
    status: "connected",
    grantedScopes: scopes,
  };
}

function recoveryAggregate(
  inputs: Array<{
    inputType: string;
    latestValue: number | string;
    unit?: string;
  }>,
): HealthMetricAggregate {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    userId,
    consentId: baseConnection.consentId,
    metricType: "recovery_input",
    periodType: "daily",
    periodStart: "2026-05-22",
    periodEnd: "2026-05-22",
    aggregatePayload: {
      inputs: inputs.map((entry) => ({
        ...entry,
        observedAt: "2026-05-22T12:00:00.000Z",
      })),
    },
    sourceMetricTypes: ["recovery_input"],
    calculatedAt: "2026-05-22T12:00:00.000Z",
    createdAt: "2026-05-22T12:00:00.000Z",
    updatedAt: "2026-05-22T12:00:00.000Z",
  };
}

function sampleDocument(
  overrides: Partial<HealthDocument> & Pick<HealthDocument, "id" | "title">,
): HealthDocument {
  return {
    userId,
    documentType: "lab_report",
    storageReference: "documents/sample.txt",
    mimeType: "text/plain",
    fileSizeBytes: 1200,
    parseStatus: "uploaded",
    signalExtractionStatus: "not_started",
    signalExtractionFailureReason: null,
    signalExtractedAt: null,
    consentScopes: ["upload_storage"],
    consentVersion: "v1",
    consentGrantedAt: "2026-05-20T12:00:00.000Z",
    parseFailureReason: null,
    revokedAt: null,
    deletedAt: null,
    uploadedAt: "2026-05-20T12:00:00.000Z",
    createdAt: "2026-05-20T12:00:00.000Z",
    updatedAt: "2026-05-20T12:00:00.000Z",
    ...overrides,
  };
}

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectStrings(entry));
  }

  if (value && typeof value === "object") {
    return Object.values(value).flatMap((entry) => collectStrings(entry));
  }

  return [];
}

function assertNoForbiddenTerms(...values: unknown[]): void {
  const combined = collectStrings(values).join(" ").toLowerCase();

  for (const term of FORBIDDEN_LONGEVITY_TERMS) {
    expect(combined).not.toContain(term);
  }
}

describe("longevity UI state", () => {
  describe("weekly hero and sparse detection", () => {
    it("marks sparse data when no workouts, goals, or today signals exist", () => {
      expect(
        hasSparseLongevityData({
          sessions: [],
          goals: [],
          todayHistory: [],
          todayDay: null,
          now,
        }),
      ).toBe(true);

      const hero = buildLongevityWeeklyHero({
        sessions: [],
        goals: [],
        todayHistory: [],
        todayDay: null,
        now,
      });

      expect(hero.sparse).toBe(true);
      expect(hero.emptyMessage).toBe("Not enough data yet");
      expect(hero.subtitle).toContain("Not enough data yet");
      assertNoForbiddenTerms(hero);
    });

    it("returns populated hero when structured signals exist", () => {
      const sessions: WorkoutSession[] = [
        {
          id: "77777777-7777-4777-8777-777777777777",
          userId,
          workoutPlanId: "88888888-8888-4888-8888-888888888888",
          workoutPlanRevisionId: "99999999-9999-4999-8999-999999999999",
          title: "Strength day",
          exercises: [],
          feedback: {},
          plannedDate: "2026-05-20",
          status: "completed",
          completedAt: "2026-05-20T12:00:00.000Z",
          createdAt: "2026-05-20T12:00:00.000Z",
          updatedAt: "2026-05-20T12:00:00.000Z",
        },
      ];

      const hero = buildLongevityWeeklyHero({
        sessions,
        goals: [],
        todayHistory: [],
        todayDay: null,
        now,
      });

      expect(hero.sparse).toBe(false);
      expect(hero.emptyMessage).toBeNull();
      expect(hero.percent).toBeGreaterThan(0);
      assertNoForbiddenTerms(hero);
    });

    it("merges today history into the weekly trend strip", () => {
      const history: TodayHistoryEntry[] = [
        {
          date: "2026-05-22",
          adherence: {
            score: 0.8,
            completedRequired: 4,
            totalRequired: 5,
            completedOptional: 0,
            skippedRequired: 0,
            skippedOptional: 0,
          },
          itemCount: 5,
          hasFeedback: false,
        },
      ];

      const merged = mergeTodayHistoryIntoTrend([0, 0, 0, 0, 0, 0, 0], history, now);

      expect(merged[4]).toBe(80);
    });
  });

  describe("today and nutrition card views", () => {
    it("maps empty today adherence when no required tasks exist", () => {
      const view = buildTodayAdherenceCardView({
        id: "11111111-1111-4111-8111-111111111111",
        userId,
        date: "2026-05-22",
        items: [],
        source: "generated",
        feedback: null,
        adherence: {
          score: null,
          completedRequired: 0,
          totalRequired: 0,
          completedOptional: 0,
          skippedRequired: 0,
          skippedOptional: 0,
        },
        createdAt: "2026-05-22T12:00:00.000Z",
        updatedAt: "2026-05-22T12:00:00.000Z",
        workout: null,
        nutrition: null,
      });

      expect(view.status).toBe("empty");
      assertNoForbiddenTerms(view);
    });

    it("maps ready today adherence with self-check-in labels", () => {
      const todayDay: TodayDayResponse = {
        id: "11111111-1111-4111-8111-111111111111",
        userId,
        date: "2026-05-22",
        items: [],
        source: "generated",
        feedback: { energy: 7, difficulty: 4 },
        adherence: {
          score: 0.75,
          completedRequired: 3,
          totalRequired: 4,
          completedOptional: 0,
          skippedRequired: 0,
          skippedOptional: 0,
        },
        createdAt: "2026-05-22T12:00:00.000Z",
        updatedAt: "2026-05-22T12:00:00.000Z",
        workout: null,
        nutrition: null,
      };

      const view = buildTodayAdherenceCardView(todayDay);

      expect(view.status).toBe("ready");
      if (view.status === "ready") {
        expect(view.scoreLabel).toBe("75%");
        expect(view.feedbackNote).toContain("Energy self-check-in");
        expect(view.feedbackNote).toContain("Difficulty self-check-in");
      }
      assertNoForbiddenTerms(view);
    });

    it("maps nutrition card empty, plan-only, and ready states", () => {
      expect(buildNutritionConsistencyCardView({
        planTitle: null,
        planSummary: null,
        adherence: null,
      })).toEqual({
        status: "empty",
        message: "No active nutrition plan yet. Accept a nutrition proposal in Chat to begin.",
      });

      expect(buildNutritionConsistencyCardView({
        planTitle: "Balanced week",
        planSummary: "Focus on protein at lunch.",
        adherence: null,
      })).toMatchObject({
        status: "plan_only",
        title: "Balanced week",
      });

      const adherence: NutritionAdherenceRecord = {
        id: "880099c6-3b5f-4383-8246-97b72bf61818",
        userId,
        date: "2026-05-22",
        hydrationLitersConsumed: null,
        mealCompletion: [
          { label: "Breakfast", completed: true },
          { label: "Lunch", completed: false },
        ],
        targetCompletion: {
          caloriesOnTarget: null,
          proteinOnTarget: null,
          carbsOnTarget: null,
          fatOnTarget: null,
        },
        notes: [],
        createdAt: "2026-05-22T12:00:00.000Z",
        updatedAt: "2026-05-22T12:00:00.000Z",
      };

      const ready = buildNutritionConsistencyCardView({
        planTitle: "Balanced week",
        planSummary: null,
        adherence,
      });

      expect(ready.status).toBe("ready");
      if (ready.status === "ready") {
        expect(ready.detail).toBe("1 of 2 planned meals logged today");
      }
      assertNoForbiddenTerms(ready);
    });
  });

  describe("consent-gated wellness signals", () => {
    it("requires consent when no device connection exists", () => {
      const view = buildWellnessSignalsPanelView({
        connections: [],
        aggregates: [],
        snapshots: [],
        todayDay: null,
      });

      expect(view.status).toBe("consent_required");
      if (view.status === "consent_required") {
        expect(view.message).toContain("Consent is managed from Profile");
      }
      assertNoForbiddenTerms(view);
    });

    it("shows revoked state when every connection is revoked and no today feedback exists", () => {
      const view = buildWellnessSignalsPanelView({
        connections: [
          {
            ...baseConnection,
            id: "55555555-5555-4555-8555-555555555555",
            status: "revoked",
            grantedScopes: ["steps"],
            revokedAt: "2026-05-22T14:00:00.000Z",
          },
        ],
        aggregates: [],
        snapshots: [],
        todayDay: null,
      });

      expect(view.status).toBe("revoked");
      if (view.status === "revoked") {
        expect(view.message).toContain("consent was revoked");
      }
      assertNoForbiddenTerms(view);
    });

    it("shows today self-check-ins when sync consent is revoked but feedback exists", () => {
      const view = buildWellnessSignalsPanelView({
        connections: [
          {
            ...baseConnection,
            id: "55555555-5555-4555-8555-555555555555",
            status: "revoked",
            grantedScopes: ["steps"],
            revokedAt: "2026-05-22T14:00:00.000Z",
          },
        ],
        aggregates: [],
        snapshots: [],
        todayDay: {
          id: "11111111-1111-4111-8111-111111111111",
          userId,
          date: "2026-05-22",
          items: [],
          source: "generated",
          feedback: { energy: 6 },
          adherence: {
            score: null,
            completedRequired: 0,
            totalRequired: 0,
            completedOptional: 0,
            skippedRequired: 0,
            skippedOptional: 0,
          },
          createdAt: "2026-05-22T12:00:00.000Z",
          updatedAt: "2026-05-22T12:00:00.000Z",
          workout: null,
          nutrition: null,
        },
      });

      expect(view.status).toBe("ready");
      if (view.status === "ready") {
        expect(view.signals).toHaveLength(1);
        expect(view.signals[0]?.label).toBe("Energy self-check-in");
        expect(view.signals[0]?.detail).toContain("From Today");
      }
      assertNoForbiddenTerms(view);
    });

    it("shows empty state when connected but no consented trends are available", () => {
      const view = buildWellnessSignalsPanelView({
        connections: [connectedDevice(["steps"])],
        aggregates: [],
        snapshots: [],
        todayDay: null,
      });

      expect(view.status).toBe("empty");
      if (view.status === "empty") {
        expect(view.message).toContain("No wellness trends yet");
      }
      assertNoForbiddenTerms(view);
    });

    it("filters unsafe recovery inputs and keeps safe self-check-ins only", () => {
      const aggregate = recoveryAggregate([
        { inputType: "readiness_score", latestValue: 82 },
        { inputType: "resting_heart_rate", latestValue: 58, unit: "bpm" },
        { inputType: "hrv_summary", latestValue: "balanced" },
        { inputType: "mood", latestValue: 7, unit: "/10" },
        { inputType: "soreness", latestValue: 3, unit: "/10" },
      ]);

      const view = buildWellnessSignalsPanelView({
        connections: [connectedDevice(["recovery_inputs"])],
        aggregates: [aggregate],
        snapshots: [],
        todayDay: null,
      });

      expect(view.status).toBe("ready");
      if (view.status !== "ready") {
        return;
      }

      const labels = view.signals.map((signal) => signal.label);
      const details = view.signals.map((signal) => signal.detail).join(" ").toLowerCase();

      expect(labels).toEqual(["Mood self-check-in", "Soreness self-check-in"]);
      expect(details).not.toContain("readiness");
      expect(details).not.toContain("heart rate");
      expect(details).not.toContain("hrv");
      for (const unsafeType of UNSAFE_RECOVERY_INPUT_TYPES) {
        expect(view.signals.some((signal) => signal.id.includes(unsafeType))).toBe(false);
      }
      assertNoForbiddenTerms(view);
    });

    it("includes today energy self-check-in without clinical framing", () => {
      const view = buildWellnessSignalsPanelView({
        connections: [],
        aggregates: [],
        snapshots: [],
        todayDay: {
          id: "11111111-1111-4111-8111-111111111111",
          userId,
          date: "2026-05-22",
          items: [],
          source: "generated",
          feedback: { energy: 8 },
          adherence: {
            score: null,
            completedRequired: 0,
            totalRequired: 0,
            completedOptional: 0,
            skippedRequired: 0,
            skippedOptional: 0,
          },
          createdAt: "2026-05-22T12:00:00.000Z",
          updatedAt: "2026-05-22T12:00:00.000Z",
          workout: null,
          nutrition: null,
        },
      });

      expect(view.status).toBe("ready");
      if (view.status === "ready") {
        expect(view.signals[0]?.label).toBe("Energy self-check-in");
        expect(view.signals[0]?.detail).toContain("From Today");
      }
      assertNoForbiddenTerms(view);
    });
  });

  describe("documents metadata-only context", () => {
    it("returns empty state when no active documents exist", () => {
      const view = buildDocumentsContextView([]);

      expect(view.status).toBe("empty");
      if (view.status === "empty") {
        expect(view.message).toContain("No documents uploaded yet");
      }
      assertNoForbiddenTerms(view);
    });

    it("maps metadata labels only and excludes deleted or revoked documents", () => {
      const view = buildDocumentsContextView([
        sampleDocument({
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          title: "Annual labs",
          uploadedAt: "2026-05-21T12:00:00.000Z",
          consentScopes: ["upload_storage", "coach_chat_context"],
        }),
        sampleDocument({
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          title: "Deleted note",
          deletedAt: "2026-05-22T12:00:00.000Z",
        }),
        sampleDocument({
          id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          title: "Revoked note",
          revokedAt: "2026-05-22T12:00:00.000Z",
        }),
      ]);

      expect(view.status).toBe("ready");
      if (view.status !== "ready") {
        return;
      }

      expect(view.items).toHaveLength(1);
      expect(view.items[0]).toMatchObject({
        title: "Annual labs",
        consentLabel: "Coach context consented",
      });
      expect(view.items[0]?.parseStatusLabel).toBeTruthy();
      expect(view.items[0]?.uploadedLabel).toBeTruthy();

      const serialized = JSON.stringify(view.items);
      expect(serialized).not.toContain("summaryText");
      expect(serialized).not.toContain("extractedConstraints");
      assertNoForbiddenTerms(view);
    });
  });

  describe("trends, goals, and coach prompts", () => {
    it("maps empty trends when weekly progress is unavailable", () => {
      const view = buildLongevityTrendsView(null);

      expect(view.status).toBe("empty");
      if (view.status === "empty") {
        expect(view.message).toContain("Not enough data yet");
      }
      assertNoForbiddenTerms(view);
    });

    it("maps ready trends from weekly progress without forbidden terms", () => {
      const progress: WeeklyProgressSummaryResponse = {
        summary: {
          id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          userId,
          weekStart: "2026-05-19",
          weekEnd: "2026-05-25",
          generatedAt: "2026-05-22T12:00:00.000Z",
          dataStatus: "partial",
          sourceAggregates: {
            workout: {
              plannedCount: 2,
              completedCount: 1,
              skippedCount: 0,
              adherencePercent: 50,
              activeDays: 1,
              sessionIds: ["77777777-7777-4777-8777-777777777777"],
              averageFatigue: null,
              exercisePlannedCount: 0,
              exerciseCompletedCount: 0,
              exerciseSkippedCount: 0,
              exerciseAdjustedCount: 0,
              exerciseCompletionPercent: null,
              partialSessionCount: 0,
            },
          },
          deferredDomains: [
            {
              domain: "nutrition",
              reason: "adherence_not_included",
              message: "Not enough logged meals yet.",
            },
          ],
          userMessage: "Keep logging workouts to build your weekly summary.",
          supersededById: null,
          createdAt: "2026-05-22T12:00:00.000Z",
        },
        trends: [
          {
            id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
            userId,
            summaryId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            weekStart: "2026-05-19",
            weekEnd: "2026-05-25",
            domain: "workout",
            trendType: "consistency",
            direction: "up",
            dataSufficiency: "partial",
            supportingAggregate: {},
            message: "Workout consistency improved this week.",
            createdAt: "2026-05-22T12:00:00.000Z",
          },
        ],
      };

      const view = buildLongevityTrendsView(progress);

      expect(view.status).toBe("ready");
      if (view.status === "ready") {
        expect(view.headline).toBe("1 of 2 sessions completed");
        expect(view.trends[0]?.title).toContain("Workout");
        expect(view.deferredDomains[0]?.domain).toBe("Nutrition");
      }
      assertNoForbiddenTerms(view);
    });

    it("replaces forbidden backend trend and deferred messages with safe fallback copy", () => {
      const progress: WeeklyProgressSummaryResponse = {
        summary: {
          id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          userId,
          weekStart: "2026-05-19",
          weekEnd: "2026-05-25",
          generatedAt: "2026-05-22T12:00:00.000Z",
          dataStatus: "partial",
          sourceAggregates: {
            workout: {
              plannedCount: 1,
              completedCount: 1,
              skippedCount: 0,
              adherencePercent: 100,
              activeDays: 1,
              sessionIds: ["77777777-7777-4777-8777-777777777777"],
              averageFatigue: null,
              exercisePlannedCount: 0,
              exerciseCompletedCount: 0,
              exerciseSkippedCount: 0,
              exerciseAdjustedCount: 0,
              exerciseCompletionPercent: null,
              partialSessionCount: 0,
            },
          },
          deferredDomains: [
            {
              domain: "nutrition",
              reason: "adherence_not_included",
              message: "Readiness score suggests abnormal recovery risk.",
            },
          ],
          userMessage: "Keep logging workouts.",
          supersededById: null,
          createdAt: "2026-05-22T12:00:00.000Z",
        },
        trends: [
          {
            id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
            userId,
            summaryId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            weekStart: "2026-05-19",
            weekEnd: "2026-05-25",
            domain: "workout",
            trendType: "consistency",
            direction: "up",
            dataSufficiency: "partial",
            supportingAggregate: {},
            message: "Your health score improved with normal adherence.",
            createdAt: "2026-05-22T12:00:00.000Z",
          },
        ],
      };

      const view = buildLongevityTrendsView(progress);

      expect(view.status).toBe("ready");
      if (view.status !== "ready") {
        return;
      }

      expect(view.trends[0]?.message).toBe(SAFE_BACKEND_MESSAGE_FALLBACK);
      expect(view.deferredSummary).toBe(SAFE_BACKEND_MESSAGE_FALLBACK);
      expect(view.deferredDomains[0]?.detail).toContain(SAFE_BACKEND_MESSAGE_FALLBACK);
      expect(view.trends[0]?.message).not.toContain("health score");
      expect(view.deferredDomains[0]?.detail).not.toContain("abnormal");
      assertNoForbiddenTerms(view);
    });

    it("sanitizes forbidden backend text case-insensitively", () => {
      expect(sanitizeLongevityBackendText("Biological Age trend rising")).toBe(
        SAFE_BACKEND_MESSAGE_FALLBACK,
      );
      expect(sanitizeLongevityBackendText("Workout consistency improved this week.")).toBe(
        "Workout consistency improved this week.",
      );
    });

    it("maps goals load errors to a partial fallback section view", () => {
      expect(
        buildGoalsSectionView({
          goals: [],
          fetchFailed: true,
        }),
      ).toEqual({
        status: "load_error",
        title: "Goals unavailable",
        description:
          "Your goals could not be loaded right now. Other wellness data is still shown below.",
      });

      expect(
        buildGoalsSectionView({
          goals: [],
          fetchFailed: false,
        }),
      ).toMatchObject({
        status: "empty",
        title: "No active goals yet",
      });
    });

    it("summarizes active goals and adapts coach prompts to visible gaps", () => {
      const goals: Goal[] = [
        {
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          userId,
          type: "general_wellness",
          status: "active",
          priority: "primary",
          title: "Move daily",
          target: {},
          horizon: null,
          parentGoalId: null,
          weekStart: null,
          startDate: null,
          targetDate: null,
          createdAt: "2026-05-22T12:00:00.000Z",
          updatedAt: "2026-05-22T12:00:00.000Z",
        },
      ];

      const summary = summarizeActiveGoals(goals);
      expect(summary.count).toBe(1);
      expect(summary.items[0]?.title).toBe("Move daily");

      const sparsePrompts = buildLongevityCoachPrompts({
        sparseHero: true,
        wellnessStatus: "consent_required",
        activeGoalCount: 0,
      });
      expect(sparsePrompts).toContain("Help me build a simple weekly routine");
      expect(sparsePrompts.length).toBeLessThanOrEqual(4);
      assertNoForbiddenTerms(sparsePrompts);

      const wellnessPrompts = buildLongevityCoachPrompts({
        sparseHero: false,
        wellnessStatus: "consent_required",
        activeGoalCount: 1,
      });
      expect(wellnessPrompts).toContain("What wellness signals should I track this week?");

      const goalPrompts = buildLongevityCoachPrompts({
        sparseHero: false,
        wellnessStatus: "ready",
        activeGoalCount: 0,
      });
      expect(goalPrompts).toContain("Help me set a wellness goal");
    });

    it("omits goal-setting coach prompt when goals fetch failed", () => {
      const prompts = buildLongevityCoachPrompts({
        sparseHero: false,
        wellnessStatus: "ready",
        activeGoalCount: 0,
        goalsFetchFailed: true,
      });

      expect(prompts).not.toContain("Help me set a wellness goal");
      assertNoForbiddenTerms(prompts);
    });

    it("treats missing weekly progress as optional when not found", () => {
      expect(isOptionalProgressNotFound("Weekly progress summary not found.")).toBe(true);
      expect(isOptionalProgressNotFound("upstream failed")).toBe(false);
    });
  });
});
