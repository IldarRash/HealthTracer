import { describe, expect, it } from "vitest";
import { RecoveryContextService } from "./recovery-context.service.js";

const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";

const auth = {
  clerkUserId: "clerk-user-1",
  email: "test@example.com",
  displayName: "Test User",
};

function createRecoveryContextService(overrides: {
  checkInRow?: Record<string, unknown> | null;
  checklistFeedback?: Record<string, unknown> | null;
  sessionRows?: Record<string, unknown>[];
  consentIds?: string[];
} = {}) {
  const checkInRow = overrides.checkInRow ?? null;
  const checklistFeedback = overrides.checklistFeedback ?? null;
  const sessionRows = overrides.sessionRows ?? [];
  const consentIds = overrides.consentIds ?? [];

  const storedCheckInRow =
    checkInRow == null
      ? null
      : {
          id: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b83",
          userId,
          date: "2026-05-25",
          soreness: checkInRow.soreness,
          fatigue: checkInRow.fatigue,
          moodScore: checkInRow.moodScore ?? null,
          perceivedStress: checkInRow.perceivedStress ?? null,
          source: "user_entry",
          createdAt: new Date("2026-05-25T12:00:00.000Z"),
          updatedAt: new Date("2026-05-25T12:00:00.000Z"),
        };

  return new RecoveryContextService(
    {
      findByUserAndDate: async () => storedCheckInRow,
      upsertByUserAndDate: async (_userId: string, date: string, input: Record<string, unknown>) => ({
        id: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b83",
        userId,
        date,
        soreness: input.soreness,
        fatigue: input.fatigue,
        moodScore: input.moodScore ?? null,
        perceivedStress: input.perceivedStress ?? null,
        source: "user_entry",
        createdAt: new Date("2026-05-25T12:00:00.000Z"),
        updatedAt: new Date("2026-05-25T12:00:00.000Z"),
      }),
      countByUserAndDateRange: async () => (checkInRow ? 1 : 0),
      listByUserAndDateRange: async () => [],
    } as never,
    {
      findByUserAndDate: async () => null,
      upsertByUserAndDate: async (_userId: string, date: string, band: string, payload: Record<string, unknown>) => ({
        id: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b84",
        userId,
        date,
        band,
        payload,
        calculatedAt: new Date("2026-05-25T12:00:00.000Z"),
        createdAt: new Date("2026-05-25T12:00:00.000Z"),
        updatedAt: new Date("2026-05-25T12:00:00.000Z"),
      }),
      listByUserAndDateRange: async () => [],
    } as never,
    {
      collectSignalsForDate: async () => {
        const signals = [];

        if (checkInRow) {
          signals.push(
            {
              source: "manual_check_in",
              label: "Soreness check-in",
              detail: "High soreness",
              loadScore: Number(checkInRow.soreness),
              recoveryScore: 6 - Number(checkInRow.soreness),
            },
            {
              source: "manual_check_in",
              label: "Fatigue check-in",
              detail: "High fatigue",
              loadScore: Number(checkInRow.fatigue),
              recoveryScore: 6 - Number(checkInRow.fatigue),
            },
          );
        }

        if (checklistFeedback?.energy != null) {
          signals.push({
            source: "today_feedback",
            label: "Today energy feedback",
            detail: "Low energy",
            loadScore: 4,
            recoveryScore: 2,
          });
        }

        for (const session of sessionRows) {
          if (session.feedback && typeof (session.feedback as { fatigue?: number }).fatigue === "number") {
            signals.push({
              source: "workout_fatigue",
              label: "Recent workout fatigue",
              detail: "High reported fatigue",
              loadScore: 4,
              recoveryScore: 2,
            });
          }
        }

        if (consentIds.length > 0) {
          signals.push({
            source: "device_sleep",
            label: "Synced sleep summary",
            detail: "Shorter sleep duration logged",
            loadScore: 4,
            recoveryScore: 2,
          });
        }

        return signals;
      },
    } as never,
    {
      resolveFromAuth: async () => ({
        id: userId,
        email: auth.email,
        displayName: auth.displayName,
        timezone: "UTC",
        onboardingCompletedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    } as never,
  );
}

describe("RecoveryContextService", () => {
  it("returns insufficient_data when no signals exist", async () => {
    const service = createRecoveryContextService();

    const response = await service.getContextForDate(auth, "2026-05-25");

    expect(response.context.band).toBe("insufficient_data");
    expect(response.checkIn).toBeNull();
  });

  it("computes prioritize_recovery from manual check-in", async () => {
    const service = createRecoveryContextService({
      checkInRow: {
        soreness: 5,
        fatigue: 4,
      },
    });

    const response = await service.upsertCheckIn(auth, {
      soreness: 5,
      fatigue: 4,
    });

    expect(response.checkIn.soreness).toBe(5);
    expect(response.context.band).toBe("prioritize_recovery");
    expect(response.context.payload.signals.some((signal) => signal.source === "manual_check_in")).toBe(
      true,
    );
  });

  it("excludes device sleep when consent is not granted", async () => {
    const serviceWithoutConsent = createRecoveryContextService({
      checkInRow: { soreness: 2, fatigue: 2 },
      consentIds: [],
    });
    const serviceWithConsent = createRecoveryContextService({
      checkInRow: { soreness: 2, fatigue: 2 },
      consentIds: ["consent-1"],
    });

    const withoutConsent = await serviceWithoutConsent.getContextForDate(auth, "2026-05-25");
    const withConsent = await serviceWithConsent.getContextForDate(auth, "2026-05-25");

    expect(
      withoutConsent.context.payload.signals.some((signal) => signal.source === "device_sleep"),
    ).toBe(false);
    expect(
      withConsent.context.payload.signals.some((signal) => signal.source === "device_sleep"),
    ).toBe(true);
  });

  it("persists an updated snapshot for the same user and date after check-in changes", async () => {
    const persistedSnapshots: Array<{ date: string; band: string; signalCount: number }> = [];
    let signals = [
      {
        source: "manual_check_in",
        label: "Fatigue check-in",
        detail: "Low fatigue",
        loadScore: 2,
        recoveryScore: 4,
      },
    ];
    const service = new RecoveryContextService(
      {
        findByUserAndDate: async () => null,
        upsertByUserAndDate: async (_userId: string, date: string, input: Record<string, unknown>) => ({
          id: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b83",
          userId,
          date,
          soreness: input.soreness,
          fatigue: input.fatigue,
          moodScore: input.moodScore ?? null,
          perceivedStress: input.perceivedStress ?? null,
          source: "user_entry",
          createdAt: new Date("2026-05-25T12:00:00.000Z"),
          updatedAt: new Date("2026-05-25T12:05:00.000Z"),
        }),
        countByUserAndDateRange: async () => 1,
        listByUserAndDateRange: async () => [],
      } as never,
      {
        findByUserAndDate: async () => null,
        upsertByUserAndDate: async (_userId: string, date: string, band: string, payload: Record<string, unknown>) => {
          persistedSnapshots.push({
            date,
            band,
            signalCount: Array.isArray(payload.signals) ? payload.signals.length : 0,
          });

          return {
            id: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b84",
            userId,
            date,
            band,
            payload,
            calculatedAt: new Date("2026-05-25T12:00:00.000Z"),
            createdAt: new Date("2026-05-25T12:00:00.000Z"),
            updatedAt: new Date("2026-05-25T12:05:00.000Z"),
          };
        },
        listByUserAndDateRange: async () => [],
      } as never,
      {
        collectSignalsForDate: async () => signals,
      } as never,
      {
        resolveFromAuth: async () => ({
          id: userId,
          email: auth.email,
          displayName: auth.displayName,
          timezone: "UTC",
          onboardingCompletedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      } as never,
    );

    await service.upsertCheckIn(auth, { date: "2026-05-25", soreness: 2, fatigue: 2 });
    signals = [
      {
        source: "manual_check_in",
        label: "Fatigue check-in",
        detail: "High fatigue",
        loadScore: 5,
        recoveryScore: 1,
      },
    ];
    await service.upsertCheckIn(auth, { date: "2026-05-25", soreness: 5, fatigue: 5 });

    expect(persistedSnapshots).toEqual([
      { date: "2026-05-25", band: "well_supported", signalCount: 1 },
      { date: "2026-05-25", band: "prioritize_recovery", signalCount: 1 },
    ]);
  });

  it("builds a weekly context summary from persisted daily snapshots", async () => {
    const service = createRecoveryContextService({
      checkInRow: { soreness: 3, fatigue: 3 },
    });

    const response = await service.getWeeklyContext(auth, "2026-05-19");

    expect(response.weekStart).toBe("2026-05-19");
    expect(response.weekEnd).toBe("2026-05-25");
    expect(response.entries).toHaveLength(7);
    expect(response.summary.checkInCount).toBe(1);
    expect(response.summary.daysWithContext).toBe(7);
    expect(response.summary.message).not.toMatch(/score|clinical|diagnos|treat/i);
  });

  it("refreshes daily snapshots when building weekly recovery aggregate", async () => {
    let computeCalls = 0;
    const service = createRecoveryContextService({
      checkInRow: { soreness: 4, fatigue: 4 },
    });
    const originalCompute = service.computeAndPersistSnapshot.bind(service);
    service.computeAndPersistSnapshot = async (userId: string, date: string) => {
      computeCalls += 1;
      return originalCompute(userId, date);
    };

    const summary = await service.buildWeeklyRecoveryAggregate(
      userId,
      "2026-05-19",
      "2026-05-25",
    );

    expect(computeCalls).toBe(7);
    expect(summary.daysWithContext).toBe(7);
    expect(summary.checkInCount).toBe(1);
  });
});
