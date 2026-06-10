import { describe, expect, it } from "vitest";
import type { ChatAttachmentOutcome, ChatAttachmentRecord } from "@health/types";
import {
  buildOptimisticAttachmentDisplays,
  canSendChatComposer,
  CHAT_ATTACHMENT_ACCEPT,
  CHAT_ATTACHMENT_FAILED_COPY,
  CHAT_ATTACHMENT_PRIVACY_NOTICE,
  CHAT_ATTACHMENT_UNSUPPORTED_COPY,
  chatAttachmentCategoryLabel,
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
    // recognition field removed (B3 removal, C4 cluster)
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

  it("accepts image types and rejects unsupported types", () => {
    expect(validateChatAttachmentFile(createMockFile("a.jpg", "image/jpeg"))).toBeNull();
    expect(validateChatAttachmentFile(createMockFile("a.png", "image/png"))).toBeNull();
    expect(validateChatAttachmentFile(createMockFile("a.webp", "image/webp"))).toBeNull();
    expect(validateChatAttachmentFile(createMockFile("a.zip", "application/zip"))).not.toBeNull();
    expect(validateChatAttachmentFile(createMockFile("a.mp4", "video/mp4"))).not.toBeNull();
  });

  it("accepts document_file MIME types (PDF, plain text, markdown)", () => {
    expect(validateChatAttachmentFile(createMockFile("a.pdf", "application/pdf"))).toBeNull();
    expect(validateChatAttachmentFile(createMockFile("a.txt", "text/plain"))).toBeNull();
    expect(validateChatAttachmentFile(createMockFile("a.md", "text/markdown"))).toBeNull();
    expect(validateChatAttachmentFile(createMockFile("a.md", "text/x-markdown"))).toBeNull();
  });

  it("CHAT_ATTACHMENT_ACCEPT contains image and document types", () => {
    expect(CHAT_ATTACHMENT_ACCEPT).toContain("image/jpeg");
    expect(CHAT_ATTACHMENT_ACCEPT).toContain("image/png");
    expect(CHAT_ATTACHMENT_ACCEPT).toContain("image/webp");
    expect(CHAT_ATTACHMENT_ACCEPT).toContain("application/pdf");
    expect(CHAT_ATTACHMENT_ACCEPT).toContain("text/plain");
    expect(CHAT_ATTACHMENT_ACCEPT).toContain("text/markdown");
    expect(CHAT_ATTACHMENT_ACCEPT).toContain(".pdf");
    expect(CHAT_ATTACHMENT_ACCEPT).toContain(".txt");
    expect(CHAT_ATTACHMENT_ACCEPT).toContain(".md");
    expect(CHAT_ATTACHMENT_ACCEPT).toContain(".markdown");
  });

  it("normalizes file extensions when browser MIME is missing — images", () => {
    expect(normalizeAttachmentMimeType(createMockFile("meal.jpeg", ""))).toBe("image/jpeg");
    expect(normalizeAttachmentMimeType(createMockFile("photo.png", ""))).toBe("image/png");
    expect(normalizeAttachmentMimeType(createMockFile("img.webp", ""))).toBe("image/webp");
  });

  it("normalizes .md with empty file.type to text/markdown (extension wins)", () => {
    expect(normalizeAttachmentMimeType(createMockFile("notes.md", ""))).toBe("text/markdown");
    expect(normalizeAttachmentMimeType(createMockFile("readme.markdown", ""))).toBe("text/markdown");
  });

  it("normalizes .md with browser-reported text/plain to text/markdown (extension wins)", () => {
    // Some browsers report text/plain for .md files — extension must win.
    expect(normalizeAttachmentMimeType(createMockFile("notes.md", "text/plain"))).toBe("text/markdown");
    expect(normalizeAttachmentMimeType(createMockFile("readme.markdown", "text/plain"))).toBe("text/markdown");
  });

  it("normalizes .pdf and .txt via extension", () => {
    expect(normalizeAttachmentMimeType(createMockFile("doc.pdf", ""))).toBe("application/pdf");
    expect(normalizeAttachmentMimeType(createMockFile("doc.pdf", "application/pdf"))).toBe("application/pdf");
    expect(normalizeAttachmentMimeType(createMockFile("plan.txt", ""))).toBe("text/plain");
  });

  it("rejects 6 MB PDF with size message (m2: getChatAttachmentSizeError is the single source of truth)", () => {
    const bigPdf = createMockFile("big.pdf", "application/pdf", 6_000_000);
    const error = validateChatAttachmentFile(bigPdf);
    expect(error).not.toBeNull();
    // getChatAttachmentSizeError("document_file", ...) returns the limit in bytes.
    expect(error).toMatch(/document_file/);
  });

  it("accepts 4 MB PDF", () => {
    const okPdf = createMockFile("ok.pdf", "application/pdf", 4_000_000);
    expect(validateChatAttachmentFile(okPdf)).toBeNull();
  });

  it("rejects .zip as unsupported", () => {
    const zipFile = createMockFile("archive.zip", "application/zip");
    const error = validateChatAttachmentFile(zipFile);
    expect(error).not.toBeNull();
    expect(error).toMatch(/Unsupported MIME/);
  });

  it("document_file category label returns 'Document file'", () => {
    expect(chatAttachmentCategoryLabel("document_file")).toBe("Document file");
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
        // recognition field removed (B3 removal, C4 cluster)
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
      // recognition field removed (B3 removal, C4 cluster)
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

  it("validateChatAttachmentFile rejects unsupported types and accepts images + document files", () => {
    // Unsupported types must be rejected.
    const unsupportedTypes = [
      "application/msword",
      "application/octet-stream",
      "video/mp4",
      "audio/mpeg",
      "application/zip",
    ];

    for (const mimeType of unsupportedTypes) {
      const error = validateChatAttachmentFile(createMockFile("file", mimeType));
      expect(error, `Expected ${mimeType} to be rejected`).not.toBeNull();
      expect(error).toMatch(/Unsupported MIME/);
    }

    // All three supported image types pass.
    expect(validateChatAttachmentFile(createMockFile("a.jpg", "image/jpeg"))).toBeNull();
    expect(validateChatAttachmentFile(createMockFile("a.png", "image/png"))).toBeNull();
    expect(validateChatAttachmentFile(createMockFile("a.webp", "image/webp"))).toBeNull();

    // Document file types pass within size limits.
    expect(validateChatAttachmentFile(createMockFile("a.pdf", "application/pdf", 1024))).toBeNull();
    expect(validateChatAttachmentFile(createMockFile("a.txt", "text/plain", 1024))).toBeNull();
    expect(validateChatAttachmentFile(createMockFile("a.md", "text/markdown", 1024))).toBeNull();
  });
});
