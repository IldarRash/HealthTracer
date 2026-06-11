import type {
  AttachmentBehaviorConfig,
  AttachmentTurnStage,
  ChatAttachmentRecord,
} from "@health/types";
import {
  DEFAULT_ATTACHMENT_TURN_STAGE_ORDER,
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
   * Applies retention disposition for image attachments.
   *
   * Attachments are images-only and context-only. No consent gate, no medical
   * purge, no category reclassification. Each attachment receives the configured
   * retention policy for its category and is passed through unchanged otherwise.
   */
  private async runApplyUploadDisposition(state: TurnStageState): Promise<void> {
    const processed: ChatAttachmentRecord[] = [];

    for (const attachment of state.attachments) {
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

      processed.push(attachment);
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
      filename: attachment.filename,
    }));
  }

  private buildOutcomes(attachments: readonly ChatAttachmentRecord[]) {
    return attachments.map((attachment) => ({
      attachmentRefId: attachment.id,
      category: attachment.category,
      status: attachment.status,
      // recognition field removed (B3 removal, C4 cluster)
    }));
  }
}

function resolveConsentState(
  attachment: ChatAttachmentRecord,
): BoundedAttachmentMetadata["consentState"] {
  // The legacy needs_consent status was produced by the removed pre-upload
  // classification/consent gate (resolveProvisionalUploadDisposition). Uploads are
  // now always created with status "queued"; no runtime path produces needs_consent.
  // Legacy DB columns remain readable but are not used for runtime branching.
  if (attachment.consent != null) {
    return "granted";
  }

  return "none";
}
