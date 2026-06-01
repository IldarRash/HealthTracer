import type {
  CaptureWellbeingCheckinProposalPayload,
  LogNutritionIncidentProposalPayload,
  NutritionConfidenceBand,
  NutritionIncidentItem,
  NutritionIncidentMacros,
  NutritionProvenance,
  WellbeingScore,
} from "@health/types";
import {
  captureWellbeingCheckinProposalPayloadSchema,
  getNutritionIncidentDomainErrors,
  logNutritionIncidentProposalPayloadSchema,
} from "@health/types";

export const ENERGY_SCORE_LABELS: Record<WellbeingScore, string> = {
  1: "Very low",
  2: "Low",
  3: "Moderate",
  4: "Good",
  5: "High",
};

export const NUTRITION_CONFIDENCE_LABELS: Record<NutritionConfidenceBand, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

export const NUTRITION_PROVENANCE_LABELS: Record<NutritionProvenance["source"], string> = {
  food_photo_analysis: "Food photo analysis",
  vision_llm_estimate: "Vision estimate",
  text_estimate: "Text estimate",
  user_manual: "Manual entry",
  recipe_recommendation: "Saved recipe estimate",
  dev_stub: "Development estimate",
};

export type WellbeingCheckinProposalFormState = {
  date: string;
  moodScore: WellbeingScore | null;
  stressScore: WellbeingScore | null;
  energyLevel: WellbeingScore | null;
  note: string;
  tags: string[];
};

export type NutritionIncidentProposalFormState = {
  incidentDateTime: string;
  items: NutritionIncidentItem[];
  confidence: NutritionConfidenceBand;
  provenance: NutritionProvenance;
  imageRefs: LogNutritionIncidentProposalPayload["imageRefs"];
  mealContextLabel: string | null;
  lowConfidenceNotice: string | null;
  hasUserEdited: boolean;
};

export function isActionProposalIntent(
  intent: string,
): intent is "capture_wellbeing_checkin" | "log_nutrition_incident" {
  return intent === "capture_wellbeing_checkin" || intent === "log_nutrition_incident";
}

export function parseWellbeingCheckinProposalPayload(
  proposedChanges: unknown,
): CaptureWellbeingCheckinProposalPayload | null {
  const parsed = captureWellbeingCheckinProposalPayloadSchema.safeParse(proposedChanges);
  return parsed.success ? parsed.data : null;
}

export function parseNutritionIncidentProposalPayload(
  proposedChanges: unknown,
): LogNutritionIncidentProposalPayload | null {
  const parsed = logNutritionIncidentProposalPayloadSchema.safeParse(proposedChanges);
  return parsed.success ? parsed.data : null;
}

export function createWellbeingCheckinFormState(
  payload: CaptureWellbeingCheckinProposalPayload,
): WellbeingCheckinProposalFormState {
  return {
    date: payload.date,
    moodScore: payload.moodScore,
    stressScore: payload.stressScore,
    energyLevel: payload.energyLevel ?? null,
    note: payload.note ?? "",
    tags: [...(payload.tags ?? [])],
  };
}

export function createNutritionIncidentFormState(
  payload: LogNutritionIncidentProposalPayload,
  lowConfidenceNotice?: string | null,
): NutritionIncidentProposalFormState {
  return {
    incidentDateTime: payload.incidentDateTime,
    items: payload.items.map((item) => ({ ...item })),
    confidence: payload.confidence,
    provenance: payload.provenance,
    imageRefs: [...payload.imageRefs],
    mealContextLabel: payload.mealContextLabel ?? null,
    lowConfidenceNotice: lowConfidenceNotice ?? null,
    hasUserEdited: payload.userEdits != null,
  };
}

export function sumNutritionItemCalories(items: readonly NutritionIncidentItem[]): number {
  return items.reduce((sum, item) => sum + (item.calories ?? 0), 0);
}

export function sumNutritionItemMacros(items: readonly NutritionIncidentItem[]): NutritionIncidentMacros {
  return items.reduce(
    (totals, item) => ({
      proteinGrams: totals.proteinGrams + (item.proteinGrams ?? 0),
      carbsGrams: totals.carbsGrams + (item.carbsGrams ?? 0),
      fatGrams: totals.fatGrams + (item.fatGrams ?? 0),
    }),
    { proteinGrams: 0, carbsGrams: 0, fatGrams: 0 },
  );
}

export function buildWellbeingCheckinAcceptPayload(
  form: WellbeingCheckinProposalFormState,
): CaptureWellbeingCheckinProposalPayload | null {
  if (form.moodScore == null || form.stressScore == null) {
    return null;
  }

  const trimmedNote = form.note.trim();
  const safetyFlags =
    form.moodScore === 1 ? (["lowest_mood"] as CaptureWellbeingCheckinProposalPayload["safetyFlags"]) : [];

  return captureWellbeingCheckinProposalPayloadSchema.parse({
    date: form.date,
    moodScore: form.moodScore,
    stressScore: form.stressScore,
    ...(form.energyLevel != null ? { energyLevel: form.energyLevel } : {}),
    note: trimmedNote.length > 0 ? trimmedNote : null,
    tags: form.tags,
    safetyFlags,
  });
}

export function buildNutritionIncidentAcceptPayload(
  form: NutritionIncidentProposalFormState,
): LogNutritionIncidentProposalPayload | null {
  const normalizedItems = form.items
    .map((item) => ({
      ...item,
      name: item.name.trim(),
      quantity: item.quantity?.trim() || undefined,
    }))
    .filter((item) => item.name.length > 0);

  if (normalizedItems.length === 0) {
    return null;
  }

  const itemCalories = sumNutritionItemCalories(normalizedItems);
  const estimatedCalories = itemCalories > 0 ? itemCalories : sumNutritionItemCalories(form.items);
  const estimatedMacros = sumNutritionItemMacros(normalizedItems);

  const payload: LogNutritionIncidentProposalPayload = {
    incidentDateTime: form.incidentDateTime,
    items: normalizedItems,
    estimatedCalories: estimatedCalories > 0 ? estimatedCalories : 0,
    estimatedMacros,
    confidence: form.confidence,
    provenance: form.provenance,
    imageRefs: form.imageRefs,
    ...(form.mealContextLabel ? { mealContextLabel: form.mealContextLabel } : {}),
  };

  if (form.confidence === "low" || form.hasUserEdited) {
    payload.userEdits = {
      editedAt: new Date().toISOString(),
      items: normalizedItems,
    };
  }

  const parsed = logNutritionIncidentProposalPayloadSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

export function getWellbeingCheckinAcceptBlockReason(
  form: WellbeingCheckinProposalFormState,
): string | null {
  if (form.moodScore == null || form.stressScore == null) {
    return "Select mood and stress before applying this check-in.";
  }

  if (form.note.trim().length > 280) {
    return "Shorten the optional note to 280 characters or fewer.";
  }

  return null;
}

export function getNutritionIncidentAcceptBlockReason(
  form: NutritionIncidentProposalFormState,
): string | null {
  if (form.items.length === 0) {
    return "Add at least one food item before applying.";
  }

  if (form.items.some((item) => item.name.trim().length === 0)) {
    return "Each item needs a name before applying.";
  }

  if (form.confidence === "low" && !form.hasUserEdited) {
    return "Review and edit this low-confidence estimate before applying.";
  }

  const payload = buildNutritionIncidentAcceptPayload(form);
  if (!payload) {
    return "Nutrition incident details are incomplete.";
  }

  const domainErrors = getNutritionIncidentDomainErrors(payload);
  if (domainErrors.length > 0) {
    return "Review and adjust item calories or quantities before applying.";
  }

  return null;
}

export function nutritionConfidenceNotice(
  confidence: NutritionConfidenceBand,
  lowConfidenceNotice: string | null,
): string | null {
  if (lowConfidenceNotice) {
    return lowConfidenceNotice;
  }

  if (confidence === "low") {
    return "This estimate is low confidence. Review items and quantities before confirming.";
  }

  return null;
}

export function formatNutritionMacroSummary(macros: NutritionIncidentMacros): string {
  return `${macros.proteinGrams}g protein · ${macros.carbsGrams}g carbs · ${macros.fatGrams}g fat`;
}
