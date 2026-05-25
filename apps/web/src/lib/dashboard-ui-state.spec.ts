import { describe, expect, it } from "vitest";
import type { AiProposal, Goal, WorkoutSession } from "@health/types";
import {
  computeWeeklyConsistency,
  summarizeRecentProposals,
  summarizeWorkoutAdherence,
} from "./dashboard-ui-state.js";

const baseSession = {
  userId: "22222222-2222-4222-8222-222222222222",
  workoutPlanId: "33333333-3333-4333-8333-333333333333",
  workoutPlanRevisionId: "44444444-4444-4444-8444-444444444444",
  title: "Strength day",
  exercises: [],
  feedback: {},
  completedAt: null,
  createdAt: "2026-05-22T12:00:00.000Z",
  updatedAt: "2026-05-22T12:00:00.000Z",
} satisfies Omit<WorkoutSession, "id" | "plannedDate" | "status">;

describe("dashboard UI state", () => {
  it("summarizes workout adherence for the current week", () => {
    const now = new Date("2026-05-22T15:00:00.000Z");
    const sessions: WorkoutSession[] = [
      {
        ...baseSession,
        id: "55555555-5555-4555-8555-555555555555",
        plannedDate: "2026-05-20",
        status: "completed",
        completedAt: "2026-05-20T12:00:00.000Z",
      },
      {
        ...baseSession,
        id: "66666666-6666-4666-8666-666666666666",
        plannedDate: "2026-05-22",
        status: "planned",
      },
    ];

    expect(summarizeWorkoutAdherence(sessions, now)).toEqual({
      completed: 1,
      planned: 2,
      label: "1 of 2 sessions completed",
    });
  });

  it("computes wellness-safe weekly consistency without medical framing", () => {
    const now = new Date("2026-05-22T15:00:00.000Z");
    const sessions: WorkoutSession[] = [
      {
        ...baseSession,
        id: "55555555-5555-4555-8555-555555555555",
        plannedDate: "2026-05-20",
        status: "completed",
        completedAt: "2026-05-20T12:00:00.000Z",
      },
    ];
    const goals = [
      {
        id: "77777777-7777-4777-8777-777777777777",
        userId: "22222222-2222-4222-8222-222222222222",
        type: "general_wellness",
        status: "active",
        priority: "primary",
        title: "Move daily",
        target: {},
        horizon: null,
        parentGoalId: null,
        weekStart: null,
        startDate: null,
        targetDate: null,
        createdAt: "2026-05-22T12:00:00.000Z",
        updatedAt: "2026-05-22T12:00:00.000Z",
      },
    ] satisfies Goal[];

    const consistency = computeWeeklyConsistency(sessions, goals, now);

    expect(consistency.percent).toBeGreaterThan(0);
    expect(consistency.subtitle).toContain("logged workouts");
    expect(consistency.subtitle.toLowerCase()).not.toContain("diagnos");
    expect(consistency.subtitle.toLowerCase()).not.toContain("recovery score");
  });

  it("summarizes only recent decided proposals for dashboard activity", () => {
    const baseProposal = {
      id: "11111111-1111-4111-8111-111111111111",
      userId: "22222222-2222-4222-8222-222222222222",
      threadId: "33333333-3333-4333-8333-333333333333",
      sourceMessageId: null,
      intent: "summarize_progress",
      targetDomain: "general",
      title: "Base proposal",
      reason: "Review requested.",
      proposedChanges: {},
      validationStatus: "valid",
      validationErrors: [],
      userDecisionAt: null,
      appliedReference: null,
      createdAt: "2026-05-22T12:00:00.000Z",
      updatedAt: "2026-05-22T12:00:00.000Z",
    } satisfies Omit<AiProposal, "status">;

    const proposals: AiProposal[] = [
      {
        ...baseProposal,
        id: "11111111-1111-4111-8111-111111111111",
        status: "pending",
        title: "Pending proposal",
        updatedAt: "2026-05-25T12:00:00.000Z",
      },
      {
        ...baseProposal,
        id: "44444444-4444-4444-8444-444444444444",
        status: "accepted",
        title: "Newest accepted",
        updatedAt: "2026-05-24T12:00:00.000Z",
      },
      {
        ...baseProposal,
        id: "55555555-5555-4555-8555-555555555555",
        status: "rejected",
        title: "Newest rejected",
        updatedAt: "2026-05-23T12:00:00.000Z",
      },
      {
        ...baseProposal,
        id: "66666666-6666-4666-8666-666666666666",
        status: "accepted",
        title: "Older accepted",
        updatedAt: "2026-05-22T12:00:00.000Z",
      },
      {
        ...baseProposal,
        id: "77777777-7777-4777-8777-777777777777",
        status: "rejected",
        title: "Oldest rejected",
        updatedAt: "2026-05-21T12:00:00.000Z",
      },
    ];

    const summary = summarizeRecentProposals(proposals);

    expect(summary.map((proposal) => proposal.title)).toEqual([
      "Newest accepted",
      "Newest rejected",
      "Older accepted",
    ]);
  });
});
