import { describe, expect, it } from "vitest";
import {
  buildDeferredDomains,
  buildSummaryUserMessage,
  detectCrossDomainTrends,
  isWellnessSafeProgressMessage,
  resolveProgressDataStatus,
} from "./progress-aggregate.service.js";

describe("cross-domain progress aggregate service", () => {
  it("marks cross-domain summaries sufficient when two domains are strong", () => {
    const aggregates = {
      workout: {
        plannedCount: 3,
        completedCount: 2,
        skippedCount: 1,
        adherencePercent: 67,
        activeDays: 2,
        sessionIds: [],
        averageFatigue: null,
        exercisePlannedCount: 0,
        exerciseCompletedCount: 0,
        exerciseSkippedCount: 0,
        exerciseAdjustedCount: 0,
        exerciseCompletionPercent: null,
        partialSessionCount: 0,
      },
      today: {
        daysWithChecklist: 4,
        averageAdherencePercent: 75,
        completedRequiredItems: 6,
        totalRequiredItems: 8,
        habitItemCompletionPercent: 70,
        dataSufficiency: "sufficient" as const,
        message: "Today checklists were logged on 4 days.",
      },
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
        dominantBand: "moderate_load" as const,
        dataSufficiency: "partial" as const,
        message: "Recovery entries were logged on 3 days.",
      },
    };

    expect(resolveProgressDataStatus(aggregates)).toBe("sufficient");
    expect(buildDeferredDomains(aggregates).map((entry) => entry.domain)).toEqual([
      "nutrition",
      "recipes",
    ]);
  });

  it("generates cross-domain trends with wellness-safe fallback copy", () => {
    const trends = detectCrossDomainTrends(
      {
        workout: {
          plannedCount: 3,
          completedCount: 2,
          skippedCount: 1,
          adherencePercent: 67,
          activeDays: 2,
          sessionIds: [],
          averageFatigue: null,
          exercisePlannedCount: 0,
          exerciseCompletedCount: 0,
          exerciseSkippedCount: 0,
          exerciseAdjustedCount: 0,
          exerciseCompletionPercent: null,
          partialSessionCount: 0,
        },
        today: {
          daysWithChecklist: 4,
          averageAdherencePercent: 75,
          completedRequiredItems: 6,
          totalRequiredItems: 8,
          habitItemCompletionPercent: 70,
          dataSufficiency: "sufficient",
          message: "Today checklists were logged on 4 days.",
        },
        nutrition: {
          hasActivePlan: true,
          daysWithAdherenceLogged: 4,
          averageTargetCompletionPercent: 80,
          dataSufficiency: "sufficient",
          message: "Nutrition adherence was logged on 4 days.",
        },
        habits: {
          activeHabitCount: 2,
          scheduledDays: 4,
          completedCount: 3,
          missedCount: 1,
          skippedCount: 0,
          adherencePercent: 75,
          dataSufficiency: "sufficient",
          message: "Habit completions were tracked across 4 days.",
        },
        recipes: null,
        recovery: {
          daysWithContext: 3,
          checkInCount: 2,
          bandCounts: {
            well_supported: 2,
            moderate_load: 1,
            prioritize_recovery: 0,
            insufficient_data: 4,
          },
          dominantBand: "well_supported",
          dataSufficiency: "partial",
          message: "Recovery entries were logged on 3 days.",
        },
      },
      "2026-05-18",
      "2026-05-24",
    );

    expect(trends.some((trend) => trend.trendType === "cross_domain_execution")).toBe(true);
    expect(trends.some((trend) => trend.trendType === "habit_consistency")).toBe(true);
    expect(trends.some((trend) => trend.trendType === "recovery_load_balance")).toBe(true);

    for (const trend of trends) {
      expect(isWellnessSafeProgressMessage(trend.message)).toBe(true);
    }
  });

  it("builds a cross-domain summary message that separates observations from adaptations", () => {
    const message = buildSummaryUserMessage(
      {
        workout: {
          plannedCount: 2,
          completedCount: 2,
          skippedCount: 0,
          adherencePercent: 100,
          activeDays: 2,
          sessionIds: [],
          averageFatigue: null,
          exercisePlannedCount: 0,
          exerciseCompletedCount: 0,
          exerciseSkippedCount: 0,
          exerciseAdjustedCount: 0,
          exerciseCompletionPercent: null,
          partialSessionCount: 0,
        },
        today: null,
        nutrition: null,
        habits: null,
        recipes: null,
        recovery: null,
      },
      "partial",
    );

    expect(message).toContain("approval");
    expect(isWellnessSafeProgressMessage(message)).toBe(true);
    expect(message.toLowerCase()).not.toContain("diagnosis");
  });

  it("returns insufficient cross-domain execution trend when fewer than two domains are sufficient", () => {
    const trends = detectCrossDomainTrends(
      {
        workout: {
          plannedCount: 3,
          completedCount: 2,
          skippedCount: 1,
          adherencePercent: 67,
          activeDays: 2,
          sessionIds: [],
          averageFatigue: null,
          exercisePlannedCount: 0,
          exerciseCompletedCount: 0,
          exerciseSkippedCount: 0,
          exerciseAdjustedCount: 0,
          exerciseCompletionPercent: null,
          partialSessionCount: 0,
        },
        today: null,
        nutrition: null,
        habits: null,
        recipes: null,
        recovery: null,
      },
      "2026-05-18",
      "2026-05-24",
    );

    const crossDomainTrend = trends.find((trend) => trend.trendType === "cross_domain_execution");

    expect(crossDomainTrend?.dataSufficiency).toBe("insufficient");
    expect(crossDomainTrend?.message).toContain("Not enough cross-domain data");
    for (const trend of trends) {
      expect(isWellnessSafeProgressMessage(trend.message)).toBe(true);
    }
  });
});
