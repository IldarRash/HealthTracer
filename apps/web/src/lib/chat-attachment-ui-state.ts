import type {
  ChatAttachmentCategory,
  ChatAttachmentOutcome,
  ChatAttachmentRecord,
  ChatAttachmentStatus,
  DocumentConsentScope,
} from "@health/types";
import type { ChatMessageAttachmentPreview } from "./chat-message-attachments.js";
import {
  getChatAttachmentMimeTypeError,
  getChatAttachmentSizeError,
  inferProvisionalAttachmentCategory,
  isChatAttachmentPendingMessageFirstSend,
  isChatAttachmentSendEligibleStatus,
} from "@health/types";
import type { BadgeProps } from "../components/ui";
import {
  DOCUMENT_CONSENT_SCOPE_OPTIONS,
  DOCUMENT_CONSENT_VERSION,
  DOCUMENT_TYPE_OPTIONS,
  documentTypeLabel,
} from "./documents-ui-state";
import { formatDocumentFileSize } from "./document-upload";

export const MAX_CHAT_COMPOSER_ATTACHMENTS = 5;

export const CHAT_ATTACHMENT_PRIVACY_NOTICE =
  "Attachments are shared as context for your coaching session. Food photos, wellness documents, and training files are read directly by the AI coach to help personalise your guidance.";

export const CHAT_ATTACHMENT_CATEGORY_HINT =
  "Attach an image or document file (PDF, text, markdown) and add a short message if helpful. The AI coach reads the attachment as context for your coaching session.";

export const MESSAGE_FIRST_ATTACHMENT_COPY =
  "This attachment will be shared as coaching context when you send your message. Adding a short note in your message helps the coach understand it (for example, “second meal” or “leg day”).";

export const MEDICAL_ATTACHMENT_WELLNESS_NOTICE =
  "Wellness documents are used for coaching context only. They are not reviewed for medical advice or care instructions.";

export const FOOD_PHOTO_LOW_CONFIDENCE_COPY =
  "Meal estimates may be approximate. Review and edit the nutrition proposal before applying, or describe your meal in a message.";

export const WORKOUT_ATTACHMENT_MANUAL_FALLBACK_COPY =
  "Your workout attachment was read as coaching context. For best results, describe your session in a message. Plans are not changed until you accept a proposal.";

export const MEDICAL_ATTACHMENT_NEEDS_REVIEW_COPY =
  "Your document summary and signals need review in Profile before they can inform coaching context.";

export const CHAT_ATTACHMENT_UNSUPPORTED_COPY =
  "This file type is not supported for chat attachments. Choose a supported format or describe the item in a message.";

export const CHAT_ATTACHMENT_FAILED_COPY =
  "This attachment could not be processed. Remove it and try again, or describe what you meant in a message.";

/**
 * Accepted MIME types and extensions for chat attachment uploads.
 * Images: jpeg, png, webp.
 * Document files: PDF, plain text, markdown.
 */
export const CHAT_ATTACHMENT_ACCEPT =
  "image/jpeg,image/png,image/webp,application/pdf,text/plain,text/markdown,.jpg,.jpeg,.png,.webp,.pdf,.txt,.md,.markdown";

export type ChatComposerAttachmentDraft = {
  localId: string;
  file: File;
  previewUrl: string | null;
  localValidationError: string | null;
  attachmentId: string | null;
  record: ChatAttachmentRecord | null;
  phase: "local" | "uploading" | "uploaded" | "ready" | "error";
  error: string | null;
};

export function chatAttachmentCategoryLabel(category: ChatAttachmentCategory): string {
  if (category === "unclassified") {
    return "Attachment";
  }

  const LABELS: Partial<Record<ChatAttachmentCategory, string>> = {
    food_photo: "Food photo",
    medical_document: "Wellness document",
    workout_attachment: "Workout or training",
    document_file: "Document file",
  };

  return LABELS[category] ?? category;
}

export function buildChatAttachmentConsentScopeItems(
  selectedScopes: readonly DocumentConsentScope[],
) {
  return DOCUMENT_CONSENT_SCOPE_OPTIONS.map((option) => ({
    id: option.scope,
    label: option.required ? `${option.label} (required)` : option.label,
    description: option.description,
    enabled: selectedScopes.includes(option.scope),
  }));
}

export function toggleChatAttachmentConsentScope(
  scopes: readonly DocumentConsentScope[],
  scope: DocumentConsentScope,
): DocumentConsentScope[] {
  if (scope === "upload_storage") {
    return scopes.includes(scope)
      ? scopes.filter((item) => item !== scope)
      : [...scopes, scope];
  }

  if (scopes.includes(scope)) {
    return scopes.filter((item) => item !== scope);
  }

  return [...scopes, scope];
}

export { DOCUMENT_CONSENT_VERSION, DOCUMENT_TYPE_OPTIONS, documentTypeLabel };

export function formatChatAttachmentFileSize(bytes: number): string {
  return formatDocumentFileSize(bytes);
}

export function normalizeAttachmentMimeType(file: Pick<File, "name" | "type">): string {
  const extension = file.name.split(".").pop()?.toLowerCase();

  // Extension-based normalization takes precedence for types where browsers report
  // incorrect or empty values. Notably: .md files often arrive as "" or "text/plain".
  if (extension === "md" || extension === "markdown") {
    return "text/markdown";
  }

  if (extension === "pdf") {
    return "application/pdf";
  }

  if (extension === "txt") {
    return "text/plain";
  }

  const normalizedType = file.type.trim().toLowerCase();

  if (normalizedType) {
    return normalizedType;
  }

  if (extension === "jpg" || extension === "jpeg") {
    return "image/jpeg";
  }

  if (extension === "png") {
    return "image/png";
  }

  if (extension === "webp") {
    return "image/webp";
  }

  return normalizedType;
}

export function validateChatAttachmentFile(file: File): string | null {
  const mimeType = normalizeAttachmentMimeType(file);
  const mimeError = getChatAttachmentMimeTypeError("unclassified", mimeType);

  if (mimeError) {
    return mimeError;
  }

  // Use the category-inferred size cap: document_file → 5 MB, images → 10 MB.
  // getChatAttachmentSizeError handles per-category caps in one place so there
  // is a single source of truth for size limits (no duplicated 5 MB check here).
  const category = inferProvisionalAttachmentCategory(mimeType);
  const sizeError = getChatAttachmentSizeError(category, file.size);

  if (sizeError) {
    return sizeError;
  }

  return null;
}

export function createChatComposerAttachmentDraft(file: File): ChatComposerAttachmentDraft {
  const mimeType = normalizeAttachmentMimeType(file);
  const previewUrl =
    mimeType.startsWith("image/") &&
    typeof URL !== "undefined" &&
    typeof URL.createObjectURL === "function" &&
    typeof Blob !== "undefined" &&
    file instanceof Blob
      ? URL.createObjectURL(file)
      : null;

  return {
    localId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    previewUrl,
    localValidationError: validateChatAttachmentFile(file),
    attachmentId: null,
    record: null,
    phase: "local",
    error: null,
  };
}

export function revokeChatAttachmentPreviewUrl(draft: ChatComposerAttachmentDraft): void {
  if (draft.previewUrl && typeof URL !== "undefined" && URL.revokeObjectURL) {
    URL.revokeObjectURL(draft.previewUrl);
  }
}

export function resolveAttachmentDisplayStatus(
  draft: ChatComposerAttachmentDraft,
): ChatAttachmentStatus | "local" | "uploading" {
  if (draft.phase === "local") {
    return "local";
  }

  if (draft.phase === "uploading") {
    return "uploading";
  }

  if (draft.phase === "uploaded") {
    return "queued";
  }

  return draft.record?.status ?? "queued";
}

export function chatAttachmentStatusLabel(
  status: ChatAttachmentStatus | "local" | "uploading",
): string {
  switch (status) {
    case "local":
      return "Selected";
    case "queued":
      return "Queued";
    // "recognizing" is a valid ChatAttachmentStatus from the backend contract; the local draft
    // phase no longer includes it, but a record can carry it — treat it as a transient state.
    case "uploading":
    case "recognizing":
      return "Processing";
    case "needs_consent":
      return "Consent required";
    case "needs_review":
      return "Needs review";
    case "ready":
      return "Ready";
    case "low_confidence":
      return "Low confidence";
    case "unsupported":
      return "Unsupported";
    case "failed":
      return "Failed";
  }
}

export function chatAttachmentStatusBadgeTone(
  status: ChatAttachmentStatus | "local" | "uploading",
): NonNullable<BadgeProps["tone"]> {
  switch (status) {
    case "local":
      return "neutral";
    // "recognizing" is a valid ChatAttachmentStatus from the backend contract; treat it as pending.
    case "queued":
    case "uploading":
    case "recognizing":
      return "pending";
    case "needs_consent":
      return "info";
    case "needs_review":
      return "info";
    case "ready":
      return "success";
    case "low_confidence":
      return "info";
    case "unsupported":
    case "failed":
      return "error";
  }
}

export function isChatAttachmentSendEligible(
  record: ChatAttachmentRecord | null,
  draft: ChatComposerAttachmentDraft,
): boolean {
  if (!record || !draft.attachmentId) {
    return false;
  }

  if (draft.phase === "error" || draft.localValidationError) {
    return false;
  }

  if (draft.phase === "local" || draft.phase === "uploading") {
    return false;
  }

  const blocked: ChatAttachmentStatus[] = ["unsupported", "failed", "needs_consent"];
  if (blocked.includes(record.status)) {
    return false;
  }

  if (isChatAttachmentSendEligibleStatus(record.status)) {
    return true;
  }

  // B3 removal: recognition field removed from ChatAttachmentRecord.
  return isChatAttachmentPendingMessageFirstSend({
    category: record.category,
    status: record.status,
  });
}

export function isChatComposerAttachmentProcessing(draft: ChatComposerAttachmentDraft): boolean {
  return (
    draft.phase === "uploading" ||
    draft.record?.status === "uploading" ||
    draft.record?.status === "recognizing"
  );
}

export function canSendChatComposer(input: {
  draftText: string;
  attachments: readonly ChatComposerAttachmentDraft[];
  isSendPending: boolean;
}): boolean {
  if (input.isSendPending) {
    return false;
  }

  const trimmed = input.draftText.trim();
  const sendReadyAttachments = input.attachments.filter((attachment) =>
    isChatAttachmentSendEligible(attachment.record, attachment),
  );

  if (sendReadyAttachments.length === 0 && !trimmed) {
    return false;
  }

  if (input.attachments.some((attachment) => attachment.phase === "local")) {
    return false;
  }

  if (input.attachments.some((attachment) => isChatComposerAttachmentProcessing(attachment))) {
    return false;
  }

  if (input.attachments.some((attachment) => attachment.localValidationError)) {
    return false;
  }

  return Boolean(trimmed) || sendReadyAttachments.length > 0;
}

export function buildOptimisticAttachmentDisplays(
  attachments: readonly ChatComposerAttachmentDraft[],
): ChatMessageAttachmentPreview[] {
  return attachments
    .filter((attachment) => isChatAttachmentSendEligible(attachment.record, attachment))
    .flatMap((attachment) =>
      attachment.attachmentId
        ? [
            {
              attachmentRefId: attachment.attachmentId,
              filename: attachment.file.name,
              mimeType: attachment.file.type || "application/octet-stream",
              previewUrl: attachment.previewUrl,
              // Optimistic previews use a local blob URL; server metadata fields
              // are not available until the persisted message is returned.
              category: null,
              status: null,
              hasViewableContent: false,
            } satisfies ChatMessageAttachmentPreview,
          ]
        : [],
    );
}

export function buildOptimisticAttachmentSummary(
  attachments: readonly ChatComposerAttachmentDraft[],
): string {
  const ready = attachments.filter((attachment) =>
    isChatAttachmentSendEligible(attachment.record, attachment),
  );

  if (ready.length === 0) {
    return "";
  }

  if (ready.length === 1) {
    const attachment = ready[0]!;
    return `[Attachment: ${attachment.file.name}]`;
  }

  return `[${ready.length} attachments: ${ready.map((attachment) => attachment.file.name).join(", ")}]`;
}

export type ChatAttachmentOutcomeDisplay = ChatAttachmentOutcome;

export function resolveAttachmentOutcomeFallbackCopy(
  outcome: ChatAttachmentOutcome,
): string | null {
  if (outcome.status === "unsupported") {
    return CHAT_ATTACHMENT_UNSUPPORTED_COPY;
  }

  if (outcome.status === "failed") {
    return CHAT_ATTACHMENT_FAILED_COPY;
  }

  if (outcome.status === "low_confidence" && outcome.category === "food_photo") {
    return FOOD_PHOTO_LOW_CONFIDENCE_COPY;
  }

  if (outcome.category === "workout_attachment") {
    // B3 removal: recognition field removed from ChatAttachmentOutcome.
    // manualFallbackNotice was part of the deleted workoutAttachmentRecognitionEnvelopeSchema.
    if (outcome.status === "low_confidence") {
      return WORKOUT_ATTACHMENT_MANUAL_FALLBACK_COPY;
    }
  }

  if (outcome.category === "medical_document" && outcome.status === "needs_review") {
    return MEDICAL_ATTACHMENT_NEEDS_REVIEW_COPY;
  }

  return null;
}

