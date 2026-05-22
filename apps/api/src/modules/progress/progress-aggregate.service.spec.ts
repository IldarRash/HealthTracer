import type { WorkoutSession } from "@health/types";
import { describe, expect, it } from "vitest";
import {
  aggregateWorkoutSessions,
  buildDeferredDomains,
  buildSummaryUserMessage,
  detectWorkoutTrends,
  isWellnessSafeProgressMessage,
  resolvePriorWeekRange,
  resolveProgressDataStatus,
  resolveWeekRange,
} from "./progress-aggregate.service.js";

const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
const planId = "3f98f3dd-806d-4386-8c5f-43499626c5d6";
const revisionId = "880099c6-3b5f-4383-8246-97b72bf61818";
const timestamp = "2026-05-22T12:00:00.000Z";

function buildSession(
  overrides: Partial<WorkoutSession> & Pick<WorkoutSession, "plannedDate" | "status">,
): WorkoutSession {
  return {
    id: overrides.id ?? "78d40655-b4b5-47b3-b28e-470192e05f04",
    userId,
    workoutPlanId: planId,
    workoutPlanRevisionId: revisionId,
    plannedDate: overrides.plannedDate,
    title: overrides.title ?? "Training day",
    status: overrides.status,
    exercises: [],
    feedback: overrides.feedback ?? {},
    completedAt: overrides.completedAt ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe("ProgressAggregateService", () => {
  it("resolves monday-based week ranges", () => {
    const range = resolveWeekRange(new Date("2026-05-22T12:00:00.000Z"));

    expect(range).toEqual({
      weekStart: "2026-05-18",
      weekEnd: "2026-05-24",
    });
  });

  it("aggregates workout completion counts for a week", () => {
    const aggregate = aggregateWorkoutSessions(
      [
        buildSession({ plannedDate: "2026-05-19", status: "completed" }),
        buildSession({
          id: "88d40655-b4b5-47b3-b28e-470192e05f05",
          plannedDate: "2026-05-21",
          status: "skipped",
        }),
        buildSession({
          id: "98d40655-b4b5-47b3-b28e-470192e05f06",
          plannedDate: "2026-05-22",
          status: "planned",
        }),
      ],
      "2026-05-18",
      "2026-05-24",
    );

    expect(aggregate.plannedCount).toBe(3);
    expect(aggregate.completedCount).toBe(1);
    expect(aggregate.skippedCount).toBe(1);
    expect(aggregate.adherencePercent).toBe(33);
    expect(aggregate.activeDays).toBe(2);
  });

  it("labels insufficient summary data when no workouts exist", () => {
    const aggregates = { workout: null };
    const status = resolveProgressDataStatus(aggregates);
    const message = buildSummaryUserMessage(aggregates, status);

    expect(status).toBe("insufficient");
    expect(message).toContain("not enough workout history");
    expect(isWellnessSafeProgressMessage(message)).toBe(true);
  });

  it("marks workout-only summaries as partial and lists deferred domains", () => {
    const aggregate = aggregateWorkoutSessions(
      [buildSession({ plannedDate: "2026-05-19", status: "completed" })],
      "2026-05-18",
      "2026-05-24",
    );
    const aggregates = { workout: aggregate };
    const status = resolveProgressDataStatus(aggregates);
    const deferredDomains = buildDeferredDomains();

    expect(status).toBe("partial");
    expect(deferredDomains.map((domain) => domain.domain)).toEqual([
      "today",
      "nutrition",
      "recipes",
      "recovery",
    ]);
  });

  it("labels insufficient trend data when the week is too sparse", () => {
    const current = aggregateWorkoutSessions(
      [buildSession({ plannedDate: "2026-05-19", status: "completed" })],
      "2026-05-18",
      "2026-05-24",
    );
    const trends = detectWorkoutTrends(current, null, "2026-05-18", "2026-05-24");
    const insufficientTrends = trends.filter(
      (trend) => trend.dataSufficiency === "insufficient",
    );

    expect(insufficientTrends.length).toBeGreaterThan(0);
    for (const trend of trends) {
      expect(isWellnessSafeProgressMessage(trend.message)).toBe(true);
      expect(trend.message.toLowerCase()).not.toContain("diagnosis");
    }
  });

  it("detects a higher completion pattern when prior-week data is available", () => {
    const priorWeek = resolvePriorWeekRange("2026-05-18");
    const current = aggregateWorkoutSessions(
      [
        buildSession({ plannedDate: "2026-05-19", status: "completed" }),
        buildSession({
          id: "88d40655-b4b5-47b3-b28e-470192e05f05",
          plannedDate: "2026-05-21",
          status: "completed",
        }),
      ],
      "2026-05-18",
      "2026-05-24",
    );
    const prior = aggregateWorkoutSessions(
      [
        buildSession({
          id: "98d40655-b4b5-47b3-b28e-470192e05f06",
          plannedDate: priorWeek.weekStart,
          status: "skipped",
        }),
        buildSession({
          id: "a8d40655-b4b5-47b3-b28e-470192e05f07",
          plannedDate: "2026-05-11",
          status: "completed",
        }),
      ],
      priorWeek.weekStart,
      priorWeek.weekEnd,
    );

    const completionTrend = detectWorkoutTrends(
      current,
      prior,
      "2026-05-18",
      "2026-05-24",
    ).find((trend) => trend.trendType === "completion_rate");

    expect(completionTrend?.direction).toBe("up");
    expect(completionTrend?.message).toContain("higher share");
  });

  it("rejects wellness-unsafe summary and trend language", () => {
    expect(isWellnessSafeProgressMessage("You completed 2 of 3 sessions this week.")).toBe(
      true,
    );
    expect(isWellnessSafeProgressMessage("This pattern suggests a clinical diagnosis.")).toBe(
      false,
    );
    expect(isWellnessSafeProgressMessage("Your recovery score dropped this week.")).toBe(
      false,
    );
  });

  it("builds a zero-completion summary without medical certainty language", () => {
    const aggregate = aggregateWorkoutSessions(
      [
        buildSession({ plannedDate: "2026-05-19", status: "planned" }),
        buildSession({
          id: "88d40655-b4b5-47b3-b28e-470192e05f05",
          plannedDate: "2026-05-21",
          status: "skipped",
        }),
      ],
      "2026-05-18",
      "2026-05-24",
    );
    const message = buildSummaryUserMessage({ workout: aggregate }, "partial");

    expect(message).toContain("none were marked completed");
    expect(isWellnessSafeProgressMessage(message)).toBe(true);
  });

  it("resolves the prior monday-based week range", () => {
    expect(resolvePriorWeekRange("2026-05-18")).toEqual({
      weekStart: "2026-05-11",
      weekEnd: "2026-05-17",
    });
  });
});
