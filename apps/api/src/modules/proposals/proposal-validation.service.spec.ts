import { describe, expect, it } from "vitest";
import { ProposalValidationService } from "./proposal-validation.service.js";

const workoutPlan = {
  title: "Strength base",
  summary: "Reduced volume based on weekly completion patterns.",
  days: [{ day: "Day 1", focus: "Strength", exercises: ["Squat"] }],
};

function createService(
  progressRepository: {
    summaryExistsForUser?: (userId: string, summaryId: string) => Promise<boolean>;
    findTrendsOwnedByUser?: (
      userId: string,
      trendIds: readonly string[],
    ) => Promise<Array<{ id: string; summaryId: string }>>;
  } = {},
) {
  return new ProposalValidationService({
    summaryExistsForUser: async () => true,
    findTrendsOwnedByUser: async () => [],
    ...progressRepository,
  } as never);
}

describe("ProposalValidationService", () => {
  const service = createService();

  it("validates workout proposal payloads by intent", () => {
    const result = service.validateStoredProposal("create_workout_plan", {
      title: "Strength base",
      summary: "Three repeatable training days.",
      days: [{ day: "Day 1", focus: "Strength" }],
    });

    expect(result.valid).toBe(true);
  });

  it("validates adapt_workout_plan payloads with the workout schema", () => {
    const result = service.validateStoredProposal("adapt_workout_plan", {
      title: "Strength base",
      summary: "Reduced volume for recovery.",
      days: [{ day: "Day 1", focus: "Strength", exercises: ["Squat"] }],
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects workout proposals without training days", () => {
    const result = service.validateStoredProposal("create_workout_plan", {
      title: "Strength base",
      summary: "Missing days.",
      days: [],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects malformed goal update payloads", () => {
    const result = service.validateStoredProposal("update_goal", {
      goalId: "not-a-uuid",
      changes: {},
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("validates nutrition and today payloads by intent", () => {
    expect(
      service.validateStoredProposal("create_nutrition_plan", {
        title: "Balanced base",
        summary: "Moderate macros and hydration.",
        caloriesPerDay: 2200,
        proteinGrams: 140,
        carbsGrams: 220,
        fatGrams: 70,
        hydrationLiters: 2.5,
        mealStructure: [{ label: "Breakfast", timingHint: null }],
        preferences: [],
        restrictions: [],
        notes: [],
      }).valid,
    ).toBe(true);

    expect(
      service.validateStoredProposal("create_today_checklist", {
        date: "2026-05-22",
        items: [{ label: "Drink water", kind: "hydration" }],
      }).valid,
    ).toBe(true);
  });

  it("rejects today checklist proposals with invalid dates or empty items", () => {
    expect(
      service.validateStoredProposal("create_today_checklist", {
        date: "05/22/2026",
        items: [{ label: "Drink water", kind: "hydration" }],
      }).valid,
    ).toBe(false);

    expect(
      service.validateStoredProposal("create_today_checklist", {
        date: "2026-05-22",
        items: [],
      }).valid,
    ).toBe(false);
  });

  it("rejects nutrition proposals without meal structure", () => {
    const result = service.validateStoredProposal("adjust_nutrition_plan", {
      title: "Balanced base",
      summary: "Missing meal structure.",
      caloriesPerDay: 2200,
      proteinGrams: 140,
      carbsGrams: 220,
      fatGrams: 70,
      hydrationLiters: 2.5,
      mealStructure: [],
      notes: [],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects nutrition proposals without any daily targets", () => {
    const result = service.validateStoredProposal("create_nutrition_plan", {
      title: "Balanced base",
      summary: "Missing targets.",
      caloriesPerDay: null,
      proteinGrams: null,
      carbsGrams: null,
      fatGrams: null,
      hydrationLiters: null,
      mealStructure: [{ label: "Breakfast", timingHint: null }],
      notes: [],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "nutrition: At least one daily target (calories, macros, or hydration) is required.",
    );
  });

  it("validates recommend_recipes payloads by intent", () => {
    const result = service.validateStoredProposal("recommend_recipes", {
      recommendations: [
        {
          recipeId: "a1000001-0000-4000-8000-000000000001",
          reason: "Fits your breakfast protein target.",
          fitSummary: "Estimated macros align with your active plan.",
        },
      ],
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("allows summarize_progress without domain payload schema", () => {
    const result = service.validateStoredProposal("summarize_progress", {});

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("validates adapt_workout_plan_from_progress payloads with plan and source refs", () => {
    const result = service.validateStoredProposal("adapt_workout_plan_from_progress", {
      plan: {
        title: "Strength base",
        summary: "Reduced volume based on weekly completion patterns.",
        days: [{ day: "Day 1", focus: "Strength", exercises: ["Squat"] }],
      },
      sourceSummaryId: "14a08176-64a7-4a2d-8a44-581807368394",
      sourceTrendObservationIds: ["24b19287-75b8-4a3e-9c10-691908479405"],
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects progress-derived workout proposals without training days", () => {
    const result = service.validateStoredProposal("adapt_workout_plan_from_progress", {
      plan: {
        title: "Strength base",
        summary: "Missing days.",
        days: [],
      },
      sourceSummaryId: "14a08176-64a7-4a2d-8a44-581807368394",
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects progress-derived workout proposals with malformed source refs", () => {
    const result = service.validateStoredProposal("adapt_workout_plan_from_progress", {
      plan: {
        title: "Strength base",
        summary: "Reduced volume based on weekly completion patterns.",
        days: [{ day: "Day 1", focus: "Strength", exercises: ["Squat"] }],
      },
      sourceSummaryId: "not-a-uuid",
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects raw proposals with unsupported intents", () => {
    const result = service.validateRawProposal({
      intent: "diagnose_condition" as never,
      targetDomain: "general",
      title: "Unsafe",
      reason: "Unsafe",
      proposedChanges: {},
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  describe("progress provenance ownership", () => {
    const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
    const summaryId = "14a08176-64a7-4a2d-8a44-581807368394";
    const trendId = "24b19287-75b8-4a3e-9c10-691908479405";

    it("accepts owned progress summary and trend references", async () => {
      const provenanceService = createService({
        summaryExistsForUser: async () => true,
        findTrendsOwnedByUser: async () => [{ id: trendId, summaryId }],
      });

      const errors = await provenanceService.validateProvenanceOwnership(
        userId,
        "adapt_workout_plan_from_progress",
        {
          plan: workoutPlan,
          sourceSummaryId: summaryId,
          sourceTrendObservationIds: [trendId],
        },
      );

      expect(errors).toEqual([]);
    });

    it("rejects foreign or missing progress summary references", async () => {
      const provenanceService = createService({
        summaryExistsForUser: async () => false,
      });

      const errors = await provenanceService.validateProvenanceOwnership(
        userId,
        "adapt_workout_plan_from_progress",
        {
          plan: workoutPlan,
          sourceSummaryId: summaryId,
        },
      );

      expect(errors).toContain(
        "proposedChanges.sourceSummaryId: Weekly progress summary was not found for this user.",
      );
    });

    it("rejects foreign or missing trend observation references", async () => {
      const provenanceService = createService({
        summaryExistsForUser: async () => true,
        findTrendsOwnedByUser: async () => [],
      });

      const errors = await provenanceService.validateProvenanceOwnership(
        userId,
        "adapt_workout_plan_from_progress",
        {
          plan: workoutPlan,
          sourceSummaryId: summaryId,
          sourceTrendObservationIds: [trendId],
        },
      );

      expect(errors).toContain(
        "proposedChanges.sourceTrendObservationIds: One or more cited trend observations were not found for this user.",
      );
    });

    it("rejects trend observations that do not belong to the cited summary", async () => {
      const provenanceService = createService({
        summaryExistsForUser: async () => true,
        findTrendsOwnedByUser: async () => [
          { id: trendId, summaryId: "34c29398-86c9-5b4f-ad21-7a2919585046" },
        ],
      });

      const errors = await provenanceService.validateProvenanceOwnership(
        userId,
        "adapt_workout_plan_from_progress",
        {
          plan: workoutPlan,
          sourceSummaryId: summaryId,
          sourceTrendObservationIds: [trendId],
        },
      );

      expect(errors).toContain(
        "proposedChanges.sourceTrendObservationIds: One or more cited trend observations do not belong to the cited weekly progress summary.",
      );
    });

    it("skips provenance checks for other intents", async () => {
      const provenanceService = createService({
        summaryExistsForUser: async () => false,
      });

      const errors = await provenanceService.validateProvenanceOwnership(
        userId,
        "create_workout_plan",
        workoutPlan,
      );

      expect(errors).toEqual([]);
    });
  });
});
