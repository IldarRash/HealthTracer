import { describe, expect, it, vi } from "vitest";
import { AggregateGenerationService } from "./aggregate-generation.service.js";

describe("AggregateGenerationService", () => {
  it("builds daily steps aggregate from snapshots", async () => {
    const upsertAggregate = vi.fn(async (input) => ({
      id: "aggregate-id",
      ...input,
      calculatedAt: new Date("2026-05-22T12:00:00.000Z"),
      createdAt: new Date("2026-05-22T12:00:00.000Z"),
      updatedAt: new Date("2026-05-22T12:00:00.000Z"),
    }));

    const service = new AggregateGenerationService({
      listSnapshotsForPeriod: async () => [
        {
          normalizedPayload: { stepCount: 4000 },
          observedAt: new Date("2026-05-22T10:00:00.000Z"),
        },
        {
          normalizedPayload: { stepCount: 4421 },
          observedAt: new Date("2026-05-22T18:00:00.000Z"),
        },
      ],
      upsertAggregate,
    } as never);

    const refreshed = await service.refreshForMetricTypes(
      "user-id",
      "consent-id",
      ["steps"],
      new Date("2026-05-22T12:00:00.000Z"),
    );

    expect(refreshed).toHaveLength(1);
    expect(upsertAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        metricType: "steps",
        aggregatePayload: expect.objectContaining({ totalSteps: 8421 }),
      }),
    );
  });
});
