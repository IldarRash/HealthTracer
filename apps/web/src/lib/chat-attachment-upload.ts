import type {
  ChatAttachmentCategory,
  ChatAttachmentCategorySource,
  CreateChatAttachmentInput,
} from "@health/types";
import { readFileAsBase64 } from "./document-upload";
import {
  isUserSelectedChatAttachmentDraft,
  normalizeAttachmentMimeType,
  validateChatAttachmentFile,
  type ChatComposerAttachmentDraft,
} from "./chat-attachment-ui-state";
import { DOCUMENT_CONSENT_VERSION } from "./documents-ui-state";

export type BuildChatAttachmentUploadPayloadResult =
  | { ok: true; payload: CreateChatAttachmentInput }
  | { ok: false; message: string };

export function resolveChatAttachmentUploadCategory(input: {
  category: ChatAttachmentCategory;
  categorySource: ChatAttachmentCategorySource;
}): {
  category: ChatAttachmentCategory;
  categorySource: ChatAttachmentCategorySource;
} {
  if (input.categorySource === "user_selected" && input.category !== "unclassified") {
    return {
      category: input.category,
      categorySource: "user_selected",
    };
  }

  return {
    category: "unclassified",
    categorySource:
      input.categorySource === "mime_inferred" ? "mime_inferred" : "default_unclassified",
  };
}

export async function buildChatAttachmentUploadPayload(input: {
  draft: ChatComposerAttachmentDraft;
  threadId?: string;
}): Promise<BuildChatAttachmentUploadPayloadResult> {
  const { draft } = input;
  const validationError = validateChatAttachmentFile(draft.file, draft.category);

  if (validationError) {
    return { ok: false, message: validationError };
  }

  const mimeType = normalizeAttachmentMimeType(draft.file);
  const fileContentBase64 = await readFileAsBase64(draft.file);
  const { category: uploadCategory, categorySource } = resolveChatAttachmentUploadCategory({
    category: draft.category,
    categorySource: draft.categorySource,
  });

  const base: CreateChatAttachmentInput = {
    category: uploadCategory,
    categorySource,
    filename: draft.file.name.slice(0, 200),
    mimeType,
    fileContentBase64,
    ...(input.threadId ? { threadId: input.threadId } : {}),
    consentVersion: DOCUMENT_CONSENT_VERSION,
  };

  if (isUserSelectedChatAttachmentDraft(draft) && draft.category === "medical_document") {
    if (!draft.documentTitle.trim()) {
      return { ok: false, message: "Add a document title before uploading a wellness document." };
    }

    if (draft.consentScopes.length === 0) {
      return {
        ok: false,
        message: "Medical document attachments require explicit consent scopes before storage.",
      };
    }

    return {
      ok: true,
      payload: {
        ...base,
        category: "medical_document",
        categorySource: "user_selected",
        consentScopes: [...draft.consentScopes],
        documentType: draft.documentType,
        documentTitle: draft.documentTitle.trim(),
      },
    };
  }

  if (isUserSelectedChatAttachmentDraft(draft)) {
    return {
      ok: true,
      payload: {
        ...base,
        category: draft.category,
        categorySource: "user_selected",
      },
    };
  }

  return { ok: true, payload: base };
}
