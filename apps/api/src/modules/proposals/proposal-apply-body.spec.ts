/**
 * Tests that the proposal apply service routes save_body_analysis
 * to BodyService.applyBodyAnalysisProposal and returns the correct reference string.
 */
import { describe, expect, it } from "vitest";
import { ProposalApplyService } from "./proposal-apply.service.js";

const auth = {
  clerkUserId: "user_123",
  displayName: "Test User",
  email: "test@example.com",
};

const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";

const bodyPayload = {
  date: "2026-06-08",
  source: "chat" as const,
  fatPctMin: 18,
  fatPctMax: 22,
  muscleTone: "average" as const,
  weightKg: 78,
  weightSelfReported: true,
  strongGroups: ["chest"],
  weakGroups: ["lower_back"],
  muscleMap: { chest: "strong" as const, lower_back: "weak" as const },
};

const baseProposal = {
  id: "14a08176-64a7-4a2d-8a44-581807368394",
  userId,
  threadId: "24b19287-75b8-4a3e-9c10-691908479405",
  sourceMessageId: "34c29398-86c9-5b4f-ad21-7a2919585046",
  title: "Анализ тела",
  reason: "Визуальная оценка по фото.",
  evidenceRefs: null,
  proposedChanges: bodyPayload,
  status: "pending" as const,
  validationStatus: "valid" as const,
  validationErrors: [] as string[],
  userDecisionAt: null,
  appliedReference: null,
  createdAt: new Date("2026-06-08T00:00:00.000Z"),
  updatedAt: new Date("2026-06-08T00:00:00.000Z"),
};

describe("ProposalApplyService — save_body_analysis", () => {
  it("routes save_body_analysis proposals to BodyService and returns a body_analysis: reference", async () => {
    let capturedUserId: string | undefined;
    let capturedProposalId: string | undefined;
    let capturedPayload: unknown;

    const service = new ProposalApplyService(
      {} as never, // profilesService
      {} as never, // goalsService
      {} as never, // workoutsService
      {} as never, // nutritionService
      {} as never, // habitsService
      {} as never, // recipesService
      {} as never, // todayService
      {} as never, // progressService
      {} as never, // wellbeingCheckInsService
      {
        applyBodyAnalysisProposal: async (uid: string, proposalId: string, payload: unknown) => {
          capturedUserId = uid;
          capturedProposalId = proposalId;
          capturedPayload = payload;
          return "body_analysis:bca-001";
        },
      } as never, // bodyService
    );

    const reference = await service.applyAcceptedProposal(auth, userId, {
      ...baseProposal,
      intent: "save_body_analysis",
      targetDomain: "body",
      proposedChanges: bodyPayload,
    });

    expect(reference).toBe("body_analysis:bca-001");
    expect(capturedUserId).toBe(userId);
    expect(capturedProposalId).toBe(baseProposal.id);
    expect(capturedPayload).toMatchObject({
      source: "chat",
      fatPctMin: 18,
      fatPctMax: 22,
    });
  });

  it("calls bodyService exactly once per accepted proposal (no double-write)", async () => {
    let callCount = 0;

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
      {
        applyBodyAnalysisProposal: async () => {
          callCount++;
          return "body_analysis:bca-once";
        },
      } as never,
    );

    await service.applyAcceptedProposal(auth, userId, {
      ...baseProposal,
      intent: "save_body_analysis",
      targetDomain: "body",
      proposedChanges: bodyPayload,
    });

    expect(callCount).toBe(1);
  });

  it("does NOT call bodyService for nutrition plan proposals", async () => {
    let bodyServiceCalled = false;
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
      {
        applyBodyAnalysisProposal: async () => {
          bodyServiceCalled = true;
          return "body_analysis:should-not-reach";
        },
      } as never,
    );

    await service.applyAcceptedProposal(auth, userId, {
      ...baseProposal,
      intent: "create_nutrition_plan",
      targetDomain: "nutrition",
      proposedChanges: {
        title: "Plan",
        summary: "Summary",
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
    });

    expect(bodyServiceCalled).toBe(false);
    expect(nutritionCalled).toBe(true);
  });
});
