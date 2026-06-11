import { describe, expect, it, vi } from "vitest";
import { ProgressHistoryAggregateService } from "./progress-history-aggregate.service.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";

interface SessionRow {
  plannedDate: string;
  status: string;
  source: string;
  completionFatigue: number | null;
}

function sessionRow(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    plannedDate: "2026-03-02",
    status: "completed",
    source: "planned",
    completionFatigue: null,
    ...overrides,
  };
}

function createMocks(data?: {
  sessions?: SessionRow[];
  habitRows?: Array<{ date: string; status: string }>;
  recoveryRows?: Array<{
    date: string;
    soreness: number;
    fatigue: number;
    moodScore: number | null;
    perceivedStress: number | null;
  }>;
  wellbeingRows?: Array<{ date: string; moodScore: number; stressScore: number }>;
  workoutRevisionDates?: Date[];
  nutritionRevisionDates?: Date[];
}) {
  const workoutsRepository = {
    listSessionExecutionRowsByUserIdInDateRange: vi.fn(async () => data?.sessions ?? []),
    listRevisionCreatedAtByUserId: vi.fn(async () => data?.workoutRevisionDates ?? []),
    // Wide methods present so we can assert they are never used by this service.
    listSessionsByUserIdInDateRange: vi.fn(async () => []),
    listRevisionsByUserId: vi.fn(async () => []),
  };
  const nutritionRepository = {
    listRevisionCreatedAtByUserId: vi.fn(async () => data?.nutritionRevisionDates ?? []),
    listRevisionsByUserId: vi.fn(async () => []),
  };
  const habitsRepository = {
    listCompletionsInDateRange: vi.fn(async () => data?.habitRows ?? []),
  };
  const recoveryCheckInsRepository = {
    listByUserAndDateRange: vi.fn(async () => data?.recoveryRows ?? []),
  };
  const wellbeingCheckInsRepository = {
    listScoreRowsByUserAndDateRange: vi.fn(async () => data?.wellbeingRows ?? []),
    // Wide method (selects note/tags) must never be used for review aggregates.
    listByUserAndDateRange: vi.fn(async () => []),
  };
  const usersService = {
    resolveFromAuth: vi.fn(async () => ({ id: USER_ID, timezone: "UTC" })),
  };

  const service = new ProgressHistoryAggregateService(
    workoutsRepository as never,
    nutritionRepository as never,
    habitsRepository as never,
    recoveryCheckInsRepository as never,
    wellbeingCheckInsRepository as never,
    usersService as never,
  );

  return {
    service,
    workoutsRepository,
    nutritionRepository,
    habitsRepository,
    recoveryCheckInsRepository,
    wellbeingCheckInsRepository,
    usersService,
  };
}

// Fixed reference time: 2026-03-15 (a Sunday) at noon UTC.
const NOW = new Date("2026-03-15T12:00:00Z");

describe("ProgressHistoryAggregateService", () => {
  // ---------------------------------------------------------------------------
  // Granularity + bucketing
  // ---------------------------------------------------------------------------

  it("builds daily buckets covering exactly the granted window", async () => {
    const { service, workoutsRepository } = createMocks();

    const summary = await service.buildReviewSummary(USER_ID, 7, NOW);

    expect(summary.granularity).toBe("daily");
    expect(summary.grantedPeriodDays).toBe(7);
    expect(summary.buckets).toHaveLength(7);
    expect(summary.buckets[0]?.bucketStart).toBe("2026-03-09");
    expect(summary.buckets[6]?.bucketStart).toBe("2026-03-15");
    expect(workoutsRepository.listSessionExecutionRowsByUserIdInDateRange).toHaveBeenCalledWith(
      USER_ID,
      "2026-03-09",
      "2026-03-15",
    );
  });

  it("buckets weekly across a month boundary using Monday-start ISO weeks", async () => {
    // The Monday week 2026-02-23..2026-03-01 spans February into March:
    // 2026-02-28 (Sat) and 2026-03-01 (Sun) share a bucket; 2026-03-02 (Mon)
    // starts the next one.
    const { service } = createMocks({
      sessions: [
        sessionRow({ plannedDate: "2026-02-28" }),
        sessionRow({ plannedDate: "2026-03-01" }),
        sessionRow({ plannedDate: "2026-03-02" }),
      ],
    });

    const summary = await service.buildReviewSummary(USER_ID, 30, NOW);

    expect(summary.granularity).toBe("weekly");

    const boundaryBucket = summary.buckets.find((b) => b.bucketStart === "2026-02-23");
    const nextBucket = summary.buckets.find((b) => b.bucketStart === "2026-03-02");

    expect(boundaryBucket?.workout.completedCount).toBe(2);
    expect(nextBucket?.workout.completedCount).toBe(1);
  });

  it("clamps a 9999-day request to monthly granularity with the 24-bucket cap", async () => {
    const { service } = createMocks();

    const summary = await service.buildReviewSummary(USER_ID, 9999, NOW);

    expect(summary.granularity).toBe("monthly");
    expect(summary.requestedPeriodDays).toBe(9999);
    expect(summary.grantedPeriodDays).toBe(731);
    expect(summary.noteCodes).toContain("lookback_clamped");
    expect(summary.buckets.length).toBeLessThanOrEqual(24);
    // Oldest-first trim: every bucket is a calendar month start, newest kept.
    expect(summary.buckets.every((b) => b.bucketStart.endsWith("-01"))).toBe(true);
    expect(summary.buckets.at(-1)?.bucketStart).toBe("2026-03-01");
  });

  // ---------------------------------------------------------------------------
  // Workout aggregation
  // ---------------------------------------------------------------------------

  it("aggregates workout counts, adherence, active days, and avg fatigue per bucket", async () => {
    const { service } = createMocks({
      sessions: [
        sessionRow({ plannedDate: "2026-03-09", status: "completed", completionFatigue: 6 }),
        sessionRow({ plannedDate: "2026-03-10", status: "completed", completionFatigue: 7 }),
        sessionRow({ plannedDate: "2026-03-11", status: "skipped" }),
        // Ad-hoc completion counts toward completed/activeDays but not adherence.
        sessionRow({ plannedDate: "2026-03-12", source: "ad_hoc", completionFatigue: null }),
        // Planned-but-not-completed fatigue must not leak into the average.
        sessionRow({ plannedDate: "2026-03-13", status: "planned", completionFatigue: 9 }),
      ],
    });

    // 30 days → weekly buckets; 2026-03-09 is a Monday, so 03-09..03-13 share a bucket.
    const summary = await service.buildReviewSummary(USER_ID, 30, NOW);
    const totals = summary.buckets.reduce(
      (acc, bucket) => ({
        planned: acc.planned + bucket.workout.plannedCount,
        completed: acc.completed + bucket.workout.completedCount,
        skipped: acc.skipped + bucket.workout.skippedCount,
      }),
      { planned: 0, completed: 0, skipped: 0 },
    );

    expect(totals).toEqual({ planned: 4, completed: 3, skipped: 1 });

    const fatigueBucket = summary.buckets.find((b) => b.bucketStart === "2026-03-09");
    expect(fatigueBucket?.workout.avgFatigue).toBe(6.5);

    const emptyBucket = summary.buckets.find((b) => b.bucketStart === "2026-03-02");
    expect(emptyBucket?.workout.adherencePercent).toBeNull();
    expect(emptyBucket?.workout.avgFatigue).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Habit / recovery / wellbeing aggregation
  // ---------------------------------------------------------------------------

  it("computes habit adherence from logged outcomes, excluding pending rows", async () => {
    const { service } = createMocks({
      habitRows: [
        { date: "2026-03-10", status: "completed" },
        { date: "2026-03-11", status: "completed" },
        { date: "2026-03-12", status: "completed" },
        { date: "2026-03-13", status: "skipped" },
        { date: "2026-03-14", status: "pending" },
      ],
    });

    const summary = await service.buildReviewSummary(USER_ID, 7, NOW);
    const adherenceValues = summary.buckets
      .map((b) => b.habits.adherencePercent)
      .filter((value): value is number => value !== null);

    // Daily buckets: 3 completed-only days at 100%, one skipped-only day at 0%.
    expect(adherenceValues).toEqual([100, 100, 100, 0]);
  });

  it("maps recovery check-in scores to readiness band counts via the shared band helper", async () => {
    const { service } = createMocks({
      recoveryRows: [
        // High load → prioritize_recovery.
        { date: "2026-03-10", soreness: 5, fatigue: 5, moodScore: null, perceivedStress: null },
        // Strong recovery, low load → well_supported.
        { date: "2026-03-11", soreness: 1, fatigue: 1, moodScore: 5, perceivedStress: null },
        // Mid signals → moderate_load.
        { date: "2026-03-12", soreness: 3, fatigue: 3, moodScore: null, perceivedStress: null },
      ],
    });

    const summary = await service.buildReviewSummary(USER_ID, 7, NOW);
    const totals = summary.buckets.reduce(
      (acc, bucket) => ({
        wellSupported: acc.wellSupported + bucket.recovery.wellSupportedDays,
        moderate: acc.moderate + bucket.recovery.moderateLoadDays,
        prioritize: acc.prioritize + bucket.recovery.prioritizeRecoveryDays,
      }),
      { wellSupported: 0, moderate: 0, prioritize: 0 },
    );

    expect(totals).toEqual({ wellSupported: 1, moderate: 1, prioritize: 1 });
  });

  it("averages wellbeing mood/stress scores per bucket", async () => {
    const { service } = createMocks({
      wellbeingRows: [
        { date: "2026-03-14", moodScore: 4, stressScore: 2 },
        { date: "2026-03-15", moodScore: 3, stressScore: 3 },
      ],
    });

    const summary = await service.buildReviewSummary(USER_ID, 7, NOW);
    const checkInTotal = summary.buckets.reduce(
      (acc, bucket) => acc + bucket.wellbeing.checkInCount,
      0,
    );
    const lastBucket = summary.buckets.at(-1);

    expect(checkInTotal).toBe(2);
    expect(lastBucket?.wellbeing.avgMoodScore).toBe(3);
    expect(lastBucket?.wellbeing.avgStressScore).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // Data sufficiency + note codes
  // ---------------------------------------------------------------------------

  it("marks sparse domains insufficient and emits the matching note codes", async () => {
    // 30-day window with two recovery days (2/30 < 20%) and nothing else.
    const { service } = createMocks({
      recoveryRows: [
        { date: "2026-03-10", soreness: 3, fatigue: 3, moodScore: null, perceivedStress: null },
        { date: "2026-03-11", soreness: 2, fatigue: 2, moodScore: null, perceivedStress: null },
      ],
    });

    const summary = await service.buildReviewSummary(USER_ID, 30, NOW);

    expect(summary.dataSufficiency).toEqual({
      workout: "insufficient",
      habits: "insufficient",
      recovery: "insufficient",
      wellbeing: "insufficient",
    });
    expect(summary.noteCodes).toContain("no_workout_data");
    expect(summary.noteCodes).toContain("sparse_recovery_data");
    expect(summary.noteCodes).toContain("sparse_wellbeing_data");
    expect(summary.coveredDays).toBe(2);
  });

  it("grades coverage as sufficient (≥60%) and partial (≥20%) per domain", async () => {
    const sessions = Array.from({ length: 5 }, (_, i) =>
      sessionRow({ plannedDate: `2026-03-${String(9 + i).padStart(2, "0")}` }),
    );

    const { service } = createMocks({
      sessions, // 5 of 7 days ≈ 71% → sufficient
      wellbeingRows: [{ date: "2026-03-14", moodScore: 3, stressScore: 3 }], // 1/7 ≈ 14% → insufficient
      habitRows: [
        { date: "2026-03-13", status: "completed" },
        { date: "2026-03-14", status: "completed" },
      ], // 2/7 ≈ 29% → partial
    });

    const summary = await service.buildReviewSummary(USER_ID, 7, NOW);

    expect(summary.dataSufficiency.workout).toBe("sufficient");
    expect(summary.dataSufficiency.habits).toBe("partial");
    expect(summary.dataSufficiency.wellbeing).toBe("insufficient");
    expect(summary.noteCodes).not.toContain("no_workout_data");
  });

  // ---------------------------------------------------------------------------
  // Plan-change markers
  // ---------------------------------------------------------------------------

  it("builds deduped, range-filtered plan-change markers from revision timestamps", async () => {
    const { service } = createMocks({
      workoutRevisionDates: [
        new Date("2026-03-10T08:00:00Z"),
        new Date("2026-03-10T19:00:00Z"), // same day → deduped
        new Date("2025-01-01T00:00:00Z"), // outside the window → dropped
      ],
      nutritionRevisionDates: [new Date("2026-03-12T10:00:00Z")],
    });

    const summary = await service.buildReviewSummary(USER_ID, 30, NOW);

    expect(summary.planChangeMarkers).toEqual([
      { isoDate: "2026-03-10", domain: "workout" },
      { isoDate: "2026-03-12", domain: "nutrition" },
    ]);
  });

  // ---------------------------------------------------------------------------
  // Privacy: numeric-only projections
  // ---------------------------------------------------------------------------

  it("queries only the narrow numeric projections — never wide rows with note/free-text columns", async () => {
    const mocks = createMocks({
      sessions: [sessionRow()],
      wellbeingRows: [{ date: "2026-03-14", moodScore: 3, stressScore: 3 }],
    });

    await mocks.service.buildReviewSummary(USER_ID, 30, NOW);

    // Narrow projections used:
    expect(mocks.workoutsRepository.listSessionExecutionRowsByUserIdInDateRange).toHaveBeenCalled();
    expect(mocks.wellbeingCheckInsRepository.listScoreRowsByUserAndDateRange).toHaveBeenCalled();
    expect(mocks.workoutsRepository.listRevisionCreatedAtByUserId).toHaveBeenCalled();
    expect(mocks.nutritionRepository.listRevisionCreatedAtByUserId).toHaveBeenCalled();

    // Wide selects (note/tags/feedback-notes/payloads) never touched:
    expect(mocks.workoutsRepository.listSessionsByUserIdInDateRange).not.toHaveBeenCalled();
    expect(mocks.wellbeingCheckInsRepository.listByUserAndDateRange).not.toHaveBeenCalled();
    expect(mocks.workoutsRepository.listRevisionsByUserId).not.toHaveBeenCalled();
    expect(mocks.nutritionRepository.listRevisionsByUserId).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Auth wrapper
  // ---------------------------------------------------------------------------

  it("buildReviewSummaryForAuth resolves the user and aggregates for that user id", async () => {
    const mocks = createMocks();
    const auth = { clerkUserId: "clerk-1", email: "t@example.com", displayName: "T" };

    const summary = await mocks.service.buildReviewSummaryForAuth(auth as never, 30);

    expect(mocks.usersService.resolveFromAuth).toHaveBeenCalledWith(auth);
    expect(mocks.habitsRepository.listCompletionsInDateRange).toHaveBeenCalledWith(
      USER_ID,
      expect.any(String),
      expect.any(String),
    );
    expect(summary.granularity).toBe("weekly");
  });
});
