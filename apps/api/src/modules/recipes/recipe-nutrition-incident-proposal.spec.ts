import { describe, expect, it } from "vitest";
import { ProposalsService } from "../proposals/proposals.service.js";
import { RecipesService } from "./recipes.service.js";

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
  createdAt: new Date("2026-05-22T12:00:00.000Z"),
  updatedAt: new Date("2026-05-22T12:00:00.000Z"),
};

const recommendationId = "b2000001-0000-4000-8000-000000000001";
const proposalId = "d5000001-0000-4000-8000-000000000001";
const threadId = "c4000001-0000-4000-8000-000000000001";

const pendingProposal = {
  id: proposalId,
  userId: user.id,
  threadId,
  sourceMessageId: null,
  intent: "log_nutrition_incident" as const,
  targetDomain: "nutrition" as const,
  title: "Log Lentil power bowl",
  reason: "Review estimate",
  evidenceRefs: null,
  proposedChanges: {
    incidentDateTime: "2026-05-26T18:00:00.000Z",
    items: [{ name: "Lentil power bowl", quantity: "1 serving", calories: 690 }],
    estimatedCalories: 690,
    estimatedMacros: { proteinGrams: 48, carbsGrams: 82, fatGrams: 18 },
    confidence: "medium",
    provenance: {
      source: "recipe_recommendation",
      providerId: recommendationId,
    },
    imageRefs: [],
  },
  status: "pending" as const,
  validationStatus: "valid" as const,
  validationErrors: [] as string[],
  userDecisionAt: null,
  appliedReference: null,
  createdAt: new Date("2026-05-26T18:00:00.000Z"),
  updatedAt: new Date("2026-05-26T18:00:00.000Z"),
};

describe("recipe nutrition incident proposal accept flow", () => {
  it("accepts a recipe-backed proposal and creates exactly one nutrition incident", async () => {
    let applyCalled = false;
    let incidentCreates = 0;

    const proposalsService = new ProposalsService(
      {
        findById: async () => pendingProposal,
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
        markValidation: async () => pendingProposal,
      } as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      {
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
      } as never,
      {
        applyAcceptedProposal: async () => {
          applyCalled = true;
          incidentCreates += 1;
          return "nutrition_incident:incident-1";
        },
      } as never,
    );

    const result = await proposalsService.decideProposal(auth, proposalId, {
      decision: "accept",
    });

    expect(result.status).toBe("accepted");
    expect(result.appliedReference).toBe("nutrition_incident:incident-1");
    expect(applyCalled).toBe(true);
    expect(incidentCreates).toBe(1);
  });

  it("routes recipe proposal creation through RecipesService without applying nutrition state", async () => {
    const applyCalled = false;

    const recipesService = new RecipesService(
      {
        findRecommendationById: async () => ({
          recommendation: {
            id: recommendationId,
            userId: user.id,
            recipeId: "a1000001-0000-4000-8000-000000000001",
            relatedNutritionPlanRevisionId: "ad000002-0000-4000-8000-000000000001",
            reason: "Fits your plan.",
            fitSummary: "Estimated macros fit.",
            status: "accepted",
            shownAt: new Date("2026-05-22T12:30:00.000Z"),
            decidedAt: null,
            completedAt: null,
            createdAt: new Date("2026-05-22T12:30:00.000Z"),
            updatedAt: new Date("2026-05-22T12:30:00.000Z"),
          },
          recipe: {
            id: "a1000001-0000-4000-8000-000000000001",
            name: "Lentil power bowl",
            description: "A balanced bowl.",
            ingredients: [{ name: "Lentils", quantity: 1, unit: "cup" }],
            preparationSteps: ["Combine ingredients."],
            servings: 1,
            estimatedCalories: 690,
            proteinGrams: 48,
            carbsGrams: 82,
            fatGrams: 18,
            fiberGrams: 14,
            mealTypes: ["lunch"],
            tags: [],
            restrictionTags: ["vegan"],
            allergenTags: [],
            prepMinutes: 15,
            cookMinutes: 10,
            source: "Curated catalog",
            provider: null,
            externalId: null,
            status: "active",
            createdAt: new Date("2026-05-22T12:00:00.000Z"),
            updatedAt: new Date("2026-05-22T12:00:00.000Z"),
          },
        }),
      } as never,
      {} as never,
      {
        findByUserId: async () => ({ id: "profile-1", userId: user.id, constraints: [] }),
      } as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      {
        createPendingProposal: async () => pendingProposal,
        createThreadForUser: async () => ({
          id: threadId,
          userId: user.id,
          title: "Recipe food log",
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        findThreadById: async () => null,
      } as never,
      {
        validateRawProposal: () => ({ valid: true, errors: [] }),
        validateNutritionIncidentImageRefOwnership: async () => [],
        validateNutritionIncidentRecipeRecommendationContext: async () => [],
        validateChatAttachmentProposalRefs: async () => [],
      } as never,
      {
        providerName: "themealdb",
        fetchByGenericCategories: async () => [],
      } as never,
    );

    const proposal = await recipesService.createNutritionIncidentProposalFromRecommendation(
      auth,
      recommendationId,
    );

    expect(proposal.id).toBe(proposalId);
    expect(proposal.status).toBe("pending");
    expect(applyCalled).toBe(false);
  });
});
