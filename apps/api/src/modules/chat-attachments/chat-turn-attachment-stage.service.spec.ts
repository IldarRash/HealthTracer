import { BadRequestException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultAiBehaviorConfigService, createDefaultLocalChatAttachmentClassificationProvider } from "../ai/test-ai-behavior-fixtures.js";
import { ChatAttachmentClassifierService } from "./chat-attachment-classifier.service.js";
import { ChatAttachmentsService } from "./chat-attachments.service.js";
import { ChatTurnAttachmentStageService } from "./chat-turn-attachment-stage.service.js";
import { LocalChatAttachmentStorageAdapter } from "./local-chat-attachment-storage.js";

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

function createUnclassifiedQueuedAttachment(overrides: Partial<Record<string, unknown>> = {}) {
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
    listByIdsForUser: vi.fn(async () => [state]),
  };
}

function createStageService(deps: {
  chatAttachmentsRepository?: Record<string, unknown>;
  chatAttachmentRecognitionService?: Record<string, unknown>;
  chatAttachmentClassifierService?: Record<string, unknown>;
  aiBehaviorConfigService?: ReturnType<typeof createDefaultAiBehaviorConfigService>;
}) {
  const aiBehaviorConfigService =
    deps.aiBehaviorConfigService ?? createDefaultAiBehaviorConfigService();

  const chatAttachmentsRepository = {
    create: vi.fn(),
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

  const chatAttachmentRecognitionService = {
    recognizeAttachmentContext: vi.fn(async () => ({
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
    ...(deps.chatAttachmentClassifierService ?? {}),
  };

  const chatAttachmentsService = new ChatAttachmentsService(
    chatAttachmentsRepository as never,
    { findThreadById: vi.fn() } as never,
    chatAttachmentRecognitionService as never,
    chatAttachmentClassifierService as never,
    { resolveFromAuth: async () => user } as never,
    aiBehaviorConfigService,
  );

  const stageService = new ChatTurnAttachmentStageService(
    chatAttachmentsService,
    chatAttachmentClassifierService as never,
    chatAttachmentRecognitionService as never,
    aiBehaviorConfigService,
  );

  return {
    stageService,
    chatAttachmentsRepository,
    chatAttachmentRecognitionService,
    chatAttachmentClassifierService,
    chatAttachmentsService,
  };
}

describe("ChatTurnAttachmentStageService", () => {
  beforeEach(() => {
    vi.spyOn(LocalChatAttachmentStorageAdapter.prototype, "read").mockResolvedValue(
      Buffer.from("fake-image"),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects invalid attachment refs before post-message stages", async () => {
    const { stageService } = createStageService({
      chatAttachmentsRepository: {
        listByIdsForUser: vi.fn(async () => [
      {
        ...createUnclassifiedQueuedAttachment(),
        status: "recognizing",
        createdAt: new Date("2026-05-26T12:00:00.000Z"),
        updatedAt: new Date("2026-05-26T12:00:00.000Z"),
      },
    ]),
      },
    });

    await expect(
      stageService.validateRefsForSend(user.id, ["a1000001-0000-4000-8000-000000000001"]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("classifies queued unclassified food photos on send with meal context", async () => {
    const attachmentId = "a1000001-0000-4000-8000-000000000001";
    const recognizeAttachmentContext = vi.fn(async () => ({
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
      createDefaultLocalChatAttachmentClassificationProvider(),
    );

    const { stageService, chatAttachmentRecognitionService } = createStageService({
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
      chatAttachmentRecognitionService: { recognizeAttachmentContext },
    });

    const result = await stageService.runTurnStages({
      auth,
      userId: user.id,
      threadId: "24b19287-75b8-4a3e-9c10-691908479405",
      messageId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      messageContent: "второй прием пищи",
      attachmentRefIds: [attachmentId],
      todayIsoDate: "2026-05-26",
    });

    expect(chatAttachmentRecognitionService.recognizeAttachmentContext).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "food_photo",
        messageContext: {
          mealContextLabel: "Second meal",
          boundedMessage: "второй прием пищи",
        },
      }),
    );
    expect(result?.attachments[0]?.category).toBe("food_photo");
    expect(result?.attachments[0]?.status).toBe("ready");
    expect(result?.contextSummaries[0]?.routingCapabilityId).toBe("attachment_food_photo");
  });

  it("routes medical PDFs to needs_consent without running recognition", async () => {
    const recognizeAttachmentContext = vi.fn();
    const attachmentId = "d1000001-0000-4000-8000-000000000001";

    const { stageService, chatAttachmentsRepository } = createStageService({
      chatAttachmentsRepository: createRepositoryWithStatefulAttachment(
        createUnclassifiedQueuedAttachment({
          id: attachmentId,
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
      chatAttachmentRecognitionService: { recognizeAttachmentContext },
    });

    const result = await stageService.runTurnStages({
      auth,
      userId: user.id,
      threadId: "24b19287-75b8-4a3e-9c10-691908479405",
      messageId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      messageContent: "here are my lab results",
      attachmentRefIds: [attachmentId],
      todayIsoDate: "2026-05-26",
    });

    expect(recognizeAttachmentContext).not.toHaveBeenCalled();
    expect(chatAttachmentsRepository.update).toHaveBeenCalledWith(
      user.id,
      attachmentId,
      expect.objectContaining({
        category: "medical_document",
        status: "needs_consent",
        storageKey: null,
      }),
    );
    expect(result?.attachments[0]?.status).toBe("needs_consent");
    expect(result?.contextSummaries[0]?.contextHint).toContain("consent");
  });

  it("classifies workout attachments from activity messages and runs recognition", async () => {
    const attachmentId = "c1000001-0000-4000-8000-000000000001";
    const recognizeAttachmentContext = vi.fn(async () => ({
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
      createDefaultLocalChatAttachmentClassificationProvider(),
    );

    const { stageService } = createStageService({
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
      chatAttachmentRecognitionService: { recognizeAttachmentContext },
    });

    const result = await stageService.runTurnStages({
      auth,
      userId: user.id,
      threadId: "24b19287-75b8-4a3e-9c10-691908479405",
      messageId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      messageContent: "заполни активность",
      attachmentRefIds: [attachmentId],
      todayIsoDate: "2026-05-26",
    });

    expect(result?.attachments[0]?.category).toBe("workout_attachment");
    expect(result?.contextSummaries[0]?.routingCapabilityId).toBe("attachment_workout");
  });

  it("routes ambiguous jpeg uploads to needs_review without food recognition", async () => {
    const recognizeAttachmentContext = vi.fn();
    const classifier = new ChatAttachmentClassifierService(
      createDefaultLocalChatAttachmentClassificationProvider(),
    );
    const classifySpy = vi.fn(async (input: never) =>
      classifier.classify({
        ...(input as Record<string, unknown>),
        content: Buffer.from("fake-image"),
      } as never),
    );

    const { stageService } = createStageService({
      chatAttachmentsRepository: createRepositoryWithStatefulAttachment(
        createUnclassifiedQueuedAttachment({
          id: "a1000099-0000-4000-8000-000000000099",
          filename: "IMG_1234.jpg",
        }),
      ),
      chatAttachmentClassifierService: { classify: classifySpy },
      chatAttachmentRecognitionService: { recognizeAttachmentContext },
    });

    const result = await stageService.runTurnStages({
      auth,
      userId: user.id,
      threadId: "24b19287-75b8-4a3e-9c10-691908479405",
      messageId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      messageContent: "",
      attachmentRefIds: ["a1000099-0000-4000-8000-000000000099"],
      todayIsoDate: "2026-05-26",
    });

    expect(recognizeAttachmentContext).not.toHaveBeenCalled();
    expect(result?.attachments[0]?.category).toBe("unclassified");
    expect(result?.attachments[0]?.status).toBe("needs_review");
    expect(result?.contextSummaries[0]?.contextHint).toContain("confidently classify");
  });

  it("falls back to default stage order when attachment config is invalid", async () => {
    const invalidConfigService = createDefaultAiBehaviorConfigService();
    const defaults = invalidConfigService.getAttachmentBehavior();
    vi.spyOn(invalidConfigService, "getAttachmentBehavior").mockReturnValue({
      ...defaults,
      turnStages: {
        order: ["validate_refs", "link_to_message"],
      },
    });

    const recognizeAttachmentContext = vi.fn();
    const { stageService } = createStageService({
      aiBehaviorConfigService: invalidConfigService,
      chatAttachmentsRepository: createRepositoryWithStatefulAttachment(
        createUnclassifiedQueuedAttachment({
          id: "a1000099-0000-4000-8000-000000000099",
          filename: "IMG_1234.jpg",
        }),
      ),
      chatAttachmentClassifierService: {
        classify: vi.fn(async () => ({
          category: "food_photo",
          confidence: "low",
          rationale: "Ambiguous",
          suggestedAction: "manual_fallback",
          mealContextLabel: null,
        })),
      },
      chatAttachmentRecognitionService: { recognizeAttachmentContext },
    });

    const result = await stageService.runTurnStages({
      auth,
      userId: user.id,
      threadId: "24b19287-75b8-4a3e-9c10-691908479405",
      messageId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      messageContent: "",
      attachmentRefIds: ["a1000099-0000-4000-8000-000000000099"],
      todayIsoDate: "2026-05-26",
    });

    expect(recognizeAttachmentContext).not.toHaveBeenCalled();
    expect(result?.attachments[0]?.status).toBe("needs_review");
  });

  it("skips already-recognized attachments during classify and recognize stages", async () => {
    const recognizeAttachmentContext = vi.fn();
    const readyAttachment = {
      ...createUnclassifiedQueuedAttachment(),
      category: "food_photo" as const,
      status: "ready" as const,
      linkedImageRefId: "a1000001-0000-4000-8000-000000000001",
      recognition: {
        category: "food_photo" as const,
        attachmentRefId: "a1000001-0000-4000-8000-000000000001",
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
    };

    const { stageService, chatAttachmentClassifierService } = createStageService({
      chatAttachmentsRepository: createRepositoryWithStatefulAttachment(readyAttachment),
      chatAttachmentRecognitionService: { recognizeAttachmentContext },
    });

    const result = await stageService.runTurnStages({
      auth,
      userId: user.id,
      threadId: "24b19287-75b8-4a3e-9c10-691908479405",
      messageId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      messageContent: "Second meal",
      attachmentRefIds: [readyAttachment.id],
      todayIsoDate: "2026-05-26",
    });

    expect(chatAttachmentClassifierService.classify).not.toHaveBeenCalled();
    expect(recognizeAttachmentContext).not.toHaveBeenCalled();
    expect(result?.attachments[0]?.status).toBe("ready");
  });
});
