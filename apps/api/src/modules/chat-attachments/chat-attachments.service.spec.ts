import { BadRequestException, NotFoundException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultAiBehaviorConfigService } from "../ai/test-ai-behavior-fixtures.js";
import { ChatAttachmentClassifierService } from "./chat-attachment-classifier.service.js";
import { ChatAttachmentsService } from "./chat-attachments.service.js";
import { LocalChatAttachmentClassificationProvider } from "./local-chat-attachment-classification.provider.js";
import { LocalChatAttachmentStorageAdapter } from "./local-chat-attachment-storage.js";

const auth = {
  clerkUserId: "user_123",
  displayName: "Test User",
  email: "test@example.com",
};

function createLocalClassifierBinding() {
  const classifier = new ChatAttachmentClassifierService(
    new LocalChatAttachmentClassificationProvider(createDefaultAiBehaviorConfigService()),
  );

  return {
    classify: classifier.classify.bind(classifier),
    shouldBypassProviderForAttachment:
      classifier.shouldBypassProviderForAttachment.bind(classifier),
  };
}

const user = {
  id: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
  displayName: "Test User",
  email: "test@example.com",
  timezone: "UTC",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function createService(deps: {
  chatAttachmentsRepository?: Record<string, unknown>;
  chatRepository?: Record<string, unknown>;
  chatAttachmentRecognitionService?: Record<string, unknown>;
  chatAttachmentClassifierService?: Record<string, unknown>;
}) {
  const chatAttachmentsRepository = {
    create: vi.fn(async (input: unknown) => ({
      ...(input as Record<string, unknown>),
      threadId: null,
      messageId: null,
      linkedDocumentId: null,
      recognition: null,
      failureReason: null,
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    findByIdForUser: vi.fn(async () => null),
    update: vi.fn(async (_userId: string, _id: string, patch: unknown) => ({
      id: "a1000001-0000-4000-8000-000000000001",
      userId: user.id,
      threadId: null,
      messageId: null,
      category: "food_photo",
      status: "ready",
      filename: "meal.jpg",
      mimeType: "image/jpeg",
      fileSizeBytes: 4,
      storageKey: "local://attachments/meal.jpg",
      linkedDocumentId: null,
      linkedImageRefId: "a1000001-0000-4000-8000-000000000001",
      consent: null,
      recognition: null,
      failureReason: null,
      retentionPolicy: "ephemeral_recognition",
      expiresAt: null,
      createdAt: new Date("2026-05-26T12:00:00.000Z"),
      updatedAt: new Date("2026-05-26T12:00:01.000Z"),
      ...(patch as Record<string, unknown>),
    })),
    listByIdsForUser: vi.fn(async () => []),
    ...deps.chatAttachmentsRepository,
  };

  const chatRepository = {
    findThreadById: vi.fn(async () => ({ id: "24b19287-75b8-4a3e-9c10-691908479405" })),
    ...deps.chatRepository,
  };

  const chatAttachmentRecognitionService = {
    recognizeAttachment: vi.fn(async () => ({
      status: "ready",
      recognition: null,
      failureReason: null,
      linkedDocumentId: null,
      expiresAt: null,
    })),
    ...deps.chatAttachmentRecognitionService,
  };

  const chatAttachmentClassifierService = {
    classify: vi.fn(async () => ({
      category: "food_photo",
      confidence: "high",
      rationale: "Food photo",
      suggestedAction: "run_category_recognition",
      mealContextLabel: "Second meal",
      classificationProviderId: "test",
      classificationMethod: "vision",
    })),
    shouldBypassProviderForAttachment: vi.fn(() => false),
    ...(deps.chatAttachmentClassifierService ?? {}),
  };

  const service = new ChatAttachmentsService(
    chatAttachmentsRepository as never,
    chatRepository as never,
    chatAttachmentRecognitionService as never,
    chatAttachmentClassifierService as never,
    {
      resolveFromAuth: async () => user,
    } as never,
    createDefaultAiBehaviorConfigService(),
  );

  return {
    service,
    chatAttachmentsRepository,
    chatAttachmentRecognitionService,
    chatAttachmentClassifierService,
  };
}

function createRepositoryWithStatefulAttachment(baseAttachment: Record<string, unknown>) {
  const normalizeDate = (value: unknown) =>
    value instanceof Date ? value : new Date(value as string);

  let state = {
    ...baseAttachment,
    createdAt: normalizeDate(baseAttachment.createdAt),
    updatedAt: normalizeDate(baseAttachment.updatedAt),
    ...(baseAttachment.expiresAt != null
      ? { expiresAt: normalizeDate(baseAttachment.expiresAt) }
      : {}),
  };

  return {
    findByIdForUser: vi.fn(async () => state),
    update: vi.fn(async (_userId: string, _id: string, patch: unknown) => {
      const patchRecord = patch as Record<string, unknown>;
      state = {
        ...state,
        ...patchRecord,
        ...(patchRecord.createdAt != null
          ? { createdAt: normalizeDate(patchRecord.createdAt) }
          : {}),
        ...(patchRecord.updatedAt != null
          ? { updatedAt: normalizeDate(patchRecord.updatedAt) }
          : {}),
        ...(patchRecord.expiresAt != null
          ? { expiresAt: normalizeDate(patchRecord.expiresAt) }
          : {}),
      };
      return state;
    }),
    listByIdsForUser: vi.fn(async () => []),
  };
}


describe("ChatAttachmentsService", () => {
  beforeEach(() => {
    vi.spyOn(LocalChatAttachmentStorageAdapter.prototype, "read").mockResolvedValue(
      Buffer.from("fake-image"),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts provisional unclassified uploads after classify-first storage", async () => {
    const storeSpy = vi.spyOn(LocalChatAttachmentStorageAdapter.prototype, "store");
    const { service, chatAttachmentsRepository } = createService({});

    const record = await service.createAttachment(auth, {
      filename: "meal.jpg",
      mimeType: "image/jpeg",
      fileContentBase64: "dGVzdA==",
      consentVersion: "v1",
    });

    expect(storeSpy).toHaveBeenCalledOnce();
      expect(chatAttachmentsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "food_photo",
          categorySource: "ai_classified",
          status: "queued",
        storageKey: expect.stringMatching(/^5d6e7f84/),
        linkedImageRefId: expect.any(String),
      }),
    );
    expect(record.category).toBe("food_photo");
    expect(record.uploadClassificationMeta?.providerId).toBeDefined();
  });

  describe("classify-first provisional uploads", () => {
    let storeSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      storeSpy = vi.spyOn(LocalChatAttachmentStorageAdapter.prototype, "store");
    });

    it("does not store medical images without consent at upload time", async () => {
      const { service, chatAttachmentsRepository } = createService({
        chatAttachmentClassifierService: createLocalClassifierBinding(),
      });

      const record = await service.createAttachment(auth, {
        filename: "blood-report.jpg",
        mimeType: "image/jpeg",
        fileContentBase64: "dGVzdA==",
        consentVersion: "v1",
      });

      expect(storeSpy).not.toHaveBeenCalled();
      expect(chatAttachmentsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "medical_document",
          status: "needs_consent",
          storageKey: null,
        }),
      );
      expect(record.storageKey).toBeNull();
      expect(record.uploadClassificationMeta?.method).toBe("dev_heuristic");
    });

    it("does not store ambiguous uploads as food by default", async () => {
      const { service, chatAttachmentsRepository } = createService({
        chatAttachmentClassifierService: createLocalClassifierBinding(),
      });

      const record = await service.createAttachment(auth, {
        filename: "IMG_1234.jpg",
        mimeType: "image/jpeg",
        fileContentBase64: "dGVzdA==",
        consentVersion: "v1",
      });

      expect(storeSpy).not.toHaveBeenCalled();
      expect(chatAttachmentsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "unclassified",
          status: "needs_review",
          storageKey: null,
        }),
      );
      expect(record.status).toBe("needs_review");
    });

    it("does not force medical_document for PDFs from MIME alone", async () => {
      const { service, chatAttachmentsRepository } = createService({
        chatAttachmentClassifierService: createLocalClassifierBinding(),
      });

      const record = await service.createAttachment(auth, {
        category: "medical_document",
        categorySource: "mime_inferred",
        filename: "document.pdf",
        mimeType: "application/pdf",
        fileContentBase64: "dGVzdA==",
        consentVersion: "v1",
      });

      expect(storeSpy).not.toHaveBeenCalled();
      expect(chatAttachmentsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "unclassified",
          status: "needs_review",
          storageKey: null,
        }),
      );
      expect(record.category).toBe("unclassified");
    });

    it("stores explicit user-selected workout uploads", async () => {
      const { service, chatAttachmentsRepository } = createService({
        chatAttachmentClassifierService: createLocalClassifierBinding(),
      });

      const record = await service.createAttachment(auth, {
        category: "workout_attachment",
        categorySource: "user_selected",
        filename: "volleyball-practice.jpg",
        mimeType: "image/jpeg",
        fileContentBase64: "dGVzdA==",
        consentVersion: "v1",
      });

      expect(storeSpy).toHaveBeenCalledOnce();
      expect(chatAttachmentsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "workout_attachment",
          categorySource: "user_selected",
          status: "queued",
          storageKey: expect.stringMatching(/^5d6e7f84/),
        }),
      );
      expect(record.uploadClassificationMeta?.method).toBe("user_selected");
    });
  });

  it("rejects unsupported MIME types on upload", async () => {
    const { service } = createService({});

    await expect(
      service.createAttachment(auth, {
        filename: "report.exe",
        mimeType: "application/octet-stream",
        fileContentBase64: "dGVzdA==",
        consentVersion: "v1",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects oversized uploads", async () => {
    const { service } = createService({});
    const oversized = Buffer.alloc(10_000_001).toString("base64");

    await expect(
      service.createAttachment(auth, {
        category: "food_photo",
        filename: "meal.jpg",
        mimeType: "image/jpeg",
        fileContentBase64: oversized,
        consentVersion: "v1",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects medical uploads without upload_storage consent", async () => {
    const { service } = createService({});

    await expect(
      service.createAttachment(auth, {
        category: "medical_document",
        filename: "labs.pdf",
        mimeType: "application/pdf",
        fileContentBase64: "dGVzdA==",
        consentVersion: "v1",
        documentType: "lab_report",
        documentTitle: "Labs",
        consentScopes: ["parse_ocr"],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("assertOwnedAttachmentRefs rejects cross-user refs", async () => {
    const { service } = createService({
      chatAttachmentsRepository: {
        listByIdsForUser: vi.fn(async () => []),
      },
    });

    await expect(
      service.assertOwnedAttachmentRefs(user.id, ["a1000001-0000-4000-8000-000000000001"]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("grantConsent applies only to medical document attachments", async () => {
    const { service } = createService({
      chatAttachmentsRepository: {
        findByIdForUser: vi.fn(async () => ({
          id: "a1000001-0000-4000-8000-000000000001",
          userId: user.id,
          category: "food_photo",
          status: "ready",
          filename: "meal.jpg",
          mimeType: "image/jpeg",
          fileSizeBytes: 4,
          storageKey: "local://attachments/meal.jpg",
          linkedDocumentId: null,
          linkedImageRefId: "a1000001-0000-4000-8000-000000000001",
          consent: null,
          recognition: null,
          failureReason: null,
          retentionPolicy: "ephemeral_recognition",
          expiresAt: null,
          threadId: null,
          messageId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })),
      },
    });

    await expect(
      service.grantConsent(auth, "a1000001-0000-4000-8000-000000000001", {
        consentScopes: ["upload_storage"],
        consentVersion: "v1",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("grantConsent accepts document metadata and re-upload for purged medical attachments", async () => {
    const { service, chatAttachmentsRepository } = createService({
      chatAttachmentsRepository: createRepositoryWithStatefulAttachment({
        id: "d1000002-0000-4000-8000-000000000002",
        userId: user.id,
        threadId: null,
        messageId: null,
        category: "medical_document",
        status: "needs_consent",
        filename: "scan.jpg",
        mimeType: "image/jpeg",
        fileSizeBytes: 4,
        storageKey: null,
        linkedDocumentId: null,
        linkedImageRefId: null,
        consent: null,
        recognition: null,
        failureReason:
          "Explicit consent is required before processing medical documents in chat.",
        retentionPolicy: "document_consent_rules",
        expiresAt: null,
        createdAt: "2026-05-26T12:00:00.000Z",
        updatedAt: "2026-05-26T12:00:00.000Z",
      }),
    });

    const record = await service.grantConsent(auth, "d1000002-0000-4000-8000-000000000002", {
      consentScopes: ["upload_storage", "parse_ocr"],
      consentVersion: "v1",
      documentType: "lab_report",
      documentTitle: "Lab screenshot",
      fileContentBase64: "dGVzdA==",
    });

    expect(chatAttachmentsRepository.update).toHaveBeenCalledWith(
      user.id,
      "d1000002-0000-4000-8000-000000000002",
      expect.objectContaining({
        status: "queued",
        storageKey: expect.stringMatching(/^5d6e7f84/),
        consent: expect.objectContaining({
          documentType: "lab_report",
          documentTitle: "Lab screenshot",
          consentScopes: ["upload_storage", "parse_ocr"],
        }),
      }),
    );
    expect(record.status).toBe("queued");
    expect(record.consent?.documentType).toBe("lab_report");
  });

  it("grantConsent rejects purged medical attachments without re-upload content", async () => {
    const { service } = createService({
      chatAttachmentsRepository: createRepositoryWithStatefulAttachment({
        id: "d1000002-0000-4000-8000-000000000002",
        userId: user.id,
        threadId: null,
        messageId: null,
        category: "medical_document",
        status: "needs_consent",
        filename: "scan.jpg",
        mimeType: "image/jpeg",
        fileSizeBytes: 4,
        storageKey: null,
        linkedDocumentId: null,
        linkedImageRefId: null,
        consent: null,
        recognition: null,
        failureReason:
          "Explicit consent is required before processing medical documents in chat.",
        retentionPolicy: "document_consent_rules",
        expiresAt: null,
        createdAt: "2026-05-26T12:00:00.000Z",
        updatedAt: "2026-05-26T12:00:00.000Z",
      }),
    });

    await expect(
      service.grantConsent(auth, "d1000002-0000-4000-8000-000000000002", {
        consentScopes: ["upload_storage", "parse_ocr"],
        consentVersion: "v1",
        documentType: "lab_report",
        documentTitle: "Lab screenshot",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("recognizeAttachment returns attachment record without proposal candidates", async () => {
    const { service } = createService({
      chatAttachmentsRepository: {
        findByIdForUser: vi.fn(async () => ({
          id: "a1000001-0000-4000-8000-000000000001",
          userId: user.id,
          category: "food_photo",
          status: "queued",
          filename: "meal.jpg",
          mimeType: "image/jpeg",
          fileSizeBytes: 4,
          storageKey: "local://attachments/meal.jpg",
          linkedDocumentId: null,
          linkedImageRefId: "a1000001-0000-4000-8000-000000000001",
          consent: null,
          recognition: null,
          failureReason: null,
          retentionPolicy: "ephemeral_recognition",
          expiresAt: null,
          threadId: null,
          messageId: null,
          createdAt: new Date("2026-05-26T12:00:00.000Z"),
          updatedAt: new Date("2026-05-26T12:00:00.000Z"),
        })),
      },
    });

    const result = await service.recognizeAttachment(
      auth,
      "a1000001-0000-4000-8000-000000000001",
      {},
    );

    expect(result.attachment.id).toBe("a1000001-0000-4000-8000-000000000001");
    expect(result).not.toHaveProperty("proposalCandidates");
  });

  it("getAttachment throws when attachment is not owned", async () => {
    const { service } = createService({
      chatAttachmentsRepository: {
        findByIdForUser: vi.fn(async () => null),
      },
    });

    await expect(
      service.getAttachment(auth, "a1000001-0000-4000-8000-000000000001"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("assertOwnedAttachmentRefs rejects expired ephemeral refs", async () => {
    const { service } = createService({
      chatAttachmentsRepository: {
        listByIdsForUser: vi.fn(async () => [
          {
            id: "a1000001-0000-4000-8000-000000000001",
            userId: user.id,
            category: "food_photo",
            status: "ready",
            filename: "meal.jpg",
            mimeType: "image/jpeg",
            fileSizeBytes: 4,
            storageKey: "local://attachments/meal.jpg",
            linkedDocumentId: null,
            linkedImageRefId: "a1000001-0000-4000-8000-000000000001",
            consent: null,
            recognition: null,
            failureReason: null,
            retentionPolicy: "ephemeral_recognition",
            expiresAt: new Date("2026-05-25T12:00:00.000Z"),
            threadId: null,
            messageId: null,
            createdAt: new Date("2026-05-24T12:00:00.000Z"),
            updatedAt: new Date("2026-05-24T12:00:00.000Z"),
          },
        ]),
      },
    });

    await expect(
      service.assertOwnedAttachmentRefs(user.id, ["a1000001-0000-4000-8000-000000000001"]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("recognizeAttachment rejects expired refs before provider calls", async () => {
    const recognizeAttachment = vi.fn();

    const { service } = createService({
      chatAttachmentsRepository: {
        findByIdForUser: vi.fn(async () => ({
          id: "a1000001-0000-4000-8000-000000000001",
          userId: user.id,
          category: "food_photo",
          status: "ready",
          filename: "meal.jpg",
          mimeType: "image/jpeg",
          fileSizeBytes: 4,
          storageKey: "local://attachments/meal.jpg",
          linkedDocumentId: null,
          linkedImageRefId: "a1000001-0000-4000-8000-000000000001",
          consent: null,
          recognition: null,
          failureReason: null,
          retentionPolicy: "ephemeral_recognition",
          expiresAt: new Date("2026-05-25T12:00:00.000Z"),
          threadId: null,
          messageId: null,
          createdAt: new Date("2026-05-24T12:00:00.000Z"),
          updatedAt: new Date("2026-05-24T12:00:00.000Z"),
        })),
      },
      chatAttachmentRecognitionService: {
        recognizeAttachment,
      },
    });

    await expect(
      service.recognizeAttachment(auth, "a1000001-0000-4000-8000-000000000001", {}),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(recognizeAttachment).not.toHaveBeenCalled();
  });

  it("recognizeAttachment uses stored category and validates MIME before recognition", async () => {
    const recognizeAttachment = vi.fn(async () => ({
      status: "ready",
      recognition: null,
      failureReason: null,
      linkedDocumentId: null,
      expiresAt: new Date("2026-05-27T12:00:00.000Z"),
    }));

    const { service, chatAttachmentRecognitionService } = createService({
      chatAttachmentsRepository: {
        findByIdForUser: vi.fn(async () => ({
          id: "a1000001-0000-4000-8000-000000000001",
          userId: user.id,
          category: "medical_document",
          status: "queued",
          filename: "labs.pdf",
          mimeType: "application/pdf",
          fileSizeBytes: 4,
          storageKey: "local://attachments/labs.pdf",
          linkedDocumentId: null,
          linkedImageRefId: null,
          consent: {
            consentScopes: ["upload_storage", "parse_ocr"],
            consentVersion: "v1",
            consentGrantedAt: "2026-05-26T12:00:00.000Z",
            documentType: "lab_report",
            documentTitle: "Labs",
          },
          recognition: null,
          failureReason: null,
          retentionPolicy: "document_consent_rules",
          expiresAt: null,
          threadId: null,
          messageId: null,
          createdAt: new Date("2026-05-26T12:00:00.000Z"),
          updatedAt: new Date("2026-05-26T12:00:00.000Z"),
        })),
      },
      chatAttachmentRecognitionService: {
        recognizeAttachment,
      },
    });

    await service.recognizeAttachment(auth, "a1000001-0000-4000-8000-000000000001", {});

    expect(chatAttachmentRecognitionService.recognizeAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "medical_document",
        attachment: expect.objectContaining({
          category: "medical_document",
          mimeType: "application/pdf",
        }),
      }),
    );
  });
});
