import { describe, expect, it } from "vitest";
import { MetricsAiContextService } from "./metrics-ai-context.service.js";

describe("MetricsAiContextService", () => {
  it("excludes revoked consent metrics from AI context", async () => {
    const service = new MetricsAiContextService(
      {
        listConsentsByUserId: async () => [
          {
            id: "active-consent",
            provider: "apple_healthkit",
            revokedAt: null,
            allowAiContext: true,
          },
          {
            id: "revoked-consent",
            provider: "android_health_connect",
            revokedAt: new Date("2026-05-21T00:00:00.000Z"),
            allowAiContext: true,
          },
        ],
      } as never,
      {
        listActiveConsentAggregates: async (
          _userId: string,
          consentIds: string[],
        ) =>
          consentIds.map((consentId: string) => ({
            metricType: "steps",
            periodType: "daily",
            periodStart: "2026-05-22",
            periodEnd: "2026-05-22",
            calculatedAt: new Date("2026-05-22T12:00:00.000Z"),
            consentId,
            aggregatePayload: { totalSteps: 5000 },
            provider: "apple_healthkit",
          })),
        listRecentActiveConsentSnapshots: async () => [],
      } as never,
    );

    const summary = await service.buildSummaryForUser("user-id");

    expect(summary.items).toHaveLength(1);
    expect(summary.items[0]?.sourceProvider).toBe("apple_healthkit");
  });

  it("excludes consents that opted out of AI metric context", async () => {
    const service = new MetricsAiContextService(
      {
        listConsentsByUserId: async () => [
          {
            id: "view-only-consent",
            provider: "wearable",
            revokedAt: null,
            allowAiContext: false,
          },
        ],
      } as never,
      {
        listActiveConsentAggregates: async (_userId: string, consentIds: string[]) =>
          consentIds.map((consentId: string) => ({
            metricType: "weight",
            periodType: "daily",
            periodStart: "2026-05-22",
            periodEnd: "2026-05-22",
            calculatedAt: new Date("2026-05-22T12:00:00.000Z"),
            consentId,
            aggregatePayload: { latestWeightKg: 72.4 },
          })),
        listRecentActiveConsentSnapshots: async () => [],
      } as never,
    );

    const summary = await service.buildSummaryForUser("user-id");

    expect(summary.items).toEqual([]);
  });

  it("allowlists normalized snapshot payloads by metric type", () => {
    const service = new MetricsAiContextService({} as never, {} as never);

    expect(
      service.sanitizeSnapshotPayload("steps", {
        stepCount: 1000,
        intervalStart: "2026-05-22T00:00:00.000Z",
        intervalEnd: "2026-05-22T23:59:59.000Z",
        heartRateSeries: [62, 64, 63],
        rawSamples: [{ bpm: 62 }],
        providerPayload: { secret: true },
      }),
    ).toEqual({
      stepCount: 1000,
      intervalStart: "2026-05-22T00:00:00.000Z",
      intervalEnd: "2026-05-22T23:59:59.000Z",
    });
  });

  it("rejects unlisted normalized payload keys during sanitization", () => {
    const service = new MetricsAiContextService({} as never, {} as never);

    expect(() =>
      service.sanitizeSnapshotPayload("weight", {
        weightKg: 72.4,
        providerPayload: { secret: true },
      }),
    ).toThrow();
  });
});
