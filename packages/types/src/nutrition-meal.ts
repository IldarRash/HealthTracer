/**
 * nutrition-meal.ts — Nutrition meal slot and plan schemas.
 *
 * Extracted from index.ts so that ai-proposal.ts can import nutritionPlanPayloadSchema
 * without going through the barrel index.ts (which creates a circular dependency
 * via the chat-turn-stream.ts re-export chain).
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Nutrition meal slot schemas
// ---------------------------------------------------------------------------

/**
 * Ingredient entry for a meal slot.
 * Mirrors recipeIngredientSchema — kept separate to avoid forward-reference issues.
 * The shape is intentionally identical.
 */
export const nutritionMealIngredientSchema = z.object({
  name: z.string().min(1).max(160),
  quantity: z.number().positive().max(10000).nullable().optional(),
  unit: z.string().min(1).max(40).nullable().optional(),
  notes: z.string().min(1).max(240).nullable().optional(),
});

export type NutritionMealIngredient = z.infer<typeof nutritionMealIngredientSchema>;

export const nutritionMealSlotSchema = z.object({
  label: z.string().min(1).max(80),
  timingHint: z.string().min(1).max(120).nullable().default(null),
  // --- C1: per-meal kcal + macros + time + dish (all optional — old plans lack these) ---
  /** Estimated kcal for this meal slot. */
  kcal: z.number().int().nonnegative().max(5000).optional(),
  /** Protein estimate for this meal slot in grams. */
  proteinGrams: z.number().int().nonnegative().max(500).optional(),
  /** Carbohydrate estimate for this meal slot in grams. */
  carbsGrams: z.number().int().nonnegative().max(1000).optional(),
  /** Fat estimate for this meal slot in grams. */
  fatGrams: z.number().int().nonnegative().max(500).optional(),
  /** Suggested meal time, e.g. "08:00". */
  mealTime: z.string().min(1).max(20).optional(),
  /** Suggested dish or meal description for this slot. */
  dish: z.string().min(1).max(240).optional(),
  /** Ingredients for this meal slot (drives C3 grocery list). */
  ingredients: z.array(nutritionMealIngredientSchema).max(30).optional(),
});

export type NutritionMealSlot = z.infer<typeof nutritionMealSlotSchema>;

/**
 * A single day in the 7-day weekly plan matrix (C2).
 * All meal slots are optional — an absent slot means "as usual" for that slot.
 */
export const nutritionWeekDaySchema = z.object({
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  weekday: z.number().int().min(1).max(7),
  breakfast: z.string().min(1).max(240).optional(),
  lunch: z.string().min(1).max(240).optional(),
  snack: z.string().min(1).max(240).optional(),
  dinner: z.string().min(1).max(240).optional(),
  /** Total kcal target for this day (optional override). */
  kcal: z.number().int().positive().max(10000).optional(),
});

export type NutritionWeekDay = z.infer<typeof nutritionWeekDaySchema>;

// ---------------------------------------------------------------------------
// Nutrition plan payload schema
// ---------------------------------------------------------------------------

export const nutritionPlanPayloadSchema = z.object({
  title: z.string().min(1).max(160),
  summary: z.string().min(1).max(1000),
  caloriesPerDay: z.number().int().positive().max(10000).nullable(),
  proteinGrams: z.number().int().nonnegative().max(1000).nullable(),
  carbsGrams: z.number().int().nonnegative().max(1500).nullable(),
  fatGrams: z.number().int().nonnegative().max(1000).nullable(),
  hydrationLiters: z.number().positive().max(20).nullable(),
  mealStructure: z.array(nutritionMealSlotSchema).max(8).default([]),
  preferences: z.array(z.string().min(1).max(160)).max(20).default([]),
  restrictions: z.array(z.string().min(1).max(160)).max(20).default([]),
  allergies: z.array(z.string().min(1).max(160)).max(20).default([]),
  notes: z.array(z.string().min(1).max(240)).max(20).default([]),
  // --- C2: optional 7-day weekly matrix (absent = no weekly plan) ---
  weeklyPlan: z.array(nutritionWeekDaySchema).min(1).max(7).optional(),
});

export type NutritionPlanPayload = z.infer<typeof nutritionPlanPayloadSchema>;
