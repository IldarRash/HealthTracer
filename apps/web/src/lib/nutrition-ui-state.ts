import type {
  AiProposal,
  NutritionAdherenceRecord,
  NutritionAdherenceState,
  NutritionMealCompletion,
  NutritionPlanPayload,
  NutritionTargetCompletion,
} from "@health/types";
import { nutritionPlanPayloadSchema } from "@health/types";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function formatLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isValidIsoDate(value: string): boolean {
  return ISO_DATE_PATTERN.test(value);
}

export function hasActiveNutritionPlan(response: {
  plan: { id: string } | null;
  activeRevision: { id: string } | null;
}): boolean {
  return response.plan !== null && response.activeRevision !== null;
}

export function buildMealCompletionState(
  mealStructure: ReadonlyArray<{ label: string }>,
  existing: ReadonlyArray<NutritionMealCompletion> = [],
): NutritionMealCompletion[] {
  const byLabel = new Map(existing.map((meal) => [meal.label, meal.completed]));

  return mealStructure.map((meal) => ({
    label: meal.label,
    completed: byLabel.get(meal.label) ?? false,
  }));
}

export function toggleMealCompletion(
  meals: readonly NutritionMealCompletion[],
  label: string,
): NutritionMealCompletion[] {
  return meals.map((meal) =>
    meal.label === label ? { ...meal, completed: !meal.completed } : meal,
  );
}

export function cycleTargetCompletion(
  current: boolean | null,
): boolean | null {
  if (current === null) {
    return true;
  }

  if (current === true) {
    return false;
  }

  return null;
}

export function toggleTargetCompletion(
  targetCompletion: NutritionTargetCompletion,
  key: keyof NutritionTargetCompletion,
): NutritionTargetCompletion {
  return {
    ...targetCompletion,
    [key]: cycleTargetCompletion(targetCompletion[key]),
  };
}

export function buildAdherenceState(input: {
  date: string;
  payload: NutritionPlanPayload;
  record: NutritionAdherenceRecord | null;
}): NutritionAdherenceState {
  const record = input.record;

  return {
    date: input.date,
    hydrationLitersConsumed: record?.hydrationLitersConsumed ?? null,
    mealCompletion: buildMealCompletionState(
      input.payload.mealStructure,
      record?.mealCompletion ?? [],
    ),
    targetCompletion: record?.targetCompletion ?? {
      caloriesOnTarget: null,
      proteinOnTarget: null,
      carbsOnTarget: null,
      fatOnTarget: null,
    },
    notes: record?.notes ?? [],
  };
}

export function formatTargetCompletionLabel(value: boolean | null): string {
  if (value === true) {
    return "On target";
  }

  if (value === false) {
    return "Off target";
  }

  return "Not logged";
}

export function formatHydrationProgress(
  consumed: number | null,
  target: number | null,
): string {
  if (target == null) {
    return consumed == null ? "No hydration target" : `${consumed} L logged`;
  }

  const consumedLabel = consumed == null ? "0" : String(consumed);
  return `${consumedLabel} / ${target} L`;
}

export function parseHydrationInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

export function summarizeNutritionTargets(payload: NutritionPlanPayload): string[] {
  const lines: string[] = [];

  if (payload.caloriesPerDay != null) {
    lines.push(`${payload.caloriesPerDay} kcal/day`);
  }

  if (payload.proteinGrams != null) {
    lines.push(`${payload.proteinGrams} g protein`);
  }

  if (payload.carbsGrams != null) {
    lines.push(`${payload.carbsGrams} g carbs`);
  }

  if (payload.fatGrams != null) {
    lines.push(`${payload.fatGrams} g fat`);
  }

  if (payload.hydrationLiters != null) {
    lines.push(`${payload.hydrationLiters} L hydration`);
  }

  return lines;
}

export function summarizeNutritionProposalChanges(proposal: AiProposal): string[] {
  if (proposal.targetDomain !== "nutrition") {
    return [];
  }

  const parsed = nutritionPlanPayloadSchema.safeParse(proposal.proposedChanges);
  if (!parsed.success) {
    return [];
  }

  const payload = parsed.data;
  const lines = summarizeNutritionTargets(payload);

  if (payload.mealStructure.length > 0) {
    lines.push(
      `Meals: ${payload.mealStructure.map((meal) => meal.label).join(", ")}`,
    );
  }

  if (payload.preferences.length > 0) {
    lines.push(`Preferences: ${payload.preferences.join(", ")}`);
  }

  if (payload.restrictions.length > 0) {
    lines.push(`Restrictions: ${payload.restrictions.join(", ")}`);
  }

  if (payload.allergies.length > 0) {
    lines.push(`Allergies to note: ${payload.allergies.join(", ")}`);
  }

  return lines;
}

export function targetCompletionKeysForPayload(
  payload: NutritionPlanPayload,
): Array<keyof NutritionTargetCompletion> {
  const keys: Array<keyof NutritionTargetCompletion> = [];

  if (payload.caloriesPerDay != null) {
    keys.push("caloriesOnTarget");
  }

  if (payload.proteinGrams != null) {
    keys.push("proteinOnTarget");
  }

  if (payload.carbsGrams != null) {
    keys.push("carbsOnTarget");
  }

  if (payload.fatGrams != null) {
    keys.push("fatOnTarget");
  }

  return keys;
}

export function targetCompletionLabel(
  key: keyof NutritionTargetCompletion,
): string {
  switch (key) {
    case "caloriesOnTarget":
      return "Calories";
    case "proteinOnTarget":
      return "Protein";
    case "carbsOnTarget":
      return "Carbs";
    case "fatOnTarget":
      return "Fat";
  }
}

export type NutritionPlanAdherenceFact = {
  term: string;
  description: string;
};

export function buildNutritionPlanAdherenceFacts(input: {
  adherenceState: NutritionAdherenceState;
  payload: NutritionPlanPayload;
}): NutritionPlanAdherenceFact[] {
  const facts: NutritionPlanAdherenceFact[] = [];
  const { mealCompletion, hydrationLitersConsumed, targetCompletion, notes } =
    input.adherenceState;
  const completedMeals = mealCompletion.filter((meal) => meal.completed).length;
  const totalMeals = mealCompletion.length;

  if (totalMeals > 0) {
    facts.push({
      term: "Meals followed",
      description: `${completedMeals} of ${totalMeals} logged today`,
    });
  }

  if (input.payload.hydrationLiters != null) {
    facts.push({
      term: "Hydration",
      description: formatHydrationProgress(
        hydrationLitersConsumed,
        input.payload.hydrationLiters,
      ),
    });
  }

  for (const key of targetCompletionKeysForPayload(input.payload)) {
    facts.push({
      term: targetCompletionLabel(key),
      description: formatTargetCompletionLabel(targetCompletion[key]),
    });
  }

  if (notes.length > 0) {
    facts.push({
      term: "Notes",
      description: notes.join(" · "),
    });
  }

  return facts;
}
