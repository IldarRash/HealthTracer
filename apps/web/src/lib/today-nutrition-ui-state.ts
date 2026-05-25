import type {
  NutritionAdherenceState,
  NutritionPlanPayload,
  TodayNutritionDetail,
} from "@health/types";
import {
  buildAdherenceState,
  summarizeNutritionTargets,
  targetCompletionKeysForPayload,
} from "./nutrition-ui-state";

export type TodayNutritionCardPhase = "empty" | "partial" | "ready";

export const MAX_TODAY_NUTRITION_NOTES = 10;
export const MAX_TODAY_NUTRITION_NOTE_LENGTH = 240;

export function resolveTodayNutritionCardPhase(
  nutrition: TodayNutritionDetail | null | undefined,
): TodayNutritionCardPhase {
  if (!nutrition?.activeRevision?.payload) {
    return "empty";
  }

  const payload = nutrition.activeRevision.payload;
  const hasExecutionSurface =
    payload.mealStructure.length > 0 ||
    payload.hydrationLiters != null ||
    targetCompletionKeysForPayload(payload).length > 0;

  return hasExecutionSurface ? "ready" : "partial";
}

export function buildTodayNutritionAdherenceView(
  nutrition: TodayNutritionDetail,
): NutritionAdherenceState {
  const payload = nutrition.activeRevision?.payload;

  if (!payload) {
    return {
      date: nutrition.date,
      hydrationLitersConsumed: nutrition.adherence?.hydrationLitersConsumed ?? null,
      mealCompletion: nutrition.adherence?.mealCompletion ?? [],
      targetCompletion: nutrition.adherence?.targetCompletion ?? {
        caloriesOnTarget: null,
        proteinOnTarget: null,
        carbsOnTarget: null,
        fatOnTarget: null,
      },
      notes: nutrition.adherence?.notes ?? [],
    };
  }

  return buildAdherenceState({
    date: nutrition.date,
    payload,
    record: nutrition.adherence,
  });
}

export function formatTodayNutritionPlanSummary(payload: NutritionPlanPayload): string {
  const targets = summarizeNutritionTargets(payload);

  if (targets.length === 0) {
    return payload.summary;
  }

  return `${payload.summary} · ${targets.join(" · ")}`;
}

export function countCompletedMeals(
  meals: ReadonlyArray<{ completed: boolean }>,
): { completed: number; total: number } {
  return {
    completed: meals.filter((meal) => meal.completed).length,
    total: meals.length,
  };
}

export function formatMealCompletionSummary(
  meals: ReadonlyArray<{ completed: boolean }>,
): string {
  const { completed, total } = countCompletedMeals(meals);

  if (total === 0) {
    return "No meals configured";
  }

  return `${completed} of ${total} meals logged`;
}

export function canAppendTodayNutritionNote(
  notes: readonly string[],
  draft: string,
): boolean {
  const trimmed = draft.trim();

  if (!trimmed) {
    return false;
  }

  if (trimmed.length > MAX_TODAY_NUTRITION_NOTE_LENGTH) {
    return false;
  }

  return notes.length < MAX_TODAY_NUTRITION_NOTES;
}

export function hasTodayNutritionAdherenceSaved(
  nutrition: TodayNutritionDetail,
): boolean {
  return nutrition.adherence != null;
}

export function todayNutritionPayload(
  nutrition: TodayNutritionDetail,
): NutritionPlanPayload | null {
  return nutrition.activeRevision?.payload ?? null;
}
