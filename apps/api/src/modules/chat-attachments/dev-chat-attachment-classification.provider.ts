import type { ChatAttachmentClassificationResult } from "@health/types";
import {
  chatAttachmentClassificationResultSchema,
  hasFoodAttachmentSignals,
  hasMedicalDocumentSignals,
  hasWorkoutAttachmentSignals,
  inferMealContextFromMessage,
  isChatMedicalImageMimeType,
  isPdfAttachmentMimeType,
  mapLlmAttachmentClassifierOutput,
} from "@health/types";
import { SUPPORTED_HEALTH_DOCUMENT_MIME_TYPES } from "@health/types";
import { Injectable } from "@nestjs/common";
import type {
  ChatAttachmentClassificationProvider,
  ChatAttachmentClassificationRequest,
} from "./chat-attachment-classification.provider.js";

@Injectable()
export class DevChatAttachmentClassificationProvider
  implements ChatAttachmentClassificationProvider
{
  async classify(
    request: ChatAttachmentClassificationRequest,
  ): Promise<ChatAttachmentClassificationResult> {
    const boundedMessage = request.message.trim().slice(0, 500);
    const mealContextLabel = inferMealContextFromMessage(boundedMessage);
    const medicalSignaled = hasMedicalDocumentSignals(boundedMessage, request.filename);
    const workoutSignaled = hasWorkoutAttachmentSignals(boundedMessage, request.filename);
    const foodSignaled = hasFoodAttachmentSignals(boundedMessage, mealContextLabel);

    if (medicalSignaled) {
      const isMedicalImage =
        isChatMedicalImageMimeType(request.mimeType) &&
        !(SUPPORTED_HEALTH_DOCUMENT_MIME_TYPES as readonly string[]).includes(request.mimeType);

      return chatAttachmentClassificationResultSchema.parse({
        category: "medical_document",
        confidence: "high",
        rationale: isMedicalImage
          ? "Attachment appears to be a medical document image; consent is required before review."
          : "Attachment appears to be a health document upload.",
        suggestedAction: "request_medical_consent",
        mealContextLabel: null,
      });
    }

    if (workoutSignaled) {
      return chatAttachmentClassificationResultSchema.parse({
        category: "workout_attachment",
        confidence: "high",
        rationale: "Attachment appears to show training or physical activity.",
        suggestedAction: "run_category_recognition",
        mealContextLabel: null,
      });
    }

    if (foodSignaled) {
      return chatAttachmentClassificationResultSchema.parse({
        category: "food_photo",
        confidence: "high",
        rationale: "Attachment appears to be a meal or food photo for nutrition logging.",
        suggestedAction: "run_category_recognition",
        mealContextLabel,
      });
    }

    if (isPdfAttachmentMimeType(request.mimeType)) {
      return mapLlmAttachmentClassifierOutput({
        category: "food_photo",
        confidence: "low",
        rationale:
          "Document file type cannot be classified from MIME alone in local dev mode; vision or message context is required.",
        suggestedAction: "manual_fallback",
        mealContextLabel: null,
      });
    }

    return mapLlmAttachmentClassifierOutput({
      category: "food_photo",
      confidence: "low",
      rationale:
        "Could not determine attachment category from the image and message context. Ask the user to clarify or choose a category.",
      suggestedAction: "manual_fallback",
      mealContextLabel: null,
    });
  }
}
