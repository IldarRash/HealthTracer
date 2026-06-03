import { describe, expect, it } from "vitest";
import { buildDefaultAiBehaviorConfig } from "./ai-behavior-config.js";
import {
  DEFAULT_DIRECT_PATH_REPLY_TEMPLATES,
  formatTodaySummaryReadMessage,
  formatWorkoutMarkedDoneMessage,
} from "./direct-chat-path-replies.js";
import type { TodayDayResponseBase } from "./today.js";

const todayIsoDate = "2026-05-28";

function buildSampleDay(): TodayDayResponseBase {
  return {
    id: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
    userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
    date: todayIsoDate,
    items: [
      {
        id: "880099c6-3b5f-4383-8246-97b72bf61818",
        label: "Strength session",
        kind: "workout",
        status: "pending",
        required: true,
        source: { type: "workout_session", id: "78d40655-b4b5-47b3-b28e-470192e05f04" },
      },
      {
        id: "a1000001-0000-4000-8000-000000000001",
        label: "Drink water",
        kind: "hydration",
        status: "completed",
        required: false,
        source: { type: "custom" },
      },
    ],
    source: "generated",
    feedback: null,
    adherence: {
      score: 0.5,
      completedRequired: 0,
      totalRequired: 1,
      completedOptional: 1,
      skippedRequired: 0,
      skippedOptional: 0,
    },
    createdAt: new Date("2026-05-27T12:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-05-27T12:00:00.000Z").toISOString(),
    workout: {
      sessionId: "78d40655-b4b5-47b3-b28e-470192e05f04",
      workoutPlanId: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
      workoutPlanRevisionId: "880099c6-3b5f-4383-8246-97b72bf61818",
      plannedDate: todayIsoDate,
      weekday: "wednesday",
      title: "Strength session",
      focus: "Upper body",
      status: "planned",
      exercises: [],
      isRestDay: false,
    },
  };
}

describe("direct chat path reply templates", () => {
  it("formats today summary from default templates", () => {
    const message = formatTodaySummaryReadMessage(
      buildSampleDay(),
      todayIsoDate,
      DEFAULT_DIRECT_PATH_REPLY_TEMPLATES.todaySummary,
    );

    expect(message).toBe(
      [
        `Here's your Today summary for ${todayIsoDate}:`,
        "",
        "Checklist (0/1 required done):",
        "- [pending] Strength session (workout)",
        "- [done] Drink water (hydration)",
        "",
        "Workout: Strength session — planned, 0 exercise(s)",
        "",
        "Adherence: 50% (0 of 1 required items completed)",
      ].join("\n"),
    );
  });

  it("uses ai-behavior default reply templates for parity", () => {
    const configTemplates = buildDefaultAiBehaviorConfig().directPaths.replyTemplates;

    expect(
      formatTodaySummaryReadMessage(buildSampleDay(), todayIsoDate, configTemplates.todaySummary),
    ).toEqual(
      formatTodaySummaryReadMessage(
        buildSampleDay(),
        todayIsoDate,
        DEFAULT_DIRECT_PATH_REPLY_TEMPLATES.todaySummary,
      ),
    );
  });

  it("interpolates workout marked done template", () => {
    expect(formatWorkoutMarkedDoneMessage("Strength session")).toBe(
      'Marked "Strength session" as done on your Today checklist.',
    );
  });
});
