import { z } from "zod";
import { isoDateSchema, isoDateTimeSchema } from "./dates.js";
import { llmInt } from "./llm-coerce.js";

export const nutritionConfidenceBandSchema = z.enum(["high", "medium", "low"]);

export type NutritionConfidenceBand = z.infer<typeof nutritionConfidenceBandSchema>;

export const nutritionProvenanceLabelSchema = z.enum([
  "food_photo_analysis",
  "text_estimate",
  "user_manual",
  "recipe_recommendation",
  "dev_stub",
  /**
   * Produced by the nutrition domain LLM when it analyzes a food photo directly
   * via the multimodal (vision) path. Replaces the legacy food_photo_analysis
   * provenance that was tied to the deleted FoodPhotoAnalysisService.
   */
  "vision_llm_estimate",
]);

export type NutritionProvenanceLabel = z.infer<typeof nutritionProvenanceLabelSchema>;

export const nutritionProvenanceSchema = z
  .object({
    source: nutritionProvenanceLabelSchema,
    providerId: z.string().min(1).max(80).optional(),
    analysisId: z.string().uuid().optional(),
  })
  .strict();

export type NutritionProvenance = z.infer<typeof nutritionProvenanceSchema>;

export const nutritionIncidentItemSchema = z
  .object({
    name: z.string().min(1).max(120),
    quantity: z.string().min(1).max(80).optional(),
    // LLMs emit decimals (e.g. 66.7 g); round to int instead of failing.
    calories: llmInt(z.number().nonnegative().max(5000)).optional(),
    proteinGrams: llmInt(z.number().nonnegative().max(500)).optional(),
    carbsGrams: llmInt(z.number().nonnegative().max(500)).optional(),
    fatGrams: llmInt(z.number().nonnegative().max(500)).optional(),
  })
  .strict();

export type NutritionIncidentItem = z.infer<typeof nutritionIncidentItemSchema>;

export const nutritionIncidentMacrosSchema = z
  .object({
    // LLMs emit decimals (e.g. 66.7 g); round to int instead of failing.
    proteinGrams: llmInt(z.number().nonnegative().max(2000)),
    carbsGrams: llmInt(z.number().nonnegative().max(2000)),
    fatGrams: llmInt(z.number().nonnegative().max(2000)),
  })
  .strict();

export type NutritionIncidentMacros = z.infer<typeof nutritionIncidentMacrosSchema>;

export const nutritionImageRefSchema = z
  .object({
    id: z.string().uuid(),
    storageKey: z.string().min(1).max(500).optional(),
    mimeType: z.string().min(1).max(80).optional(),
  })
  .strict();

export type NutritionImageRef = z.infer<typeof nutritionImageRefSchema>;

export const nutritionIncidentUserEditsSchema = z
  .object({
    editedAt: isoDateTimeSchema,
    items: z.array(nutritionIncidentItemSchema).min(1).max(20),
    note: z.string().min(1).max(280).optional(),
  })
  .strict();

export type NutritionIncidentUserEdits = z.infer<typeof nutritionIncidentUserEditsSchema>;

export const logNutritionIncidentProposalPayloadSchema = z
  .object({
    incidentDateTime: isoDateTimeSchema,
    items: z.array(nutritionIncidentItemSchema).min(1).max(20),
    // LLMs emit decimals; round to int instead of failing.
    estimatedCalories: llmInt(z.number().nonnegative().max(20000)),
    estimatedMacros: nutritionIncidentMacrosSchema,
    confidence: nutritionConfidenceBandSchema,
    provenance: nutritionProvenanceSchema,
    imageRefs: z.array(nutritionImageRefSchema).max(5).default([]),
    attachmentRefId: z.string().uuid().optional(),
    mealContextLabel: z.string().min(1).max(120).optional(),
    userEdits: nutritionIncidentUserEditsSchema.optional(),
  })
  .strict();

export type LogNutritionIncidentProposalPayload = z.infer<
  typeof logNutritionIncidentProposalPayloadSchema
>;

export const foodPhotoAnalysisRequestSchema = z
  .object({
    imageRef: nutritionImageRefSchema,
    instruction: z
      .string()
      .min(1)
      .max(200)
      .default("Estimate meal items and macros from this food photo."),
  })
  .strict();

export type FoodPhotoAnalysisRequest = z.infer<typeof foodPhotoAnalysisRequestSchema>;

export const foodPhotoAnalysisCandidateSchema = z
  .object({
    items: z.array(nutritionIncidentItemSchema).min(1).max(20),
    estimatedCalories: z.number().int().nonnegative().max(20000),
    estimatedMacros: nutritionIncidentMacrosSchema,
    confidence: nutritionConfidenceBandSchema,
    provenance: nutritionProvenanceSchema.extend({
      providerId: z.string().min(1).max(80),
      analysisId: z.string().uuid(),
    }),
  })
  .strict();

export type FoodPhotoAnalysisCandidate = z.infer<typeof foodPhotoAnalysisCandidateSchema>;

export const foodPhotoAnalysisResultSchema = z
  .object({
    candidates: z.array(foodPhotoAnalysisCandidateSchema).min(1).max(5),
    lowConfidenceNotice: z.string().min(1).max(500).nullable(),
  })
  .strict();

export type FoodPhotoAnalysisResult = z.infer<typeof foodPhotoAnalysisResultSchema>;

export const nutritionIncidentRecordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  incidentDateTime: isoDateTimeSchema,
  date: isoDateSchema,
  items: z.array(nutritionIncidentItemSchema).min(1).max(20),
  estimatedCalories: z.number().int().nonnegative().max(20000),
  estimatedMacros: nutritionIncidentMacrosSchema,
  confidence: nutritionConfidenceBandSchema,
  provenance: nutritionProvenanceSchema,
  imageRefs: z.array(nutritionImageRefSchema).max(5),
  userEdits: nutritionIncidentUserEditsSchema.nullable(),
  sourceProposalId: z.string().uuid().nullable(),
  source: z.string().min(1).max(80),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type NutritionIncidentRecord = z.infer<typeof nutritionIncidentRecordSchema>;

const PHOTO_BACKED_PROVENANCE_SOURCES = new Set<NutritionProvenanceLabel>([
  "food_photo_analysis",
  "dev_stub",
  // vision_llm_estimate: produced by the nutrition domain LLM multimodal path.
  // Image-ref ownership validation must fire for proposals with this source.
  "vision_llm_estimate",
]);

export type OwnedFoodPhotoAnalysisRef = {
  analysisId: string;
  imageRefId: string;
};

/**
 * Validate image-ref ownership for a log_nutrition_incident proposal.
 *
 * Two ownership paths:
 *
 * 1. `food_photo_analysis` / `dev_stub` provenance — historical path: the image
 *    ref must match a stored analysis record owned by the user
 *    (`ownedAnalyses`).
 *
 * 2. `vision_llm_estimate` provenance — the nutrition domain LLM analysed the
 *    food photo directly via the multimodal pipeline; no analysis record is
 *    created.  Ownership is established by the chat attachment upload perimeter
 *    instead: each imageRef.id must appear in `ownedChatAttachmentIds`.
 *    The `analysisId` check is intentionally skipped for this provenance
 *    because no analysis record is ever written.
 */
export function getNutritionIncidentImageRefOwnershipErrors(
  payload: LogNutritionIncidentProposalPayload,
  ownedAnalyses: OwnedFoodPhotoAnalysisRef[],
  ownedChatAttachmentIds?: readonly string[],
): string[] {
  const errors: string[] = [];

  if (!PHOTO_BACKED_PROVENANCE_SOURCES.has(payload.provenance.source)) {
    return errors;
  }

  if (payload.imageRefs.length === 0) {
    errors.push(
      "proposedChanges.imageRefs: Photo-backed nutrition incidents require at least one analyzed image reference.",
    );
  }

  // vision_llm_estimate: ownership is against the chat attachment upload perimeter,
  // not stored analysis records.  The analysisId analysis-record check is skipped
  // because the LLM path never writes an analysis row.
  if (payload.provenance.source === "vision_llm_estimate") {
    const attachmentIds = new Set(ownedChatAttachmentIds ?? []);

    for (const [index, ref] of payload.imageRefs.entries()) {
      if (!attachmentIds.has(ref.id)) {
        errors.push(
          `proposedChanges.imageRefs[${index}].id: Image reference was not found as an owned chat attachment for this user.`,
        );
      }
    }

    return errors;
  }

  // food_photo_analysis / dev_stub provenance: validate against stored analysis records.
  if (payload.provenance.analysisId) {
    const matchingAnalysis = ownedAnalyses.find(
      (analysis) => analysis.analysisId === payload.provenance.analysisId,
    );

    if (!matchingAnalysis) {
      errors.push(
        "proposedChanges.provenance.analysisId: Food photo analysis was not found for this user.",
      );
    } else if (
      !payload.imageRefs.some((ref) => ref.id === matchingAnalysis.imageRefId)
    ) {
      errors.push(
        "proposedChanges.provenance.analysisId: Food photo analysis does not match the referenced image.",
      );
    }
  }

  for (const [index, ref] of payload.imageRefs.entries()) {
    const owned = ownedAnalyses.some((analysis) => analysis.imageRefId === ref.id);

    if (!owned) {
      errors.push(
        `proposedChanges.imageRefs[${index}].id: Image reference was not analyzed for this user.`,
      );
    }
  }

  return errors;
}

/**
 * Map a DB row (or any object with estimatedCalories + estimatedMacros Record) to a
 * typed NutritionIncidentSnapshot for weekly aggregation.
 * Keeps the `date` field as-is; macro keys that are absent default to 0.
 */
export function toNutritionIncidentSnapshot(row: {
  date: string;
  estimatedCalories: number;
  estimatedMacros: Record<string, number>;
}): { date: string; estimatedCalories: number; proteinGrams: number; carbsGrams: number; fatGrams: number } {
  return {
    date: row.date,
    estimatedCalories: row.estimatedCalories,
    proteinGrams: row.estimatedMacros["proteinGrams"] ?? 0,
    carbsGrams: row.estimatedMacros["carbsGrams"] ?? 0,
    fatGrams: row.estimatedMacros["fatGrams"] ?? 0,
  };
}

/**
 * Sum calories and macros across a list of incident rows or snapshots.
 * Returns null when `rows` is empty (null = no incidents, not zero-calories),
 * matching the `buildEatenBlock` / daily-detail contract.
 * Returns rounded integers so callers never need to round themselves.
 */
export function sumNutritionIncidentMacros(
  rows: ReadonlyArray<{
    estimatedCalories: number;
    estimatedMacros: Record<string, number>;
  }>,
): { calories: number; proteinGrams: number; carbsGrams: number; fatGrams: number; incidentCount: number } | null {
  if (rows.length === 0) {
    return null;
  }

  let calories = 0;
  let proteinGrams = 0;
  let carbsGrams = 0;
  let fatGrams = 0;

  for (const row of rows) {
    calories += row.estimatedCalories;
    proteinGrams += row.estimatedMacros["proteinGrams"] ?? 0;
    carbsGrams += row.estimatedMacros["carbsGrams"] ?? 0;
    fatGrams += row.estimatedMacros["fatGrams"] ?? 0;
  }

  return {
    calories: Math.round(calories),
    proteinGrams: Math.round(proteinGrams),
    carbsGrams: Math.round(carbsGrams),
    fatGrams: Math.round(fatGrams),
    incidentCount: rows.length,
  };
}

export function getNutritionIncidentDomainErrors(
  payload: LogNutritionIncidentProposalPayload,
): string[] {
  const errors: string[] = [];

  const itemCalories = payload.items.reduce((sum, item) => sum + (item.calories ?? 0), 0);

  if (itemCalories > 0 && Math.abs(itemCalories - payload.estimatedCalories) > 500) {
    errors.push(
      "nutrition_incident: estimatedCalories differs substantially from summed item calories.",
    );
  }

  if (payload.confidence === "low" && !payload.userEdits) {
    errors.push(
      "nutrition_incident: low-confidence estimates require userEdits before acceptance.",
    );
  }

  return errors;
}

export function validateFoodPhotoAnalysisRequestShape(input: unknown): string[] {
  const parsed = foodPhotoAnalysisRequestSchema.safeParse(input);

  if (parsed.success) {
    return [];
  }

  return parsed.error.issues.map(
    (issue) => `${issue.path.join(".") || "request"}: ${issue.message}`,
  );
}
