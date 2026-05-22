import { describe, expect, it } from "vitest";
import {
  aiMetricsContextSummarySchema,
  grantDeviceConsentSchema,
  healthMetricSnapshotPayloadSchema,
  metricTypeToScope,
  providerMetricRecordSchema,
  syncHealthMetricsSchema,
} from "./device-metrics.js";

describe("phase 8 device metrics contracts", () => {
  it("accepts grant consent with metric scopes", () => {
    const consent = grantDeviceConsentSchema.parse({
      provider: "apple_healthkit",
      grantedScopes: ["steps", "sleep"],
      allowAiContext: true,
    });

    expect(consent.grantedScopes).toEqual(["steps", "sleep"]);
  });

  it("validates normalized snapshot payloads by metric type", () => {
    expect(() =>
      healthMetricSnapshotPayloadSchema.parse({
        metricType: "steps",
        payload: {
          stepCount: 8421,
          intervalStart: "2026-05-22T00:00:00.000Z",
          intervalEnd: "2026-05-22T23:59:59.000Z",
        },
      }),
    ).not.toThrow();
  });

  it("maps metric types to consent scopes", () => {
    expect(metricTypeToScope("workout")).toBe("workouts");
    expect(metricTypeToScope("recovery_input")).toBe("recovery_inputs");
  });

  it("validates sync payloads without raw provider logs", () => {
    const payload = syncHealthMetricsSchema.parse({
      deviceConnectionId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
      records: [
        providerMetricRecordSchema.parse({
          metricType: "weight",
          sourceId: "hk-weight-1",
          observedAt: "2026-05-22T08:00:00.000Z",
          unit: "kg",
          normalizedPayload: { weightKg: 79.4 },
        }),
      ],
    });

    expect(payload.records).toHaveLength(1);
  });

  it("strips unmodeled provider fields from sync records", () => {
    const payload = syncHealthMetricsSchema.parse({
      deviceConnectionId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
      records: [
        {
          metricType: "steps",
          sourceId: "hk-step-1",
          observedAt: "2026-05-22T08:00:00.000Z",
          unit: "count",
          normalizedPayload: { stepCount: 8421 },
          rawProviderPayload: { privateSamples: [1, 2, 3] },
        },
      ],
    });

    expect(payload.records[0]).not.toHaveProperty("rawProviderPayload");
  });

  it("validates AI metric summary shape", () => {
    const summary = aiMetricsContextSummarySchema.parse({
      items: [
        {
          metricType: "steps",
          label: "Daily steps summary",
          summary: "Daily steps total 8421.",
          periodStart: "2026-05-22",
          periodEnd: "2026-05-22",
          freshness: "2026-05-22T12:00:00.000Z",
          sourceProvider: "apple_healthkit",
        },
      ],
      generatedAt: "2026-05-22T12:00:00.000Z",
    });

    expect(summary.items).toHaveLength(1);
  });

  it("keeps AI metric summaries free of raw payload fields", () => {
    const summary = aiMetricsContextSummarySchema.parse({
      items: [
        {
          metricType: "sleep",
          label: "Sleep duration summary",
          summary: "Sleep duration 420 minutes.",
          periodStart: "2026-05-21",
          periodEnd: "2026-05-22",
          freshness: "2026-05-22T12:00:00.000Z",
          sourceProvider: "android_health_connect",
          rawSamples: [{ stage: "deep", minute: 1 }],
          providerPayload: { privateTimeline: true },
        },
      ],
      generatedAt: "2026-05-22T12:00:00.000Z",
    });

    expect(summary.items[0]).not.toHaveProperty("rawSamples");
    expect(summary.items[0]).not.toHaveProperty("providerPayload");
  });
});
