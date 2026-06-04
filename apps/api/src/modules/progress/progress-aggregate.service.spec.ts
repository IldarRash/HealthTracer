import type { WorkoutSession } from "@health/types";
import { aggregateNutritionIncidentsWeek } from "@health/types";
import { describe, expect, it } from "vitest";
import {
  aggregateWorkoutSessions,
  buildDeferredDomains,
  buildSummaryUserMessage,
  detectWorkoutTrends,
  isWellnessSafeProgressMessage,
  resolvePriorWeekRange,
  resolveProgressDataStatus,
  resolveWeekRange,
} from "./progress-aggregate.service.js";

const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
const planId = "3f98f3dd-806d-4386-8c5f-43499626c5d6";
const revisionId = "880099c6-3b5f-4383-8246-97b72bf61818";
const timestamp = "2026-05-22T12:00:00.000Z";

function buildSession(
  overrides: Partial<WorkoutSession> & Pick<WorkoutSession, "plannedDate" | "status">,
): WorkoutSession {
  return {
    id: overrides.id ?? "78d40655-b4b5-47b3-b28e-470192e05f04",
    userId,
    workoutPlanId: overrides.workoutPlanId !== undefined ? overrides.workoutPlanId : planId,
    workoutPlanRevisionId:
      overrides.workoutPlanRevisionId !== undefined ? overrides.workoutPlanRevisionId : revisionId,
    plannedDate: overrides.plannedDate,
    title: overrides.title ?? "Training day",
    status: overrides.status,
    source: overrides.source ?? "planned",
    exercises: overrides.exercises ?? [],
    feedback: overrides.feedback ?? {},
    completedAt: overrides.completedAt ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe("ProgressAggregateService", () => {
  it("resolves monday-based week ranges", () => {
    const range = resolveWeekRange(new Date("2026-05-22T12:00:00.000Z"));

    expect(range).toEqual({
      weekStart: "2026-05-18",
      weekEnd: "2026-05-24",
    });
  });

  it("aggregates workout completion counts for a week", () => {
    const aggregate = aggregateWorkoutSessions(
      [
        buildSession({ plannedDate: "2026-05-19", status: "completed" }),
        buildSession({
          id: "88d40655-b4b5-47b3-b28e-470192e05f05",
          plannedDate: "2026-05-21",
          status: "skipped",
        }),
        buildSession({
          id: "98d40655-b4b5-47b3-b28e-470192e05f06",
          plannedDate: "2026-05-22",
          status: "planned",
        }),
      ],
      "2026-05-18",
      "2026-05-24",
    );

    expect(aggregate.plannedCount).toBe(3);
    expect(aggregate.completedCount).toBe(1);
    expect(aggregate.skippedCount).toBe(1);
    expect(aggregate.adherencePercent).toBe(33);
    expect(aggregate.activeDays).toBe(2);
    expect(aggregate.exerciseCompletedCount).toBe(0);
    expect(aggregate.partialSessionCount).toBe(0);
  });

  it("aggregates structured exercise completion and partial sessions", () => {
    const aggregate = aggregateWorkoutSessions(
      [
        buildSession({
          plannedDate: "2026-05-19",
          status: "planned",
          exercises: [
            {
              id: "a1000001-0000-4000-8000-000000000001",
              prescription: { snapshot: { name: "Squat" } },
              execution: { status: "completed" },
            },
            {
              id: "a1000001-0000-4000-8000-000000000002",
              prescription: { snapshot: { name: "Lunge" } },
              execution: { status: "planned" },
            },
          ],
        }),
        buildSession({
          id: "88d40655-b4b5-47b3-b28e-470192e05f05",
          plannedDate: "2026-05-21",
          status: "completed",
          exercises: [
            {
              id: "a1000001-0000-4000-8000-000000000003",
              prescription: { snapshot: { name: "Push-up" } },
              execution: { status: "adjusted", loadAdjustmentNotes: "Knee-friendly angle." },
            },
          ],
        }),
      ],
      "2026-05-18",
      "2026-05-24",
    );

    expect(aggregate.exerciseCompletedCount).toBe(1);
    expect(aggregate.exerciseAdjustedCount).toBe(1);
    expect(aggregate.exercisePlannedCount).toBe(1);
    expect(aggregate.exerciseCompletionPercent).toBe(67);
    expect(aggregate.partialSessionCount).toBe(1);
  });

  it("labels insufficient summary data when no workouts exist", () => {
    const aggregates = { workout: null };
    const status = resolveProgressDataStatus(aggregates);
    const message = buildSummaryUserMessage(aggregates, status);

    expect(status).toBe("insufficient");
    expect(message).toContain("not enough structured history");
    expect(isWellnessSafeProgressMessage(message)).toBe(true);
  });

  it("marks workout-only summaries as partial and lists deferred domains", () => {
    const aggregate = aggregateWorkoutSessions(
      [buildSession({ plannedDate: "2026-05-19", status: "completed" })],
      "2026-05-18",
      "2026-05-24",
    );
    const aggregates = { workout: aggregate };
    const status = resolveProgressDataStatus(aggregates);
    const deferredDomains = buildDeferredDomains({
      today: null,
      nutrition: null,
      habits: null,
      recipes: null,
      recovery: null,
    });

    expect(status).toBe("partial");
    expect(deferredDomains.map((domain) => domain.domain)).toEqual([
      "today",
      "nutrition",
      "recipes",
      "recovery",
    ]);
  });

  it("removes recovery from deferred domains when recovery aggregate exists", () => {
    const deferredDomains = buildDeferredDomains({
      today: null,
      nutrition: null,
      habits: null,
      recipes: null,
      recovery: {
        daysWithContext: 3,
        checkInCount: 2,
        bandCounts: {
          well_supported: 1,
          moderate_load: 2,
          prioritize_recovery: 0,
          insufficient_data: 4,
        },
        dominantBand: "moderate_load",
        dataSufficiency: "partial",
        message: "This week shows a mixed recovery pattern based on the entries available.",
      },
    });

    expect(deferredDomains.map((domain) => domain.domain)).not.toContain("recovery");
  });

  it("labels insufficient trend data when the week is too sparse", () => {
    const current = aggregateWorkoutSessions(
      [buildSession({ plannedDate: "2026-05-19", status: "completed" })],
      "2026-05-18",
      "2026-05-24",
    );
    const trends = detectWorkoutTrends(current, null, "2026-05-18", "2026-05-24");
    const insufficientTrends = trends.filter(
      (trend) => trend.dataSufficiency === "insufficient",
    );

    expect(insufficientTrends.length).toBeGreaterThan(0);
    for (const trend of trends) {
      expect(isWellnessSafeProgressMessage(trend.message)).toBe(true);
      expect(trend.message.toLowerCase()).not.toContain("diagnosis");
    }
  });

  it("detects a higher completion pattern when prior-week data is available", () => {
    const priorWeek = resolvePriorWeekRange("2026-05-18");
    const current = aggregateWorkoutSessions(
      [
        buildSession({ plannedDate: "2026-05-19", status: "completed" }),
        buildSession({
          id: "88d40655-b4b5-47b3-b28e-470192e05f05",
          plannedDate: "2026-05-21",
          status: "completed",
        }),
      ],
      "2026-05-18",
      "2026-05-24",
    );
    const prior = aggregateWorkoutSessions(
      [
        buildSession({
          id: "98d40655-b4b5-47b3-b28e-470192e05f06",
          plannedDate: priorWeek.weekStart,
          status: "skipped",
        }),
        buildSession({
          id: "a8d40655-b4b5-47b3-b28e-470192e05f07",
          plannedDate: "2026-05-11",
          status: "completed",
        }),
      ],
      priorWeek.weekStart,
      priorWeek.weekEnd,
    );

    const completionTrend = detectWorkoutTrends(
      current,
      prior,
      "2026-05-18",
      "2026-05-24",
    ).find((trend) => trend.trendType === "completion_rate");

    expect(completionTrend?.direction).toBe("up");
    expect(completionTrend?.message).toContain("higher share");
  });

  it("rejects wellness-unsafe summary and trend language", () => {
    expect(isWellnessSafeProgressMessage("You completed 2 of 3 sessions this week.")).toBe(
      true,
    );
    expect(isWellnessSafeProgressMessage("This pattern suggests a clinical diagnosis.")).toBe(
      false,
    );
    expect(isWellnessSafeProgressMessage("Your recovery score dropped this week.")).toBe(
      false,
    );
  });

  it("builds a zero-completion summary without medical certainty language", () => {
    const aggregate = aggregateWorkoutSessions(
      [
        buildSession({ plannedDate: "2026-05-19", status: "planned" }),
        buildSession({
          id: "88d40655-b4b5-47b3-b28e-470192e05f05",
          plannedDate: "2026-05-21",
          status: "skipped",
        }),
      ],
      "2026-05-18",
      "2026-05-24",
    );
    const message = buildSummaryUserMessage({ workout: aggregate }, "partial");

    expect(message).toContain("none were marked completed");
    expect(isWellnessSafeProgressMessage(message)).toBe(true);
  });

  it("resolves the prior monday-based week range", () => {
    expect(resolvePriorWeekRange("2026-05-18")).toEqual({
      weekStart: "2026-05-11",
      weekEnd: "2026-05-17",
    });
  });
});

// ---------------------------------------------------------------------------
// Part B — aggregateWorkoutSessions: ad_hoc completed sessions
// ---------------------------------------------------------------------------

describe("aggregateWorkoutSessions — ad_hoc completed sessions (Part B)", () => {
  it("counts an ad_hoc completed session in completedCount and adHocCompletedCount", () => {
    const adHocSession = buildSession({
      id: "a1000001-0000-4000-8000-000000000001",
      plannedDate: "2026-05-19",
      status: "completed",
      source: "ad_hoc",
      workoutPlanId: null,
      workoutPlanRevisionId: null,
    });

    const aggregate = aggregateWorkoutSessions(
      [adHocSession],
      "2026-05-18",
      "2026-05-24",
    );

    expect(aggregate.completedCount).toBe(1);
    expect(aggregate.adHocCompletedCount).toBe(1);
  });

  it("does NOT inflate plannedCount for ad_hoc sessions", () => {
    const adHocSession = buildSession({
      id: "a1000001-0000-4000-8000-000000000001",
      plannedDate: "2026-05-19",
      status: "completed",
      source: "ad_hoc",
      workoutPlanId: null,
      workoutPlanRevisionId: null,
    });

    const aggregate = aggregateWorkoutSessions(
      [adHocSession],
      "2026-05-18",
      "2026-05-24",
    );

    expect(aggregate.plannedCount).toBe(0);
  });

  it("counts ad_hoc completed sessions in activeDays", () => {
    const adHocSession = buildSession({
      id: "a1000001-0000-4000-8000-000000000001",
      plannedDate: "2026-05-19",
      status: "completed",
      source: "ad_hoc",
      workoutPlanId: null,
      workoutPlanRevisionId: null,
    });

    const aggregate = aggregateWorkoutSessions(
      [adHocSession],
      "2026-05-18",
      "2026-05-24",
    );

    expect(aggregate.activeDays).toBe(1);
  });

  it("does NOT count an ad_hoc non-completed session in adHocCompletedCount", () => {
    // An ad_hoc session with status=planned (shouldn't exist in practice but must be safe)
    const adHocPlanned = buildSession({
      id: "a1000001-0000-4000-8000-000000000002",
      plannedDate: "2026-05-19",
      status: "planned",
      source: "ad_hoc",
      workoutPlanId: null,
      workoutPlanRevisionId: null,
    });

    const aggregate = aggregateWorkoutSessions(
      [adHocPlanned],
      "2026-05-18",
      "2026-05-24",
    );

    expect(aggregate.adHocCompletedCount).toBe(0);
    expect(aggregate.completedCount).toBe(0);
  });

  it("mixes planned and ad_hoc sessions correctly", () => {
    const planned = buildSession({
      id: "88d40655-b4b5-47b3-b28e-470192e05f01",
      plannedDate: "2026-05-19",
      status: "completed",
    });
    const adHoc = buildSession({
      id: "a1000001-0000-4000-8000-000000000001",
      plannedDate: "2026-05-20",
      status: "completed",
      source: "ad_hoc",
      workoutPlanId: null,
      workoutPlanRevisionId: null,
    });

    const aggregate = aggregateWorkoutSessions(
      [planned, adHoc],
      "2026-05-18",
      "2026-05-24",
    );

    expect(aggregate.plannedCount).toBe(1);
    expect(aggregate.completedCount).toBe(2);
    expect(aggregate.adHocCompletedCount).toBe(1);
    expect(aggregate.activeDays).toBe(2);
    // Adherence is measured against planned only: 1/1 = 100
    expect(aggregate.adherencePercent).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Part B — aggregateNutritionIncidentsWeek
// ---------------------------------------------------------------------------

describe("aggregateNutritionIncidentsWeek (Part B)", () => {
  it("returns zero totals when no incidents are provided", () => {
    const result = aggregateNutritionIncidentsWeek([]);

    expect(result.incidentCount).toBe(0);
    expect(result.daysWithIncidentsLogged).toBe(0);
    expect(result.totalCalories).toBe(0);
    expect(result.totalProteinGrams).toBe(0);
    expect(result.totalCarbsGrams).toBe(0);
    expect(result.totalFatGrams).toBe(0);
    expect(result.averageDailyCalories).toBeNull();
  });

  it("sums calories and macros from multiple incidents", () => {
    const result = aggregateNutritionIncidentsWeek([
      { date: "2026-05-19", estimatedCalories: 620, proteinGrams: 42, carbsGrams: 55, fatGrams: 18 },
      { date: "2026-05-19", estimatedCalories: 280, proteinGrams: 12, carbsGrams: 30, fatGrams: 10 },
      { date: "2026-05-20", estimatedCalories: 500, proteinGrams: 35, carbsGrams: 45, fatGrams: 15 },
    ]);

    expect(result.incidentCount).toBe(3);
    expect(result.daysWithIncidentsLogged).toBe(2);
    expect(result.totalCalories).toBe(1400);
    expect(result.totalProteinGrams).toBe(89);
    expect(result.totalCarbsGrams).toBe(130);
    expect(result.totalFatGrams).toBe(43);
  });

  it("rounds non-integer macro sums to satisfy .int() schema constraint", () => {
    // Per-incident macros that produce non-integer totals
    const result = aggregateNutritionIncidentsWeek([
      { date: "2026-05-19", estimatedCalories: 300, proteinGrams: 33.3, carbsGrams: 44.7, fatGrams: 10.2 },
      { date: "2026-05-20", estimatedCalories: 300, proteinGrams: 33.3, carbsGrams: 44.7, fatGrams: 10.2 },
    ]);

    // All totals must be integers (Math.round applied)
    expect(Number.isInteger(result.totalCalories)).toBe(true);
    expect(Number.isInteger(result.totalProteinGrams)).toBe(true);
    expect(Number.isInteger(result.totalCarbsGrams)).toBe(true);
    expect(Number.isInteger(result.totalFatGrams)).toBe(true);
    // Should be Math.round(66.6)=67, Math.round(89.4)=89, Math.round(20.4)=20
    expect(result.totalProteinGrams).toBe(67);
    expect(result.totalCarbsGrams).toBe(89);
    expect(result.totalFatGrams).toBe(20);
  });

  it("counts unique days with incidents correctly", () => {
    // 3 incidents across 2 days
    const result = aggregateNutritionIncidentsWeek([
      { date: "2026-05-19", estimatedCalories: 400, proteinGrams: 30, carbsGrams: 40, fatGrams: 12 },
      { date: "2026-05-19", estimatedCalories: 200, proteinGrams: 15, carbsGrams: 20, fatGrams: 6 },
      { date: "2026-05-21", estimatedCalories: 600, proteinGrams: 45, carbsGrams: 60, fatGrams: 18 },
    ]);

    expect(result.daysWithIncidentsLogged).toBe(2);
    expect(result.incidentCount).toBe(3);
  });

  it("computes averageDailyCalories across days with incidents", () => {
    // Day 1: 400+200=600 kcal, Day 2: 600 kcal → average = round(1200/2) = 600
    const result = aggregateNutritionIncidentsWeek([
      { date: "2026-05-19", estimatedCalories: 400, proteinGrams: 30, carbsGrams: 40, fatGrams: 12 },
      { date: "2026-05-19", estimatedCalories: 200, proteinGrams: 15, carbsGrams: 20, fatGrams: 6 },
      { date: "2026-05-21", estimatedCalories: 600, proteinGrams: 45, carbsGrams: 60, fatGrams: 18 },
    ]);

    expect(result.averageDailyCalories).toBe(600);
  });

  it("returns averageDailyCalories as null when no incidents", () => {
    const result = aggregateNutritionIncidentsWeek([]);
    expect(result.averageDailyCalories).toBeNull();
  });
});
