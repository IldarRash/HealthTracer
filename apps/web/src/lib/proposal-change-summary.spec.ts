import { describe, expect, it } from "vitest";
import type { AiProposal } from "@health/types";
import { summarizeProposalChanges } from "./proposal-change-summary.js";

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
});
