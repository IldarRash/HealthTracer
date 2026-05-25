import { describe, expect, it } from "vitest";
import { StubCoachAiProvider } from "./stub-provider.js";
import {
  buildStubProposalRevisionOutput,
  parseStubProposalRevisionContext,
} from "./stub-proposal-revision.js";

const WORKOUT_REVISION = {
  supersededProposalId: "14a08176-64a7-4a2d-8a44-581807368394",
  modificationFeedback: "Keep one strength exercise.",
  originalProposal: {
    intent: "adapt_workout_plan" as const,
    targetDomain: "workout" as const,
    title: "Adjust today's workout",
    reason: "Recovery signals are low.",
    proposedChanges: {
      title: "Strength base",
      summary: "Lighter session today.",
      days: [{ weekday: "monday" as const, focus: "Recovery", exercises: [] }],
    },
  },
};

describe("parseStubProposalRevisionContext", () => {
  it("returns null when proposalRevision is missing", () => {
    expect(parseStubProposalRevisionContext({})).toBeNull();
  });

  it("parses revision metadata from coaching context", () => {
    const parsed = parseStubProposalRevisionContext({
      proposalRevision: WORKOUT_REVISION,
    });

    expect(parsed?.supersededProposalId).toBe(WORKOUT_REVISION.supersededProposalId);
    expect(parsed?.modificationFeedback).toBe("Keep one strength exercise.");
    expect(parsed?.originalProposal.intent).toBe("adapt_workout_plan");
  });
});

describe("buildStubProposalRevisionOutput", () => {
  it("returns a revised workout proposal aligned with the original intent", () => {
    const parsed = parseStubProposalRevisionContext({
      proposalRevision: WORKOUT_REVISION,
    });
    expect(parsed).not.toBeNull();

    const output = buildStubProposalRevisionOutput(parsed!, {});

    expect(output.proposals).toHaveLength(1);
    const proposal = output.proposals?.[0];
    expect(proposal).toMatchObject({
      intent: "adapt_workout_plan",
      targetDomain: "workout",
      title: "Adjust today's workout (revised)",
    });
    expect(proposal?.proposedChanges).toBeTruthy();
    expect(typeof output.reply).toBe("string");
  });

  it("returns a revised nutrition proposal for nutrition revisions", () => {
    const output = buildStubProposalRevisionOutput(
      {
        supersededProposalId: WORKOUT_REVISION.supersededProposalId,
        modificationFeedback: "Lower calories slightly.",
        originalProposal: {
          intent: "create_nutrition_plan",
          targetDomain: "nutrition",
          title: "Balanced daily nutrition base",
          reason: "Starter macro targets.",
          proposedChanges: {
            title: "Balanced daily nutrition base",
            summary: "Moderate starting point.",
            caloriesPerDay: 2200,
            proteinGrams: 140,
            carbsGrams: 220,
            fatGrams: 70,
            hydrationLiters: 2.5,
            mealStructure: [{ label: "Breakfast", timingHint: null }],
            preferences: [],
            restrictions: [],
            allergies: [],
            notes: ["Prioritize whole foods."],
          },
        },
      },
      {},
    );

    expect(output.proposals).toHaveLength(1);
    const proposal = output.proposals?.[0];
    expect(proposal).toMatchObject({
      intent: "create_nutrition_plan",
      targetDomain: "nutrition",
      title: "Balanced daily nutrition base (revised)",
    });
    const changes = proposal?.proposedChanges as { caloriesPerDay?: number };
    expect(changes.caloriesPerDay).toBeLessThan(2200);
  });

  it("returns a revised habit proposal for habit revisions", () => {
    const output = buildStubProposalRevisionOutput(
      {
        supersededProposalId: WORKOUT_REVISION.supersededProposalId,
        modificationFeedback: "keep weekdays only",
        originalProposal: {
          intent: "adapt_habit_plan",
          targetDomain: "general",
          title: "Adjust hydration habit",
          reason: "Make the hydration target easier.",
          proposedChanges: {
            habits: [
              {
                habitDefinitionId: "c1000001-0000-4000-8000-000000000001",
                title: "Morning hydration",
                category: "hydration",
                status: "active",
                schedule: { type: "daily" },
                target: { type: "boolean" },
                required: true,
                displayOrder: 0,
              },
            ],
          },
        },
      },
      {},
    );

    expect(output.proposals).toHaveLength(1);
    const proposal = output.proposals?.[0];
    expect(proposal?.intent).toBe("adapt_habit_plan");
    expect(proposal?.targetDomain).toBe("general");
  });
});

describe("StubCoachAiProvider proposal revision turns", () => {
  const provider = new StubCoachAiProvider();

  it("returns a revised workout proposal when coachingContext includes proposalRevision", async () => {
    const output = await provider.generateCoachResponse({
      userMessage:
        "Please revise the proposal with these changes: keep one strength exercise.",
      recentMessages: [],
      coachingContext: {
        proposalRevision: WORKOUT_REVISION,
      },
    });

    expect(output.proposals).toHaveLength(1);
    expect(output.proposals?.[0]).toMatchObject({
      intent: "adapt_workout_plan",
      targetDomain: "workout",
    });
  });

  it("prioritizes proposal revision over today checklist keyword matching", async () => {
    const output = await provider.generateCoachResponse({
      userMessage:
        'Please revise the proposal "Adjust today\'s workout" with these changes: Keep one strength exercise.',
      recentMessages: [],
      coachingContext: {
        proposalRevision: WORKOUT_REVISION,
      },
    });

    expect(output.proposals).toHaveLength(1);
    const proposal = output.proposals?.[0];
    expect(proposal?.intent).toBe("adapt_workout_plan");
    expect(proposal?.intent).not.toBe("create_today_checklist");
  });

  it("keeps non-revision stub behavior unchanged", async () => {
    const output = await provider.generateCoachResponse({
      userMessage: "Explain progressive overload.",
      recentMessages: [],
      coachingContext: {},
    });

    expect(output.proposals).toEqual([]);
    expect(typeof output.reply).toBe("string");
  });
});
