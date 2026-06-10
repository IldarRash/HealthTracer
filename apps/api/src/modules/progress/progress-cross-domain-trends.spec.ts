import { describe, expect, it } from "vitest";
import {
  buildDeferredDomains,
  buildSummaryUserMessage,
  detectCrossDomainTrends,
  detectWorkoutTrends,
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
        adHocCompletedCount: 0,
        plannedCompletedCount: 0,
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
          adHocCompletedCount: 0,
          plannedCompletedCount: 0,
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
          adHocCompletedCount: 0,
          plannedCompletedCount: 0,
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
          adHocCompletedCount: 0,
          plannedCompletedCount: 0,
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

// ---------------------------------------------------------------------------
// C3: buildSummaryUserMessage — planned vs ad-hoc separation
// ---------------------------------------------------------------------------

/**
 * Minimal helpers to build a WorkoutProgressAggregate variant for C3 tests.
 */
function makeWorkoutAggregate(
  override: Partial<{
    plannedCount: number;
    plannedCompletedCount: number;
    adHocCompletedCount: number;
    completedCount: number;
    skippedCount: number;
    adherencePercent: number | null;
  }>,
) {
  return {
    plannedCount: override.plannedCount ?? 0,
    completedCount:
      override.completedCount ??
      (override.plannedCompletedCount ?? 0) + (override.adHocCompletedCount ?? 0),
    skippedCount: override.skippedCount ?? 0,
    adherencePercent: override.adherencePercent ?? null,
    activeDays: (override.plannedCompletedCount ?? 0) + (override.adHocCompletedCount ?? 0),
    sessionIds: [],
    averageFatigue: null,
    exercisePlannedCount: 0,
    exerciseCompletedCount: 0,
    exerciseSkippedCount: 0,
    exerciseAdjustedCount: 0,
    exerciseCompletionPercent: null,
    partialSessionCount: 0,
    adHocCompletedCount: override.adHocCompletedCount ?? 0,
    plannedCompletedCount: override.plannedCompletedCount ?? 0,
  };
}

describe("buildSummaryUserMessage — C3 planned vs ad-hoc narrative", () => {
  it("says 'completed 1 of 1 planned' (NOT 3 of 1) when 1 planned + 2 ad-hoc this week", () => {
    // Bug that C3 fixes: before the fix, completedCount (3) was used instead of plannedCompletedCount (1).
    const message = buildSummaryUserMessage(
      {
        workout: makeWorkoutAggregate({
          plannedCount: 1,
          plannedCompletedCount: 1,
          adHocCompletedCount: 2,
          completedCount: 3,
          skippedCount: 0,
          adherencePercent: 100,
        }),
        today: null,
        nutrition: null,
        habits: null,
        recipes: null,
        recovery: null,
      },
      "partial",
    );

    // Correct narrative: planned completion uses plannedCompletedCount
    expect(message).toContain("1 of 1 planned");
    // Must never say the inflated total (3) as the numerator of planned sessions
    expect(message).not.toMatch(/3 of 1 planned/);
    // Ad-hoc count appears inline via formatWorkoutWeekLabel: "· +2 ad-hoc"
    expect(message).toContain("+2 ad-hoc");
  });

  it("says 'Plus 1 logged ad-hoc activity' (singular) for 1 ad-hoc session", () => {
    const message = buildSummaryUserMessage(
      {
        workout: makeWorkoutAggregate({
          plannedCount: 2,
          plannedCompletedCount: 2,
          adHocCompletedCount: 1,
          adherencePercent: 100,
        }),
        today: null,
        nutrition: null,
        habits: null,
        recipes: null,
        recovery: null,
      },
      "partial",
    );

    // formatWorkoutWeekLabel renders ad-hoc inline: "2 of 2 planned sessions completed · +1 ad-hoc"
    expect(message).toContain("+1 ad-hoc");
  });

  it("omits the ad-hoc sentence when adHocCompletedCount is 0", () => {
    const message = buildSummaryUserMessage(
      {
        workout: makeWorkoutAggregate({
          plannedCount: 2,
          plannedCompletedCount: 2,
          adHocCompletedCount: 0,
          adherencePercent: 100,
        }),
        today: null,
        nutrition: null,
        habits: null,
        recipes: null,
        recovery: null,
      },
      "partial",
    );

    expect(message).not.toMatch(/ad-hoc/);
  });

  it("ad-hoc-only week (plannedCount=0, adHocCompletedCount=2) shows ad-hoc sentence without planned sentence", () => {
    const message = buildSummaryUserMessage(
      {
        workout: makeWorkoutAggregate({
          plannedCount: 0,
          plannedCompletedCount: 0,
          adHocCompletedCount: 2,
          adherencePercent: null,
        }),
        today: null,
        nutrition: null,
        habits: null,
        recipes: null,
        recovery: null,
      },
      "partial",
    );

    // formatWorkoutWeekLabel for ad-hoc-only: "2 ad-hoc activities logged this week"
    expect(message).toContain("2 ad-hoc activities logged this week");
    // No planned-completion fraction when plannedCount = 0
    expect(message).not.toMatch(/\d+ of \d+ planned/);
  });
});

describe("buildSummaryUserMessage — C3 skip-rate positive trend gate", () => {
  it("does NOT fire 'no planned workouts skipped' positive trend for an ad-hoc-only week (plannedCount=0)", () => {
    // An ad-hoc-only week has no planned sessions, so zero skip rate is meaningless.
    // The skip-rate trend must NOT fire its 'up' direction for this case.
    const adHocOnlyAggregate = makeWorkoutAggregate({
      plannedCount: 0,
      plannedCompletedCount: 0,
      adHocCompletedCount: 3,
      skippedCount: 0,
      adherencePercent: null,
    });

    // detectWorkoutTrends gates skip_rate on plannedCount >= 3, so with plannedCount=0
    // no skip_rate trend is emitted at all.
    const trends = detectWorkoutTrends(adHocOnlyAggregate, null, "2026-06-02", "2026-06-08");
    const skipTrend = trends.find((t) => t.trendType === "skip_rate");

    // No skip_rate trend should be emitted when plannedCount=0
    expect(skipTrend).toBeUndefined();
  });

  it("fires skip-rate 'up' positive trend only when plannedCount >= 3 AND plannedCompletedCount > 0", () => {
    // plannedCount=4, plannedCompletedCount=4, skippedCount=0: should fire positive trend.
    const aggregate = makeWorkoutAggregate({
      plannedCount: 4,
      plannedCompletedCount: 4,
      adHocCompletedCount: 1,
      skippedCount: 0,
      adherencePercent: 100,
    });

    const trends = detectWorkoutTrends(aggregate, null, "2026-06-02", "2026-06-08");
    const skipTrend = trends.find((t) => t.trendType === "skip_rate");

    expect(skipTrend?.direction).toBe("up");
    expect(skipTrend?.message).toContain("No planned workouts were marked skipped");
  });

  it("does NOT fire skip-rate 'up' when plannedCompletedCount=0 (all planned but none completed)", () => {
    // plannedCount=4, plannedCompletedCount=0, skippedCount=0: skip rate is 0 but
    // there were no actual completions yet — positive trend must not fire.
    const aggregate = makeWorkoutAggregate({
      plannedCount: 4,
      plannedCompletedCount: 0,
      adHocCompletedCount: 0,
      skippedCount: 0,
      adherencePercent: 0,
    });

    const trends = detectWorkoutTrends(aggregate, null, "2026-06-02", "2026-06-08");
    const skipTrend = trends.find((t) => t.trendType === "skip_rate");

    // Direction should be stable (not up) because no planned sessions were completed
    expect(skipTrend?.direction).not.toBe("up");
  });
});

describe("buildConsistencyTrend supportingAggregate via detectWorkoutTrends — C3 volume invariant", () => {
  it("supportingAggregate carries plannedCompletedCount and adHocCompletedCount separately (not inflated completedCount)", () => {
    // Before C3, supportingAggregate used completedCount which could exceed plannedCount.
    // After C3, it uses plannedCompletedCount + adHocCompletedCount as two separate fields.
    const aggregate = makeWorkoutAggregate({
      plannedCount: 3,
      plannedCompletedCount: 2,
      adHocCompletedCount: 4,  // 4 ad-hoc sessions on top
      skippedCount: 1,
      adherencePercent: 67,
    });

    const trends = detectWorkoutTrends(aggregate, null, "2026-06-02", "2026-06-08");
    const consistencyTrend = trends.find((t) => t.trendType === "consistency");

    expect(consistencyTrend).toBeDefined();

    const supporting = consistencyTrend!.supportingAggregate;

    // Must have both counts separated, NOT a single inflated completedCount
    expect(supporting["plannedCompletedCount"]).toBe(2);
    expect(supporting["adHocCompletedCount"]).toBe(4);

    // The old completedCount (6) must NOT appear as a field that misleads planned-count comparison
    // (it's OK if completedCount exists at all, but it must not replace the two separate fields)
    expect(supporting["plannedCompletedCount"]).not.toBeGreaterThan(
      supporting["plannedCount"] as number,
    );
  });

  it("plannedCompletedCount in supportingAggregate never exceeds plannedCount", () => {
    // This would be the nonsense condition that the old completedCount path could produce.
    const aggregate = makeWorkoutAggregate({
      plannedCount: 2,
      plannedCompletedCount: 2,
      adHocCompletedCount: 5,  // lots of ad-hoc, old path would give completedCount=7
      skippedCount: 0,
      adherencePercent: 100,
    });

    const trends = detectWorkoutTrends(aggregate, null, "2026-06-02", "2026-06-08");
    const consistencyTrend = trends.find((t) => t.trendType === "consistency");

    // plannedCompletedCount (2) must not exceed plannedCount (2)
    expect(consistencyTrend!.supportingAggregate["plannedCompletedCount"]).toBeLessThanOrEqual(
      consistencyTrend!.supportingAggregate["plannedCount"] as number,
    );
  });
});
