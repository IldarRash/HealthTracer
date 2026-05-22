import { describe, expect, it } from "vitest";
import {
  aiProposalSchema,
  aiStructuredOutputSchema,
  chatTurnResponseSchema,
  completeWorkoutSessionSchema,
  nutritionPlanPayloadSchema,
  proposalDecisionSchema,
  rawAiProposalSchema,
  scheduleWorkoutSessionSchema,
  sendChatMessageSchema,
  todayChecklistPayloadSchema,
  workoutSessionSchema,
  workoutPlanPayloadSchema,
  activeWorkoutPlanResponseSchema,
  workoutPlanRevisionSchema,
  createGoalSchema,
  onboardingSchema,
  upsertUserProfileSchema,
  activeNutritionPlanResponseSchema,
  nutritionPlanRevisionSchema,
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

  it("requires at least one onboarding goal", () => {
    expect(() =>
      onboardingSchema.parse({
        profile: {
          birthDate: "1992-04-12",
        },
        goals: [],
      }),
    ).toThrow();
  });
});

describe("phase 3 contracts", () => {
  it("accepts a chat turn with a typed workout proposal", () => {
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
                day: "Monday",
                focus: "Full body strength",
                exercises: ["Goblet squat", "Push-up"],
              },
            ],
          },
        },
      ],
    });

    expect(result.proposals).toHaveLength(1);
  });

  it("rejects empty chat messages", () => {
    expect(() => sendChatMessageSchema.parse({ content: "" })).toThrow();
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

  it("validates minimal workout and today payloads", () => {
    expect(() =>
      workoutPlanPayloadSchema.parse({
        title: "Strength base",
        summary: "Three repeatable training days.",
        days: [{ day: "Day 1", focus: "Strength" }],
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
    expect(() => proposalDecisionSchema.parse({ decision: "maybe" })).toThrow();
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
        notes: [],
      }),
    ).toThrow();
  });

  it("accepts structured and legacy string workout exercises", () => {
    const plan = workoutPlanPayloadSchema.parse({
      title: "Strength base",
      summary: "Use strings for old plans and objects for richer exercises.",
      days: [
        {
          day: "Monday",
          focus: "Lower body",
          exercises: ["Goblet squat", { name: "Romanian deadlift", sets: 3, reps: "8" }],
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

  it("parses active workout session response shapes", () => {
    expect(() =>
      workoutSessionSchema.parse({
        id: "78d40655-b4b5-47b3-b28e-470192e05f04",
        userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
        workoutPlanId: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
        workoutPlanRevisionId: "880099c6-3b5f-4383-8246-97b72bf61818",
        plannedDate: "2026-05-23",
        title: "Lower body day",
        status: "completed",
        exercises: ["Goblet squat"],
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
    days: [{ day: "Day 1", focus: "Strength", exercises: ["Squat"] }],
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
