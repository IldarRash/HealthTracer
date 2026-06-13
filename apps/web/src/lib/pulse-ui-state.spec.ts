import { describe, expect, it } from "vitest";
import type {
  PulseOverviewResponse,
  WorkoutHeartRateDetail,
  WorkoutHeartRateSummary,
} from "@health/types";
import {
  ZONE_COLORS,
  ZONE_KEYS,
  ZONE_LABELS,
  buildAggregateZoneSegments,
  buildHrTrendChartModel,
  buildReadinessRingValue,
  buildWorkoutHrLinePoints,
  buildWorkoutRows,
  formatBpmValue,
  formatOffsetLabel,
  pulseHasData,
  readinessRingColor,
} from "./pulse-ui-state.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ZONE_SUMMARY = { z1Min: 5, z2Min: 10, z3Min: 15, z4Min: 8, z5Min: 2 };

function makeWorkout(overrides: Partial<WorkoutHeartRateSummary> = {}): WorkoutHeartRateSummary {
  return {
    snapshotId: "a0000000-0000-4000-8000-000000000001",
    observedAt: "2026-06-01T10:00:00.000Z",
    activityType: "running",
    durationMinutes: 40,
    avgBpm: 145,
    maxBpm: 172,
    minBpm: 118,
    zoneSummary: ZONE_SUMMARY,
    ...overrides,
  };
}

function makeOverview(overrides: Partial<PulseOverviewResponse> = {}): PulseOverviewResponse {
  return {
    restingHeartRate: { latest: null, unit: "bpm", trend: [] },
    hrv: { latest: null, unit: "ms", trend: [] },
    readiness: null,
    recentWorkouts: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// ZONE_LABELS and ZONE_COLORS maps
// ---------------------------------------------------------------------------

describe("zone maps", () => {
  it("has labels for all 5 zone keys", () => {
    for (const key of ZONE_KEYS) {
      expect(ZONE_LABELS[key]).toBeTruthy();
    }
  });

  it("has colors for all 5 zone keys", () => {
    for (const key of ZONE_KEYS) {
      expect(ZONE_COLORS[key]).toBeTruthy();
    }
  });

  it("zone labels mention the zone number (Z1–Z5)", () => {
    expect(ZONE_LABELS["z1"]).toContain("Z1");
    expect(ZONE_LABELS["z5"]).toContain("Z5");
  });

  it("all zone colors are distinct", () => {
    const colors = ZONE_KEYS.map((k) => ZONE_COLORS[k]);
    const unique = new Set(colors);
    expect(unique.size).toBe(ZONE_KEYS.length);
  });
});

// ---------------------------------------------------------------------------
// formatBpmValue
// ---------------------------------------------------------------------------

describe("formatBpmValue", () => {
  it("returns em dash for null", () => {
    expect(formatBpmValue(null)).toBe("—");
  });

  it("returns a rounded string without unit", () => {
    expect(formatBpmValue(65.6)).toBe("66");
    expect(formatBpmValue(65)).toBe("65");
  });
});

// ---------------------------------------------------------------------------
// buildHrTrendChartModel
// ---------------------------------------------------------------------------

describe("buildHrTrendChartModel", () => {
  it("returns null for an empty array", () => {
    expect(buildHrTrendChartModel([], "bpm")).toBeNull();
  });

  it("returns null for a single-point array", () => {
    expect(
      buildHrTrendChartModel([{ date: "2026-06-01T00:00:00.000Z", value: 60 }], "bpm"),
    ).toBeNull();
  });

  it("orders points oldest → newest by date", () => {
    const model = buildHrTrendChartModel(
      [
        { date: "2026-06-03T00:00:00.000Z", value: 63 },
        { date: "2026-06-01T00:00:00.000Z", value: 61 },
        { date: "2026-06-02T00:00:00.000Z", value: 62 },
      ],
      "bpm",
    )!;
    expect(model.points.map((p) => p.value)).toEqual([61, 62, 63]);
  });

  it("sets ts as a numeric epoch timestamp", () => {
    const model = buildHrTrendChartModel(
      [
        { date: "2026-06-01T00:00:00.000Z", value: 60 },
        { date: "2026-06-02T00:00:00.000Z", value: 62 },
      ],
      "bpm",
    )!;
    expect(typeof model.points[0]!.ts).toBe("number");
    expect(model.points[0]!.ts).toBeGreaterThan(0);
    // Second point timestamp must be after first
    expect(model.points[1]!.ts).toBeGreaterThan(model.points[0]!.ts);
  });

  it("includes a non-empty label for each valid date", () => {
    const model = buildHrTrendChartModel(
      [
        { date: "2026-06-01T00:00:00.000Z", value: 60 },
        { date: "2026-06-02T00:00:00.000Z", value: 62 },
      ],
      "bpm",
    )!;
    for (const point of model.points) {
      expect(point.label).toBeTruthy();
    }
  });

  it("exposes the passed unit on the model", () => {
    const model = buildHrTrendChartModel(
      [
        { date: "2026-06-01T00:00:00.000Z", value: 55 },
        { date: "2026-06-02T00:00:00.000Z", value: 58 },
      ],
      "ms",
    )!;
    expect(model.unit).toBe("ms");
  });

  it("yDomain[0] is less than the minimum value and yDomain[1] is greater than the max", () => {
    const model = buildHrTrendChartModel(
      [
        { date: "2026-06-01T00:00:00.000Z", value: 55 },
        { date: "2026-06-02T00:00:00.000Z", value: 70 },
      ],
      "bpm",
    )!;
    expect(model.yDomain[0]).toBeLessThan(55);
    expect(model.yDomain[1]).toBeGreaterThan(70);
  });

  it("pads yDomain when all values are identical (flat line)", () => {
    const model = buildHrTrendChartModel(
      [
        { date: "2026-06-01T00:00:00.000Z", value: 60 },
        { date: "2026-06-02T00:00:00.000Z", value: 60 },
      ],
      "bpm",
    )!;
    expect(model.yDomain[0]).toBeLessThan(60);
    expect(model.yDomain[1]).toBeGreaterThan(60);
  });
});

// ---------------------------------------------------------------------------
// buildReadinessRingValue
// ---------------------------------------------------------------------------

describe("buildReadinessRingValue", () => {
  it("returns null when readiness is null", () => {
    expect(buildReadinessRingValue(null)).toBeNull();
  });

  it("rounds and returns the readiness value within 0–100", () => {
    expect(buildReadinessRingValue({ value: 82.6, unit: "score", observedAt: "2026-06-01T00:00:00.000Z" })).toBe(83);
    expect(buildReadinessRingValue({ value: 50, unit: "score", observedAt: "2026-06-01T00:00:00.000Z" })).toBe(50);
  });

  it("clamps values above 100 to 100", () => {
    expect(buildReadinessRingValue({ value: 110, unit: "score", observedAt: "2026-06-01T00:00:00.000Z" })).toBe(100);
  });

  it("clamps values below 0 to 0", () => {
    expect(buildReadinessRingValue({ value: -5, unit: "score", observedAt: "2026-06-01T00:00:00.000Z" })).toBe(0);
  });

  it("returns 0 for a value of exactly 0", () => {
    expect(buildReadinessRingValue({ value: 0, unit: "score", observedAt: "2026-06-01T00:00:00.000Z" })).toBe(0);
  });

  it("returns 100 for a value of exactly 100", () => {
    expect(buildReadinessRingValue({ value: 100, unit: "score", observedAt: "2026-06-01T00:00:00.000Z" })).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// readinessRingColor
// ---------------------------------------------------------------------------

describe("readinessRingColor", () => {
  it("returns green for value >= 70", () => {
    expect(readinessRingColor(70)).toBe("var(--color-metric-green)");
    expect(readinessRingColor(100)).toBe("var(--color-metric-green)");
    expect(readinessRingColor(85)).toBe("var(--color-metric-green)");
  });

  it("returns amber for value in 40–69 range", () => {
    expect(readinessRingColor(40)).toBe("var(--color-metric-amber)");
    expect(readinessRingColor(69)).toBe("var(--color-metric-amber)");
    expect(readinessRingColor(55)).toBe("var(--color-metric-amber)");
  });

  it("returns red for value below 40", () => {
    expect(readinessRingColor(0)).toBe("var(--color-metric-red)");
    expect(readinessRingColor(39)).toBe("var(--color-metric-red)");
    expect(readinessRingColor(20)).toBe("var(--color-metric-red)");
  });
});

// ---------------------------------------------------------------------------
// buildAggregateZoneSegments
// ---------------------------------------------------------------------------

describe("buildAggregateZoneSegments", () => {
  it("returns null for an empty workouts array", () => {
    expect(buildAggregateZoneSegments([])).toBeNull();
  });

  it("returns null when all zone totals are zero", () => {
    const allZero = makeWorkout({
      zoneSummary: { z1Min: 0, z2Min: 0, z3Min: 0, z4Min: 0, z5Min: 0 },
    });
    expect(buildAggregateZoneSegments([allZero])).toBeNull();
  });

  it("returns 5 segments in z1→z5 order", () => {
    const segments = buildAggregateZoneSegments([makeWorkout()])!;
    expect(segments).not.toBeNull();
    expect(segments.map((s) => s.key)).toEqual(["z1", "z2", "z3", "z4", "z5"]);
  });

  it("aggregates minutes across multiple workouts", () => {
    const w1 = makeWorkout({
      zoneSummary: { z1Min: 10, z2Min: 0, z3Min: 0, z4Min: 0, z5Min: 0 },
    });
    const w2 = makeWorkout({
      zoneSummary: { z1Min: 5, z2Min: 0, z3Min: 0, z4Min: 0, z5Min: 0 },
    });
    const segments = buildAggregateZoneSegments([w1, w2])!;
    expect(segments.find((s) => s.key === "z1")!.minutes).toBe(15);
  });

  it("computes percentages that sum to approximately 100", () => {
    const segments = buildAggregateZoneSegments([makeWorkout()])!;
    const total = segments.reduce((acc, s) => acc + s.pct, 0);
    expect(total).toBeGreaterThanOrEqual(99);
    expect(total).toBeLessThanOrEqual(101);
  });

  it("produces correct percentages for known zone minutes", () => {
    // ZONE_SUMMARY = { z1: 5, z2: 10, z3: 15, z4: 8, z5: 2 } => total = 40
    const segments = buildAggregateZoneSegments([makeWorkout()])!;
    expect(segments.find((s) => s.key === "z3")!.pct).toBe(Math.round((15 / 40) * 100));
    expect(segments.find((s) => s.key === "z5")!.pct).toBe(Math.round((2 / 40) * 100));
  });

  it("assigns non-empty labels and colors to all segments", () => {
    const segments = buildAggregateZoneSegments([makeWorkout()])!;
    for (const segment of segments) {
      expect(segment.label).toBeTruthy();
      expect(segment.color).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// formatOffsetLabel
// ---------------------------------------------------------------------------

describe("formatOffsetLabel", () => {
  it("formats seconds-only when less than 1 minute", () => {
    expect(formatOffsetLabel(45)).toBe("45s");
    expect(formatOffsetLabel(0)).toBe("0s");
  });

  it("formats minutes-only when seconds remainder is zero", () => {
    expect(formatOffsetLabel(120)).toBe("2m");
    expect(formatOffsetLabel(60)).toBe("1m");
  });

  it("formats combined minutes and seconds", () => {
    expect(formatOffsetLabel(90)).toBe("1m 30s");
    expect(formatOffsetLabel(185)).toBe("3m 5s");
  });
});

// ---------------------------------------------------------------------------
// buildWorkoutHrLinePoints
// ---------------------------------------------------------------------------

describe("buildWorkoutHrLinePoints", () => {
  const detail: WorkoutHeartRateDetail = {
    ...makeWorkout(),
    samples: [
      { offsetSec: 0, bpm: 120 },
      { offsetSec: 90, bpm: 145 },
      { offsetSec: 185, bpm: 162 },
    ],
  };

  it("returns one point per sample", () => {
    expect(buildWorkoutHrLinePoints(detail)).toHaveLength(3);
  });

  it("preserves offsetSec and bpm", () => {
    const points = buildWorkoutHrLinePoints(detail);
    expect(points[0]!.offsetSec).toBe(0);
    expect(points[0]!.bpm).toBe(120);
    expect(points[1]!.offsetSec).toBe(90);
    expect(points[2]!.bpm).toBe(162);
  });

  it("sets offsetLabel using formatOffsetLabel", () => {
    const points = buildWorkoutHrLinePoints(detail);
    expect(points[0]!.offsetLabel).toBe("0s");
    expect(points[1]!.offsetLabel).toBe("1m 30s");
    expect(points[2]!.offsetLabel).toBe("3m 5s");
  });

  it("returns empty array for no samples", () => {
    expect(
      buildWorkoutHrLinePoints({ ...detail, samples: [] }),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildWorkoutRows
// ---------------------------------------------------------------------------

describe("buildWorkoutRows", () => {
  it("returns empty array for empty workouts", () => {
    expect(buildWorkoutRows([])).toEqual([]);
  });

  it("maps each workout to a row with the correct shape", () => {
    const rows = buildWorkoutRows([makeWorkout()]);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.snapshotId).toBe("a0000000-0000-4000-8000-000000000001");
    expect(row.dateLabel).toBeTruthy();
    expect(row.activityLabel).toBe("running");
    expect(row.durationLabel).toBe("40m");
    expect(row.avgBpmLabel).toBe("145 bpm");
    expect(row.maxBpmLabel).toBe("max 172");
  });

  it("falls back to 'Workout' when activityType is null", () => {
    const rows = buildWorkoutRows([makeWorkout({ activityType: null })]);
    expect(rows[0]!.activityLabel).toBe("Workout");
  });

  it("formats durationLabel as hours and minutes for long workouts", () => {
    const rows = buildWorkoutRows([makeWorkout({ durationMinutes: 90 })]);
    expect(rows[0]!.durationLabel).toBe("1h 30m");
  });

  it("formats durationLabel as hours-only when no remaining minutes", () => {
    const rows = buildWorkoutRows([makeWorkout({ durationMinutes: 60 })]);
    expect(rows[0]!.durationLabel).toBe("1h");
  });
});

// ---------------------------------------------------------------------------
// pulseHasData
// ---------------------------------------------------------------------------

describe("pulseHasData", () => {
  it("returns false when all fields are empty/null", () => {
    expect(pulseHasData(makeOverview())).toBe(false);
  });

  it("returns true when restingHeartRate.latest is present", () => {
    expect(
      pulseHasData(
        makeOverview({
          restingHeartRate: {
            latest: { value: 58, unit: "bpm", observedAt: "2026-06-01T00:00:00.000Z" },
            unit: "bpm",
            trend: [],
          },
        }),
      ),
    ).toBe(true);
  });

  it("returns true when hrv.latest is present", () => {
    expect(
      pulseHasData(
        makeOverview({
          hrv: {
            latest: { value: 62, unit: "ms", observedAt: "2026-06-01T00:00:00.000Z" },
            unit: "ms",
            trend: [],
          },
        }),
      ),
    ).toBe(true);
  });

  it("returns true when readiness is present", () => {
    expect(
      pulseHasData(
        makeOverview({
          readiness: { value: 80, unit: "score", observedAt: "2026-06-01T00:00:00.000Z" },
        }),
      ),
    ).toBe(true);
  });

  it("returns true when recentWorkouts has at least one entry", () => {
    expect(
      pulseHasData(makeOverview({ recentWorkouts: [makeWorkout()] })),
    ).toBe(true);
  });

  it("returns false when all four fields are null / empty", () => {
    const overview = makeOverview({
      restingHeartRate: { latest: null, unit: "bpm", trend: [] },
      hrv: { latest: null, unit: "ms", trend: [] },
      readiness: null,
      recentWorkouts: [],
    });
    expect(pulseHasData(overview)).toBe(false);
  });
});
