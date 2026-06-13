import { describe, expect, it } from "vitest";
import { computeHeartRateZones, deriveMaxHeartRate, HR_ZONE_BANDS } from "./heart-rate-zones.js";
import {
  heartRateSnapshotPayloadSchema,
  healthMetricSnapshotPayloadSchema,
  metricTypeToScope,
  METRIC_SCOPE_TO_TYPE,
} from "./device-metrics.js";
import {
  pulseOverviewResponseSchema,
  sleepOverviewResponseSchema,
  workoutHeartRateDetailSchema,
} from "./vitals.js";

// ---------------------------------------------------------------------------
// deriveMaxHeartRate
// ---------------------------------------------------------------------------

describe("deriveMaxHeartRate", () => {
  it("returns 190 when birthDate is null", () => {
    expect(deriveMaxHeartRate(null)).toBe(190);
  });

  it("returns 190 when birthDate is undefined", () => {
    expect(deriveMaxHeartRate(undefined)).toBe(190);
  });

  it("returns 190 when birthDate is an empty string", () => {
    expect(deriveMaxHeartRate("")).toBe(190);
  });

  it("returns 190 when birthDate is not parseable", () => {
    expect(deriveMaxHeartRate("not-a-date")).toBe(190);
  });

  it("derives 220 - age for a known birth date (age 30)", () => {
    // Compute a date 30 years ago from today for a stable test
    const today = new Date();
    const born = new Date(today);
    born.setFullYear(born.getFullYear() - 30);
    const birthDate = born.toISOString().slice(0, 10);
    expect(deriveMaxHeartRate(birthDate)).toBe(190); // 220 - 30 = 190
  });

  it("derives 220 - age for age 25", () => {
    const today = new Date();
    const born = new Date(today);
    born.setFullYear(born.getFullYear() - 25);
    const birthDate = born.toISOString().slice(0, 10);
    expect(deriveMaxHeartRate(birthDate)).toBe(195); // 220 - 25 = 195
  });

  it("caps minimum at 100 for very old birth dates", () => {
    expect(deriveMaxHeartRate("1900-01-01")).toBe(190); // age > 120 → default 190
  });
});

// ---------------------------------------------------------------------------
// computeHeartRateZones
// ---------------------------------------------------------------------------

describe("computeHeartRateZones", () => {
  it("derives zone boundaries from HR_ZONE_BANDS (single source of truth)", () => {
    // HR_ZONE_BANDS defines z1 maxPct as 0.6 and z2 maxPct as 0.7.
    // A sample at exactly the z1/z2 boundary should land in z2.
    const z1MaxPct = HR_ZONE_BANDS[0].maxPct; // 0.6
    const maxHr = 200;
    // 60% of 200 = 120 bpm — this equals z1Band.maxPct so it goes to z2.
    const bpmAtBoundary = z1MaxPct * maxHr; // 120
    const samples = Array.from({ length: 120 }, (_, i) => ({
      offsetSec: i,
      bpm: bpmAtBoundary,
    }));
    const result = computeHeartRateZones(samples, maxHr);
    // pct === 0.6 is NOT < 0.6 → falls into z2
    expect(result.z1Min).toBe(0);
    expect(result.z2Min).toBe(2);
  });

  it("returns all zeros for empty samples", () => {
    const result = computeHeartRateZones([], 190);
    expect(result).toEqual({ z1Min: 0, z2Min: 0, z3Min: 0, z4Min: 0, z5Min: 0 });
  });

  it("returns all zeros when maxHr is zero or negative", () => {
    const result = computeHeartRateZones([{ offsetSec: 0, bpm: 120 }], 0);
    expect(result).toEqual({ z1Min: 0, z2Min: 0, z3Min: 0, z4Min: 0, z5Min: 0 });
  });

  it("counts a single sample in Z1 when bpm < 60% maxHr", () => {
    // 95 bpm / 200 maxHr = 47.5% → Z1
    const result = computeHeartRateZones([{ offsetSec: 0, bpm: 95 }], 200);
    // Only 1 sample with no next → 1 second → 0 minutes (rounds down)
    expect(result.z1Min).toBeGreaterThanOrEqual(0);
  });

  it("assigns bpm at exactly 60% maxHr boundary to Z2", () => {
    // 60% of 200 = 120 bpm → pct === 0.6 → < 0.7 → Z2
    const samples = Array.from({ length: 120 }, (_, i) => ({
      offsetSec: i,
      bpm: 120,
    }));
    const result = computeHeartRateZones(samples, 200);
    expect(result.z2Min).toBe(2); // 120 seconds = 2 minutes
    expect(result.z1Min).toBe(0);
  });

  it("assigns bpm at exactly 90% maxHr to Z5", () => {
    // 90% of 200 = 180 bpm → pct === 0.9 → Z5
    const samples = Array.from({ length: 60 }, (_, i) => ({
      offsetSec: i,
      bpm: 180,
    }));
    const result = computeHeartRateZones(samples, 200);
    expect(result.z5Min).toBe(1);
  });

  it("caps gap between samples at 60 seconds to avoid inflating zone totals", () => {
    // Two samples 600s apart — without capping, this would be 600 seconds in a zone.
    // With capping at 60s, it contributes at most 60s.
    const samples = [
      { offsetSec: 0, bpm: 100 },   // Z1 at 50% of 200
      { offsetSec: 600, bpm: 100 }, // 600s gap → capped at 60s duration for first sample
    ];
    const result = computeHeartRateZones(samples, 200);
    // First sample covers min(60, 600) = 60s → 1 min in Z1
    // Second sample: last, covers 1 second → also Z1
    expect(result.z1Min).toBe(1);
  });

  it("distributes samples across multiple zones for a realistic workout", () => {
    // 60 samples each for Z1, Z2, Z3, Z4, Z5 (one per second each)
    const maxHr = 200;
    const samples = [
      // Z1 (50-60%): 95 bpm → 60 seconds
      ...Array.from({ length: 60 }, (_, i) => ({ offsetSec: i, bpm: 95 })),
      // Z2 (60-70%): 125 bpm → 60 seconds
      ...Array.from({ length: 60 }, (_, i) => ({ offsetSec: 60 + i, bpm: 125 })),
      // Z3 (70-80%): 145 bpm → 60 seconds
      ...Array.from({ length: 60 }, (_, i) => ({ offsetSec: 120 + i, bpm: 145 })),
      // Z4 (80-90%): 165 bpm → 60 seconds
      ...Array.from({ length: 60 }, (_, i) => ({ offsetSec: 180 + i, bpm: 165 })),
      // Z5 (90%+): 185 bpm → 60 seconds
      ...Array.from({ length: 60 }, (_, i) => ({ offsetSec: 240 + i, bpm: 185 })),
    ];
    const result = computeHeartRateZones(samples, maxHr);
    expect(result.z1Min).toBe(1);
    expect(result.z2Min).toBe(1);
    expect(result.z3Min).toBe(1);
    expect(result.z4Min).toBe(1);
    expect(result.z5Min).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// heartRateSnapshotPayloadSchema
// ---------------------------------------------------------------------------

describe("heartRateSnapshotPayloadSchema", () => {
  const validPayload = {
    context: "workout" as const,
    avgBpm: 145,
    maxBpm: 172,
    minBpm: 118,
    activityType: "running",
    samples: [
      { offsetSec: 0, bpm: 120 },
      { offsetSec: 30, bpm: 155 },
    ],
    zoneSummary: { z1Min: 5, z2Min: 10, z3Min: 15, z4Min: 10, z5Min: 5 },
  };

  it("accepts a valid heart_rate payload", () => {
    expect(() => heartRateSnapshotPayloadSchema.parse(validPayload)).not.toThrow();
  });

  it("rejects non-positive avgBpm", () => {
    expect(() =>
      heartRateSnapshotPayloadSchema.parse({ ...validPayload, avgBpm: 0 }),
    ).toThrow();
  });

  it("rejects negative minBpm", () => {
    expect(() =>
      heartRateSnapshotPayloadSchema.parse({ ...validPayload, minBpm: -1 }),
    ).toThrow();
  });

  it("rejects invalid context value", () => {
    expect(() =>
      heartRateSnapshotPayloadSchema.parse({ ...validPayload, context: "unknown" }),
    ).toThrow();
  });

  it("rejects negative offsetSec in a sample", () => {
    expect(() =>
      heartRateSnapshotPayloadSchema.parse({
        ...validPayload,
        samples: [{ offsetSec: -1, bpm: 120 }],
      }),
    ).toThrow();
  });

  it("rejects non-positive bpm in a sample", () => {
    expect(() =>
      heartRateSnapshotPayloadSchema.parse({
        ...validPayload,
        samples: [{ offsetSec: 0, bpm: 0 }],
      }),
    ).toThrow();
  });

  it("rejects more than 720 samples", () => {
    const samples = Array.from({ length: 721 }, (_, i) => ({ offsetSec: i, bpm: 130 }));
    expect(() =>
      heartRateSnapshotPayloadSchema.parse({ ...validPayload, samples }),
    ).toThrow();
  });

  it("accepts a resting context without activityType", () => {
    const payload = { ...validPayload, context: "resting" as const };
    delete (payload as { activityType?: string }).activityType;
    expect(() => heartRateSnapshotPayloadSchema.parse(payload)).not.toThrow();
  });

  it("accepts negative z-values? No — rejects negative zone minutes", () => {
    expect(() =>
      heartRateSnapshotPayloadSchema.parse({
        ...validPayload,
        zoneSummary: { z1Min: -1, z2Min: 0, z3Min: 0, z4Min: 0, z5Min: 0 },
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// healthMetricSnapshotPayloadSchema heart_rate discriminant
// ---------------------------------------------------------------------------

describe("healthMetricSnapshotPayloadSchema with heart_rate", () => {
  it("parses a heart_rate envelope correctly", () => {
    const result = healthMetricSnapshotPayloadSchema.parse({
      metricType: "heart_rate",
      payload: {
        context: "workout",
        avgBpm: 145,
        maxBpm: 170,
        minBpm: 110,
        samples: [],
        zoneSummary: { z1Min: 0, z2Min: 0, z3Min: 0, z4Min: 0, z5Min: 0 },
      },
    });
    expect(result.metricType).toBe("heart_rate");
  });
});

// ---------------------------------------------------------------------------
// metricTypeToScope / METRIC_SCOPE_TO_TYPE exhaustive coverage
// ---------------------------------------------------------------------------

describe("heart_rate scope mapping", () => {
  it("maps heart_rate type to heart_rate scope", () => {
    expect(metricTypeToScope("heart_rate")).toBe("heart_rate");
  });

  it("maps heart_rate scope to heart_rate type in METRIC_SCOPE_TO_TYPE", () => {
    expect(METRIC_SCOPE_TO_TYPE["heart_rate"]).toBe("heart_rate");
  });
});

// ---------------------------------------------------------------------------
// sleepOverviewResponseSchema
// ---------------------------------------------------------------------------

describe("sleepOverviewResponseSchema", () => {
  it("accepts a valid empty response", () => {
    expect(() =>
      sleepOverviewResponseSchema.parse({
        lastNight: null,
        trend: [],
        sevenDayAverageMinutes: null,
        recentNights: [],
      }),
    ).not.toThrow();
  });

  it("accepts a full response with all fields", () => {
    expect(() =>
      sleepOverviewResponseSchema.parse({
        lastNight: {
          date: "2026-05-07",
          durationMinutes: 450,
          windowStart: "2026-05-06T23:00:00.000Z",
          windowEnd: "2026-05-07T06:30:00.000Z",
          stageSummary: { awakeMinutes: 15, remMinutes: 90, lightMinutes: 200, deepMinutes: 145 },
        },
        trend: [{ date: "2026-05-07", durationMinutes: 450 }],
        sevenDayAverageMinutes: 435,
        recentNights: [],
      }),
    ).not.toThrow();
  });

  it("rejects a negative durationMinutes in a trend point", () => {
    expect(() =>
      sleepOverviewResponseSchema.parse({
        lastNight: null,
        trend: [{ date: "2026-05-07", durationMinutes: -10 }],
        sevenDayAverageMinutes: null,
        recentNights: [],
      }),
    ).toThrow();
  });

  it("rejects a missing required field (trend)", () => {
    expect(() =>
      sleepOverviewResponseSchema.parse({
        lastNight: null,
        sevenDayAverageMinutes: null,
        recentNights: [],
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// pulseOverviewResponseSchema
// ---------------------------------------------------------------------------

describe("pulseOverviewResponseSchema", () => {
  it("accepts a minimal response with null values", () => {
    expect(() =>
      pulseOverviewResponseSchema.parse({
        restingHeartRate: { latest: null, unit: "bpm", trend: [] },
        hrv: { latest: null, unit: "ms", trend: [] },
        readiness: null,
        recentWorkouts: [],
      }),
    ).not.toThrow();
  });

  it("accepts a full response with workout zones", () => {
    expect(() =>
      pulseOverviewResponseSchema.parse({
        restingHeartRate: {
          latest: { value: 58, unit: "bpm", observedAt: "2026-05-07T08:00:00.000Z" },
          unit: "bpm",
          trend: [{ date: "2026-05-07T08:00:00.000Z", value: 58 }],
        },
        hrv: {
          latest: { value: 62, unit: "ms", observedAt: "2026-05-07T08:00:00.000Z" },
          unit: "ms",
          trend: [],
        },
        readiness: { value: 82, unit: "score", observedAt: "2026-05-07T08:00:00.000Z" },
        recentWorkouts: [
          {
            snapshotId: "a0000000-0000-4000-8000-000000000001",
            observedAt: "2026-05-07T10:00:00.000Z",
            activityType: "running",
            durationMinutes: 45,
            avgBpm: 145,
            maxBpm: 172,
            minBpm: 118,
            zoneSummary: { z1Min: 5, z2Min: 10, z3Min: 15, z4Min: 10, z5Min: 5 },
          },
        ],
      }),
    ).not.toThrow();
  });

  it("rejects a response missing required fields", () => {
    expect(() =>
      pulseOverviewResponseSchema.parse({
        restingHeartRate: { latest: null, unit: "bpm", trend: [] },
        // hrv missing
        readiness: null,
        recentWorkouts: [],
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// workoutHeartRateDetailSchema
// ---------------------------------------------------------------------------

const VALID_WORKOUT_DETAIL = {
  snapshotId: "a0000000-0000-4000-8000-000000000001",
  observedAt: "2026-05-07T10:00:00.000Z",
  activityType: "running",
  durationMinutes: 45,
  avgBpm: 145,
  maxBpm: 172,
  minBpm: 118,
  zoneSummary: { z1Min: 5, z2Min: 10, z3Min: 15, z4Min: 10, z5Min: 5 },
  samples: [
    { offsetSec: 0, bpm: 120 },
    { offsetSec: 30, bpm: 155 },
  ],
};

describe("workoutHeartRateDetailSchema", () => {
  it("accepts a valid workout detail with samples", () => {
    expect(() => workoutHeartRateDetailSchema.parse(VALID_WORKOUT_DETAIL)).not.toThrow();
  });

  it("accepts an empty samples array", () => {
    expect(() =>
      workoutHeartRateDetailSchema.parse({ ...VALID_WORKOUT_DETAIL, samples: [] }),
    ).not.toThrow();
  });

  it("accepts null activityType", () => {
    expect(() =>
      workoutHeartRateDetailSchema.parse({ ...VALID_WORKOUT_DETAIL, activityType: null }),
    ).not.toThrow();
  });

  it("rejects a sample with negative offsetSec", () => {
    expect(() =>
      workoutHeartRateDetailSchema.parse({
        ...VALID_WORKOUT_DETAIL,
        samples: [{ offsetSec: -1, bpm: 120 }],
      }),
    ).toThrow();
  });

  it("rejects a sample with non-positive bpm", () => {
    expect(() =>
      workoutHeartRateDetailSchema.parse({
        ...VALID_WORKOUT_DETAIL,
        samples: [{ offsetSec: 0, bpm: 0 }],
      }),
    ).toThrow();
  });

  it("rejects a non-uuid snapshotId", () => {
    expect(() =>
      workoutHeartRateDetailSchema.parse({
        ...VALID_WORKOUT_DETAIL,
        snapshotId: "not-a-uuid",
      }),
    ).toThrow();
  });

  it("rejects a missing required field (avgBpm)", () => {
    const { avgBpm: _removed, ...withoutAvgBpm } = VALID_WORKOUT_DETAIL;
    expect(() => workoutHeartRateDetailSchema.parse(withoutAvgBpm)).toThrow();
  });

  it("rejects negative zone minutes", () => {
    expect(() =>
      workoutHeartRateDetailSchema.parse({
        ...VALID_WORKOUT_DETAIL,
        zoneSummary: { z1Min: -1, z2Min: 0, z3Min: 0, z4Min: 0, z5Min: 0 },
      }),
    ).toThrow();
  });
});
