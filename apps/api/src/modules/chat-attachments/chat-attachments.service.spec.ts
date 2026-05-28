import { BadRequestException, NotFoundException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatAttachmentClassifierService } from "./chat-attachment-classifier.service.js";
import { ChatAttachmentsService } from "./chat-attachments.service.js";
import { DevChatAttachmentClassificationProvider } from "./dev-chat-attachment-classification.provider.js";
import { LocalChatAttachmentStorageAdapter } from "./local-chat-attachment-storage.js";

const auth = {
  clerkUserId: "user_123",
  displayName: "Test User",
  email: "test@example.com",
};

function createDevClassifierBinding() {
  const classifier = new ChatAttachmentClassifierService(new DevChatAttachmentClassificationProvider());

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
    buildProposalCandidates: vi.fn(() => []),
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

function createUnclassifiedQueuedAttachment(
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    id: "a1000001-0000-4000-8000-000000000001",
    userId: user.id,
    threadId: null,
    messageId: null,
    category: "unclassified" as const,
    categorySource: "default_unclassified" as const,
    status: "queued" as const,
    filename: "meal.jpg",
    mimeType: "image/jpeg",
    fileSizeBytes: 4,
    storageKey: "local://attachments/meal.jpg",
    linkedDocumentId: null,
    linkedImageRefId: null,
    consent: null,
    recognition: null,
    failureReason: null,
    retentionPolicy: "ephemeral_recognition" as const,
    expiresAt: null,
    createdAt: "2026-05-26T12:00:00.000Z",
    updatedAt: "2026-05-26T12:00:00.000Z",
    ...overrides,
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
        chatAttachmentClassifierService: createDevClassifierBinding(),
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
        chatAttachmentClassifierService: createDevClassifierBinding(),
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
        chatAttachmentClassifierService: createDevClassifierBinding(),
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
        chatAttachmentClassifierService: createDevClassifierBinding(),
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

  it("recognizeAttachment returns proposal candidates without persisting structured writes", async () => {
    const buildProposalCandidates = vi.fn(() => [
      {
        intent: "log_nutrition_incident",
        targetDomain: "nutrition",
        title: "Log meal from photo",
        reason: "Review meal estimate",
        proposedChanges: { attachmentRefId: "a1000001-0000-4000-8000-000000000001" },
        attachmentRefId: "a1000001-0000-4000-8000-000000000001",
      },
    ]);

    const { service, chatAttachmentRecognitionService } = createService({
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
      chatAttachmentRecognitionService: {
        buildProposalCandidates,
      },
    });

    const result = await service.recognizeAttachment(
      auth,
      "a1000001-0000-4000-8000-000000000001",
      {},
    );

    expect(chatAttachmentRecognitionService.recognizeAttachment).toHaveBeenCalledOnce();
    expect(result.proposalCandidates).toHaveLength(1);
    expect(result.proposalCandidates[0]?.intent).toBe("log_nutrition_incident");
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

  describe("classifyAndRecognizeAttachmentsForMessage", () => {
    it("classifies queued unclassified food photos on send with meal context", async () => {
      const attachmentId = "a1000001-0000-4000-8000-000000000001";
      const recognizeAttachment = vi.fn(async () => ({
        status: "ready" as const,
        recognition: {
          category: "food_photo" as const,
          attachmentRefId: attachmentId,
          analysis: {
            candidates: [
              {
                items: [{ name: "Salad", calories: 320 }],
                estimatedCalories: 320,
                estimatedMacros: { proteinGrams: 12, carbsGrams: 20, fatGrams: 18 },
                confidence: "medium" as const,
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
            confidence: "medium" as const,
          },
        },
        failureReason: null,
        linkedDocumentId: null,
        expiresAt: new Date("2026-05-27T12:00:00.000Z"),
      }));

      const classifier = new ChatAttachmentClassifierService(
        new DevChatAttachmentClassificationProvider(),
      );

      const { service, chatAttachmentRecognitionService } = createService({
        chatAttachmentsRepository: createRepositoryWithStatefulAttachment(
          createUnclassifiedQueuedAttachment(),
        ),
        chatAttachmentClassifierService: {
          classify: vi.fn(async (input) =>
            classifier.classify({
              ...input,
              content: Buffer.from("fake-image"),
            }),
          ),
        },
        chatAttachmentRecognitionService: { recognizeAttachment },
      });

      const result = await service.classifyAndRecognizeAttachmentsForMessage({
        auth,
        userId: user.id,
        messageContent: "второй прием пищи",
        attachments: [createUnclassifiedQueuedAttachment()],
      });

      expect(chatAttachmentRecognitionService.recognizeAttachment).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "food_photo",
          messageContext: {
            mealContextLabel: "Second meal",
            boundedMessage: "второй прием пищи",
          },
        }),
      );
      expect(result[0]?.category).toBe("food_photo");
      expect(result[0]?.status).toBe("ready");
      expect(result[0]?.linkedImageRefId).toBe(attachmentId);
    });

    it("routes medical PDFs to needs_consent without running recognition", async () => {
      const recognizeAttachment = vi.fn();

      const { service, chatAttachmentsRepository } = createService({
          chatAttachmentsRepository: createRepositoryWithStatefulAttachment(
            createUnclassifiedQueuedAttachment({
              id: "d1000001-0000-4000-8000-000000000001",
              filename: "labs.pdf",
              mimeType: "application/pdf",
              storageKey: "local://attachments/labs.pdf",
            }),
          ),
          chatAttachmentClassifierService: {
            classify: vi.fn(async () => ({
              category: "medical_document",
              confidence: "high",
              rationale: "PDF upload",
              suggestedAction: "request_medical_consent",
              mealContextLabel: null,
            })),
          },
          chatAttachmentRecognitionService: { recognizeAttachment },
        });

      const result = await service.classifyAndRecognizeAttachmentsForMessage({
        auth,
        userId: user.id,
        messageContent: "here are my lab results",
        attachments: [
          createUnclassifiedQueuedAttachment({
            id: "d1000001-0000-4000-8000-000000000001",
            filename: "labs.pdf",
            mimeType: "application/pdf",
            storageKey: "local://attachments/labs.pdf",
          }),
        ],
      });

      expect(recognizeAttachment).not.toHaveBeenCalled();
      expect(chatAttachmentsRepository.update).toHaveBeenCalledWith(
        user.id,
        "d1000001-0000-4000-8000-000000000001",
        expect.objectContaining({
          category: "medical_document",
          status: "needs_consent",
          storageKey: null,
        }),
      );
      expect(result[0]?.status).toBe("needs_consent");
      expect(result[0]?.recognition).toBeNull();
    });

    it("routes medical-signaled images to needs_consent without food recognition", async () => {
      const recognizeAttachment = vi.fn();
      const foodRecognize = vi.fn();
      const classifier = new ChatAttachmentClassifierService(
        new DevChatAttachmentClassificationProvider(),
      );

      const { service } = createService({
        chatAttachmentsRepository: createRepositoryWithStatefulAttachment(
          createUnclassifiedQueuedAttachment({
            id: "d1000002-0000-4000-8000-000000000002",
            filename: "scan.jpg",
            mimeType: "image/jpeg",
            storageKey: "local://attachments/scan.jpg",
          }),
        ),
        chatAttachmentClassifierService: {
          classify: vi.fn(async (input) =>
            classifier.classify({
              ...input,
              content: Buffer.from("fake-image"),
            }),
          ),
        },
        chatAttachmentRecognitionService: {
          recognizeAttachment: recognizeAttachment.mockImplementation(async (input) => {
            if (input.category === "food_photo") {
              await foodRecognize();
            }

            return {
              status: "ready",
              recognition: null,
              failureReason: null,
              linkedDocumentId: null,
              expiresAt: null,
            };
          }),
        },
      });

      const result = await service.classifyAndRecognizeAttachmentsForMessage({
        auth,
        userId: user.id,
        messageContent: "here are my lab results",
        attachments: [
          createUnclassifiedQueuedAttachment({
            id: "d1000002-0000-4000-8000-000000000002",
            filename: "scan.jpg",
            mimeType: "image/jpeg",
            storageKey: "local://attachments/scan.jpg",
          }),
        ],
      });

      expect(recognizeAttachment).not.toHaveBeenCalled();
      expect(foodRecognize).not.toHaveBeenCalled();
      expect(result[0]?.category).toBe("medical_document");
      expect(result[0]?.status).toBe("needs_consent");
      expect(result[0]?.storageKey).toBeNull();
      expect(result[0]?.recognition).toBeNull();
    });

    it("routes Russian medical image signals to needs_consent without food recognition", async () => {
      const recognizeAttachment = vi.fn();
      const foodRecognize = vi.fn();
      const classifier = new ChatAttachmentClassifierService(
        new DevChatAttachmentClassificationProvider(),
      );

      const { service } = createService({
        chatAttachmentsRepository: createRepositoryWithStatefulAttachment(
          createUnclassifiedQueuedAttachment({
            id: "d1000003-0000-4000-8000-000000000003",
            filename: "photo.png",
            mimeType: "image/png",
            storageKey: "local://attachments/photo.png",
          }),
        ),
        chatAttachmentClassifierService: {
          classify: vi.fn(async (input) =>
            classifier.classify({
              ...input,
              content: Buffer.from("fake-image"),
            }),
          ),
        },
        chatAttachmentRecognitionService: {
          recognizeAttachment: recognizeAttachment.mockImplementation(async (input) => {
            if (input.category === "food_photo") {
              await foodRecognize();
            }

            return {
              status: "ready",
              recognition: null,
              failureReason: null,
              linkedDocumentId: null,
              expiresAt: null,
            };
          }),
        },
      });

      const result = await service.classifyAndRecognizeAttachmentsForMessage({
        auth,
        userId: user.id,
        messageContent: "вот мои анализы",
        attachments: [
          createUnclassifiedQueuedAttachment({
            id: "d1000003-0000-4000-8000-000000000003",
            filename: "photo.png",
            mimeType: "image/png",
            storageKey: "local://attachments/photo.png",
          }),
        ],
      });

      expect(recognizeAttachment).not.toHaveBeenCalled();
      expect(foodRecognize).not.toHaveBeenCalled();
      expect(result[0]?.category).toBe("medical_document");
      expect(result[0]?.status).toBe("needs_consent");
      expect(result[0]?.storageKey).toBeNull();
    });

    it("classifies workout attachments from activity messages and runs recognition", async () => {
      const attachmentId = "c1000001-0000-4000-8000-000000000001";
      const recognizeAttachment = vi.fn(async () => ({
        status: "ready" as const,
        recognition: {
          category: "workout_attachment" as const,
          attachmentRefId: attachmentId,
          attachmentKind: "exercise_photo" as const,
          sessionLabel: "Recognized training session",
          sessionDate: null,
          exercises: [{ name: "Row", target: "3 sets", sets: 3, reps: "8-10" }],
          suggestedIntent: "log_session_context" as const,
          planDraftTitle: null,
          provenance: {
            source: "dev_stub",
            providerId: "dev_workout_attachment",
            recognitionId: "f1000001-0000-4000-8000-000000000002",
            confidence: "medium" as const,
          },
          manualFallbackNotice: "Describe the workout in text.",
        },
        failureReason: null,
        linkedDocumentId: null,
        expiresAt: null,
      }));

      const classifier = new ChatAttachmentClassifierService(
        new DevChatAttachmentClassificationProvider(),
      );

      const { service, chatAttachmentRecognitionService } = createService({
        chatAttachmentsRepository: createRepositoryWithStatefulAttachment(
          createUnclassifiedQueuedAttachment({
            id: attachmentId,
            filename: "session.jpg",
          }),
        ),
        chatAttachmentClassifierService: {
          classify: vi.fn(async (input) =>
            classifier.classify({
              ...input,
              content: Buffer.from("fake-image"),
            }),
          ),
        },
        chatAttachmentRecognitionService: { recognizeAttachment },
      });

      const result = await service.classifyAndRecognizeAttachmentsForMessage({
        auth,
        userId: user.id,
        messageContent: "заполни активность",
        attachments: [
          createUnclassifiedQueuedAttachment({
            id: attachmentId,
            filename: "session.jpg",
          }),
        ],
      });

      expect(chatAttachmentRecognitionService.recognizeAttachment).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "workout_attachment",
        }),
      );
      expect(result[0]?.category).toBe("workout_attachment");
      if (result[0]?.recognition?.category === "workout_attachment") {
        expect(result[0].recognition.suggestedIntent).toBe("log_session_context");
      }
    });

    it("preserves user-selected workout category without food reclassification", async () => {
      const attachmentId = "c1000002-0000-4000-8000-000000000002";
      const recognizeAttachment = vi.fn(async () => ({
        status: "ready" as const,
        recognition: {
          category: "workout_attachment" as const,
          attachmentRefId: attachmentId,
          attachmentKind: "exercise_photo" as const,
          sessionLabel: "Recognized training session",
          sessionDate: null,
          exercises: [{ name: "Volleyball drill", target: "3 sets", sets: 3, reps: "8-10" }],
          suggestedIntent: "log_session_context" as const,
          planDraftTitle: null,
          provenance: {
            source: "dev_stub",
            providerId: "dev_workout_attachment",
            recognitionId: "f1000001-0000-4000-8000-000000000003",
            confidence: "medium" as const,
          },
          manualFallbackNotice: null,
        },
        failureReason: null,
        linkedDocumentId: null,
        expiresAt: null,
      }));

      const classifier = new ChatAttachmentClassifierService(
        new DevChatAttachmentClassificationProvider(),
      );
      const classifySpy = vi.fn(async (input: never) =>
        classifier.classify({
          ...(input as Record<string, unknown>),
          content: Buffer.from("fake-image"),
        } as never),
      );

      const preselectedAttachment = createUnclassifiedQueuedAttachment({
        id: attachmentId,
        category: "workout_attachment" as const,
        categorySource: "user_selected" as const,
        filename: "volleyball-practice.jpg",
      });

      const { service, chatAttachmentRecognitionService } = createService({
        chatAttachmentsRepository: createRepositoryWithStatefulAttachment(preselectedAttachment),
        chatAttachmentClassifierService: { classify: classifySpy },
        chatAttachmentRecognitionService: { recognizeAttachment },
      });

      const result = await service.classifyAndRecognizeAttachmentsForMessage({
        auth,
        userId: user.id,
        messageContent: "",
        attachments: [preselectedAttachment],
      });

      expect(classifySpy).toHaveBeenCalledOnce();
      expect(chatAttachmentRecognitionService.recognizeAttachment).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "workout_attachment",
        }),
      );
      expect(result[0]?.category).toBe("workout_attachment");
      expect(result[0]?.categorySource).toBe("user_selected");
      expect(result[0]?.recognition?.category).toBe("workout_attachment");
    });

    it("reclassifies upload-time ai_classified food to medical at send and purges bytes", async () => {
      const recognizeAttachment = vi.fn();
      const deleteSpy = vi.spyOn(LocalChatAttachmentStorageAdapter.prototype, "delete");
      const attachmentId = "d1000004-0000-4000-8000-000000000004";
      const uploadClassifiedFood = createUnclassifiedQueuedAttachment({
        id: attachmentId,
        category: "food_photo" as const,
        categorySource: "ai_classified" as const,
        filename: "scan.jpg",
        linkedImageRefId: attachmentId,
      });

      const { service, chatAttachmentsRepository } = createService({
        chatAttachmentsRepository: createRepositoryWithStatefulAttachment(uploadClassifiedFood),
        chatAttachmentClassifierService: {
          classify: vi.fn(async () => ({
            category: "medical_document",
            confidence: "high",
            rationale: "Message signals lab results.",
            suggestedAction: "request_medical_consent",
            mealContextLabel: null,
          })),
        },
        chatAttachmentRecognitionService: { recognizeAttachment },
      });

      const result = await service.classifyAndRecognizeAttachmentsForMessage({
        auth,
        userId: user.id,
        messageContent: "here are my lab results",
        attachments: [uploadClassifiedFood],
      });

      expect(recognizeAttachment).not.toHaveBeenCalled();
      expect(deleteSpy).toHaveBeenCalledWith("local://attachments/meal.jpg");
      expect(chatAttachmentsRepository.update).toHaveBeenCalledWith(
        user.id,
        attachmentId,
        expect.objectContaining({
          category: "medical_document",
          categorySource: "ai_classified",
          status: "needs_consent",
          storageKey: null,
        }),
      );
      expect(result[0]?.status).toBe("needs_consent");
      expect(result[0]?.storageKey).toBeNull();
      expect(result[0]?.recognition).toBeNull();
    });

    it("reclassifies upload-time ai_classified food to workout at send from message context", async () => {
      const attachmentId = "c1000004-0000-4000-8000-000000000004";
      const recognizeAttachment = vi.fn(async () => ({
        status: "ready" as const,
        recognition: {
          category: "workout_attachment" as const,
          attachmentRefId: attachmentId,
          attachmentKind: "exercise_photo" as const,
          sessionLabel: "Recognized training session",
          sessionDate: null,
          exercises: [{ name: "Row", target: "3 sets", sets: 3, reps: "8-10" }],
          suggestedIntent: "log_session_context" as const,
          planDraftTitle: null,
          provenance: {
            source: "dev_stub",
            providerId: "dev_workout_attachment",
            recognitionId: "f1000001-0000-4000-8000-000000000005",
            confidence: "medium" as const,
          },
          manualFallbackNotice: null,
        },
        failureReason: null,
        linkedDocumentId: null,
        expiresAt: null,
      }));

      const uploadClassifiedFood = createUnclassifiedQueuedAttachment({
        id: attachmentId,
        category: "food_photo" as const,
        categorySource: "ai_classified" as const,
        filename: "session.jpg",
        linkedImageRefId: attachmentId,
      });

      const { service, chatAttachmentRecognitionService } = createService({
        chatAttachmentsRepository: createRepositoryWithStatefulAttachment(uploadClassifiedFood),
        chatAttachmentClassifierService: {
          classify: vi.fn(async () => ({
            category: "workout_attachment",
            confidence: "high",
            rationale: "Activity message",
            suggestedAction: "run_category_recognition",
            mealContextLabel: null,
          })),
        },
        chatAttachmentRecognitionService: { recognizeAttachment },
      });

      const result = await service.classifyAndRecognizeAttachmentsForMessage({
        auth,
        userId: user.id,
        messageContent: "заполни активность",
        attachments: [uploadClassifiedFood],
      });

      expect(chatAttachmentRecognitionService.recognizeAttachment).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "workout_attachment",
        }),
      );
      expect(result[0]?.category).toBe("workout_attachment");
      expect(result[0]?.categorySource).toBe("ai_classified");
    });

    it("classifies ambiguous training filenames on send without food recognition", async () => {
      const attachmentId = "c1000003-0000-4000-8000-000000000003";
      const foodRecognize = vi.fn();
      const recognizeAttachment = vi.fn(async (input: { category: string }) => {
        if (input.category === "food_photo") {
          await foodRecognize();
        }

        expect(input.category).toBe("workout_attachment");

        return {
          status: "ready" as const,
          recognition: {
            category: "workout_attachment" as const,
            attachmentRefId: attachmentId,
            attachmentKind: "exercise_photo" as const,
            sessionLabel: "Recognized training session",
            sessionDate: null,
            exercises: [{ name: "Serve practice", target: "3 sets", sets: 3, reps: "8-10" }],
            suggestedIntent: "log_session_context" as const,
            planDraftTitle: null,
            provenance: {
              source: "dev_stub",
              providerId: "dev_workout_attachment",
              recognitionId: "f1000001-0000-4000-8000-000000000004",
              confidence: "medium" as const,
            },
            manualFallbackNotice: null,
          },
          failureReason: null,
          linkedDocumentId: null,
          expiresAt: null,
        };
      });

      const classifier = new ChatAttachmentClassifierService(
        new DevChatAttachmentClassificationProvider(),
      );

      const { service } = createService({
        chatAttachmentsRepository: createRepositoryWithStatefulAttachment(
          createUnclassifiedQueuedAttachment({
            id: attachmentId,
            filename: "volleyball-practice.jpg",
          }),
        ),
        chatAttachmentClassifierService: {
          classify: vi.fn(async (input) =>
            classifier.classify({
              ...input,
              content: Buffer.from("fake-image"),
            }),
          ),
        },
        chatAttachmentRecognitionService: { recognizeAttachment },
      });

      const result = await service.classifyAndRecognizeAttachmentsForMessage({
        auth,
        userId: user.id,
        messageContent: "",
        attachments: [
          createUnclassifiedQueuedAttachment({
            id: attachmentId,
            filename: "volleyball-practice.jpg",
          }),
        ],
      });

      expect(foodRecognize).not.toHaveBeenCalled();
      expect(result[0]?.category).toBe("workout_attachment");
      expect(result[0]?.linkedImageRefId).toBeNull();
    });

    it("routes ambiguous jpeg uploads to needs_review without food recognition", async () => {
      const recognizeAttachment = vi.fn();
      const classifier = new ChatAttachmentClassifierService(
        new DevChatAttachmentClassificationProvider(),
      );
      const classifySpy = vi.fn(async (input: never) =>
        classifier.classify({
          ...(input as Record<string, unknown>),
          content: Buffer.from("fake-image"),
        } as never),
      );

      const { service } = createService({
        chatAttachmentsRepository: createRepositoryWithStatefulAttachment(
          createUnclassifiedQueuedAttachment({
            id: "a1000099-0000-4000-8000-000000000099",
            filename: "IMG_1234.jpg",
          }),
        ),
        chatAttachmentClassifierService: { classify: classifySpy },
        chatAttachmentRecognitionService: { recognizeAttachment },
      });

      const result = await service.classifyAndRecognizeAttachmentsForMessage({
        auth,
        userId: user.id,
        messageContent: "",
        attachments: [
          createUnclassifiedQueuedAttachment({
            id: "a1000099-0000-4000-8000-000000000099",
            filename: "IMG_1234.jpg",
          }),
        ],
      });

      expect(classifySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          content: Buffer.from("fake-image"),
          attachment: expect.objectContaining({
            filename: "IMG_1234.jpg",
            category: "unclassified",
          }),
        }),
      );
      expect(recognizeAttachment).not.toHaveBeenCalled();
      expect(result[0]?.category).toBe("unclassified");
      expect(result[0]?.status).toBe("needs_review");
      expect(result[0]?.recognition).toBeNull();
    });

    it("skips attachments that are not pending message-first send", async () => {
      const recognizeAttachment = vi.fn();
      const readyAttachment = {
        ...createUnclassifiedQueuedAttachment(),
        category: "food_photo" as const,
        status: "ready" as const,
        linkedImageRefId: "a1000001-0000-4000-8000-000000000001",
        recognition: {
          category: "food_photo" as const,
          attachmentRefId: "a1000001-0000-4000-8000-000000000001",
          analysis: { candidates: [], lowConfidenceNotice: null },
          provenance: {
            source: "dev_stub",
            providerId: "dev_food_photo",
            recognitionId: "b1000001-0000-4000-8000-000000000002",
            confidence: "medium" as const,
          },
        },
      };

      const { service, chatAttachmentClassifierService } = createService({
          chatAttachmentRecognitionService: { recognizeAttachment },
        });

      const result = await service.classifyAndRecognizeAttachmentsForMessage({
        auth,
        userId: user.id,
        messageContent: "Second meal",
        attachments: [readyAttachment],
      });

      expect(chatAttachmentClassifierService.classify).not.toHaveBeenCalled();
      expect(recognizeAttachment).not.toHaveBeenCalled();
      expect(result[0]).toEqual(readyAttachment);
    });
  });
});
