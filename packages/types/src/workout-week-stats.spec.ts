import { describe, expect, it } from "vitest";
import type { WorkoutSession } from "./workouts.js";
import { aggregateWorkoutWeek, formatWorkoutWeekLabel } from "./workout-week-stats.js";

const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
const planId = "3f98f3dd-806d-4386-8c5f-43499626c5d6";
const revisionId = "880099c6-3b5f-4383-8246-97b72bf61818";
const timestamp = "2026-05-22T12:00:00.000Z";

function makeSession(
  opts: Pick<WorkoutSession, "plannedDate" | "status"> &
    Partial<Pick<WorkoutSession, "source" | "id">>,
): WorkoutSession {
  return {
    id: opts.id ?? "00000000-0000-4000-8000-000000000001",
    userId,
    workoutPlanId: planId,
    workoutPlanRevisionId: revisionId,
    plannedDate: opts.plannedDate,
    title: "Training day",
    status: opts.status,
    source: opts.source ?? "planned",
    exercises: [],
    feedback: {},
    completedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const WEEK_START = "2026-05-18"; // Monday
const WEEK_END = "2026-05-24";   // Sunday

describe("aggregateWorkoutWeek", () => {
  it("returns zero counts for an empty session list", () => {
    const stats = aggregateWorkoutWeek([], WEEK_START, WEEK_END);
    expect(stats.plannedCount).toBe(0);
    expect(stats.plannedCompletedCount).toBe(0);
    expect(stats.adHocCompletedCount).toBe(0);
    expect(stats.completedCount).toBe(0);
    expect(stats.skippedCount).toBe(0);
    expect(stats.adherencePercent).toBe(0);
    expect(stats.activeDays).toBe(0);
    expect(stats.days).toHaveLength(7);
    expect(stats.days.every((d) => d.state === "none")).toBe(true);
  });

  it("counts planned sessions and adherence correctly", () => {
    const sessions = [
      makeSession({ id: "1", plannedDate: "2026-05-18", status: "completed" }),
      makeSession({ id: "2", plannedDate: "2026-05-20", status: "completed" }),
      makeSession({ id: "3", plannedDate: "2026-05-21", status: "skipped" }),
      makeSession({ id: "4", plannedDate: "2026-05-22", status: "planned" }),
    ];
    const stats = aggregateWorkoutWeek(sessions, WEEK_START, WEEK_END);
    expect(stats.plannedCount).toBe(4);
    expect(stats.plannedCompletedCount).toBe(2);
    expect(stats.skippedCount).toBe(1);
    expect(stats.adherencePercent).toBe(50);
    expect(stats.activeDays).toBe(2);
  });

  it("ad-hoc sessions inflate completedCount and activeDays but never plannedCount or adherence", () => {
    const sessions = [
      makeSession({ id: "1", plannedDate: "2026-05-18", status: "completed" }),
      makeSession({ id: "2", plannedDate: "2026-05-19", status: "completed", source: "ad_hoc" }),
      makeSession({ id: "3", plannedDate: "2026-05-20", status: "completed", source: "ad_hoc" }),
    ];
    const stats = aggregateWorkoutWeek(sessions, WEEK_START, WEEK_END);
    expect(stats.plannedCount).toBe(1);
    expect(stats.plannedCompletedCount).toBe(1);
    expect(stats.adHocCompletedCount).toBe(2);
    expect(stats.completedCount).toBe(3);
    expect(stats.adherencePercent).toBe(100);
    expect(stats.activeDays).toBe(3);
  });

  it("excludes sessions outside the week window", () => {
    const sessions = [
      makeSession({ id: "1", plannedDate: "2026-05-17", status: "completed" }), // Sunday before
      makeSession({ id: "2", plannedDate: "2026-05-18", status: "completed" }), // in window
      makeSession({ id: "3", plannedDate: "2026-05-25", status: "completed" }), // Monday after
    ];
    const stats = aggregateWorkoutWeek(sessions, WEEK_START, WEEK_END);
    expect(stats.completedCount).toBe(1);
    expect(stats.plannedCount).toBe(1);
  });

  it("returns adherencePercent 0 when plannedCount is 0", () => {
    const sessions = [
      makeSession({ plannedDate: "2026-05-18", status: "completed", source: "ad_hoc" }),
    ];
    const stats = aggregateWorkoutWeek(sessions, WEEK_START, WEEK_END);
    expect(stats.plannedCount).toBe(0);
    expect(stats.adherencePercent).toBe(0);
  });

  it("produces 7 days[] entries covering Mon-Sun", () => {
    const stats = aggregateWorkoutWeek([], WEEK_START, WEEK_END);
    expect(stats.days).toHaveLength(7);
    expect(stats.days[0]?.date).toBe("2026-05-18");
    expect(stats.days[6]?.date).toBe("2026-05-24");
  });

  it("populates days[] states: completed > skipped > planned > none", () => {
    const sessions = [
      makeSession({ id: "1", plannedDate: "2026-05-18", status: "completed" }),
      makeSession({ id: "2", plannedDate: "2026-05-19", status: "skipped" }),
      makeSession({ id: "3", plannedDate: "2026-05-20", status: "planned" }),
    ];
    const stats = aggregateWorkoutWeek(sessions, WEEK_START, WEEK_END);
    const byDate = Object.fromEntries(stats.days.map((d) => [d.date, d.state]));
    expect(byDate["2026-05-18"]).toBe("completed");
    expect(byDate["2026-05-19"]).toBe("skipped");
    expect(byDate["2026-05-20"]).toBe("planned");
    expect(byDate["2026-05-21"]).toBe("none");
  });

  it("marks a day completed when both planned and ad-hoc sessions are present", () => {
    const sessions = [
      makeSession({ id: "1", plannedDate: "2026-05-18", status: "skipped" }),
      makeSession({ id: "2", plannedDate: "2026-05-18", status: "completed", source: "ad_hoc" }),
    ];
    const stats = aggregateWorkoutWeek(sessions, WEEK_START, WEEK_END);
    expect(stats.days[0]?.state).toBe("completed");
  });
});

describe("formatWorkoutWeekLabel", () => {
  function makeStats(overrides: Partial<ReturnType<typeof aggregateWorkoutWeek>>) {
    return {
      plannedCount: 0,
      plannedCompletedCount: 0,
      adHocCompletedCount: 0,
      completedCount: 0,
      skippedCount: 0,
      adherencePercent: 0,
      activeDays: 0,
      days: [],
      ...overrides,
    };
  }

  it("returns empty-week label when no sessions", () => {
    const label = formatWorkoutWeekLabel(makeStats({}));
    expect(label).toBe("No sessions logged this week");
  });

  it("formats planned sessions completed", () => {
    const label = formatWorkoutWeekLabel(
      makeStats({ plannedCount: 4, plannedCompletedCount: 3, adherencePercent: 75 }),
    );
    expect(label).toBe("3 of 4 planned sessions completed");
  });

  it("appends ad-hoc suffix when ad-hoc count > 0", () => {
    const label = formatWorkoutWeekLabel(
      makeStats({
        plannedCount: 3,
        plannedCompletedCount: 2,
        adHocCompletedCount: 1,
        adherencePercent: 67,
      }),
    );
    expect(label).toBe("2 of 3 planned sessions completed · +1 ad-hoc");
  });

  it("uses singular 'session' when plannedCount is 1", () => {
    const label = formatWorkoutWeekLabel(
      makeStats({ plannedCount: 1, plannedCompletedCount: 1, adherencePercent: 100 }),
    );
    expect(label).toBe("1 of 1 planned session completed");
  });

  it("uses ad-hoc-only label when no planned sessions but ad-hoc present", () => {
    const label = formatWorkoutWeekLabel(
      makeStats({ plannedCount: 0, adHocCompletedCount: 3 }),
    );
    expect(label).toBe("3 ad-hoc activities logged this week");
  });

  it("uses singular 'activity' when 1 ad-hoc", () => {
    const label = formatWorkoutWeekLabel(
      makeStats({ plannedCount: 0, adHocCompletedCount: 1 }),
    );
    expect(label).toBe("1 ad-hoc activity logged this week");
  });
});
