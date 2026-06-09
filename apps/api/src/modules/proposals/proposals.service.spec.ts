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
    supersedePendingForModify: async () => ({
      ...pendingProposal,
      status: "superseded" as const,
      userDecisionAt: new Date(),
    }),
    ...overrides,
  };
}

function createValidationServiceMock(overrides: Record<string, unknown> = {}) {
  return {
    validateStoredProposal: () => ({ valid: true, errors: [] }),
    validateProvenanceOwnership: async () => [],
    validateProgressLinkedProvenanceRequired: () => [],
    validateExerciseReferences: async () => [],
    validateHabitProposalContext: async () => [],
    validateCorrelationEvidenceRefs: () => [],
    validateCorrelationEvidenceOwnership: async () => [],
    validateGoalProposalHierarchy: async () => [],
    validateTodayChecklistGoalSourceRefs: async () => [],
    validateRecoveryAwareWorkoutAdaptation: async () => [],
    validateWellbeingCheckinProposalContext: async () => [],
    validateNutritionIncidentImageRefOwnership: async () => [],
    validateNutritionIncidentRecipeRecommendationContext: async () => [],
    validateChatAttachmentProposalRefs: async () => [],
    validateAdjustNutritionProteinFloor: async () => [],
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

  it("supersedes a pending proposal for modify without applying domain changes", async () => {
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

    const result = await service.requestProposalModification(
      auth,
      pendingProposal.id,
      "Keep one strength exercise but remove jumps.",
    );

    expect(applyCalled).toBe(false);
    expect(result).toMatchObject({
      proposal: expect.objectContaining({ status: "superseded" }),
      revisionContext: expect.objectContaining({
        nextAction: "send_chat_message",
        modificationFeedback: "Keep one strength exercise but remove jumps.",
        supersededProposalId: pendingProposal.id,
      }),
    });
  });

  it("blocks modify requests for non-pending proposals", async () => {
    const service = new ProposalsService(
      createRepositoryMock({
        findById: async () => ({ ...pendingProposal, status: "rejected" as const }),
        supersedePendingForModify: async () => null,
      }) as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      createValidationServiceMock() as never,
      {} as never,
    );

    await expect(
      service.requestProposalModification(auth, pendingProposal.id, "Make it shorter."),
    ).rejects.toBeInstanceOf(BadRequestException);
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

  it("blocks acceptance when evidence refs are not approved for the user", async () => {
    let applyCalled = false;
    let acceptCalled = false;
    let markedValidation:
      | { status: "invalid" | "valid" | "pending_validation"; errors: string[] }
      | undefined;
    const evidenceError =
      "evidenceRefs[0].id: Approved document signal was not found for this user.";
    const proposalWithEvidence = {
      ...pendingProposal,
      evidenceRefs: [
        {
          type: "document_signal" as const,
          id: "4a98f3dd-806d-4386-8c5f-43499626c5d7",
          label: "Energy level from uploaded document",
        },
      ],
    };

    const service = new ProposalsService(
      createRepositoryMock({
        findById: async () => proposalWithEvidence,
        acceptPendingProposal: async () => {
          acceptCalled = true;
          return proposalWithEvidence;
        },
        markValidation: async (
          _id: string,
          status: "invalid" | "valid" | "pending_validation",
          errors: string[],
        ) => {
          markedValidation = { status, errors };

          return {
            ...proposalWithEvidence,
            validationStatus: status,
            validationErrors: errors,
          };
        },
      }) as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      createValidationServiceMock({
        validateCorrelationEvidenceOwnership: async () => [evidenceError],
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
    expect(markedValidation).toEqual({
      status: "invalid",
      errors: [evidenceError],
    });
    expect(applyCalled).toBe(false);
    expect(acceptCalled).toBe(false);
  });

  it("blocks acceptance when habit proposal context validation fails", async () => {
    let applyCalled = false;
    let acceptCalled = false;
    let markedValidation: { status: string; errors: string[] } | null = null;
    const habitContextError =
      "proposedChanges: create_habit_plan requires no active habit plan.";
    const habitProposal = {
      ...pendingProposal,
      intent: "create_habit_plan" as const,
      targetDomain: "habits" as const,
      title: "Start hydration habit",
      reason: "Build a daily hydration routine.",
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
    };

    const service = new ProposalsService(
      createRepositoryMock({
        findById: async () => habitProposal,
        acceptPendingProposal: async () => {
          acceptCalled = true;
          return habitProposal;
        },
        markValidation: async (
          _proposalId: string,
          status: "invalid" | "valid" | "pending_validation",
          errors: string[],
        ) => {
          markedValidation = { status, errors };
          return habitProposal;
        },
      }) as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      createValidationServiceMock({
        validateHabitProposalContext: async () => [habitContextError],
      }) as never,
      {
        applyAcceptedProposal: async () => {
          applyCalled = true;
          return "habit_revision:880099c6-3b5f-4383-8246-97b72bf61818";
        },
      } as never,
    );

    await expect(
      service.decideProposal(auth, habitProposal.id, { decision: "accept" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(markedValidation).toEqual({
      status: "invalid",
      errors: [habitContextError],
    });
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
        days: [{ weekday: "monday" as const, focus: "Strength", exercises: [{ name: "Squat" }] }],
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
        days: [{ weekday: "monday" as const, focus: "Strength", exercises: [{ name: "Squat" }] }],
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
        days: [{ weekday: "monday" as const, focus: "Strength", exercises: [{ name: "Squat" }] }],
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

  it("blocks acceptance when workout proposal references unknown catalog exercises", async () => {
    let applyCalled = false;
    const unknownExerciseId = "c1000001-0000-4000-8000-000000000099";
    const workoutProposal = {
      ...pendingProposal,
      intent: "adapt_workout_plan" as const,
      targetDomain: "workout" as const,
      title: "Swap to unknown exercise",
      reason: "Testing catalog validation.",
      proposedChanges: {
        title: "Strength base",
        summary: "References an unknown exercise id.",
        days: [
          {
            weekday: "monday",
            focus: "Strength",
            exercises: [
              {
                exerciseId: unknownExerciseId,
                snapshot: {
                  name: "Unknown Move",
                  primaryMuscles: ["back"],
                  equipment: ["bodyweight"],
                },
                sets: 3,
                reps: "8",
              },
            ],
          },
        ],
      },
    };

    const service = new ProposalsService(
      createRepositoryMock({
        findById: async () => workoutProposal,
        markValidation: async (
          _id: string,
          status: "invalid" | "valid" | "pending_validation",
          errors: string[],
        ) => ({
          ...workoutProposal,
          validationStatus: status,
          validationErrors: errors,
        }),
      }) as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      createValidationServiceMock({
        validateExerciseReferences: async () => [
          `proposedChanges: exerciseId "${unknownExerciseId}" was not found in the visible exercise catalog.`,
        ],
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
          days: [{ weekday: "monday" as const, focus: "Strength", exercises: [{ name: "Squat" }] }],
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

  it("blocks acceptance when progress-linked proposals omit required sourceSummaryId", async () => {
    let applyCalled = false;
    const missingProvenanceError =
      "proposedChanges.sourceSummaryId: Progress-linked proposals require a weekly progress summary reference.";
    const progressNutritionProposal = {
      ...pendingProposal,
      intent: "adjust_nutrition_plan" as const,
      targetDomain: "nutrition" as const,
      title: "Adjust nutrition targets",
      reason: "Weekly adherence suggests a modest adjustment.",
      proposedChanges: {
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
      },
    };

    const service = new ProposalsService(
      createRepositoryMock({
        findById: async () => progressNutritionProposal,
      }) as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      createValidationServiceMock({
        validateProgressLinkedProvenanceRequired: () => [missingProvenanceError],
      }) as never,
      {
        applyAcceptedProposal: async () => {
          applyCalled = true;
          return "nutrition_revision:rev-progress";
        },
      } as never,
    );

    await expect(
      service.decideProposal(auth, progressNutritionProposal.id, { decision: "accept" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(applyCalled).toBe(false);
  });

  it("blocks acceptance when C4 dietary-draft proposal cuts protein while lowering calories (protein-floor safety)", async () => {
    // C4 invariant: when a lighten proposal lowers calories, protein must not be cut.
    // validateAdjustNutritionProteinFloor returns an error → decideProposal must throw
    // BadRequestException and must NOT call applyAcceptedProposal.
    let applyCalled = false;
    const proteinCutError =
      "nutrition: Protein must not be cut while lowering calories. Current floor: 130 g, proposed: 90 g.";

    const lightenProposal = {
      ...pendingProposal,
      intent: "adjust_nutrition_plan" as const,
      targetDomain: "nutrition" as const,
      title: "Make plan lighter",
      reason: "You asked for a lighter version.",
      proposedChanges: {
        plan: {
          title: "Lighter plan",
          summary: "Reduced carbs AND protein — should be rejected.",
          caloriesPerDay: 1750,
          proteinGrams: 90, // cut from 130 g — violates protein-floor rule
          carbsGrams: 150,
          fatGrams: 60,
          hydrationLiters: 2.5,
          mealStructure: [{ label: "Breakfast", timingHint: "Morning" }],
          preferences: [],
          restrictions: [],
          allergies: [],
          notes: [],
        },
        sourceSummaryId: "14a08176-64a7-4a2d-8a44-581807368394",
        sourceTrendObservationIds: [],
        fromCaloriesPerDay: 2100,
        swaps: [
          { from: "White rice 150g", to: "Cauliflower rice 150g", save: "~160 kcal" },
        ],
      },
    };

    const service = new ProposalsService(
      createRepositoryMock({ findById: async () => lightenProposal }) as never,
      { resolveFromAuth: async () => user } as never,
      createValidationServiceMock({
        validateAdjustNutritionProteinFloor: async () => [proteinCutError],
      }) as never,
      {
        applyAcceptedProposal: async () => {
          applyCalled = true;
          return "nutrition_revision:rev-lighter";
        },
      } as never,
    );

    await expect(
      service.decideProposal(auth, lightenProposal.id, { decision: "accept" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(applyCalled).toBe(false);
  });

  it("accepts a valid C4 dietary-draft proposal carrying swaps and preserved protein", async () => {
    // C4 happy path: protein preserved, calories lowered, swaps present.
    // validateAdjustNutritionProteinFloor returns [] → proposal proceeds to apply.
    let applyCalled = false;

    const lightenProposal = {
      ...pendingProposal,
      intent: "adjust_nutrition_plan" as const,
      targetDomain: "nutrition" as const,
      title: "Make plan lighter",
      reason: "You asked for a lighter version.",
      proposedChanges: {
        plan: {
          title: "Lighter plan",
          summary: "Reduced carbs, protein preserved.",
          caloriesPerDay: 1750,
          proteinGrams: 130, // protein unchanged
          carbsGrams: 150,
          fatGrams: 60,
          hydrationLiters: 2.5,
          mealStructure: [{ label: "Breakfast", timingHint: "Morning" }],
          preferences: [],
          restrictions: [],
          allergies: [],
          notes: [],
        },
        sourceSummaryId: "14a08176-64a7-4a2d-8a44-581807368394",
        sourceTrendObservationIds: [],
        fromCaloriesPerDay: 2100,
        swaps: [
          { from: "White rice 150g", to: "Cauliflower rice 150g", save: "~160 kcal" },
          { from: "Whole milk", to: "Skimmed milk", save: "~80 kcal" },
        ],
      },
    };

    const service = new ProposalsService(
      createRepositoryMock({ findById: async () => lightenProposal }) as never,
      { resolveFromAuth: async () => user } as never,
      createValidationServiceMock({
        validateAdjustNutritionProteinFloor: async () => [],
      }) as never,
      {
        applyAcceptedProposal: async () => {
          applyCalled = true;
          return "nutrition_revision:rev-lighter";
        },
      } as never,
    );

    const result = await service.decideProposal(auth, lightenProposal.id, { decision: "accept" });

    expect(result.status).toBe("accepted");
    expect(result.appliedReference).toBe("nutrition_revision:rev-lighter");
    expect(applyCalled).toBe(true);
  });

  it("accepts wellbeing check-in with edited proposedChanges override", async () => {
    let appliedChanges: unknown;
    const wellbeingProposal = {
      ...pendingProposal,
      intent: "capture_wellbeing_checkin" as const,
      targetDomain: "general" as const,
      title: "Wellbeing check-in",
      reason: "You mentioned feeling off today.",
      proposedChanges: {
        date: "2026-05-26",
        moodScore: 2,
        stressScore: 3,
        energyLevel: 2,
        note: null,
        tags: [],
      },
    };
    const editedChanges = {
      date: "2026-05-26",
      moodScore: 4,
      stressScore: 2,
      energyLevel: 3,
      note: "Feeling better after rest.",
      tags: [],
    };

    const service = new ProposalsService(
      createRepositoryMock({
        findById: async () => wellbeingProposal,
        acceptPendingProposal: async (
          _proposalId: string,
          _userId: string,
          applyFn: (proposal: typeof wellbeingProposal) => Promise<string>,
          options?: { proposedChangesOverride?: Record<string, unknown> },
        ) => {
          expect(options?.proposedChangesOverride).toEqual(editedChanges);
          const appliedReference = await applyFn({
            ...wellbeingProposal,
            proposedChanges: (options?.proposedChangesOverride ??
              wellbeingProposal.proposedChanges) as typeof wellbeingProposal.proposedChanges,
          });
          return {
            ...wellbeingProposal,
            proposedChanges: (options?.proposedChangesOverride ??
              wellbeingProposal.proposedChanges) as typeof wellbeingProposal.proposedChanges,
            status: "accepted" as const,
            appliedReference,
            userDecisionAt: new Date(),
          };
        },
      }) as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      createValidationServiceMock({
        validateWellbeingCheckinProposalContext: async (
          _userId: string,
          intent: typeof wellbeingProposal.intent,
          changes: unknown,
        ) => {
          if (intent !== "capture_wellbeing_checkin") {
            return [];
          }
          if ((changes as { date?: string }).date !== "2026-05-26") {
            return [
              "proposedChanges.date: Wellbeing check-in date must match the user's current day.",
            ];
          }
          return [];
        },
      }) as never,
      {
        applyAcceptedProposal: async (
          _auth: typeof auth,
          _userId: string,
          proposal: typeof wellbeingProposal,
        ) => {
          appliedChanges = proposal.proposedChanges;
          return "wellbeing_checkin:checkin-1";
        },
      } as never,
    );

    const result = await service.decideProposal(auth, wellbeingProposal.id, {
      decision: "accept",
      proposedChanges: editedChanges,
    });

    expect(result.status).toBe("accepted");
    expect(result.proposedChanges).toEqual(editedChanges);
    expect(appliedChanges).toEqual(editedChanges);
  });

  it("rejects stale wellbeing proposals when today's check-in already exists", async () => {
    let applyCalled = false;
    const staleError =
      "proposedChanges.date: A wellbeing check-in already exists for this day and cannot be overwritten by a stale proposal.";
    const wellbeingProposal = {
      ...pendingProposal,
      intent: "capture_wellbeing_checkin" as const,
      targetDomain: "general" as const,
      title: "Wellbeing check-in",
      reason: "You mentioned feeling off today.",
      proposedChanges: {
        date: "2026-05-26",
        moodScore: 2,
        stressScore: 3,
      },
    };

    const service = new ProposalsService(
      createRepositoryMock({
        findById: async () => wellbeingProposal,
        markValidation: async (
          _id: string,
          status: "invalid" | "valid" | "pending_validation",
          errors: string[],
        ) => ({
          ...wellbeingProposal,
          validationStatus: status,
          validationErrors: errors,
        }),
      }) as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      createValidationServiceMock({
        validateWellbeingCheckinProposalContext: async () => [staleError],
      }) as never,
      {
        applyAcceptedProposal: async () => {
          applyCalled = true;
          return "wellbeing_checkin:checkin-1";
        },
      } as never,
    );

    await expect(
      service.decideProposal(auth, wellbeingProposal.id, { decision: "accept" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(applyCalled).toBe(false);
  });

  it("rejects nutrition incident accept when image refs are not user-owned analyses", async () => {
    let applyCalled = false;
    const imageRefError =
      "proposedChanges.imageRefs[0].id: Image reference was not analyzed for this user.";
    const nutritionIncidentProposal = {
      ...pendingProposal,
      intent: "log_nutrition_incident" as const,
      targetDomain: "nutrition" as const,
      title: "Log nutrition incident",
      reason: "Review this estimate before confirming.",
      proposedChanges: {
        incidentDateTime: "2026-05-26T18:00:00.000Z",
        items: [{ name: "Pizza slice", calories: 280 }],
        estimatedCalories: 280,
        estimatedMacros: { proteinGrams: 12, carbsGrams: 30, fatGrams: 10 },
        confidence: "medium",
        provenance: {
          source: "dev_stub",
          providerId: "dev_food_photo",
          analysisId: "b1000001-0000-4000-8000-000000000002",
        },
        imageRefs: [{ id: "a1000001-0000-4000-8000-000000000001" }],
      },
    };

    const service = new ProposalsService(
      createRepositoryMock({
        findById: async () => nutritionIncidentProposal,
        markValidation: async (
          _id: string,
          status: "invalid" | "valid" | "pending_validation",
          errors: string[],
        ) => ({
          ...nutritionIncidentProposal,
          validationStatus: status,
          validationErrors: errors,
        }),
      }) as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      createValidationServiceMock({
        validateNutritionIncidentImageRefOwnership: async () => [imageRefError],
      }) as never,
      {
        applyAcceptedProposal: async () => {
          applyCalled = true;
          return "nutrition_incident:incident-1";
        },
      } as never,
    );

    await expect(
      service.decideProposal(auth, nutritionIncidentProposal.id, { decision: "accept" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(applyCalled).toBe(false);
  });

  it("rejects invalid wellbeing proposedChanges override at accept time", async () => {
    let applyCalled = false;
    const wellbeingProposal = {
      ...pendingProposal,
      intent: "capture_wellbeing_checkin" as const,
      targetDomain: "general" as const,
      title: "Wellbeing check-in",
      reason: "You mentioned feeling off today.",
      proposedChanges: {
        date: "2026-05-26",
        moodScore: 2,
        stressScore: 3,
      },
    };

    const service = new ProposalsService(
      createRepositoryMock({
        findById: async () => wellbeingProposal,
        markValidation: async (
          _id: string,
          status: "invalid" | "valid" | "pending_validation",
          errors: string[],
        ) => ({
          ...wellbeingProposal,
          validationStatus: status,
          validationErrors: errors,
        }),
      }) as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      createValidationServiceMock({
        validateStoredProposal: () => ({
          valid: false,
          errors: ["moodScore: Number must be less than or equal to 5"],
        }),
      }) as never,
      {
        applyAcceptedProposal: async () => {
          applyCalled = true;
          return "wellbeing_checkin:checkin-1";
        },
      } as never,
    );

    await expect(
      service.decideProposal(auth, wellbeingProposal.id, {
        decision: "accept",
        proposedChanges: {
          date: "2026-05-26",
          moodScore: 99,
          stressScore: 3,
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(applyCalled).toBe(false);
  });

  it("blocks nutrition incident accept when low-confidence override lacks userEdits", async () => {
    let applyCalled = false;
    const nutritionIncidentProposal = {
      ...pendingProposal,
      intent: "log_nutrition_incident" as const,
      targetDomain: "nutrition" as const,
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
    };

    const service = new ProposalsService(
      createRepositoryMock({
        findById: async () => nutritionIncidentProposal,
        markValidation: async (
          _id: string,
          status: "invalid" | "valid" | "pending_validation",
          errors: string[],
        ) => ({
          ...nutritionIncidentProposal,
          validationStatus: status,
          validationErrors: errors,
        }),
      }) as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      createValidationServiceMock({
        validateStoredProposal: () => ({
          valid: false,
          errors: [
            "proposedChanges: nutrition_incident: low-confidence estimates require userEdits before acceptance.",
          ],
        }),
      }) as never,
      {
        applyAcceptedProposal: async () => {
          applyCalled = true;
          return "nutrition_incident:incident-1";
        },
      } as never,
    );

    await expect(
      service.decideProposal(auth, nutritionIncidentProposal.id, {
        decision: "accept",
        proposedChanges: {
          incidentDateTime: "2026-05-26T18:00:00.000Z",
          items: [{ name: "Pizza slice", calories: 280 }],
          estimatedCalories: 280,
          estimatedMacros: { proteinGrams: 12, carbsGrams: 30, fatGrams: 10 },
          confidence: "low",
          provenance: { source: "text_estimate", providerId: "chat_trigger" },
          imageRefs: [],
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(applyCalled).toBe(false);
  });

  it("does not write structured state when rejecting wellbeing check-in proposal", async () => {
    let applyCalled = false;
    const wellbeingProposal = {
      ...pendingProposal,
      intent: "capture_wellbeing_checkin" as const,
      targetDomain: "general" as const,
      title: "Wellbeing check-in",
      reason: "You mentioned feeling off today.",
      proposedChanges: {
        date: "2026-05-26",
        moodScore: 2,
        stressScore: 3,
      },
    };

    const service = new ProposalsService(
      createRepositoryMock({
        findById: async () => wellbeingProposal,
      }) as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      createValidationServiceMock() as never,
      {
        applyAcceptedProposal: async () => {
          applyCalled = true;
          return "wellbeing_checkin:checkin-1";
        },
      } as never,
    );

    const result = await service.decideProposal(auth, wellbeingProposal.id, {
      decision: "reject",
    });

    expect(result.status).toBe("rejected");
    expect(applyCalled).toBe(false);
  });

  it("accepts nutrition incident with edited low-confidence override and userEdits", async () => {
    let appliedChanges: unknown;
    const nutritionIncidentProposal = {
      ...pendingProposal,
      intent: "log_nutrition_incident" as const,
      targetDomain: "nutrition" as const,
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
    };
    const editedChanges = {
      incidentDateTime: "2026-05-26T18:00:00.000Z",
      items: [{ name: "Two pizza slices", calories: 560 }],
      estimatedCalories: 560,
      estimatedMacros: { proteinGrams: 24, carbsGrams: 60, fatGrams: 20 },
      confidence: "low",
      provenance: { source: "user_manual", providerId: "chat_card" },
      imageRefs: [],
      userEdits: {
        editedAt: "2026-05-26T18:10:00.000Z",
        items: [{ name: "Two pizza slices", calories: 560 }],
      },
    };

    const service = new ProposalsService(
      createRepositoryMock({
        findById: async () => nutritionIncidentProposal,
        acceptPendingProposal: async (
          _proposalId: string,
          _userId: string,
          applyFn: (proposal: typeof nutritionIncidentProposal) => Promise<string>,
          options?: { proposedChangesOverride?: Record<string, unknown> },
        ) => {
          expect(options?.proposedChangesOverride).toEqual(editedChanges);
          const appliedReference = await applyFn({
            ...nutritionIncidentProposal,
            proposedChanges: (options?.proposedChangesOverride ??
              nutritionIncidentProposal.proposedChanges) as typeof nutritionIncidentProposal.proposedChanges,
          });
          return {
            ...nutritionIncidentProposal,
            proposedChanges: (options?.proposedChangesOverride ??
              nutritionIncidentProposal.proposedChanges) as typeof nutritionIncidentProposal.proposedChanges,
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
        applyAcceptedProposal: async (
          _auth: typeof auth,
          _userId: string,
          proposal: typeof nutritionIncidentProposal,
        ) => {
          appliedChanges = proposal.proposedChanges;
          return "nutrition_incident:incident-1";
        },
      } as never,
    );

    const result = await service.decideProposal(auth, nutritionIncidentProposal.id, {
      decision: "accept",
      proposedChanges: editedChanges,
    });

    expect(result.status).toBe("accepted");
    expect(result.proposedChanges).toEqual(editedChanges);
    expect(appliedChanges).toEqual(editedChanges);
  });

  it("blocks accept on superseded wellbeing proposal", async () => {
    let applyCalled = false;
    const supersededProposal = {
      ...pendingProposal,
      intent: "capture_wellbeing_checkin" as const,
      status: "superseded" as const,
      proposedChanges: {
        date: "2026-05-26",
        moodScore: 2,
        stressScore: 3,
      },
    };

    const service = new ProposalsService(
      createRepositoryMock({
        findById: async () => supersededProposal,
        acceptPendingProposal: async () => null,
      }) as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      createValidationServiceMock() as never,
      {
        applyAcceptedProposal: async () => {
          applyCalled = true;
          return "wellbeing_checkin:checkin-1";
        },
      } as never,
    );

    await expect(
      service.decideProposal(auth, supersededProposal.id, {
        decision: "accept",
        proposedChanges: {
          date: "2026-05-26",
          moodScore: 4,
          stressScore: 2,
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(applyCalled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Display-contract recompute seam — safety-critical accept-with-override tests
// ---------------------------------------------------------------------------

describe("ProposalsService decideProposal — display-contract recompute seam", () => {
  /**
   * Shared rate_per_hour display contract: caloriePerHourRate (readonly, stored rate),
   * durationMinutes (editable slider), totalCalories derived (isPrimaryTotal).
   */
  function makeRateContract(storedRate: number, storedDuration: number) {
    return {
      version: 1,
      fields: [
        {
          key: "caloriePerHourRate",
          label: "Burn rate",
          kind: "readonly",
          value: storedRate,
          editable: false,
        },
        {
          key: "durationMinutes",
          label: "Duration",
          kind: "slider",
          value: storedDuration,
          min: 1,
          max: 600,
          step: 5,
          editable: true,
        },
      ],
      derived: [
        {
          target: "totalCalories",
          label: "Estimated calories",
          unit: "kcal",
          op: "rate_per_hour",
          inputs: ["caloriePerHourRate", "durationMinutes"],
          isPrimaryTotal: true,
        },
      ],
    };
  }

  function makeBaseWorkoutChanges(overrides: Record<string, unknown> = {}) {
    return {
      title: "Strength base",
      summary: "Three day plan.",
      days: [{ weekday: "monday" as const, focus: "Strength", exercises: [{ name: "Squat" }] }],
      ...overrides,
    };
  }

  it("recompute fires on create_workout_plan accept: client total is discarded, stored rate governs", async () => {
    let appliedChanges: unknown;
    const storedContract = makeRateContract(280, 60);
    const workoutProposal = {
      ...pendingProposal,
      intent: "create_workout_plan" as const,
      targetDomain: "workout" as const,
      title: "Strength base plan",
      reason: "Starting fresh.",
      proposedChanges: makeBaseWorkoutChanges({
        caloriePerHourRate: 280,
        estimatedSessionCalorieBurn: 280,
        calorieEstimateProvenance: "workout_llm",
        displayContract: storedContract,
      }),
    };

    const service = new ProposalsService(
      createRepositoryMock({
        findById: async () => workoutProposal,
        acceptPendingProposal: async (
          _proposalId: string,
          _userId: string,
          applyFn: (proposal: typeof workoutProposal) => Promise<string>,
          options?: { proposedChangesOverride?: Record<string, unknown> },
        ) => {
          const appliedReference = await applyFn({
            ...workoutProposal,
            proposedChanges: (options?.proposedChangesOverride ??
              workoutProposal.proposedChanges) as typeof workoutProposal.proposedChanges,
          });
          return {
            ...workoutProposal,
            proposedChanges: (options?.proposedChangesOverride ??
              workoutProposal.proposedChanges) as typeof workoutProposal.proposedChanges,
            status: "accepted" as const,
            appliedReference,
            userDecisionAt: new Date(),
          };
        },
      }) as never,
      { resolveFromAuth: async () => user } as never,
      createValidationServiceMock() as never,
      {
        applyAcceptedProposal: async (
          _auth: typeof auth,
          _userId: string,
          proposal: typeof workoutProposal,
        ) => {
          appliedChanges = proposal.proposedChanges;
          return "workout_revision:create-1";
        },
      } as never,
    );

    // Client submits a fabricated-but-schema-valid total (must be within 0–20000)
    // to ensure the schema parse succeeds and the recompute guard is actually exercised.
    const result = await service.decideProposal(auth, workoutProposal.id, {
      decision: "accept",
      proposedChanges: makeBaseWorkoutChanges({
        estimatedSessionCalorieBurn: 9000, // Schema-valid fabricated total — must be replaced
        calorieEstimateProvenance: "workout_llm",
        // No displayContract on effective changes, so extractEditableFieldValues
        // returns no editable fields → stored field values are used:
        // stored duration=60, stored rate=280 → 280*(60/60)=280 kcal
      }),
    });

    expect(result.status).toBe("accepted");
    // The recomputed value (using stored rate 280, stored duration 60) is 280 kcal
    // The client-submitted 9000 must be discarded
    expect(
      (appliedChanges as Record<string, unknown>)["estimatedSessionCalorieBurn"],
    ).toBe(280);
    expect(
      (appliedChanges as Record<string, unknown>)["calorieEstimateProvenance"],
    ).toBe("workout_llm");
  });

  it("recompute fires on adapt_workout_plan accept: stored rate governs over client-submitted total", async () => {
    let appliedChanges: unknown;
    const storedContract = makeRateContract(300, 60);
    const workoutProposal = {
      ...pendingProposal,
      intent: "adapt_workout_plan" as const,
      targetDomain: "workout" as const,
      title: "Reduce lower body volume",
      reason: "Recovery signals.",
      proposedChanges: makeBaseWorkoutChanges({
        caloriePerHourRate: 300,
        estimatedSessionCalorieBurn: 300,
        calorieEstimateProvenance: "workout_llm",
        displayContract: storedContract,
      }),
    };

    const service = new ProposalsService(
      createRepositoryMock({
        findById: async () => workoutProposal,
        acceptPendingProposal: async (
          _proposalId: string,
          _userId: string,
          applyFn: (proposal: typeof workoutProposal) => Promise<string>,
          options?: { proposedChangesOverride?: Record<string, unknown> },
        ) => {
          const appliedReference = await applyFn({
            ...workoutProposal,
            proposedChanges: (options?.proposedChangesOverride ??
              workoutProposal.proposedChanges) as typeof workoutProposal.proposedChanges,
          });
          return {
            ...workoutProposal,
            proposedChanges: (options?.proposedChangesOverride ??
              workoutProposal.proposedChanges) as typeof workoutProposal.proposedChanges,
            status: "accepted" as const,
            appliedReference,
            userDecisionAt: new Date(),
          };
        },
      }) as never,
      { resolveFromAuth: async () => user } as never,
      createValidationServiceMock() as never,
      {
        applyAcceptedProposal: async (
          _auth: typeof auth,
          _userId: string,
          proposal: typeof workoutProposal,
        ) => {
          appliedChanges = proposal.proposedChanges;
          return "workout_revision:adapt-1";
        },
      } as never,
    );

    await service.decideProposal(auth, workoutProposal.id, {
      decision: "accept",
      proposedChanges: makeBaseWorkoutChanges({
        estimatedSessionCalorieBurn: 9999, // Client total — must be replaced
        calorieEstimateProvenance: "workout_llm",
      }),
    });

    // Recomputed from stored rate=300, stored duration=60 → 300*(60/60)=300
    expect(
      (appliedChanges as Record<string, unknown>)["estimatedSessionCalorieBurn"],
    ).toBe(300);
    expect(
      (appliedChanges as Record<string, unknown>)["calorieEstimateProvenance"],
    ).toBe("workout_llm");
  });

  it("recompute does NOT fire for non-workout intents (e.g. summarize_progress)", async () => {
    let appliedChanges: unknown;
    const generalProposal = {
      ...pendingProposal,
      intent: "summarize_progress" as const,
      targetDomain: "general" as const,
      proposedChanges: { summary: "Weekly recap." },
    };

    const service = new ProposalsService(
      createRepositoryMock({
        findById: async () => generalProposal,
        acceptPendingProposal: async (
          _proposalId: string,
          _userId: string,
          applyFn: (proposal: typeof generalProposal) => Promise<string>,
          options?: { proposedChangesOverride?: Record<string, unknown> },
        ) => {
          const appliedReference = await applyFn({
            ...generalProposal,
            proposedChanges: (options?.proposedChangesOverride ??
              generalProposal.proposedChanges) as typeof generalProposal.proposedChanges,
          });
          return {
            ...generalProposal,
            proposedChanges: (options?.proposedChangesOverride ??
              generalProposal.proposedChanges) as typeof generalProposal.proposedChanges,
            status: "accepted" as const,
            appliedReference,
            userDecisionAt: new Date(),
          };
        },
      }) as never,
      { resolveFromAuth: async () => user } as never,
      createValidationServiceMock() as never,
      {
        applyAcceptedProposal: async (
          _auth: typeof auth,
          _userId: string,
          proposal: typeof generalProposal,
        ) => {
          appliedChanges = proposal.proposedChanges;
          return "summary:applied";
        },
      } as never,
    );

    await service.decideProposal(auth, generalProposal.id, {
      decision: "accept",
      proposedChanges: { summary: "Edited recap." },
    });

    // Non-workout — proposedChanges are passed through unchanged
    expect((appliedChanges as Record<string, unknown>)["summary"]).toBe("Edited recap.");
  });

  it("accept on adapt_workout_plan_from_progress recomputes nested .plan estimate from stored rate", async () => {
    let appliedChanges: unknown;
    const storedContract = makeRateContract(250, 60);
    const fromProgressProposal = {
      ...pendingProposal,
      intent: "adapt_workout_plan_from_progress" as const,
      targetDomain: "workout" as const,
      title: "Progress-based adaptation",
      reason: "Weekly completion patterns suggest a lighter week.",
      proposedChanges: {
        plan: makeBaseWorkoutChanges({
          caloriePerHourRate: 250,
          estimatedSessionCalorieBurn: 250,
          calorieEstimateProvenance: "workout_llm",
          displayContract: storedContract,
        }),
        sourceSummaryId: "14a08176-64a7-4a2d-8a44-581807368394",
        sourceTrendObservationIds: ["24b19287-75b8-4a3e-9c10-691908479405"],
      },
    };

    const service = new ProposalsService(
      createRepositoryMock({
        findById: async () => fromProgressProposal,
        acceptPendingProposal: async (
          _proposalId: string,
          _userId: string,
          applyFn: (proposal: typeof fromProgressProposal) => Promise<string>,
          options?: { proposedChangesOverride?: Record<string, unknown> },
        ) => {
          const appliedReference = await applyFn({
            ...fromProgressProposal,
            proposedChanges: (options?.proposedChangesOverride ??
              fromProgressProposal.proposedChanges) as typeof fromProgressProposal.proposedChanges,
          });
          return {
            ...fromProgressProposal,
            proposedChanges: (options?.proposedChangesOverride ??
              fromProgressProposal.proposedChanges) as typeof fromProgressProposal.proposedChanges,
            status: "accepted" as const,
            appliedReference,
            userDecisionAt: new Date(),
          };
        },
      }) as never,
      { resolveFromAuth: async () => user } as never,
      createValidationServiceMock({
        validateProvenanceOwnership: async () => [],
        validateProgressLinkedProvenanceRequired: () => [],
      }) as never,
      {
        applyAcceptedProposal: async (
          _auth: typeof auth,
          _userId: string,
          proposal: typeof fromProgressProposal,
        ) => {
          appliedChanges = proposal.proposedChanges;
          return "workout_revision:from-progress-1";
        },
      } as never,
    );

    // Client submits a schema-valid fabricated total in the nested plan (0–20000 range)
    await service.decideProposal(auth, fromProgressProposal.id, {
      decision: "accept",
      proposedChanges: {
        plan: makeBaseWorkoutChanges({
          estimatedSessionCalorieBurn: 8000, // Schema-valid fabricated value — must be replaced
          calorieEstimateProvenance: "workout_llm",
        }),
        sourceSummaryId: "14a08176-64a7-4a2d-8a44-581807368394",
        sourceTrendObservationIds: ["24b19287-75b8-4a3e-9c10-691908479405"],
      },
    });

    // Recomputed from stored rate=250, stored duration=60 → 250*(60/60)=250
    const appliedWrapper = appliedChanges as Record<string, unknown>;
    const appliedPlan = appliedWrapper["plan"] as Record<string, unknown>;
    expect(appliedPlan["estimatedSessionCalorieBurn"]).toBe(250);
    expect(appliedPlan["calorieEstimateProvenance"]).toBe("workout_llm");
  });
});

// ---------------------------------------------------------------------------
// Calorie-field pinning: FIX 1 (rate always pinned) + FIX 2 (no-contract path)
// for workout-plan intents (create_workout_plan, adapt_workout_plan,
// adapt_workout_plan_from_progress) and log_workout_activity.
// ---------------------------------------------------------------------------

describe("ProposalsService decideProposal — calorie-field pinning (FIX 1 + FIX 2)", () => {
  /**
   * Shared rate_per_hour display contract helper (same shape as existing tests).
   */
  function makeRateContractForPinning(storedRate: number, storedDuration: number) {
    return {
      version: 1,
      fields: [
        {
          key: "caloriePerHourRate",
          label: "Burn rate",
          kind: "readonly",
          value: storedRate,
          editable: false,
        },
        {
          key: "durationMinutes",
          label: "Duration",
          kind: "slider",
          value: storedDuration,
          min: 1,
          max: 600,
          step: 5,
          editable: true,
        },
      ],
      derived: [
        {
          target: "totalCalories",
          label: "Estimated calories",
          unit: "kcal",
          op: "rate_per_hour",
          inputs: ["caloriePerHourRate", "durationMinutes"],
          isPrimaryTotal: true,
        },
      ],
    };
  }

  type AnyProposal = Omit<typeof pendingProposal, "intent" | "targetDomain" | "proposedChanges"> & {
    intent: string;
    targetDomain: string;
    proposedChanges: Record<string, unknown>;
  };
  function makeAcceptRepositoryMock<T extends AnyProposal>(storedProposal: T) {
    return createRepositoryMock({
      findById: async () => storedProposal,
      acceptPendingProposal: async (
        _proposalId: string,
        _userId: string,
        applyFn: (proposal: T) => Promise<string>,
        options?: { proposedChangesOverride?: Record<string, unknown> },
      ) => {
        const appliedReference = await applyFn({
          ...storedProposal,
          proposedChanges: (options?.proposedChangesOverride ??
            storedProposal.proposedChanges) as T["proposedChanges"],
        });
        return {
          ...storedProposal,
          proposedChanges: (options?.proposedChangesOverride ??
            storedProposal.proposedChanges) as T["proposedChanges"],
          status: "accepted" as const,
          appliedReference,
          userDecisionAt: new Date(),
        };
      },
    });
  }

  // ---- FIX 1: workout-plan — client ratePerHour (caloriePerHourRate) always pinned ----

  it("FIX1 workout-plan with contract: client-submitted caloriePerHourRate is ignored, stored rate is always used", async () => {
    let appliedChanges: Record<string, unknown> | undefined;
    const storedContract = makeRateContractForPinning(300, 60);
    const storedProposal = {
      ...pendingProposal,
      intent: "create_workout_plan" as const,
      targetDomain: "workout" as const,
      title: "Strength plan",
      reason: "Pinning test.",
      proposedChanges: {
        title: "Strength plan",
        summary: "One day.",
        days: [{ weekday: "monday" as const, focus: "Strength", exercises: [{ name: "Squat" }] }],
        caloriePerHourRate: 300,
        estimatedSessionCalorieBurn: 300,
        calorieEstimateProvenance: "workout_llm",
        displayContract: storedContract,
      },
    };

    const service = new ProposalsService(
      makeAcceptRepositoryMock(storedProposal) as never,
      { resolveFromAuth: async () => user } as never,
      createValidationServiceMock() as never,
      {
        applyAcceptedProposal: async (
          _auth: typeof auth,
          _userId: string,
          proposal: typeof storedProposal,
        ) => {
          appliedChanges = proposal.proposedChanges as Record<string, unknown>;
          return "workout_revision:fix1-plan";
        },
      } as never,
    );

    // Client sends an inflated rate (within schema max=5000); this must be discarded.
    await service.decideProposal(auth, storedProposal.id, {
      decision: "accept",
      proposedChanges: {
        title: "Strength plan",
        summary: "One day.",
        days: [{ weekday: "monday" as const, focus: "Strength", exercises: [{ name: "Squat" }] }],
        caloriePerHourRate: 4999, // tampered but within schema max(5000)
        estimatedSessionCalorieBurn: 9000,
        calorieEstimateProvenance: "workout_llm",
      },
    });

    // Stored rate=300 must be pinned; client-submitted 4999 must be replaced.
    expect(appliedChanges?.["caloriePerHourRate"]).toBe(300);
  });

  // ---- FIX 2: workout-plan — no-contract path pins estimatedSessionCalorieBurn + provenance ----

  it("FIX2 workout-plan without contract: client-submitted estimatedSessionCalorieBurn and provenance are pinned from stored proposal", async () => {
    let appliedChanges: Record<string, unknown> | undefined;
    // Stored proposal has no displayContract — no recompute runs; FIX 2 must pin from stored.
    const storedProposal = {
      ...pendingProposal,
      intent: "adapt_workout_plan" as const,
      targetDomain: "workout" as const,
      title: "Adapt plan",
      reason: "No-contract pinning test.",
      proposedChanges: {
        title: "Adapt plan",
        summary: "Recovery week.",
        days: [{ weekday: "monday" as const, focus: "Strength", exercises: [{ name: "Squat" }] }],
        caloriePerHourRate: 280,
        estimatedSessionCalorieBurn: 280,
        calorieEstimateProvenance: "workout_llm",
        // no displayContract
      },
    };

    const service = new ProposalsService(
      makeAcceptRepositoryMock(storedProposal) as never,
      { resolveFromAuth: async () => user } as never,
      createValidationServiceMock() as never,
      {
        applyAcceptedProposal: async (
          _auth: typeof auth,
          _userId: string,
          proposal: typeof storedProposal,
        ) => {
          appliedChanges = proposal.proposedChanges as Record<string, unknown>;
          return "workout_revision:fix2-plan";
        },
      } as never,
    );

    // Client submits inflated values on a no-contract accept (all within schema bounds).
    await service.decideProposal(auth, storedProposal.id, {
      decision: "accept",
      proposedChanges: {
        title: "Adapt plan",
        summary: "Recovery week.",
        days: [{ weekday: "monday" as const, focus: "Strength", exercises: [{ name: "Squat" }] }],
        caloriePerHourRate: 490,                     // tampered rate (within max 5000)
        estimatedSessionCalorieBurn: 15000,           // tampered burn
        calorieEstimateProvenance: "user_manual",     // tampered provenance
      },
    });

    // All three calorie fields must be pinned from the STORED proposal (FIX 1 + FIX 2).
    expect(appliedChanges?.["caloriePerHourRate"]).toBe(280);
    expect(appliedChanges?.["estimatedSessionCalorieBurn"]).toBe(280);
    expect(appliedChanges?.["calorieEstimateProvenance"]).toBe("workout_llm");
  });

  // ---- FIX 2: nested plan (adapt_workout_plan_from_progress) without contract ----

  it("FIX2 adapt_workout_plan_from_progress without contract: nested .plan calorie fields pinned from stored", async () => {
    let appliedChanges: Record<string, unknown> | undefined;
    const storedProposal = {
      ...pendingProposal,
      intent: "adapt_workout_plan_from_progress" as const,
      targetDomain: "workout" as const,
      title: "Progress-based adaptation",
      reason: "No-contract nested pinning test.",
      proposedChanges: {
        plan: {
          title: "Reduced load plan",
          summary: "Lighter week.",
          days: [{ weekday: "monday" as const, focus: "Strength", exercises: [{ name: "Squat" }] }],
          caloriePerHourRate: 250,
          estimatedSessionCalorieBurn: 250,
          calorieEstimateProvenance: "workout_llm",
          // no displayContract
        },
        sourceSummaryId: "14a08176-64a7-4a2d-8a44-581807368394",
        sourceTrendObservationIds: ["24b19287-75b8-4a3e-9c10-691908479405"],
      },
    };

    const service = new ProposalsService(
      makeAcceptRepositoryMock(storedProposal) as never,
      { resolveFromAuth: async () => user } as never,
      createValidationServiceMock({
        validateProvenanceOwnership: async () => [],
        validateProgressLinkedProvenanceRequired: () => [],
      }) as never,
      {
        applyAcceptedProposal: async (
          _auth: typeof auth,
          _userId: string,
          proposal: typeof storedProposal,
        ) => {
          appliedChanges = proposal.proposedChanges as Record<string, unknown>;
          return "workout_revision:fix2-progress";
        },
      } as never,
    );

    await service.decideProposal(auth, storedProposal.id, {
      decision: "accept",
      proposedChanges: {
        plan: {
          title: "Reduced load plan",
          summary: "Lighter week.",
          days: [{ weekday: "monday" as const, focus: "Strength", exercises: [{ name: "Squat" }] }],
          caloriePerHourRate: 4500,           // tampered (within schema max 5000)
          estimatedSessionCalorieBurn: 15000, // tampered
          calorieEstimateProvenance: "user_manual", // tampered
        },
        sourceSummaryId: "14a08176-64a7-4a2d-8a44-581807368394",
        sourceTrendObservationIds: ["24b19287-75b8-4a3e-9c10-691908479405"],
      },
    });

    const appliedPlan = (appliedChanges?.["plan"] ?? {}) as Record<string, unknown>;
    expect(appliedPlan["caloriePerHourRate"]).toBe(250);
    expect(appliedPlan["estimatedSessionCalorieBurn"]).toBe(250);
    expect(appliedPlan["calorieEstimateProvenance"]).toBe("workout_llm");
  });

  // ---- FIX 1 + FIX 2: log_workout_activity — with contract ----

  it("FIX1 log_workout_activity with contract: client-submitted ratePerHour is discarded; stored rate governs recompute", async () => {
    let appliedChanges: Record<string, unknown> | undefined;
    const storedProposal = {
      ...pendingProposal,
      intent: "log_workout_activity" as const,
      targetDomain: "workout" as const,
      title: "Volleyball 90 min",
      reason: "Activity log pinning test.",
      proposedChanges: {
        activityType: "volleyball",
        title: "Volleyball session",
        durationMinutes: 90,
        performedAt: "2026-06-04T16:00:00.000Z",
        ratePerHour: 300,
        estimatedCalories: 450,
        displayContract: {
          version: 1,
          fields: [
            { key: "ratePerHour", label: "Burn rate", kind: "readonly", value: 300, editable: false },
            { key: "durationMinutes", label: "Duration", kind: "slider", value: 90, min: 1, max: 600, step: 5, editable: true },
          ],
          derived: [
            { target: "totalCalories", label: "Estimated calories", unit: "kcal", op: "rate_per_hour", inputs: ["ratePerHour", "durationMinutes"], isPrimaryTotal: true },
          ],
        },
      },
    };

    const service = new ProposalsService(
      makeAcceptRepositoryMock(storedProposal) as never,
      { resolveFromAuth: async () => user } as never,
      createValidationServiceMock() as never,
      {
        applyAcceptedProposal: async (
          _auth: typeof auth,
          _userId: string,
          proposal: typeof storedProposal,
        ) => {
          appliedChanges = proposal.proposedChanges as Record<string, unknown>;
          return "workout_session:fix1-log";
        },
      } as never,
    );

    // Client sends a tampered ratePerHour (within schema max=3000); the stored rate=300 must pin it.
    await service.decideProposal(auth, storedProposal.id, {
      decision: "accept",
      proposedChanges: {
        activityType: "volleyball",
        title: "Volleyball session",
        durationMinutes: 90,
        performedAt: "2026-06-04T16:00:00.000Z",
        ratePerHour: 2999, // tampered but within schema max(3000)
        estimatedCalories: 15000,
      },
    });

    // ratePerHour must be pinned to 300; estimatedCalories recomputed from stored rate+duration.
    expect(appliedChanges?.["ratePerHour"]).toBe(300);
    // Recomputed: round(300 * 90 / 60) = 450
    expect(appliedChanges?.["estimatedCalories"]).toBe(450);
  });

  // ---- FIX 2: log_workout_activity — without contract ----

  it("FIX2 log_workout_activity without contract: both ratePerHour and estimatedCalories pinned from stored proposal", async () => {
    let appliedChanges: Record<string, unknown> | undefined;
    const storedProposal = {
      ...pendingProposal,
      intent: "log_workout_activity" as const,
      targetDomain: "workout" as const,
      title: "Running 60 min",
      reason: "No-contract activity log pinning test.",
      proposedChanges: {
        activityType: "running",
        title: "Running session",
        durationMinutes: 60,
        performedAt: "2026-06-04T08:00:00.000Z",
        ratePerHour: 350,
        estimatedCalories: 350,
        // no displayContract
      },
    };

    const service = new ProposalsService(
      makeAcceptRepositoryMock(storedProposal) as never,
      { resolveFromAuth: async () => user } as never,
      createValidationServiceMock() as never,
      {
        applyAcceptedProposal: async (
          _auth: typeof auth,
          _userId: string,
          proposal: typeof storedProposal,
        ) => {
          appliedChanges = proposal.proposedChanges as Record<string, unknown>;
          return "workout_session:fix2-log";
        },
      } as never,
    );

    // Client submits tampered values (within schema bounds); no displayContract means no recompute.
    // FIX 2 pins from stored.
    await service.decideProposal(auth, storedProposal.id, {
      decision: "accept",
      proposedChanges: {
        activityType: "running",
        title: "Running session",
        durationMinutes: 60,
        performedAt: "2026-06-04T08:00:00.000Z",
        ratePerHour: 2999,         // tampered (within max 3000)
        estimatedCalories: 18000,  // tampered (within max 20000)
      },
    });

    // Both fields must be pinned from stored proposal.
    expect(appliedChanges?.["ratePerHour"]).toBe(350);
    expect(appliedChanges?.["estimatedCalories"]).toBe(350);
  });

  // ---- GAP: stored displayContract with NO isPrimaryTotal derived — recompute is a no-op ----
  // A schema-valid displayContract that lacks isPrimaryTotal means recompute silently produces
  // no total.  The client MUST NOT be able to persist an inflated estimatedSessionCalorieBurn
  // or fabricated calorieEstimateProvenance='workout_llm' via this path.

  it("GAP create_workout_plan: stored displayContract without isPrimaryTotal still pins stored calorie fields (client override discarded)", async () => {
    let appliedChanges: Record<string, unknown> | undefined;
    // A displayContract that has no isPrimaryTotal derived entry — recompute is a no-op.
    const contractWithoutPrimaryTotal = {
      version: 1,
      fields: [
        {
          key: "caloriePerHourRate",
          label: "Burn rate",
          kind: "readonly",
          value: 300,
          editable: false,
        },
        {
          key: "durationMinutes",
          label: "Duration",
          kind: "slider",
          value: 60,
          min: 1,
          max: 600,
          step: 5,
          editable: true,
        },
      ],
      derived: [
        {
          // No isPrimaryTotal: true — this derived entry will not be used as the total.
          target: "informationalOnly",
          label: "Informational",
          unit: "kcal",
          op: "rate_per_hour",
          inputs: ["caloriePerHourRate", "durationMinutes"],
          // isPrimaryTotal intentionally absent
        },
      ],
    };
    const storedProposal = {
      ...pendingProposal,
      intent: "create_workout_plan" as const,
      targetDomain: "workout" as const,
      title: "Strength plan",
      reason: "No-primary-total contract pinning test.",
      proposedChanges: {
        title: "Strength plan",
        summary: "One day.",
        days: [{ weekday: "monday" as const, focus: "Strength", exercises: [{ name: "Squat" }] }],
        caloriePerHourRate: 300,
        estimatedSessionCalorieBurn: 300,
        calorieEstimateProvenance: "workout_llm" as const,
        displayContract: contractWithoutPrimaryTotal,
      },
    };

    const service = new ProposalsService(
      makeAcceptRepositoryMock(storedProposal) as never,
      { resolveFromAuth: async () => user } as never,
      createValidationServiceMock() as never,
      {
        applyAcceptedProposal: async (
          _auth: typeof auth,
          _userId: string,
          proposal: typeof storedProposal,
        ) => {
          appliedChanges = proposal.proposedChanges as Record<string, unknown>;
          return "workout_revision:gap-no-primary-total";
        },
      } as never,
    );

    // Client inflates both calorie fields — schema-valid values within bounds.
    await service.decideProposal(auth, storedProposal.id, {
      decision: "accept",
      proposedChanges: {
        title: "Strength plan",
        summary: "One day.",
        days: [{ weekday: "monday" as const, focus: "Strength", exercises: [{ name: "Squat" }] }],
        caloriePerHourRate: 4999,                 // tampered (within schema max 5000)
        estimatedSessionCalorieBurn: 19999,        // inflated (within schema max 20000)
        calorieEstimateProvenance: "workout_llm",  // fabricated
      },
    });

    // The recompute was a no-op (no isPrimaryTotal), so ALL three calorie fields must
    // be hard-pinned from the STORED proposal.  Client values must be discarded.
    expect(appliedChanges?.["caloriePerHourRate"]).toBe(300);
    expect(appliedChanges?.["estimatedSessionCalorieBurn"]).toBe(300);
    expect(appliedChanges?.["calorieEstimateProvenance"]).toBe("workout_llm");
  });

  it("GAP adapt_workout_plan_from_progress: nested .plan displayContract without isPrimaryTotal still pins stored calorie fields", async () => {
    let appliedChanges: Record<string, unknown> | undefined;
    const contractWithoutPrimaryTotal = {
      version: 1,
      fields: [
        {
          key: "caloriePerHourRate",
          label: "Burn rate",
          kind: "readonly",
          value: 250,
          editable: false,
        },
        {
          key: "durationMinutes",
          label: "Duration",
          kind: "slider",
          value: 60,
          min: 1,
          max: 600,
          step: 5,
          editable: true,
        },
      ],
      derived: [
        {
          target: "informationalOnly",
          label: "Informational",
          unit: "kcal",
          op: "rate_per_hour",
          inputs: ["caloriePerHourRate", "durationMinutes"],
          // isPrimaryTotal intentionally absent
        },
      ],
    };
    const storedProposal = {
      ...pendingProposal,
      intent: "adapt_workout_plan_from_progress" as const,
      targetDomain: "workout" as const,
      title: "Progress-based adaptation",
      reason: "No-primary-total nested contract pinning test.",
      proposedChanges: {
        plan: {
          title: "Reduced load plan",
          summary: "Lighter week.",
          days: [{ weekday: "monday" as const, focus: "Strength", exercises: [{ name: "Squat" }] }],
          caloriePerHourRate: 250,
          estimatedSessionCalorieBurn: 250,
          calorieEstimateProvenance: "workout_llm" as const,
          displayContract: contractWithoutPrimaryTotal,
        },
        sourceSummaryId: "14a08176-64a7-4a2d-8a44-581807368394",
        sourceTrendObservationIds: ["24b19287-75b8-4a3e-9c10-691908479405"],
      },
    };

    const service = new ProposalsService(
      makeAcceptRepositoryMock(storedProposal) as never,
      { resolveFromAuth: async () => user } as never,
      createValidationServiceMock({
        validateProvenanceOwnership: async () => [],
        validateProgressLinkedProvenanceRequired: () => [],
      }) as never,
      {
        applyAcceptedProposal: async (
          _auth: typeof auth,
          _userId: string,
          proposal: typeof storedProposal,
        ) => {
          appliedChanges = proposal.proposedChanges as Record<string, unknown>;
          return "workout_revision:gap-nested-no-primary-total";
        },
      } as never,
    );

    // Client inflates the nested .plan calorie fields.
    await service.decideProposal(auth, storedProposal.id, {
      decision: "accept",
      proposedChanges: {
        plan: {
          title: "Reduced load plan",
          summary: "Lighter week.",
          days: [{ weekday: "monday" as const, focus: "Strength", exercises: [{ name: "Squat" }] }],
          caloriePerHourRate: 4500,            // tampered (within schema max 5000)
          estimatedSessionCalorieBurn: 19000,  // inflated (within schema max 20000)
          calorieEstimateProvenance: "workout_llm",  // fabricated
        },
        sourceSummaryId: "14a08176-64a7-4a2d-8a44-581807368394",
        sourceTrendObservationIds: ["24b19287-75b8-4a3e-9c10-691908479405"],
      },
    });

    // No isPrimaryTotal in stored contract → recompute is a no-op → all three fields
    // must be hard-pinned from the stored nested .plan proposal.
    const appliedPlan = (appliedChanges?.["plan"] ?? {}) as Record<string, unknown>;
    expect(appliedPlan["caloriePerHourRate"]).toBe(250);
    expect(appliedPlan["estimatedSessionCalorieBurn"]).toBe(250);
    expect(appliedPlan["calorieEstimateProvenance"]).toBe("workout_llm");
  });

  // ---- C1 regression: log_workout_activity stored contract with NO isPrimaryTotal, no ratePerHour ----
  //
  // Security gap that was closed by Phase A:
  //   - Stored log proposal has a displayContract but NO isPrimaryTotal derived entry.
  //   - Stored proposal has no ratePerHour — only estimatedCalories.
  //   - Client submits an inflated estimatedCalories at accept time.
  //   - Old code: `hadDisplayContract=true` bypassed the hard-pin → client value persisted.
  //   - New code: recomputedTotal === null (no-op) → pinTrustedCalorieFields hard-overwrites
  //               estimatedCalories from the STORED proposal, discarding the client value.

  it("C1-REGRESSION log_workout_activity: stored contract with NO isPrimaryTotal and no stored ratePerHour pins stored estimatedCalories (client override discarded)", async () => {
    let appliedChanges: Record<string, unknown> | undefined;
    // A schema-valid displayContract that has no isPrimaryTotal derived entry.
    // All input keys are resolvable so the schema parse succeeds.
    // The absence of isPrimaryTotal causes recomputedTotal === null (no-op).
    // Old code path: `hadDisplayContract=true` → would skip the estimatedCalories pin.
    // New code path: `recomputedTotal !== null` (false) → hard-pins estimatedCalories from stored.
    const contractNoPrimaryTotal = {
      version: 1,
      fields: [
        {
          key: "ratePerHour",
          label: "Burn rate",
          kind: "readonly",
          value: 300,
          editable: false,
        },
        {
          key: "durationMinutes",
          label: "Duration",
          kind: "slider",
          value: 90,
          min: 1,
          max: 600,
          step: 5,
          editable: true,
        },
      ],
      derived: [
        {
          // All inputs resolvable (ratePerHour and durationMinutes are both fields).
          // isPrimaryTotal deliberately absent → recompute produces no trusted total.
          target: "informationalOnly",
          label: "Informational estimate",
          unit: "kcal",
          op: "rate_per_hour",
          inputs: ["ratePerHour", "durationMinutes"],
          // isPrimaryTotal intentionally absent (defaults to false in schema)
        },
      ],
    };
    const storedProposal = {
      ...pendingProposal,
      intent: "log_workout_activity" as const,
      targetDomain: "workout" as const,
      title: "Volleyball 90 min",
      reason: "C1 security regression test.",
      proposedChanges: {
        activityType: "volleyball",
        title: "Volleyball session",
        durationMinutes: 90,
        performedAt: "2026-06-04T16:00:00.000Z",
        // Stored: only estimatedCalories — no ratePerHour on the payload itself.
        estimatedCalories: 450,
        displayContract: contractNoPrimaryTotal,
      },
    };

    const service = new ProposalsService(
      makeAcceptRepositoryMock(storedProposal) as never,
      { resolveFromAuth: async () => user } as never,
      createValidationServiceMock() as never,
      {
        applyAcceptedProposal: async (
          _auth: typeof auth,
          _userId: string,
          proposal: typeof storedProposal,
        ) => {
          appliedChanges = proposal.proposedChanges as Record<string, unknown>;
          return "workout_session:c1-log-regression";
        },
      } as never,
    );

    // Client inflates estimatedCalories at accept time (within schema max 20000).
    // The stored contract exists but has no isPrimaryTotal → recompute no-ops (recomputedTotal=null)
    // → pinTrustedCalorieFields MUST hard-overwrite estimatedCalories from stored (450).
    // The client-submitted 18000 must be discarded.
    await service.decideProposal(auth, storedProposal.id, {
      decision: "accept",
      proposedChanges: {
        activityType: "volleyball",
        title: "Volleyball session",
        durationMinutes: 90,
        performedAt: "2026-06-04T16:00:00.000Z",
        estimatedCalories: 18000, // client-inflated (within schema max 20000) — MUST be discarded
      },
    });

    // recomputedTotal === null (no isPrimaryTotal in stored contract) →
    // pinTrustedCalorieFields hard-overwrites estimatedCalories from the STORED proposal.
    expect(appliedChanges?.["estimatedCalories"]).toBe(450);
    // ratePerHour: the stored payload had no ratePerHour key on the PAYLOAD itself
    // (only in the displayContract fields).  pinTrustedCalorieFields deletes it.
    expect(appliedChanges?.["ratePerHour"]).toBeUndefined();
  });

  // Confirm that the existing with-contract (WITH isPrimaryTotal) recompute still works.
  // This is regression coverage: the fix must not break the normal recompute path.

  it("REGRESSION with-contract (isPrimaryTotal present): recompute still fires and produces correct total", async () => {
    let appliedChanges: Record<string, unknown> | undefined;
    const contractWithPrimaryTotal = makeRateContractForPinning(300, 60);
    const storedProposal = {
      ...pendingProposal,
      intent: "create_workout_plan" as const,
      targetDomain: "workout" as const,
      title: "Strength plan",
      reason: "With-primary-total regression test.",
      proposedChanges: {
        title: "Strength plan",
        summary: "One day.",
        days: [{ weekday: "monday" as const, focus: "Strength", exercises: [{ name: "Squat" }] }],
        caloriePerHourRate: 300,
        estimatedSessionCalorieBurn: 300,
        calorieEstimateProvenance: "workout_llm" as const,
        displayContract: contractWithPrimaryTotal,
      },
    };

    const service = new ProposalsService(
      makeAcceptRepositoryMock(storedProposal) as never,
      { resolveFromAuth: async () => user } as never,
      createValidationServiceMock() as never,
      {
        applyAcceptedProposal: async (
          _auth: typeof auth,
          _userId: string,
          proposal: typeof storedProposal,
        ) => {
          appliedChanges = proposal.proposedChanges as Record<string, unknown>;
          return "workout_revision:regression-with-total";
        },
      } as never,
    );

    // Client sends an inflated total and adjusts the duration slider to 120 min.
    // Recomputed value must be: round(300 * 120 / 60) = 600.
    await service.decideProposal(auth, storedProposal.id, {
      decision: "accept",
      proposedChanges: {
        title: "Strength plan",
        summary: "One day.",
        days: [{ weekday: "monday" as const, focus: "Strength", exercises: [{ name: "Squat" }] }],
        caloriePerHourRate: 4999,                 // tampered — must be replaced
        estimatedSessionCalorieBurn: 19999,        // inflated — must be replaced with recomputed
        calorieEstimateProvenance: "workout_llm",
        displayContract: makeRateContractForPinning(300, 120), // client-side contract (ignored for structure)
      },
    });

    // isPrimaryTotal is present → recompute fires: stored rate=300, client duration=120 → 600.
    expect(appliedChanges?.["caloriePerHourRate"]).toBe(300);
    expect(appliedChanges?.["estimatedSessionCalorieBurn"]).toBe(600);
    expect(appliedChanges?.["calorieEstimateProvenance"]).toBe("workout_llm");
  });

  // ---- Duration slider value IS honored (only calorie-related fields are pinned) ----

  it("accept-with-override: client duration slider value is honored; only calorie fields are pinned from stored", async () => {
    let appliedChanges: Record<string, unknown> | undefined;
    const storedProposal = {
      ...pendingProposal,
      intent: "log_workout_activity" as const,
      targetDomain: "workout" as const,
      title: "Volleyball",
      reason: "Duration slider test.",
      proposedChanges: {
        activityType: "volleyball",
        title: "Volleyball session",
        durationMinutes: 90,
        performedAt: "2026-06-04T16:00:00.000Z",
        ratePerHour: 300,
        estimatedCalories: 450,
        displayContract: {
          version: 1,
          fields: [
            { key: "ratePerHour", label: "Burn rate", kind: "readonly", value: 300, editable: false },
            { key: "durationMinutes", label: "Duration", kind: "slider", value: 90, min: 1, max: 600, step: 5, editable: true },
          ],
          derived: [
            { target: "totalCalories", label: "Estimated calories", unit: "kcal", op: "rate_per_hour", inputs: ["ratePerHour", "durationMinutes"], isPrimaryTotal: true },
          ],
        },
      },
    };

    const service = new ProposalsService(
      makeAcceptRepositoryMock(storedProposal) as never,
      { resolveFromAuth: async () => user } as never,
      createValidationServiceMock() as never,
      {
        applyAcceptedProposal: async (
          _auth: typeof auth,
          _userId: string,
          proposal: typeof storedProposal,
        ) => {
          appliedChanges = proposal.proposedChanges as Record<string, unknown>;
          return "workout_session:duration-slider";
        },
      } as never,
    );

    // Client adjusts the duration slider to 120 min (valid, within stored [1,600]).
    // estimatedCalories must be recomputed: round(300 * 120 / 60) = 600.
    // durationMinutes=120 must be preserved in the applied changes.
    await service.decideProposal(auth, storedProposal.id, {
      decision: "accept",
      proposedChanges: {
        activityType: "volleyball",
        title: "Volleyball session",
        durationMinutes: 120,        // user slid to 120
        performedAt: "2026-06-04T16:00:00.000Z",
        ratePerHour: 2800,           // tampered (within schema max 3000) — must be replaced
        estimatedCalories: 18000,    // will be recomputed; within schema max 20000
        displayContract: {
          version: 1,
          fields: [
            { key: "ratePerHour", label: "Burn rate", kind: "readonly", value: 300, editable: false },
            { key: "durationMinutes", label: "Duration", kind: "slider", value: 120, min: 1, max: 600, step: 5, editable: true },
          ],
          derived: [
            { target: "totalCalories", label: "Estimated calories", unit: "kcal", op: "rate_per_hour", inputs: ["ratePerHour", "durationMinutes"], isPrimaryTotal: true },
          ],
        },
      },
    });

    expect(appliedChanges?.["ratePerHour"]).toBe(300);
    expect(appliedChanges?.["estimatedCalories"]).toBe(600); // round(300 * 120 / 60)
    expect(appliedChanges?.["durationMinutes"]).toBe(120);   // slider value preserved
  });
});

// ---------------------------------------------------------------------------
// Display-contract recompute seam — log_workout_activity (Part B)
// ---------------------------------------------------------------------------

describe("ProposalsService decideProposal — log_workout_activity displayContract recompute (Part B)", () => {
  /**
   * Shared rate_per_hour display contract:
   *   - caloriePerHourRate (readonly, stored)
   *   - durationMinutes   (editable slider)
   *   - totalCalories     (rate_per_hour derived, isPrimaryTotal)
   */
  function makeLogActivityContract(storedRate: number, storedDuration: number) {
    return {
      version: 1,
      fields: [
        {
          key: "caloriePerHourRate",
          label: "Burn rate",
          kind: "readonly",
          value: storedRate,
          editable: false,
        },
        {
          key: "durationMinutes",
          label: "Duration (min)",
          kind: "slider",
          value: storedDuration,
          min: 1,
          max: 600,
          step: 5,
          editable: true,
        },
      ],
      derived: [
        {
          target: "totalCalories",
          label: "Estimated calories",
          unit: "kcal",
          op: "rate_per_hour",
          inputs: ["caloriePerHourRate", "durationMinutes"],
          isPrimaryTotal: true,
        },
      ],
    };
  }

  function makeLogActivityProposal(overrides: Record<string, unknown> = {}) {
    return {
      ...pendingProposal,
      intent: "log_workout_activity" as const,
      targetDomain: "workout" as const,
      title: "Volleyball 90 min",
      reason: "User logged an ad-hoc activity.",
      proposedChanges: {
        activityType: "volleyball",
        title: "Volleyball session",
        durationMinutes: 90,
        performedAt: "2026-06-04T16:00:00.000Z",
        ratePerHour: 300,
        estimatedCalories: 450, // = round(300 × 90 / 60) — the stored correct value
        displayContract: makeLogActivityContract(300, 90),
        ...overrides,
      },
    };
  }

  it("recomputes estimatedCalories from stored ratePerHour at accept time; client total is discarded", async () => {
    let appliedChanges: unknown;
    const storedProposal = makeLogActivityProposal(); // stored: rate=300, duration=90 → 450 kcal

    const service = new ProposalsService(
      createRepositoryMock({
        findById: async () => storedProposal,
        acceptPendingProposal: async (
          _proposalId: string,
          _userId: string,
          applyFn: (proposal: typeof storedProposal) => Promise<string>,
          options?: { proposedChangesOverride?: Record<string, unknown> },
        ) => {
          const appliedReference = await applyFn({
            ...storedProposal,
            proposedChanges: (options?.proposedChangesOverride ??
              storedProposal.proposedChanges) as typeof storedProposal.proposedChanges,
          });
          return {
            ...storedProposal,
            proposedChanges: (options?.proposedChangesOverride ??
              storedProposal.proposedChanges) as typeof storedProposal.proposedChanges,
            status: "accepted" as const,
            appliedReference,
            userDecisionAt: new Date(),
          };
        },
      }) as never,
      { resolveFromAuth: async () => user } as never,
      createValidationServiceMock() as never,
      {
        applyAcceptedProposal: async (
          _auth: typeof auth,
          _userId: string,
          proposal: typeof storedProposal,
        ) => {
          appliedChanges = proposal.proposedChanges;
          return "workout_session:session-adhoc-recompute";
        },
      } as never,
    );

    // Client submits a fabricated-but-schema-valid estimatedCalories (must be within 0–20000)
    // and a client-side total=99999 which must be replaced by the stored-rate recompute.
    await service.decideProposal(auth, storedProposal.id, {
      decision: "accept",
      proposedChanges: {
        activityType: "volleyball",
        title: "Volleyball session",
        durationMinutes: 90,
        performedAt: "2026-06-04T16:00:00.000Z",
        ratePerHour: 300,
        // Client submits a schema-valid but inflated total — must be replaced
        estimatedCalories: 9999,
        // No displayContract on the effective payload; stored contract governs
      },
    });

    // Recomputed from stored rate=300, stored duration=90: round(300 × 90 / 60) = 450
    // The client-submitted 9999 must be discarded
    const changes = appliedChanges as Record<string, unknown>;
    expect(changes["estimatedCalories"]).toBe(450);
  });

  it("uses client-submitted durationMinutes when it is within the stored field bounds", async () => {
    let appliedChanges: unknown;
    // Stored: rate=300 kcal/hr, duration=90 min → original estimate 450 kcal
    // Client slides durationMinutes to 120 min → recomputed = round(300 × 120 / 60) = 600 kcal
    const storedProposal = makeLogActivityProposal();

    const service = new ProposalsService(
      createRepositoryMock({
        findById: async () => storedProposal,
        acceptPendingProposal: async (
          _proposalId: string,
          _userId: string,
          applyFn: (proposal: typeof storedProposal) => Promise<string>,
          options?: { proposedChangesOverride?: Record<string, unknown> },
        ) => {
          const appliedReference = await applyFn({
            ...storedProposal,
            proposedChanges: (options?.proposedChangesOverride ??
              storedProposal.proposedChanges) as typeof storedProposal.proposedChanges,
          });
          return {
            ...storedProposal,
            proposedChanges: (options?.proposedChangesOverride ??
              storedProposal.proposedChanges) as typeof storedProposal.proposedChanges,
            status: "accepted" as const,
            appliedReference,
            userDecisionAt: new Date(),
          };
        },
      }) as never,
      { resolveFromAuth: async () => user } as never,
      createValidationServiceMock() as never,
      {
        applyAcceptedProposal: async (
          _auth: typeof auth,
          _userId: string,
          proposal: typeof storedProposal,
        ) => {
          appliedChanges = proposal.proposedChanges;
          return "workout_session:session-adhoc-slider";
        },
      } as never,
    );

    // Client adjusts durationMinutes via slider to 120 (within stored max=600)
    // Also submits a displayContract with the updated value — but stored contract governs structure
    await service.decideProposal(auth, storedProposal.id, {
      decision: "accept",
      proposedChanges: {
        activityType: "volleyball",
        title: "Volleyball session",
        durationMinutes: 120, // User slid the slider
        performedAt: "2026-06-04T16:00:00.000Z",
        ratePerHour: 300,
        estimatedCalories: 9999, // Will be replaced
        displayContract: makeLogActivityContract(300, 120),
      },
    });

    // Recomputed from stored rate=300, client duration=120 (valid, within [1,600]): 600 kcal
    const changes = appliedChanges as Record<string, unknown>;
    expect(changes["estimatedCalories"]).toBe(600);
  });

  it("does NOT run the recompute when the stored proposal has no displayContract", async () => {
    let appliedChanges: unknown;
    // Stored proposal has no displayContract — recompute must not fire
    const storedProposal = makeLogActivityProposal({
      displayContract: undefined,
      estimatedCalories: 450,
    });

    const service = new ProposalsService(
      createRepositoryMock({
        findById: async () => storedProposal,
        acceptPendingProposal: async (
          _proposalId: string,
          _userId: string,
          applyFn: (proposal: typeof storedProposal) => Promise<string>,
          options?: { proposedChangesOverride?: Record<string, unknown> },
        ) => {
          const appliedReference = await applyFn({
            ...storedProposal,
            proposedChanges: (options?.proposedChangesOverride ??
              storedProposal.proposedChanges) as typeof storedProposal.proposedChanges,
          });
          return {
            ...storedProposal,
            proposedChanges: (options?.proposedChangesOverride ??
              storedProposal.proposedChanges) as typeof storedProposal.proposedChanges,
            status: "accepted" as const,
            appliedReference,
            userDecisionAt: new Date(),
          };
        },
      }) as never,
      { resolveFromAuth: async () => user } as never,
      createValidationServiceMock() as never,
      {
        applyAcceptedProposal: async (
          _auth: typeof auth,
          _userId: string,
          proposal: typeof storedProposal,
        ) => {
          appliedChanges = proposal.proposedChanges;
          return "workout_session:session-adhoc-no-contract";
        },
      } as never,
    );

    // Client submits changes without a displayContract; the client provides estimatedCalories=500
    // but the STORED proposal has estimatedCalories=450 — FIX 2 pins from the stored proposal.
    await service.decideProposal(auth, storedProposal.id, {
      decision: "accept",
      proposedChanges: {
        activityType: "volleyball",
        title: "Volleyball session",
        durationMinutes: 90,
        performedAt: "2026-06-04T16:00:00.000Z",
        ratePerHour: 300,
        estimatedCalories: 500, // Ignored — pinned to stored value below
      },
    });

    // No displayContract on stored proposal: trusted calorie fields are pinned from the
    // STORED proposal (FIX 2: no-contract bypass path closed).
    // Stored estimatedCalories=450 should win over the client-submitted 500.
    const changes = appliedChanges as Record<string, unknown>;
    expect(changes["estimatedCalories"]).toBe(450);
  });
});
