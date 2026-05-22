import { describe, expect, it } from "vitest";
import { buildMetricDedupeKey, collectObservationPeriods, toUtcDateKey } from "./metric-dedupe.js";

describe("buildMetricDedupeKey", () => {
  it("uses provider source id when available", () => {
    expect(
      buildMetricDedupeKey("apple_healthkit", {
        metricType: "steps",
        sourceId: "hk-step-123",
        observedAt: "2026-05-22T00:00:00.000Z",
        unit: "count",
        normalizedPayload: {
          stepCount: 1000,
          intervalStart: "2026-05-22T00:00:00.000Z",
          intervalEnd: "2026-05-22T23:59:59.000Z",
        },
      }),
    ).toBe("apple_healthkit:steps:hk-step-123");
  });

  it("falls back to observed interval when source id is absent", () => {
    expect(
      buildMetricDedupeKey("android_health_connect", {
        metricType: "sleep",
        observedAt: "2026-05-22T22:00:00.000Z",
        observedEndAt: "2026-05-23T06:00:00.000Z",
        unit: "minutes",
        normalizedPayload: {
          durationMinutes: 480,
          intervalStart: "2026-05-22T22:00:00.000Z",
          intervalEnd: "2026-05-23T06:00:00.000Z",
        },
      }),
    ).toBe(
      "android_health_connect:sleep:2026-05-22T22:00:00.000Z:2026-05-23T06:00:00.000Z",
    );
  });
});

describe("collectObservationPeriods", () => {
  it("derives daily and weekly periods from observation timestamps", () => {
    const periods = collectObservationPeriods([
      {
        metricType: "steps",
        observedAt: new Date("2026-05-20T10:00:00.000Z"),
      },
      {
        metricType: "workout",
        observedAt: new Date("2026-05-18T10:00:00.000Z"),
        observedEndAt: new Date("2026-05-26T10:00:00.000Z"),
      },
    ]);

    expect(periods.map((period) => ({
      metricType: period.metricType,
      periodType: period.periodType,
      periodStart: toUtcDateKey(period.periodStart),
    }))).toEqual([
      { metricType: "steps", periodType: "daily", periodStart: "2026-05-20" },
      { metricType: "workout", periodType: "weekly", periodStart: "2026-05-18" },
      { metricType: "workout", periodType: "weekly", periodStart: "2026-05-25" },
    ]);
  });
});
