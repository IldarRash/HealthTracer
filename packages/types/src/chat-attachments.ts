import { z } from "zod";
import { isoDateTimeSchema } from "./dates.js";
import {
  documentConsentScopeSchema,
  documentTypeSchema,
  SUPPORTED_HEALTH_DOCUMENT_MIME_TYPES,
  type DocumentConsentScope,
} from "./documents.js";
import {
  foodPhotoAnalysisResultSchema,
  nutritionConfidenceBandSchema,
  type LogNutritionIncidentProposalPayload,
} from "./nutrition-incidents.js";
import { workoutExerciseSchema } from "./workouts.js";

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

/** Medical chat attachments include PDF/text plus screenshot uploads pending manual review. */
export const CHAT_MEDICAL_DOCUMENT_MIME_TYPES = [
  ...SUPPORTED_HEALTH_DOCUMENT_MIME_TYPES,
  ...CHAT_FOOD_PHOTO_MIME_TYPES,
] as const;

export const CHAT_WORKOUT_ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
] as const;

export type ChatFoodPhotoMimeType = (typeof CHAT_FOOD_PHOTO_MIME_TYPES)[number];
export type ChatWorkoutAttachmentMimeType = (typeof CHAT_WORKOUT_ATTACHMENT_MIME_TYPES)[number];

export const MAX_CHAT_FOOD_PHOTO_BYTES = 10_000_000;
export const MAX_CHAT_WORKOUT_ATTACHMENT_BYTES = 10_000_000;

export const chatFoodPhotoMimeTypeSchema = z.enum(CHAT_FOOD_PHOTO_MIME_TYPES);
export const chatWorkoutAttachmentMimeTypeSchema = z.enum(CHAT_WORKOUT_ATTACHMENT_MIME_TYPES);

export const recognitionConfidenceBandSchema = nutritionConfidenceBandSchema;

export type RecognitionConfidenceBand = z.infer<typeof recognitionConfidenceBandSchema>;

export const recognitionProvenanceSchema = z
  .object({
    source: z.string().min(1).max(80),
    providerId: z.string().min(1).max(80),
    recognitionId: z.string().uuid(),
    confidence: recognitionConfidenceBandSchema.optional(),
  })
  .strict();

export type RecognitionProvenance = z.infer<typeof recognitionProvenanceSchema>;

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

export const foodPhotoRecognitionEnvelopeSchema = z
  .object({
    category: z.literal("food_photo"),
    attachmentRefId: z.string().uuid(),
    analysis: foodPhotoAnalysisResultSchema,
    provenance: recognitionProvenanceSchema,
  })
  .strict();

export type FoodPhotoRecognitionEnvelope = z.infer<typeof foodPhotoRecognitionEnvelopeSchema>;

export const medicalDocumentRecognitionEnvelopeSchema = z
  .object({
    category: z.literal("medical_document"),
    attachmentRefId: z.string().uuid(),
    documentId: z.string().uuid(),
    documentType: documentTypeSchema,
    title: z.string().min(1).max(160),
    parseStatus: z.enum(["uploaded", "processing", "parsed", "summary_ready", "failed"]),
    summarySnippet: z.string().min(1).max(500).nullable(),
    reviewStatus: z.enum(["pending_review", "approved", "rejected"]).nullable(),
    documentReviewPath: z.string().min(1).max(240).nullable(),
    consentScopes: z.array(documentConsentScopeSchema).min(1),
    provenance: recognitionProvenanceSchema,
    wellnessContextOnlyNotice: z.string().min(1).max(240),
  })
  .strict();

export type MedicalDocumentRecognitionEnvelope = z.infer<
  typeof medicalDocumentRecognitionEnvelopeSchema
>;

export const workoutAttachmentSuggestedIntentSchema = z.enum([
  "create_workout_plan",
  "adapt_workout_plan",
  "log_session_context",
  "catalog_exercise_candidate",
]);

export type WorkoutAttachmentSuggestedIntent = z.infer<
  typeof workoutAttachmentSuggestedIntentSchema
>;

export const workoutAttachmentRecognitionEnvelopeSchema = z
  .object({
    category: z.literal("workout_attachment"),
    attachmentRefId: z.string().uuid(),
    attachmentKind: z.enum(["exercise_photo", "plan_screenshot", "training_file"]),
    sessionLabel: z.string().min(1).max(160).nullable(),
    sessionDate: isoDateTimeSchema.nullable(),
    exercises: z.array(workoutExerciseSchema).max(20),
    suggestedIntent: workoutAttachmentSuggestedIntentSchema,
    planDraftTitle: z.string().min(1).max(160).nullable(),
    provenance: recognitionProvenanceSchema,
    manualFallbackNotice: z.string().min(1).max(500).nullable(),
  })
  .strict();

export type WorkoutAttachmentRecognitionEnvelope = z.infer<
  typeof workoutAttachmentRecognitionEnvelopeSchema
>;

export const chatAttachmentRecognitionEnvelopeSchema = z.discriminatedUnion("category", [
  foodPhotoRecognitionEnvelopeSchema,
  medicalDocumentRecognitionEnvelopeSchema,
  workoutAttachmentRecognitionEnvelopeSchema,
]);

export type ChatAttachmentRecognitionEnvelope = z.infer<
  typeof chatAttachmentRecognitionEnvelopeSchema
>;

export const chatAttachmentRecordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  threadId: z.string().uuid().nullable(),
  messageId: z.string().uuid().nullable(),
  category: chatAttachmentCategorySchema,
  status: chatAttachmentStatusSchema,
  filename: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(120),
  fileSizeBytes: z.number().int().nonnegative(),
  storageKey: z.string().min(1).max(500).nullable(),
  linkedDocumentId: z.string().uuid().nullable(),
  linkedImageRefId: z.string().uuid().nullable(),
  consent: chatAttachmentConsentSchema.nullable(),
  recognition: chatAttachmentRecognitionEnvelopeSchema.nullable(),
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
    category: chatAttachmentCategorySchema.default("unclassified"),
    filename: z.string().min(1).max(200),
    mimeType: z.string().min(1).max(120),
    fileContentBase64: z.string().min(1),
    consentScopes: z.array(documentConsentScopeSchema).min(1).max(5).optional(),
    consentVersion: z.string().min(1).max(40).default("v1"),
    documentType: documentTypeSchema.optional(),
    documentTitle: z.string().min(1).max(160).optional(),
  })
  .superRefine((input, ctx) => {
    const mimeError = getChatAttachmentMimeTypeError(input.category, input.mimeType);

    if (mimeError) {
      ctx.addIssue({
        code: "custom",
        message: mimeError,
        path: ["mimeType"],
      });
    }

    if (input.category === "unclassified" && input.consentScopes?.length) {
      ctx.addIssue({
        code: "custom",
        message: "Consent scopes apply only after a medical document category is assigned.",
        path: ["consentScopes"],
      });
    }

    if (input.category === "medical_document") {
      if (!input.consentScopes?.includes("upload_storage")) {
        ctx.addIssue({
          code: "custom",
          message: "Medical document attachments require upload_storage consent.",
          path: ["consentScopes"],
        });
      }

      if (!input.documentType) {
        ctx.addIssue({
          code: "custom",
          message: "documentType is required for medical document attachments.",
          path: ["documentType"],
        });
      }

      if (!input.documentTitle) {
        ctx.addIssue({
          code: "custom",
          message: "documentTitle is required for medical document attachments.",
          path: ["documentTitle"],
        });
      }
    }
  });

export type CreateChatAttachmentInput = z.input<typeof createChatAttachmentSchema>;

export const recognizeChatAttachmentSchema = z
  .object({
    consentScopes: z.array(documentConsentScopeSchema).min(1).max(5).optional(),
    consentVersion: z.string().min(1).max(40).optional(),
  })
  .strict();

export type RecognizeChatAttachmentInput = z.infer<typeof recognizeChatAttachmentSchema>;

export const grantChatAttachmentConsentSchema = z
  .object({
    consentScopes: z.array(documentConsentScopeSchema).min(1).max(5),
    consentVersion: z.string().min(1).max(40).default("v1"),
  })
  .strict();

export type GrantChatAttachmentConsentInput = z.infer<typeof grantChatAttachmentConsentSchema>;

export const chatAttachmentRecognitionResponseSchema = z.object({
  attachment: chatAttachmentRecordSchema,
  proposalCandidates: z.array(
    z.object({
      intent: z.string().min(1).max(80),
      targetDomain: z.string().min(1).max(40),
      title: z.string().min(1).max(160),
      reason: z.string().min(1).max(1000),
      proposedChanges: z.unknown(),
      attachmentRefId: z.string().uuid(),
    }),
  ),
});

export type ChatAttachmentRecognitionResponse = z.infer<
  typeof chatAttachmentRecognitionResponseSchema
>;

export const chatAttachmentOutcomeSchema = z.object({
  attachmentRefId: z.string().uuid(),
  category: chatAttachmentCategorySchema,
  status: chatAttachmentStatusSchema,
  recognition: chatAttachmentRecognitionEnvelopeSchema.nullable(),
  proposalCandidateCount: z.number().int().nonnegative().max(5),
});

export type ChatAttachmentOutcome = z.infer<typeof chatAttachmentOutcomeSchema>;

const UNSAFE_RECOGNITION_SUMMARY_PATTERNS = [
  /\bdiagnos(e|is|ed|ing)\b/i,
  /\bprescri(be|ption|bed|bing)\b/i,
  /\btreat(ment|ing|ed)\b/i,
  /\bmedication\b/i,
  /\bcure\b/i,
  /\bclinical(?:ly)?\b/i,
  /\bpatholog(y|ical)\b/i,
  /\bdisorder\b/i,
  /\bmedical advice\b/i,
  /\byou have\b/i,
  /\bdefinitely\b/i,
  /\bconfirmed\b/i,
];

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

export const CHAT_PROVISIONAL_UPLOAD_MIME_TYPES = [
  ...new Set([
    ...CHAT_FOOD_PHOTO_MIME_TYPES,
    ...SUPPORTED_HEALTH_DOCUMENT_MIME_TYPES,
    ...CHAT_WORKOUT_ATTACHMENT_MIME_TYPES,
  ]),
] as const;

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
  recognition: ChatAttachmentRecognitionEnvelope | null;
}): boolean {
  if (input.recognition) {
    return false;
  }

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

export function containsUnsafeRecognitionSummaryLanguage(text: string): boolean {
  return UNSAFE_RECOGNITION_SUMMARY_PATTERNS.some((pattern) => pattern.test(text));
}

export function assertRecognitionProviderIsolation(input: {
  category: ChatAttachmentCategory;
  payload: Record<string, unknown>;
}): void {
  const forbiddenKeysByCategory: Record<
    Exclude<ChatAttachmentCategory, "unclassified">,
    readonly string[]
  > = {
    food_photo: [
      "documentId",
      "documentText",
      "profile",
      "wellbeingNotes",
      "medicalContext",
      "workoutContext",
    ],
    medical_document: ["imageRef", "mealContext", "workoutContext", "profile"],
    workout_attachment: ["documentId", "documentText", "profile", "mealContext", "medicalContext"],
  };

  if (input.category === "unclassified") {
    return;
  }

  for (const key of forbiddenKeysByCategory[input.category]) {
    if (key in input.payload) {
      throw new Error(
        `${input.category} recognition must not include cross-category context key "${key}".`,
      );
    }
  }
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

export function buildMedicalDocumentReviewPath(documentId: string): string {
  return `/profile#documents?documentId=${documentId}`;
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

export function getChatAttachmentRecognitionEligibilityErrors(
  attachment: Pick<
    ChatAttachmentRecord,
    "category" | "mimeType" | "consent" | "retentionPolicy" | "expiresAt"
  >,
): string[] {
  const errors: string[] = [];

  if (attachment.category === "unclassified") {
    errors.push("Classify the attachment during chat send before running standalone recognition.");
    return errors;
  }

  if (isChatAttachmentExpired(attachment)) {
    errors.push("Attachment recognition reference has expired.");
  }

  const mimeError = getChatAttachmentMimeTypeError(attachment.category, attachment.mimeType);

  if (mimeError) {
    errors.push(mimeError);
  }

  errors.push(
    ...getMedicalAttachmentConsentErrors(attachment.category, attachment.consent?.consentScopes),
  );

  return errors;
}

export function sanitizeMedicalRecognitionForClient(
  recognition: MedicalDocumentRecognitionEnvelope,
): MedicalDocumentRecognitionEnvelope {
  if (recognition.reviewStatus === "approved") {
    return {
      ...recognition,
      documentReviewPath:
        recognition.documentReviewPath ?? buildMedicalDocumentReviewPath(recognition.documentId),
    };
  }

  return {
    ...recognition,
    summarySnippet: null,
    documentReviewPath: buildMedicalDocumentReviewPath(recognition.documentId),
  };
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
        recognition: null,
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

export function buildNutritionIncidentProposalFromFoodPhotoRecognition(input: {
  recognition: FoodPhotoRecognitionEnvelope;
  incidentDateTime: string;
}): LogNutritionIncidentProposalPayload["imageRefs"] {
  return [{ id: input.recognition.attachmentRefId }];
}
