import type { AttachmentClassificationConfig } from "./attachment-behavior-config.js";
import {
  CHAT_FOOD_PHOTO_MIME_TYPES,
  CHAT_WORKOUT_ATTACHMENT_MIME_TYPES,
} from "./chat-attachments.js";
import {
  chatAttachmentClassificationResultSchema,
  mapLlmAttachmentClassifierOutput,
  type ChatAttachmentClassificationResult,
} from "./chat-attachment-classification.js";
import { SUPPORTED_HEALTH_DOCUMENT_MIME_TYPES } from "./documents.js";
import {
  compileRegexPatternRule,
  type CompiledRegexPatternRule,
} from "./direct-chat-path-matcher.js";

export type CompiledAttachmentMealContextPattern = {
  readonly label: string;
  readonly pattern: CompiledRegexPatternRule;
};

export type CompiledAttachmentClassificationMatcher = {
  readonly config: AttachmentClassificationConfig;
  inferMealContextFromMessage(message: string): string | null;
  hasWorkoutAttachmentSignals(message: string, filename: string): boolean;
  hasFoodAttachmentSignals(message: string, mealContextLabel: string | null): boolean;
  hasMedicalDocumentSignals(message: string, filename: string): boolean;
  messageRequestsTodayWorkoutLog(message: string): boolean;
  matchesTodayWorkoutSportMessage(message: string): boolean;
  classifyAttachmentFromMessageContext(input: {
    message: string;
    filename: string;
    mimeType: string;
  }): ChatAttachmentClassificationResult;
  classifyDevAttachment(input: {
    message: string;
    filename: string;
    mimeType: string;
  }): ChatAttachmentClassificationResult;
};

function compilePatternList(
  patterns: readonly { source: string; flags?: string }[],
): readonly CompiledRegexPatternRule[] {
  return patterns
    .map((pattern) => compileRegexPatternRule({ source: pattern.source, flags: pattern.flags ?? "i" }))
    .filter((entry): entry is CompiledRegexPatternRule => entry != null);
}

function compileRequiredPattern(
  pattern: { source: string; flags?: string },
): CompiledRegexPatternRule | null {
  return compileRegexPatternRule({ source: pattern.source, flags: pattern.flags ?? "i" });
}

function matchesAnyPattern(
  patterns: readonly CompiledRegexPatternRule[],
  value: string,
): boolean {
  return patterns.some((pattern) => pattern.regex.test(value));
}

export function compileAttachmentClassificationMatcher(
  config: AttachmentClassificationConfig,
): CompiledAttachmentClassificationMatcher {
  const mealContextPatterns: CompiledAttachmentMealContextPattern[] = config.mealContextPatterns
    .map((entry) => {
      const compiled = compileRequiredPattern(entry.pattern);
      return compiled ? { label: entry.label, pattern: compiled } : null;
    })
    .filter((entry): entry is CompiledAttachmentMealContextPattern => entry != null);

  const foodMessageSignal = compileRequiredPattern(config.foodMessageSignal);
  const workoutMessageSignal = compileRequiredPattern(config.workoutMessageSignal);
  const medicalMessagePatterns = compilePatternList(config.medicalMessagePatterns);
  const medicalFilenamePatterns = compilePatternList(config.medicalFilenamePatterns);
  const workoutFilenamePatterns = compilePatternList(config.workoutFilenamePatterns);
  const todayWorkoutContextPattern = compileRequiredPattern(config.todayWorkoutContextPattern);
  const todayWorkoutActionPattern = compileRequiredPattern(config.todayWorkoutActionPattern);
  const todayWorkoutNounPattern = compileRequiredPattern(config.todayWorkoutNounPattern);
  const todayWorkoutSportPattern = compileRequiredPattern(config.todayWorkoutSportPattern);
  const rationales = config.rationales;

  const inferMealContextFromMessage = (message: string): string | null => {
    const trimmed = message.trim();

    if (!trimmed) {
      return null;
    }

    for (const { pattern, label } of mealContextPatterns) {
      if (pattern.regex.test(trimmed)) {
        return label;
      }
    }

    return null;
  };

  const hasWorkoutAttachmentSignals = (message: string, filename: string): boolean => {
    const normalizedMessage = message.trim().toLowerCase();
    const normalizedFilename = filename.trim().toLowerCase();

    if (!normalizedMessage && !normalizedFilename) {
      return false;
    }

    return (
      (workoutMessageSignal?.regex.test(normalizedMessage) ?? false) ||
      matchesAnyPattern(workoutFilenamePatterns, normalizedFilename)
    );
  };

  const hasFoodAttachmentSignals = (
    message: string,
    mealContextLabel: string | null,
  ): boolean => {
    const normalizedMessage = message.trim().toLowerCase();
    return (foodMessageSignal?.regex.test(normalizedMessage) ?? false) || mealContextLabel != null;
  };

  const hasMedicalDocumentSignals = (message: string, filename: string): boolean => {
    const normalizedMessage = message.trim().toLowerCase();
    const normalizedFilename = filename.trim().toLowerCase();

    if (!normalizedMessage && !normalizedFilename) {
      return false;
    }

    return (
      matchesAnyPattern(medicalMessagePatterns, normalizedMessage) ||
      matchesAnyPattern(medicalFilenamePatterns, normalizedFilename)
    );
  };

  const messageRequestsTodayWorkoutLog = (message: string): boolean => {
    const trimmed = message.trim();

    if (!trimmed) {
      return false;
    }

    if (!(todayWorkoutContextPattern?.regex.test(trimmed) ?? false)) {
      return false;
    }

    if (
      (todayWorkoutActionPattern?.regex.test(trimmed) ?? false) &&
      (todayWorkoutNounPattern?.regex.test(trimmed) ?? false)
    ) {
      return true;
    }

    if (todayWorkoutNounPattern?.regex.test(trimmed) ?? false) {
      return true;
    }

    return todayWorkoutSportPattern?.regex.test(trimmed) ?? false;
  };

  const isChatMedicalImageMimeType = (mimeType: string): boolean => {
    return (CHAT_FOOD_PHOTO_MIME_TYPES as readonly string[]).includes(mimeType);
  };

  const isPdfAttachmentMimeType = (mimeType: string): boolean => mimeType === "application/pdf";

  const classifyAttachmentFromMessageContext = (input: {
    message: string;
    filename: string;
    mimeType: string;
  }): ChatAttachmentClassificationResult => {
    const normalizedMessage = input.message.trim().toLowerCase();
    const normalizedFilename = input.filename.trim().toLowerCase();
    const mealContextLabel = inferMealContextFromMessage(input.message);

    const isFoodMime = (CHAT_FOOD_PHOTO_MIME_TYPES as readonly string[]).includes(input.mimeType);
    const isWorkoutMime = (CHAT_WORKOUT_ATTACHMENT_MIME_TYPES as readonly string[]).includes(
      input.mimeType,
    );

    const medicalSignaled = hasMedicalDocumentSignals(input.message, input.filename);
    const medicalFilenameHint = matchesAnyPattern(medicalFilenamePatterns, normalizedFilename);
    const workoutSignaled = hasWorkoutAttachmentSignals(input.message, input.filename);
    const foodSignaled = hasFoodAttachmentSignals(input.message, mealContextLabel);
    const workoutFilenameHint = matchesAnyPattern(workoutFilenamePatterns, normalizedFilename);

    if (medicalSignaled) {
      const isMedicalImage =
        isChatMedicalImageMimeType(input.mimeType) &&
        !(SUPPORTED_HEALTH_DOCUMENT_MIME_TYPES as readonly string[]).includes(input.mimeType);

      return chatAttachmentClassificationResultSchema.parse({
        category: "medical_document",
        confidence: medicalFilenameHint ? "high" : "medium",
        rationale: isMedicalImage ? rationales.medicalImageConsent : rationales.medicalDocumentUpload,
        suggestedAction: "request_medical_consent",
        mealContextLabel: null,
      });
    }

    if (workoutSignaled) {
      return chatAttachmentClassificationResultSchema.parse({
        category: "workout_attachment",
        confidence:
          (workoutMessageSignal?.regex.test(normalizedMessage) ?? false) || workoutFilenameHint
            ? "high"
            : "medium",
        rationale: rationales.workoutAttachment,
        suggestedAction: "run_category_recognition",
        mealContextLabel: null,
      });
    }

    if (foodSignaled) {
      return chatAttachmentClassificationResultSchema.parse({
        category: "food_photo",
        confidence:
          mealContextLabel || (foodMessageSignal?.regex.test(normalizedMessage) ?? false)
            ? "high"
            : "medium",
        rationale: rationales.foodPhoto,
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
        rationale: rationales.healthDocumentMimeOnly,
        suggestedAction: "manual_fallback",
        mealContextLabel: null,
      });
    }

    if (isWorkoutMime && !isFoodMime && input.mimeType !== "application/pdf") {
      return chatAttachmentClassificationResultSchema.parse({
        category: "workout_attachment",
        confidence: "medium",
        rationale: rationales.workoutMimeOnly,
        suggestedAction: "run_category_recognition",
        mealContextLabel: null,
      });
    }

    return chatAttachmentClassificationResultSchema.parse({
      category: "unclassified",
      confidence: "low",
      rationale: rationales.ambiguousContext,
      suggestedAction: "manual_fallback",
      mealContextLabel: null,
    });
  };

  const classifyDevAttachment = (input: {
    message: string;
    filename: string;
    mimeType: string;
  }): ChatAttachmentClassificationResult => {
    const boundedMessage = input.message.trim().slice(0, 500);
    const mealContextLabel = inferMealContextFromMessage(boundedMessage);
    const medicalSignaled = hasMedicalDocumentSignals(boundedMessage, input.filename);
    const workoutSignaled = hasWorkoutAttachmentSignals(boundedMessage, input.filename);
    const foodSignaled = hasFoodAttachmentSignals(boundedMessage, mealContextLabel);

    if (medicalSignaled) {
      const isMedicalImage =
        isChatMedicalImageMimeType(input.mimeType) &&
        !(SUPPORTED_HEALTH_DOCUMENT_MIME_TYPES as readonly string[]).includes(input.mimeType);

      return chatAttachmentClassificationResultSchema.parse({
        category: "medical_document",
        confidence: "high",
        rationale: isMedicalImage ? rationales.medicalImageConsent : rationales.medicalDocumentUpload,
        suggestedAction: "request_medical_consent",
        mealContextLabel: null,
      });
    }

    if (workoutSignaled) {
      return chatAttachmentClassificationResultSchema.parse({
        category: "workout_attachment",
        confidence: "high",
        rationale: rationales.workoutAttachment,
        suggestedAction: "run_category_recognition",
        mealContextLabel: null,
      });
    }

    if (foodSignaled) {
      return chatAttachmentClassificationResultSchema.parse({
        category: "food_photo",
        confidence: "high",
        rationale: rationales.foodPhoto,
        suggestedAction: "run_category_recognition",
        mealContextLabel,
      });
    }

    if (isPdfAttachmentMimeType(input.mimeType)) {
      return mapLlmAttachmentClassifierOutput({
        category: "food_photo",
        confidence: "low",
        rationale: rationales.devPdfManualFallback,
        suggestedAction: "manual_fallback",
        mealContextLabel: null,
      });
    }

    return mapLlmAttachmentClassifierOutput({
      category: "food_photo",
      confidence: "low",
      rationale: rationales.devAmbiguousManualFallback,
      suggestedAction: "manual_fallback",
      mealContextLabel: null,
    });
  };

  const matchesTodayWorkoutSportMessage = (message: string): boolean =>
    todayWorkoutSportPattern?.regex.test(message.trim()) ?? false;

  return {
    config,
    inferMealContextFromMessage,
    hasWorkoutAttachmentSignals,
    hasFoodAttachmentSignals,
    hasMedicalDocumentSignals,
    messageRequestsTodayWorkoutLog,
    matchesTodayWorkoutSportMessage,
    classifyAttachmentFromMessageContext,
    classifyDevAttachment,
  };
}
