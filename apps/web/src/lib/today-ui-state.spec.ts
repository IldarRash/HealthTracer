import { describe, expect, it } from "vitest";
import {
  buildFeedbackPayload,
  canSubmitTodayFeedback,
  canUpdateTodayItem,
  formatAdherenceScore,
  formatAdherenceSummary,
  formatDisplayDate,
  formatLocalIsoDate,
  historyEntrySummaryLabel,
  todayItemKindLabel,
  todayItemStatusBadgeClass,
  todayItemStatusLabel,
} from "./today-ui-state.js";

describe("today UI state", () => {
  it("formats display dates from ISO strings", () => {
    expect(formatDisplayDate("2026-05-22")).not.toBe("2026-05-22");
    expect(formatDisplayDate("2026-05-22")).toContain("2026");
    expect(formatLocalIsoDate(new Date(2026, 4, 22))).toBe("2026-05-22");
    expect(formatDisplayDate("not-a-date")).toBe("not-a-date");
  });

  it("maps item status and kind labels", () => {
    expect(todayItemStatusLabel("pending")).toBe("Pending");
    expect(todayItemStatusLabel("completed")).toBe("Completed");
    expect(todayItemKindLabel("workout")).toBe("Workout");
    expect(todayItemStatusBadgeClass("skipped")).toBe("badge badge-session-skipped");
  });

  it("allows updates only for pending items", () => {
    expect(canUpdateTodayItem({ status: "pending" })).toBe(true);
    expect(canUpdateTodayItem({ status: "completed" })).toBe(false);
  });

  it("formats adherence score and summary", () => {
    expect(formatAdherenceScore({ score: null })).toBe("—");
    expect(formatAdherenceScore({ score: 0.75 })).toBe("75%");
    expect(
      formatAdherenceSummary({
        completedRequired: 2,
        totalRequired: 4,
        skippedRequired: 1,
      }),
    ).toBe("2 of 4 required tasks completed · 1 skipped");
    expect(
      formatAdherenceSummary({
        completedRequired: 0,
        totalRequired: 0,
        skippedRequired: 0,
      }),
    ).toBe("No required tasks for this day.");
  });

  it("builds feedback payloads from form values", () => {
    expect(
      buildFeedbackPayload({
        notes: "Felt steady",
        energy: "7",
        difficulty: "",
      }),
    ).toEqual({ notes: "Felt steady", energy: 7 });

    expect(
      buildFeedbackPayload({
        notes: "",
        energy: "",
        difficulty: "5",
      }),
    ).toEqual({ difficulty: 5 });
  });

  it("validates feedback submit button state", () => {
    expect(
      canSubmitTodayFeedback({
        notes: "",
        energy: "",
        difficulty: "",
        existingFeedback: null,
      }),
    ).toBe(false);

    expect(
      canSubmitTodayFeedback({
        notes: "Quick note only",
        energy: "",
        difficulty: "",
        existingFeedback: null,
      }),
    ).toBe(true);

    expect(
      canSubmitTodayFeedback({
        notes: "Good day",
        energy: "11",
        difficulty: "",
        existingFeedback: null,
      }),
    ).toBe(false);

    expect(
      canSubmitTodayFeedback({
        notes: "Good day",
        energy: "7",
        difficulty: "4",
        existingFeedback: { notes: "Good day", energy: 7, difficulty: 4 },
      }),
    ).toBe(false);

    expect(
      canSubmitTodayFeedback({
        notes: "Updated note",
        energy: "7",
        difficulty: "4",
        existingFeedback: { notes: "Good day", energy: 7, difficulty: 4 },
      }),
    ).toBe(true);
  });

  it("summarizes history entries", () => {
    expect(
      historyEntrySummaryLabel({
        date: "2026-05-20",
        adherence: {
          score: 0.5,
          completedRequired: 1,
          totalRequired: 2,
          completedOptional: 0,
          skippedRequired: 0,
          skippedOptional: 0,
        },
        itemCount: 2,
        hasFeedback: true,
      }),
    ).toBe("50% adherence · 2 tasks · Feedback saved");

    expect(
      historyEntrySummaryLabel({
        date: "2026-05-21",
        adherence: {
          score: null,
          completedRequired: 0,
          totalRequired: 0,
          completedOptional: 0,
          skippedRequired: 0,
          skippedOptional: 0,
        },
        itemCount: 0,
        hasFeedback: false,
      }),
    ).toBe("No score · 0 tasks · No feedback");

    expect(
      historyEntrySummaryLabel({
        date: "2026-05-19",
        adherence: {
          score: 1,
          completedRequired: 1,
          totalRequired: 1,
          completedOptional: 0,
          skippedRequired: 0,
          skippedOptional: 0,
        },
        itemCount: 1,
        hasFeedback: false,
      }),
    ).toBe("100% adherence · 1 task · No feedback");
  });
});
