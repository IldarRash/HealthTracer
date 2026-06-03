import type { CreateChatAttachmentInput } from "@health/types";
import { readFileAsBase64 } from "./document-upload";
import {
  normalizeAttachmentMimeType,
  validateChatAttachmentFile,
  type ChatComposerAttachmentDraft,
} from "./chat-attachment-ui-state";

export type BuildChatAttachmentUploadPayloadResult =
  | { ok: true; payload: CreateChatAttachmentInput }
  | { ok: false; message: string };

export async function buildChatAttachmentUploadPayload(input: {
  draft: ChatComposerAttachmentDraft;
  threadId?: string;
}): Promise<BuildChatAttachmentUploadPayloadResult> {
  const { draft } = input;
  const validationError = validateChatAttachmentFile(draft.file);

  if (validationError) {
    return { ok: false, message: validationError };
  }

  const mimeType = normalizeAttachmentMimeType(draft.file);
  const fileContentBase64 = await readFileAsBase64(draft.file);

  const payload: CreateChatAttachmentInput = {
    filename: draft.file.name.slice(0, 200),
    mimeType,
    fileContentBase64,
    ...(input.threadId ? { threadId: input.threadId } : {}),
  };

  return { ok: true, payload };
}
