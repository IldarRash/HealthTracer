import { InternalServerErrorException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import {
  mergeAdherenceInput,
  toNutritionAdherenceRecord,
  toNutritionPlan,
  toNutritionPlanRevision,
} from "./nutrition.mapper.js";

describe("nutrition mappers", () => {
  const timestamp = new Date("2026-05-22T12:00:00.000Z");

  it("maps nutrition plan rows to ISO timestamps", () => {
    const plan = toNutritionPlan({
      id: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
      userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
      activeRevisionId: "880099c6-3b5f-4383-8246-97b72bf61818",
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    expect(plan.createdAt).toBe("2026-05-22T12:00:00.000Z");
    expect(plan.status).toBe("active");
  });

  it("parses revision payloads from stored JSON", () => {
    const revision = toNutritionPlanRevision({
      id: "880099c6-3b5f-4383-8246-97b72bf61818",
      nutritionPlanId: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
      revisionNumber: 1,
      reason: "Initial plan",
      source: "ai_proposal",
      payload: {
        title: "Balanced base",
        summary: "Moderate targets for consistent meals.",
        caloriesPerDay: 2200,
        proteinGrams: 140,
        carbsGrams: 220,
        fatGrams: 70,
        hydrationLiters: 2.5,
        mealStructure: [{ label: "Breakfast", timingHint: null }],
        preferences: [],
        restrictions: [],
        notes: [],
      },
      createdAt: timestamp,
    });

    expect(revision.payload.title).toBe("Balanced base");
    expect(revision.payload.mealStructure).toHaveLength(1);
    expect(revision.createdAt).toBe("2026-05-22T12:00:00.000Z");
  });

  it("maps adherence rows with structured completion state", () => {
    const record = toNutritionAdherenceRecord({
      id: "adherence-1",
      userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
      date: "2026-05-22",
      hydrationLitersConsumed: 1.75,
      mealCompletion: [{ label: "Breakfast", completed: true }],
      targetCompletion: { caloriesOnTarget: true },
      notes: ["Felt good"],
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    expect(record.hydrationLitersConsumed).toBe(1.75);
    expect(record.mealCompletion[0]?.completed).toBe(true);
  });

  it("merges partial adherence updates onto existing records", () => {
    const merged = mergeAdherenceInput(
      "2026-05-22",
      {
        hydrationLitersConsumed: 1,
        mealCompletion: [{ label: "Breakfast", completed: false }],
        targetCompletion: { caloriesOnTarget: false },
        notes: ["Initial"],
      } as never,
      {
        hydrationLitersConsumed: 2,
        notes: ["Updated"],
      },
    );

    expect(merged.hydrationLitersConsumed).toBe(2);
    expect(merged.notes).toEqual(["Updated"]);
    expect(merged.mealCompletion[0]?.completed).toBe(false);
  });

  it("merges partial target completion without clearing other flags", () => {
    const merged = mergeAdherenceInput(
      "2026-05-22",
      {
        hydrationLitersConsumed: null,
        mealCompletion: [],
        targetCompletion: {
          caloriesOnTarget: true,
          proteinOnTarget: false,
          carbsOnTarget: null,
          fatOnTarget: null,
        },
        notes: [],
      } as never,
      {
        targetCompletion: { proteinOnTarget: true },
      },
    );

    expect(merged.targetCompletion).toEqual({
      caloriesOnTarget: true,
      proteinOnTarget: true,
      carbsOnTarget: null,
      fatOnTarget: null,
    });
  });

  it("creates default adherence state when no existing record is present", () => {
    const merged = mergeAdherenceInput("2026-05-22", null, {
      hydrationLitersConsumed: 1.25,
    });

    expect(merged.date).toBe("2026-05-22");
    expect(merged.hydrationLitersConsumed).toBe(1.25);
    expect(merged.mealCompletion).toEqual([]);
    expect(merged.notes).toEqual([]);
  });

  it("throws a stable internal error when stored revision payload is invalid", () => {
    expect(() =>
      toNutritionPlanRevision({
        id: "880099c6-3b5f-4383-8246-97b72bf61818",
        nutritionPlanId: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
        revisionNumber: 1,
        reason: "Broken payload",
        source: "ai_proposal",
        payload: { title: "" },
        createdAt: timestamp,
      }),
    ).toThrow(InternalServerErrorException);
  });
});
