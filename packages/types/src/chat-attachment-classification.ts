import { z } from "zod";
import {
  CHAT_FOOD_PHOTO_MIME_TYPES,
  CHAT_MEDICAL_DOCUMENT_MIME_TYPES,
  CHAT_WORKOUT_ATTACHMENT_MIME_TYPES,
  medicalDocumentRecognitionEnvelopeSchema,
  recognitionConfidenceBandSchema,
  workoutAttachmentRecognitionEnvelopeSchema,
  workoutAttachmentSuggestedIntentSchema,
} from "./chat-attachments.js";
import { SUPPORTED_HEALTH_DOCUMENT_MIME_TYPES } from "./documents.js";
import {
  foodPhotoAnalysisResultSchema,
  type LogNutritionIncidentProposalPayload,
} from "./nutrition-incidents.js";

import { classifiedChatAttachmentCategorySchema } from "./chat-attachments.js";

export type ClassifiedChatAttachmentCategory = z.infer<
  typeof classifiedChatAttachmentCategorySchema
>;

export const chatAttachmentClassificationSuggestedActionSchema = z.enum([
  "run_category_recognition",
  "request_medical_consent",
  "manual_fallback",
  "unsupported",
]);

export type ChatAttachmentClassificationSuggestedAction = z.infer<
  typeof chatAttachmentClassificationSuggestedActionSchema
>;

export const chatAttachmentClassificationResultSchema = z
  .object({
    category: classifiedChatAttachmentCategorySchema,
    confidence: recognitionConfidenceBandSchema,
    rationale: z.string().min(1).max(500),
    suggestedAction: chatAttachmentClassificationSuggestedActionSchema,
    mealContextLabel: z.string().min(1).max(120).nullable().optional(),
  })
  .strict();

export type ChatAttachmentClassificationResult = z.infer<
  typeof chatAttachmentClassificationResultSchema
>;

export const foodAttachmentExtractionResultSchema = z
  .object({
    mealContextLabel: z.string().min(1).max(120).nullable(),
    analysis: foodPhotoAnalysisResultSchema,
  })
  .strict();

export type FoodAttachmentExtractionResult = z.infer<typeof foodAttachmentExtractionResultSchema>;

export const workoutAttachmentExtractionResultSchema = z
  .object({
    recognition: workoutAttachmentRecognitionEnvelopeSchema,
    messageDerivedIntent: workoutAttachmentSuggestedIntentSchema.optional(),
  })
  .strict();

export type WorkoutAttachmentExtractionResult = z.infer<
  typeof workoutAttachmentExtractionResultSchema
>;

export const medicalDocumentAttachmentExtractionResultSchema = z
  .object({
    recognition: medicalDocumentRecognitionEnvelopeSchema,
    proposalsSuppressed: z.literal(true),
  })
  .strict();

export type MedicalDocumentAttachmentExtractionResult = z.infer<
  typeof medicalDocumentAttachmentExtractionResultSchema
>;

const MEAL_CONTEXT_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(second|2nd)\s+meal\b/i, label: "Second meal" },
  { pattern: /\bthird\s+meal\b/i, label: "Third meal" },
  { pattern: /\b(first|1st)\s+meal\b/i, label: "First meal" },
  { pattern: /\bbreakfast\b/i, label: "Breakfast" },
  { pattern: /\blunch\b/i, label: "Lunch" },
  { pattern: /\bdinner\b/i, label: "Dinner" },
  { pattern: /\bsnack\b/i, label: "Snack" },
  { pattern: /второй\s+при[её]м\s+пищи/i, label: "Second meal" },
  { pattern: /третий\s+при[её]м\s+пищи/i, label: "Third meal" },
  { pattern: /первый\s+при[её]м\s+пищи/i, label: "First meal" },
  { pattern: /\bзавтрак\b/i, label: "Breakfast" },
  { pattern: /\bобед\b/i, label: "Lunch" },
  { pattern: /\bужин\b/i, label: "Dinner" },
  { pattern: /\bперекус\b/i, label: "Snack" },
];

const FOOD_MESSAGE_SIGNALS =
  /\b(meal|food|ate|eating|lunch|dinner|breakfast|snack|nutrition|calories|при[её]м\s+пищи|еда|обед|ужин|завтрак)\b/i;

const WORKOUT_MESSAGE_SIGNALS =
  /\b(workout|training|exercise|session|activity|gym|lift|cardio|тренировк|активност|упражнен|заполни\s+активност)\b/i;

const MEDICAL_MESSAGE_PATTERNS: readonly RegExp[] = [
  /\b(lab|labs)\s+results?\b/i,
  /\bblood\s+(test|report|results?)\b/i,
  /\b(medical|health)\s+(document|report|record|doc)\b/i,
  /\b(lab|labs|blood|medical|report|results)\b/i,
  /анализы/i,
  /мед\s*документ/i,
  /медицин/i,
  /анализ/i,
  /\bдокумент\b/i,
];

const MEDICAL_FILENAME_PATTERNS: readonly RegExp[] = [
  /\b(lab|labs|blood|report|medical|health)\b/i,
  /анализ/i,
  /мед/i,
];

export function hasMedicalDocumentSignals(message: string, filename: string): boolean {
  const normalizedMessage = message.trim().toLowerCase();
  const normalizedFilename = filename.trim().toLowerCase();

  if (!normalizedMessage && !normalizedFilename) {
    return false;
  }

  return (
    MEDICAL_MESSAGE_PATTERNS.some((pattern) => pattern.test(normalizedMessage)) ||
    MEDICAL_FILENAME_PATTERNS.some((pattern) => pattern.test(normalizedFilename))
  );
}

export function isChatMedicalImageMimeType(mimeType: string): boolean {
  return (CHAT_FOOD_PHOTO_MIME_TYPES as readonly string[]).includes(mimeType);
}

export function inferMealContextFromMessage(message: string): string | null {
  const trimmed = message.trim();

  if (!trimmed) {
    return null;
  }

  for (const { pattern, label } of MEAL_CONTEXT_PATTERNS) {
    if (pattern.test(trimmed)) {
      return label;
    }
  }

  return null;
}

export function isPhotoBackedNutritionProposalPayload(
  payload: LogNutritionIncidentProposalPayload,
): boolean {
  return (
    payload.provenance.source === "food_photo_analysis" ||
    payload.provenance.source === "dev_stub" ||
    payload.imageRefs.length > 0 ||
    payload.attachmentRefId != null
  );
}

export function isTextEstimateNutritionProposalPayload(
  payload: LogNutritionIncidentProposalPayload,
): boolean {
  return payload.provenance.source === "text_estimate" && payload.imageRefs.length === 0;
}

export function classifyAttachmentFromMessageContext(input: {
  message: string;
  filename: string;
  mimeType: string;
}): ChatAttachmentClassificationResult {
  const normalizedMessage = input.message.trim().toLowerCase();
  const normalizedFilename = input.filename.trim().toLowerCase();
  const mealContextLabel = inferMealContextFromMessage(input.message);

  const isFoodMime = (CHAT_FOOD_PHOTO_MIME_TYPES as readonly string[]).includes(input.mimeType);
  const isMedicalMime = (CHAT_MEDICAL_DOCUMENT_MIME_TYPES as readonly string[]).includes(
    input.mimeType,
  );
  const isWorkoutMime = (CHAT_WORKOUT_ATTACHMENT_MIME_TYPES as readonly string[]).includes(
    input.mimeType,
  );

  const medicalSignaled = hasMedicalDocumentSignals(input.message, input.filename);
  const medicalFilenameHint = MEDICAL_FILENAME_PATTERNS.some((pattern) =>
    pattern.test(normalizedFilename),
  );
  const workoutFilenameHint =
    /\b(workout|training|plan|session|gym|тренировк)\b/i.test(normalizedFilename);

  if (medicalSignaled) {
    const isMedicalImage =
      isChatMedicalImageMimeType(input.mimeType) &&
      !(SUPPORTED_HEALTH_DOCUMENT_MIME_TYPES as readonly string[]).includes(input.mimeType);

    return chatAttachmentClassificationResultSchema.parse({
      category: "medical_document",
      confidence: medicalFilenameHint ? "high" : "medium",
      rationale: isMedicalImage
        ? "Message or filename suggests a medical document screenshot; consent is required before review."
        : "Message or filename suggests a health document upload.",
      suggestedAction: isMedicalImage ? "manual_fallback" : "request_medical_consent",
      mealContextLabel: null,
    });
  }

  if (
    isWorkoutMime &&
    (WORKOUT_MESSAGE_SIGNALS.test(normalizedMessage) ||
      workoutFilenameHint ||
      input.mimeType === "text/plain")
  ) {
    return chatAttachmentClassificationResultSchema.parse({
      category: "workout_attachment",
      confidence: WORKOUT_MESSAGE_SIGNALS.test(normalizedMessage) ? "high" : "medium",
      rationale: "Message or file type suggests a training or activity attachment.",
      suggestedAction: "run_category_recognition",
      mealContextLabel: null,
    });
  }

  if (
    isFoodMime ||
    FOOD_MESSAGE_SIGNALS.test(normalizedMessage) ||
    mealContextLabel != null
  ) {
    return chatAttachmentClassificationResultSchema.parse({
      category: "food_photo",
      confidence: mealContextLabel || FOOD_MESSAGE_SIGNALS.test(normalizedMessage) ? "high" : "medium",
      rationale: "Image or message context suggests a food photo for nutrition logging.",
      suggestedAction: "run_category_recognition",
      mealContextLabel,
    });
  }

  if (isMedicalMime) {
    return chatAttachmentClassificationResultSchema.parse({
      category: "medical_document",
      confidence: "medium",
      rationale: "PDF document upload defaults to medical document review flow.",
      suggestedAction: "request_medical_consent",
      mealContextLabel: null,
    });
  }

  if (isWorkoutMime) {
    return chatAttachmentClassificationResultSchema.parse({
      category: "workout_attachment",
      confidence: "medium",
      rationale: "Training file type suggests workout attachment recognition.",
      suggestedAction: "run_category_recognition",
      mealContextLabel: null,
    });
  }

  if (isFoodMime) {
    return chatAttachmentClassificationResultSchema.parse({
      category: "food_photo",
      confidence: "medium",
      rationale: "Image attachment defaults to food photo analysis.",
      suggestedAction: "run_category_recognition",
      mealContextLabel,
    });
  }

  return chatAttachmentClassificationResultSchema.parse({
    category: "food_photo",
    confidence: "low",
    rationale: "Could not infer a specific attachment category; defaulting to food photo review.",
    suggestedAction: "manual_fallback",
    mealContextLabel,
  });
}
