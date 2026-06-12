import { describe, expect, it } from "vitest";
import type { AiProposal } from "@health/types";
import {
  formatWorkoutExercisePrescription,
  summarizeProposalChanges,
} from "./proposal-change-summary.js";

describe("summarizeProposalChanges", () => {
  it("summarizes workout proposals with adaptation operations as before lines", () => {
    const proposal = {
      targetDomain: "workout",
      intent: "adapt_workout_plan",
      proposedChanges: {
        title: "Recovery week",
        summary: "Lower volume while keeping consistency.",
        days: [
          {
            weekday: "monday",
            focus: "Recovery + mobility",
            exercises: [{ name: "Easy walk" }, { name: "Hip mobility" }],
          },
        ],
        notes: [],
        adaptationMetadata: {
          operations: [
            {
              operation: "reduce_volume",
              description: "Replace heavy squats with bodyweight alternatives",
            },
          ],
        },
      },
    } as unknown as AiProposal;

    const summary = summarizeProposalChanges(proposal);

    expect(summary.before).toEqual([
      "Replace heavy squats with bodyweight alternatives",
    ]);
    expect(summary.after[0]).toBe("Recovery week");
    expect(summary.after.some((line) => line.includes("Monday"))).toBe(true);
  });

  it("summarizes habit proposals without raw JSON", () => {
    const proposal = {
      targetDomain: "general",
      intent: "create_habit_plan",
      proposedChanges: {
        habits: [
          {
            habitDefinitionId: "a1000001-0000-4000-8000-000000000001",
            title: "Evening stretch",
            category: "mobility",
            status: "active",
            displayOrder: 1,
            schedule: { type: "selected_weekdays", daysOfWeek: [1, 3] },
            target: { type: "duration_minutes", value: 5 },
            required: true,
          },
        ],
      },
    } as unknown as AiProposal;

    const summary = summarizeProposalChanges(proposal);

    expect(summary.after).toEqual(["Evening stretch — 2 days per week"]);
    expect(summary.before).toEqual([]);
  });

  it("exposes structured workoutDays for a valid create_workout_plan payload", () => {
    const proposal = {
      targetDomain: "workout",
      intent: "create_workout_plan",
      proposedChanges: {
        title: "Strength block",
        summary: "Two structured days.",
        days: [
          {
            weekday: "monday",
            focus: "Upper body",
            exercises: [
              { name: "Bench press", sets: 3, reps: "8-12" },
              // Structured catalog-backed form — carries durationSeconds.
              { snapshot: { name: "Plank" }, durationSeconds: 120 },
            ],
          },
          {
            weekday: "thursday",
            focus: "Lower body",
            exercises: [{ name: "Squat", sets: 5, reps: "5" }],
          },
        ],
        notes: [],
      },
    } as unknown as AiProposal;

    const summary = summarizeProposalChanges(proposal);

    expect(summary.workoutDays).toHaveLength(2);
    expect(summary.workoutDays?.[0]?.label).toBe("Monday: Upper body (2 exercises)");
    expect(summary.workoutDays?.[0]?.exercises).toEqual([
      { name: "Bench press", sets: 3, reps: "8-12", durationSeconds: null },
      { name: "Plank", sets: null, reps: null, durationSeconds: 120 },
    ]);
    // The flat day lines stay in `after` and match the structured labels.
    expect(summary.after.slice(-2)).toEqual([
      "Monday: Upper body (2 exercises)",
      "Thursday: Lower body (1 exercise)",
    ]);
  });

  it("exposes structured workoutDays for adapt_workout_plan_from_progress payloads", () => {
    const proposal = {
      targetDomain: "workout",
      intent: "adapt_workout_plan_from_progress",
      proposedChanges: {
        plan: {
          title: "Deload week",
          summary: "Lower intensity.",
          days: [
            {
              weekday: "wednesday",
              focus: "Mobility",
              exercises: [{ name: "Hip mobility", durationSeconds: 600 }],
            },
          ],
          notes: [],
        },
        sourceTrendObservationIds: [],
      },
    } as unknown as AiProposal;

    const summary = summarizeProposalChanges(proposal);

    expect(summary.workoutDays).toHaveLength(1);
    expect(summary.workoutDays?.[0]?.label).toBe("Wednesday: Mobility (1 exercise)");
  });

  it("returns no workoutDays for invalid workout payload shapes — empty for every targetDomain branch", () => {
    const domains: Array<AiProposal["targetDomain"]> = [
      "workout",
      "nutrition",
      "today",
      "goal",
      "general",
      "profile",
      "recipe",
      "body",
    ];

    for (const targetDomain of domains) {
      const summary = summarizeProposalChanges({
        targetDomain,
        intent: targetDomain === "general" ? "create_habit_plan" : "create_goal",
        proposedChanges: { provenance: { source: "image_estimate" }, junk: true },
      } as unknown as AiProposal);

      expect(summary.before).toEqual([]);
      expect(summary.after).toEqual([]);
      expect(summary.workoutDays).toBeUndefined();
    }
  });
});

describe("formatWorkoutExercisePrescription", () => {
  it("formats sets×reps when both are present", () => {
    expect(
      formatWorkoutExercisePrescription({
        name: "Bench press",
        sets: 3,
        reps: "8-12",
        durationSeconds: null,
      }),
    ).toBe("3×8-12");
  });

  it("formats duration as Nmin when reps are absent", () => {
    expect(
      formatWorkoutExercisePrescription({
        name: "Plank",
        sets: null,
        reps: null,
        durationSeconds: 120,
      }),
    ).toBe("2min");
  });

  it("prefixes sets for duration-based entries with sets", () => {
    expect(
      formatWorkoutExercisePrescription({
        name: "Plank",
        sets: 3,
        reps: null,
        durationSeconds: 60,
      }),
    ).toBe("3×1min");
  });

  it("never formats sub-minute durations as 0min", () => {
    expect(
      formatWorkoutExercisePrescription({
        name: "Sprint",
        sets: null,
        reps: null,
        durationSeconds: 20,
      }),
    ).toBe("1min");
  });

  it("returns null when no prescription details exist", () => {
    expect(
      formatWorkoutExercisePrescription({
        name: "Easy walk",
        sets: null,
        reps: null,
        durationSeconds: null,
      }),
    ).toBeNull();
  });
});
