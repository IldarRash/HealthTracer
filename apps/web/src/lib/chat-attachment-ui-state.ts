import type {
  ChatAttachmentCategory,
  ChatAttachmentOutcome,
  ChatAttachmentRecord,
  ChatAttachmentStatus,
  DocumentConsentScope,
  DocumentType,
} from "@health/types";
import {
  CHAT_FOOD_PHOTO_MIME_TYPES,
  CHAT_WORKOUT_ATTACHMENT_MIME_TYPES,
  getChatAttachmentMimeTypeError,
  getChatAttachmentSizeError,
  getMedicalAttachmentConsentErrors,
  isChatAttachmentPendingMessageFirstSend,
  isChatAttachmentSendEligibleStatus,
  SUPPORTED_HEALTH_DOCUMENT_MIME_TYPES,
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
  "Attachments are classified when you send your message. Food photos, wellness documents, and training files are handled separately during recognition.";

export const CHAT_ATTACHMENT_CATEGORY_HINT =
  "Attach a photo or file, add a short message if helpful, then send. Recognition runs after send.";

export const MESSAGE_FIRST_ATTACHMENT_COPY =
  "This attachment will be classified and recognized after you send your message. Add context in your message when helpful (for example, “second meal” or “leg day”).";

export const OPTIONAL_CATEGORY_CORRECTION_COPY =
  "Optional: correct the category before send if you already know what this file is.";

export const AMBIGUOUS_IMAGE_ATTACHMENT_COPY =
  "This image could be a food photo or workout file. Send it with your message, or optionally pick a category below before send.";

export const FOOD_OR_WORKOUT_RECOGNIZE_COPY =
  "Optional: pick Food photo or Workout/training if you want to correct classification before send.";

export const MEDICAL_ATTACHMENT_WELLNESS_NOTICE =
  "Wellness documents are used for coaching context only. They are not reviewed for medical advice or care instructions.";

export const FOOD_PHOTO_LOW_CONFIDENCE_COPY =
  "Meal estimates may be approximate. Review and edit the nutrition proposal before applying, or describe your meal in a message.";

export const WORKOUT_ATTACHMENT_MANUAL_FALLBACK_COPY =
  "Workout recognition may not capture every detail. Describe your session in a message, or review any proposal card before applying. Plans are not changed until you accept a proposal.";

export const MEDICAL_ATTACHMENT_NEEDS_REVIEW_COPY =
  "Your document summary and signals need review in Profile before they can inform coaching context.";

export const CHAT_ATTACHMENT_UNSUPPORTED_COPY =
  "This file type is not supported for chat attachments. Choose a supported format or describe the item in a message.";

export const CHAT_ATTACHMENT_FAILED_COPY =
  "Recognition could not finish. Remove the attachment and try again, or describe what you meant in a message.";

export const CHAT_ATTACHMENT_ACCEPT =
  "image/jpeg,image/png,image/webp,application/pdf,text/plain,.jpg,.jpeg,.png,.webp,.pdf,.txt";

export const CHAT_ATTACHMENT_CATEGORY_OPTIONS: readonly {
  value: ChatAttachmentCategory;
  label: string;
  description: string;
}[] = [
  {
    value: "food_photo",
    label: "Food photo",
    description: "Meal or snack image for nutrition logging.",
  },
  {
    value: "medical_document",
    label: "Wellness document",
    description: "PDF or text health document with explicit consent.",
  },
  {
    value: "workout_attachment",
    label: "Workout or training",
    description: "Exercise photo, plan screenshot, or training file.",
  },
] as const;

export type ChatComposerAttachmentDraft = {
  localId: string;
  file: File;
  category: ChatAttachmentCategory;
  previewUrl: string | null;
  localValidationError: string | null;
  documentType: DocumentType;
  documentTitle: string;
  consentScopes: DocumentConsentScope[];
  attachmentId: string | null;
  record: ChatAttachmentRecord | null;
  phase:
    | "local"
    | "uploading"
    | "uploaded"
    | "needs_consent"
    | "recognizing"
    | "ready"
    | "error";
  error: string | null;
  proposalCandidateCount: number;
};

export function chatAttachmentCategoryLabel(category: ChatAttachmentCategory): string {
  if (category === "unclassified") {
    return "Attachment";
  }

  return (
    CHAT_ATTACHMENT_CATEGORY_OPTIONS.find((option) => option.value === category)?.label ??
    category
  );
}

export function isLikelyMedicalDocumentFile(file: Pick<File, "name" | "type">): boolean {
  const mime = normalizeAttachmentMimeType(file);
  return (SUPPORTED_HEALTH_DOCUMENT_MIME_TYPES as readonly string[]).includes(mime);
}

export function formatChatAttachmentFileSize(bytes: number): string {
  return formatDocumentFileSize(bytes);
}

export function isAmbiguousFoodOrWorkoutImage(file: Pick<File, "name" | "type">): boolean {
  const mime = normalizeAttachmentMimeType(file);

  if (!mime.startsWith("image/")) {
    return false;
  }

  const inFood = (CHAT_FOOD_PHOTO_MIME_TYPES as readonly string[]).includes(mime);
  const inWorkout = (CHAT_WORKOUT_ATTACHMENT_MIME_TYPES as readonly string[]).includes(mime);

  return inFood && inWorkout;
}

export function shouldAutoProcessChatAttachmentOnSelect(
  draft: Pick<ChatComposerAttachmentDraft, "file" | "category" | "localValidationError">,
): boolean {
  if (draft.localValidationError) {
    return false;
  }

  if (draft.category === "medical_document") {
    return false;
  }

  return draft.category === "unclassified" || draft.category === "food_photo" || draft.category === "workout_attachment";
}

export function guessChatAttachmentCategory(file: Pick<File, "name" | "type">): ChatAttachmentCategory {
  const mime = normalizeAttachmentMimeType(file);

  if ((CHAT_FOOD_PHOTO_MIME_TYPES as readonly string[]).includes(mime)) {
    return "food_photo";
  }

  if ((SUPPORTED_HEALTH_DOCUMENT_MIME_TYPES as readonly string[]).includes(mime)) {
    return "medical_document";
  }

  if ((CHAT_WORKOUT_ATTACHMENT_MIME_TYPES as readonly string[]).includes(mime)) {
    return "workout_attachment";
  }

  return "workout_attachment";
}

export function normalizeAttachmentMimeType(file: Pick<File, "name" | "type">): string {
  const normalizedType = file.type.trim().toLowerCase();

  if (normalizedType) {
    return normalizedType;
  }

  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "jpg" || extension === "jpeg") {
    return "image/jpeg";
  }

  if (extension === "png") {
    return "image/png";
  }

  if (extension === "webp") {
    return "image/webp";
  }

  if (extension === "pdf") {
    return "application/pdf";
  }

  if (extension === "txt") {
    return "text/plain";
  }

  return normalizedType;
}

export function validateChatAttachmentFile(
  file: File,
  category: ChatAttachmentCategory,
): string | null {
  const mimeType = normalizeAttachmentMimeType(file);
  const mimeError = getChatAttachmentMimeTypeError(category, mimeType);

  if (mimeError) {
    return mimeError;
  }

  const sizeError = getChatAttachmentSizeError(category, file.size);

  if (sizeError) {
    return sizeError;
  }

  return null;
}

export function canSubmitMedicalAttachmentDraft(
  draft: Pick<
    ChatComposerAttachmentDraft,
    "category" | "documentTitle" | "documentType" | "consentScopes"
  >,
): boolean {
  if (draft.category !== "medical_document") {
    return true;
  }

  if (!draft.documentTitle.trim()) {
    return false;
  }

  return getMedicalAttachmentConsentErrors(draft.category, draft.consentScopes).length === 0;
}

export function getMedicalAttachmentDraftErrors(
  draft: Pick<
    ChatComposerAttachmentDraft,
    "category" | "documentTitle" | "documentType" | "consentScopes"
  >,
): string[] {
  if (draft.category !== "medical_document") {
    return [];
  }

  const errors = [...getMedicalAttachmentConsentErrors(draft.category, draft.consentScopes)];

  if (!draft.documentTitle.trim()) {
    errors.push("Add a document title before uploading a wellness document.");
  }

  return errors;
}

export function createChatComposerAttachmentDraft(file: File): ChatComposerAttachmentDraft {
  const category: ChatAttachmentCategory = isLikelyMedicalDocumentFile(file)
    ? "medical_document"
    : "unclassified";
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
    category,
    previewUrl,
    localValidationError: validateChatAttachmentFile(file, category),
    documentType: "other",
    documentTitle: file.name.replace(/\.[^.]+$/, "").slice(0, 160),
    consentScopes: [],
    attachmentId: null,
    record: null,
    phase: "local",
    error: null,
    proposalCandidateCount: 0,
  };
}

export function revokeChatAttachmentPreviewUrl(draft: ChatComposerAttachmentDraft): void {
  if (draft.previewUrl && typeof URL !== "undefined" && URL.revokeObjectURL) {
    URL.revokeObjectURL(draft.previewUrl);
  }
}

export function resolveAttachmentDisplayStatus(
  draft: ChatComposerAttachmentDraft,
): ChatAttachmentStatus | "local" | "uploading" | "recognizing" {
  if (draft.phase === "local") {
    return "local";
  }

  if (draft.phase === "uploading") {
    return "uploading";
  }

  if (draft.phase === "recognizing") {
    return "recognizing";
  }

  if (draft.phase === "uploaded") {
    return "queued";
  }

  if (draft.phase === "needs_consent") {
    return "needs_consent";
  }

  return draft.record?.status ?? "queued";
}

export function chatAttachmentStatusLabel(
  status: ChatAttachmentStatus | "local" | "uploading" | "recognizing",
): string {
  switch (status) {
    case "local":
      return "Selected";
    case "queued":
      return "Queued";
    case "uploading":
      return "Uploading";
    case "recognizing":
      return "Recognizing";
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
  status: ChatAttachmentStatus | "local" | "uploading" | "recognizing",
): NonNullable<BadgeProps["tone"]> {
  switch (status) {
    case "local":
      return "neutral";
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

  if (draft.phase === "local" || draft.phase === "uploading" || draft.phase === "recognizing") {
    return false;
  }

  const blocked: ChatAttachmentStatus[] = ["unsupported", "failed", "needs_consent"];
  if (blocked.includes(record.status)) {
    return false;
  }

  if (isChatAttachmentSendEligibleStatus(record.status)) {
    return true;
  }

  return isChatAttachmentPendingMessageFirstSend({
    category: record.category,
    status: record.status,
    recognition: record.recognition,
  });
}

export function isChatComposerAttachmentProcessing(draft: ChatComposerAttachmentDraft): boolean {
  return (
    draft.phase === "uploading" ||
    draft.phase === "recognizing" ||
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

  if (
    input.attachments.some(
      (attachment) =>
        attachment.phase === "needs_consent" || attachment.record?.status === "needs_consent",
    )
  ) {
    return false;
  }

  if (input.attachments.some((attachment) => attachment.localValidationError)) {
    return false;
  }

  return Boolean(trimmed) || sendReadyAttachments.length > 0;
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
    const categoryLabel =
      attachment.record?.category && attachment.record.category !== "unclassified"
        ? chatAttachmentCategoryLabel(attachment.record.category)
        : chatAttachmentCategoryLabel(attachment.category);
    return `[Attachment: ${categoryLabel} — ${attachment.file.name}]`;
  }

  return `[${ready.length} attachments: ${ready.map((attachment) => attachment.file.name).join(", ")}]`;
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

export function applyChatAttachmentCategoryChange(
  draft: ChatComposerAttachmentDraft,
  category: ChatAttachmentCategory,
): ChatComposerAttachmentDraft {
  return {
    ...draft,
    category,
    localValidationError: validateChatAttachmentFile(draft.file, category),
    consentScopes: [],
    attachmentId: null,
    record: null,
    phase: "local",
    error: null,
    proposalCandidateCount: 0,
  };
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

export type ChatAttachmentOutcomeDisplay = ChatAttachmentOutcome & {
  mealContextLabel?: string | null;
};

export function resolveAttachmentOutcomeConfidenceLabel(
  outcome: ChatAttachmentOutcome,
): string | null {
  const confidence = outcome.recognition?.provenance.confidence;

  if (!confidence) {
    return null;
  }

  switch (confidence) {
    case "high":
      return "High confidence";
    case "medium":
      return "Medium confidence";
    case "low":
      return "Low confidence";
  }
}

export function enrichAttachmentOutcomesWithProposalContext(
  outcomes: readonly ChatAttachmentOutcome[],
  proposals: readonly { intent: string; proposedChanges: unknown }[],
): ChatAttachmentOutcomeDisplay[] {
  return outcomes.map((outcome) => {
    if (outcome.category !== "food_photo") {
      return outcome;
    }

    for (const proposal of proposals) {
      if (proposal.intent !== "log_nutrition_incident") {
        continue;
      }

      const payload = proposal.proposedChanges as {
        attachmentRefId?: string;
        mealContextLabel?: string;
      };

      if (
        payload.attachmentRefId === outcome.attachmentRefId &&
        payload.mealContextLabel?.trim()
      ) {
        return {
          ...outcome,
          mealContextLabel: payload.mealContextLabel.trim(),
        };
      }
    }

    return outcome;
  });
}

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
    const manualNotice = outcome.recognition?.category === "workout_attachment"
      ? outcome.recognition.manualFallbackNotice
      : null;

    if (outcome.status === "low_confidence" || manualNotice) {
      return manualNotice ?? WORKOUT_ATTACHMENT_MANUAL_FALLBACK_COPY;
    }
  }

  if (outcome.category === "medical_document" && outcome.status === "needs_review") {
    return MEDICAL_ATTACHMENT_NEEDS_REVIEW_COPY;
  }

  return null;
}

export function resolveMedicalDocumentProfileHref(documentId: string | null | undefined): string {
  if (!documentId) {
    return "/profile#documents";
  }

  return `/profile#documents`;
}

export function summarizeAttachmentOutcomesForMessage(
  outcomes: readonly ChatAttachmentOutcome[],
): string {
  if (outcomes.length === 0) {
    return "";
  }

  const labels = outcomes.map(
    (outcome) => `${chatAttachmentCategoryLabel(outcome.category)} (${outcome.status})`,
  );

  return `Processed ${outcomes.length} attachment${outcomes.length === 1 ? "" : "s"}: ${labels.join("; ")}`;
}
