import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { ProposalsService } from "./proposals.service.js";

const auth = {
  clerkUserId: "user_123",
  displayName: "Test User",
  email: "test@example.com",
};

const user = {
  id: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
  displayName: "Test User",
  email: "test@example.com",
  timezone: "UTC",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const pendingProposal = {
  id: "14a08176-64a7-4a2d-8a44-581807368394",
  userId: user.id,
  threadId: "24b19287-75b8-4a3e-9c10-691908479405",
  sourceMessageId: "34c29398-86c9-5b4f-ad21-7a2919585046",
  intent: "summarize_progress" as const,
  targetDomain: "general" as const,
  title: "Weekly progress summary",
  reason: "You asked for a recap of recent activity.",
  proposedChanges: {},
  status: "pending" as const,
  validationStatus: "valid" as const,
  validationErrors: [],
  userDecisionAt: null,
  appliedReference: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function createRepositoryMock(overrides: Record<string, unknown> = {}) {
  return {
    findById: async () => pendingProposal,
    listByUserId: async () => [],
    claimPendingForReject: async () => ({
      ...pendingProposal,
      status: "rejected" as const,
      userDecisionAt: new Date(),
    }),
    acceptPendingProposal: async (
      _proposalId: string,
      _userId: string,
      applyFn: (proposal: typeof pendingProposal) => Promise<string>,
    ) => {
      const appliedReference = await applyFn(pendingProposal);

      return {
        ...pendingProposal,
        status: "accepted" as const,
        appliedReference,
        userDecisionAt: new Date(),
      };
    },
    completePendingAcceptance: async (
      _proposalId: string,
      _userId: string,
      appliedReference: string,
    ) => ({
      ...pendingProposal,
      status: "accepted" as const,
      appliedReference,
      userDecisionAt: new Date(),
    }),
    claimPendingForAccept: async () => ({
      ...pendingProposal,
      status: "accepted" as const,
      userDecisionAt: new Date(),
    }),
    finalizeAcceptedProposal: async (
      _id: string,
      appliedReference: string | null,
    ) => ({
      ...pendingProposal,
      status: "accepted" as const,
      appliedReference,
      userDecisionAt: new Date(),
    }),
    revertAcceptedClaim: async () => pendingProposal,
    markValidation: async () => pendingProposal,
    ...overrides,
  };
}

function createValidationServiceMock(overrides: Record<string, unknown> = {}) {
  return {
    validateStoredProposal: () => ({ valid: true, errors: [] }),
    validateProvenanceOwnership: async () => [],
    ...overrides,
  };
}

describe("ProposalsService", () => {
  it("rejects a proposal without applying domain changes", async () => {
    let applyCalled = false;

    const service = new ProposalsService(
      createRepositoryMock() as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      createValidationServiceMock() as never,
      {
        applyAcceptedProposal: async () => {
          applyCalled = true;
          return "summary:applied";
        },
      } as never,
    );

    const result = await service.decideProposal(auth, pendingProposal.id, {
      decision: "reject",
    });

    expect(result.status).toBe("rejected");
    expect(applyCalled).toBe(false);
  });

  it("accepts a valid proposal through the apply service", async () => {
    let applyCalled = false;

    const service = new ProposalsService(
      createRepositoryMock() as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      createValidationServiceMock() as never,
      {
        applyAcceptedProposal: async () => {
          applyCalled = true;
          return `summary:${pendingProposal.id}`;
        },
      } as never,
    );

    const result = await service.decideProposal(auth, pendingProposal.id, {
      decision: "accept",
    });

    expect(result.status).toBe("accepted");
    expect(result.appliedReference).toBe(`summary:${pendingProposal.id}`);
    expect(applyCalled).toBe(true);
  });

  it("prevents double accept via pending claim guard", async () => {
    let applyCount = 0;
    let acceptCount = 0;

    const service = new ProposalsService(
      createRepositoryMock({
        acceptPendingProposal: async (
          _proposalId: string,
          _userId: string,
          applyFn: (proposal: typeof pendingProposal) => Promise<string>,
        ) => {
          acceptCount += 1;

          if (acceptCount > 1) {
            return null;
          }

          const appliedReference = await applyFn(pendingProposal);

          return {
            ...pendingProposal,
            status: "accepted" as const,
            appliedReference,
            userDecisionAt: new Date(),
          };
        },
      }) as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      createValidationServiceMock() as never,
      {
        applyAcceptedProposal: async () => {
          applyCount += 1;
          return `summary:${pendingProposal.id}`;
        },
      } as never,
    );

    await service.decideProposal(auth, pendingProposal.id, { decision: "accept" });

    await expect(
      service.decideProposal(auth, pendingProposal.id, { decision: "accept" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(applyCount).toBe(1);
  });

  it("leaves proposal pending when apply fails during acceptance", async () => {
    const service = new ProposalsService(
      createRepositoryMock({
        acceptPendingProposal: async () => {
          throw new Error("Apply failed.");
        },
      }) as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      createValidationServiceMock() as never,
      {
        applyAcceptedProposal: async () => {
          throw new Error("Apply failed.");
        },
      } as never,
    );

    await expect(
      service.decideProposal(auth, pendingProposal.id, { decision: "accept" }),
    ).rejects.toThrow("Apply failed.");
  });

  it("returns accepted proposal when acceptance recovery persists appliedReference", async () => {
    let applyCount = 0;
    const appliedReference = `workout_revision:880099c6-3b5f-4383-8246-97b72bf61818`;

    const service = new ProposalsService(
      createRepositoryMock({
        acceptPendingProposal: async (
          _proposalId: string,
          _userId: string,
          applyFn: (proposal: typeof pendingProposal) => Promise<string>,
        ) => {
          await applyFn(pendingProposal);
          return {
            ...pendingProposal,
            status: "accepted" as const,
            appliedReference,
            userDecisionAt: new Date(),
          };
        },
      }) as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      createValidationServiceMock() as never,
      {
        applyAcceptedProposal: async () => {
          applyCount += 1;
          return appliedReference;
        },
      } as never,
    );

    const result = await service.decideProposal(auth, pendingProposal.id, {
      decision: "accept",
    });

    expect(result.status).toBe("accepted");
    expect(result.appliedReference).toBe(appliedReference);
    expect(applyCount).toBe(1);
  });

  it("does not reapply on retry after acceptance recovery persisted the reference", async () => {
    let applyCount = 0;
    const appliedReference = `workout_revision:880099c6-3b5f-4383-8246-97b72bf61818`;
    const acceptedProposal = {
      ...pendingProposal,
      status: "accepted" as const,
      appliedReference,
      userDecisionAt: new Date(),
    };

    const service = new ProposalsService(
      createRepositoryMock({
        findById: async () => acceptedProposal,
      }) as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      createValidationServiceMock() as never,
      {
        applyAcceptedProposal: async () => {
          applyCount += 1;
          return appliedReference;
        },
      } as never,
    );

    const result = await service.decideProposal(auth, pendingProposal.id, {
      decision: "accept",
    });

    expect(result.appliedReference).toBe(appliedReference);
    expect(applyCount).toBe(0);
  });

  it("returns an already accepted proposal without reapplying", async () => {
    let applyCalled = false;
    const acceptedProposal = {
      ...pendingProposal,
      status: "accepted" as const,
      appliedReference: `summary:${pendingProposal.id}`,
      userDecisionAt: new Date(),
    };

    const service = new ProposalsService(
      createRepositoryMock({
        findById: async () => acceptedProposal,
      }) as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      createValidationServiceMock() as never,
      {
        applyAcceptedProposal: async () => {
          applyCalled = true;
          return `summary:${pendingProposal.id}`;
        },
      } as never,
    );

    const result = await service.decideProposal(auth, pendingProposal.id, {
      decision: "accept",
    });

    expect(result.appliedReference).toBe(`summary:${pendingProposal.id}`);
    expect(applyCalled).toBe(false);
  });

  it("blocks acceptance when validation fails", async () => {
    let applyCalled = false;
    let acceptCalled = false;

    const service = new ProposalsService(
      createRepositoryMock({
        acceptPendingProposal: async () => {
          acceptCalled = true;
          return pendingProposal;
        },
      }) as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      createValidationServiceMock({
        validateStoredProposal: () => ({
          valid: false,
          errors: ["proposedChanges: Invalid"],
        }),
      }) as never,
      {
        applyAcceptedProposal: async () => {
          applyCalled = true;
          return "summary:applied";
        },
      } as never,
    );

    await expect(
      service.decideProposal(auth, pendingProposal.id, { decision: "accept" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(applyCalled).toBe(false);
    expect(acceptCalled).toBe(false);
  });

  it("throws when deciding a non-pending proposal", async () => {
    const service = new ProposalsService(
      createRepositoryMock({
        findById: async () => ({ ...pendingProposal, status: "accepted" }),
        claimPendingForReject: async () => null,
      }) as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.decideProposal(auth, pendingProposal.id, { decision: "reject" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws when proposal is not owned by the current user", async () => {
    const service = new ProposalsService(
      createRepositoryMock({
        findById: async () => null,
      }) as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.getProposal(auth, pendingProposal.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("blocks acceptance when proposal content fails safety checks", async () => {
    let applyCalled = false;
    let acceptCalled = false;
    const unsafeProposal = {
      ...pendingProposal,
      title: "Treatment plan",
      reason: "You should take medication for your symptoms.",
    };

    const service = new ProposalsService(
      createRepositoryMock({
        findById: async () => unsafeProposal,
        acceptPendingProposal: async () => {
          acceptCalled = true;
          return unsafeProposal;
        },
        markValidation: async (
          _id: string,
          status: "invalid" | "valid" | "pending_validation",
          errors: string[],
        ) => ({
          ...unsafeProposal,
          validationStatus: status,
          validationErrors: errors,
        }),
      }) as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      createValidationServiceMock() as never,
      {
        applyAcceptedProposal: async () => {
          applyCalled = true;
          return "summary:applied";
        },
      } as never,
    );

    await expect(
      service.decideProposal(auth, pendingProposal.id, { decision: "accept" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(applyCalled).toBe(false);
    expect(acceptCalled).toBe(false);
  });

  it("accepts a valid create_workout_plan proposal and records workout revision reference", async () => {
    let applyCalled = false;
    const workoutProposal = {
      ...pendingProposal,
      intent: "create_workout_plan" as const,
      targetDomain: "workout" as const,
      title: "Strength base plan",
      reason: "Build a repeatable three-day structure.",
      proposedChanges: {
        title: "Strength base",
        summary: "Three repeatable training days.",
        days: [{ day: "Day 1", focus: "Strength", exercises: ["Squat"] }],
      },
    };

    const service = new ProposalsService(
      createRepositoryMock({
        findById: async () => workoutProposal,
        acceptPendingProposal: async (
          _proposalId: string,
          _userId: string,
          applyFn: (proposal: typeof workoutProposal) => Promise<string>,
        ) => {
          const appliedReference = await applyFn(workoutProposal);
          return {
            ...workoutProposal,
            status: "accepted" as const,
            appliedReference,
            userDecisionAt: new Date(),
          };
        },
      }) as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      createValidationServiceMock() as never,
      {
        applyAcceptedProposal: async () => {
          applyCalled = true;
          return "workout_revision:880099c6-3b5f-4383-8246-97b72bf61818";
        },
      } as never,
    );

    const result = await service.decideProposal(auth, workoutProposal.id, {
      decision: "accept",
    });

    expect(result.status).toBe("accepted");
    expect(result.appliedReference).toBe(
      "workout_revision:880099c6-3b5f-4383-8246-97b72bf61818",
    );
    expect(applyCalled).toBe(true);
  });

  it("rejects a today checklist proposal without applying domain changes", async () => {
    let applyCalled = false;
    const todayProposal = {
      ...pendingProposal,
      intent: "create_today_checklist" as const,
      targetDomain: "today" as const,
      title: "Daily checklist",
      reason: "Start with hydration and recovery.",
      proposedChanges: {
        date: "2026-05-22",
        items: [{ label: "Drink water", kind: "hydration" as const }],
      },
    };

    const service = new ProposalsService(
      createRepositoryMock({
        findById: async () => todayProposal,
      }) as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      createValidationServiceMock() as never,
      {
        applyAcceptedProposal: async () => {
          applyCalled = true;
          return "daily_checklist:checklist-1";
        },
      } as never,
    );

    const result = await service.decideProposal(auth, todayProposal.id, {
      decision: "reject",
    });

    expect(result.status).toBe("rejected");
    expect(applyCalled).toBe(false);
  });

  it("rejects a recipe proposal without creating recommendations", async () => {
    let applyCalled = false;
    const recipeProposal = {
      ...pendingProposal,
      intent: "recommend_recipes" as const,
      targetDomain: "recipe" as const,
      title: "Recipe suggestions",
      reason: "These options fit your active nutrition plan.",
      proposedChanges: {
        relatedNutritionPlanRevisionId: "ad000002-0000-4000-8000-000000000001",
        recommendations: [
          {
            recipeId: "a1000001-0000-4000-8000-000000000001",
            reason: "Fits your current lunch preferences.",
            fitSummary: "Estimated macros are a reasonable fit for your plan.",
          },
        ],
      },
    };

    const service = new ProposalsService(
      createRepositoryMock({
        findById: async () => recipeProposal,
      }) as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      createValidationServiceMock() as never,
      {
        applyAcceptedProposal: async () => {
          applyCalled = true;
          return "recipe_recommendation:rec-1";
        },
      } as never,
    );

    const result = await service.decideProposal(auth, recipeProposal.id, {
      decision: "reject",
    });

    expect(result.status).toBe("rejected");
    expect(applyCalled).toBe(false);
  });

  it("rejects a workout proposal without applying domain changes", async () => {
    let applyCalled = false;
    const workoutProposal = {
      ...pendingProposal,
      intent: "adapt_workout_plan" as const,
      targetDomain: "workout" as const,
      title: "Reduce lower body volume",
      reason: "Matches reported fatigue.",
      proposedChanges: {
        title: "Strength base",
        summary: "Reduced volume for recovery.",
        days: [{ day: "Day 1", focus: "Strength", exercises: ["Squat"] }],
      },
    };

    const service = new ProposalsService(
      createRepositoryMock({
        findById: async () => workoutProposal,
      }) as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      createValidationServiceMock() as never,
      {
        applyAcceptedProposal: async () => {
          applyCalled = true;
          return "workout_revision:rev-1";
        },
      } as never,
    );

    const result = await service.decideProposal(auth, workoutProposal.id, {
      decision: "reject",
    });

    expect(result.status).toBe("rejected");
    expect(applyCalled).toBe(false);
  });

  it("rejects a nutrition proposal without applying domain changes", async () => {
    let applyCalled = false;
    const nutritionProposal = {
      ...pendingProposal,
      intent: "adjust_nutrition_plan" as const,
      targetDomain: "nutrition" as const,
      title: "Adjust hydration target",
      reason: "Matches your training schedule.",
      proposedChanges: {
        title: "Balanced base",
        summary: "Moderate macros and hydration.",
        caloriesPerDay: 2200,
        proteinGrams: 140,
        carbsGrams: 220,
        fatGrams: 70,
        hydrationLiters: 3,
        mealStructure: [{ label: "Breakfast", timingHint: null }],
        preferences: [],
        restrictions: [],
        allergies: [],
        notes: [],
      },
    };

    const service = new ProposalsService(
      createRepositoryMock({
        findById: async () => nutritionProposal,
        claimPendingForReject: async () => ({
          ...nutritionProposal,
          status: "rejected" as const,
          userDecisionAt: new Date(),
        }),
      }) as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      createValidationServiceMock() as never,
      {
        applyAcceptedProposal: async () => {
          applyCalled = true;
          return "nutrition_revision:rev-1";
        },
      } as never,
    );

    const result = await service.decideProposal(auth, nutritionProposal.id, {
      decision: "reject",
    });

    expect(result.status).toBe("rejected");
    expect(applyCalled).toBe(false);
  });

  it("blocks acceptance when workout proposal payload validation fails", async () => {
    let applyCalled = false;
    const workoutProposal = {
      ...pendingProposal,
      intent: "create_workout_plan" as const,
      targetDomain: "workout" as const,
      title: "Strength base plan",
      reason: "Missing training days.",
      proposedChanges: {
        title: "Strength base",
        summary: "No days configured.",
        days: [],
      },
    };

    const service = new ProposalsService(
      createRepositoryMock({
        findById: async () => workoutProposal,
      }) as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      createValidationServiceMock({
        validateStoredProposal: () => ({
          valid: false,
          errors: ["proposedChanges.days: At least one training day is required."],
        }),
      }) as never,
      {
        applyAcceptedProposal: async () => {
          applyCalled = true;
          return "workout_revision:rev-1";
        },
      } as never,
    );

    await expect(
      service.decideProposal(auth, workoutProposal.id, { decision: "accept" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(applyCalled).toBe(false);
  });

  it("blocks acceptance when workout proposal content fails safety checks", async () => {
    let applyCalled = false;
    const unsafeWorkoutProposal = {
      ...pendingProposal,
      intent: "create_workout_plan" as const,
      targetDomain: "workout" as const,
      title: "Treatment plan",
      reason: "You should take medication for your symptoms.",
      proposedChanges: {
        title: "Strength base",
        summary: "Three repeatable training days.",
        days: [{ day: "Day 1", focus: "Strength", exercises: ["Squat"] }],
      },
    };

    const service = new ProposalsService(
      createRepositoryMock({
        findById: async () => unsafeWorkoutProposal,
      }) as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      createValidationServiceMock() as never,
      {
        applyAcceptedProposal: async () => {
          applyCalled = true;
          return "workout_revision:rev-1";
        },
      } as never,
    );

    await expect(
      service.decideProposal(auth, unsafeWorkoutProposal.id, { decision: "accept" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(applyCalled).toBe(false);
  });

  it("throws when deciding a rejected proposal", async () => {
    const service = new ProposalsService(
      createRepositoryMock({
        findById: async () => ({ ...pendingProposal, status: "rejected" }),
        claimPendingForAccept: async () => null,
      }) as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      createValidationServiceMock() as never,
      {} as never,
    );

    await expect(
      service.decideProposal(auth, pendingProposal.id, { decision: "accept" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("blocks acceptance when progress-derived workout provenance is foreign or missing", async () => {
    let applyCalled = false;
    const progressWorkoutProposal = {
      ...pendingProposal,
      intent: "adapt_workout_plan_from_progress" as const,
      targetDomain: "workout" as const,
      title: "Adjust training volume",
      reason: "Weekly completion patterns suggest a lighter week.",
      proposedChanges: {
        plan: {
          title: "Strength base",
          summary: "Reduced volume based on weekly completion patterns.",
          days: [{ day: "Day 1", focus: "Strength", exercises: ["Squat"] }],
        },
        sourceSummaryId: "14a08176-64a7-4a2d-8a44-581807368394",
        sourceTrendObservationIds: ["24b19287-75b8-4a3e-9c10-691908479405"],
      },
    };

    const service = new ProposalsService(
      createRepositoryMock({
        findById: async () => progressWorkoutProposal,
      }) as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      createValidationServiceMock({
        validateProvenanceOwnership: async () => [
          "proposedChanges.sourceSummaryId: Weekly progress summary was not found for this user.",
        ],
      }) as never,
      {
        applyAcceptedProposal: async () => {
          applyCalled = true;
          return "workout_revision:rev-progress";
        },
      } as never,
    );

    await expect(
      service.decideProposal(auth, progressWorkoutProposal.id, { decision: "accept" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(applyCalled).toBe(false);
  });
});
