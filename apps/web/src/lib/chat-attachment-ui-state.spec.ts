import { describe, expect, it } from "vitest";
import type { ChatAttachmentOutcome, ChatAttachmentRecord } from "@health/types";
import {
  buildOptimisticAttachmentDisplays,
  canSendChatComposer,
  CHAT_ATTACHMENT_ACCEPT,
  CHAT_ATTACHMENT_FAILED_COPY,
  CHAT_ATTACHMENT_PRIVACY_NOTICE,
  CHAT_ATTACHMENT_UNSUPPORTED_COPY,
  chatAttachmentStatusLabel,
  createChatComposerAttachmentDraft,
  FOOD_PHOTO_LOW_CONFIDENCE_COPY,
  isChatAttachmentSendEligible,
  isChatComposerAttachmentProcessing,
  MEDICAL_ATTACHMENT_NEEDS_REVIEW_COPY,
  MEDICAL_ATTACHMENT_WELLNESS_NOTICE,
  MESSAGE_FIRST_ATTACHMENT_COPY,
  normalizeAttachmentMimeType,
  resolveAttachmentDisplayStatus,
  resolveAttachmentOutcomeFallbackCopy,
  validateChatAttachmentFile,
  WORKOUT_ATTACHMENT_MANUAL_FALLBACK_COPY,
  type ChatComposerAttachmentDraft,
} from "./chat-attachment-ui-state.js";

function createMockFile(name: string, type: string, size = 1024): File {
  return {
    name,
    type,
    size,
  } as File;
}

function createReadyRecord(
  overrides: Partial<ChatAttachmentRecord> = {},
): ChatAttachmentRecord {
  return {
    id: "a1000001-0000-4000-8000-000000000001",
    userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
    threadId: "24b19287-75b8-4a3e-9c10-691908479405",
    messageId: null,
    category: "food_photo",
    categorySource: "default_unclassified",
    status: "ready",
    filename: "meal.jpg",
    mimeType: "image/jpeg",
    fileSizeBytes: 1024,
    storageKey: "local://attachments/meal.jpg",
    linkedDocumentId: null,
    linkedImageRefId: "a1000001-0000-4000-8000-000000000001",
    consent: null,
    recognition: null,
    failureReason: null,
    retentionPolicy: "ephemeral_recognition",
    expiresAt: null,
    createdAt: "2026-05-22T12:00:00.000Z",
    updatedAt: "2026-05-22T12:00:00.000Z",
    ...overrides,
  };
}

describe("chat attachment UI state", () => {
  it("creates draft with no category fields — images only", () => {
    const mealPhoto = createMockFile("meal.jpg", "image/jpeg");
    const draft = createChatComposerAttachmentDraft(mealPhoto);

    expect(draft.phase).toBe("local");
    expect(draft.localValidationError).toBeNull();
    expect(draft.previewUrl).toBeNull(); // JSDOM has no URL.createObjectURL
  });

  it("rejects non-image MIME types at validation", () => {
    const pdfFile = createMockFile("lab.pdf", "application/pdf");
    const error = validateChatAttachmentFile(pdfFile);
    expect(error).toMatch(/Unsupported MIME/);

    const txtFile = createMockFile("plan.txt", "text/plain");
    const txtError = validateChatAttachmentFile(txtFile);
    expect(txtError).toMatch(/Unsupported MIME/);
  });

  it("accepts image/jpeg, image/png, image/webp and rejects everything else", () => {
    expect(validateChatAttachmentFile(createMockFile("a.jpg", "image/jpeg"))).toBeNull();
    expect(validateChatAttachmentFile(createMockFile("a.png", "image/png"))).toBeNull();
    expect(validateChatAttachmentFile(createMockFile("a.webp", "image/webp"))).toBeNull();
    expect(validateChatAttachmentFile(createMockFile("a.pdf", "application/pdf"))).not.toBeNull();
    expect(validateChatAttachmentFile(createMockFile("a.txt", "text/plain"))).not.toBeNull();
  });

  it("CHAT_ATTACHMENT_ACCEPT contains only image types", () => {
    expect(CHAT_ATTACHMENT_ACCEPT).toContain("image/jpeg");
    expect(CHAT_ATTACHMENT_ACCEPT).toContain("image/png");
    expect(CHAT_ATTACHMENT_ACCEPT).toContain("image/webp");
    expect(CHAT_ATTACHMENT_ACCEPT).not.toContain("application/pdf");
    expect(CHAT_ATTACHMENT_ACCEPT).not.toContain("text/plain");
    expect(CHAT_ATTACHMENT_ACCEPT).not.toContain(".pdf");
    expect(CHAT_ATTACHMENT_ACCEPT).not.toContain(".txt");
  });

  it("normalizes file extensions when browser MIME is missing", () => {
    expect(normalizeAttachmentMimeType(createMockFile("meal.jpeg", ""))).toBe("image/jpeg");
    expect(normalizeAttachmentMimeType(createMockFile("photo.png", ""))).toBe("image/png");
    expect(normalizeAttachmentMimeType(createMockFile("img.webp", ""))).toBe("image/webp");
  });

  it("blocks send while attachments are local or actively processing", () => {
    const localDraft = createChatComposerAttachmentDraft(createMockFile("meal.jpg", "image/jpeg"));

    expect(
      canSendChatComposer({
        draftText: "",
        attachments: [localDraft],
        isSendPending: false,
      }),
    ).toBe(false);

    const uploadingDraft = {
      ...localDraft,
      phase: "uploading" as const,
    };

    expect(
      canSendChatComposer({
        draftText: "Second meal",
        attachments: [uploadingDraft],
        isSendPending: false,
      }),
    ).toBe(false);
  });

  it("allows send for queued uploaded attachments", () => {
    const queuedDraft = {
      ...createChatComposerAttachmentDraft(createMockFile("meal.jpg", "image/jpeg")),
      attachmentId: "a1000001-0000-4000-8000-000000000001",
      record: createReadyRecord({
        category: "unclassified",
        status: "queued",
        recognition: null,
      }),
      phase: "uploaded" as const,
    };

    expect(isChatAttachmentSendEligible(queuedDraft.record, queuedDraft)).toBe(true);
    expect(
      canSendChatComposer({
        draftText: "This was my second meal",
        attachments: [queuedDraft],
        isSendPending: false,
      }),
    ).toBe(true);
    expect(
      canSendChatComposer({
        draftText: "",
        attachments: [queuedDraft],
        isSendPending: false,
      }),
    ).toBe(true);
  });

  it("marks recognized and low-confidence attachment records as send-ready", () => {
    const draft = {
      ...createChatComposerAttachmentDraft(createMockFile("meal.jpg", "image/jpeg")),
      attachmentId: "a1000001-0000-4000-8000-000000000001",
      phase: "ready" as const,
    };

    expect(isChatAttachmentSendEligible(createReadyRecord({ status: "ready" }), draft)).toBe(true);
    expect(
      isChatAttachmentSendEligible(createReadyRecord({ status: "low_confidence" }), draft),
    ).toBe(true);
    expect(isChatAttachmentSendEligible(createReadyRecord({ status: "failed" }), draft)).toBe(
      false,
    );
  });

  it("returns category-specific fallback copy without clinical language", () => {
    const foodOutcome: ChatAttachmentOutcome = {
      attachmentRefId: "a1000001-0000-4000-8000-000000000001",
      category: "food_photo",
      status: "low_confidence",
      recognition: null,
    };

    const fallback = resolveAttachmentOutcomeFallbackCopy(foodOutcome);
    expect(fallback).toMatch(/nutrition proposal/i);
    expect(fallback?.toLowerCase()).not.toContain("diagnosis");
    expect(fallback?.toLowerCase()).not.toContain("treatment");
  });

  it("uses context-only, wellness-only copy for attachments", () => {
    expect(MEDICAL_ATTACHMENT_WELLNESS_NOTICE.toLowerCase()).toContain("wellness");
    expect(MEDICAL_ATTACHMENT_WELLNESS_NOTICE.toLowerCase()).toContain("coaching context");
    expect(CHAT_ATTACHMENT_PRIVACY_NOTICE.toLowerCase()).not.toContain("clinical");
    expect(CHAT_ATTACHMENT_PRIVACY_NOTICE.toLowerCase()).not.toContain("classified");
    expect(CHAT_ATTACHMENT_PRIVACY_NOTICE.toLowerCase()).not.toContain("recognized");
    expect(CHAT_ATTACHMENT_PRIVACY_NOTICE.toLowerCase()).toContain("context");
  });

  // --- Context-only invariant regression guards ---

  it("all user-facing composer copy constants are free of recognition/classification wording", () => {
    const copyConstants = [
      CHAT_ATTACHMENT_PRIVACY_NOTICE,
      MEDICAL_ATTACHMENT_WELLNESS_NOTICE,
      FOOD_PHOTO_LOW_CONFIDENCE_COPY,
      WORKOUT_ATTACHMENT_MANUAL_FALLBACK_COPY,
      MEDICAL_ATTACHMENT_NEEDS_REVIEW_COPY,
      CHAT_ATTACHMENT_UNSUPPORTED_COPY,
      CHAT_ATTACHMENT_FAILED_COPY,
      MESSAGE_FIRST_ATTACHMENT_COPY,
    ];

    for (const copy of copyConstants) {
      expect(copy).not.toMatch(/recogniz|classif/i);
    }
  });

  it("resolveAttachmentDisplayStatus never returns 'recognizing' for any local draft phase", () => {
    const baseDraft = createChatComposerAttachmentDraft(createMockFile("meal.jpg", "image/jpeg"));
    const phases: ChatComposerAttachmentDraft["phase"][] = [
      "local",
      "uploading",
      "uploaded",
      "ready",
      "error",
    ];

    for (const phase of phases) {
      const draft: ChatComposerAttachmentDraft = {
        ...baseDraft,
        phase,
        record: phase === "ready" ? createReadyRecord({ status: "ready" }) : null,
        attachmentId: phase === "ready" ? "a1000001-0000-4000-8000-000000000001" : null,
      };

      const displayStatus = resolveAttachmentDisplayStatus(draft);
      expect(displayStatus).not.toBe("recognizing");
      expect(chatAttachmentStatusLabel(displayStatus)).not.toBe("Recognizing");
    }
  });

  it("isChatComposerAttachmentProcessing and isChatAttachmentSendEligible produce correct results across surviving draft phases", () => {
    const baseDraft = createChatComposerAttachmentDraft(createMockFile("meal.jpg", "image/jpeg"));

    // local: processing=false, send-eligible=false (no attachmentId)
    const localDraft: ChatComposerAttachmentDraft = { ...baseDraft, phase: "local", record: null, attachmentId: null };
    expect(isChatComposerAttachmentProcessing(localDraft)).toBe(false);
    expect(isChatAttachmentSendEligible(null, localDraft)).toBe(false);

    // uploading: processing=true, send-eligible=false
    const uploadingDraft: ChatComposerAttachmentDraft = { ...baseDraft, phase: "uploading", record: null, attachmentId: null };
    expect(isChatComposerAttachmentProcessing(uploadingDraft)).toBe(true);
    expect(isChatAttachmentSendEligible(null, uploadingDraft)).toBe(false);

    // uploaded (queued record): processing=false, send-eligible=true
    const uploadedRecord = createReadyRecord({ status: "queued" });
    const uploadedDraft: ChatComposerAttachmentDraft = {
      ...baseDraft,
      phase: "uploaded",
      record: uploadedRecord,
      attachmentId: "a1000001-0000-4000-8000-000000000001",
    };
    expect(isChatComposerAttachmentProcessing(uploadedDraft)).toBe(false);
    expect(isChatAttachmentSendEligible(uploadedRecord, uploadedDraft)).toBe(true);

    // ready (ready record): processing=false, send-eligible=true
    const readyRecord = createReadyRecord({ status: "ready" });
    const readyDraft: ChatComposerAttachmentDraft = {
      ...baseDraft,
      phase: "ready",
      record: readyRecord,
      attachmentId: "a1000001-0000-4000-8000-000000000001",
    };
    expect(isChatComposerAttachmentProcessing(readyDraft)).toBe(false);
    expect(isChatAttachmentSendEligible(readyRecord, readyDraft)).toBe(true);

    // error: processing=false, send-eligible=false
    const errorDraft: ChatComposerAttachmentDraft = {
      ...baseDraft,
      phase: "error",
      record: null,
      attachmentId: "a1000001-0000-4000-8000-000000000001",
      error: "Upload failed",
    };
    expect(isChatComposerAttachmentProcessing(errorDraft)).toBe(false);
    expect(isChatAttachmentSendEligible(null, errorDraft)).toBe(false);
  });

  it("buildOptimisticAttachmentDisplays returns previews for send-eligible attachments", () => {
    const queuedDraft: ChatComposerAttachmentDraft = {
      ...createChatComposerAttachmentDraft(createMockFile("meal.jpg", "image/jpeg")),
      attachmentId: "a1000001-0000-4000-8000-000000000001",
      record: createReadyRecord({ status: "queued", category: "unclassified" }),
      phase: "uploaded",
    };

    const displays = buildOptimisticAttachmentDisplays([queuedDraft]);
    expect(displays).toHaveLength(1);
    expect(displays[0]?.attachmentRefId).toBe("a1000001-0000-4000-8000-000000000001");
    expect(displays[0]?.category).toBeNull();
    expect(displays[0]?.status).toBeNull();
  });

  // --- No category picker / no pre-upload consent gate in the state layer ---

  it("createChatComposerAttachmentDraft produces no categoryOverride, preUploadConsentRequired, or consentScopes fields", () => {
    // The removed upfront classification and consent gate must not reappear as state fields.
    const draft = createChatComposerAttachmentDraft(createMockFile("meal.jpg", "image/jpeg"));

    expect(draft).not.toHaveProperty("categoryOverride");
    expect(draft).not.toHaveProperty("preUploadConsentRequired");
    expect(draft).not.toHaveProperty("consentScopes");
    expect(draft).not.toHaveProperty("selectedCategory");
    expect(draft).not.toHaveProperty("recognitionStatus");
  });

  it("validateChatAttachmentFile uses image-only MIME list — no PDF or text/plain slip-through", () => {
    // Exhaustive check: every non-image type must be rejected.
    const nonImageTypes = [
      "application/pdf",
      "text/plain",
      "application/msword",
      "application/octet-stream",
      "video/mp4",
      "audio/mpeg",
    ];

    for (const mimeType of nonImageTypes) {
      const error = validateChatAttachmentFile(createMockFile("file", mimeType));
      expect(error, `Expected ${mimeType} to be rejected`).not.toBeNull();
      expect(error).toMatch(/Unsupported MIME/);
    }

    // All three supported image types pass.
    expect(validateChatAttachmentFile(createMockFile("a.jpg", "image/jpeg"))).toBeNull();
    expect(validateChatAttachmentFile(createMockFile("a.png", "image/png"))).toBeNull();
    expect(validateChatAttachmentFile(createMockFile("a.webp", "image/webp"))).toBeNull();
  });
});
