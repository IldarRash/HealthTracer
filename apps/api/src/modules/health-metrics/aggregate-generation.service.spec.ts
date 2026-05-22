import { describe, expect, it, vi } from "vitest";
import { AggregateGenerationService } from "./aggregate-generation.service.js";

const stepIntervals = {
  intervalStart: "2026-05-22T00:00:00.000Z",
  intervalEnd: "2026-05-22T23:59:59.000Z",
};

describe("AggregateGenerationService", () => {
  it("builds daily steps aggregate from consent-scoped snapshots", async () => {
    const upsertAggregate = vi.fn(async (input) => ({
      id: "aggregate-id",
      ...input,
      calculatedAt: new Date("2026-05-22T12:00:00.000Z"),
      createdAt: new Date("2026-05-22T12:00:00.000Z"),
      updatedAt: new Date("2026-05-22T12:00:00.000Z"),
    }));
    const listSnapshotsForPeriod = vi
      .fn()
      .mockImplementation(
        async (
          _userId: string,
          metricType: string,
          consentId: string,
          periodStart: Date,
          periodEnd: Date,
        ) => {
          if (metricType === "steps" && consentId === "active-consent") {
            const isDailyWindow =
              periodStart.toISOString().startsWith("2026-05-22") &&
              periodEnd.toISOString().startsWith("2026-05-22");

            if (isDailyWindow) {
              return [
                {
                  normalizedPayload: { stepCount: 4000, ...stepIntervals },
                  observedAt: new Date("2026-05-22T10:00:00.000Z"),
                },
                {
                  normalizedPayload: { stepCount: 4421, ...stepIntervals },
                  observedAt: new Date("2026-05-22T18:00:00.000Z"),
                },
              ];
            }

            return [
              {
                normalizedPayload: { stepCount: 4000, ...stepIntervals },
                observedAt: new Date("2026-05-22T10:00:00.000Z"),
              },
              {
                normalizedPayload: { stepCount: 4421, ...stepIntervals },
                observedAt: new Date("2026-05-22T18:00:00.000Z"),
              },
            ];
          }

          return [];
        },
      );

    const service = new AggregateGenerationService({
      listSnapshotsForPeriod,
      upsertAggregate,
    } as never);

    const refreshed = await service.refreshForMetricTypes("user-id", "active-consent", [
      {
        metricType: "steps",
        observedAt: new Date("2026-05-22T12:00:00.000Z"),
      },
    ]);

    expect(refreshed).toHaveLength(1);
    expect(listSnapshotsForPeriod).toHaveBeenCalledWith(
      "user-id",
      "steps",
      "active-consent",
      expect.any(Date),
      expect.any(Date),
    );
    expect(upsertAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        consentId: "active-consent",
        metricType: "steps",
        aggregatePayload: expect.objectContaining({ totalSteps: 8421 }),
      }),
    );
  });

  it("does not fold revoked-consent snapshots into a reconnected aggregate", async () => {
    const upsertAggregate = vi.fn(async (input) => ({
      id: "aggregate-id",
      ...input,
      calculatedAt: new Date("2026-05-22T12:00:00.000Z"),
      createdAt: new Date("2026-05-22T12:00:00.000Z"),
      updatedAt: new Date("2026-05-22T12:00:00.000Z"),
    }));
    const listSnapshotsForPeriod = vi.fn(async (_userId, _metricType, consentId: string) => {
      if (consentId === "new-consent") {
        return [
          {
            normalizedPayload: { stepCount: 1000, ...stepIntervals },
            observedAt: new Date("2026-05-22T10:00:00.000Z"),
          },
        ];
      }

      return [
        {
          normalizedPayload: { stepCount: 9000, ...stepIntervals },
          observedAt: new Date("2026-05-22T10:00:00.000Z"),
        },
      ];
    });

    const service = new AggregateGenerationService({
      listSnapshotsForPeriod,
      upsertAggregate,
    } as never);

    await service.refreshForMetricTypes("user-id", "new-consent", [
      {
        metricType: "steps",
        observedAt: new Date("2026-05-22T12:00:00.000Z"),
      },
    ]);

    expect(listSnapshotsForPeriod).toHaveBeenCalledWith(
      "user-id",
      "steps",
      "new-consent",
      expect.any(Date),
      expect.any(Date),
    );
    expect(upsertAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        consentId: "new-consent",
        aggregatePayload: expect.objectContaining({ totalSteps: 1000 }),
      }),
    );
  });

  it("refreshes aggregates for historical observation dates instead of sync time", async () => {
    const upsertAggregate = vi.fn(async (input) => ({
      id: "aggregate-id",
      ...input,
      calculatedAt: new Date("2026-05-24T12:00:00.000Z"),
      createdAt: new Date("2026-05-24T12:00:00.000Z"),
      updatedAt: new Date("2026-05-24T12:00:00.000Z"),
    }));
    const listSnapshotsForPeriod = vi.fn(async () => [
      {
        normalizedPayload: { stepCount: 3000, ...stepIntervals },
        observedAt: new Date("2026-05-20T10:00:00.000Z"),
      },
    ]);

    const service = new AggregateGenerationService({
      listSnapshotsForPeriod,
      upsertAggregate,
    } as never);

    await service.refreshForMetricTypes("user-id", "consent-id", [
      {
        metricType: "steps",
        observedAt: new Date("2026-05-20T10:00:00.000Z"),
      },
    ]);

    expect(upsertAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        periodStart: "2026-05-20",
        periodEnd: "2026-05-20",
        aggregatePayload: expect.objectContaining({
          totalSteps: 3000,
          anchorDate: "2026-05-20",
        }),
      }),
    );
  });
});
