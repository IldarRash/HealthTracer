import { describe, expect, it } from "vitest";
import { WEEKLY_REVIEW_CHAT_PROMPT } from "@health/types";
import type {
  BiomarkersDashboardResponse,
  DeviceConnection,
  Goal,
  HabitAdherenceResponse,
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
  buildBiomarkersLabsCardView,
  buildGoalsSectionView,
  buildLongevityCoachPrompts,
  buildLongevityHeroTrendStripView,
  buildLongevityTrendsView,
  buildLongevityWeekEyebrow,
  buildLongevityWeekEyebrowFromAnchorDate,
  buildLongevityWeeklyHero,
  buildNutritionConsistencyCardView,
  buildSevenDayTrendAriaLabel,
  buildTodayAdherenceCardView,
  buildWellnessSignalsPanelView,
  buildWorkoutConsistencyCardView,
  formatDeferredDomainsCollapsibleSummary,
  goalsCardHint,
  goalsCardValue,
  hasMeaningfulHabitAdherence,
  hasSparseLongevityData,
  isOptionalProgressNotFound,
  LONGEVITY_CTA_ROUTES,
  mergeTodayHistoryIntoTrend,
  sanitizeLongevityBackendText,
  shortenLongevityCoachPromptLabel,
  summarizeActiveGoals,
  summarizeHabitConsistencyHint,
} from "./longevity-ui-state.js";

const userId = "22222222-2222-4222-8222-222222222222";
const now = new Date("2026-05-22T15:00:00.000Z");

function sampleActiveGoal(): Goal {
  return {
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
  };
}

function sampleHabitAdherence(
  overrides: Partial<HabitAdherenceResponse> = {},
): HabitAdherenceResponse {
  return {
    plan: {
      window: 7,
      windowStart: "2026-05-16",
      windowEnd: "2026-05-22",
      scheduled: 7,
      completed: 5,
      skipped: 1,
      missed: 1,
      requiredCompletionRate: 0.7143,
      ...overrides.plan,
    },
    habits: overrides.habits ?? [
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
  };
}

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

function sampleBiomarkersDashboard(input: {
  vitaminDValue: number | null;
}): BiomarkersDashboardResponse {
  return {
    generatedAt: "2026-05-22T12:00:00.000Z",
    areas: [
      {
        area: "nutrients",
        markers: [
          {
            key: "vitamin_d",
            displayLabel: "Vitamin D (25-OH)",
            canonicalUnit: "ng/mL",
            typicalRange: { low: 30, high: 100, unit: "ng/mL" },
            latestReading:
              input.vitaminDValue === null
                ? null
                : {
                    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                    userId,
                    labReportId: null,
                    biomarkerKey: "vitamin_d",
                    value: input.vitaminDValue,
                    valueText: null,
                    unit: "ng/mL",
                    referenceRangeText: null,
                    observedAt: "2026-05-20",
                    source: "extraction",
                    confidence: 0.9,
                    userEdited: false,
                    createdAt: "2026-05-20T12:00:00.000Z",
                    updatedAt: "2026-05-20T12:00:00.000Z",
                  },
            readingCount: input.vitaminDValue === null ? 0 : 1,
          },
        ],
      },
    ],
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
    it("marks sparse data when no workouts, today signals, or habit completions exist", () => {
      expect(
        hasSparseLongevityData({
          sessions: [],
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

    it("marks goal-only users as sparse without inflated weekly percent", () => {
      const hero = buildLongevityWeeklyHero({
        sessions: [],
        goals: [sampleActiveGoal()],
        todayHistory: [],
        todayDay: null,
        now,
      });

      expect(
        hasSparseLongevityData({
          sessions: [],
          goals: [sampleActiveGoal()],
          todayHistory: [],
          todayDay: null,
          now,
        }),
      ).toBe(true);
      expect(hero.sparse).toBe(true);
      expect(hero.emptyMessage).toBe("Not enough data yet");
      expect(hero.percent).toBe(0);
      assertNoForbiddenTerms(hero);
    });

    it("returns populated hero when habit completion data exists without workouts or today", () => {
      const habitAdherence = sampleHabitAdherence();

      expect(hasMeaningfulHabitAdherence(habitAdherence)).toBe(true);
      expect(
        hasSparseLongevityData({
          sessions: [],
          todayHistory: [],
          todayDay: null,
          habitAdherence,
          now,
        }),
      ).toBe(false);

      const hero = buildLongevityWeeklyHero({
        sessions: [],
        goals: [],
        todayHistory: [],
        todayDay: null,
        habitAdherence,
        now,
      });

      expect(hero.sparse).toBe(false);
      expect(hero.emptyMessage).toBeNull();
      expect(hero.percent).toBe(71);
      assertNoForbiddenTerms(hero);
    });

    it("keeps hero sparse when habits are scheduled but have zero completions", () => {
      const habitAdherence = sampleHabitAdherence({
        plan: {
          window: 7,
          windowStart: "2026-05-16",
          windowEnd: "2026-05-22",
          scheduled: 7,
          completed: 0,
          skipped: 0,
          missed: 7,
          requiredCompletionRate: 0,
        },
        habits: [
          {
            habitDefinitionId: "a1000001-0000-4000-8000-000000000001",
            title: "Morning hydration",
            required: true,
            scheduled: 7,
            completed: 0,
            skipped: 0,
            missed: 7,
            completionRate: 0,
            currentStreak: 0,
          },
        ],
      });

      expect(hasMeaningfulHabitAdherence(habitAdherence)).toBe(false);
      expect(
        hasSparseLongevityData({
          sessions: [],
          todayHistory: [],
          todayDay: null,
          habitAdherence,
          now,
        }),
      ).toBe(true);

      const hero = buildLongevityWeeklyHero({
        sessions: [],
        goals: [],
        todayHistory: [],
        todayDay: null,
        habitAdherence,
        now,
      });

      expect(hero.sparse).toBe(true);
      expect(hero.emptyMessage).toBe("Not enough data yet");
      expect(hero.percent).toBe(0);
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
          source: "planned",
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

    it("builds sparse and populated seven-day trend aria labels with weekday names", () => {
      expect(buildSevenDayTrendAriaLabel([0, 0, 0, 0, 0, 0, 0], true)).toBe(
        "Seven day activity trend unavailable. Not enough data yet.",
      );

      expect(
        buildSevenDayTrendAriaLabel([10, 20, 0, 40, 80, 0, 0], false),
      ).toBe(
        "Seven day activity trend. Mon: 10%, Tue: 20%, Wed: 0%, Thu: 40%, Fri: 80%, Sat: 0%, Sun: 0%.",
      );
    });

    it("builds sparse trend strip view without implying zero activity bars", () => {
      const sparseTrend = buildLongevityHeroTrendStripView([0, 0, 0, 0, 0, 0, 0], true);

      expect(sparseTrend.sparse).toBe(true);
      expect(sparseTrend.className).toContain("trend-strip--sparse");
      expect(sparseTrend.ariaLabel).toContain("unavailable");

      const populatedTrend = buildLongevityHeroTrendStripView([10, 0, 40, 0, 80, 0, 0], false);

      expect(populatedTrend.sparse).toBe(false);
      expect(populatedTrend.className).toBe("trend-strip");
    });

    it("formats the current week range for the page header eyebrow", () => {
      const eyebrow = buildLongevityWeekEyebrow(new Date("2026-05-22T15:00:00.000Z"));
      expect(eyebrow).toContain("2026");
    });

    it("aligns page header eyebrow with dashboard anchor dates", () => {
      const anchorEyebrow = buildLongevityWeekEyebrowFromAnchorDate("2026-05-22");
      const directEyebrow = buildLongevityWeekEyebrow(new Date(2026, 4, 22));
      expect(anchorEyebrow).toBe(directEyebrow);
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

    it("maps nutrition card empty, plan-only, ready, and load-error states", () => {
      expect(buildNutritionConsistencyCardView({
        planTitle: null,
        planSummary: null,
        adherence: null,
      })).toEqual({
        status: "empty",
        message: "No active nutrition plan yet. Accept a nutrition proposal in Chat to begin.",
      });

      expect(
        buildNutritionConsistencyCardView({
          planTitle: null,
          planSummary: null,
          adherence: null,
          fetchFailed: true,
        }),
      ).toMatchObject({
        status: "load_error",
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

    it("maps workout card empty, ready, and load-error states", () => {
      expect(
        buildWorkoutConsistencyCardView({
          sessions: [],
          fetchFailed: true,
        }),
      ).toMatchObject({
        status: "load_error",
      });

      expect(
        buildWorkoutConsistencyCardView({
          sessions: [],
        }),
      ).toMatchObject({
        status: "empty",
      });

      const ready = buildWorkoutConsistencyCardView({
        sessions: [
          {
            id: "77777777-7777-4777-8777-777777777777",
            userId,
            workoutPlanId: "88888888-8888-4888-8888-888888888888",
            workoutPlanRevisionId: "99999999-9999-4999-8999-999999999999",
            title: "Strength day",
            source: "planned",
            exercises: [],
            feedback: {},
            plannedDate: "2026-05-20",
            status: "completed",
            completedAt: "2026-05-20T12:00:00.000Z",
            createdAt: "2026-05-20T12:00:00.000Z",
            updatedAt: "2026-05-20T12:00:00.000Z",
          },
        ],
        now,
      });

      expect(ready.status).toBe("ready");
      if (ready.status === "ready") {
        expect(ready.value).toBe("1 of 1 planned session completed");
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

  describe("biomarkers labs card", () => {
    it("returns empty state when the dashboard is unavailable or has no tracked markers", () => {
      const unavailable = buildBiomarkersLabsCardView(null);
      expect(unavailable.status).toBe("empty");
      if (unavailable.status === "empty") {
        expect(unavailable.message).toContain("No lab results yet");
      }
      assertNoForbiddenTerms(unavailable);

      const untracked = buildBiomarkersLabsCardView(
        sampleBiomarkersDashboard({ vitaminDValue: null }),
      );
      expect(untracked.status).toBe("empty");
      assertNoForbiddenTerms(untracked);
    });

    it("summarizes tracked markers and outside-typical-range counts", () => {
      const outside = buildBiomarkersLabsCardView(
        sampleBiomarkersDashboard({ vitaminDValue: 20 }),
      );
      expect(outside).toEqual({
        status: "ready",
        trackedValue: "1 tracked",
        outsideRangeDetail: "1 outside typical range",
      });
      assertNoForbiddenTerms(outside);

      const inRange = buildBiomarkersLabsCardView(
        sampleBiomarkersDashboard({ vitaminDValue: 60 }),
      );
      expect(inRange).toEqual({
        status: "ready",
        trackedValue: "1 tracked",
        outsideRangeDetail: "All within typical range",
      });
      assertNoForbiddenTerms(inRange);
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
              adHocCompletedCount: 0,
              plannedCompletedCount: 0,
            },
            today: {
              daysWithChecklist: 3,
              averageAdherencePercent: 70,
              completedRequiredItems: 9,
              totalRequiredItems: 12,
              habitItemCompletionPercent: 65,
              dataSufficiency: "partial",
              message: "Today checklists were logged on three days.",
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
        expect(view.headline).toContain("Cross-domain review");
        expect(view.aggregates.length).toBeGreaterThan(0);
        expect(view.trends[0]?.title).toContain("Workout");
        expect(view.deferredDomains[0]?.domain).toBe("Nutrition");
        expect(view.weeklyReviewChatPrompt).toContain("approve individually");
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
              adHocCompletedCount: 0,
              plannedCompletedCount: 0,
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

      for (const term of FORBIDDEN_LONGEVITY_TERMS) {
        expect(sanitizeLongevityBackendText(`Weekly update mentions ${term}.`)).toBe(
          SAFE_BACKEND_MESSAGE_FALLBACK,
        );
      }
    });

    it("maps goals load errors to a partial fallback section view", () => {
      const loadError = buildGoalsSectionView({
        goals: [],
        fetchFailed: true,
      });

      expect(loadError).toEqual({
        status: "load_error",
        title: "Goals unavailable",
        description:
          "Your goals could not be loaded right now. Other wellness data is still shown below.",
      });
      expect(goalsCardValue(loadError)).toBe("Unavailable");
      expect(goalsCardHint(loadError)).toContain("could not be loaded");

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

    it("keeps cached goals visible when refresh fails", () => {
      const cachedGoals: Goal[] = [
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

      const section = buildGoalsSectionView({
        goals: cachedGoals,
        fetchFailed: true,
      });

      expect(section.status).toBe("ready");
      if (section.status === "ready") {
        expect(section.count).toBe(1);
        expect(section.items[0]?.title).toBe("Move daily");
      }
    });

    it("exposes approved longevity CTA routes for card navigation", () => {
      expect(LONGEVITY_CTA_ROUTES).toEqual({
        chat: "/chat",
        today: "/today",
        training: "/training",
        nutrition: "/nutrition",
        profile: "/profile",
        profileGoals: "/profile#goals",
        biomarkers: "/biomarkers",
        profileConsent: "/profile#data-consent",
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
      expect(sparsePrompts.some((prompt) => prompt.message === "Help me build a simple weekly routine")).toBe(true);
      expect(sparsePrompts.every((prompt) => prompt.displayLabel.length < prompt.message.length)).toBe(true);
      expect(sparsePrompts.length).toBeLessThanOrEqual(4);
      assertNoForbiddenTerms(sparsePrompts);

      const wellnessPrompts = buildLongevityCoachPrompts({
        sparseHero: false,
        wellnessStatus: "consent_required",
        activeGoalCount: 1,
      });
      expect(wellnessPrompts.some((prompt) => prompt.message === "What wellness signals should I track this week?")).toBe(true);
      expect(wellnessPrompts.some((prompt) => prompt.displayLabel === "Track wellness signals")).toBe(true);

      const goalPrompts = buildLongevityCoachPrompts({
        sparseHero: false,
        wellnessStatus: "ready",
        activeGoalCount: 0,
      });
      expect(goalPrompts.some((prompt) => prompt.message === "Help me set a wellness goal")).toBe(true);
      expect(goalPrompts.some((prompt) => prompt.displayLabel === "Set a wellness goal")).toBe(true);
    });

    it("shortens weekly review chat prompt labels while preserving full message text", () => {
      expect(shortenLongevityCoachPromptLabel(WEEKLY_REVIEW_CHAT_PROMPT)).toBe("Cross-domain review");
    });

    it("summarizes deferred domains for collapsible trend details", () => {
      expect(formatDeferredDomainsCollapsibleSummary([])).toBe("");
      expect(formatDeferredDomainsCollapsibleSummary([{ domain: "Nutrition" }])).toBe(
        "Nutrition deferred for this review",
      );
      expect(
        formatDeferredDomainsCollapsibleSummary([
          { domain: "Nutrition" },
          { domain: "Recovery" },
        ]),
      ).toBe("2 domains deferred · Nutrition, Recovery");
    });

    it("omits goal-setting coach prompt when goals fetch failed", () => {
      const prompts = buildLongevityCoachPrompts({
        sparseHero: false,
        wellnessStatus: "ready",
        activeGoalCount: 0,
        goalsFetchFailed: true,
      });

      expect(prompts.some((prompt) => prompt.message === "Help me set a wellness goal")).toBe(false);
      assertNoForbiddenTerms(prompts);
    });

    it("treats missing weekly progress as optional when not found", () => {
      expect(isOptionalProgressNotFound("Weekly progress summary not found.")).toBe(true);
      expect(isOptionalProgressNotFound("upstream failed")).toBe(false);
    });

    it("summarizes habit consistency hints and degrades when no plan exists", () => {
      expect(summarizeHabitConsistencyHint(null)).toBeNull();
      expect(
        summarizeHabitConsistencyHint({
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
          habits: [],
        }),
      ).toBeNull();
      expect(
        summarizeHabitConsistencyHint({
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
      ).toBe("71% required completion (7 days) · Morning hydration · 3-day streak");
    });
  });
});
