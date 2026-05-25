import { describe, expect, it } from "vitest";
import {
  WELLBEING_CRISIS_SUPPORT_COPY,
  WELLBEING_CRISIS_KEYWORDS,
} from "@health/types";
import {
  buildSevenDayWellbeingTrend,
  buildWellbeingCheckInPayload,
  buildWellbeingCheckInSummaryView,
  buildWellbeingHistoryPanelView,
  canSubmitWellbeingCheckIn,
  checkInMatchesForm,
  moodScoreLabel,
  resolveWellbeingCrisisDisplay,
  resolveWellbeingCrisisPreview,
  stressScoreLabel,
  wellbeingDataSufficiencyMessage,
  wellbeingScoreFillPercent,
  wellbeingTrendDirectionLabel,
} from "./wellbeing-ui-state.js";

const sampleCheckIn = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  date: "2026-05-25",
  moodScore: 4 as const,
  stressScore: 2 as const,
  tags: [],
  note: null,
  source: "user_entry" as const,
  crisisFlagReasons: [],
  createdAt: "2026-05-25T12:00:00.000Z",
  updatedAt: "2026-05-25T12:00:00.000Z",
};

describe("wellbeing UI state", () => {
  it("maps mood and stress score labels", () => {
    expect(moodScoreLabel(1)).toBe("Very low");
    expect(moodScoreLabel(5)).toBe("Great");
    expect(stressScoreLabel(1)).toBe("Very calm");
    expect(stressScoreLabel(5)).toBe("Very high");
  });

  it("computes fill percent for trend bars", () => {
    expect(wellbeingScoreFillPercent(null)).toBe(0);
    expect(wellbeingScoreFillPercent(1)).toBe(0);
    expect(wellbeingScoreFillPercent(3)).toBe(50);
    expect(wellbeingScoreFillPercent(5)).toBe(100);
  });

  it("builds upsert payloads with optional note", () => {
    expect(
      buildWellbeingCheckInPayload({
        moodScore: 3,
        stressScore: 4,
        note: "  ",
      }),
    ).toEqual({
      moodScore: 3,
      stressScore: 4,
      source: "user_entry",
    });

    expect(
      buildWellbeingCheckInPayload({
        moodScore: 3,
        stressScore: 4,
        note: "Felt steady",
      }),
    ).toEqual({
      moodScore: 3,
      stressScore: 4,
      note: "Felt steady",
      source: "user_entry",
    });
  });

  it("validates submit state for new and unchanged check-ins", () => {
    expect(
      canSubmitWellbeingCheckIn({
        moodScore: 3,
        stressScore: 3,
        note: "",
        existingCheckIn: null,
      }),
    ).toBe(true);

    expect(
      canSubmitWellbeingCheckIn({
        moodScore: null,
        stressScore: 3,
        note: "",
        existingCheckIn: null,
      }),
    ).toBe(false);

    expect(
      canSubmitWellbeingCheckIn({
        moodScore: 4,
        stressScore: 2,
        note: "",
        existingCheckIn: sampleCheckIn,
      }),
    ).toBe(false);

    expect(
      canSubmitWellbeingCheckIn({
        moodScore: 4,
        stressScore: 3,
        note: "",
        existingCheckIn: sampleCheckIn,
      }),
    ).toBe(true);
  });

  it("keeps Today check-in updates disabled when trimmed notes are unchanged", () => {
    expect(
      canSubmitWellbeingCheckIn({
        moodScore: 4,
        stressScore: 2,
        note: "   ",
        existingCheckIn: sampleCheckIn,
      }),
    ).toBe(false);

    expect(
      canSubmitWellbeingCheckIn({
        moodScore: 4,
        stressScore: 2,
        note: "  new private note  ",
        existingCheckIn: sampleCheckIn,
      }),
    ).toBe(true);
  });

  it("detects unchanged form values", () => {
    expect(
      checkInMatchesForm({
        moodScore: 4,
        stressScore: 2,
        note: "",
        existingCheckIn: sampleCheckIn,
      }),
    ).toBe(true);
  });

  it("shows crisis preview for lowest mood and flagged keywords", () => {
    expect(
      resolveWellbeingCrisisPreview({ moodScore: 1, note: "" }).shouldShowCrisisSupport,
    ).toBe(true);

    for (const keyword of WELLBEING_CRISIS_KEYWORDS) {
      expect(
        resolveWellbeingCrisisPreview({ moodScore: 4, note: keyword }).shouldShowCrisisSupport,
      ).toBe(true);
    }

    expect(
      resolveWellbeingCrisisPreview({ moodScore: 4, note: "steady day" })
        .shouldShowCrisisSupport,
    ).toBe(false);
  });

  it("prefers server crisis evaluation when present", () => {
    const preview = resolveWellbeingCrisisPreview({ moodScore: 4, note: "" });
    const server = resolveWellbeingCrisisPreview({ moodScore: 1, note: "" });

    expect(resolveWellbeingCrisisDisplay(preview, server).shouldShowCrisisSupport).toBe(true);
    expect(resolveWellbeingCrisisDisplay(preview, null).copy).toBeNull();
    expect(
      resolveWellbeingCrisisDisplay(
        resolveWellbeingCrisisPreview({ moodScore: 1, note: "" }),
        null,
      ).copy,
    ).toEqual(WELLBEING_CRISIS_SUPPORT_COPY);
  });

  it("uses static non-clinical support copy for Today crisis display", () => {
    const display = resolveWellbeingCrisisDisplay(
      resolveWellbeingCrisisPreview({ moodScore: 1, note: "" }),
      null,
    );

    expect(display.copy).toEqual(WELLBEING_CRISIS_SUPPORT_COPY);
    const copyText = JSON.stringify(display.copy).toLowerCase();
    expect(copyText).toContain("not a crisis service");
    expect(copyText).not.toContain("diagnosis");
    expect(copyText).not.toContain("treatment");
    expect(copyText).not.toContain("therapy");
  });

  it("builds saved summary view", () => {
    const view = buildWellbeingCheckInSummaryView(sampleCheckIn);
    expect(view.status).toBe("saved");
    if (view.status === "saved") {
      expect(view.summaryLine).toBe("Mood 4/5 · Stress 2/5");
      expect(view.moodLabel).toBe("Good");
      expect(view.stressLabel).toBe("Calm");
    }
  });

  it("keeps Today saved summary wellness-framed and note-free", () => {
    const view = buildWellbeingCheckInSummaryView({
      ...sampleCheckIn,
      note: "Private note should stay in the form only",
    });

    expect(view.status).toBe("saved");
    expect(JSON.stringify(view)).not.toContain("Private note");
    expect(JSON.stringify(view).toLowerCase()).not.toContain("symptom");
    expect(JSON.stringify(view).toLowerCase()).not.toContain("diagnosis");
  });

  it("builds seven day trend with sparse days", () => {
    const days = buildSevenDayWellbeingTrend({
      aggregates: [{ date: "2026-05-23", moodScore: 3, stressScore: 4 }],
      history: [{ date: "2026-05-25", moodScore: 4, stressScore: 2, tags: [], crisisFlagReasons: [], updatedAt: "2026-05-25T12:00:00.000Z" }],
      anchorDate: "2026-05-25",
    });

    expect(days).toHaveLength(7);
    expect(days.filter((day) => day.hasData)).toHaveLength(2);
    expect(days.at(-1)?.moodScore).toBe(4);
  });

  it("builds history panel empty and ready views", () => {
    expect(
      buildWellbeingHistoryPanelView({
        aggregates: [],
        history: [],
        summary: null,
        anchorDate: "2026-05-25",
      }).status,
    ).toBe("empty");

    const ready = buildWellbeingHistoryPanelView({
      aggregates: [
        { date: "2026-05-23", moodScore: 3, stressScore: 3 },
        { date: "2026-05-24", moodScore: 4, stressScore: 2 },
        { date: "2026-05-25", moodScore: 4, stressScore: 2 },
      ],
      history: [],
      summary: {
        windowDays: 7,
        checkInCount: 3,
        moodAverage: 3.67,
        stressAverage: 2.33,
        moodTrendDirection: "up",
        stressTrendDirection: "down",
        currentStreak: 3,
        dataSufficiency: "partial",
      },
      anchorDate: "2026-05-25",
    });

    expect(ready.status).toBe("ready");
    if (ready.status === "ready") {
      expect(ready.title).toBe("3 of 7 days logged");
      expect(ready.sparse).toBe(false);
      expect(ready.moodTrendLabel).toBe(wellbeingTrendDirectionLabel("up"));
      expect(ready.sufficiencyMessage).toBe(
        wellbeingDataSufficiencyMessage("partial"),
      );
    }
  });

  it("builds sparse Longevity history state with honest fallback labels", () => {
    const sparse = buildWellbeingHistoryPanelView({
      aggregates: [{ date: "2026-05-25", moodScore: 2, stressScore: 5 }],
      history: [],
      summary: null,
      anchorDate: "2026-05-25",
    });

    expect(sparse.status).toBe("ready");
    if (sparse.status !== "ready") {
      return;
    }

    expect(sparse.title).toBe("1 of 7 days logged");
    expect(sparse.sparse).toBe(true);
    expect(sparse.summaryLine).toBe("Recent mood and stress check-ins from Today.");
    expect(sparse.sufficiencyMessage).toBe(
      wellbeingDataSufficiencyMessage("insufficient"),
    );
    expect(sparse.moodTrendLabel).toBe(wellbeingTrendDirectionLabel("unknown"));
    expect(sparse.streakLabel).toBe("No active streak yet");
  });
});
