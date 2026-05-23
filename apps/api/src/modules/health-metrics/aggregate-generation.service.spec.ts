import { describe, expect, it, vi } from "vitest";
import { AggregateGenerationService } from "./aggregate-generation.service.js";
import {
  endOfUtcWeek,
  snapshotOverlapsPeriod,
  startOfUtcWeek,
} from "./metric-dedupe.js";

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

  it("includes cross-midnight sleep in the wake-day daily aggregate", async () => {
    const crossMidnightSleep = {
      normalizedPayload: {
        durationMinutes: 480,
        intervalStart: "2026-05-22T22:00:00.000Z",
        intervalEnd: "2026-05-23T06:00:00.000Z",
      },
      observedAt: new Date("2026-05-22T22:00:00.000Z"),
      observedEndAt: new Date("2026-05-23T06:00:00.000Z"),
    };
    const upsertAggregate = vi.fn(async (input) => ({
      id: "aggregate-id",
      ...input,
      calculatedAt: new Date("2026-05-23T12:00:00.000Z"),
      createdAt: new Date("2026-05-23T12:00:00.000Z"),
      updatedAt: new Date("2026-05-23T12:00:00.000Z"),
    }));
    const listSnapshotsForPeriod = vi.fn(
      async (
        _userId: string,
        metricType: string,
        _consentId: string,
        periodStart: Date,
        periodEnd: Date,
      ) => {
        if (metricType !== "sleep") {
          return [];
        }

        return snapshotOverlapsPeriod(
          crossMidnightSleep.observedAt,
          crossMidnightSleep.observedEndAt,
          periodStart,
          periodEnd,
        )
          ? [crossMidnightSleep]
          : [];
      },
    );

    const service = new AggregateGenerationService({
      listSnapshotsForPeriod,
      upsertAggregate,
    } as never);

    await service.refreshForMetricTypes("user-id", "consent-id", [
      {
        metricType: "sleep",
        observedAt: new Date("2026-05-22T22:00:00.000Z"),
        observedEndAt: new Date("2026-05-23T06:00:00.000Z"),
      },
    ]);

    expect(upsertAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        metricType: "sleep",
        periodStart: "2026-05-23",
        periodEnd: "2026-05-23",
        aggregatePayload: expect.objectContaining({
          totalDurationMinutes: 480,
          sleepWindowStart: "2026-05-22T22:00:00.000Z",
          sleepWindowEnd: "2026-05-23T06:00:00.000Z",
        }),
      }),
    );
  });

  it("includes spanning workouts in the overlapping weekly aggregate", async () => {
    const spanningWorkout = {
      normalizedPayload: {
        durationMinutes: 90,
        activityType: "running",
      },
      observedAt: new Date("2026-05-18T10:00:00.000Z"),
      observedEndAt: new Date("2026-05-26T10:00:00.000Z"),
    };
    const upsertAggregate = vi.fn(async (input) => ({
      id: "aggregate-id",
      ...input,
      calculatedAt: new Date("2026-05-26T12:00:00.000Z"),
      createdAt: new Date("2026-05-26T12:00:00.000Z"),
      updatedAt: new Date("2026-05-26T12:00:00.000Z"),
    }));
    const listSnapshotsForPeriod = vi.fn(
      async (
        _userId: string,
        metricType: string,
        _consentId: string,
        periodStart: Date,
        periodEnd: Date,
      ) => {
        if (metricType !== "workout") {
          return [];
        }

        return snapshotOverlapsPeriod(
          spanningWorkout.observedAt,
          spanningWorkout.observedEndAt,
          periodStart,
          periodEnd,
        )
          ? [spanningWorkout]
          : [];
      },
    );

    const service = new AggregateGenerationService({
      listSnapshotsForPeriod,
      upsertAggregate,
    } as never);

    await service.refreshForMetricTypes("user-id", "consent-id", [
      {
        metricType: "workout",
        observedAt: new Date("2026-05-18T10:00:00.000Z"),
        observedEndAt: new Date("2026-05-26T10:00:00.000Z"),
      },
    ]);

    expect(upsertAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        metricType: "workout",
        periodType: "weekly",
        periodStart: "2026-05-25",
        periodEnd: "2026-05-31",
        aggregatePayload: expect.objectContaining({
          workoutCount: 1,
          totalDurationMinutes: 90,
          activityMix: { running: 1 },
        }),
      }),
    );
    expect(listSnapshotsForPeriod).toHaveBeenCalledWith(
      "user-id",
      "workout",
      "consent-id",
      startOfUtcWeek(new Date("2026-05-26T10:00:00.000Z")),
      endOfUtcWeek(new Date("2026-05-26T10:00:00.000Z")),
    );
  });
});
