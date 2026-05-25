import { describe, expect, it, vi } from "vitest";
import { RecoverySignalCollectorService } from "./recovery-signal-collector.service.js";

const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
const date = "2026-05-25";
const timestamp = new Date("2026-05-25T12:00:00.000Z");

function buildConsent(overrides: {
  id: string;
  allowAiContext: boolean;
  revokedAt?: Date | null;
}) {
  return {
    id: overrides.id,
    userId,
    provider: "wearable",
    grantedScopes: ["sleep", "recovery_inputs"],
    allowAiContext: overrides.allowAiContext,
    consentVersion: "v1",
    grantedAt: timestamp,
    revokedAt: overrides.revokedAt ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function createCollector(consents: ReturnType<typeof buildConsent>[]) {
  const listActiveConsentAggregatesForDate = vi.fn(
    async (): Promise<Record<string, unknown>[]> => [],
  );
  const listActiveConsentSnapshotsForDate = vi.fn(
    async (): Promise<Record<string, unknown>[]> => [],
  );

  const service = new RecoverySignalCollectorService(
    {
      findByUserAndDate: async () => null,
    } as never,
    {
      findByUserAndDate: async () => null,
    } as never,
    {
      listSessionsByUserIdInDateRange: async () => [],
    } as never,
    {
      listConsentsByUserId: async () => consents,
    } as never,
    {
      listActiveConsentAggregatesForDate,
      listActiveConsentSnapshotsForDate,
    } as never,
  );

  return {
    service,
    listActiveConsentAggregatesForDate,
    listActiveConsentSnapshotsForDate,
  };
}

describe("RecoverySignalCollectorService", () => {
  it("does not query synced metrics when AI context consent is absent or revoked", async () => {
    const { service, listActiveConsentAggregatesForDate, listActiveConsentSnapshotsForDate } =
      createCollector([
        buildConsent({ id: "11111111-1111-4111-8111-111111111111", allowAiContext: false }),
        buildConsent({
          id: "22222222-2222-4222-8222-222222222222",
          allowAiContext: true,
          revokedAt: new Date("2026-05-24T12:00:00.000Z"),
        }),
      ]);

    const signals = await service.collectSignalsForDate(userId, date);

    expect(signals).toEqual([]);
    expect(listActiveConsentAggregatesForDate).not.toHaveBeenCalled();
    expect(listActiveConsentSnapshotsForDate).not.toHaveBeenCalled();
  });

  it("queries synced metrics only through active allowAiContext consent ids", async () => {
    const { service, listActiveConsentAggregatesForDate, listActiveConsentSnapshotsForDate } =
      createCollector([
        buildConsent({ id: "11111111-1111-4111-8111-111111111111", allowAiContext: false }),
        buildConsent({ id: "22222222-2222-4222-8222-222222222222", allowAiContext: true }),
      ]);

    listActiveConsentAggregatesForDate
      .mockResolvedValueOnce([
        {
          aggregatePayload: { totalDurationMinutes: 330 },
        },
      ])
      .mockResolvedValueOnce([]);
    listActiveConsentSnapshotsForDate
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          normalizedPayload: { inputType: "readiness_score", value: 82 },
        },
      ]);

    const signals = await service.collectSignalsForDate(userId, date);

    expect(listActiveConsentAggregatesForDate).toHaveBeenCalledWith(
      userId,
      ["22222222-2222-4222-8222-222222222222"],
      date,
      ["sleep"],
    );
    expect(listActiveConsentSnapshotsForDate).toHaveBeenCalledWith(
      userId,
      ["22222222-2222-4222-8222-222222222222"],
      date,
      ["recovery_input"],
    );
    expect(signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "device_sleep",
          detail: "Shorter sleep duration logged",
        }),
        expect.objectContaining({
          source: "device_recovery_input",
          detail: "Vendor readiness input recorded as one signal only",
        }),
      ]),
    );
  });
});
