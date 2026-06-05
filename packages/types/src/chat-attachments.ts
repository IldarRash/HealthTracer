import { z } from "zod";
import { isoDateTimeSchema } from "./dates.js";
import {
  documentConsentScopeSchema,
  documentTypeSchema,
  type DocumentConsentScope,
} from "./documents.js";
import {
  nutritionConfidenceBandSchema,
} from "./nutrition-incidents.js";

export const chatAttachmentCategorySchema = z.enum([
  "unclassified",
  "food_photo",
  "medical_document",
  "workout_attachment",
]);

export const classifiedChatAttachmentCategorySchema = chatAttachmentCategorySchema.exclude([
  "unclassified",
]);

export type ChatAttachmentCategory = z.infer<typeof chatAttachmentCategorySchema>;

export const chatAttachmentStatusSchema = z.enum([
  "queued",
  "uploading",
  "recognizing",
  "needs_consent",
  "needs_review",
  "ready",
  "low_confidence",
  "unsupported",
  "failed",
]);

export type ChatAttachmentStatus = z.infer<typeof chatAttachmentStatusSchema>;

export const chatAttachmentRetentionPolicySchema = z.enum([
  "ephemeral_recognition",
  "document_consent_rules",
  "session_linked",
]);

export type ChatAttachmentRetentionPolicy = z.infer<
  typeof chatAttachmentRetentionPolicySchema
>;

export const CHAT_FOOD_PHOTO_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/**
 * Chat attachment image MIME types accepted for medical context.
 * Images only for now — PDF/text document flow is deferred.
 */
export const CHAT_MEDICAL_DOCUMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const CHAT_WORKOUT_ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type ChatFoodPhotoMimeType = (typeof CHAT_FOOD_PHOTO_MIME_TYPES)[number];
export type ChatWorkoutAttachmentMimeType = (typeof CHAT_WORKOUT_ATTACHMENT_MIME_TYPES)[number];

export const MAX_CHAT_FOOD_PHOTO_BYTES = 10_000_000;
export const MAX_CHAT_WORKOUT_ATTACHMENT_BYTES = 10_000_000;

export const chatFoodPhotoMimeTypeSchema = z.enum(CHAT_FOOD_PHOTO_MIME_TYPES);
export const chatWorkoutAttachmentMimeTypeSchema = z.enum(CHAT_WORKOUT_ATTACHMENT_MIME_TYPES);

/**
 * Alias kept for backward-compat reads of historical chat_attachment rows that may
 * reference a confidence band. chat-attachment-classification.ts was removed in round-5
 * (no live consumer remained after service-layer removal).
 */
export const recognitionConfidenceBandSchema = nutritionConfidenceBandSchema;

export type RecognitionConfidenceBand = z.infer<typeof recognitionConfidenceBandSchema>;

export const chatAttachmentRefSchema = z
  .object({
    id: z.string().uuid(),
    category: classifiedChatAttachmentCategorySchema,
    filename: z.string().min(1).max(200),
    mimeType: z.string().min(1).max(120),
    fileSizeBytes: z.number().int().nonnegative().max(MAX_CHAT_FOOD_PHOTO_BYTES),
    storageKey: z.string().min(1).max(500).optional(),
  })
  .strict();

export type ChatAttachmentRef = z.infer<typeof chatAttachmentRefSchema>;

export const chatAttachmentConsentSchema = z
  .object({
    consentScopes: z.array(documentConsentScopeSchema).min(1).max(5),
    consentVersion: z.string().min(1).max(40),
    consentGrantedAt: isoDateTimeSchema,
    documentType: documentTypeSchema.optional(),
    documentTitle: z.string().min(1).max(160).optional(),
  })
  .strict();

export type ChatAttachmentConsent = z.infer<typeof chatAttachmentConsentSchema>;

/**
 * Persistence status literal kept for the safety-invariant spec.
 * Only "attachment_context_only" is a valid new-write value — the legacy
 * "saved_health_document" was removed with the recognition envelope family (B3).
 */
export const medicalDocumentPersistenceStatusSchema = z.literal("attachment_context_only");

export type MedicalDocumentPersistenceStatus = z.infer<
  typeof medicalDocumentPersistenceStatusSchema
>;

export const chatAttachmentCategorySourceSchema = z.enum([
  "default_unclassified",
  "mime_inferred",
  "user_selected",
  "ai_classified",
]);

export type ChatAttachmentCategorySource = z.infer<typeof chatAttachmentCategorySourceSchema>;

export const chatAttachmentRecordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  threadId: z.string().uuid().nullable(),
  messageId: z.string().uuid().nullable(),
  category: chatAttachmentCategorySchema,
  categorySource: chatAttachmentCategorySourceSchema.default("default_unclassified"),
  status: chatAttachmentStatusSchema,
  filename: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(120),
  fileSizeBytes: z.number().int().nonnegative(),
  storageKey: z.string().min(1).max(500).nullable(),
  linkedDocumentId: z.string().uuid().nullable(),
  linkedImageRefId: z.string().uuid().nullable(),
  consent: chatAttachmentConsentSchema.nullable(),
  // recognition DB column stays readable (disposable-DB; to be dropped in a later schema pass)
  // but is no longer included in the domain record type (B3 removal, C4 cluster).
  failureReason: z.string().min(1).max(240).nullable(),
  retentionPolicy: chatAttachmentRetentionPolicySchema,
  expiresAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type ChatAttachmentRecord = z.infer<typeof chatAttachmentRecordSchema>;

export const createChatAttachmentSchema = z
  .object({
    threadId: z.string().uuid().optional(),
    filename: z.string().min(1).max(200),
    mimeType: z.string().min(1).max(120),
    fileContentBase64: z.string().min(1),
  })
  .superRefine((input, ctx) => {
    const mimeError = getChatAttachmentMimeTypeError("unclassified", input.mimeType);

    if (mimeError) {
      ctx.addIssue({
        code: "custom",
        message: mimeError,
        path: ["mimeType"],
      });
    }
  });

export type CreateChatAttachmentInput = z.input<typeof createChatAttachmentSchema>;

export const chatAttachmentOutcomeSchema = z.object({
  attachmentRefId: z.string().uuid(),
  category: chatAttachmentCategorySchema,
  status: chatAttachmentStatusSchema,
  // recognition field removed (B3 removal, C4 cluster); DB column stays readable but unused.
});

export type ChatAttachmentOutcome = z.infer<typeof chatAttachmentOutcomeSchema>;

/** Image MIME types eligible for inline chat transcript previews. */
export const CHAT_ATTACHMENT_IMAGE_MIME_TYPES = CHAT_FOOD_PHOTO_MIME_TYPES;

export function isChatAttachmentImageMimeType(mimeType: string): boolean {
  return (CHAT_ATTACHMENT_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType);
}

export const chatMessageAttachmentDisplaySchema = z
  .object({
    attachmentRefId: z.string().uuid(),
    filename: z.string().min(1).max(200),
    mimeType: z.string().min(1).max(120),
  })
  .strict();

export type ChatMessageAttachmentDisplay = z.infer<typeof chatMessageAttachmentDisplaySchema>;

/**
 * Display-only projection of a linked chat attachment on a persisted message.
 * MUST NOT contain bytes, storageKey, consent, document text, or recognition payloads.
 * hasViewableContent is the server-computed flag for whether the /content endpoint can serve this attachment.
 */
export const chatMessageAttachmentMetaSchema = z
  .object({
    attachmentRefId: z.string().uuid(),
    filename: z.string().min(1).max(200),
    mimeType: z.string().min(1).max(120),
    category: chatAttachmentCategorySchema,
    status: chatAttachmentStatusSchema,
    hasViewableContent: z.boolean(),
  })
  .strict();

export type ChatMessageAttachmentMeta = z.infer<typeof chatMessageAttachmentMetaSchema>;

export function parseChatMessageAttachmentRefIds(
  metadata: Record<string, unknown>,
): string[] {
  const raw = metadata.attachmentRefIds;

  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter((value): value is string => typeof value === "string");
}

const CATEGORY_MIME_ALLOWLIST: Record<
  Exclude<ChatAttachmentCategory, "unclassified">,
  readonly string[]
> = {
  food_photo: CHAT_FOOD_PHOTO_MIME_TYPES,
  medical_document: CHAT_MEDICAL_DOCUMENT_MIME_TYPES,
  workout_attachment: CHAT_WORKOUT_ATTACHMENT_MIME_TYPES,
};

const CATEGORY_SIZE_LIMIT: Record<
  Exclude<ChatAttachmentCategory, "unclassified">,
  number
> = {
  food_photo: MAX_CHAT_FOOD_PHOTO_BYTES,
  medical_document: 5_000_000,
  workout_attachment: MAX_CHAT_WORKOUT_ATTACHMENT_BYTES,
};

const CATEGORY_RETENTION: Record<
  Exclude<ChatAttachmentCategory, "unclassified">,
  ChatAttachmentRetentionPolicy
> = {
  food_photo: "ephemeral_recognition",
  medical_document: "document_consent_rules",
  workout_attachment: "ephemeral_recognition",
};

/**
 * Image MIME types accepted for all provisional chat attachment uploads.
 * Images only for now — PDF/text document flow is deferred.
 */
export const CHAT_PROVISIONAL_UPLOAD_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const satisfies readonly string[];

export const MAX_CHAT_PROVISIONAL_ATTACHMENT_BYTES = 10_000_000;

export function getChatAttachmentRetentionPolicy(
  category: ChatAttachmentCategory,
): ChatAttachmentRetentionPolicy {
  if (category === "unclassified") {
    return "ephemeral_recognition";
  }

  return CATEGORY_RETENTION[category];
}

export function getProvisionalAttachmentMimeTypeError(mimeType: string): string | null {
  if (!(CHAT_PROVISIONAL_UPLOAD_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return `Unsupported MIME type "${mimeType}" for provisional chat attachments.`;
  }

  return null;
}

export function getProvisionalAttachmentSizeError(fileSizeBytes: number): string | null {
  if (fileSizeBytes <= 0) {
    return "Attachment content is empty.";
  }

  if (fileSizeBytes > MAX_CHAT_PROVISIONAL_ATTACHMENT_BYTES) {
    return `Attachment exceeds the ${MAX_CHAT_PROVISIONAL_ATTACHMENT_BYTES} byte provisional upload limit.`;
  }

  return null;
}

export function isUnclassifiedChatAttachmentCategory(
  category: ChatAttachmentCategory,
): category is "unclassified" {
  return category === "unclassified";
}

export function isChatAttachmentPendingMessageFirstSend(input: {
  category: ChatAttachmentCategory;
  status: ChatAttachmentStatus;
}): boolean {
  return input.status === "queued" || input.status === "uploading";
}

export function getChatAttachmentMimeTypeError(
  category: ChatAttachmentCategory,
  mimeType: string,
): string | null {
  if (category === "unclassified") {
    return getProvisionalAttachmentMimeTypeError(mimeType);
  }

  const allowlist = CATEGORY_MIME_ALLOWLIST[category];

  if (!allowlist.includes(mimeType)) {
    return `Unsupported MIME type "${mimeType}" for ${category} attachments.`;
  }

  return null;
}

export function getChatAttachmentSizeError(
  category: ChatAttachmentCategory,
  fileSizeBytes: number,
): string | null {
  if (category === "unclassified") {
    return getProvisionalAttachmentSizeError(fileSizeBytes);
  }

  const limit = CATEGORY_SIZE_LIMIT[category];

  if (fileSizeBytes <= 0) {
    return "Attachment content is empty.";
  }

  if (fileSizeBytes > limit) {
    return `Attachment exceeds the ${limit} byte limit for ${category}.`;
  }

  return null;
}

export function hasRequiredMedicalAttachmentConsent(
  scopes: readonly DocumentConsentScope[],
): boolean {
  return scopes.includes("upload_storage");
}

export function getMedicalAttachmentConsentErrors(
  category: ChatAttachmentCategory,
  consentScopes: readonly DocumentConsentScope[] | undefined,
): string[] {
  if (category !== "medical_document") {
    return [];
  }

  if (!consentScopes || consentScopes.length === 0) {
    return ["Medical document attachments require explicit consent scopes before storage."];
  }

  if (!hasRequiredMedicalAttachmentConsent(consentScopes)) {
    return ["Medical document attachments require upload_storage consent."];
  }

  return [];
}

export type OwnedChatAttachmentRef = {
  id: string;
  userId: string;
  category: ChatAttachmentCategory;
  status: ChatAttachmentStatus;
  linkedDocumentId: string | null;
  linkedImageRefId: string | null;
  retentionPolicy: ChatAttachmentRetentionPolicy;
  expiresAt: string | null;
};

export const CHAT_ATTACHMENT_SEND_ELIGIBLE_STATUSES = [
  "ready",
  "low_confidence",
  "needs_review",
] as const satisfies readonly ChatAttachmentStatus[];

export function isChatAttachmentSendEligibleStatus(status: ChatAttachmentStatus): boolean {
  return (CHAT_ATTACHMENT_SEND_ELIGIBLE_STATUSES as readonly ChatAttachmentStatus[]).includes(
    status,
  );
}

export function isChatAttachmentExpired(
  attachment: Pick<OwnedChatAttachmentRef, "expiresAt" | "retentionPolicy">,
  now: Date = new Date(),
): boolean {
  if (attachment.retentionPolicy !== "ephemeral_recognition" || !attachment.expiresAt) {
    return false;
  }

  return new Date(attachment.expiresAt).getTime() <= now.getTime();
}

export function getChatAttachmentOwnershipErrors(
  attachmentRefIds: readonly string[],
  ownedAttachments: readonly OwnedChatAttachmentRef[],
): string[] {
  const errors: string[] = [];
  const ownedById = new Map(ownedAttachments.map((attachment) => [attachment.id, attachment]));

  for (const [index, attachmentRefId] of attachmentRefIds.entries()) {
    const owned = ownedById.get(attachmentRefId);

    if (!owned) {
      errors.push(
        `attachmentRefIds[${index}]: Attachment reference was not found for this user.`,
      );
      continue;
    }

    if (isChatAttachmentExpired(owned)) {
      errors.push(
        `attachmentRefIds[${index}]: Attachment recognition reference has expired.`,
      );
    }
  }

  return errors;
}

export function getChatAttachmentSendEligibilityErrors(
  attachmentRefIds: readonly string[],
  ownedAttachments: readonly OwnedChatAttachmentRef[],
): string[] {
  const errors: string[] = [];
  const ownedById = new Map(ownedAttachments.map((attachment) => [attachment.id, attachment]));

  for (const [index, attachmentRefId] of attachmentRefIds.entries()) {
    const owned = ownedById.get(attachmentRefId);

    if (
      !owned ||
      isChatAttachmentSendEligibleStatus(owned.status) ||
      isChatAttachmentPendingMessageFirstSend({
        category: owned.category,
        status: owned.status,
      })
    ) {
      continue;
    }

    if (owned.status === "unsupported" || owned.status === "failed") {
      errors.push(
        `attachmentRefIds[${index}]: Attachment is not eligible for chat reference (${owned.status}).`,
      );
      continue;
    }

    errors.push(
      `attachmentRefIds[${index}]: Attachment status "${owned.status}" is not eligible for chat send.`,
    );
  }

  return errors;
}

export function getChatAttachmentProposalRefErrors(input: {
  attachmentRefId: string | undefined;
  ownedAttachments: readonly OwnedChatAttachmentRef[];
  expectedCategory?: ChatAttachmentCategory;
  requireReadyStatus?: boolean;
}): string[] {
  if (!input.attachmentRefId) {
    return [];
  }

  const owned = input.ownedAttachments.find((attachment) => attachment.id === input.attachmentRefId);

  if (!owned) {
    return ["proposedChanges.attachmentRefId: Attachment reference was not found for this user."];
  }

  if (input.expectedCategory && owned.category !== input.expectedCategory) {
    return [
      `proposedChanges.attachmentRefId: Expected ${input.expectedCategory} attachment but found ${owned.category}.`,
    ];
  }

  if (isChatAttachmentExpired(owned)) {
    return ["proposedChanges.attachmentRefId: Attachment recognition reference has expired."];
  }

  if (input.requireReadyStatus) {
    if (!isChatAttachmentSendEligibleStatus(owned.status)) {
      return [
        `proposedChanges.attachmentRefId: Attachment status "${owned.status}" is not proposal-ready.`,
      ];
    }
  }

  return [];
}

