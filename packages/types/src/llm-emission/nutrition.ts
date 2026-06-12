/**
 * llm-emission/nutrition.ts — Nutrition-domain LLM emission schemas.
 *
 * Strict-mode compatible BY CONSTRUCTION — see llm-emission/index.ts and
 * llm-emission/workout.ts for the construction rules.
 *
 * log_nutrition_incident intentionally OMITS the server-stamped fields so the
 * LLM cannot fight the stamps (normalizeLogNutritionIncidentChanges stamps
 * them unconditionally from server turn state):
 *  - incidentDateTime — stamped with server "now" (live evidence: the LLM
 *    hallucinated a 2023 date) unless a recent in-window value is present.
 *  - provenance — stamped from turn state (vision_llm_estimate when images
 *    are present, else text_estimate).
 *  - imageRefs — replaced entirely with the turn's trusted attachment ids.
 *  - attachmentRefId / userEdits — server- and user-owned respectively.
 *
 * adjust_nutrition_plan maps to the SAME plan emission schema as
 * create_nutrition_plan: the canonical contract is a union of the plan
 * payload and the from-progress wrapper, but the wrapper arm is produced by
 * the deterministic weekly-review packing path, not by free-chat domain LLMs,
 * so it is intentionally not expressible on the emission wire.
 */

import { z } from "zod";
import { nutritionConfidenceBandSchema } from "../nutrition-incidents.js";

// ---------------------------------------------------------------------------
// log_nutrition_incident
// ---------------------------------------------------------------------------

export const nutritionIncidentItemLlmEmissionSchema = z
  .object({
    name: z.string(),
    quantity: z.string().nullable(),
    calories: z.number().nullable(),
    proteinGrams: z.number().nullable(),
    carbsGrams: z.number().nullable(),
    fatGrams: z.number().nullable(),
  })
  .strict();

export const logNutritionIncidentLlmEmissionSchema = z
  .object({
    items: z.array(nutritionIncidentItemLlmEmissionSchema),
    estimatedCalories: z.number(),
    estimatedMacros: z
      .object({
        proteinGrams: z.number(),
        carbsGrams: z.number(),
        fatGrams: z.number(),
      })
      .strict(),
    confidence: nutritionConfidenceBandSchema,
    mealContextLabel: z.string().nullable(),
  })
  .strict();

// ---------------------------------------------------------------------------
// create_nutrition_plan / adjust_nutrition_plan
// ---------------------------------------------------------------------------

export const nutritionMealIngredientLlmEmissionSchema = z
  .object({
    name: z.string(),
    quantity: z.number().nullable(),
    unit: z.string().nullable(),
    notes: z.string().nullable(),
  })
  .strict();

export const nutritionMealSlotLlmEmissionSchema = z
  .object({
    label: z.string(),
    timingHint: z.string().nullable(),
    kcal: z.number().nullable(),
    proteinGrams: z.number().nullable(),
    carbsGrams: z.number().nullable(),
    fatGrams: z.number().nullable(),
    mealTime: z.string().nullable(),
    dish: z.string().nullable(),
    ingredients: z.array(nutritionMealIngredientLlmEmissionSchema).nullable(),
  })
  .strict();

export const nutritionWeekDayLlmEmissionSchema = z
  .object({
    /** ISO weekday: 1 = Monday … 7 = Sunday (canonical schema enforces the range). */
    weekday: z.number(),
    breakfast: z.string().nullable(),
    lunch: z.string().nullable(),
    snack: z.string().nullable(),
    dinner: z.string().nullable(),
    kcal: z.number().nullable(),
  })
  .strict();

export const nutritionPlanLlmEmissionSchema = z
  .object({
    title: z.string(),
    summary: z.string(),
    caloriesPerDay: z.number().nullable(),
    proteinGrams: z.number().nullable(),
    carbsGrams: z.number().nullable(),
    fatGrams: z.number().nullable(),
    hydrationLiters: z.number().nullable(),
    mealStructure: z.array(nutritionMealSlotLlmEmissionSchema),
    preferences: z.array(z.string()),
    restrictions: z.array(z.string()),
    allergies: z.array(z.string()),
    notes: z.array(z.string()),
    weeklyPlan: z.array(nutritionWeekDayLlmEmissionSchema).nullable(),
  })
  .strict();

// ---------------------------------------------------------------------------
// recommend_recipes — recipeIds come from searchRecipeCatalog tool results.
// Canonical schema enforces UUID format and min(1) recommendations downstream.
// ---------------------------------------------------------------------------

export const recommendRecipesLlmEmissionSchema = z
  .object({
    relatedNutritionPlanRevisionId: z.string().nullable(),
    recommendations: z.array(
      z
        .object({
          recipeId: z.string(),
          reason: z.string(),
          fitSummary: z.string(),
        })
        .strict(),
    ),
  })
  .strict();
