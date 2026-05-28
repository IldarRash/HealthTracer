import type {
  ChatAttachmentClassificationResult,
  ChatAttachmentRecord,
  ClassifiedChatAttachmentCategory,
} from "@health/types";
import {
  buildUserSelectedAttachmentClassification,
  chatAttachmentClassificationResultSchema,
  isTrustedUserSelectedChatAttachmentUpload,
  isUnclassifiedChatAttachmentCategory,
} from "@health/types";
import { Injectable } from "@nestjs/common";
import type { ChatAttachmentCategorySource } from "@health/types";
import type { ChatAttachmentClassificationProvider } from "./chat-attachment-classification.provider.js";
import { createChatAttachmentClassificationProvider } from "./chat-attachment-classification.factory.js";
import {
  resolveAttachmentClassificationProviderId,
  withAttachmentClassificationMetadata,
} from "./chat-attachment-classification-metadata.js";
import { resolveOpenAiClassificationMethod } from "./chat-attachment-classification-content.js";
import { DevChatAttachmentClassificationProvider } from "./dev-chat-attachment-classification.provider.js";

const MAX_MESSAGE_CONTEXT_CHARS = 500;

@Injectable()
export class ChatAttachmentClassifierService {
  private readonly providerId: string;

  constructor(
    private readonly provider: ChatAttachmentClassificationProvider = createChatAttachmentClassificationProvider(),
  ) {
    this.providerId = resolveAttachmentClassificationProviderId(this.provider);
  }

  async classify(input: {
    message: string;
    attachment: Pick<
      ChatAttachmentRecord,
      "id" | "filename" | "mimeType" | "category" | "consent" | "storageKey"
    >;
    content: Buffer;
    categorySource?: ChatAttachmentCategorySource;
  }): Promise<ChatAttachmentClassificationResult> {
    const boundedMessage = input.message.trim().slice(0, MAX_MESSAGE_CONTEXT_CHARS);
    const hasMedicalConsent = Boolean(input.attachment.consent?.consentScopes?.length);

    if (
      isTrustedUserSelectedChatAttachmentUpload({
        category: input.attachment.category,
        categorySource: input.categorySource,
        consentScopes: input.attachment.consent?.consentScopes,
      })
    ) {
      return chatAttachmentClassificationResultSchema.parse(
        withAttachmentClassificationMetadata({
          result: buildUserSelectedAttachmentClassification({
            category: input.attachment.category as ClassifiedChatAttachmentCategory,
            message: boundedMessage,
            hasMedicalConsent,
          }),
          providerId: this.providerId,
          method: "user_selected",
        }),
      );
    }

    const providerResult = await this.provider.classify({
      message: boundedMessage,
      filename: input.attachment.filename,
      mimeType: input.attachment.mimeType,
      attachmentId: input.attachment.id,
      content: input.content,
      userSelectedCategory: null,
      hasMedicalConsent,
    });

    return chatAttachmentClassificationResultSchema.parse(
      withAttachmentClassificationMetadata({
        result: providerResult,
        providerId: this.providerId,
        method: this.resolveProviderClassificationMethod(input.attachment.mimeType),
      }),
    );
  }

  shouldBypassProviderForAttachment(
    attachment: Pick<ChatAttachmentRecord, "category" | "categorySource" | "consent">,
  ): boolean {
    if (isUnclassifiedChatAttachmentCategory(attachment.category)) {
      return false;
    }

    return isTrustedUserSelectedChatAttachmentUpload({
      category: attachment.category,
      categorySource: attachment.categorySource,
      consentScopes: attachment.consent?.consentScopes,
    });
  }

  private resolveProviderClassificationMethod(
    mimeType: string,
  ): "dev_heuristic" | "vision" | "text_excerpt" | "metadata_only" {
    if (this.provider instanceof DevChatAttachmentClassificationProvider) {
      return "dev_heuristic";
    }

    return resolveOpenAiClassificationMethod(mimeType);
  }
}
