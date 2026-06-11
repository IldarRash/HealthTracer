import { describe, expect, it } from "vitest";
import {
  clampProgressHistoryLookback,
  MAX_PROGRESS_HISTORY_BUCKETS,
  PROGRESS_HISTORY_BUCKET_CAPS,
  PROGRESS_HISTORY_BUCKET_METRICS,
  PROGRESS_HISTORY_METRIC_LEGEND,
  PROGRESS_HISTORY_MONTHLY_MAX_GRANTED_DAYS,
  progressHistoryReviewSummarySchema,
  resolveProgressHistoryGranularity,
  type ProgressHistoryBucket,
  type ProgressHistoryReviewSummary,
} from "./progress-history.js";

function buildBucket(overrides: Partial<ProgressHistoryBucket> = {}): ProgressHistoryBucket {
  return {
    bucketStart: "2026-05-04",
    workout: {
      plannedCount: 3,
      completedCount: 2,
      skippedCount: 1,
      adherencePercent: 67,
      activeDays: 2,
      avgFatigue: 6.5,
    },
    habits: { adherencePercent: 80 },
    recovery: {
      wellSupportedDays: 2,
      moderateLoadDays: 3,
      prioritizeRecoveryDays: 1,
      insufficientDataDays: 1,
    },
    wellbeing: { avgMoodScore: 3.5, avgStressScore: 2.5, checkInCount: 4 },
    ...overrides,
  };
}

function buildSummary(
  overrides: Partial<ProgressHistoryReviewSummary> = {},
): ProgressHistoryReviewSummary {
  return {
    requestedPeriodDays: 180,
    grantedPeriodDays: 180,
    granularity: "weekly",
    buckets: [buildBucket()],
    planChangeMarkers: [{ isoDate: "2026-05-10", domain: "workout" }],
    dataSufficiency: {
      workout: "sufficient",
      habits: "partial",
      recovery: "insufficient",
      wellbeing: "partial",
    },
    coveredDays: 42,
    noteCodes: ["sparse_recovery_data"],
    ...overrides,
  };
}

describe("progressHistoryReviewSummarySchema", () => {
  it("accepts a valid numeric-only summary", () => {
    const parsed = progressHistoryReviewSummarySchema.safeParse(buildSummary());

    expect(parsed.success).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Structural free-text rejection — the core safety invariant.
  // -------------------------------------------------------------------------

  it("rejects any extra free-text property at the root (strict)", () => {
    const parsed = progressHistoryReviewSummarySchema.safeParse({
      ...buildSummary(),
      coachNote: "patient shows symptoms of overtraining",
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects extra free-text properties inside a bucket (strict)", () => {
    const bucket = {
      ...buildBucket(),
      note: "felt terrible all week",
    };
    const parsed = progressHistoryReviewSummarySchema.safeParse(
      buildSummary({ buckets: [bucket as ProgressHistoryBucket] }),
    );

    expect(parsed.success).toBe(false);
  });

  it("rejects extra free-text properties inside nested workout/wellbeing objects (strict)", () => {
    const bucket = buildBucket();
    const withWorkoutText = {
      ...bucket,
      workout: { ...bucket.workout, summaryText: "great week" },
    };
    const withWellbeingText = {
      ...bucket,
      wellbeing: { ...bucket.wellbeing, journalEntry: "private note" },
    };

    expect(
      progressHistoryReviewSummarySchema.safeParse(
        buildSummary({ buckets: [withWorkoutText as unknown as ProgressHistoryBucket] }),
      ).success,
    ).toBe(false);
    expect(
      progressHistoryReviewSummarySchema.safeParse(
        buildSummary({ buckets: [withWellbeingText as unknown as ProgressHistoryBucket] }),
      ).success,
    ).toBe(false);
  });

  it("rejects a string where a number is expected", () => {
    const bucket = buildBucket();
    const tampered = {
      ...bucket,
      workout: { ...bucket.workout, avgFatigue: "very tired" },
    };
    const parsed = progressHistoryReviewSummarySchema.safeParse(
      buildSummary({ buckets: [tampered as unknown as ProgressHistoryBucket] }),
    );

    expect(parsed.success).toBe(false);
  });

  it("rejects free text in ISO-date fields (regex-constrained strings only)", () => {
    expect(
      progressHistoryReviewSummarySchema.safeParse(
        buildSummary({ buckets: [buildBucket({ bucketStart: "last Monday" })] }),
      ).success,
    ).toBe(false);
    expect(
      progressHistoryReviewSummarySchema.safeParse(
        buildSummary({
          planChangeMarkers: [
            { isoDate: "around mid-May", domain: "workout" } as never,
          ],
        }),
      ).success,
    ).toBe(false);
  });

  it("rejects free text in enum fields (noteCodes, granularity, sufficiency, marker domain)", () => {
    expect(
      progressHistoryReviewSummarySchema.safeParse(
        buildSummary({ noteCodes: ["user seems depressed"] as never }),
      ).success,
    ).toBe(false);
    expect(
      progressHistoryReviewSummarySchema.safeParse(
        buildSummary({ granularity: "narrative" as never }),
      ).success,
    ).toBe(false);
    expect(
      progressHistoryReviewSummarySchema.safeParse(
        buildSummary({
          dataSufficiency: {
            workout: "mostly fine",
            habits: "partial",
            recovery: "partial",
            wellbeing: "partial",
          } as never,
        }),
      ).success,
    ).toBe(false);
    expect(
      progressHistoryReviewSummarySchema.safeParse(
        buildSummary({
          planChangeMarkers: [{ isoDate: "2026-05-10", domain: "medical" }] as never,
        }),
      ).success,
    ).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Caps
  // -------------------------------------------------------------------------

  it("enforces the absolute bucket array cap of 31", () => {
    const buckets = Array.from({ length: MAX_PROGRESS_HISTORY_BUCKETS + 1 }, () => buildBucket());
    const parsed = progressHistoryReviewSummarySchema.safeParse(
      buildSummary({ granularity: "daily", buckets }),
    );

    expect(parsed.success).toBe(false);
  });

  it("enforces per-granularity bucket caps (weekly 26, monthly 24)", () => {
    const weeklyOver = Array.from({ length: 27 }, () => buildBucket());
    const monthlyOver = Array.from({ length: 25 }, () => buildBucket());

    expect(
      progressHistoryReviewSummarySchema.safeParse(
        buildSummary({ granularity: "weekly", buckets: weeklyOver }),
      ).success,
    ).toBe(false);
    expect(
      progressHistoryReviewSummarySchema.safeParse(
        buildSummary({ granularity: "monthly", buckets: monthlyOver }),
      ).success,
    ).toBe(false);
  });

  it("enforces the plan-change marker cap of 20", () => {
    const markers = Array.from({ length: 21 }, (_, i) => ({
      isoDate: `2026-05-${String((i % 28) + 1).padStart(2, "0")}`,
      domain: "workout" as const,
    }));
    const parsed = progressHistoryReviewSummarySchema.safeParse(
      buildSummary({ planChangeMarkers: markers }),
    );

    expect(parsed.success).toBe(false);
  });
});

describe("resolveProgressHistoryGranularity", () => {
  it.each([
    [1, "daily"],
    [7, "daily"],
    [14, "daily"],
    [15, "weekly"],
    [30, "weekly"],
    [90, "weekly"],
    [182, "weekly"],
    [183, "monthly"],
    [365, "monthly"],
    [9999, "monthly"],
  ] as const)("%d days → %s", (requestedDays, expected) => {
    expect(resolveProgressHistoryGranularity(requestedDays)).toBe(expected);
  });

  it("normalizes non-finite and sub-1 inputs to daily", () => {
    expect(resolveProgressHistoryGranularity(0)).toBe("daily");
    expect(resolveProgressHistoryGranularity(-5)).toBe("daily");
    expect(resolveProgressHistoryGranularity(Number.NaN)).toBe("daily");
  });
});

describe("clampProgressHistoryLookback", () => {
  it.each([
    [7, "daily", 7, 31, false],
    [14, "daily", 14, 31, false],
    [60, "weekly", 60, 26, false],
    [182, "weekly", 182, 26, false],
    [365, "monthly", 365, 24, false],
    [731, "monthly", 731, 24, false],
    [9999, "monthly", PROGRESS_HISTORY_MONTHLY_MAX_GRANTED_DAYS, 24, true],
  ] as const)(
    "%d days → %s, granted %d, cap %d, clamped %s",
    (requestedDays, granularity, grantedPeriodDays, bucketCap, clamped) => {
      expect(clampProgressHistoryLookback(requestedDays)).toEqual({
        granularity,
        grantedPeriodDays,
        bucketCap,
        clamped,
      });
    },
  );

  it("bucket caps match the published ladder constants", () => {
    expect(PROGRESS_HISTORY_BUCKET_CAPS).toEqual({ daily: 31, weekly: 26, monthly: 24 });
  });
});

describe("PROGRESS_HISTORY_METRIC_LEGEND", () => {
  it("has a non-empty EN and RU one-liner for every bucket metric", () => {
    for (const metric of PROGRESS_HISTORY_BUCKET_METRICS) {
      expect(PROGRESS_HISTORY_METRIC_LEGEND.en[metric]?.length).toBeGreaterThan(0);
      expect(PROGRESS_HISTORY_METRIC_LEGEND.ru[metric]?.length).toBeGreaterThan(0);
    }
  });
});
