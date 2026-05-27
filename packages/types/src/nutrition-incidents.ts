import { z } from "zod";
import { isoDateSchema, isoDateTimeSchema } from "./dates.js";

export const nutritionConfidenceBandSchema = z.enum(["high", "medium", "low"]);

export type NutritionConfidenceBand = z.infer<typeof nutritionConfidenceBandSchema>;

export const nutritionProvenanceLabelSchema = z.enum([
  "food_photo_analysis",
  "text_estimate",
  "user_manual",
  "recipe_recommendation",
  "dev_stub",
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
    calories: z.number().int().nonnegative().max(5000).optional(),
    proteinGrams: z.number().int().nonnegative().max(500).optional(),
    carbsGrams: z.number().int().nonnegative().max(500).optional(),
    fatGrams: z.number().int().nonnegative().max(500).optional(),
  })
  .strict();

export type NutritionIncidentItem = z.infer<typeof nutritionIncidentItemSchema>;

export const nutritionIncidentMacrosSchema = z
  .object({
    proteinGrams: z.number().int().nonnegative().max(2000),
    carbsGrams: z.number().int().nonnegative().max(2000),
    fatGrams: z.number().int().nonnegative().max(2000),
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
    estimatedCalories: z.number().int().nonnegative().max(20000),
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
]);

export type OwnedFoodPhotoAnalysisRef = {
  analysisId: string;
  imageRefId: string;
};

export function getNutritionIncidentImageRefOwnershipErrors(
  payload: LogNutritionIncidentProposalPayload,
  ownedAnalyses: OwnedFoodPhotoAnalysisRef[],
): string[] {
  const errors: string[] = [];

  if (PHOTO_BACKED_PROVENANCE_SOURCES.has(payload.provenance.source)) {
    if (payload.imageRefs.length === 0) {
      errors.push(
        "proposedChanges.imageRefs: Photo-backed nutrition incidents require at least one analyzed image reference.",
      );
    }

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
