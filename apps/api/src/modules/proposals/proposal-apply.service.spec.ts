import { BadRequestException } from "@nestjs/common";
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
  notes: ["Prioritize whole foods."],
};

const todayPayload = {
  date: "2026-05-22",
  items: [{ label: "Drink water", kind: "hydration" as const, completed: false }],
};

describe("ProposalApplyService", () => {
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

  it("routes accepted today checklist proposals through the today service", async () => {
    let todayCalled = false;

    const service = new ProposalApplyService(
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

  it("returns a summary reference without calling domain services", async () => {
    let domainCalled = false;

    const service = new ProposalApplyService(
      {
        upsertCurrentProfile: async () => {
          domainCalled = true;
          return { id: "profile-1" };
        },
      } as never,
      {
        createCurrentGoal: async () => {
          domainCalled = true;
          return { id: "goal-1" };
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const reference = await service.applyAcceptedProposal(auth, userId, {
      ...baseProposal,
      intent: "summarize_progress",
      targetDomain: "general",
      proposedChanges: {},
    });

    expect(reference).toBe(`summary:${baseProposal.id}`);
    expect(domainCalled).toBe(false);
  });

  it("throws for unsupported proposal intents", async () => {
    const service = new ProposalApplyService(
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
});
