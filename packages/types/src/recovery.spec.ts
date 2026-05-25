import { describe, expect, it } from "vitest";
import {
  aggregateRecoveryProgress,
  buildDeviceRecoveryInputSignal,
  buildManualCheckInSignals,
  buildRecoveryWeeklyEntries,
  computeRecoveryBand,
  getRecoveryWorkoutAdaptationVolumeErrors,
  isWellnessSafeRecoveryMessage,
  recoveryCheckInRecordSchema,
  recoveryContextResponseSchema,
  recoveryContextSnapshotSchema,
  upsertRecoveryCheckInSchema,
} from "./recovery.js";

describe("recovery types and band rules", () => {
  it("parses recovery check-in input", () => {
    expect(
      upsertRecoveryCheckInSchema.parse({
        soreness: 2,
        fatigue: 3,
        moodScore: 4,
      }),
    ).toEqual({
      soreness: 2,
      fatigue: 3,
      moodScore: 4,
    });
  });

  it("returns insufficient_data when no signals are available", () => {
    const payload = computeRecoveryBand({ signals: [] });

    expect(payload.band).toBe("insufficient_data");
    expect(payload.dataSufficiency).toBe("insufficient");
    expect(payload.signals).toEqual([]);
  });

  it("prioritizes recovery when soreness and fatigue are high", () => {
    const payload = computeRecoveryBand({
      signals: buildManualCheckInSignals({
        soreness: 5,
        fatigue: 4,
      }),
    });

    expect(payload.band).toBe("prioritize_recovery");
    expect(payload.dataSufficiency).toBe("partial");
    expect(payload.signals.length).toBeGreaterThan(0);
  });

  it("returns well_supported for low load manual check-ins", () => {
    const payload = computeRecoveryBand({
      signals: buildManualCheckInSignals({
        soreness: 1,
        fatigue: 2,
        moodScore: 5,
      }),
    });

    expect(payload.band).toBe("well_supported");
  });

  it("returns moderate_load for middle recovery signals", () => {
    const payload = computeRecoveryBand({
      signals: buildManualCheckInSignals({
        soreness: 3,
        fatigue: 3,
        moodScore: 3,
      }),
    });

    expect(payload.band).toBe("moderate_load");
    expect(payload.dataSufficiency).toBe("sufficient");
  });

  it("defaults to moderate_load when manual recovery is strong but sleep is poor", () => {
    const payload = computeRecoveryBand({
      signals: [
        ...buildManualCheckInSignals({
          soreness: 1,
          fatigue: 1,
          moodScore: 5,
        }),
        {
          source: "device_sleep",
          label: "Synced sleep summary",
          detail: "Shorter sleep duration logged",
          loadScore: 5,
          recoveryScore: 1,
        },
      ],
    });

    expect(payload.band).toBe("moderate_load");
  });

  it("uses wellness-safe focus messages", () => {
    const payload = computeRecoveryBand({
      signals: buildManualCheckInSignals({
        soreness: 2,
        fatigue: 2,
      }),
    });

    expect(isWellnessSafeRecoveryMessage(payload.focusMessage)).toBe(true);
    expect(payload.focusMessage).not.toMatch(/score/i);
  });

  it("blocks unsafe recovery copy patterns", () => {
    expect(isWellnessSafeRecoveryMessage("Your readiness score is 82 today.")).toBe(false);
    expect(isWellnessSafeRecoveryMessage("This may diagnose overtraining.")).toBe(false);
    expect(isWellnessSafeRecoveryMessage("Based on what you logged, keep the day lighter.")).toBe(
      true,
    );
  });

  it("treats vendor readiness as one qualitative input without exposing the raw score", () => {
    const payload = computeRecoveryBand({
      signals: [buildDeviceRecoveryInputSignal("readiness_score", 82)],
    });

    expect(payload.signals).toEqual([
      expect.objectContaining({
        source: "device_recovery_input",
        label: "Synced recovery metric",
        detail: "Vendor readiness input recorded as one signal only",
      }),
    ]);
    expect(JSON.stringify(payload)).not.toContain("82");
    expect(JSON.stringify(payload)).not.toMatch(/readiness score|recovery score/i);
  });

  it("aggregates weekly recovery progress and omits insufficient-only weeks", () => {
    const entries = buildRecoveryWeeklyEntries(
      [
        {
          date: "2026-05-19",
          band: "prioritize_recovery",
          payload: {
            band: "prioritize_recovery",
            dataSufficiency: "partial",
            signals: [{ source: "manual_check_in", label: "Fatigue check-in" }],
            focusMessage: "Recovery focus",
          },
        },
      ],
      "2026-05-19",
    );
    const summary = aggregateRecoveryProgress(entries, 1);

    expect(entries).toHaveLength(7);
    expect(summary.daysWithContext).toBe(1);
    expect(summary.dominantBand).toBe("prioritize_recovery");
    expect(summary.checkInCount).toBe(1);
    expect(isWellnessSafeRecoveryMessage(summary.message)).toBe(true);
    expect(summary.message).not.toMatch(/score|clinical|diagnos|treat/i);
  });

  it("keeps all recovery band focus messages wellness-safe", () => {
    for (const band of [
      "well_supported",
      "moderate_load",
      "prioritize_recovery",
      "insufficient_data",
    ] as const) {
      const payload = computeRecoveryBand({
        signals:
          band === "insufficient_data"
            ? []
            : [
                {
                  source: "manual_check_in",
                  label: `${band} signal`,
                  loadScore: band === "prioritize_recovery" ? 4 : 2,
                  recoveryScore: band === "well_supported" ? 5 : 3,
                },
              ],
      });

      expect(isWellnessSafeRecoveryMessage(payload.focusMessage)).toBe(true);
      expect(payload.focusMessage).not.toMatch(/score|clinical|diagnos|treat/i);
    }
  });

  it("parses recovery API response contracts", () => {
    const snapshot = recoveryContextSnapshotSchema.parse({
      id: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
      userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b82",
      date: "2026-05-25",
      band: "moderate_load",
      payload: {
        band: "moderate_load",
        dataSufficiency: "partial",
        signals: [{ source: "manual_check_in", label: "Fatigue check-in" }],
        focusMessage: "Based on what you logged, today may carry a moderate load.",
      },
      calculatedAt: "2026-05-25T12:00:00.000Z",
      createdAt: "2026-05-25T12:00:00.000Z",
      updatedAt: "2026-05-25T12:00:00.000Z",
    });

    expect(
      recoveryContextResponseSchema.parse({
        context: snapshot,
        checkIn: recoveryCheckInRecordSchema.parse({
          id: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b83",
          userId: snapshot.userId,
          date: snapshot.date,
          soreness: 3,
          fatigue: 3,
          moodScore: null,
          perceivedStress: null,
          source: "user_entry",
          createdAt: snapshot.createdAt,
          updatedAt: snapshot.updatedAt,
        }),
      }),
    ).toBeTruthy();
  });

  it("blocks volume increases during prioritize_recovery unless override is set", () => {
    expect(
      getRecoveryWorkoutAdaptationVolumeErrors({
        increasesVolumeOrLoad: true,
        recoveryBand: "prioritize_recovery",
      }),
    ).toHaveLength(1);
    expect(
      getRecoveryWorkoutAdaptationVolumeErrors({
        increasesVolumeOrLoad: true,
        recoveryBand: "prioritize_recovery",
        allowVolumeIncrease: true,
      }),
    ).toEqual([]);
    expect(
      getRecoveryWorkoutAdaptationVolumeErrors({
        increasesVolumeOrLoad: false,
        recoveryBand: "prioritize_recovery",
      }),
    ).toEqual([]);
  });
});
