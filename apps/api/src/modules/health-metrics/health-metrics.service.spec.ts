import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { HealthMetricsService } from "./health-metrics.service.js";

const stepPayload = {
  stepCount: 5000,
  intervalStart: "2026-05-22T00:00:00.000Z",
  intervalEnd: "2026-05-22T23:59:59.000Z",
};

const sleepPayload = {
  durationMinutes: 420,
  intervalStart: "2026-05-22T22:00:00.000Z",
  intervalEnd: "2026-05-23T06:00:00.000Z",
};

const auth = {
  clerkUserId: "user_123",
  displayName: "Test User",
  email: "test@example.com",
};

const user = {
  id: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
  displayName: "Test User",
  email: "test@example.com",
  timezone: "UTC",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("HealthMetricsService", () => {
  it("lists snapshots only for the authenticated user", async () => {
    const listSnapshots = vi.fn(async () => []);
    const service = new HealthMetricsService(
      { listSnapshots } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { resolveFromAuth: async () => user } as never,
    );

    await expect(service.listSnapshots(auth, { limit: 10 })).resolves.toEqual([]);
    expect(listSnapshots).toHaveBeenCalledWith(user.id, { limit: 10 });
  });

  it("ingests snapshots idempotently and refreshes aggregates", async () => {
    const insertSnapshotIfNew = vi
      .fn()
      .mockResolvedValueOnce({
        id: "snapshot-1",
        userId: user.id,
        consentId: "consent-id",
        deviceConnectionId: "connection-id",
        metricType: "steps",
        provider: "apple_healthkit",
        sourceId: "hk-step-1",
        dedupeKey: "apple_healthkit:steps:hk-step-1",
        observedAt: new Date("2026-05-22T10:00:00.000Z"),
        observedEndAt: null,
        unit: "count",
        normalizedPayload: { stepCount: 5000 },
        sourceDeviceLabel: null,
        ingestedAt: new Date("2026-05-22T12:00:00.000Z"),
        createdAt: new Date("2026-05-22T12:00:00.000Z"),
      })
      .mockResolvedValueOnce(null);

    const service = new HealthMetricsService(
      { insertSnapshotIfNew } as never,
      {
        requireActiveConnection: async () => ({
          connection: {
            id: "connection-id",
            provider: "apple_healthkit",
          },
          consent: {
            id: "consent-id",
            grantedScopes: ["steps"],
          },
        }),
        assertMetricScopeGranted: () => undefined,
      } as never,
      { touchLastSync: async () => ({}) } as never,
      {
        refreshForMetricTypes: async () => [{ id: "aggregate-1" }],
      } as never,
      {
        sanitizeSnapshotPayload: (_metricType: string, payload: Record<string, unknown>) =>
          payload,
      } as never,
      {
        resolveFromAuth: async () => user,
      } as never,
    );

    const result = await service.syncMetrics(auth, {
      deviceConnectionId: "connection-id",
      records: [
        {
          metricType: "steps",
          sourceId: "hk-step-1",
          observedAt: "2026-05-22T10:00:00.000Z",
          unit: "count",
          normalizedPayload: stepPayload,
        },
        {
          metricType: "steps",
          sourceId: "hk-step-1",
          observedAt: "2026-05-22T10:00:00.000Z",
          unit: "count",
          normalizedPayload: stepPayload,
        },
      ],
    });

    expect(result.inserted).toHaveLength(1);
    expect(result.skipped).toBe(1);
    expect(result.aggregatesRefreshed).toBe(1);
  });

  it("sanitizes private provider fields before inserting snapshots", async () => {
    const insertSnapshotIfNew = vi.fn(async (input) => ({
      id: "snapshot-1",
      userId: user.id,
      consentId: input.consentId,
      deviceConnectionId: input.deviceConnectionId,
      metricType: input.record.metricType,
      provider: input.provider,
      sourceId: input.record.sourceId ?? null,
      dedupeKey: "apple_healthkit:sleep:hk-sleep-1",
      observedAt: new Date(input.record.observedAt),
      observedEndAt: null,
      unit: input.record.unit,
      normalizedPayload: input.record.normalizedPayload,
      sourceDeviceLabel: null,
      ingestedAt: new Date("2026-05-22T12:00:00.000Z"),
      createdAt: new Date("2026-05-22T12:00:00.000Z"),
    }));
    const sanitizeSnapshotPayload = vi.fn(
      (_metricType: string, payload: Record<string, unknown>) => {
        const { providerPayload: _providerPayload, rawSamples: _rawSamples, ...safe } = payload;
        return safe;
      },
    );

    const service = new HealthMetricsService(
      { insertSnapshotIfNew } as never,
      {
        requireActiveConnection: async () => ({
          connection: {
            id: "connection-id",
            provider: "apple_healthkit",
          },
          consent: {
            id: "consent-id",
            grantedScopes: ["sleep"],
          },
        }),
        assertMetricScopeGranted: () => undefined,
      } as never,
      { touchLastSync: async () => ({}) } as never,
      {
        refreshForMetricTypes: async () => [],
      } as never,
      {
        sanitizeSnapshotPayload,
      } as never,
      {
        resolveFromAuth: async () => user,
      } as never,
    );

    await service.syncMetrics(auth, {
      deviceConnectionId: "connection-id",
      records: [
        {
          metricType: "sleep",
          sourceId: "hk-sleep-1",
          observedAt: "2026-05-22T07:00:00.000Z",
          unit: "minutes",
          normalizedPayload: {
            ...sleepPayload,
            rawSamples: [{ stage: "deep" }],
            providerPayload: { privateTimeline: true },
          },
        },
      ],
    });

    expect(sanitizeSnapshotPayload).toHaveBeenCalledWith(
      "sleep",
      expect.objectContaining({
        durationMinutes: 420,
        rawSamples: expect.any(Array),
        providerPayload: expect.any(Object),
      }),
    );
    expect(insertSnapshotIfNew).toHaveBeenCalledWith(
      expect.objectContaining({
        record: expect.objectContaining({
          normalizedPayload: sleepPayload,
        }),
      }),
    );
  });

  it("rejects sync when metric scope is not granted", async () => {
    const service = new HealthMetricsService(
      {} as never,
      {
        requireActiveConnection: async () => ({
          connection: { id: "connection-id", provider: "apple_healthkit" },
          consent: { id: "consent-id", grantedScopes: ["steps"] },
        }),
        assertMetricScopeGranted: () => {
          throw new BadRequestException("scope missing");
        },
      } as never,
      {} as never,
      {} as never,
      { sanitizeSnapshotPayload: (payload: Record<string, unknown>) => payload } as never,
      { resolveFromAuth: async () => user } as never,
    );

    await expect(
      service.syncMetrics(auth, {
        deviceConnectionId: "connection-id",
        records: [
          {
            metricType: "sleep",
            observedAt: "2026-05-22T22:00:00.000Z",
            unit: "minutes",
            normalizedPayload: { durationMinutes: 420 },
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
