import { BadRequestException, NotFoundException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatAttachmentClassifierService } from "./chat-attachment-classifier.service.js";
import { ChatAttachmentsService } from "./chat-attachments.service.js";

const auth = {
  clerkUserId: "user_123",
  displayName: "Test User",
  email: "test@example.com",
};

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
    classify: vi.fn(() => ({
      category: "food_photo",
      confidence: "high",
      rationale: "Food photo",
      suggestedAction: "run_category_recognition",
      mealContextLabel: "Second meal",
    })),
    ...deps.chatAttachmentClassifierService,
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
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts provisional unclassified uploads", async () => {
    const { service, chatAttachmentsRepository } = createService({});

    const record = await service.createAttachment(auth, {
      filename: "meal.jpg",
      mimeType: "image/jpeg",
      fileContentBase64: "dGVzdA==",
      consentVersion: "v1",
    });

    expect(chatAttachmentsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "unclassified",
        status: "queued",
        linkedImageRefId: null,
      }),
    );
    expect(record.category).toBe("unclassified");
  });

  it("rejects unsupported MIME types on upload", async () => {
    const { service } = createService({});

    await expect(
      service.createAttachment(auth, {
        category: "food_photo",
        filename: "report.pdf",
        mimeType: "application/pdf",
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

      const classifier = new ChatAttachmentClassifierService();

      const { service, chatAttachmentRecognitionService } = createService({
        chatAttachmentsRepository: createRepositoryWithStatefulAttachment(
          createUnclassifiedQueuedAttachment(),
        ),
        chatAttachmentClassifierService: {
          classify: vi.fn((input) => classifier.classify(input)),
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
            classify: vi.fn(() => ({
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
        }),
      );
      expect(result[0]?.status).toBe("needs_consent");
      expect(result[0]?.recognition).toBeNull();
    });

    it("routes medical-signaled images to needs_consent without food recognition", async () => {
      const recognizeAttachment = vi.fn();
      const foodRecognize = vi.fn();
      const classifier = new ChatAttachmentClassifierService();

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
          classify: vi.fn((input) => classifier.classify(input)),
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
      expect(result[0]?.recognition).toBeNull();
    });

    it("routes Russian medical image signals to needs_consent without food recognition", async () => {
      const recognizeAttachment = vi.fn();
      const foodRecognize = vi.fn();
      const classifier = new ChatAttachmentClassifierService();

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
          classify: vi.fn((input) => classifier.classify(input)),
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

      const classifier = new ChatAttachmentClassifierService();

      const { service, chatAttachmentRecognitionService } = createService({
        chatAttachmentsRepository: createRepositoryWithStatefulAttachment(
          createUnclassifiedQueuedAttachment({
            id: attachmentId,
            filename: "session.jpg",
          }),
        ),
        chatAttachmentClassifierService: {
          classify: vi.fn((input) => classifier.classify(input)),
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
