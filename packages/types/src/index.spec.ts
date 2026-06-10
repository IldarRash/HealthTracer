import { describe, expect, it } from "vitest";
import {
  aiProposalSchema,
  aiStructuredOutputSchema,
  chatTurnResponseSchema,
  completeWorkoutSessionSchema,
  nutritionPlanPayloadSchema,
  nutritionAdherenceStateSchema,
  upsertNutritionAdherenceSchema,
  proposalDecisionSchema,
  rawAiProposalSchema,
  scheduleWorkoutSessionSchema,
  sendChatMessageSchema,
  todayChecklistPayloadSchema,
  todayDayResponseSchema,
  todayNutritionDetailSchema,
  workoutSessionSchema,
  workoutPlanPayloadSchema,
  activeWorkoutPlanResponseSchema,
  workoutPlanRevisionSchema,
  createGoalSchema,
  onboardingSchema,
  upsertUserProfileSchema,
  activeNutritionPlanResponseSchema,
  generateRecipeRecommendationsResponseSchema,
  nutritionPlanRevisionSchema,
  recipeSchema,
  updateRecipeRecommendationStatusSchema,
  adaptWorkoutPlanFromProgressChangesSchema,
  adjustNutritionPlanFromProgressChangesSchema,
  adaptHabitPlanFromProgressChangesSchema,
  extractHabitPlanPayload,
  habitPlanProposalChangesSchema,
  generateWeeklyProgressSummarySchema,
  getProgressProvenanceFromProposal,
  getProgressLinkedProvenanceRequiredErrors,
  weeklyProgressSummaryResponseSchema,
  recipePerServingMacrosSchema,
} from "./index.js";

describe("phase 2 contracts", () => {
  it("accepts a valid profile payload with birth date", () => {
    expect(() =>
      upsertUserProfileSchema.parse({
        birthDate: "1992-04-12",
        heightCm: 180,
        baselineWeightKg: 82.5,
        activityLevel: "moderately_active",
        trainingExperience: "intermediate",
        preferences: ["morning workouts"],
        constraints: ["low impact cardio"],
      }),
    ).not.toThrow();
  });

  it("rejects non ISO profile dates", () => {
    expect(() =>
      upsertUserProfileSchema.parse({
        birthDate: "04/12/1992",
      }),
    ).toThrow();
  });

  it("defaults a new goal to secondary priority", () => {
    const goal = createGoalSchema.parse({
      type: "general_wellness",
      title: "Build consistent movement habits",
    });

    expect(goal.priority).toBe("secondary");
    expect(goal.target).toEqual({});
  });

  it("accepts onboarding payloads with required baseline profile fields", () => {
    expect(() =>
      onboardingSchema.parse({
        user: {
          displayName: "Alex",
          timezone: "UTC",
        },
        profile: {
          birthDate: "1992-04-12",
          heightCm: 180,
          baselineWeightKg: 82.5,
          longevityDirection: {
            statement: "Build durable fitness habits.",
            tags: [],
          },
        },
        quarterlyGoal: {
          type: "general_wellness",
          title: "Move consistently this quarter",
          startDate: "2026-05-01",
          targetDate: "2026-07-31",
        },
      }),
    ).not.toThrow();
  });

  it("rejects onboarding payloads missing baseline profile fields", () => {
    expect(() =>
      onboardingSchema.parse({
        user: {
          displayName: "Alex",
          timezone: "UTC",
        },
        profile: {
          longevityDirection: {
            statement: "Build durable fitness habits.",
            tags: [],
          },
        },
        quarterlyGoal: {
          type: "general_wellness",
          title: "Move consistently this quarter",
          startDate: "2026-05-01",
          targetDate: "2026-07-31",
        },
      }),
    ).toThrow();
  });
});

describe("phase 3 contracts", () => {
  it("accepts a chat turn with a typed workout proposal (B5/B6: weekday required, no string exercises)", () => {
    // B5 removal: day field gone, weekday required. B6 removal: string exercises gone.
    const result = aiStructuredOutputSchema.parse({
      reply: "Here is a suggested adjustment. Review it before anything changes.",
      proposals: [
        {
          intent: "create_workout_plan",
          targetDomain: "workout",
          title: "Start a three day strength plan",
          reason: "This matches your active goal and training experience.",
          proposedChanges: {
            title: "Three day strength base",
            summary: "A simple weekly structure for consistent training.",
            days: [
              {
                weekday: "monday",
                focus: "Full body strength",
                exercises: [{ name: "Goblet squat" }, { name: "Push-up" }],
              },
            ],
          },
        },
      ],
    });

    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]?.proposedChanges).toMatchObject({
      title: "Three day strength base",
      summary: "A simple weekly structure for consistent training.",
    });
  });

  it("does not let optional profile fields swallow workout proposedChanges (B5/B6)", () => {
    // B5 removal: weekday required. B6 removal: string exercises removed.
    const workoutPayload = {
      title: "Three day strength base",
      summary: "A simple weekly structure for consistent training.",
      days: [{ weekday: "monday", focus: "Full body strength", exercises: [{ name: "Goblet squat" }] }],
      notes: ["Stay consistent."],
    };

    expect(upsertUserProfileSchema.parse(workoutPayload)).toEqual({});

    const parsed = rawAiProposalSchema.parse({
      intent: "create_workout_plan",
      targetDomain: "workout",
      title: "Start a three day strength plan",
      reason: "Matches your goals.",
      proposedChanges: workoutPayload,
    });

    expect(parsed.proposedChanges).toMatchObject({ title: "Three day strength base" });
  });

  it("still parses profile update proposals", () => {
    const parsed = rawAiProposalSchema.parse({
      intent: "update_profile",
      targetDomain: "profile",
      title: "Refresh profile details",
      reason: "Keeps coaching context accurate.",
      proposedChanges: {
        activityLevel: "moderately_active",
        preferences: ["morning workouts"],
      },
    });

    expect(parsed.proposedChanges).toEqual({
      activityLevel: "moderately_active",
      preferences: ["morning workouts"],
    });
  });

  it("rejects empty chat messages", () => {
    expect(() => sendChatMessageSchema.parse({ content: "" })).toThrow();
  });

  it("accepts normal chat messages without proposalRevision", () => {
    const parsed = sendChatMessageSchema.parse({
      content: "Can you adapt my workout this week?",
    });

    expect(parsed.content).toBe("Can you adapt my workout this week?");
    expect(parsed.proposalRevision).toBeUndefined();
  });

  it("accepts optional proposalRevision metadata on chat send", () => {
    const parsed = sendChatMessageSchema.parse({
      content: 'Please revise the proposal "Adjust hydration" with these changes: keep weekdays only.',
      proposalRevision: {
        supersededProposalId: "14a08176-64a7-4a2d-8a44-581807368394",
        modificationFeedback: "keep weekdays only",
        originalProposal: {
          intent: "adapt_habit_plan",
          targetDomain: "general",
          title: "Adjust hydration",
          reason: "Make the hydration target easier.",
          proposedChanges: {
            habits: [
              {
                habitDefinitionId: "a1000001-0000-4000-8000-000000000001",
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
    });

    expect(parsed.proposalRevision?.supersededProposalId).toBe(
      "14a08176-64a7-4a2d-8a44-581807368394",
    );
    expect(parsed.proposalRevision?.originalProposal.intent).toBe("adapt_habit_plan");
  });

  it("rejects chat send payloads with invalid proposalRevision metadata", () => {
    expect(() =>
      sendChatMessageSchema.parse({
        content: "Please revise the proposal.",
        proposalRevision: {
          supersededProposalId: "not-a-uuid",
          modificationFeedback: "Keep weekdays only",
          originalProposal: {
            intent: "adapt_habit_plan",
            targetDomain: "general",
            title: "Adjust hydration",
            reason: "Make the hydration target easier.",
            proposedChanges: {},
          },
        },
      }),
    ).toThrow();

    expect(() =>
      sendChatMessageSchema.parse({
        content: "Please revise the proposal.",
        proposalRevision: {
          supersededProposalId: "14a08176-64a7-4a2d-8a44-581807368394",
          modificationFeedback: "",
          originalProposal: {
            intent: "adapt_habit_plan",
            targetDomain: "general",
            title: "Adjust hydration",
            reason: "Make the hydration target easier.",
            proposedChanges: {},
          },
        },
      }),
    ).toThrow();
  });

  it("rejects unsupported proposal intents", () => {
    expect(() =>
      rawAiProposalSchema.parse({
        intent: "diagnose_condition",
        targetDomain: "general",
        title: "Unsafe",
        reason: "Unsafe",
        proposedChanges: {},
      }),
    ).toThrow();
  });

  it("parses wellbeing and nutrition incident raw AI proposals", () => {
    expect(
      rawAiProposalSchema.parse({
        intent: "capture_wellbeing_checkin",
        targetDomain: "general",
        title: "Wellbeing check-in",
        reason: "You mentioned feeling off today.",
        proposedChanges: {
          date: "2026-05-26",
          moodScore: 2,
          stressScore: 3,
          energyLevel: 2,
          note: null,
          tags: [],
          safetyFlags: [],
        },
      }).intent,
    ).toBe("capture_wellbeing_checkin");

    expect(
      rawAiProposalSchema.parse({
        intent: "log_nutrition_incident",
        targetDomain: "nutrition",
        title: "Log nutrition incident",
        reason: "Review this estimate before confirming.",
        proposedChanges: {
          incidentDateTime: "2026-05-26T18:00:00.000Z",
          items: [{ name: "Pizza slice", calories: 280 }],
          estimatedCalories: 280,
          estimatedMacros: { proteinGrams: 12, carbsGrams: 30, fatGrams: 10 },
          confidence: "medium",
          provenance: { source: "text_estimate", providerId: "chat_trigger" },
          imageRefs: [],
        },
      }).intent,
    ).toBe("log_nutrition_incident");
  });

  it("rejects invalid wellbeing and nutrition incident raw AI proposals", () => {
    expect(() =>
      rawAiProposalSchema.parse({
        intent: "capture_wellbeing_checkin",
        targetDomain: "general",
        title: "Wellbeing check-in",
        reason: "Invalid payload.",
        proposedChanges: {
          date: "2026-05-26",
          moodScore: 9,
          stressScore: 3,
        },
      }),
    ).toThrow();

    expect(() =>
      rawAiProposalSchema.parse({
        intent: "log_nutrition_incident",
        targetDomain: "nutrition",
        title: "Log nutrition incident",
        reason: "Invalid payload.",
        proposedChanges: {
          incidentDateTime: "2026-05-26T18:00:00.000Z",
          items: [],
          estimatedCalories: 0,
          estimatedMacros: { proteinGrams: 0, carbsGrams: 0, fatGrams: 0 },
          confidence: "medium",
          provenance: { source: "text_estimate" },
          imageRefs: [],
        },
      }),
    ).toThrow();
  });

  it("validates minimal workout and today payloads (B5 removal: weekday required)", () => {
    // B5 removal: day field and free-text label gone; weekday required.
    expect(() =>
      workoutPlanPayloadSchema.parse({
        title: "Strength base",
        summary: "Three repeatable training days.",
        days: [{ weekday: "monday", focus: "Strength" }],
      }),
    ).not.toThrow();

    expect(() =>
      todayChecklistPayloadSchema.parse({
        date: "2026-05-22",
        items: [{ label: "Drink water", kind: "hydration" }],
      }),
    ).not.toThrow();
  });

  it("accepts only known proposal decisions", () => {
    expect(proposalDecisionSchema.parse({ decision: "accept" }).decision).toBe(
      "accept",
    );
    expect(
      proposalDecisionSchema.parse({
        decision: "modify",
        modificationFeedback: "Keep one strength exercise.",
      }).decision,
    ).toBe("modify");
    expect(() => proposalDecisionSchema.parse({ decision: "maybe" })).toThrow();
    expect(() =>
      proposalDecisionSchema.parse({
        decision: "modify",
      }),
    ).toThrow();
    expect(
      proposalDecisionSchema.parse({
        decision: "accept",
        proposedChanges: { moodScore: 2, stressScore: 3, date: "2026-05-26" },
      }).proposedChanges,
    ).toEqual({ moodScore: 2, stressScore: 3, date: "2026-05-26" });
    expect(() =>
      proposalDecisionSchema.parse({
        decision: "reject",
        proposedChanges: { moodScore: 2 },
      }),
    ).toThrow();
  });

  it("validates nutrition plan payloads", () => {
    expect(() =>
      nutritionPlanPayloadSchema.parse({
        title: "Balanced base",
        summary: "Moderate macros and hydration.",
        caloriesPerDay: 2200,
        proteinGrams: 140,
        carbsGrams: 220,
        fatGrams: 70,
        hydrationLiters: 2.5,
        mealStructure: [{ label: "Breakfast", timingHint: "Morning" }],
        preferences: ["Whole foods first"],
        restrictions: ["No shellfish"],
        notes: ["Whole foods first"],
      }),
    ).not.toThrow();

    expect(() =>
      nutritionPlanPayloadSchema.parse({
        title: "Unsafe target",
        summary: "Exceeds supported daily target bounds.",
        caloriesPerDay: 10001,
        proteinGrams: 140,
        carbsGrams: 220,
        fatGrams: 70,
        hydrationLiters: 2.5,
        mealStructure: [{ label: "Breakfast", timingHint: null }],
        notes: [],
      }),
    ).toThrow();
  });

  it("validates nutrition adherence payloads", () => {
    expect(
      nutritionAdherenceStateSchema.parse({
        date: "2026-05-22",
        hydrationLitersConsumed: 1.5,
        mealCompletion: [{ label: "Breakfast", completed: true }],
        targetCompletion: { caloriesOnTarget: true },
        notes: ["Felt good today"],
      }).hydrationLitersConsumed,
    ).toBe(1.5);

    expect(
      upsertNutritionAdherenceSchema.parse({
        hydrationLitersConsumed: 2,
        notes: ["Light day"],
      }).notes,
    ).toEqual(["Light day"]);
  });

  it("validates today day response with selected-date nutrition detail", () => {
    const timestamp = "2026-05-22T12:00:00.000Z";
    const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
    const checklistId = "78d40655-b4b5-47b3-b28e-470192e05f04";
    const planId = "33333333-3333-4333-8333-333333333333";
    const revisionId = "44444444-4444-4444-8444-444444444444";

    const nutrition = todayNutritionDetailSchema.parse({
      date: "2026-05-22",
      plan: {
        id: planId,
        userId,
        activeRevisionId: revisionId,
        status: "active",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      activeRevision: {
        id: revisionId,
        nutritionPlanId: planId,
        revisionNumber: 1,
        reason: "Initial plan",
        source: "ai_proposal",
        payload: {
          title: "Balanced daily nutrition base",
          summary: "A moderate starting point focused on consistency.",
          caloriesPerDay: 2200,
          proteinGrams: 140,
          carbsGrams: 220,
          fatGrams: 70,
          hydrationLiters: 2.5,
          mealStructure: [{ label: "Breakfast", timingHint: null }],
          preferences: [],
          restrictions: [],
          allergies: [],
          notes: [],
        },
        createdAt: timestamp,
      },
      adherence: null,
    });

    expect(
      todayDayResponseSchema.parse({
        id: checklistId,
        userId,
        date: "2026-05-22",
        items: [],
        source: "generated",
        feedback: null,
        adherence: {
          score: null,
          completedRequired: 0,
          totalRequired: 0,
          completedOptional: 0,
          skippedRequired: 0,
          skippedOptional: 0,
        },
        createdAt: timestamp,
        updatedAt: timestamp,
        workout: null,
        nutrition,
      }).nutrition?.plan?.id,
    ).toBe(planId);

    expect(
      todayDayResponseSchema.parse({
        id: checklistId,
        userId,
        date: "2026-05-22",
        items: [],
        source: "generated",
        feedback: null,
        adherence: {
          score: null,
          completedRequired: 0,
          totalRequired: 0,
          completedOptional: 0,
          skippedRequired: 0,
          skippedOptional: 0,
        },
        createdAt: timestamp,
        updatedAt: timestamp,
        workout: null,
        nutrition: null,
      }).nutrition,
    ).toBeNull();
  });

  it("accepts structured and legacy object workout exercises (B5/B6 removal)", () => {
    // B5 removal: `day` field gone; weekday required.
    // B6 removal: string exercise arm deleted; object form required.
    const plan = workoutPlanPayloadSchema.parse({
      title: "Strength base",
      summary: "Object exercises only; strings removed.",
      days: [
        {
          weekday: "monday",
          focus: "Lower body",
          exercises: [{ name: "Goblet squat" }, { name: "Romanian deadlift", sets: 3, reps: "8" }],
        },
      ],
    });

    expect(plan.days[0]?.exercises).toHaveLength(2);
  });

  it("validates workout session scheduling and completion payloads", () => {
    expect(() =>
      scheduleWorkoutSessionSchema.parse({
        workoutPlanRevisionId: "880099c6-3b5f-4383-8246-97b72bf61818",
        plannedDate: "2026-05-23",
        title: "Lower body day",
        exercises: [{ name: "Squat", sets: 3, reps: "8" }],
      }),
    ).not.toThrow();

    expect(
      completeWorkoutSessionSchema.parse({
        status: "skipped",
        feedback: { fatigue: 7, notes: "Poor sleep." },
      }).status,
    ).toBe("skipped");
  });

  it("parses active workout session response shapes (B6: object exercises only)", () => {
    // B6 removal: string exercises no longer accepted.
    expect(() =>
      workoutSessionSchema.parse({
        id: "78d40655-b4b5-47b3-b28e-470192e05f04",
        userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
        workoutPlanId: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
        workoutPlanRevisionId: "880099c6-3b5f-4383-8246-97b72bf61818",
        plannedDate: "2026-05-23",
        title: "Lower body day",
        status: "completed",
        exercises: [{ name: "Goblet squat" }],
        feedback: { notes: "Felt strong." },
        completedAt: "2026-05-23T12:00:00.000Z",
        createdAt: "2026-05-22T12:00:00.000Z",
        updatedAt: "2026-05-23T12:00:00.000Z",
      }),
    ).not.toThrow();
  });

  it("parses persisted proposal and chat turn response shapes", () => {
    const proposalId = "14a08176-64a7-4a2d-8a44-581807368394";
    const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
    const threadId = "24b19287-75b8-4a3e-9c10-691908479405";
    const messageId = "34c29398-86c9-5b4f-ad21-7a2919585046";
    const timestamp = "2026-05-22T12:00:00.000Z";

    const proposal = aiProposalSchema.parse({
      id: proposalId,
      userId,
      threadId,
      sourceMessageId: messageId,
      intent: "summarize_progress",
      targetDomain: "general",
      title: "Weekly recap",
      reason: "You asked for a progress summary.",
      proposedChanges: {},
      status: "pending",
      validationStatus: "valid",
      validationErrors: [],
      userDecisionAt: null,
      appliedReference: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    expect(proposal.status).toBe("pending");

    const proposalWithEvidence = aiProposalSchema.parse({
      ...proposal,
      evidenceRefs: [
        {
          type: "document_signal",
          id: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
          label: "Vitamin D from recent lab review",
        },
      ],
    });

    expect(proposalWithEvidence.evidenceRefs).toHaveLength(1);

    expect(() =>
      chatTurnResponseSchema.parse({
        thread: {
          id: threadId,
          userId,
          title: "Coach chat",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        userMessage: {
          id: messageId,
          threadId,
          role: "user",
          content: "How am I doing this week?",
          metadata: {},
          createdAt: timestamp,
        },
        assistantMessage: {
          id: "44d3a409-97da-6c60-be32-8b3a26969557",
          threadId,
          role: "assistant",
          content: "Here is a recap you can review.",
          metadata: {},
          createdAt: timestamp,
        },
        proposals: [proposal],
      }),
    ).not.toThrow();
  });
});

describe("phase 4 contracts", () => {
  const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
  const planId = "3f98f3dd-806d-4386-8c5f-43499626c5d6";
  const revisionId = "880099c6-3b5f-4383-8246-97b72bf61818";
  const timestamp = "2026-05-22T12:00:00.000Z";

  const workoutPayload = {
    title: "Strength base",
    summary: "Three repeatable training days.",
    // B5 removal: weekday required. B6 removal: object exercises only.
    days: [{ weekday: "monday", focus: "Strength", exercises: [{ name: "Squat" }] }],
    notes: [],
  };

  it("parses active workout plan responses with plan, revision, and sessions", () => {
    const result = activeWorkoutPlanResponseSchema.parse({
      plan: {
        id: planId,
        userId,
        activeRevisionId: revisionId,
        status: "active",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      activeRevision: {
        id: revisionId,
        workoutPlanId: planId,
        revisionNumber: 2,
        reason: "Adjusted volume for recovery.",
        source: "ai_proposal",
        payload: workoutPayload,
        createdAt: timestamp,
      },
      sessions: [
        {
          id: "78d40655-b4b5-47b3-b28e-470192e05f04",
          userId,
          workoutPlanId: planId,
          workoutPlanRevisionId: revisionId,
          plannedDate: "2026-05-23",
          title: "Lower body day",
          status: "planned",
          exercises: [{ name: "Squat", sets: 3, reps: "8" }],
          feedback: {},
          completedAt: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    });

    expect(result.plan?.activeRevisionId).toBe(revisionId);
    expect(result.sessions).toHaveLength(1);
  });

  it("rejects workout plan revisions without at least one training day", () => {
    expect(() =>
      workoutPlanRevisionSchema.parse({
        id: revisionId,
        workoutPlanId: planId,
        revisionNumber: 1,
        reason: "Initial plan",
        source: "ai_proposal",
        payload: {
          title: "Empty structure",
          summary: "No days configured.",
          days: [],
        },
        createdAt: timestamp,
      }),
    ).toThrow();
  });

  it("rejects completion payloads that use planned status", () => {
    expect(() =>
      completeWorkoutSessionSchema.parse({
        status: "planned",
        feedback: {},
      }),
    ).toThrow();
  });

  it("rejects invalid workout plan payload shapes", () => {
    expect(() =>
      workoutPlanPayloadSchema.parse({
        title: "",
        summary: "Missing title.",
        days: [{ day: "Day 1", focus: "Strength" }],
      }),
    ).toThrow();

    expect(() =>
      workoutPlanPayloadSchema.parse({
        title: "Strength base",
        summary: "No training days.",
        days: [],
      }),
    ).toThrow();
  });

  it("rejects invalid workout session scheduling payloads", () => {
    expect(() =>
      scheduleWorkoutSessionSchema.parse({
        workoutPlanRevisionId: "not-a-uuid",
        plannedDate: "2026-05-23",
        title: "Strength day",
        exercises: [],
      }),
    ).toThrow();

    expect(() =>
      scheduleWorkoutSessionSchema.parse({
        workoutPlanRevisionId: revisionId,
        plannedDate: "05/23/2026",
        title: "Strength day",
        exercises: [],
      }),
    ).toThrow();
  });

  it("rejects invalid workout completion feedback bounds", () => {
    expect(() =>
      completeWorkoutSessionSchema.parse({
        status: "completed",
        feedback: { fatigue: 11, notes: "Too high." },
      }),
    ).toThrow();
  });

  it("accepts adapt_workout_plan in raw AI proposals", () => {
    const proposal = rawAiProposalSchema.parse({
      intent: "adapt_workout_plan",
      targetDomain: "workout",
      title: "Reduce lower body volume",
      reason: "Matches your reported fatigue this week.",
      proposedChanges: workoutPayload,
    });

    expect(proposal.intent).toBe("adapt_workout_plan");
  });

  it("parses active nutrition plan responses with revision-safe payloads", () => {
    const result = activeNutritionPlanResponseSchema.parse({
      plan: {
        id: planId,
        userId,
        activeRevisionId: revisionId,
        status: "active",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      activeRevision: {
        id: revisionId,
        nutritionPlanId: planId,
        revisionNumber: 2,
        reason: "Adjusted hydration target for training days.",
        source: "ai_proposal",
        payload: {
          title: "Balanced base",
          summary: "Moderate nutrition targets focused on consistency.",
          caloriesPerDay: 2200,
          proteinGrams: 140,
          carbsGrams: 220,
          fatGrams: 70,
          hydrationLiters: 2.5,
          notes: [],
        },
        createdAt: timestamp,
      },
    });

    expect(result.plan?.activeRevisionId).toBe(revisionId);
    expect(result.activeRevision?.payload.title).toBe("Balanced base");
  });

  it("rejects nutrition plan revisions with incomplete payloads", () => {
    expect(() =>
      nutritionPlanRevisionSchema.parse({
        id: revisionId,
        nutritionPlanId: planId,
        revisionNumber: 1,
        reason: "Initial plan",
        source: "ai_proposal",
        payload: {
          title: "Incomplete",
          summary: "Missing required nutrition targets.",
        },
        createdAt: timestamp,
      }),
    ).toThrow();
  });
});

describe("phase 7 recipe contracts", () => {
  const timestamp = "2026-05-22T12:00:00.000Z";
  const recipeId = "a1000001-0000-4000-8000-000000000001";

  it("accepts recipe recommendation proposal payloads", () => {
    expect(() =>
      rawAiProposalSchema.parse({
        intent: "recommend_recipes",
        targetDomain: "recipe",
        title: "Breakfast ideas for your plan",
        reason: "These options fit your current estimated targets.",
        proposedChanges: {
          recommendations: [
            {
              recipeId,
              reason: "High-protein breakfast with estimated macro fit.",
              fitSummary: "Estimated macros align with your active plan.",
            },
          ],
        },
      }),
    ).not.toThrow();
  });

  it("parses recipe list and recommendation response shapes", () => {
    expect(() =>
      recipeSchema.parse({
        id: recipeId,
        name: "Greek yogurt berry bowl",
        description: "Quick breakfast with protein and fiber.",
        ingredients: [{ name: "Greek yogurt", quantity: 1, unit: "cup" }],
        preparationSteps: ["Add yogurt to a bowl.", "Top with berries."],
        servings: 1,
        perServingMacros: {
          caloriesPerServing: 320,
          proteinGramsPerServing: 24,
          carbsGramsPerServing: 36,
          fatGramsPerServing: 8,
        },
        mealTypes: ["breakfast"],
        tags: ["high_protein"],
        restrictionTags: ["contains_dairy"],
        allergenTags: ["dairy"],
        prepMinutes: 5,
        cookMinutes: 0,
        source: "health_tracer_seed",
        confidence: "medium",
        provenance: {
          source: "seed_catalog",
        },
        status: "active",
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    ).not.toThrow();

    expect(
      generateRecipeRecommendationsResponseSchema.parse({
        recommendations: [],
        relatedNutritionPlanRevisionId: null,
        limitedReason: "no_active_nutrition_plan",
      }).limitedReason,
    ).toBe("no_active_nutrition_plan");
  });

  it("accepts recommendation status decisions without pending status", () => {
    expect(
      updateRecipeRecommendationStatusSchema.parse({ status: "accepted" }).status,
    ).toBe("accepted");
    expect(() =>
      updateRecipeRecommendationStatusSchema.parse({ status: "pending" }),
    ).toThrow();
  });
});

describe("phase 10A progress contracts", () => {
  const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
  const summaryId = "14a08176-64a7-4a2d-8a44-581807368394";
  const timestamp = "2026-05-22T12:00:00.000Z";

  it("parses weekly progress summary responses with partial workout data", () => {
    const response = weeklyProgressSummaryResponseSchema.parse({
      summary: {
        id: summaryId,
        userId,
        weekStart: "2026-05-18",
        weekEnd: "2026-05-24",
        generatedAt: timestamp,
        dataStatus: "partial",
        sourceAggregates: {
          workout: {
            plannedCount: 3,
            completedCount: 2,
            skippedCount: 1,
            adherencePercent: 67,
            activeDays: 2,
            sessionIds: ["78d40655-b4b5-47b3-b28e-470192e05f04"],
            averageFatigue: 6,
          },
        },
        deferredDomains: [
          {
            domain: "nutrition",
            reason: "adherence_not_included",
            message: "Nutrition adherence is not included in this weekly summary yet.",
          },
        ],
        userMessage:
          "Based on the workout entries available, you completed 2 of 3 planned sessions this week.",
        supersededById: null,
        createdAt: timestamp,
      },
      trends: [
        {
          id: "24b19287-75b8-4a3e-9c10-691908479405",
          userId,
          summaryId,
          weekStart: "2026-05-18",
          weekEnd: "2026-05-24",
          domain: "workout",
          trendType: "completion_rate",
          direction: "up",
          dataSufficiency: "partial",
          supportingAggregate: { currentRate: 67, priorRate: 50 },
          message:
            "You completed a higher share of planned workouts this week than the prior week based on the entries available.",
          createdAt: timestamp,
        },
      ],
    });

    expect(response.summary.dataStatus).toBe("partial");
    expect(response.trends).toHaveLength(1);
  });

  it("accepts progress-derived workout adaptation proposal payloads (B5/B6 removal)", () => {
    // B5 removal: weekday required. B6 removal: object exercises only.
    const payload = adaptWorkoutPlanFromProgressChangesSchema.parse({
      plan: {
        title: "Strength base",
        summary: "Adjusted volume based on weekly completion patterns.",
        days: [{ weekday: "monday", focus: "Strength", exercises: [{ name: "Squat" }] }],
      },
      sourceSummaryId: summaryId,
    });

    expect(payload.sourceTrendObservationIds).toEqual([]);
  });

  it("accepts progress-derived nutrition adaptation proposal payloads", () => {
    const payload = adjustNutritionPlanFromProgressChangesSchema.parse({
      plan: {
        title: "Balanced week",
        summary: "Adjusted targets based on weekly adherence patterns.",
        caloriesPerDay: 2200,
        proteinGrams: null,
        carbsGrams: null,
        fatGrams: null,
        hydrationLiters: null,
        mealStructure: [{ label: "Breakfast" }],
      },
      sourceSummaryId: summaryId,
    });

    expect(payload.sourceTrendObservationIds).toEqual([]);
  });

  it("defaults weekly summary generation refresh to false", () => {
    expect(generateWeeklyProgressSummarySchema.parse({}).refresh).toBe(false);
  });

  it("rejects progress-derived workout adaptation payloads without training days", () => {
    expect(() =>
      adaptWorkoutPlanFromProgressChangesSchema.parse({
        plan: {
          title: "Strength base",
          summary: "Missing days.",
          days: [],
        },
        sourceSummaryId: summaryId,
      }),
    ).toThrow();
  });

  it("rejects malformed progress summary source references", () => {
    expect(() =>
      adaptWorkoutPlanFromProgressChangesSchema.parse({
        plan: {
          title: "Strength base",
          summary: "Adjusted volume based on weekly completion patterns.",
          days: [{ day: "Day 1", focus: "Strength", exercises: ["Squat"] }],
        },
        sourceSummaryId: "not-a-uuid",
      }),
    ).toThrow();
  });

  it("extracts progress provenance from workout, nutrition, and habit proposals", () => {
    const summaryId = "14a08176-64a7-4a2d-8a44-581807368394";
    const trendId = "24b19287-75b8-4a3e-9c10-691908479405";
    const nutritionPlan = {
      title: "Balanced week",
      summary: "Adjusted targets based on weekly adherence patterns.",
      caloriesPerDay: 2200,
      proteinGrams: null,
      carbsGrams: null,
      fatGrams: null,
      hydrationLiters: null,
      mealStructure: [{ label: "Breakfast" }],
    };
    const habitPlan = {
      habits: [
        {
          habitDefinitionId: "a1000001-0000-4000-8000-000000000001",
          title: "Morning hydration",
          category: "hydration",
          status: "active",
          schedule: { type: "daily" },
          target: { type: "boolean" },
          required: true,
          displayOrder: 0,
        },
      ],
    };

    expect(
      getProgressProvenanceFromProposal("adapt_workout_plan_from_progress", {
        plan: {
          title: "Strength base",
          summary: "Adjusted volume.",
          // B5/B6: weekday required, object exercises only
          days: [{ weekday: "monday", focus: "Strength", exercises: [{ name: "Squat" }] }],
        },
        sourceSummaryId: summaryId,
        sourceTrendObservationIds: [trendId],
      }),
    ).toEqual({
      sourceSummaryId: summaryId,
      sourceTrendObservationIds: [trendId],
    });

    expect(
      getProgressProvenanceFromProposal("adjust_nutrition_plan", {
        plan: nutritionPlan,
        sourceSummaryId: summaryId,
      }),
    ).toEqual({
      sourceSummaryId: summaryId,
      sourceTrendObservationIds: [],
    });

    expect(
      getProgressProvenanceFromProposal("adapt_habit_plan", {
        plan: habitPlan,
        sourceSummaryId: summaryId,
        sourceTrendObservationIds: [trendId],
      }),
    ).toEqual({
      sourceSummaryId: summaryId,
      sourceTrendObservationIds: [trendId],
    });

    expect(
      getProgressProvenanceFromProposal("create_nutrition_plan", nutritionPlan),
    ).toBeNull();
  });

  it("requires sourceSummaryId for progress-linked nutrition and habit proposal shapes", () => {
    const nutritionPlanPayload = {
      title: "Balanced week",
      summary: "Adjusted targets.",
      caloriesPerDay: 2200,
      proteinGrams: null,
      carbsGrams: null,
      fatGrams: null,
      hydrationLiters: null,
      mealStructure: [{ label: "Breakfast", timingHint: null }],
      preferences: [],
      restrictions: [],
      allergies: [],
      notes: [],
    };

    expect(
      getProgressLinkedProvenanceRequiredErrors("adjust_nutrition_plan", {
        plan: nutritionPlanPayload,
      }),
    ).toEqual([
      "proposedChanges.sourceSummaryId: Progress-linked proposals require a weekly progress summary reference.",
    ]);

    expect(
      getProgressLinkedProvenanceRequiredErrors("adjust_nutrition_plan", nutritionPlanPayload),
    ).toEqual([]);

    expect(
      getProgressLinkedProvenanceRequiredErrors("adjust_nutrition_plan", {
        plan: nutritionPlanPayload,
        sourceSummaryId: summaryId,
      }),
    ).toEqual([]);
  });

  it("accepts progress-derived habit adaptation proposal payloads", () => {
    const payload = adaptHabitPlanFromProgressChangesSchema.parse({
      plan: {
        habits: [
          {
            habitDefinitionId: "a1000001-0000-4000-8000-000000000001",
            title: "Evening wind-down",
            category: "sleep_routine",
            status: "active",
            schedule: { type: "daily" },
            target: { type: "boolean" },
            required: true,
            displayOrder: 0,
          },
        ],
      },
      sourceSummaryId: summaryId,
    });

    expect(payload.sourceTrendObservationIds).toEqual([]);
  });

  it("extracts habit plan content from progress-wrapped adaptation payloads", () => {
    const summaryId = "14a08176-64a7-4a2d-8a44-581807368394";
    const trendId = "24b19287-75b8-4a3e-9c10-691908479405";
    const wrappedPayload = {
      plan: {
        habits: [
          {
            habitDefinitionId: "a1000001-0000-4000-8000-000000000001",
            title: "Evening wind-down",
            category: "sleep_routine",
            status: "active",
            schedule: { type: "daily" },
            target: { type: "boolean" },
            required: true,
            displayOrder: 0,
          },
        ],
      },
      sourceSummaryId: summaryId,
      sourceTrendObservationIds: [trendId],
    };

    const parsed = habitPlanProposalChangesSchema.parse(wrappedPayload);
    const extracted = extractHabitPlanPayload(parsed);

    expect(extracted.habits).toHaveLength(1);
    expect(extracted.habits[0]?.title).toBe("Evening wind-down");
    expect(extracted).not.toEqual({ habits: [] });
    expect(getProgressProvenanceFromProposal("adapt_habit_plan", wrappedPayload)).toEqual({
      sourceSummaryId: summaryId,
      sourceTrendObservationIds: [trendId],
    });
  });
});

describe("recipePerServingMacrosSchema", () => {
  it("accepts valid per-serving macro values", () => {
    expect(() =>
      recipePerServingMacrosSchema.parse({
        caloriesPerServing: 520,
        proteinGramsPerServing: 38,
        carbsGramsPerServing: 60,
        fatGramsPerServing: 14,
      }),
    ).not.toThrow();
  });

  it("accepts optional fiberGramsPerServing when present", () => {
    const result = recipePerServingMacrosSchema.parse({
      caloriesPerServing: 320,
      proteinGramsPerServing: 24,
      carbsGramsPerServing: 36,
      fatGramsPerServing: 8,
      fiberGramsPerServing: 6,
    });
    expect(result.fiberGramsPerServing).toBe(6);
  });

  it("rejects caloriesPerServing of 0 (must be positive)", () => {
    expect(() =>
      recipePerServingMacrosSchema.parse({
        caloriesPerServing: 0,
        proteinGramsPerServing: 24,
        carbsGramsPerServing: 36,
        fatGramsPerServing: 8,
      }),
    ).toThrow();
  });

  it("rejects caloriesPerServing above the 10000 ceiling", () => {
    expect(() =>
      recipePerServingMacrosSchema.parse({
        caloriesPerServing: 10001,
        proteinGramsPerServing: 24,
        carbsGramsPerServing: 36,
        fatGramsPerServing: 8,
      }),
    ).toThrow();
  });

  it("rejects negative protein grams", () => {
    expect(() =>
      recipePerServingMacrosSchema.parse({
        caloriesPerServing: 400,
        proteinGramsPerServing: -1,
        carbsGramsPerServing: 36,
        fatGramsPerServing: 8,
      }),
    ).toThrow();
  });

  it("rejects old field names (estimatedCalories, proteinGrams etc.)", () => {
    // Old schema field names must NOT silently parse — they should cause parse failure
    // because the new schema requires caloriesPerServing (mandatory, positive).
    expect(() =>
      recipePerServingMacrosSchema.parse({
        estimatedCalories: 320,
        proteinGrams: 24,
        carbsGrams: 36,
        fatGrams: 8,
      }),
    ).toThrow();
  });

  it("rejects non-integer macro values", () => {
    expect(() =>
      recipePerServingMacrosSchema.parse({
        caloriesPerServing: 320.5,
        proteinGramsPerServing: 24,
        carbsGramsPerServing: 36,
        fatGramsPerServing: 8,
      }),
    ).toThrow();
  });
});
