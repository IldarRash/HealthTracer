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
