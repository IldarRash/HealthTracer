import { describe, expect, it } from "vitest";
import {
  chatAttachmentRecordSchema,
  chatMessageAttachmentMetaSchema,
  chatMessageSchema,
  getChatAttachmentMimeTypeError,
  getChatAttachmentOwnershipErrors,
  getChatAttachmentProposalRefErrors,
  getChatAttachmentRetentionPolicy,
  getChatAttachmentSendEligibilityErrors,
  getChatAttachmentSizeError,
  getMedicalAttachmentConsentErrors,
  createChatAttachmentSchema,
  isChatAttachmentExpired,
  isChatAttachmentImageMimeType,
  isChatAttachmentSendEligibleStatus,
  parseChatMessageAttachmentRefIds,
  sendChatMessageSchema,
  CHAT_PROVISIONAL_UPLOAD_MIME_TYPES,
  getProvisionalAttachmentMimeTypeError,
} from "./index.js";

const ownedAttachmentDefaults = {
  retentionPolicy: "ephemeral_recognition" as const,
  expiresAt: null,
};

describe("chat attachment contracts", () => {
  describe("image-only MIME (plan item 5)", () => {
    it("accepts image MIME types for all categories", () => {
      expect(getChatAttachmentMimeTypeError("food_photo", "image/jpeg")).toBeNull();
      expect(getChatAttachmentMimeTypeError("food_photo", "image/png")).toBeNull();
      expect(getChatAttachmentMimeTypeError("food_photo", "image/webp")).toBeNull();
      expect(getChatAttachmentMimeTypeError("medical_document", "image/jpeg")).toBeNull();
      expect(getChatAttachmentMimeTypeError("medical_document", "image/png")).toBeNull();
      expect(getChatAttachmentMimeTypeError("workout_attachment", "image/jpeg")).toBeNull();
      expect(getChatAttachmentMimeTypeError("unclassified", "image/jpeg")).toBeNull();
    });

    it("rejects PDF for all categories — images only", () => {
      expect(getChatAttachmentMimeTypeError("food_photo", "application/pdf")).toMatch(
        /Unsupported MIME type/,
      );
      expect(getChatAttachmentMimeTypeError("medical_document", "application/pdf")).toMatch(
        /Unsupported MIME type/,
      );
      expect(getChatAttachmentMimeTypeError("workout_attachment", "application/pdf")).toMatch(
        /Unsupported MIME type/,
      );
      expect(getChatAttachmentMimeTypeError("unclassified", "application/pdf")).toMatch(
        /Unsupported MIME type/,
      );
    });

    it("rejects text/plain for all categories — images only", () => {
      expect(getChatAttachmentMimeTypeError("workout_attachment", "text/plain")).toMatch(
        /Unsupported MIME type/,
      );
      expect(getChatAttachmentMimeTypeError("unclassified", "text/plain")).toMatch(
        /Unsupported MIME type/,
      );
    });

    it("CHAT_PROVISIONAL_UPLOAD_MIME_TYPES contains only the three image types", () => {
      expect(CHAT_PROVISIONAL_UPLOAD_MIME_TYPES).toEqual(["image/jpeg", "image/png", "image/webp"]);
    });

    it("getProvisionalAttachmentMimeTypeError accepts images and rejects non-images", () => {
      expect(getProvisionalAttachmentMimeTypeError("image/jpeg")).toBeNull();
      expect(getProvisionalAttachmentMimeTypeError("image/png")).toBeNull();
      expect(getProvisionalAttachmentMimeTypeError("image/webp")).toBeNull();
      expect(getProvisionalAttachmentMimeTypeError("application/pdf")).toMatch(/Unsupported/);
      expect(getProvisionalAttachmentMimeTypeError("text/plain")).toMatch(/Unsupported/);
      expect(getProvisionalAttachmentMimeTypeError("application/octet-stream")).toMatch(/Unsupported/);
    });
  });

  describe("createChatAttachmentSchema — no upfront consent gate (plan item 6)", () => {
    it("accepts a plain image upload without category or consent", () => {
      const parsed = createChatAttachmentSchema.safeParse({
        filename: "meal.jpg",
        mimeType: "image/jpeg",
        fileContentBase64: "dGVzdA==",
      });

      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.filename).toBe("meal.jpg");
      }
    });

    it("rejects non-image uploads at the provisional gate", () => {
      const parsed = createChatAttachmentSchema.safeParse({
        filename: "labs.pdf",
        mimeType: "application/pdf",
        fileContentBase64: "dGVzdA==",
      });

      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues[0]?.message).toMatch(/Unsupported MIME type/);
      }
    });

    it("does not require consent scopes on upload — consent gate removed", () => {
      // Previously medical_document category required upload_storage consent on create.
      // Now uploads are category-agnostic at upload time and no upfront consent gate applies.
      const parsed = createChatAttachmentSchema.safeParse({
        filename: "labs.jpg",
        mimeType: "image/jpeg",
        fileContentBase64: "dGVzdA==",
      });

      expect(parsed.success).toBe(true);
    });
  });

  it("enforces size limits per category", () => {
    expect(getChatAttachmentSizeError("food_photo", 0)).toMatch(/empty/);
    expect(getChatAttachmentSizeError("food_photo", 10_000_001)).toMatch(/exceeds/);
    expect(getChatAttachmentSizeError("medical_document", 5_000_001)).toMatch(/exceeds/);
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

  it("requires explicit medical consent scopes (post-send consent grant)", () => {
    expect(getMedicalAttachmentConsentErrors("medical_document", undefined)).toHaveLength(1);
    expect(getMedicalAttachmentConsentErrors("medical_document", ["parse_ocr"])).toHaveLength(1);
    expect(
      getMedicalAttachmentConsentErrors("medical_document", ["upload_storage", "parse_ocr"]),
    ).toHaveLength(0);
    expect(getMedicalAttachmentConsentErrors("food_photo", undefined)).toHaveLength(0);
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

  describe("DB-compat: historical category/status still readable (B3 removal)", () => {
    it("chatAttachmentRecordSchema parses a row carrying legacy category and status — DB backwards compat", () => {
      // DB columns for category, status remain readable on historically persisted rows.
      // The recognition DB column stays readable at the DB level but is excluded from
      // the domain record type (B3 removal, C4 cluster). Passing unknown keys to .parse()
      // just strips them — no error.
      const legacyRow = chatAttachmentRecordSchema.parse({
        id: "b1000001-0000-4000-8000-000000000001",
        userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
        threadId: null,
        messageId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
        category: "food_photo",         // legacy category value — still readable
        categorySource: "ai_classified", // legacy categorySource — still readable
        status: "ready",                 // legacy status — still readable
        filename: "meal.jpg",
        mimeType: "image/jpeg",
        fileSizeBytes: 5000,
        storageKey: "local://attachments/meal.jpg",
        linkedDocumentId: null,
        linkedImageRefId: "a1000001-0000-4000-8000-000000000001",
        consent: null,
        failureReason: null,
        retentionPolicy: "ephemeral_recognition",
        expiresAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Legacy category / status parse correctly.
      expect(legacyRow.category).toBe("food_photo");
      expect(legacyRow.categorySource).toBe("ai_classified");
      expect(legacyRow.status).toBe("ready");
      // recognition field no longer exists on the domain record type.
      expect((legacyRow as Record<string, unknown>)["recognition"]).toBeUndefined();
    });
  });
});

describe("chatMessageAttachmentMetaSchema — display-only contract", () => {
  const validMeta = {
    attachmentRefId: "a1000001-0000-4000-8000-000000000001",
    filename: "food.jpg",
    mimeType: "image/jpeg",
    category: "food_photo",
    status: "ready",
    hasViewableContent: true,
  };

  it("accepts a valid display-only attachment metadata object", () => {
    expect(chatMessageAttachmentMetaSchema.safeParse(validMeta).success).toBe(true);
  });

  it("rejects objects with storageKey (raw content field not allowed on display schema)", () => {
    expect(
      chatMessageAttachmentMetaSchema.safeParse({ ...validMeta, storageKey: "some/key" }).success,
    ).toBe(false);
  });

  it("rejects objects with consent (consent object not allowed on display schema)", () => {
    expect(
      chatMessageAttachmentMetaSchema.safeParse({
        ...validMeta,
        consent: { consentScopes: ["upload_storage"], consentVersion: "v1", consentGrantedAt: new Date().toISOString() },
      }).success,
    ).toBe(false);
  });

  it("rejects objects with recognition payloads (recognition not allowed on display schema)", () => {
    expect(
      chatMessageAttachmentMetaSchema.safeParse({
        ...validMeta,
        recognition: { category: "food_photo", analysis: {} },
      }).success,
    ).toBe(false);
  });

  it("rejects objects with fileContentBase64 (bytes not allowed on display schema)", () => {
    expect(
      chatMessageAttachmentMetaSchema.safeParse({ ...validMeta, fileContentBase64: "dGVzdA==" })
        .success,
    ).toBe(false);
  });
});

describe("chatMessageSchema — attachments field", () => {
  const baseMessage = {
    id: "a1000001-0000-4000-8000-000000000001",
    threadId: "b2000002-0000-4000-8000-000000000002",
    role: "user",
    content: "Hi coach",
    metadata: {},
    createdAt: new Date().toISOString(),
  };

  it("defaults attachments to empty array when field is absent", () => {
    const parsed = chatMessageSchema.safeParse(baseMessage);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.attachments).toEqual([]);
    }
  });

  it("accepts a message with a populated attachments array", () => {
    const parsed = chatMessageSchema.safeParse({
      ...baseMessage,
      attachments: [
        {
          attachmentRefId: "a1000001-0000-4000-8000-000000000001",
          filename: "photo.jpg",
          mimeType: "image/jpeg",
          category: "food_photo",
          status: "ready",
          hasViewableContent: true,
        },
      ],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.attachments).toHaveLength(1);
      expect(parsed.data.attachments[0]?.hasViewableContent).toBe(true);
    }
  });

  it("rejects a message where attachments contain storageKey (no raw content in contract)", () => {
    const parsed = chatMessageSchema.safeParse({
      ...baseMessage,
      attachments: [
        {
          attachmentRefId: "a1000001-0000-4000-8000-000000000001",
          filename: "photo.jpg",
          mimeType: "image/jpeg",
          category: "food_photo",
          status: "ready",
          hasViewableContent: true,
          storageKey: "some/storage/path",
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts assistant messages with empty attachments (backward compatible)", () => {
    const parsed = chatMessageSchema.safeParse({
      ...baseMessage,
      role: "assistant",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.attachments).toEqual([]);
    }
  });
});
