import { BadRequestException } from "@nestjs/common";
import { WELLBEING_CHECKIN_STALE_PROPOSAL_DATE_ERROR } from "@health/types";
import { describe, expect, it } from "vitest";
import { ProposalApplyService } from "./proposal-apply.service.js";

const auth = {
  clerkUserId: "user_123",
  displayName: "Test User",
  email: "test@example.com",
};

const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";

const workoutPayload = {
  title: "Strength base",
  summary: "Three repeatable training days.",
  days: [{ day: "Day 1", focus: "Strength", exercises: [] }],
};

const baseProposal = {
  id: "14a08176-64a7-4a2d-8a44-581807368394",
  userId,
  threadId: "24b19287-75b8-4a3e-9c10-691908479405",
  sourceMessageId: "34c29398-86c9-5b4f-ad21-7a2919585046",
  title: "Proposal",
  reason: "Review before applying.",
  evidenceRefs: null,
  proposedChanges: workoutPayload,
  status: "pending" as const,
  validationStatus: "valid" as const,
  validationErrors: [] as string[],
  userDecisionAt: null,
  appliedReference: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const nutritionPayload = {
  title: "Balanced daily nutrition base",
  summary: "A moderate starting point focused on consistency.",
  caloriesPerDay: 2200,
  proteinGrams: 140,
  carbsGrams: 220,
  fatGrams: 70,
  hydrationLiters: 2.5,
  mealStructure: [{ label: "Breakfast", timingHint: "Morning" }],
  preferences: ["Whole foods first"],
  restrictions: ["No shellfish"],
  allergies: [],
  notes: ["Prioritize whole foods."],
};

const todayPayload = {
  date: "2026-05-22",
  items: [{ label: "Drink water", kind: "hydration" as const, completed: false }],
};

const habitDefinitionId = "a1000001-0000-4000-8000-000000000001";

const habitPayload = {
  habits: [
    {
      habitDefinitionId,
      title: "Morning hydration",
      category: "hydration" as const,
      status: "active" as const,
      schedule: { type: "daily" as const },
      target: { type: "boolean" as const },
      required: true,
      displayOrder: 0,
    },
  ],
};

describe("ProposalApplyService", () => {
  it("routes accepted adapt_workout_plan proposals through the workouts service", async () => {
    let workoutsCalled = false;
    let capturedIntent: string | undefined;

    const service = new ProposalApplyService(
      {} as never,
      {} as never,
      {
        applyWorkoutPlanProposal: async (
          _userId: string,
          _payload: unknown,
          _reason: string,
          intent: string,
        ) => {
          workoutsCalled = true;
          capturedIntent = intent;
          return "workout_revision:rev-adapt-1";
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const reference = await service.applyAcceptedProposal(auth, userId, {
      ...baseProposal,
      intent: "adapt_workout_plan",
      targetDomain: "workout",
      proposedChanges: workoutPayload,
    });

    expect(reference).toBe("workout_revision:rev-adapt-1");
    expect(workoutsCalled).toBe(true);
    expect(capturedIntent).toBe("adapt_workout_plan");
  });

  it("routes accepted workout proposals through the workouts service", async () => {
    let workoutsCalled = false;

    const service = new ProposalApplyService(
      {} as never,
      {} as never,
      {
        applyWorkoutPlanProposal: async () => {
          workoutsCalled = true;
          return "workout_revision:rev-1";
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const reference = await service.applyAcceptedProposal(auth, userId, {
      ...baseProposal,
      intent: "create_workout_plan",
      targetDomain: "workout",
      proposedChanges: workoutPayload,
    });

    expect(reference).toBe("workout_revision:rev-1");
    expect(workoutsCalled).toBe(true);
  });

  it("routes accepted progress-derived workout proposals through the workouts service with recovery metadata preserved", async () => {
    let workoutsCalled = false;
    let capturedPayload: unknown;
    let capturedIntent: string | undefined;

    const service = new ProposalApplyService(
      {} as never,
      {} as never,
      {
        applyWorkoutPlanProposal: async (
          _userId: string,
          payload: unknown,
          _reason: string,
          intent: string,
        ) => {
          workoutsCalled = true;
          capturedPayload = payload;
          capturedIntent = intent;
          return "workout_revision:rev-progress";
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const reference = await service.applyAcceptedProposal(auth, userId, {
      ...baseProposal,
      intent: "adapt_workout_plan_from_progress",
      targetDomain: "workout",
      proposedChanges: {
        plan: {
          ...workoutPayload,
          adaptationMetadata: {
            operations: [
              {
                operation: "reduce_load",
                description: "Lower load after a tough recovery check-in.",
              },
            ],
          },
        },
        sourceSummaryId: "14a08176-64a7-4a2d-8a44-581807368394",
        recoverySourceRefs: [
          {
            date: "2026-05-25",
            snapshotId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b84",
          },
        ],
        allowVolumeIncrease: true,
      },
    });

    expect(reference).toBe("workout_revision:rev-progress");
    expect(workoutsCalled).toBe(true);
    expect(capturedIntent).toBe("adapt_workout_plan");
    expect(capturedPayload).toMatchObject({
      adaptationMetadata: {
        operations: [
          {
            operation: "reduce_load",
            description: "Lower load after a tough recovery check-in.",
          },
        ],
        recoverySourceRefs: [
          {
            date: "2026-05-25",
            snapshotId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b84",
          },
        ],
        allowVolumeIncrease: true,
      },
    });
  });

  it("routes accepted nutrition proposals through the nutrition service", async () => {
    let nutritionCalled = false;

    const service = new ProposalApplyService(
      {} as never,
      {} as never,
      {} as never,
      {
        applyNutritionPlanProposal: async () => {
          nutritionCalled = true;
          return "nutrition_revision:rev-1";
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const reference = await service.applyAcceptedProposal(auth, userId, {
      ...baseProposal,
      intent: "create_nutrition_plan",
      targetDomain: "nutrition",
      proposedChanges: nutritionPayload,
    });

    expect(reference).toBe("nutrition_revision:rev-1");
    expect(nutritionCalled).toBe(true);
  });

  it("routes accepted create_habit_plan proposals through the habits service", async () => {
    let habitsCalled = false;
    let capturedIntent: string | undefined;

    const service = new ProposalApplyService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        applyHabitPlanProposal: async (
          _userId: string,
          _payload: unknown,
          _reason: string,
          intent: string,
        ) => {
          habitsCalled = true;
          capturedIntent = intent;
          return "habit_revision:rev-create-1";
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const reference = await service.applyAcceptedProposal(auth, userId, {
      ...baseProposal,
      intent: "create_habit_plan",
      targetDomain: "general",
      proposedChanges: habitPayload,
    });

    expect(reference).toBe("habit_revision:rev-create-1");
    expect(habitsCalled).toBe(true);
    expect(capturedIntent).toBe("create_habit_plan");
  });

  it("routes accepted adapt_habit_plan proposals through the habits service", async () => {
    let habitsCalled = false;
    let capturedIntent: string | undefined;

    const service = new ProposalApplyService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        applyHabitPlanProposal: async (
          _userId: string,
          _payload: unknown,
          _reason: string,
          intent: string,
        ) => {
          habitsCalled = true;
          capturedIntent = intent;
          return "habit_revision:rev-adapt-1";
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const reference = await service.applyAcceptedProposal(auth, userId, {
      ...baseProposal,
      intent: "adapt_habit_plan",
      targetDomain: "general",
      proposedChanges: habitPayload,
    });

    expect(reference).toBe("habit_revision:rev-adapt-1");
    expect(habitsCalled).toBe(true);
    expect(capturedIntent).toBe("adapt_habit_plan");
  });

  it("routes accepted adjust_nutrition_plan proposals with progress provenance through the nutrition service", async () => {
    let nutritionCalled = false;
    let capturedPayload: unknown;
    let capturedIntent: string | undefined;

    const service = new ProposalApplyService(
      {} as never,
      {} as never,
      {} as never,
      {
        applyNutritionPlanProposal: async (
          _userId: string,
          payload: unknown,
          _reason: string,
          intent: string,
        ) => {
          nutritionCalled = true;
          capturedPayload = payload;
          capturedIntent = intent;
          return "nutrition_revision:rev-progress";
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const reference = await service.applyAcceptedProposal(auth, userId, {
      ...baseProposal,
      intent: "adjust_nutrition_plan",
      targetDomain: "nutrition",
      proposedChanges: {
        plan: nutritionPayload,
        sourceSummaryId: "14a08176-64a7-4a2d-8a44-581807368394",
        sourceTrendObservationIds: ["24b19287-75b8-4a3e-9c10-691908479405"],
      },
    });

    expect(reference).toBe("nutrition_revision:rev-progress");
    expect(nutritionCalled).toBe(true);
    expect(capturedIntent).toBe("adjust_nutrition_plan");
    expect(capturedPayload).toMatchObject({
      title: nutritionPayload.title,
      caloriesPerDay: nutritionPayload.caloriesPerDay,
    });
  });

  it("routes accepted adapt_habit_plan proposals with progress provenance through the habits service", async () => {
    let habitsCalled = false;
    let capturedPayload: unknown;
    let capturedIntent: string | undefined;

    const service = new ProposalApplyService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        applyHabitPlanProposal: async (
          _userId: string,
          payload: unknown,
          _reason: string,
          intent: string,
        ) => {
          habitsCalled = true;
          capturedPayload = payload;
          capturedIntent = intent;
          return "habit_revision:rev-progress";
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const reference = await service.applyAcceptedProposal(auth, userId, {
      ...baseProposal,
      intent: "adapt_habit_plan",
      targetDomain: "general",
      proposedChanges: {
        plan: habitPayload,
        sourceSummaryId: "14a08176-64a7-4a2d-8a44-581807368394",
        sourceTrendObservationIds: [],
      },
    });

    expect(reference).toBe("habit_revision:rev-progress");
    expect(habitsCalled).toBe(true);
    expect(capturedIntent).toBe("adapt_habit_plan");
    expect(capturedPayload).toEqual(habitPayload);
    expect(capturedPayload).not.toEqual({ habits: [] });
  });

  it("routes accepted recipe proposals through the recipes service", async () => {
    let recipesCalled = false;

    const service = new ProposalApplyService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        applyRecipeRecommendationProposal: async () => {
          recipesCalled = true;
          return "recipe_recommendation:rec-1";
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const reference = await service.applyAcceptedProposal(auth, userId, {
      ...baseProposal,
      intent: "recommend_recipes",
      targetDomain: "recipe",
      proposedChanges: {
        recommendations: [
          {
            recipeId: "a1000001-0000-4000-8000-000000000001",
            reason: "Fits your breakfast protein target.",
            fitSummary: "Estimated macros align with your plan.",
          },
        ],
      },
    });

    expect(reference).toBe("recipe_recommendation:rec-1");
    expect(recipesCalled).toBe(true);
  });

  it("routes accepted today checklist proposals through the today service", async () => {
    let todayCalled = false;

    const service = new ProposalApplyService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        applyTodayChecklistProposal: async () => {
          todayCalled = true;
          return "daily_checklist:checklist-1";
        },
      } as never,
      {} as never,
      {} as never,
    );

    const reference = await service.applyAcceptedProposal(auth, userId, {
      ...baseProposal,
      intent: "create_today_checklist",
      targetDomain: "today",
      proposedChanges: todayPayload,
    });

    expect(reference).toBe("daily_checklist:checklist-1");
    expect(todayCalled).toBe(true);
  });

  it("routes accepted summarize_progress proposals through the progress service", async () => {
    const summaryId = "a2000002-0000-4000-8000-000000000002";
    let progressCalled = false;
    let capturedInput: { weekStart?: string; refresh: boolean } | undefined;

    const service = new ProposalApplyService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        generateWeeklySummary: async (
          _auth: typeof auth,
          input: { weekStart?: string; refresh: boolean },
        ) => {
          progressCalled = true;
          capturedInput = input;
          return {
            summary: {
              id: summaryId,
              userId,
              weekStart: "2026-05-19",
              weekEnd: "2026-05-25",
              generatedAt: "2026-05-23T12:00:00.000Z",
              dataStatus: "partial",
              sourceAggregates: { workout: null },
              deferredDomains: ["nutrition"],
              userMessage: "You completed 2 of 3 planned workouts this week.",
              supersededById: null,
              createdAt: "2026-05-23T12:00:00.000Z",
            },
            trends: [],
          };
        },
      } as never,
      {} as never,
    );

    const reference = await service.applyAcceptedProposal(auth, userId, {
      ...baseProposal,
      intent: "summarize_progress",
      targetDomain: "general",
      proposedChanges: {},
    });

    expect(reference).toBe(`summary:${summaryId}`);
    expect(progressCalled).toBe(true);
    expect(capturedInput).toEqual({ weekStart: undefined, refresh: true });
  });

  it("throws for unsupported proposal intents", async () => {
    const service = new ProposalApplyService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.applyAcceptedProposal(auth, userId, {
        ...baseProposal,
        intent: "unsupported_intent" as never,
        targetDomain: "general",
        proposedChanges: {},
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("routes accepted wellbeing check-in proposals through create-if-absent apply", async () => {
    let wellbeingCalled = false;
    let expectedExistingCheckInId: string | null | undefined;

    const service = new ProposalApplyService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        createCheckInForDateIfAbsent: async (
          _auth: unknown,
          _date: string,
          _input: unknown,
          options?: { expectedExistingCheckInId?: string | null },
        ) => {
          wellbeingCalled = true;
          expectedExistingCheckInId = options?.expectedExistingCheckInId;
          return {
            checkIn: {
              id: "checkin-1",
              userId,
              date: "2026-05-26",
              moodScore: 2,
              stressScore: 3,
              tags: ["energy:2"],
              note: null,
              source: "user_entry",
              crisisFlagReasons: [],
              createdAt: "2026-05-26T18:00:00.000Z",
              updatedAt: "2026-05-26T18:00:00.000Z",
            },
            crisisSupport: {
              shouldShowCrisisSupport: false,
              reasons: [],
              copy: null,
            },
          };
        },
      } as never,
    );

    const reference = await service.applyAcceptedProposal(auth, userId, {
      ...baseProposal,
      intent: "capture_wellbeing_checkin",
      targetDomain: "general",
      proposedChanges: {
        date: "2026-05-26",
        moodScore: 2,
        stressScore: 3,
        energyLevel: 2,
      },
    });

    expect(reference).toBe("wellbeing_checkin:checkin-1");
    expect(wellbeingCalled).toBe(true);
    expect(expectedExistingCheckInId).toBeNull();
  });

  it("rejects wellbeing apply when a check-in appears after validation", async () => {
    const service = new ProposalApplyService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        createCheckInForDateIfAbsent: async () => {
          throw new BadRequestException(WELLBEING_CHECKIN_STALE_PROPOSAL_DATE_ERROR);
        },
      } as never,
    );

    await expect(
      service.applyAcceptedProposal(auth, userId, {
        ...baseProposal,
        intent: "capture_wellbeing_checkin",
        targetDomain: "general",
        proposedChanges: {
          date: "2026-05-26",
          moodScore: 2,
          stressScore: 3,
        },
      }),
    ).rejects.toMatchObject({
      response: { message: WELLBEING_CHECKIN_STALE_PROPOSAL_DATE_ERROR },
    });
  });

  it("returns the same appliedReference idempotently when proposal already created the check-in", async () => {
    let createCalled = false;

    const service = new ProposalApplyService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        createCheckInForDateIfAbsent: async (
          _auth: unknown,
          _date: string,
          _input: unknown,
          options?: { expectedExistingCheckInId?: string | null },
        ) => {
          createCalled = true;
          expect(options?.expectedExistingCheckInId).toBe("checkin-1");
          return {
            checkIn: {
              id: "checkin-1",
              userId,
              date: "2026-05-26",
              moodScore: 4,
              stressScore: 2,
              tags: [],
              note: null,
              source: "user_entry",
              crisisFlagReasons: [],
              createdAt: "2026-05-26T18:00:00.000Z",
              updatedAt: "2026-05-26T18:00:00.000Z",
            },
            crisisSupport: {
              shouldShowCrisisSupport: false,
              reasons: [],
              copy: null,
            },
          };
        },
      } as never,
    );

    const reference = await service.applyAcceptedProposal(auth, userId, {
      ...baseProposal,
      intent: "capture_wellbeing_checkin",
      targetDomain: "general",
      appliedReference: "wellbeing_checkin:checkin-1",
      proposedChanges: {
        date: "2026-05-26",
        moodScore: 2,
        stressScore: 3,
      },
    });

    expect(reference).toBe("wellbeing_checkin:checkin-1");
    expect(createCalled).toBe(true);
  });

  it("routes accepted nutrition incident proposals without plan revision writes", async () => {
    let nutritionPlanCalled = false;
    let incidentCalled = false;

    const service = new ProposalApplyService(
      {} as never,
      {} as never,
      {} as never,
      {
        applyNutritionPlanProposal: async () => {
          nutritionPlanCalled = true;
          return "nutrition_revision:rev-1";
        },
        applyNutritionIncidentProposal: async () => {
          incidentCalled = true;
          return "incident-1";
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const reference = await service.applyAcceptedProposal(auth, userId, {
      ...baseProposal,
      intent: "log_nutrition_incident",
      targetDomain: "nutrition",
      proposedChanges: {
        incidentDateTime: "2026-05-26T18:00:00.000Z",
        items: [{ name: "Pizza slice", calories: 280 }],
        estimatedCalories: 280,
        estimatedMacros: { proteinGrams: 12, carbsGrams: 30, fatGrams: 10 },
        confidence: "medium",
        provenance: { source: "text_estimate", providerId: "chat_trigger" },
        imageRefs: [],
      },
    });

    expect(reference).toBe("nutrition_incident:incident-1");
    expect(incidentCalled).toBe(true);
    expect(nutritionPlanCalled).toBe(false);
  });

  it("does not route nutrition incidents through workout or nutrition plan revision services", async () => {
    let workoutPlanCalled = false;
    let nutritionPlanCalled = false;
    let incidentCalled = false;

    const service = new ProposalApplyService(
      {} as never,
      {} as never,
      {
        applyWorkoutPlanProposal: async () => {
          workoutPlanCalled = true;
          return "workout_revision:rev-1";
        },
      } as never,
      {
        applyNutritionPlanProposal: async () => {
          nutritionPlanCalled = true;
          return "nutrition_revision:rev-1";
        },
        applyNutritionIncidentProposal: async () => {
          incidentCalled = true;
          return "incident-1";
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.applyAcceptedProposal(auth, userId, {
      ...baseProposal,
      intent: "log_nutrition_incident",
      targetDomain: "nutrition",
      proposedChanges: {
        incidentDateTime: "2026-05-26T18:00:00.000Z",
        items: [{ name: "Pizza slice", calories: 280 }],
        estimatedCalories: 280,
        estimatedMacros: { proteinGrams: 12, carbsGrams: 30, fatGrams: 10 },
        confidence: "medium",
        provenance: { source: "text_estimate", providerId: "chat_trigger" },
        imageRefs: [],
        userEdits: {
          editedAt: "2026-05-26T18:05:00.000Z",
          items: [{ name: "Pizza slice", calories: 280 }],
        },
      },
    });

    expect(incidentCalled).toBe(true);
    expect(workoutPlanCalled).toBe(false);
    expect(nutritionPlanCalled).toBe(false);
  });
});
