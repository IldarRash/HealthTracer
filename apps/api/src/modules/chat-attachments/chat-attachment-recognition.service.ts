import type {
  AttachmentBehaviorConfig,
  ChatAttachmentCategory,
  ChatAttachmentRecord,
} from "@health/types";
import {
  getChatAttachmentMimeTypeError,
  isChatMedicalImageMimeType,
  sanitizeMedicalRecognitionForClient,
} from "@health/types";
import { Injectable } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { AiBehaviorConfigService } from "../ai/ai-behavior-config.service.js";
import {
  buildEphemeralAttachmentExpiryFromBehavior,
} from "./attachment-behavior-policy.helpers.js";
import type {
  AttachmentRecognitionContextArtifact,
  AttachmentRecognitionContextPort,
  AttachmentRecognitionContextRequest,
} from "./attachment-recognition-context.js";
import {
  FoodPhotoAttachmentRecognizer,
} from "./food-photo-attachment-recognizer.js";
import {
  buildMedicalDocumentContextOnlyRecognition,
  parseMedicalUploadMetadata,
} from "./medical-document-attachment-recognizer.js";
import type { ChatAttachmentStorageAdapter } from "./local-chat-attachment-storage.js";
import {
  WorkoutAttachmentRecognizer,
} from "./workout-attachment-recognizer.js";

@Injectable()
export class ChatAttachmentRecognitionService implements AttachmentRecognitionContextPort {
  constructor(
    private readonly foodPhotoRecognizer: FoodPhotoAttachmentRecognizer,
    private readonly workoutAttachmentRecognizer: WorkoutAttachmentRecognizer,
    private readonly aiBehaviorConfigService: AiBehaviorConfigService,
  ) {}

  async recognizeAttachmentContext(
    input: AttachmentRecognitionContextRequest,
  ): Promise<AttachmentRecognitionContextArtifact> {
    return this.recognizeAttachment(input);
  }

  async recognizeAttachment(input: {
    auth: ClerkAuthContext;
    userId: string;
    attachment: ChatAttachmentRecord;
    category: ChatAttachmentCategory;
    storage: ChatAttachmentStorageAdapter;
    messageContext?: {
      boundedMessage: string;
      mealContextLabel: string | null;
    };
    behavior?: AttachmentBehaviorConfig;
  }): Promise<AttachmentRecognitionContextArtifact> {
    try {
      const behavior = input.behavior ?? this.aiBehaviorConfigService.getAttachmentBehavior();

      if (input.category === "unclassified") {
        throw new Error("Unclassified attachments must be classified before recognition.");
      }

      if (
        input.attachment.category !== "unclassified" &&
        input.category !== input.attachment.category
      ) {
        throw new Error("Recognition category must match stored attachment category.");
      }

      const mimeError = getChatAttachmentMimeTypeError(
        input.attachment.category,
        input.attachment.mimeType,
      );

      if (mimeError) {
        throw new Error(mimeError);
      }

      if (input.category === "food_photo") {
        const analysis = await this.foodPhotoRecognizer.recognize({
          userId: input.userId,
          attachment: input.attachment,
          mealContextLabel: input.messageContext?.mealContextLabel ?? null,
          boundedMessage: input.messageContext?.boundedMessage,
        });
        const recognition = this.foodPhotoRecognizer.buildEnvelope({
          attachmentRefId: input.attachment.id,
          analysis,
        });
        const topConfidence = analysis.candidates[0]?.confidence ?? "medium";

        return {
          status: topConfidence === "low" ? "low_confidence" : "ready",
          recognition,
          failureReason: null,
          linkedDocumentId: null,
          expiresAt: buildEphemeralAttachmentExpiryFromBehavior("food_photo", behavior),
        };
      }

      if (input.category === "medical_document") {
        if (!input.attachment.consent) {
          return {
            status: "needs_consent",
            recognition: null,
            failureReason: "Explicit consent is required before processing medical documents.",
            linkedDocumentId: null,
            expiresAt: null,
          };
        }

        if (isChatMedicalImageMimeType(input.attachment.mimeType)) {
          return {
            status: "needs_review",
            recognition: null,
            failureReason:
              "Medical image uploads require manual review; automated document parsing is not available for photos.",
            linkedDocumentId: null,
            expiresAt: null,
          };
        }

        const uploadMetadata = parseMedicalUploadMetadata(input.attachment);

        if (!uploadMetadata) {
          return {
            status: "failed",
            recognition: null,
            failureReason: "Medical document metadata is incomplete.",
            linkedDocumentId: null,
            expiresAt: null,
          };
        }

        const contextRecognition = buildMedicalDocumentContextOnlyRecognition({
          attachment: input.attachment,
          consent: input.attachment.consent,
          uploadMetadata,
          wellnessContextOnlyNotice:
            behavior.recognition.prompts.medicalDocument.wellnessContextOnlyNotice,
        });

        return {
          status: "needs_review",
          recognition: sanitizeMedicalRecognitionForClient(contextRecognition),
          failureReason: null,
          linkedDocumentId: null,
          expiresAt: null,
        };
      }

      const recognition = await this.workoutAttachmentRecognizer.recognize({
        attachment: input.attachment,
        boundedMessage: input.messageContext?.boundedMessage,
      });
      const confidence = recognition.provenance.confidence ?? "medium";

      return {
        status: confidence === "low" ? "low_confidence" : "ready",
        recognition,
        failureReason: null,
        linkedDocumentId: null,
        expiresAt: buildEphemeralAttachmentExpiryFromBehavior("workout_attachment", behavior),
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Attachment recognition failed unexpectedly.";

      return {
        status: "failed",
        recognition: null,
        failureReason: message.slice(0, 240),
        linkedDocumentId: null,
        expiresAt: null,
      };
    }
  }
}
