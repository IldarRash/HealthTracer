import { describe, expect, it } from "vitest";
import type { ChatAttachmentOutcome, ChatAttachmentRecord } from "@health/types";
import {
  applyChatAttachmentCategoryChange,
  buildChatAttachmentConsentScopeItems,
  canSendChatComposer,
  canSubmitMedicalAttachmentDraft,
  CHAT_ATTACHMENT_PRIVACY_NOTICE,
  createChatComposerAttachmentDraft,
  getMedicalAttachmentDraftErrors,
  guessChatAttachmentCategory,
  isAmbiguousFoodOrWorkoutImage,
  isChatAttachmentSendEligible,
  MEDICAL_ATTACHMENT_NEEDS_REVIEW_COPY,
  MEDICAL_ATTACHMENT_WELLNESS_NOTICE,
  normalizeAttachmentMimeType,
  resolveAttachmentOutcomeFallbackCopy,
  shouldAutoProcessChatAttachmentOnSelect,
  toggleChatAttachmentConsentScope,
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
  it("treats supported meal and workout images as ambiguous food-or-workout", () => {
    const workoutPhoto = createMockFile("gym-session.jpg", "image/jpeg");

    expect(isAmbiguousFoodOrWorkoutImage(workoutPhoto)).toBe(true);
    expect(guessChatAttachmentCategory(workoutPhoto)).toBe("food_photo");
    expect(shouldAutoProcessChatAttachmentOnSelect(createChatComposerAttachmentDraft(workoutPhoto))).toBe(
      false,
    );
    expect(
      shouldAutoProcessChatAttachmentOnSelect(
        createChatComposerAttachmentDraft(createMockFile("plan.txt", "text/plain")),
      ),
    ).toBe(false);

    const corrected = applyChatAttachmentCategoryChange(
      createChatComposerAttachmentDraft(workoutPhoto),
      "workout_attachment",
    );
    expect(corrected.category).toBe("workout_attachment");
    expect(shouldAutoProcessChatAttachmentOnSelect(corrected)).toBe(false);
    expect(corrected.phase).toBe("local");
  });

  it("allows auto-processing only for unambiguous non-image workout files", () => {
    const planFile = createMockFile("program.txt", "text/plain");
    const workoutDraft = applyChatAttachmentCategoryChange(
      createChatComposerAttachmentDraft(planFile),
      "workout_attachment",
    );

    expect(isAmbiguousFoodOrWorkoutImage(planFile)).toBe(false);
    expect(shouldAutoProcessChatAttachmentOnSelect(workoutDraft)).toBe(true);
    expect(shouldAutoProcessChatAttachmentOnSelect(createChatComposerAttachmentDraft(planFile))).toBe(
      false,
    );
  });

  it("guesses categories from MIME types and supports category correction validation", () => {
    expect(guessChatAttachmentCategory(createMockFile("meal.jpg", "image/jpeg"))).toBe(
      "food_photo",
    );
    expect(guessChatAttachmentCategory(createMockFile("lab.pdf", "application/pdf"))).toBe(
      "medical_document",
    );
    expect(guessChatAttachmentCategory(createMockFile("plan.txt", "text/plain"))).toBe(
      "medical_document",
    );

    const workoutFile = createMockFile("session.txt", "text/plain");
    expect(validateChatAttachmentFile(workoutFile, "workout_attachment")).toBeNull();
    expect(validateChatAttachmentFile(workoutFile, "food_photo")).toMatch(/Unsupported MIME/);
  });

  it("normalizes file extensions when browser MIME is missing", () => {
    expect(normalizeAttachmentMimeType(createMockFile("meal.jpeg", ""))).toBe("image/jpeg");
    expect(normalizeAttachmentMimeType(createMockFile("notes.pdf", ""))).toBe("application/pdf");
  });

  it("requires medical consent, title, and upload_storage before submit", () => {
    const draft = createChatComposerAttachmentDraft(createMockFile("lab.pdf", "application/pdf"));
    draft.category = "medical_document";
    draft.documentTitle = "";

    expect(draft.consentScopes).toEqual([]);
    expect(canSubmitMedicalAttachmentDraft(draft)).toBe(false);
    expect(getMedicalAttachmentDraftErrors(draft).join(" ")).toMatch(/consent/i);
    expect(getMedicalAttachmentDraftErrors(draft).join(" ")).toMatch(/title/i);

    draft.documentTitle = "Lab results";
    draft.consentScopes = ["upload_storage"];
    expect(canSubmitMedicalAttachmentDraft(draft)).toBe(true);
  });

  it("blocks send while attachments are local or processing", () => {
    const localDraft = createChatComposerAttachmentDraft(createMockFile("meal.jpg", "image/jpeg"));

    expect(
      canSendChatComposer({
        draftText: "",
        attachments: [localDraft],
        isSendPending: false,
      }),
    ).toBe(false);

    const readyDraft = {
      ...localDraft,
      attachmentId: "a1000001-0000-4000-8000-000000000001",
      record: createReadyRecord(),
      phase: "ready" as const,
    };

    expect(
      canSendChatComposer({
        draftText: "",
        attachments: [readyDraft],
        isSendPending: false,
      }),
    ).toBe(true);
  });

  it("marks only eligible attachment records as send-ready", () => {
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
      proposalCandidateCount: 1,
    };

    const fallback = resolveAttachmentOutcomeFallbackCopy(foodOutcome);
    expect(fallback).toMatch(/nutrition proposal/i);
    expect(fallback?.toLowerCase()).not.toContain("diagnosis");
    expect(fallback?.toLowerCase()).not.toContain("treatment");
  });

  it("uses wellness-only copy for medical attachments", () => {
    expect(MEDICAL_ATTACHMENT_WELLNESS_NOTICE.toLowerCase()).toContain("wellness");
    expect(MEDICAL_ATTACHMENT_WELLNESS_NOTICE.toLowerCase()).toContain("coaching context");
    expect(CHAT_ATTACHMENT_PRIVACY_NOTICE.toLowerCase()).not.toContain("clinical");
  });

  it("revalidates MIME allowlists when category is corrected", () => {
    const pdfFile = createMockFile("notes.pdf", "application/pdf");
    expect(validateChatAttachmentFile(pdfFile, "medical_document")).toBeNull();
    expect(validateChatAttachmentFile(pdfFile, "food_photo")).toMatch(/Unsupported MIME/);

    const textFile = createMockFile("session.txt", "text/plain");
    expect(validateChatAttachmentFile(textFile, "workout_attachment")).toBeNull();
    expect(validateChatAttachmentFile(textFile, "medical_document")).toBeNull();
  });

  it("blocks send while medical consent is pending", () => {
    const draft = {
      ...createChatComposerAttachmentDraft(createMockFile("lab.pdf", "application/pdf")),
      category: "medical_document" as const,
      attachmentId: "d1000001-0000-4000-8000-000000000001",
      phase: "needs_consent" as const,
      record: createReadyRecord({
        category: "medical_document",
        status: "needs_consent",
      }),
    };

    expect(canSendChatComposer({ draftText: "", attachments: [draft], isSendPending: false })).toBe(
      false,
    );
  });

  it("allows send for needs_review medical attachments after recognition", () => {
    const draft = {
      ...createChatComposerAttachmentDraft(createMockFile("lab.pdf", "application/pdf")),
      category: "medical_document" as const,
      attachmentId: "d1000001-0000-4000-8000-000000000001",
      phase: "ready" as const,
      record: createReadyRecord({
        category: "medical_document",
        status: "needs_review",
      }),
    };

    expect(isChatAttachmentSendEligible(draft.record, draft)).toBe(true);
    expect(canSendChatComposer({ draftText: "", attachments: [draft], isSendPending: false })).toBe(
      true,
    );
  });

  it("returns medical and workout fallback copy without clinical language", () => {
    const medicalOutcome: ChatAttachmentOutcome = {
      attachmentRefId: "d1000001-0000-4000-8000-000000000001",
      category: "medical_document",
      status: "needs_review",
      recognition: null,
      proposalCandidateCount: 0,
    };

    expect(resolveAttachmentOutcomeFallbackCopy(medicalOutcome)).toBe(
      MEDICAL_ATTACHMENT_NEEDS_REVIEW_COPY,
    );

    const workoutOutcome: ChatAttachmentOutcome = {
      attachmentRefId: "c1000001-0000-4000-8000-000000000001",
      category: "workout_attachment",
      status: "low_confidence",
      recognition: {
        category: "workout_attachment",
        attachmentRefId: "c1000001-0000-4000-8000-000000000001",
        attachmentKind: "exercise_photo",
        sessionLabel: "Session",
        sessionDate: null,
        exercises: [],
        suggestedIntent: "log_session_context",
        planDraftTitle: null,
        provenance: {
          source: "dev_stub",
          providerId: "dev_workout_attachment",
          recognitionId: "f1000001-0000-4000-8000-000000000002",
          confidence: "low",
        },
        manualFallbackNotice: "Describe the workout in text.",
      },
      proposalCandidateCount: 0,
    };

    const workoutFallback = resolveAttachmentOutcomeFallbackCopy(workoutOutcome);
    expect(workoutFallback).toMatch(/workout/i);
    expect(workoutFallback?.toLowerCase()).not.toContain("diagnosis");
    expect(WORKOUT_ATTACHMENT_MANUAL_FALLBACK_COPY.toLowerCase()).not.toContain("treatment");
  });

  it("keeps upload_storage required when toggling medical consent scopes", () => {
    expect(toggleChatAttachmentConsentScope([], "upload_storage")).toEqual(["upload_storage"]);
    expect(toggleChatAttachmentConsentScope(["upload_storage"], "parse_ocr")).toEqual([
      "upload_storage",
      "parse_ocr",
    ]);
    expect(toggleChatAttachmentConsentScope(["upload_storage", "parse_ocr"], "upload_storage")).toEqual(
      ["parse_ocr"],
    );
  });

  it("does not preselect or lock required consent scopes in the checklist", () => {
    const items = buildChatAttachmentConsentScopeItems([]);
    const uploadScope = items.find((item) => item.id === "upload_storage");

    expect(uploadScope?.enabled).toBe(false);
    expect(uploadScope?.label).toContain("(required)");
    expect(JSON.stringify(items)).not.toContain('"required":true');
  });

  it("resets upload state and consent when category is corrected after processing", () => {
    const uploadedDraft: ChatComposerAttachmentDraft = {
      ...createChatComposerAttachmentDraft(createMockFile("lab.pdf", "application/pdf")),
      category: "medical_document",
      documentTitle: "Lab results",
      consentScopes: ["upload_storage", "parse_ocr"],
      attachmentId: "d1000001-0000-4000-8000-000000000001",
      record: createReadyRecord({
        category: "medical_document",
        status: "needs_review",
      }),
      phase: "ready",
    };

    const resetDraft = applyChatAttachmentCategoryChange(uploadedDraft, "food_photo");

    expect(resetDraft.category).toBe("food_photo");
    expect(resetDraft.consentScopes).toEqual([]);
    expect(resetDraft.attachmentId).toBeNull();
    expect(resetDraft.record).toBeNull();
    expect(resetDraft.phase).toBe("local");
    expect(resetDraft.proposalCandidateCount).toBe(0);
  });
});
