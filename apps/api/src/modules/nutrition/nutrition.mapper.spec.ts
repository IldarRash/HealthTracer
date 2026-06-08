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

  it("passes weeklyPlan through toNutritionPlanRevision unchanged (C2 round-trip)", () => {
    const weeklyPlan = [
      { weekday: 1, breakfast: "Овсянка + яйца", lunch: "Индейка, гречка", snack: "Творог, ягоды", dinner: "Треска, овощи", kcal: 2040 },
      { weekday: 2, breakfast: "Яичница, тост",  lunch: "Куриный суп",     snack: "Яблоко",        dinner: "Говядина, рис",   kcal: 2100 },
      { weekday: 3, breakfast: "Гречка, яйца",   lunch: "Лосось, овощи",   snack: "Кефир",         dinner: "Куриная грудка",  kcal: 2050 },
      { weekday: 4, breakfast: "Омлет, хлеб",    lunch: "Тефтели",         snack: "Творог",        dinner: "Минтай, брокколи",kcal: 2200 },
      { weekday: 5, breakfast: "Овсянка, банан",  lunch: "Индейка, булгур", snack: "Орех-микс",     dinner: "Куриное филе",    kcal: 2080 },
      { weekday: 6, breakfast: "Блины, ягоды",    lunch: "Говядина, гречка",snack: "Батончик",      dinner: "Лосось, рис",     kcal: 2400 },
      { weekday: 7, breakfast: "Яичница, томаты", lunch: "Куриный бульон",  snack: "Кефир, фрукты", dinner: "Запечённые овощи",kcal: 1950 },
    ];

    const revision = toNutritionPlanRevision({
      id: "880099c6-3b5f-4383-8246-97b72bf61819",
      nutritionPlanId: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
      revisionNumber: 8,
      reason: "Plan with weekly matrix",
      source: "ai_proposal",
      payload: {
        title: "Weekly plan",
        summary: "7-day matrix plan.",
        caloriesPerDay: 2200,
        proteinGrams: 140,
        carbsGrams: 220,
        fatGrams: 70,
        hydrationLiters: 2.5,
        mealStructure: [{ label: "Завтрак", timingHint: "07:30" }],
        preferences: [],
        restrictions: [],
        allergies: [],
        notes: [],
        weeklyPlan,
      },
      createdAt: timestamp,
    });

    expect(revision.payload.weeklyPlan).toHaveLength(7);
    expect(revision.payload.weeklyPlan?.[0]?.weekday).toBe(1);
    expect(revision.payload.weeklyPlan?.[5]?.kcal).toBe(2400);
    expect(revision.payload.weeklyPlan?.[6]?.dinner).toBe("Запечённые овощи");
  });

  it("weeklyPlan is absent (undefined) when not in stored payload (backward compat)", () => {
    const revision = toNutritionPlanRevision({
      id: "880099c6-3b5f-4383-8246-97b72bf61820",
      nutritionPlanId: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
      revisionNumber: 2,
      reason: "Legacy plan",
      source: "ai_proposal",
      payload: {
        title: "Legacy plan",
        summary: "No weekly matrix.",
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

    expect(revision.payload.weeklyPlan).toBeUndefined();
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

  // ── C1: per-meal fields survive round-trip through toNutritionPlanRevision ──

  it("preserves per-meal kcal, macros, mealTime, and dish through toNutritionPlanRevision", () => {
    const revision = toNutritionPlanRevision({
      id: "880099c6-3b5f-4383-8246-97b72bf61818",
      nutritionPlanId: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
      revisionNumber: 2,
      reason: "Per-meal calories added",
      source: "ai_proposal",
      payload: {
        title: "Balanced with per-meal data",
        summary: "Meals have calorie estimates.",
        caloriesPerDay: 2100,
        proteinGrams: 130,
        carbsGrams: 210,
        fatGrams: 65,
        hydrationLiters: 2.5,
        mealStructure: [
          {
            label: "Breakfast",
            timingHint: "Morning",
            mealTime: "07:30",
            dish: "Oatmeal with berries",
            kcal: 480,
            proteinGrams: 32,
            carbsGrams: 58,
            fatGrams: 14,
          },
          {
            label: "Lunch",
            timingHint: null,
            mealTime: "13:00",
            dish: "Chicken + quinoa",
            kcal: 620,
            proteinGrams: 44,
            carbsGrams: 62,
            fatGrams: 20,
          },
        ],
        preferences: [],
        restrictions: [],
        allergies: [],
        notes: [],
      },
      createdAt: timestamp,
    });

    const breakfast = revision.payload.mealStructure[0];
    const lunch = revision.payload.mealStructure[1];

    expect(revision.payload.mealStructure).toHaveLength(2);
    expect(breakfast?.kcal).toBe(480);
    expect(breakfast?.proteinGrams).toBe(32);
    expect(breakfast?.carbsGrams).toBe(58);
    expect(breakfast?.fatGrams).toBe(14);
    expect(breakfast?.mealTime).toBe("07:30");
    expect(breakfast?.dish).toBe("Oatmeal with berries");
    expect(lunch?.kcal).toBe(620);
    expect(lunch?.mealTime).toBe("13:00");
  });

  it("accepts C1 revision payloads that mix per-meal and legacy slots (partial data)", () => {
    const revision = toNutritionPlanRevision({
      id: "990099c6-3b5f-4383-8246-97b72bf61819",
      nutritionPlanId: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
      revisionNumber: 3,
      reason: "Partial per-meal data",
      source: "ai_proposal",
      payload: {
        title: "Partial plan",
        summary: "Some meals have kcal, others do not.",
        caloriesPerDay: 2000,
        proteinGrams: 120,
        carbsGrams: 200,
        fatGrams: 60,
        hydrationLiters: 2.0,
        mealStructure: [
          { label: "Breakfast", timingHint: "Morning", kcal: 450 },
          { label: "Lunch", timingHint: null }, // no per-meal fields
        ],
        preferences: [],
        restrictions: [],
        allergies: [],
        notes: [],
      },
      createdAt: timestamp,
    });

    expect(revision.payload.mealStructure[0]?.kcal).toBe(450);
    expect(revision.payload.mealStructure[1]?.kcal).toBeUndefined();
  });
});
