import { describe, expect, it } from "vitest";
import {
  assertRecognitionProviderIsolation,
  buildMedicalDocumentReviewPath,
  chatAttachmentRecognitionEnvelopeSchema,
  containsUnsafeRecognitionSummaryLanguage,
  getChatAttachmentMimeTypeError,
  getChatAttachmentOwnershipErrors,
  getChatAttachmentProposalRefErrors,
  getChatAttachmentRecognitionEligibilityErrors,
  getChatAttachmentRetentionPolicy,
  getChatAttachmentSendEligibilityErrors,
  getChatAttachmentSizeError,
  getMedicalAttachmentConsentErrors,
  grantChatAttachmentConsentSchema,
  createChatAttachmentSchema,
  isChatAttachmentExpired,
  isChatAttachmentImageMimeType,
  isChatAttachmentSendEligibleStatus,
  parseChatMessageAttachmentRefIds,
  recognizeChatAttachmentSchema,
  sanitizeMedicalRecognitionForClient,
  sendChatMessageSchema,
} from "./index.js";

const ownedAttachmentDefaults = {
  retentionPolicy: "ephemeral_recognition" as const,
  expiresAt: null,
};

describe("chat attachment contracts", () => {
  it("accepts supported MIME types per category", () => {
    expect(getChatAttachmentMimeTypeError("food_photo", "image/jpeg")).toBeNull();
    expect(getChatAttachmentMimeTypeError("food_photo", "application/pdf")).toMatch(
      /Unsupported MIME type/,
    );
    expect(getChatAttachmentMimeTypeError("medical_document", "application/pdf")).toBeNull();
    expect(getChatAttachmentMimeTypeError("medical_document", "image/jpeg")).toBeNull();
    expect(getChatAttachmentMimeTypeError("workout_attachment", "text/plain")).toBeNull();
  });

  it("enforces size limits per category", () => {
    expect(getChatAttachmentSizeError("food_photo", 0)).toMatch(/empty/);
    expect(getChatAttachmentSizeError("food_photo", 10_000_001)).toMatch(/exceeds/);
    expect(getChatAttachmentSizeError("medical_document", 5_000_001)).toMatch(/exceeds/);
  });

  it("requires medical document consent on create", () => {
    const parsed = createChatAttachmentSchema.safeParse({
      category: "medical_document",
      filename: "labs.pdf",
      mimeType: "application/pdf",
      fileContentBase64: "dGVzdA==",
      documentType: "lab_report",
      documentTitle: "Labs",
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts medical document create input with upload consent", () => {
    const parsed = createChatAttachmentSchema.safeParse({
      category: "medical_document",
      filename: "labs.pdf",
      mimeType: "application/pdf",
      fileContentBase64: "dGVzdA==",
      documentType: "lab_report",
      documentTitle: "Labs",
      consentScopes: ["upload_storage", "parse_ocr", "ai_summarization"],
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects cross-user attachment references", () => {
    const errors = getChatAttachmentOwnershipErrors(
      ["a1000001-0000-4000-8000-000000000001"],
      [],
    );

    expect(errors[0]).toMatch(/not found for this user/);
  });

  it("rejects proposal refs for unsupported attachment status", () => {
    const errors = getChatAttachmentProposalRefErrors({
      attachmentRefId: "a1000001-0000-4000-8000-000000000001",
      ownedAttachments: [
        {
          id: "a1000001-0000-4000-8000-000000000001",
          userId: "user-id",
          category: "food_photo",
          status: "failed",
          linkedDocumentId: null,
          linkedImageRefId: "a1000001-0000-4000-8000-000000000001",
          ...ownedAttachmentDefaults,
        },
      ],
      expectedCategory: "food_photo",
      requireReadyStatus: true,
    });

    expect(errors[0]).toMatch(/not proposal-ready/);
  });

  it("requires explicit medical consent scopes", () => {
    expect(getMedicalAttachmentConsentErrors("medical_document", undefined)).toHaveLength(1);
    expect(getMedicalAttachmentConsentErrors("medical_document", ["parse_ocr"])).toHaveLength(1);
    expect(
      getMedicalAttachmentConsentErrors("medical_document", ["upload_storage", "parse_ocr"]),
    ).toHaveLength(0);
    expect(getMedicalAttachmentConsentErrors("food_photo", undefined)).toHaveLength(0);
  });

  it("blocks unsafe recognition summary language", () => {
    expect(containsUnsafeRecognitionSummaryLanguage("Vitamin D is slightly low.")).toBe(false);
    expect(containsUnsafeRecognitionSummaryLanguage("This confirms a diagnosis of anemia.")).toBe(
      true,
    );
  });

  it("enforces provider isolation boundaries", () => {
    expect(() =>
      assertRecognitionProviderIsolation({
        category: "food_photo",
        payload: { imageRef: { id: "x" }, profile: { age: 30 } },
      }),
    ).toThrow(/must not include cross-category context key "profile"/);

    expect(() =>
      assertRecognitionProviderIsolation({
        category: "medical_document",
        payload: { documentText: "sample" },
      }),
    ).not.toThrow();

    expect(() =>
      assertRecognitionProviderIsolation({
        category: "workout_attachment",
        payload: { documentText: "sample" },
      }),
    ).toThrow(/documentText/);
  });

  it("allows chat messages with attachment refs and empty content", () => {
    const parsed = sendChatMessageSchema.safeParse({
      content: "",
      attachmentRefIds: ["a1000001-0000-4000-8000-000000000001"],
    });

    expect(parsed.success).toBe(true);
  });

  it("requires content or attachment refs for chat messages", () => {
    const parsed = sendChatMessageSchema.safeParse({ content: "" });

    expect(parsed.success).toBe(false);
  });

  it("parses attachment ref ids from chat message metadata", () => {
    expect(
      parseChatMessageAttachmentRefIds({
        attachmentRefIds: ["a1000001-0000-4000-8000-000000000001"],
      }),
    ).toEqual(["a1000001-0000-4000-8000-000000000001"]);
    expect(parseChatMessageAttachmentRefIds({})).toEqual([]);
  });

  it("detects image mime types for transcript previews", () => {
    expect(isChatAttachmentImageMimeType("image/jpeg")).toBe(true);
    expect(isChatAttachmentImageMimeType("application/pdf")).toBe(false);
  });

  it("maps retention policies per attachment category", () => {
    expect(getChatAttachmentRetentionPolicy("unclassified")).toBe("ephemeral_recognition");
    expect(getChatAttachmentRetentionPolicy("food_photo")).toBe("ephemeral_recognition");
    expect(getChatAttachmentRetentionPolicy("medical_document")).toBe("document_consent_rules");
    expect(getChatAttachmentRetentionPolicy("workout_attachment")).toBe("ephemeral_recognition");
  });

  it("rejects proposal refs with wrong attachment category", () => {
    const errors = getChatAttachmentProposalRefErrors({
      attachmentRefId: "a1000001-0000-4000-8000-000000000001",
      ownedAttachments: [
        {
          id: "a1000001-0000-4000-8000-000000000001",
          userId: "user-id",
          category: "workout_attachment",
          status: "ready",
          linkedDocumentId: null,
          linkedImageRefId: null,
          ...ownedAttachmentDefaults,
        },
      ],
      expectedCategory: "food_photo",
      requireReadyStatus: true,
    });

    expect(errors[0]).toMatch(/Expected food_photo attachment but found workout_attachment/);
  });

  it("rejects chat send refs for failed or unsupported attachments", () => {
    const failedErrors = getChatAttachmentSendEligibilityErrors(
      ["a1000001-0000-4000-8000-000000000001"],
      [
        {
          id: "a1000001-0000-4000-8000-000000000001",
          userId: "user-id",
          category: "food_photo",
          status: "failed",
          linkedDocumentId: null,
          linkedImageRefId: null,
          ...ownedAttachmentDefaults,
        },
      ],
    );

    expect(failedErrors[0]).toMatch(/not eligible for chat reference \(failed\)/);
  });

  it("allows queued unclassified refs for message-first chat send", () => {
    const errors = getChatAttachmentSendEligibilityErrors(
      ["a1000001-0000-4000-8000-000000000001"],
      [
        {
          id: "a1000001-0000-4000-8000-000000000001",
          userId: "user-id",
          category: "unclassified",
          status: "queued",
          linkedDocumentId: null,
          linkedImageRefId: null,
          ...ownedAttachmentDefaults,
        },
      ],
    );

    expect(errors).toEqual([]);
  });

  it("rejects in-progress and pre-classified queued refs for chat send", () => {
    for (const status of ["recognizing", "needs_consent"] as const) {
      const errors = getChatAttachmentSendEligibilityErrors(
        ["a1000001-0000-4000-8000-000000000001"],
        [
          {
            id: "a1000001-0000-4000-8000-000000000001",
            userId: "user-id",
            category: "food_photo",
            status,
            linkedDocumentId: null,
            linkedImageRefId: null,
            ...ownedAttachmentDefaults,
          },
        ],
      );

      expect(errors[0]).toMatch(new RegExp(`"${status}" is not eligible for chat send`));
    }

    const preClassifiedQueued = getChatAttachmentSendEligibilityErrors(
      ["a1000001-0000-4000-8000-000000000001"],
      [
        {
          id: "a1000001-0000-4000-8000-000000000001",
          userId: "user-id",
          category: "food_photo",
          status: "queued",
          linkedDocumentId: null,
          linkedImageRefId: null,
          ...ownedAttachmentDefaults,
        },
      ],
    );

    expect(preClassifiedQueued).toEqual([]);
  });

  it("allows ready, low_confidence, and needs_review attachment refs for chat send", () => {
    for (const status of ["ready", "low_confidence", "needs_review"] as const) {
      expect(isChatAttachmentSendEligibleStatus(status)).toBe(true);

      const errors = getChatAttachmentSendEligibilityErrors(
        ["a1000001-0000-4000-8000-000000000001"],
        [
          {
            id: "a1000001-0000-4000-8000-000000000001",
            userId: "user-id",
            category: status === "needs_review" ? "medical_document" : "food_photo",
            status,
            linkedDocumentId: null,
            linkedImageRefId: null,
            ...ownedAttachmentDefaults,
          },
        ],
      );

      expect(errors).toEqual([]);
    }
  });

  it("parses recognition envelope variants", () => {
    const foodEnvelope = chatAttachmentRecognitionEnvelopeSchema.parse({
      category: "food_photo",
      attachmentRefId: "a1000001-0000-4000-8000-000000000001",
      analysis: {
        candidates: [
          {
            items: [{ name: "Salad", calories: 320 }],
            estimatedCalories: 320,
            estimatedMacros: { proteinGrams: 12, carbsGrams: 20, fatGrams: 18 },
            confidence: "medium",
            provenance: {
              source: "dev_stub",
              providerId: "dev_food_photo",
              analysisId: "b1000001-0000-4000-8000-000000000002",
            },
          },
        ],
        lowConfidenceNotice: null,
      },
      provenance: {
        source: "dev_stub",
        providerId: "dev_food_photo",
        recognitionId: "b1000001-0000-4000-8000-000000000002",
        confidence: "medium",
      },
    });

    expect(foodEnvelope.category).toBe("food_photo");

    const medicalEnvelope = chatAttachmentRecognitionEnvelopeSchema.parse({
      category: "medical_document",
      attachmentRefId: "d1000001-0000-4000-8000-000000000001",
      documentId: "e1000001-0000-4000-8000-000000000001",
      documentType: "lab_report",
      title: "Labs",
      parseStatus: "summary_ready",
      summarySnippet: "Vitamin D is slightly below the reference range.",
      reviewStatus: "pending_review",
      consentScopes: ["upload_storage", "parse_ocr"],
      provenance: {
        source: "document_parser",
        providerId: "documents_module",
        recognitionId: "f1000001-0000-4000-8000-000000000001",
      },
      wellnessContextOnlyNotice:
        "This document is wellness coaching context only. It is not a diagnosis or treatment plan.",
      documentReviewPath: null,
    });

    expect(medicalEnvelope.category).toBe("medical_document");
    if (medicalEnvelope.category === "medical_document") {
      expect(medicalEnvelope.reviewStatus).toBe("pending_review");
    }
  });

  it("validates recognize and consent request schemas", () => {
    expect(
      recognizeChatAttachmentSchema.safeParse({
        consentScopes: ["upload_storage"],
      }).success,
    ).toBe(true);

    expect(
      recognizeChatAttachmentSchema.safeParse({
        categoryOverride: "workout_attachment",
        consentScopes: ["upload_storage"],
      }).success,
    ).toBe(false);

    expect(
      grantChatAttachmentConsentSchema.safeParse({
        consentScopes: ["upload_storage"],
        documentType: "lab_report",
        documentTitle: "Labs",
        fileContentBase64: "dGVzdA==",
      }).success,
    ).toBe(true);

    expect(
      grantChatAttachmentConsentSchema.safeParse({
        consentScopes: [],
      }).success,
    ).toBe(false);
  });

  it("rejects expired ephemeral attachment refs for chat and proposals", () => {
    const expiredAttachment = {
      id: "a1000001-0000-4000-8000-000000000001",
      userId: "user-id",
      category: "food_photo" as const,
      status: "ready" as const,
      linkedDocumentId: null,
      linkedImageRefId: "a1000001-0000-4000-8000-000000000001",
      retentionPolicy: "ephemeral_recognition" as const,
      expiresAt: "2026-05-25T12:00:00.000Z",
    };

    expect(isChatAttachmentExpired(expiredAttachment, new Date("2026-05-26T12:00:00.000Z"))).toBe(
      true,
    );

    const chatErrors = getChatAttachmentOwnershipErrors(
      ["a1000001-0000-4000-8000-000000000001"],
      [expiredAttachment],
    );

    expect(chatErrors[0]).toMatch(/expired/);

    const proposalErrors = getChatAttachmentProposalRefErrors({
      attachmentRefId: "a1000001-0000-4000-8000-000000000001",
      ownedAttachments: [expiredAttachment],
      expectedCategory: "food_photo",
      requireReadyStatus: true,
    });

    expect(proposalErrors[0]).toMatch(/expired/);
  });

  it("blocks recognition when stored MIME does not match category", () => {
    const errors = getChatAttachmentRecognitionEligibilityErrors({
      category: "food_photo",
      mimeType: "application/pdf",
      consent: null,
      retentionPolicy: "ephemeral_recognition",
      expiresAt: null,
    });

    expect(errors[0]).toMatch(/Unsupported MIME type/);
  });

  it("strips medical summary text until review approval", () => {
    const sanitized = sanitizeMedicalRecognitionForClient({
      category: "medical_document",
      attachmentRefId: "d1000001-0000-4000-8000-000000000001",
      documentId: "e1000001-0000-4000-8000-000000000001",
      documentType: "lab_report",
      title: "Labs",
      parseStatus: "summary_ready",
      summarySnippet: "Vitamin D is slightly below the reference range.",
      reviewStatus: "pending_review",
      documentReviewPath: null,
      consentScopes: ["upload_storage", "parse_ocr"],
      provenance: {
        source: "document_parser",
        providerId: "documents_module",
        recognitionId: "f1000001-0000-4000-8000-000000000001",
      },
      wellnessContextOnlyNotice:
        "This document is wellness coaching context only. It is not a diagnosis or treatment plan.",
    });

    expect(sanitized.summarySnippet).toBeNull();
    expect(sanitized.documentReviewPath).toBe(
      buildMedicalDocumentReviewPath("e1000001-0000-4000-8000-000000000001"),
    );
  });

  it("caps attachment ref count on chat messages", () => {
    const attachmentRefIds = [
      "a1000001-0000-4000-8000-000000000001",
      "a1000002-0000-4000-8000-000000000002",
      "a1000003-0000-4000-8000-000000000003",
      "a1000004-0000-4000-8000-000000000004",
      "a1000005-0000-4000-8000-000000000005",
      "a1000006-0000-4000-8000-000000000006",
    ];

    const tooMany = sendChatMessageSchema.safeParse({
      content: "",
      attachmentRefIds,
    });

    expect(tooMany.success).toBe(false);
  });
});
