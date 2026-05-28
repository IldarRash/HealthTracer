import type { ClassifiedChatAttachmentCategory } from "./chat-attachment-classification.js";
import type {
  ChatAttachmentCategory,
  ChatAttachmentCategorySource,
} from "./chat-attachments.js";
import { isUnclassifiedChatAttachmentCategory } from "./chat-attachments.js";

export type { ChatAttachmentCategorySource };
export { chatAttachmentCategorySourceSchema } from "./chat-attachments.js";

export function isTrustedUserSelectedChatAttachmentUpload(input: {
  category: ChatAttachmentCategory;
  categorySource?: ChatAttachmentCategorySource;
  consentScopes?: readonly string[] | undefined;
}): boolean {
  if (isUnclassifiedChatAttachmentCategory(input.category)) {
    return false;
  }

  if (input.categorySource === "user_selected") {
    return true;
  }

  if (input.categorySource === "mime_inferred") {
    return false;
  }

  if (input.category === "medical_document") {
    return Boolean(input.consentScopes?.includes("upload_storage"));
  }

  return false;
}

export function resolveCreateAttachmentCategorySource(input: {
  categorySource?: ChatAttachmentCategorySource;
}): ChatAttachmentCategorySource {
  return input.categorySource ?? "default_unclassified";
}

export function resolveProvisionalUploadCategorySource(input: {
  dispositionCategory: ChatAttachmentCategory;
  inputCategorySource?: ChatAttachmentCategorySource;
}): ChatAttachmentCategorySource {
  if (isUnclassifiedChatAttachmentCategory(input.dispositionCategory)) {
    return resolveCreateAttachmentCategorySource({
      categorySource: input.inputCategorySource,
    });
  }

  return "ai_classified";
}

export function resolveSendTimeAttachmentCategory(input: {
  attachmentCategory: ChatAttachmentCategory;
  attachmentCategorySource?: ChatAttachmentCategorySource;
  consentScopes?: readonly string[] | undefined;
  classificationCategory: ClassifiedChatAttachmentCategory;
}): ClassifiedChatAttachmentCategory {
  if (
    isTrustedUserSelectedChatAttachmentUpload({
      category: input.attachmentCategory,
      categorySource: input.attachmentCategorySource,
      consentScopes: input.consentScopes,
    })
  ) {
    return input.attachmentCategory as ClassifiedChatAttachmentCategory;
  }

  return input.classificationCategory;
}

export function resolveSendTimeCategorySource(input: {
  previousCategorySource?: ChatAttachmentCategorySource;
  resolvedCategory: ChatAttachmentCategory;
}): ChatAttachmentCategorySource {
  if (input.previousCategorySource === "user_selected") {
    return "user_selected";
  }

  if (isUnclassifiedChatAttachmentCategory(input.resolvedCategory)) {
    return input.previousCategorySource ?? "default_unclassified";
  }

  return "ai_classified";
}
