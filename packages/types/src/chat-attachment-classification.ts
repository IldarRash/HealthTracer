import { z } from "zod";
import { buildDefaultAttachmentBehaviorConfig } from "./attachment-behavior-config.js";
import {
  compileAttachmentClassificationMatcher,
  type CompiledAttachmentClassificationMatcher,
} from "./attachment-classification-matcher.js";
import {
  CHAT_FOOD_PHOTO_MIME_TYPES,
  medicalDocumentRecognitionEnvelopeSchema,
  recognitionConfidenceBandSchema,
  workoutAttachmentRecognitionEnvelopeSchema,
  workoutAttachmentSuggestedIntentSchema,
} from "./chat-attachments.js";
import {
  foodPhotoAnalysisResultSchema,
  type LogNutritionIncidentProposalPayload,
} from "./nutrition-incidents.js";

import {
  chatAttachmentCategorySchema,
  classifiedChatAttachmentCategorySchema,
} from "./chat-attachments.js";

let defaultAttachmentClassificationMatcher: CompiledAttachmentClassificationMatcher | undefined;

function getDefaultAttachmentClassificationMatcher(): CompiledAttachmentClassificationMatcher {
  defaultAttachmentClassificationMatcher ??= compileAttachmentClassificationMatcher(
    buildDefaultAttachmentBehaviorConfig().classification,
  );
  return defaultAttachmentClassificationMatcher;
}

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
  const rationales = getDefaultAttachmentClassificationMatcher().config.rationales;
  const mealContextLabel =
    input.category === "food_photo" ? inferMealContextFromMessage(input.message) : null;

  if (input.category === "medical_document" && !input.hasMedicalConsent) {
    return chatAttachmentClassificationResultSchema.parse({
      category: "medical_document",
      confidence: "high",
      rationale: rationales.userSelectedMedicalConsent,
      suggestedAction: "request_medical_consent",
      mealContextLabel: null,
    });
  }

  return chatAttachmentClassificationResultSchema.parse({
    category: input.category,
    confidence: "high",
    rationale: rationales.userSelectedCategory,
    suggestedAction: "run_category_recognition",
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

export function messageRequestsTodayWorkoutLog(message: string): boolean {
  return getDefaultAttachmentClassificationMatcher().messageRequestsTodayWorkoutLog(message);
}

export function inferWorkoutTodayChecklistLabel(
  message: string,
  sessionLabel: string | null,
): string {
  const trimmed = message.trim();
  const matcher = getDefaultAttachmentClassificationMatcher();

  if (matcher.matchesTodayWorkoutSportMessage(trimmed)) {
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
  return getDefaultAttachmentClassificationMatcher().hasWorkoutAttachmentSignals(
    message,
    filename,
  );
}

export function hasFoodAttachmentSignals(
  message: string,
  mealContextLabel: string | null,
): boolean {
  return getDefaultAttachmentClassificationMatcher().hasFoodAttachmentSignals(
    message,
    mealContextLabel,
  );
}

export function hasMedicalDocumentSignals(message: string, filename: string): boolean {
  return getDefaultAttachmentClassificationMatcher().hasMedicalDocumentSignals(message, filename);
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
  return getDefaultAttachmentClassificationMatcher().inferMealContextFromMessage(message);
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
  return getDefaultAttachmentClassificationMatcher().classifyAttachmentFromMessageContext(input);
}
