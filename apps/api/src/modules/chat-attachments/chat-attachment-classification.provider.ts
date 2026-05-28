import type {
  ChatAttachmentClassificationResult,
  ClassifiedChatAttachmentCategory,
} from "@health/types";

export interface ChatAttachmentClassificationRequest {
  message: string;
  filename: string;
  mimeType: string;
  attachmentId: string;
  content: Buffer;
  userSelectedCategory: ClassifiedChatAttachmentCategory | null;
  hasMedicalConsent: boolean;
}

export interface ChatAttachmentClassificationProvider {
  classify(
    request: ChatAttachmentClassificationRequest,
  ): Promise<ChatAttachmentClassificationResult>;
}
