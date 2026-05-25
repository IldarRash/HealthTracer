import { describe, expect, it } from "vitest";
import {
  deferredDomainAvailabilityLabel,
  formatWeekRange,
  isProgressSummaryNotFoundError,
  PROGRESS_PLAN_CHANGE_NOTICE,
  progressDataStatusLabel,
  progressDomainLabel,
  SAFE_WELLNESS_DISPLAY_FALLBACK,
  sanitizeWellnessDisplayText,
  shouldShowLatestSummarySection,
  sortTrendObservations,
  summarizeDeferredDomains,
  summarizeWorkoutAggregate,
  trendDataSufficiencyLabel,
  trendDirectionLabel,
  trendTypeLabel,
} from "./progress-ui-state.js";

describe("progress UI state", () => {
  it("detects missing weekly summary API errors", () => {
    expect(isProgressSummaryNotFoundError("Weekly progress summary not found.")).toBe(true);
    expect(isProgressSummaryNotFoundError("/progress/weekly/latest returned 404")).toBe(true);
    expect(isProgressSummaryNotFoundError("upstream failed")).toBe(false);
  });

  it("labels partial and insufficient data states", () => {
    expect(progressDataStatusLabel("partial")).toContain("Partial");
    expect(progressDataStatusLabel("partial")).toContain("cross-domain");
    expect(progressDataStatusLabel("insufficient")).toContain("Not enough");
  });

  it("summarizes workout aggregates with wellness-safe copy", () => {
    expect(summarizeWorkoutAggregate(null).headline).toContain("No planned workout sessions");

    expect(
      summarizeWorkoutAggregate({
        plannedCount: 3,
        completedCount: 2,
        skippedCount: 1,
        adherencePercent: 67,
        activeDays: 2,
        sessionIds: ["78d40655-b4b5-47b3-b28e-470192e05f04"],
        averageFatigue: 6,
        exercisePlannedCount: 0,
        exerciseCompletedCount: 0,
        exerciseSkippedCount: 0,
        exerciseAdjustedCount: 0,
        exerciseCompletionPercent: null,
        partialSessionCount: 0,
      }).headline,
    ).toBe("2 of 3 sessions completed");
  });

  it("includes exercise completion and partial session counts in workout detail", () => {
    const summary = summarizeWorkoutAggregate({
      plannedCount: 2,
      completedCount: 1,
      skippedCount: 0,
      adherencePercent: 50,
      activeDays: 1,
      sessionIds: ["78d40655-b4b5-47b3-b28e-470192e05f04"],
      averageFatigue: null,
      exercisePlannedCount: 8,
      exerciseCompletedCount: 6,
      exerciseSkippedCount: 1,
      exerciseAdjustedCount: 1,
      exerciseCompletionPercent: 75,
      partialSessionCount: 1,
    });

    expect(summary.detail).toContain("75% exercises completed");
    expect(summary.detail).toContain("1 partial session");
  });

  it("marks deferred domains as unavailable rather than hidden", () => {
    expect(deferredDomainAvailabilityLabel("recipes")).toContain("Deferred");
    expect(deferredDomainAvailabilityLabel("nutrition")).toContain("Deferred");
    expect(progressDomainLabel("recovery")).toBe("Recovery");
  });

  it("shows a separate latest section only when it differs from current week", () => {
    const current = {
      id: "14a08176-64a7-4a2d-8a44-581807368394",
    } as const;
    const latestSame = {
      id: "14a08176-64a7-4a2d-8a44-581807368394",
    } as const;
    const latestDifferent = {
      id: "24b19287-75b8-4a3e-9c10-691908479405",
    } as const;

    expect(shouldShowLatestSummarySection(null, latestDifferent as never)).toBe(false);
    expect(shouldShowLatestSummarySection(current as never, null)).toBe(false);
    expect(shouldShowLatestSummarySection(current as never, latestSame as never)).toBe(false);
    expect(shouldShowLatestSummarySection(current as never, latestDifferent as never)).toBe(
      true,
    );
  });

  it("formats week ranges and trend labels for cards", () => {
    expect(formatWeekRange("2026-05-18", "2026-05-24")).toContain("2026");
    expect(trendTypeLabel("completion_rate")).toBe("Completion rate");
    expect(trendDirectionLabel("up")).toBe("Trending up");
    expect(trendDataSufficiencyLabel("insufficient")).toBe("Not enough data");
  });

  it("keeps proposal-safe plan change copy visible on the progress surface", () => {
    expect(PROGRESS_PLAN_CHANGE_NOTICE).toContain("proposal");
    expect(PROGRESS_PLAN_CHANGE_NOTICE.toLowerCase()).not.toContain("automatically");
  });

  it("sorts trend cards in a stable display order", () => {
    const sorted = sortTrendObservations([
      {
        id: "24b19287-75b8-4a3e-9c10-691908479405",
        userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
        summaryId: "14a08176-64a7-4a2d-8a44-581807368394",
        weekStart: "2026-05-18",
        weekEnd: "2026-05-24",
        domain: "workout",
        trendType: "skip_rate",
        direction: "stable",
        dataSufficiency: "partial",
        supportingAggregate: {},
        message: "Skipped sessions were limited this week.",
        createdAt: "2026-05-22T12:00:00.000Z",
      },
      {
        id: "34c29398-86c9-5b4f-ad21-7a2919585046",
        userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
        summaryId: "14a08176-64a7-4a2d-8a44-581807368394",
        weekStart: "2026-05-18",
        weekEnd: "2026-05-24",
        domain: "workout",
        trendType: "completion_rate",
        direction: "up",
        dataSufficiency: "partial",
        supportingAggregate: {},
        message: "You completed a higher share of planned workouts this week.",
        createdAt: "2026-05-22T12:00:00.000Z",
      },
    ]);

    expect(sorted.map((trend) => trend.trendType)).toEqual(["completion_rate", "skip_rate"]);
  });

  it("summarizes deferred domain messages without hiding missing domains", () => {
    expect(summarizeDeferredDomains([])).toContain("All supported domains");
    expect(
      summarizeDeferredDomains([
        {
          domain: "nutrition",
          reason: "adherence_not_included",
          message: "Nutrition adherence is not included in this weekly summary yet.",
        },
      ]),
    ).toContain("Nutrition adherence");
  });

  it("replaces forbidden wellness display terms with safe fallback copy", () => {
    expect(sanitizeWellnessDisplayText("Your readiness score dropped this week.")).toBe(
      SAFE_WELLNESS_DISPLAY_FALLBACK,
    );
    expect(sanitizeWellnessDisplayText("Workout consistency improved this week.")).toBe(
      "Workout consistency improved this week.",
    );
  });
});
