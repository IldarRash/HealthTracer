import { z } from "zod";
import {
  CHAT_FOOD_PHOTO_MIME_TYPES,
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

import {
  chatAttachmentCategorySchema,
  classifiedChatAttachmentCategorySchema,
} from "./chat-attachments.js";

export type ClassifiedChatAttachmentCategory = z.infer<
  typeof classifiedChatAttachmentCategorySchema
>;

export const chatAttachmentClassificationMethodSchema = z.enum([
  "user_selected",
  "dev_heuristic",
  "vision",
  "text_excerpt",
  "metadata_only",
]);

export type ChatAttachmentClassificationMethod = z.infer<
  typeof chatAttachmentClassificationMethodSchema
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
    category: chatAttachmentCategorySchema,
    confidence: recognitionConfidenceBandSchema,
    rationale: z.string().min(1).max(500),
    suggestedAction: chatAttachmentClassificationSuggestedActionSchema,
    mealContextLabel: z.string().min(1).max(120).nullable().optional(),
    classificationProviderId: z.string().min(1).max(80).optional(),
    classificationMethod: chatAttachmentClassificationMethodSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const requiresCategory =
      value.suggestedAction === "run_category_recognition" ||
      value.suggestedAction === "request_medical_consent";

    if (requiresCategory && value.category === "unclassified") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Routed attachment classifications must specify a concrete category.",
        path: ["category"],
      });
    }

    if (
      (value.suggestedAction === "manual_fallback" ||
        value.suggestedAction === "unsupported") &&
      value.category !== "unclassified"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Manual fallback classifications must remain unclassified.",
        path: ["category"],
      });
    }
  });

export const llmAttachmentClassifierOutputSchema = z
  .object({
    category: classifiedChatAttachmentCategorySchema,
    confidence: recognitionConfidenceBandSchema,
    rationale: z.string().min(1).max(500),
    suggestedAction: chatAttachmentClassificationSuggestedActionSchema,
    mealContextLabel: z.string().min(1).max(120).nullable().optional(),
  })
  .strict();

export type LlmAttachmentClassifierOutput = z.infer<typeof llmAttachmentClassifierOutputSchema>;

export function mapLlmAttachmentClassifierOutput(
  output: LlmAttachmentClassifierOutput,
): ChatAttachmentClassificationResult {
  if (
    output.suggestedAction === "manual_fallback" ||
    output.suggestedAction === "unsupported"
  ) {
    return chatAttachmentClassificationResultSchema.parse({
      category: "unclassified",
      confidence: output.confidence,
      rationale: output.rationale,
      suggestedAction: output.suggestedAction,
      mealContextLabel: null,
    });
  }

  return chatAttachmentClassificationResultSchema.parse(output);
}

export function buildUserSelectedAttachmentClassification(input: {
  category: ClassifiedChatAttachmentCategory;
  message: string;
  hasMedicalConsent: boolean;
}): ChatAttachmentClassificationResult {
  const mealContextLabel =
    input.category === "food_photo" ? inferMealContextFromMessage(input.message) : null;

  if (input.category === "medical_document" && !input.hasMedicalConsent) {
    return chatAttachmentClassificationResultSchema.parse({
      category: "medical_document",
      confidence: "high",
      rationale: "User selected a medical document attachment; explicit consent is required.",
      suggestedAction: "request_medical_consent",
      mealContextLabel: null,
    });
  }

  return chatAttachmentClassificationResultSchema.parse({
    category: input.category,
    confidence: "high",
    rationale: "User selected attachment category before send.",
    suggestedAction:
      input.category === "medical_document"
        ? "run_category_recognition"
        : "run_category_recognition",
    mealContextLabel,
  });
}

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
  /\b(workout|training|exercise|exercises|session|activity|activities|gym|lift|lifting|cardio|volleyball|sport|sports|fitness|athletic|running|yoga|crossfit|drill|practice|match|game|court|field|тренировк|активност|упражнен|заполни\s+активност|волейбол|спорт|фитнес)\b/i;

const WORKOUT_FILENAME_PATTERNS: readonly RegExp[] = [
  /\b(workout|training|plan|session|gym|exercise|sport|sports|fitness|volleyball|volley|cardio|crossfit|yoga|athletic|drill|practice|match|run|running)\b/i,
  /тренировк/i,
];

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

const TODAY_WORKOUT_CONTEXT_PATTERN =
  /\b(?:today|for\s+today|this\s+morning|tonight)\b|(?:на\s+)?сегодня/i;

const LOG_TODAY_WORKOUT_ACTION_PATTERN =
  /\b(?:log|add|record|schedule|write|track|save)\b|(?:запиш\w*|добав\w*|внес\w*|залогиру\w*)/i;

const TODAY_WORKOUT_NOUN_PATTERN =
  /\b(?:workout|training|session|activity|exercise)s?\b|(?:тренировк\w*|активност\w*|упражнен\w*)/i;

const TODAY_WORKOUT_SPORT_PATTERN = /(?:волейбол|volleyball)/i;

export function messageRequestsTodayWorkoutLog(message: string): boolean {
  const trimmed = message.trim();

  if (!trimmed) {
    return false;
  }

  if (!TODAY_WORKOUT_CONTEXT_PATTERN.test(trimmed)) {
    return false;
  }

  if (
    LOG_TODAY_WORKOUT_ACTION_PATTERN.test(trimmed) &&
    TODAY_WORKOUT_NOUN_PATTERN.test(trimmed)
  ) {
    return true;
  }

  if (TODAY_WORKOUT_NOUN_PATTERN.test(trimmed)) {
    return true;
  }

  return TODAY_WORKOUT_SPORT_PATTERN.test(trimmed);
}

export function inferWorkoutTodayChecklistLabel(
  message: string,
  sessionLabel: string | null,
): string {
  const trimmed = message.trim();

  if (TODAY_WORKOUT_SPORT_PATTERN.test(trimmed)) {
    return /волейбол/i.test(trimmed) ? "Волейбол" : "Volleyball training";
  }

  const volleyballInSession = sessionLabel?.match(/volleyball|волейбол/i);
  if (volleyballInSession) {
    return sessionLabel ?? "Volleyball training";
  }

  if (sessionLabel && sessionLabel !== "Recognized training session") {
    return sessionLabel;
  }

  const trainingMatch = trimmed.match(
    /(?:тренировк\w*|training|workout|session)\s+(?:по\s+)?([a-zA-Zа-яА-ЯёЁ0-9][a-zA-Zа-яА-ЯёЁ0-9\s-]{1,40})/i,
  );
  if (trainingMatch?.[1]) {
    const label = trainingMatch[1].trim().replace(/\s+(?:на\s+)?сегодня.*$/iu, "").trim();
    if (label.length > 0 && label.length <= 80) {
      return label.charAt(0).toUpperCase() + label.slice(1);
    }
  }

  return "Today's workout";
}

export function hasWorkoutAttachmentSignals(message: string, filename: string): boolean {
  const normalizedMessage = message.trim().toLowerCase();
  const normalizedFilename = filename.trim().toLowerCase();

  if (!normalizedMessage && !normalizedFilename) {
    return false;
  }

  return (
    WORKOUT_MESSAGE_SIGNALS.test(normalizedMessage) ||
    WORKOUT_FILENAME_PATTERNS.some((pattern) => pattern.test(normalizedFilename))
  );
}

export function hasFoodAttachmentSignals(
  message: string,
  mealContextLabel: string | null,
): boolean {
  return FOOD_MESSAGE_SIGNALS.test(message.trim().toLowerCase()) || mealContextLabel != null;
}

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

export const MAX_CHAT_ATTACHMENT_TEXT_CLASSIFICATION_CHARS = 8_000;

export function extractTextAttachmentClassificationExcerpt(
  content: Uint8Array,
  mimeType: string,
): string | null {
  if (mimeType !== "text/plain") {
    return null;
  }

  const text = new TextDecoder("utf-8").decode(content);

  return text.slice(0, MAX_CHAT_ATTACHMENT_TEXT_CLASSIFICATION_CHARS);
}

export function isPdfAttachmentMimeType(mimeType: string): boolean {
  return mimeType === "application/pdf";
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
  const isWorkoutMime = (CHAT_WORKOUT_ATTACHMENT_MIME_TYPES as readonly string[]).includes(
    input.mimeType,
  );

  const medicalSignaled = hasMedicalDocumentSignals(input.message, input.filename);
  const medicalFilenameHint = MEDICAL_FILENAME_PATTERNS.some((pattern) =>
    pattern.test(normalizedFilename),
  );
  const workoutSignaled = hasWorkoutAttachmentSignals(input.message, input.filename);
  const foodSignaled = hasFoodAttachmentSignals(input.message, mealContextLabel);
  const workoutFilenameHint = WORKOUT_FILENAME_PATTERNS.some((pattern) =>
    pattern.test(normalizedFilename),
  );

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
      suggestedAction: "request_medical_consent",
      mealContextLabel: null,
    });
  }

  if (workoutSignaled) {
    return chatAttachmentClassificationResultSchema.parse({
      category: "workout_attachment",
      confidence:
        WORKOUT_MESSAGE_SIGNALS.test(normalizedMessage) || workoutFilenameHint ? "high" : "medium",
      rationale: "Message or filename suggests a training or activity attachment.",
      suggestedAction: "run_category_recognition",
      mealContextLabel: null,
    });
  }

  if (foodSignaled) {
    return chatAttachmentClassificationResultSchema.parse({
      category: "food_photo",
      confidence: mealContextLabel || FOOD_MESSAGE_SIGNALS.test(normalizedMessage) ? "high" : "medium",
      rationale: "Message context suggests a food photo for nutrition logging.",
      suggestedAction: "run_category_recognition",
      mealContextLabel,
    });
  }

  if (
    (SUPPORTED_HEALTH_DOCUMENT_MIME_TYPES as readonly string[]).includes(input.mimeType) &&
    !isFoodMime
  ) {
    return chatAttachmentClassificationResultSchema.parse({
      category: "unclassified",
      confidence: "low",
      rationale:
        "Health document file type cannot be classified from MIME alone; message context or vision classification is required.",
      suggestedAction: "manual_fallback",
      mealContextLabel: null,
    });
  }

  if (isWorkoutMime && !isFoodMime && input.mimeType !== "application/pdf") {
    return chatAttachmentClassificationResultSchema.parse({
      category: "workout_attachment",
      confidence: "medium",
      rationale: "Training file type suggests workout attachment recognition.",
      suggestedAction: "run_category_recognition",
      mealContextLabel: null,
    });
  }

  return chatAttachmentClassificationResultSchema.parse({
    category: "unclassified",
    confidence: "low",
    rationale:
      "Could not determine attachment category from message context alone; vision classification is required.",
    suggestedAction: "manual_fallback",
    mealContextLabel: null,
  });
}
