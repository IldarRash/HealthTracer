import type {
  AttachmentBehaviorConfig,
  AttachmentTurnStage,
  ChatAttachmentRecord,
} from "@health/types";
import {
  DEFAULT_ATTACHMENT_TURN_STAGE_ORDER,
  MEDICAL_ATTACHMENT_CONSENT_REQUIRED_REASON,
  SUPPORTED_HEALTH_DOCUMENT_MIME_TYPES,
  getChatAttachmentOwnershipErrors,
  getChatAttachmentSendEligibilityErrors,
} from "@health/types";
import { BadRequestException, Injectable } from "@nestjs/common";
import { AiBehaviorConfigService } from "../ai/ai-behavior-config.service.js";
import {
  resolveAttachmentRetentionPolicyFromBehavior,
} from "./attachment-behavior-policy.helpers.js";
import { ChatAttachmentsService } from "./chat-attachments.service.js";
import type {
  AttachmentTurnStageResult,
  BoundedAttachmentMetadata,
} from "./chat-turn-attachment-stage.types.js";

type TurnStageState = {
  userId: string;
  threadId: string;
  messageId: string;
  attachmentRefIds: readonly string[];
  behavior: AttachmentBehaviorConfig;
  attachments: ChatAttachmentRecord[];
};

/**
 * Returns true when the attachment's user-declared category or MIME type
 * indicates a medical document that requires consent before storage.
 *
 * This is the consent-gate trigger based solely on user-declared category/
 * document-type + MIME captured at upload — no LLM classifier required.
 * PDF and plain-text MIMEs are exclusively in the health-document set and
 * are not shared with food photos or workout attachments.
 */
function isMedicalAttachmentByDeclarationOrMime(attachment: ChatAttachmentRecord): boolean {
  if (attachment.category === "medical_document") {
    return true;
  }

  if (attachment.category === "unclassified") {
    return (SUPPORTED_HEALTH_DOCUMENT_MIME_TYPES as readonly string[]).includes(
      attachment.mimeType,
    );
  }

  return false;
}

@Injectable()
export class ChatTurnAttachmentStageService {
  constructor(
    private readonly chatAttachmentsService: ChatAttachmentsService,
    private readonly aiBehaviorConfigService: AiBehaviorConfigService,
  ) {}

  async validateRefsForSend(userId: string, attachmentRefIds: readonly string[]): Promise<void> {
    if (attachmentRefIds.length === 0) {
      return;
    }

    const attachments = await this.chatAttachmentsService.assertOwnedAttachmentRefs(
      userId,
      attachmentRefIds,
    );

    const ownedAttachments = attachments.map((attachment) => ({
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
      ...getChatAttachmentOwnershipErrors(attachmentRefIds, ownedAttachments),
      ...getChatAttachmentSendEligibilityErrors(attachmentRefIds, ownedAttachments),
    ];

    if (attachmentRefValidationErrors.length > 0) {
      throw new BadRequestException({
        message: "Attachment references failed validation.",
        validationErrors: attachmentRefValidationErrors,
      });
    }
  }

  async runTurnStages(input: {
    userId: string;
    threadId: string;
    messageId: string;
    attachmentRefIds: readonly string[];
  }): Promise<AttachmentTurnStageResult | null> {
    if (input.attachmentRefIds.length === 0) {
      return null;
    }

    const behavior = this.aiBehaviorConfigService.getAttachmentBehavior();
    const stageOrder = this.resolveStageOrder(behavior.turnStages.order).filter(
      (stage) => stage !== "validate_refs",
    );

    const state: TurnStageState = {
      userId: input.userId,
      threadId: input.threadId,
      messageId: input.messageId,
      attachmentRefIds: input.attachmentRefIds,
      behavior,
      attachments: await this.chatAttachmentsService.assertOwnedAttachmentRefs(
        input.userId,
        input.attachmentRefIds,
      ),
    };

    for (const stage of stageOrder) {
      await this.runStage(stage, state);
    }

    return {
      attachmentMetadata: this.buildBoundedMetadata(state.attachments),
      outcomes: this.buildOutcomes(state.attachments),
    };
  }

  private resolveStageOrder(
    configuredOrder: readonly AttachmentTurnStage[],
  ): AttachmentTurnStage[] {
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
      case "apply_upload_disposition":
        await this.runApplyUploadDisposition(state);
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

  /**
   * Applies category, retention, consent, and storage disposition.
   *
   * Medical consent gate: when the user-declared category/document-type + MIME
   * indicate a medical document and consent is absent, stored content is purged
   * and the attachment is marked `needs_consent`. No LLM classification is used.
   */
  private async runApplyUploadDisposition(state: TurnStageState): Promise<void> {
    const processed: ChatAttachmentRecord[] = [];

    for (const attachment of state.attachments) {
      if (!isMedicalAttachmentByDeclarationOrMime(attachment)) {
        // Non-medical attachment: ensure retention policy is set and pass through.
        if (attachment.category !== "unclassified") {
          const retentionPolicy = resolveAttachmentRetentionPolicyFromBehavior(
            attachment.category,
            state.behavior,
          );

          if (retentionPolicy !== attachment.retentionPolicy) {
            const updated = await this.chatAttachmentsService.applyTurnStageUpdate(
              state.userId,
              attachment.id,
              { retentionPolicy },
            );

            processed.push(updated);
            continue;
          }
        }

        processed.push(attachment);
        continue;
      }

      // Medical attachment gate — user-declared category or exclusively-medical MIME.
      if (!attachment.consent) {
        await this.chatAttachmentsService.purgeStoredContent(attachment.storageKey);

        const updated = await this.chatAttachmentsService.applyTurnStageUpdate(
          state.userId,
          attachment.id,
          {
            category: "medical_document",
            categorySource: attachment.categorySource === "user_selected"
              ? "user_selected"
              : "mime_inferred",
            status: "needs_consent",
            storageKey: null,
            retentionPolicy: resolveAttachmentRetentionPolicyFromBehavior(
              "medical_document",
              state.behavior,
            ),
            failureReason: MEDICAL_ATTACHMENT_CONSENT_REQUIRED_REASON,
          },
        );

        processed.push(updated);
        continue;
      }

      // Medical attachment with existing consent — ensure it is properly categorised.
      const updated = await this.chatAttachmentsService.applyTurnStageUpdate(
        state.userId,
        attachment.id,
        {
          category: "medical_document",
          categorySource: attachment.categorySource === "user_selected"
            ? "user_selected"
            : "mime_inferred",
          retentionPolicy: resolveAttachmentRetentionPolicyFromBehavior(
            "medical_document",
            state.behavior,
          ),
          failureReason: null,
        },
      );

      processed.push(updated);
    }

    state.attachments = processed;
  }

  private buildBoundedMetadata(
    attachments: readonly ChatAttachmentRecord[],
  ): BoundedAttachmentMetadata[] {
    return attachments.map((attachment) => ({
      refId: attachment.id,
      category: attachment.category,
      mimeType: attachment.mimeType,
      consentState: resolveConsentState(attachment),
      storageRef: attachment.storageKey,
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

function resolveConsentState(
  attachment: ChatAttachmentRecord,
): BoundedAttachmentMetadata["consentState"] {
  if (attachment.status === "needs_consent") {
    return "needs_consent";
  }

  if (attachment.consent != null) {
    return "granted";
  }

  return "none";
}
