import { describe, expect, it } from "vitest";
import { buildMetricDedupeKey } from "./metric-dedupe.js";

describe("buildMetricDedupeKey", () => {
  it("uses provider source id when available", () => {
    expect(
      buildMetricDedupeKey("apple_healthkit", {
        metricType: "steps",
        sourceId: "hk-step-123",
        observedAt: "2026-05-22T00:00:00.000Z",
        unit: "count",
        normalizedPayload: { stepCount: 1000 },
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
        normalizedPayload: { durationMinutes: 480 },
      }),
    ).toBe(
      "android_health_connect:sleep:2026-05-22T22:00:00.000Z:2026-05-23T06:00:00.000Z",
    );
  });
});
