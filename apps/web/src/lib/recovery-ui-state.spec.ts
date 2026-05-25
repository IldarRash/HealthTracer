import { describe, expect, it } from "vitest";
import {
  buildRecoveryCheckInPayload,
  buildRecoveryCheckInSummaryView,
  buildRecoveryFocusView,
  canSubmitRecoveryCheckIn,
  checkInMatchesForm,
  recoveryBandLabel,
  recoveryDataSufficiencyMessage,
  sorenessScoreLabel,
} from "./recovery-ui-state.js";

const sampleCheckIn = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  date: "2026-05-25",
  soreness: 2 as const,
  fatigue: 3 as const,
  moodScore: 4 as const,
  perceivedStress: null,
  source: "user_entry" as const,
  createdAt: "2026-05-25T12:00:00.000Z",
  updatedAt: "2026-05-25T12:00:00.000Z",
};

const sampleContext = {
  id: "33333333-3333-4333-8333-333333333333",
  userId: "22222222-2222-4222-8222-222222222222",
  date: "2026-05-25",
  band: "moderate_load" as const,
  payload: {
    band: "moderate_load" as const,
    dataSufficiency: "partial" as const,
    signals: [
      {
        source: "manual_check_in" as const,
        label: "Soreness check-in",
        detail: "Low soreness",
      },
    ],
    focusMessage:
      "Based on what you logged, today may carry a moderate load. A balanced pace could help you stay consistent.",
  },
  calculatedAt: "2026-05-25T12:00:00.000Z",
  createdAt: "2026-05-25T12:00:00.000Z",
  updatedAt: "2026-05-25T12:00:00.000Z",
};

describe("recovery UI state", () => {
  it("maps soreness labels without score framing", () => {
    expect(sorenessScoreLabel(1)).toBe("None");
    expect(sorenessScoreLabel(5)).toBe("High");
    expect(recoveryBandLabel("well_supported")).toBe("Solid recovery support");
    expect(recoveryBandLabel("insufficient_data")).toBe("Building picture");
  });

  it("builds upsert payloads with optional mood and stress", () => {
    expect(
      buildRecoveryCheckInPayload({
        soreness: 2,
        fatigue: 3,
        moodScore: null,
        perceivedStress: null,
        date: "2026-05-25",
      }),
    ).toEqual({
      soreness: 2,
      fatigue: 3,
      moodScore: null,
      perceivedStress: null,
      date: "2026-05-25",
      source: "user_entry",
    });
  });

  it("validates submit state for new and unchanged check-ins", () => {
    expect(
      canSubmitRecoveryCheckIn({
        soreness: 2,
        fatigue: 3,
        moodScore: null,
        perceivedStress: null,
        existingCheckIn: null,
      }),
    ).toBe(true);

    expect(
      canSubmitRecoveryCheckIn({
        soreness: null,
        fatigue: 3,
        moodScore: null,
        perceivedStress: null,
        existingCheckIn: null,
      }),
    ).toBe(false);

    expect(
      canSubmitRecoveryCheckIn({
        soreness: 2,
        fatigue: 3,
        moodScore: 4,
        perceivedStress: null,
        existingCheckIn: sampleCheckIn,
      }),
    ).toBe(false);

    expect(
      canSubmitRecoveryCheckIn({
        soreness: 3,
        fatigue: 3,
        moodScore: 4,
        perceivedStress: null,
        existingCheckIn: sampleCheckIn,
      }),
    ).toBe(true);
  });

  it("detects unchanged form values", () => {
    expect(
      checkInMatchesForm({
        soreness: 2,
        fatigue: 3,
        moodScore: 4,
        perceivedStress: null,
        existingCheckIn: sampleCheckIn,
      }),
    ).toBe(true);
  });

  it("builds saved summary without readiness score language", () => {
    const view = buildRecoveryCheckInSummaryView(sampleCheckIn);
    expect(view.status).toBe("saved");
    expect(view.detailLine).toContain("Mild soreness");
    expect(view.detailLine).not.toMatch(/readiness|score|clinical|diagnos/i);
  });

  it("builds focus view from context snapshot", () => {
    const view = buildRecoveryFocusView(sampleContext);
    expect(view.bandLabel).toBe("Moderate load");
    expect(view.focusMessage).toContain("moderate load");
    expect(view.sufficiencyMessage).toBe(recoveryDataSufficiencyMessage("partial"));
    expect(view.signalLabels).toHaveLength(1);
    expect(view.sparse).toBe(true);
    expect(JSON.stringify(view)).not.toMatch(/readiness score|recovery score|clinical|diagnos|treat/i);
  });

  it("keeps sparse recovery focus copy wellness-safe and score-free", () => {
    const view = buildRecoveryFocusView({
      ...sampleContext,
      band: "insufficient_data",
      payload: {
        band: "insufficient_data",
        dataSufficiency: "insufficient",
        signals: [],
        focusMessage:
          "Not enough recovery data yet. Log how you feel today to build a clearer recovery focus.",
      },
    });

    expect(view.bandLabel).toBe("Building picture");
    expect(view.sparse).toBe(true);
    expect(view.signalLabels).toEqual([]);
    expect(JSON.stringify(view)).not.toMatch(/readiness score|recovery score|clinical|diagnos|treat/i);
  });
});
