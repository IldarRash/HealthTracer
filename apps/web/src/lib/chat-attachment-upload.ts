import type {
  ChatAttachmentCategory,
  CreateChatAttachmentInput,
  DocumentConsentScope,
} from "@health/types";
import { readFileAsBase64 } from "./document-upload";
import {
  normalizeAttachmentMimeType,
  validateChatAttachmentFile,
  type ChatComposerAttachmentDraft,
} from "./chat-attachment-ui-state";
import { DOCUMENT_CONSENT_VERSION } from "./documents-ui-state";

export type BuildChatAttachmentUploadPayloadResult =
  | { ok: true; payload: CreateChatAttachmentInput }
  | { ok: false; message: string };

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

  const uploadCategory: ChatAttachmentCategory =
    draft.category === "medical_document"
      ? "medical_document"
      : draft.category === "unclassified"
        ? "unclassified"
        : draft.category;

  const base: CreateChatAttachmentInput = {
    category: uploadCategory,
    filename: draft.file.name.slice(0, 200),
    mimeType,
    fileContentBase64,
    ...(input.threadId ? { threadId: input.threadId } : {}),
    consentVersion: DOCUMENT_CONSENT_VERSION,
  };

  if (draft.category === "medical_document") {
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
        consentScopes: [...draft.consentScopes],
        documentType: draft.documentType,
        documentTitle: draft.documentTitle.trim(),
      },
    };
  }

  return { ok: true, payload: base };
}

export function resolveRecognizeConsentScopes(
  category: ChatAttachmentCategory,
  consentScopes: readonly DocumentConsentScope[],
): DocumentConsentScope[] | undefined {
  if (category !== "medical_document") {
    return undefined;
  }

  return consentScopes.length > 0 ? [...consentScopes] : undefined;
}
