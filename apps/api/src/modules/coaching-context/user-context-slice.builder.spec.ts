import { describe, expect, it } from "vitest";
import { buildUserContextSliceFromSnapshot } from "./user-context-slice.builder.js";
import type { CoachingContextSnapshot } from "./coaching-context.service.js";

function createSnapshot(overrides: Partial<CoachingContextSnapshot> = {}): CoachingContextSnapshot {
  return {
    user: {
      id: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
      email: "test@example.com",
      displayName: "Test User",
      timezone: "UTC",
      locale: "en",
      onboardingCompletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    profile: null,
    goals: [],
    onboardingCompleted: true,
    coachingHierarchy: {
      direction: null,
      activeQuarterlyGoal: null,
      weeklyFocus: [],
    },
    personalContextSummary: {
      activityLevel: null,
      trainingExperience: null,
      preferences: [],
      constraints: [],
      coachingNotes: [],
    },
    activeWorkoutRevisionId: null,
    activeWorkoutPlanSummary: null,
    activeNutritionRevisionId: null,
    activeHabitRevisionId: null,
    activeHabitPlanSummary: null,
    recentHabitAdherenceSummary: null,
    weeklyProgressSummary: null,
    biomarkerContext: {
      items: [],
      generatedAt: new Date().toISOString(),
    },
    metricsSummary: {
      items: [],
      generatedAt: new Date().toISOString(),
    },
    wellbeingSummary: {
      latestDate: null,
      latestMoodScore: null,
      latestStressScore: null,
      windowDays: 7,
      windowStart: null,
      windowEnd: null,
      checkInCount: 0,
      moodAverage: null,
      stressAverage: null,
      moodTrendDirection: "unknown",
      stressTrendDirection: "unknown",
      currentStreak: 0,
      dataSufficiency: "insufficient",
      generatedAt: new Date().toISOString(),
    },
    recoveryContext: {
      band: "insufficient_data",
      dataSufficiency: "insufficient",
      focusMessage: "Not enough recovery data yet.",
      signals: [],
      date: "2026-05-25",
    },
    ...overrides,
  };
}

const populatedBiomarkerContext = {
  generatedAt: new Date().toISOString(),
  items: [
    {
      biomarkerKey: "ferritin" as const,
      displayLabel: "Ferritin",
      value: 45,
      valueText: null,
      unit: "ng/mL",
      observedAt: "2026-05-20",
      source: "extraction" as const,
    },
  ],
};

describe("buildUserContextSliceFromSnapshot", () => {
  it("excludes biomarker context from general chat slices", () => {
    const slice = buildUserContextSliceFromSnapshot(
      createSnapshot({ biomarkerContext: populatedBiomarkerContext }),
      { purpose: "general_chat" },
    );

    expect(slice.biomarkerContext).toBeUndefined();
  });

  it("excludes biomarker context from nutrition adaptation slices", () => {
    const slice = buildUserContextSliceFromSnapshot(
      createSnapshot({ biomarkerContext: populatedBiomarkerContext }),
      { purpose: "nutrition_adaptation" },
    );

    expect(slice.biomarkerContext).toBeUndefined();
  });

  it("includes the consent-gated biomarker context for health context slices", () => {
    const slice = buildUserContextSliceFromSnapshot(
      createSnapshot({ biomarkerContext: populatedBiomarkerContext }),
      { purpose: "health_context" },
    );

    expect(slice.biomarkerContext?.items).toHaveLength(1);
    expect(slice.biomarkerContext?.items[0]).toMatchObject({
      biomarkerKey: "ferritin",
      displayLabel: "Ferritin",
      source: "extraction",
    });
  });

  it("records biomarker provenance in source refs for health context", () => {
    const slice = buildUserContextSliceFromSnapshot(
      createSnapshot({ biomarkerContext: populatedBiomarkerContext }),
      { purpose: "health_context" },
    );

    expect(slice.sourceRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ domain: "biomarker", label: "Ferritin" }),
      ]),
    );
  });

  it("keeps the biomarker context free of reference ranges and document text", () => {
    const slice = buildUserContextSliceFromSnapshot(
      createSnapshot({ biomarkerContext: populatedBiomarkerContext }),
      { purpose: "health_context" },
    );

    expect(JSON.stringify(slice.biomarkerContext)).not.toMatch(
      /referenceRange|typicalRange|snippet|summary/i,
    );
  });

  it("keeps non-weekly slices free of snapshot placeholders until persistence exists", () => {
    const slice = buildUserContextSliceFromSnapshot(createSnapshot(), {
      purpose: "general_chat",
    });

    expect(slice.snapshots).toEqual([]);
    expect(slice.relevantMemories).toEqual([]);
  });

  it("keeps daily check-in wellbeing summaries free of private notes", () => {
    const slice = buildUserContextSliceFromSnapshot(
      createSnapshot({
        wellbeingSummary: {
          latestDate: "2026-05-25",
          latestMoodScore: 3,
          latestStressScore: 4,
          windowDays: 7,
          windowStart: "2026-05-19",
          windowEnd: "2026-05-25",
          checkInCount: 2,
          moodAverage: 3,
          stressAverage: 3.5,
          moodTrendDirection: "stable",
          stressTrendDirection: "down",
          currentStreak: 1,
          dataSufficiency: "partial",
          generatedAt: new Date().toISOString(),
        },
      }),
      { purpose: "daily_checkin" },
    );

    expect(slice.wellbeingSummary).toBeDefined();
    expect(slice.wellbeingSummary).not.toHaveProperty("note");
    expect(JSON.stringify(slice.wellbeingSummary)).not.toMatch(/private note/i);
  });

  it("keeps recovery context summaries free of numeric readiness scores", () => {
    const slice = buildUserContextSliceFromSnapshot(
      createSnapshot({
        recoveryContext: {
          band: "moderate_load",
          dataSufficiency: "partial",
          focusMessage: "A balanced pace could help you stay consistent.",
          signals: [{ source: "manual_check_in", label: "Fatigue check-in", detail: "Moderate" }],
          date: "2026-05-25",
        },
      }),
      { purpose: "daily_checkin" },
    );

    expect(slice.recoveryContext).toBeDefined();
    expect(slice.recoveryContext).not.toHaveProperty("score");
    expect(slice.recoveryContext).not.toHaveProperty("soreness");
    expect(slice.recoveryContext).not.toHaveProperty("fatigue");
    expect(JSON.stringify(slice.recoveryContext)).not.toMatch(/recovery score/i);
  });

  // -------------------------------------------------------------------------
  // Phase 3 — progress_history_review slice case
  // -------------------------------------------------------------------------

  function createProgressHistorySnapshotOverrides(): Partial<CoachingContextSnapshot> {
    return {
      progressHistory: {
        requestedPeriodDays: 180,
        grantedPeriodDays: 180,
        granularity: "weekly",
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
        planChangeMarkers: [{ isoDate: "2026-05-01", domain: "workout" }],
        dataSufficiency: {
          workout: "partial",
          habits: "partial",
          recovery: "insufficient",
          wellbeing: "partial",
        },
        coveredDays: 42,
        noteCodes: [],
      },
      activeWorkoutPlanSummary: {
        title: "Three day strength base",
        summary: "A simple weekly structure for consistent training.",
        dayCount: 3,
        days: [],
      },
      weeklyProgressSummary: {
        summary: {
          id: "b1000001-0000-4000-8000-000000000099",
          weekStart: "2026-05-19",
          weekEnd: "2026-05-25",
          dataStatus: "partial",
          userMessage: "You completed 2 of 3 planned workouts this week.",
          generatedAt: new Date().toISOString(),
          sourceAggregates: {
            workout: {
              plannedCount: 3,
              completedCount: 2,
              skippedCount: 1,
              adherencePercent: 66.7,
              averageFatigue: 5,
            },
          },
          deferredDomains: [],
        },
        trends: [],
      } as unknown as CoachingContextSnapshot["weeklyProgressSummary"],
    };
  }

  it("populates progressHistory plus a recent baseline for progress_history_review", () => {
    const slice = buildUserContextSliceFromSnapshot(
      createSnapshot(createProgressHistorySnapshotOverrides()),
      { purpose: "progress_history_review" },
    );

    expect(slice.purpose).toBe("progress_history_review");
    expect(slice.depth).toBe("large");
    expect(slice.progressHistory?.granularity).toBe("weekly");
    expect(slice.progressHistory?.buckets).toHaveLength(1);
    expect(slice.progressHistory?.planChangeMarkers).toEqual([
      { isoDate: "2026-05-01", domain: "workout" },
    ]);
    // Baseline contrast: active plan + recent execution + small weekly summary.
    expect(slice.activeWorkoutPlan?.title).toBe("Three day strength base");
    expect(slice.recentWorkoutExecution?.plannedCount).toBe(3);
    expect(slice.weeklyProgress?.weekStart).toBe("2026-05-19");
  });

  it("NEVER sets sensitive fields on progress_history_review slices", () => {
    // documentContext / ragResults no longer exist on the slice type at all
    // post-biomarkers — the raw-document floor is structural, not per-field.
    const slice = buildUserContextSliceFromSnapshot(
      createSnapshot(createProgressHistorySnapshotOverrides()),
      { purpose: "progress_history_review" },
    );

    expect(slice.wellbeingSummary).toBeUndefined();
    expect(slice.recoveryContext).toBeUndefined();
  });

  it("leaves progressHistory undefined when the snapshot did not aggregate (lazy default)", () => {
    const slice = buildUserContextSliceFromSnapshot(createSnapshot(), {
      purpose: "progress_history_review",
    });

    expect(slice.progressHistory).toBeUndefined();
  });
});
