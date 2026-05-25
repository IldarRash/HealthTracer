import {
  getHabitPlanDomainErrors,
  getNutritionPlanDomainErrors,
  getWorkoutProposalDomainErrors,
  habitPlanPayloadSchema,
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

  it("flags therapy and therapist wording", () => {
    expect(containsUnsafeMedicalLanguage("A therapist can help you process this.")).toBe(
      true,
    );
    expect(containsUnsafeMedicalLanguage("Try CBT exercises for anxiety.")).toBe(true);
    expect(containsUnsafeMedicalLanguage("This may indicate mental illness.")).toBe(true);
  });

  it("allows normal wellness wording without therapy blocks", () => {
    expect(
      containsUnsafeMedicalLanguage(
        "Your stress and motivation look lower this week, so recovery habits may help.",
      ),
    ).toBe(false);
    expect(validateReplySafety("Recovery and stress check-ins can guide wellness habits.")).toEqual(
      [],
    );
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

  it("returns a create_habit_plan proposal for habit-related messages", async () => {
    const provider = new StubCoachAiProvider();
    const result = await provider.generateCoachResponse({
      userMessage: "Can you suggest daily habits for my routine?",
      recentMessages: [],
      coachingContext: {},
    });

    const parsed = parseAiStructuredOutput(result);
    expect(parsed.ok).toBe(true);

    const proposals = result.proposals ?? [];
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.intent).toBe("create_habit_plan");
    expect(proposals[0]?.targetDomain).toBe("general");

    const payload = habitPlanPayloadSchema.parse(proposals[0]?.proposedChanges);
    expect(payload.habits.length).toBeGreaterThanOrEqual(2);
    expect(getHabitPlanDomainErrors(payload)).toEqual([]);
  });

  it("returns an adapt_habit_plan proposal for habit adjustment requests", async () => {
    const provider = new StubCoachAiProvider();
    const result = await provider.generateCoachResponse({
      userMessage: "Please adjust my daily habits and make walking easier",
      recentMessages: [],
      coachingContext: {},
    });

    const proposals = result.proposals ?? [];
    expect(proposals[0]?.intent).toBe("adapt_habit_plan");

    const payload = habitPlanPayloadSchema.parse(proposals[0]?.proposedChanges);
    const movementHabit = payload.habits.find((habit) => habit.category === "movement");
    expect(movementHabit?.target).toEqual({ type: "duration_minutes", value: 15 });
    expect(getHabitPlanDomainErrors(payload)).toEqual([]);
  });

  it("returns an adapt_habit_plan remove proposal for habit removal requests", async () => {
    const provider = new StubCoachAiProvider();
    const result = await provider.generateCoachResponse({
      userMessage: "Remove the breathing habit from my daily routine",
      recentMessages: [],
      coachingContext: {},
    });

    const proposals = result.proposals ?? [];
    expect(proposals[0]?.intent).toBe("adapt_habit_plan");

    const payload = habitPlanPayloadSchema.parse(proposals[0]?.proposedChanges);
    expect(payload.habits.some((habit) => habit.status === "removed")).toBe(true);
    expect(getHabitPlanDomainErrors(payload)).toEqual([]);
  });

  it("returns an adapt_habit_plan pause proposal for habit pause requests", async () => {
    const provider = new StubCoachAiProvider();
    const result = await provider.generateCoachResponse({
      userMessage: "Please pause the breathing habit in my daily routine",
      recentMessages: [],
      coachingContext: {},
    });

    const proposals = result.proposals ?? [];
    expect(proposals[0]?.intent).toBe("adapt_habit_plan");

    const payload = habitPlanPayloadSchema.parse(proposals[0]?.proposedChanges);
    expect(payload.habits.some((habit) => habit.status === "paused")).toBe(true);
    expect(getHabitPlanDomainErrors(payload)).toEqual([]);
  });

  it("uses active habit plan context when adapting habits", async () => {
    const provider = new StubCoachAiProvider();
    const result = await provider.generateCoachResponse({
      userMessage: "Adapt my habits and change my walk",
      recentMessages: [],
      coachingContext: {
        activeHabitPlan: {
          activeHabitCount: 1,
          habits: [
            {
              habitDefinitionId: "d1000001-0000-4000-8000-000000000001",
              title: "Short walk",
              category: "movement",
              status: "active",
              scheduleType: "daily",
              targetType: "duration_minutes",
              targetValue: 30,
              required: true,
              displayOrder: 0,
            },
          ],
        },
      },
    });

    const payload = habitPlanPayloadSchema.parse(result.proposals?.[0]?.proposedChanges);
    expect(payload.habits[0]?.habitDefinitionId).toBe(
      "d1000001-0000-4000-8000-000000000001",
    );
    expect(payload.habits[0]?.target).toEqual({ type: "duration_minutes", value: 25 });
    expect(getHabitPlanDomainErrors(payload)).toEqual([]);
  });

  it("rebuilds selected_weekdays schedules from active habit plan context", async () => {
    const provider = new StubCoachAiProvider();
    const result = await provider.generateCoachResponse({
      userMessage: "Adjust my habits and make walking easier",
      recentMessages: [],
      coachingContext: {
        activeHabitPlan: {
          activeHabitCount: 1,
          habits: [
            {
              habitDefinitionId: "d1000002-0000-4000-8000-000000000002",
              title: "Weekday walk",
              category: "movement",
              status: "active",
              scheduleType: "selected_weekdays",
              daysOfWeek: [1, 3, 5],
              targetType: "duration_minutes",
              targetValue: 25,
              required: true,
              displayOrder: 0,
            },
          ],
        },
      },
    });

    const payload = habitPlanPayloadSchema.parse(result.proposals?.[0]?.proposedChanges);
    expect(payload.habits[0]?.schedule).toEqual({
      type: "selected_weekdays",
      daysOfWeek: [1, 3, 5],
    });
    expect(payload.habits[0]?.target).toEqual({ type: "duration_minutes", value: 20 });
    expect(getHabitPlanDomainErrors(payload)).toEqual([]);
  });

  it("returns a create_habit_plan proposal for streak-related messages", async () => {
    const provider = new StubCoachAiProvider();
    const result = await provider.generateCoachResponse({
      userMessage: "Help me build a better streak with small habits",
      recentMessages: [],
      coachingContext: {},
    });

    expect(result.proposals?.[0]?.intent).toBe("create_habit_plan");
  });

  it("returns a create_habit_plan proposal for daily routine requests", async () => {
    const provider = new StubCoachAiProvider();
    const result = await provider.generateCoachResponse({
      userMessage: "Can you help me improve my daily routine?",
      recentMessages: [],
      coachingContext: {},
    });

    expect(result.proposals?.[0]?.intent).toBe("create_habit_plan");
    expect(result.proposals?.[0]?.targetDomain).toBe("general");
  });

  it("does not propose create_habit_plan when an active habit plan already exists", async () => {
    const provider = new StubCoachAiProvider();
    const result = await provider.generateCoachResponse({
      userMessage: "Can you suggest daily habits for my routine?",
      recentMessages: [],
      coachingContext: {
        activeHabitPlan: {
          activeHabitCount: 1,
          habits: [
            {
              habitDefinitionId: "d1000001-0000-4000-8000-000000000001",
              title: "Morning hydration",
              category: "hydration",
              status: "active",
              scheduleType: "daily",
              targetType: "boolean",
              required: true,
              displayOrder: 0,
            },
          ],
        },
      },
    });

    expect(result.proposals).toEqual([]);
    expect(result.reply).toContain("already have an active habit plan");
  });

  it("acknowledges sufficient wellbeing trends from coaching context", async () => {
    const provider = new StubCoachAiProvider();
    const result = await provider.generateCoachResponse({
      userMessage: "How is my stress and motivation lately?",
      recentMessages: [],
      coachingContext: {
        wellbeingSummary: {
          latestDate: "2026-05-25",
          latestMoodScore: 4,
          latestStressScore: 2,
          windowDays: 7,
          windowStart: "2026-05-19",
          windowEnd: "2026-05-25",
          checkInCount: 5,
          moodAverage: 3.8,
          stressAverage: 2.4,
          moodTrendDirection: "up",
          stressTrendDirection: "down",
          currentStreak: 3,
          dataSufficiency: "sufficient",
          generatedAt: "2026-05-25T18:00:00.000Z",
        },
      },
    });

    expect(result.proposals).toEqual([]);
    expect(result.reply).toContain("mood check-ins trend a bit higher");
    expect(result.reply).toContain("stress check-ins trend a bit lower");
    expect(result.reply.toLowerCase()).not.toContain("therapy");
    expect(result.reply.toLowerCase()).not.toContain("diagnosis");
  });

  it("keeps partial wellbeing summaries conservative", async () => {
    const provider = new StubCoachAiProvider();
    const result = await provider.generateCoachResponse({
      userMessage: "My recovery feels off because of stress",
      recentMessages: [],
      coachingContext: {
        wellbeingSummary: {
          latestDate: "2026-05-25",
          latestMoodScore: 3,
          latestStressScore: 4,
          windowDays: 7,
          windowStart: "2026-05-24",
          windowEnd: "2026-05-25",
          checkInCount: 2,
          moodAverage: 3,
          stressAverage: 3.5,
          moodTrendDirection: "stable",
          stressTrendDirection: "unknown",
          currentStreak: 2,
          dataSufficiency: "partial",
          generatedAt: "2026-05-25T18:00:00.000Z",
        },
      },
    });

    expect(result.reply).toContain("fairly steady");
    expect(result.reply).toContain("Check-in data is still limited");
  });

  it("asks for a check-in when wellbeing data is insufficient", async () => {
    const provider = new StubCoachAiProvider();
    const result = await provider.generateCoachResponse({
      userMessage: "My motivation and recovery are struggling with stress",
      recentMessages: [],
      coachingContext: {},
    });

    expect(result.reply).toContain("do not have recent wellbeing check-in data");
    expect(result.proposals).toEqual([]);
  });

  it("returns multi-lane weekly review candidates for the canonical chat prompt", async () => {
    const provider = new StubCoachAiProvider();
    const result = await provider.generateCoachResponse({
      userMessage:
        "Review my cross-domain weekly summary and suggest typed adaptations I can approve individually. Nothing should change until I accept a proposal.",
      recentMessages: [],
      coachingContext: {},
    });

    expect(result.reply.toLowerCase()).toContain("approve individually");
    expect(result.proposals?.map((proposal) => proposal.intent)).toEqual([
      "adapt_workout_plan_from_progress",
      "adjust_nutrition_plan",
      "adapt_habit_plan",
    ]);
  });
});
