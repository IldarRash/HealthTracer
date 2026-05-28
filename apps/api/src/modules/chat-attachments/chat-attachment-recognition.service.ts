import type {
  ChatAttachmentCategory,
  ChatAttachmentRecognitionEnvelope,
  ChatAttachmentRecord,
  RawAiProposal,
} from "@health/types";
import {
  containsUnsafeRecognitionSummaryLanguage,
  getChatAttachmentMimeTypeError,
  isChatMedicalImageMimeType,
  isPhotoBackedNutritionProposalPayload,
  isTextEstimateNutritionProposalPayload,
  logNutritionIncidentProposalPayloadSchema,
  inferWorkoutTodayChecklistLabel,
  messageRequestsTodayWorkoutLog,
  sanitizeMedicalRecognitionForClient,
  todayChecklistPayloadSchema,
  workoutPlanProposalChangesSchema,
  type LogNutritionIncidentProposalPayload,
  type WorkoutAttachmentRecognitionEnvelope,
} from "@health/types";
import { Injectable } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { FoodPhotoAnalysisService } from "../nutrition/food-photo-analysis.service.js";
import {
  FoodPhotoAttachmentRecognizer,
  buildEphemeralFoodPhotoExpiry,
} from "./food-photo-attachment-recognizer.js";
import {
  MedicalDocumentAttachmentRecognizer,
  parseMedicalUploadMetadata,
} from "./medical-document-attachment-recognizer.js";
import type { ChatAttachmentStorageAdapter } from "./local-chat-attachment-storage.js";
import {
  WorkoutAttachmentRecognizer,
  buildEphemeralWorkoutAttachmentExpiry,
} from "./workout-attachment-recognizer.js";

export type AttachmentProposalCandidate = {
  intent: string;
  targetDomain: string;
  title: string;
  reason: string;
  proposedChanges: unknown;
  attachmentRefId: string;
};

export type MergeAttachmentProposalsOptions = {
  workoutRecognitions?: WorkoutAttachmentRecognitionEnvelope[];
};

const FULL_WORKOUT_PLAN_PROPOSAL_INTENTS = new Set([
  "create_workout_plan",
  "adapt_workout_plan",
  "adapt_workout_plan_from_progress",
]);

@Injectable()
export class ChatAttachmentRecognitionService {
  constructor(
    private readonly foodPhotoRecognizer: FoodPhotoAttachmentRecognizer,
    private readonly medicalDocumentRecognizer: MedicalDocumentAttachmentRecognizer,
    private readonly workoutAttachmentRecognizer: WorkoutAttachmentRecognizer,
    private readonly foodPhotoAnalysisService: FoodPhotoAnalysisService,
  ) {}

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
  }): Promise<{
    status: ChatAttachmentRecord["status"];
    recognition: ChatAttachmentRecognitionEnvelope | null;
    failureReason: string | null;
    linkedDocumentId: string | null;
    expiresAt: Date | null;
  }> {
    try {
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
          expiresAt: buildEphemeralFoodPhotoExpiry(),
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

        const recognition = await this.medicalDocumentRecognizer.recognize({
          auth: input.auth,
          attachment: input.attachment,
          consent: input.attachment.consent,
          uploadMetadata,
          storage: input.storage,
        });

        if (
          recognition.summarySnippet &&
          containsUnsafeRecognitionSummaryLanguage(recognition.summarySnippet)
        ) {
          return {
            status: "failed",
            recognition: null,
            failureReason: "Document summary contains unsafe medical wording.",
            linkedDocumentId: recognition.documentId,
            expiresAt: null,
          };
        }

        return {
          status: "needs_review",
          recognition: sanitizeMedicalRecognitionForClient(recognition),
          failureReason: null,
          linkedDocumentId: recognition.documentId,
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
        expiresAt: buildEphemeralWorkoutAttachmentExpiry(),
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

  buildProposalCandidates(input: {
    attachment: ChatAttachmentRecord;
    incidentDateTime: string;
    mealContextLabel?: string | null;
    boundedMessage?: string;
    todayIsoDate?: string;
  }): AttachmentProposalCandidate[] {
    const recognition = input.attachment.recognition;

    if (!recognition) {
      return [];
    }

    if (recognition.category === "food_photo") {
      const mealContextLabel = input.mealContextLabel ?? null;
      const payload = this.foodPhotoAnalysisService.buildProposalPayloadFromAnalysis({
        incidentDateTime: input.incidentDateTime,
        analysis: recognition.analysis,
        imageRefs: [{ id: recognition.attachmentRefId }],
        mealContextLabel,
      });

      const mealTitleSuffix = mealContextLabel ? ` (${mealContextLabel})` : "";

      return [
        {
          intent: "log_nutrition_incident",
          targetDomain: "nutrition",
          title: `Log meal from photo${mealTitleSuffix}`,
          reason: mealContextLabel
            ? `Review the analyzed ${mealContextLabel.toLowerCase()} items and quantities before logging this nutrition incident.`
            : "Review the analyzed meal items and quantities before logging this nutrition incident.",
          proposedChanges: {
            ...payload,
            attachmentRefId: recognition.attachmentRefId,
          },
          attachmentRefId: recognition.attachmentRefId,
        },
      ];
    }

    if (recognition.category === "medical_document") {
      // Medical documents require user review before downstream proposals.
      return [];
    }

    if (recognition.suggestedIntent === "create_workout_plan") {
      const proposedChanges = workoutPlanProposalChangesSchema.parse({
        title: recognition.planDraftTitle ?? "Imported workout plan draft",
        summary:
          "Draft workout plan extracted from your training attachment. Review exercises before accepting.",
        days: [
          {
            weekday: "monday",
            focus: recognition.sessionLabel ?? "Imported session",
            exercises: recognition.exercises,
          },
        ],
        notes: ["Generated from chat attachment recognition. No plan changes are applied until you accept."],
        attachmentRefId: recognition.attachmentRefId,
      });

      return [
        {
          intent: "create_workout_plan",
          targetDomain: "workout",
          title: "Review imported workout plan",
          reason:
            "This draft plan was extracted from your training attachment. Accepting it creates a new workout plan revision.",
          proposedChanges,
          attachmentRefId: recognition.attachmentRefId,
        },
      ];
    }

    if (recognition.suggestedIntent === "log_session_context") {
      const boundedMessage = input.boundedMessage?.trim() ?? "";
      const todayIsoDate = input.todayIsoDate?.trim();

      if (
        boundedMessage.length > 0 &&
        todayIsoDate &&
        messageRequestsTodayWorkoutLog(boundedMessage)
      ) {
        return this.buildTodayWorkoutChecklistProposalCandidates({
          recognition,
          boundedMessage,
          todayIsoDate,
        });
      }
    }

    // Session-context attachments surface recognition for manual review; no auto plan mutation.
    return [];
  }

  private buildTodayWorkoutChecklistProposalCandidates(input: {
    recognition: WorkoutAttachmentRecognitionEnvelope;
    boundedMessage: string;
    todayIsoDate: string;
  }): AttachmentProposalCandidate[] {
    const label = inferWorkoutTodayChecklistLabel(
      input.boundedMessage,
      input.recognition.sessionLabel,
    );
    const proposedChanges = todayChecklistPayloadSchema.parse({
      date: input.todayIsoDate,
      items: [
        {
          label,
          kind: "workout",
          status: "pending",
        },
      ],
    });

    return [
      {
        intent: "create_today_checklist",
        targetDomain: "today",
        title: "Add today's workout to Today",
        reason:
          "Review this Today checklist item before it is saved. Nothing changes until you accept the proposal.",
        proposedChanges,
        attachmentRefId: input.recognition.attachmentRefId,
      },
    ];
  }

  mergeAttachmentProposals(
    aiProposals: RawAiProposal[],
    attachmentProposals: AttachmentProposalCandidate[],
    options?: MergeAttachmentProposalsOptions,
  ): RawAiProposal[] {
    const filteredAiProposals = this.filterDisallowedWorkoutPlanProposals(
      aiProposals,
      attachmentProposals,
      options?.workoutRecognitions ?? [],
    );

    if (attachmentProposals.length === 0) {
      return filteredAiProposals;
    }

    const merged = [...filteredAiProposals];

    for (const candidate of attachmentProposals) {
      if (candidate.intent === "log_nutrition_incident") {
        const attachmentPayload = logNutritionIncidentProposalPayloadSchema.safeParse(
          candidate.proposedChanges,
        );

        if (attachmentPayload.success && isPhotoBackedNutritionProposalPayload(attachmentPayload.data)) {
          const textEstimateIndex = merged.findIndex((proposal) => {
            if (proposal.intent !== "log_nutrition_incident") {
              return false;
            }

            const parsed = logNutritionIncidentProposalPayloadSchema.safeParse(
              proposal.proposedChanges,
            );

            return parsed.success && isTextEstimateNutritionProposalPayload(parsed.data);
          });

          const attachmentProposal = {
            intent: candidate.intent,
            targetDomain: candidate.targetDomain,
            title: candidate.title,
            reason: candidate.reason,
            proposedChanges: candidate.proposedChanges,
          } as RawAiProposal;

          if (textEstimateIndex >= 0) {
            merged[textEstimateIndex] = attachmentProposal;
            continue;
          }

          const duplicatePhotoIndex = merged.findIndex((proposal) => {
            if (proposal.intent !== "log_nutrition_incident") {
              return false;
            }

            const parsed = logNutritionIncidentProposalPayloadSchema.safeParse(
              proposal.proposedChanges,
            );

            return (
              parsed.success && isPhotoBackedNutritionProposalPayload(parsed.data as LogNutritionIncidentProposalPayload)
            );
          });

          if (duplicatePhotoIndex >= 0) {
            merged[duplicatePhotoIndex] = attachmentProposal;
            continue;
          }
        }
      }

      const duplicateIntent = merged.some(
        (proposal) =>
          proposal.intent === candidate.intent &&
          proposal.targetDomain === candidate.targetDomain,
      );

      if (!duplicateIntent) {
        merged.push({
          intent: candidate.intent,
          targetDomain: candidate.targetDomain,
          title: candidate.title,
          reason: candidate.reason,
          proposedChanges: candidate.proposedChanges,
        } as RawAiProposal);
      }
    }

    return merged;
  }

  private filterDisallowedWorkoutPlanProposals(
    aiProposals: RawAiProposal[],
    attachmentProposals: AttachmentProposalCandidate[],
    workoutRecognitions: WorkoutAttachmentRecognitionEnvelope[],
  ): RawAiProposal[] {
    if (
      !shouldSuppressFullWorkoutPlanProposals(attachmentProposals, workoutRecognitions)
    ) {
      return aiProposals;
    }

    return aiProposals.filter(
      (proposal) => !FULL_WORKOUT_PLAN_PROPOSAL_INTENTS.has(proposal.intent),
    );
  }
}

function allowsFullWorkoutPlanProposals(
  attachmentProposals: AttachmentProposalCandidate[],
  workoutRecognitions: WorkoutAttachmentRecognitionEnvelope[],
): boolean {
  if (attachmentProposals.some((candidate) => candidate.intent === "create_workout_plan")) {
    return true;
  }

  return workoutRecognitions.some(
    (recognition) => recognition.suggestedIntent === "create_workout_plan",
  );
}

function shouldSuppressFullWorkoutPlanProposals(
  attachmentProposals: AttachmentProposalCandidate[],
  workoutRecognitions: WorkoutAttachmentRecognitionEnvelope[],
): boolean {
  if (workoutRecognitions.length === 0) {
    return false;
  }

  if (allowsFullWorkoutPlanProposals(attachmentProposals, workoutRecognitions)) {
    return false;
  }

  return (
    attachmentProposals.some((candidate) => candidate.intent === "create_today_checklist") ||
    workoutRecognitions.some(
      (recognition) => recognition.suggestedIntent === "log_session_context",
    )
  );
}
