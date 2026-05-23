import {
  getNutritionPlanDomainErrors,
  getWorkoutProposalDomainErrors,
  nutritionPlanPayloadSchema,
  recipeRecommendationProposalPayloadSchema,
  workoutPlanProposalChangesSchema,
} from "@health/types";
import { describe, expect, it } from "vitest";
import {
  containsUnsafeDocumentSummaryLanguage,
  containsUnsafeMedicalLanguage,
  parseAiStructuredOutput,
  StubCoachAiProvider,
  validateProposalSafety,
  validateReplySafety,
} from "./index.js";

describe("ai structured output", () => {
  it("parses valid coach output", () => {
    const result = parseAiStructuredOutput({
      reply: "Here is a suggestion to review.",
      proposals: [],
    });

    expect(result.ok).toBe(true);
  });

  it("rejects malformed coach output", () => {
    const result = parseAiStructuredOutput({
      reply: "",
      proposals: [],
    });

    expect(result.ok).toBe(false);
  });

  it("preserves workout proposedChanges from stub coach output", async () => {
    const provider = new StubCoachAiProvider();
    const coachOutput = await provider.generateCoachResponse({
      userMessage: "Can you suggest a workout plan?",
      recentMessages: [],
      coachingContext: {},
    });

    const parsed = parseAiStructuredOutput(coachOutput);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.value.proposals[0]?.proposedChanges).toMatchObject({
      title: "Three day strength base",
      summary: "A simple weekly structure for consistent training.",
      days: expect.arrayContaining([
        expect.objectContaining({ weekday: "monday", focus: "Full body strength" }),
      ]),
    });

    const payload = workoutPlanProposalChangesSchema.parse(
      parsed.value.proposals[0]?.proposedChanges,
    );
    expect(payload.days).toHaveLength(3);
  });
});

describe("ai safety helpers", () => {
  it("flags diagnosis wording", () => {
    expect(
      containsUnsafeMedicalLanguage("This sounds like a clinical diagnosis."),
    ).toBe(true);
  });

  it("allows supported document type labels in document summary checks", () => {
    expect(
      containsUnsafeDocumentSummaryLanguage(
        "Governed summary for a user-provided provider note titled \"Follow-up\".",
      ),
    ).toBe(false);
    expect(
      containsUnsafeDocumentSummaryLanguage(
        "Governed summary for a user-provided med list titled \"Home list\".",
      ),
    ).toBe(false);
  });

  it("still blocks unsafe document summary wording", () => {
    expect(
      containsUnsafeDocumentSummaryLanguage(
        "This summary confirms a diagnosis and emergency dosing guidance.",
      ),
    ).toBe(true);
  });

  it("flags unsafe proposals and replies", () => {
    expect(
      validateProposalSafety({
        intent: "summarize_progress",
        targetDomain: "general",
        title: "Treatment plan",
        reason: "You should take medication for this.",
        proposedChanges: {},
      }),
    ).toHaveLength(1);

    expect(
      validateReplySafety("I can prescribe a treatment for your symptoms."),
    ).toHaveLength(1);
  });

  it("flags unsafe wording inside serialized proposed changes", () => {
    expect(
      validateProposalSafety({
        intent: "create_workout_plan",
        targetDomain: "workout",
        title: "Strength plan",
        reason: "Build consistency.",
        proposedChanges: {
          title: "Plan",
          summary: "Follow this clinical treatment protocol.",
          days: [{ day: "Day 1", focus: "Strength" }],
        },
      }),
    ).toHaveLength(1);
  });
});

describe("StubCoachAiProvider", () => {
  it("returns a workout proposal for training-related messages", async () => {
    const provider = new StubCoachAiProvider();
    const result = await provider.generateCoachResponse({
      userMessage: "Can you suggest a workout plan?",
      recentMessages: [],
      coachingContext: {},
    });

    const proposals = result.proposals ?? [];
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.intent).toBe("create_workout_plan");

    const payload = workoutPlanProposalChangesSchema.parse(proposals[0]?.proposedChanges);
    expect(payload.days).toHaveLength(3);
    expect(payload.days[0]?.weekday).toBe("monday");
    expect(getWorkoutProposalDomainErrors(payload, { requireStructuredPlan: true })).toEqual([]);
  });

  it("returns an adapt proposal for easier training requests", async () => {
    const provider = new StubCoachAiProvider();
    const result = await provider.generateCoachResponse({
      userMessage: "Can you make my workout easier this week?",
      recentMessages: [],
      coachingContext: {},
    });

    const proposals = result.proposals ?? [];
    expect(proposals[0]?.intent).toBe("adapt_workout_plan");
    const payload = workoutPlanProposalChangesSchema.parse(proposals[0]?.proposedChanges);
    expect(payload.adaptationMetadata?.operations[0]?.operation).toBe("reduce_load");
  });

  it("returns a remove-exercise adapt proposal", async () => {
    const provider = new StubCoachAiProvider();
    const result = await provider.generateCoachResponse({
      userMessage: "Please remove the farmer carry from my workout",
      recentMessages: [],
      coachingContext: {},
    });

    const proposals = result.proposals ?? [];
    expect(proposals[0]?.intent).toBe("adapt_workout_plan");
    const payload = workoutPlanProposalChangesSchema.parse(proposals[0]?.proposedChanges);
    expect(payload.adaptationMetadata?.operations[0]?.operation).toBe("remove_exercise");
  });

  it("returns a swap proposal with pending exercise definitions", async () => {
    const provider = new StubCoachAiProvider();
    const result = await provider.generateCoachResponse({
      userMessage: "Can you swap the row in my workout for a band exercise?",
      recentMessages: [],
      coachingContext: {},
    });

    const proposals = result.proposals ?? [];
    expect(proposals[0]?.intent).toBe("adapt_workout_plan");
    const payload = workoutPlanProposalChangesSchema.parse(proposals[0]?.proposedChanges);
    expect(payload.adaptationMetadata?.operations[0]?.operation).toBe("swap_exercise");
    expect(payload.pendingExercises?.["band-pull-apart"]?.name).toBe("Band Pull-Apart");
  });

  it("returns a progress-derived adapt proposal", async () => {
    const provider = new StubCoachAiProvider();
    const result = await provider.generateCoachResponse({
      userMessage: "Adapt my workout based on weekly progress",
      recentMessages: [],
      coachingContext: {},
    });

    const proposals = result.proposals ?? [];
    expect(proposals[0]?.intent).toBe("adapt_workout_plan_from_progress");
  });

  it("returns a nutrition proposal for meal-related messages", async () => {
    const provider = new StubCoachAiProvider();
    const result = await provider.generateCoachResponse({
      userMessage: "Can you suggest a meal plan?",
      recentMessages: [],
      coachingContext: {},
    });

    const proposals = result.proposals ?? [];
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.intent).toBe("create_nutrition_plan");

    const payload = nutritionPlanPayloadSchema.parse(
      proposals[0]?.proposedChanges,
    );
    expect(payload.mealStructure).toEqual([
      { label: "Breakfast", timingHint: null },
    ]);
    expect(getNutritionPlanDomainErrors(payload)).toEqual([]);
  });

  it("returns a recipe recommendation proposal for recipe-related messages", async () => {
    const provider = new StubCoachAiProvider();
    const result = await provider.generateCoachResponse({
      userMessage: "Can you suggest some breakfast recipes?",
      recentMessages: [],
      coachingContext: {},
    });

    const parsed = parseAiStructuredOutput(result);
    expect(parsed.ok).toBe(true);
    const proposals = result.proposals ?? [];
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.intent).toBe("recommend_recipes");
    expect(proposals[0]?.targetDomain).toBe("recipe");

    const payload = recipeRecommendationProposalPayloadSchema.parse(
      proposals[0]?.proposedChanges,
    );
    expect(payload.recommendations).toEqual([
      {
        recipeId: "a1000001-0000-4000-8000-000000000001",
        reason: "High-protein breakfast with estimated macro fit.",
        fitSummary: "Estimated macros align with your active plan.",
      },
    ]);
  });
});
