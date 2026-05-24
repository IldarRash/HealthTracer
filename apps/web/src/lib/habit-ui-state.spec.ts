import { describe, expect, it } from "vitest";
import type { HabitAdherenceResponse } from "@health/types";
import {
  buildHabitAdherenceSummaryView,
  formatHabitCompletionRate,
  formatHabitStreak,
  selectPrimaryRequiredHabit,
} from "./habit-ui-state.js";

const sampleHabitId = "a1000001-0000-4000-8000-000000000001";
const secondaryHabitId = "a1000002-0000-4000-8000-000000000002";

function createAdherenceResponse(
  overrides: Partial<HabitAdherenceResponse> = {},
): HabitAdherenceResponse {
  return {
    plan: {
      window: 7,
      windowStart: "2026-05-18",
      windowEnd: "2026-05-24",
      scheduled: 7,
      completed: 5,
      skipped: 1,
      missed: 1,
      requiredCompletionRate: 0.7143,
      ...overrides.plan,
    },
    habits: overrides.habits ?? [
      {
        habitDefinitionId: sampleHabitId,
        title: "Morning hydration",
        required: true,
        scheduled: 7,
        completed: 5,
        skipped: 1,
        missed: 1,
        completionRate: 0.7143,
        currentStreak: 3,
      },
      {
        habitDefinitionId: secondaryHabitId,
        title: "Evening walk",
        required: true,
        scheduled: 7,
        completed: 4,
        skipped: 2,
        missed: 1,
        completionRate: 0.5714,
        currentStreak: 1,
      },
    ],
  };
}

describe("habit-ui-state", () => {
  it("formats completion rates and streak labels", () => {
    expect(formatHabitCompletionRate(null)).toBe("—");
    expect(formatHabitCompletionRate(0.7143)).toBe("71%");
    expect(formatHabitStreak(0)).toBe("No active streak");
    expect(formatHabitStreak(1)).toBe("1-day streak");
    expect(formatHabitStreak(4)).toBe("4-day streak");
  });

  it("selects the required habit with the highest streak", () => {
    const primary = selectPrimaryRequiredHabit(createAdherenceResponse().habits);

    expect(primary?.habitDefinitionId).toBe(sampleHabitId);
    expect(primary?.currentStreak).toBe(3);
  });

  it("returns null when no required habits exist", () => {
    const primary = selectPrimaryRequiredHabit([
      {
        habitDefinitionId: sampleHabitId,
        title: "Optional stretch",
        required: false,
        scheduled: 7,
        completed: 2,
        skipped: 0,
        missed: 5,
        completionRate: 0.2857,
        currentStreak: 2,
      },
    ]);

    expect(primary).toBeNull();
  });

  it("builds an empty summary view when no habits are returned", () => {
    expect(buildHabitAdherenceSummaryView(createAdherenceResponse({ habits: [] }))).toEqual({
      status: "empty",
    });
    expect(buildHabitAdherenceSummaryView(null)).toEqual({ status: "empty" });
  });

  it("builds a ready summary view with primary streak details", () => {
    expect(buildHabitAdherenceSummaryView(createAdherenceResponse())).toEqual({
      status: "ready",
      requiredCompletionRate: "71%",
      streakTitle: "Morning hydration",
      streakDetail: "3-day streak",
    });
  });

  it("uses a fallback streak message when no required habits exist", () => {
    expect(
      buildHabitAdherenceSummaryView(
        createAdherenceResponse({
          plan: {
            window: 7,
            windowStart: "2026-05-18",
            windowEnd: "2026-05-24",
            scheduled: 7,
            completed: 2,
            skipped: 0,
            missed: 5,
            requiredCompletionRate: null,
          },
          habits: [
            {
              habitDefinitionId: sampleHabitId,
              title: "Optional stretch",
              required: false,
              scheduled: 7,
              completed: 2,
              skipped: 0,
              missed: 5,
              completionRate: 0.2857,
              currentStreak: 2,
            },
          ],
        }),
      ),
    ).toEqual({
      status: "ready",
      requiredCompletionRate: "—",
      streakTitle: "Required habit streak",
      streakDetail: "No required habits in your plan yet.",
    });
  });
});
