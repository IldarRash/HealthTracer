import type {
  AttachmentBehaviorConfig,
  AttachmentTurnStage,
  ChatAttachmentClassificationResult,
  ChatAttachmentRecord,
  ClassifiedChatAttachmentCategory,
} from "@health/types";
import {
  DEFAULT_ATTACHMENT_TURN_STAGE_ORDER,
  MEDICAL_ATTACHMENT_CONSENT_REQUIRED_REASON,
  getChatAttachmentOwnershipErrors,
  getChatAttachmentSendEligibilityErrors,
  isChatAttachmentPendingMessageFirstSend,
  resolveSendTimeAttachmentCategory,
  resolveSendTimeCategorySource,
} from "@health/types";
import { BadRequestException, Injectable } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { AiBehaviorConfigService } from "../ai/ai-behavior-config.service.js";
import {
  inferMealContextFromBehaviorConfig,
  resolveAttachmentContextCapabilityHint,
  resolveAttachmentContextHint,
  resolveAttachmentRetentionPolicyFromBehavior,
} from "./attachment-behavior-policy.helpers.js";
import { ChatAttachmentClassifierService } from "./chat-attachment-classifier.service.js";
import {
  ChatAttachmentRecognitionService,
} from "./chat-attachment-recognition.service.js";
import { ChatAttachmentsService } from "./chat-attachments.service.js";
import type {
  AttachmentContextSummary,
  AttachmentTurnStageResult,
} from "./chat-turn-attachment-stage.types.js";

const MAX_MESSAGE_CONTEXT_CHARS = 500;

type PendingRecognitionContext = {
  mealContextLabel: string | null;
  boundedMessage: string;
};

type TurnStageState = {
  auth: ClerkAuthContext;
  userId: string;
  threadId: string;
  messageId: string;
  messageContent: string;
  attachmentRefIds: readonly string[];
  todayIsoDate: string;
  behavior: AttachmentBehaviorConfig;
  attachments: ChatAttachmentRecord[];
  pendingClassifications: Map<string, ChatAttachmentClassificationResult>;
  pendingRecognitionContext: Map<string, PendingRecognitionContext>;
  contextSummaries: AttachmentContextSummary[];
};

@Injectable()
export class ChatTurnAttachmentStageService {
  constructor(
    private readonly chatAttachmentsService: ChatAttachmentsService,
    private readonly chatAttachmentClassifierService: ChatAttachmentClassifierService,
    private readonly chatAttachmentRecognitionService: ChatAttachmentRecognitionService,
    private readonly aiBehaviorConfigService: AiBehaviorConfigService,
  ) {}

  async validateRefsForSend(userId: string, attachmentRefIds: readonly string[]): Promise<void> {
    if (attachmentRefIds.length === 0) {
      return;
    }

    const state: Pick<TurnStageState, "userId" | "attachmentRefIds" | "attachments"> = {
      userId,
      attachmentRefIds,
      attachments: [],
    };

    await this.runValidateRefs(state as TurnStageState);
  }

  async runTurnStages(input: {
    auth: ClerkAuthContext;
    userId: string;
    threadId: string;
    messageId: string;
    messageContent: string;
    attachmentRefIds: readonly string[];
    todayIsoDate: string;
  }): Promise<AttachmentTurnStageResult | null> {
    if (input.attachmentRefIds.length === 0) {
      return null;
    }

    const behavior = this.aiBehaviorConfigService.getAttachmentBehavior();
    const stageOrder = this.resolveStageOrder(behavior.turnStages.order).filter(
      (stage) => stage !== "validate_refs",
    );

    const state: TurnStageState = {
      auth: input.auth,
      userId: input.userId,
      threadId: input.threadId,
      messageId: input.messageId,
      messageContent: input.messageContent,
      attachmentRefIds: input.attachmentRefIds,
      todayIsoDate: input.todayIsoDate,
      behavior,
      attachments: await this.chatAttachmentsService.assertOwnedAttachmentRefs(
        input.userId,
        input.attachmentRefIds,
      ),
      pendingClassifications: new Map(),
      pendingRecognitionContext: new Map(),
      contextSummaries: [],
    };

    for (const stage of stageOrder) {
      await this.runStage(stage, state);
    }

    return {
      attachments: state.attachments,
      contextSummaries: state.contextSummaries,
      outcomes: this.buildOutcomes(state.attachments),
    };
  }

  private resolveStageOrder(configuredOrder: readonly AttachmentTurnStage[]): AttachmentTurnStage[] {
    const required = [...DEFAULT_ATTACHMENT_TURN_STAGE_ORDER];
    const normalized = configuredOrder.filter((stage): stage is AttachmentTurnStage =>
      (DEFAULT_ATTACHMENT_TURN_STAGE_ORDER as readonly string[]).includes(stage),
    );

    if (normalized.length !== required.length) {
      return [...DEFAULT_ATTACHMENT_TURN_STAGE_ORDER];
    }

    return normalized;
  }

  private async runStage(stage: AttachmentTurnStage, state: TurnStageState): Promise<void> {
    switch (stage) {
      case "validate_refs":
        await this.runValidateRefs(state);
        return;
      case "link_to_message":
        await this.runLinkToMessage(state);
        return;
      case "classify":
        await this.runClassify(state);
        return;
      case "apply_upload_disposition":
        await this.runApplyUploadDisposition(state);
        return;
      case "recognize":
        await this.runRecognize(state);
        return;
      case "prepare_attachment_context":
        this.runPrepareAttachmentContext(state);
        return;
      default:
        return;
    }
  }

  private async runValidateRefs(state: TurnStageState): Promise<void> {
    state.attachments = await this.chatAttachmentsService.assertOwnedAttachmentRefs(
      state.userId,
      state.attachmentRefIds,
    );

    const ownedAttachments = state.attachments.map((attachment) => ({
      id: attachment.id,
      userId: attachment.userId,
      category: attachment.category,
      status: attachment.status,
      linkedDocumentId: attachment.linkedDocumentId,
      linkedImageRefId: attachment.linkedImageRefId,
      retentionPolicy: attachment.retentionPolicy,
      expiresAt: attachment.expiresAt,
    }));

    const attachmentRefValidationErrors = [
      ...getChatAttachmentOwnershipErrors(state.attachmentRefIds, ownedAttachments),
      ...getChatAttachmentSendEligibilityErrors(state.attachmentRefIds, ownedAttachments),
    ];

    if (attachmentRefValidationErrors.length > 0) {
      throw new BadRequestException({
        message: "Attachment references failed validation.",
        validationErrors: attachmentRefValidationErrors,
      });
    }
  }

  private async runLinkToMessage(state: TurnStageState): Promise<void> {
    await this.chatAttachmentsService.linkAttachmentsToMessage(
      state.userId,
      state.attachmentRefIds,
      state.messageId,
      state.threadId,
    );
  }

  private async runClassify(state: TurnStageState): Promise<void> {
    for (const attachment of state.attachments) {
      if (
        !isChatAttachmentPendingMessageFirstSend({
          category: attachment.category,
          status: attachment.status,
          recognition: attachment.recognition,
        })
      ) {
        continue;
      }

      const attachmentContent = attachment.storageKey
        ? await this.chatAttachmentsService.readStoredContent(attachment.storageKey)
        : Buffer.alloc(0);

      const classification = await this.chatAttachmentClassifierService.classify({
        message: state.messageContent,
        attachment,
        content: attachmentContent,
        categorySource: attachment.categorySource,
      });

      state.pendingClassifications.set(attachment.id, classification);
    }
  }

  private async runApplyUploadDisposition(state: TurnStageState): Promise<void> {
    const processed: ChatAttachmentRecord[] = [];

    for (const attachment of state.attachments) {
      const pendingClassification = state.pendingClassifications.get(attachment.id);

      if (!pendingClassification) {
        processed.push(attachment);
        continue;
      }

      if (
        pendingClassification.suggestedAction === "manual_fallback" ||
        pendingClassification.suggestedAction === "unsupported"
      ) {
        const updated = await this.chatAttachmentsService.applyTurnStageUpdate(
          state.userId,
          attachment.id,
          {
            category: "unclassified",
            categorySource: resolveSendTimeCategorySource({
              previousCategorySource: attachment.categorySource,
              resolvedCategory: "unclassified",
            }),
            status: "needs_review",
            failureReason: pendingClassification.rationale.slice(0, 240),
            retentionPolicy: resolveAttachmentRetentionPolicyFromBehavior(
              "unclassified",
              state.behavior,
            ),
          },
        );

        processed.push(updated);
        continue;
      }

      const classifiedCategory = resolveSendTimeAttachmentCategory({
        attachmentCategory: attachment.category,
        attachmentCategorySource: attachment.categorySource,
        consentScopes: attachment.consent?.consentScopes,
        classificationCategory: pendingClassification.category as ClassifiedChatAttachmentCategory,
      });

      const categorySource = resolveSendTimeCategorySource({
        previousCategorySource: attachment.categorySource,
        resolvedCategory: classifiedCategory,
      });

      const mealContextLabel =
        pendingClassification.mealContextLabel ??
        inferMealContextFromBehaviorConfig(state.messageContent, state.behavior);

      let linkedImageRefId = attachment.linkedImageRefId;
      const retentionPolicy = resolveAttachmentRetentionPolicyFromBehavior(
        classifiedCategory,
        state.behavior,
      );

      if (classifiedCategory === "food_photo") {
        linkedImageRefId = attachment.id;
      }

      if (classifiedCategory === "medical_document" && !attachment.consent) {
        await this.chatAttachmentsService.purgeStoredContent(attachment.storageKey);

        const updated = await this.chatAttachmentsService.applyTurnStageUpdate(
          state.userId,
          attachment.id,
          {
            category: classifiedCategory,
            categorySource,
            status: "needs_consent",
            storageKey: null,
            linkedImageRefId,
            retentionPolicy,
            failureReason: MEDICAL_ATTACHMENT_CONSENT_REQUIRED_REASON,
          },
        );

        processed.push(updated);
        continue;
      }

      state.pendingRecognitionContext.set(attachment.id, {
        mealContextLabel,
        boundedMessage: state.messageContent.trim().slice(0, MAX_MESSAGE_CONTEXT_CHARS),
      });

      const updated = await this.chatAttachmentsService.applyTurnStageUpdate(
        state.userId,
        attachment.id,
        {
          category: classifiedCategory,
          categorySource,
          status: "recognizing",
          linkedImageRefId,
          retentionPolicy,
          failureReason: null,
        },
      );

      processed.push(updated);
    }

    state.attachments = processed;
  }

  private async runRecognize(state: TurnStageState): Promise<void> {
    const processed: ChatAttachmentRecord[] = [];

    for (const attachment of state.attachments) {
      if (attachment.status !== "recognizing") {
        processed.push(attachment);
        continue;
      }

      if (attachment.category === "unclassified") {
        processed.push(attachment);
        continue;
      }

      const messageContext = state.pendingRecognitionContext.get(attachment.id);

      const outcome = await this.chatAttachmentRecognitionService.recognizeAttachmentContext({
        auth: state.auth,
        userId: state.userId,
        attachment,
        category: attachment.category,
        storage: this.chatAttachmentsService.getStorageAdapter(),
        messageContext: {
          mealContextLabel: messageContext?.mealContextLabel ?? null,
          boundedMessage: messageContext?.boundedMessage ?? "",
        },
        behavior: state.behavior,
      });

      const updated = await this.chatAttachmentsService.applyTurnStageUpdate(
        state.userId,
        attachment.id,
        {
          category: attachment.category,
          categorySource: attachment.categorySource,
          status: outcome.status,
          recognition: outcome.recognition,
          failureReason: outcome.failureReason,
          linkedDocumentId: outcome.linkedDocumentId,
          linkedImageRefId:
            attachment.category === "food_photo" ? attachment.id : attachment.linkedImageRefId,
          expiresAt: outcome.expiresAt,
          retentionPolicy: resolveAttachmentRetentionPolicyFromBehavior(
            attachment.category,
            state.behavior,
          ),
        },
      );

      processed.push(updated);
    }

    state.attachments = processed;
  }

  private runPrepareAttachmentContext(state: TurnStageState): void {
    state.contextSummaries = state.attachments.map((attachment) => ({
      attachmentRefId: attachment.id,
      category: attachment.category,
      status: attachment.status,
      routingCapabilityId: resolveAttachmentContextCapabilityHint(attachment.category, state.behavior),
      contextHint: resolveAttachmentContextHint(attachment, state.behavior),
      recognitionPresent: attachment.recognition != null,
    }));
  }

  private buildOutcomes(attachments: readonly ChatAttachmentRecord[]) {
    return attachments.map((attachment) => ({
      attachmentRefId: attachment.id,
      category: attachment.category,
      status: attachment.status,
      recognition: attachment.recognition,
    }));
  }
}
