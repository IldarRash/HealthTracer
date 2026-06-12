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
    documentContext: {
      items: [],
      generatedAt: new Date().toISOString(),
    },
    documentSignalContext: {
      signals: [],
      generatedAt: new Date().toISOString(),
    },
    correlationInsights: {
      insights: [],
      generatedAt: new Date().toISOString(),
      dataStatus: "insufficient",
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

describe("buildUserContextSliceFromSnapshot", () => {
  it("excludes document context from general chat slices", () => {
    const slice = buildUserContextSliceFromSnapshot(
      createSnapshot({
        documentContext: {
          generatedAt: new Date().toISOString(),
          items: [
            {
              documentId: "d1000001-0000-4000-8000-000000000001",
              summaryId: "a1000001-0000-4000-8000-000000000001",
              documentType: "lab_report",
              title: "Blood panel",
              summarySnippet: "Approved summary only.",
              extractedConstraints: ["Low iron"],
            },
          ],
        },
      }),
      { purpose: "general_chat" },
    );

    expect(slice.documentContext).toBeUndefined();
    expect(slice.ragResults).toBeUndefined();
  });

  it("excludes document context from nutrition adaptation slices", () => {
    const slice = buildUserContextSliceFromSnapshot(
      createSnapshot({
        documentContext: {
          generatedAt: new Date().toISOString(),
          items: [
            {
              documentId: "d1000001-0000-4000-8000-000000000001",
              summaryId: "a1000001-0000-4000-8000-000000000001",
              documentType: "lab_report",
              title: "Blood panel",
              summarySnippet: "Approved summary only.",
              extractedConstraints: ["Low iron"],
            },
          ],
        },
      }),
      { purpose: "nutrition_adaptation" },
    );

    expect(slice.documentContext).toBeUndefined();
    expect(slice.ragResults).toBeUndefined();
  });

  it("excludes document context from health context when includeDocuments is false", () => {
    const slice = buildUserContextSliceFromSnapshot(
      createSnapshot({
        documentContext: {
          generatedAt: new Date().toISOString(),
          items: [
            {
              documentId: "d1000001-0000-4000-8000-000000000001",
              summaryId: "a1000001-0000-4000-8000-000000000001",
              documentType: "lab_report",
              title: "Blood panel",
              summarySnippet: "Approved summary only.",
              extractedConstraints: ["Low iron"],
            },
          ],
        },
      }),
      { purpose: "health_context", includeDocuments: false },
    );

    expect(slice.documentContext).toBeUndefined();
    expect(slice.ragResults).toBeUndefined();
  });

  it("records document and rag provenance in source refs for health context", () => {
    const slice = buildUserContextSliceFromSnapshot(
      createSnapshot({
        documentContext: {
          generatedAt: new Date().toISOString(),
          items: [
            {
              documentId: "d1000001-0000-4000-8000-000000000001",
              summaryId: "a1000001-0000-4000-8000-000000000001",
              documentType: "lab_report",
              title: "Blood panel",
              summarySnippet: "Approved summary only.",
              extractedConstraints: ["Low iron"],
            },
          ],
        },
      }),
      { purpose: "health_context", includeDocuments: true },
    );

    expect(slice.sourceRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ domain: "document", label: "Blood panel" }),
        expect.objectContaining({ domain: "rag", label: "Blood panel" }),
      ]),
    );
  });

  it("keeps non-weekly slices free of snapshot placeholders until persistence exists", () => {
    const slice = buildUserContextSliceFromSnapshot(createSnapshot(), {
      purpose: "general_chat",
    });

    expect(slice.snapshots).toEqual([]);
    expect(slice.relevantMemories).toEqual([]);
  });

  it("includes consent-gated document context for health context slices", () => {
    const slice = buildUserContextSliceFromSnapshot(
      createSnapshot({
        documentContext: {
          generatedAt: new Date().toISOString(),
          items: [
            {
              documentId: "d1000001-0000-4000-8000-000000000001",
              summaryId: "a1000001-0000-4000-8000-000000000001",
              documentType: "lab_report",
              title: "Blood panel",
              summarySnippet: "Approved summary only.",
              extractedConstraints: ["Low iron"],
            },
          ],
        },
      }),
      { purpose: "health_context", includeDocuments: true },
    );

    expect(slice.documentContext?.items).toHaveLength(1);
    expect(slice.ragResults?.[0]?.snippet).toBe("Approved summary only.");
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

  it("NEVER sets sensitive or document fields on progress_history_review slices", () => {
    const slice = buildUserContextSliceFromSnapshot(
      createSnapshot({
        ...createProgressHistorySnapshotOverrides(),
        documentContext: {
          generatedAt: new Date().toISOString(),
          items: [
            {
              documentId: "d1000001-0000-4000-8000-000000000001",
              summaryId: "a1000001-0000-4000-8000-000000000001",
              documentType: "lab_report",
              title: "Blood panel",
              summarySnippet: "Approved summary only.",
              extractedConstraints: ["Low iron"],
            },
          ],
        },
      }),
      { purpose: "progress_history_review", includeDocuments: true },
    );

    expect(slice.wellbeingSummary).toBeUndefined();
    expect(slice.recoveryContext).toBeUndefined();
    expect(slice.documentContext).toBeUndefined();
    expect(slice.ragResults).toBeUndefined();
  });

  it("leaves progressHistory undefined when the snapshot did not aggregate (lazy default)", () => {
    const slice = buildUserContextSliceFromSnapshot(createSnapshot(), {
      purpose: "progress_history_review",
    });

    expect(slice.progressHistory).toBeUndefined();
  });
});
