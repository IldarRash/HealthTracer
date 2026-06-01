import { BadRequestException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultAiBehaviorConfigService } from "../ai/test-ai-behavior-fixtures.js";
import { ChatAttachmentsService } from "./chat-attachments.service.js";
import { ChatTurnAttachmentStageService } from "./chat-turn-attachment-stage.service.js";
import { LocalChatAttachmentStorageAdapter } from "./local-chat-attachment-storage.js";

const user = {
  id: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
  displayName: "Test User",
  email: "test@example.com",
  timezone: "UTC",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function createQueuedAttachment(overrides: Partial<Record<string, unknown>> = {}) {
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
    createdAt: new Date("2026-05-26T12:00:00.000Z"),
    updatedAt: new Date("2026-05-26T12:00:00.000Z"),
    ...overrides,
  };
}

function createRepositoryWithStatefulAttachment(baseAttachment: Record<string, unknown>) {
  let state = { ...baseAttachment };

  return {
    findByIdForUser: vi.fn(async () => state),
    update: vi.fn(async (_userId: string, _id: string, patch: unknown) => {
      state = { ...state, ...(patch as Record<string, unknown>) };
      return state;
    }),
    listByIdsForUser: vi.fn(async () => [state]),
  };
}

function createStageService(deps: {
  chatAttachmentsRepository?: Record<string, unknown>;
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
      category: "unclassified",
      categorySource: "default_unclassified",
      status: "queued",
      filename: "meal.jpg",
      mimeType: "image/jpeg",
      fileSizeBytes: 4,
      storageKey: "local://attachments/meal.jpg",
      linkedDocumentId: null,
      linkedImageRefId: null,
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

  const chatAttachmentsService = new ChatAttachmentsService(
    chatAttachmentsRepository as never,
    { findThreadById: vi.fn() } as never,
    { resolveFromAuth: async () => user } as never,
    aiBehaviorConfigService,
  );

  const stageService = new ChatTurnAttachmentStageService(
    chatAttachmentsService,
    aiBehaviorConfigService,
  );

  return {
    stageService,
    chatAttachmentsRepository,
    chatAttachmentsService,
  };
}

describe("ChatTurnAttachmentStageService (plumbing-only, context-first)", () => {
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
            ...createQueuedAttachment(),
            status: "recognizing",
          },
        ]),
      },
    });

    await expect(
      stageService.validateRefsForSend(user.id, ["a1000001-0000-4000-8000-000000000001"]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("links attachment to message and applies retention policy for a food photo", async () => {
    const attachmentId = "a1000001-0000-4000-8000-000000000001";
    const repo = createRepositoryWithStatefulAttachment(
      createQueuedAttachment({
        id: attachmentId,
        category: "food_photo",
        categorySource: "user_selected",
        status: "queued",
        storageKey: "local://attachments/meal.jpg",
      }),
    );

    const { stageService } = createStageService({
      chatAttachmentsRepository: repo,
    });

    const result = await stageService.runTurnStages({
      userId: user.id,
      threadId: "24b19287-75b8-4a3e-9c10-691908479405",
      messageId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      attachmentRefIds: [attachmentId],
    });

    expect(result).not.toBeNull();
    expect(result?.attachmentMetadata[0]?.refId).toBe(attachmentId);
    expect(result?.attachmentMetadata[0]?.category).toBe("food_photo");
    expect(result?.attachmentMetadata[0]?.consentState).toBe("none");
    expect(result?.outcomes[0]?.attachmentRefId).toBe(attachmentId);
  });

  it("medical consent gate fires on user-declared medical_document category without consent", async () => {
    const attachmentId = "d1000001-0000-4000-8000-000000000001";
    const repo = createRepositoryWithStatefulAttachment(
      createQueuedAttachment({
        id: attachmentId,
        filename: "labs.pdf",
        mimeType: "application/pdf",
        category: "medical_document",
        categorySource: "user_selected",
        storageKey: "local://attachments/labs.pdf",
        consent: null,
      }),
    );

    const { stageService } = createStageService({
      chatAttachmentsRepository: repo,
    });

    const result = await stageService.runTurnStages({
      userId: user.id,
      threadId: "24b19287-75b8-4a3e-9c10-691908479405",
      messageId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      attachmentRefIds: [attachmentId],
    });

    expect(repo.update).toHaveBeenCalledWith(
      user.id,
      attachmentId,
      expect.objectContaining({
        category: "medical_document",
        status: "needs_consent",
        storageKey: null,
      }),
    );
    expect(result?.attachmentMetadata[0]?.consentState).toBe("needs_consent");
    expect(result?.outcomes[0]?.status).toBe("needs_consent");
  });

  it("medical consent gate fires on PDF MIME even when category is unclassified", async () => {
    const attachmentId = "d1000002-0000-4000-8000-000000000002";
    const repo = createRepositoryWithStatefulAttachment(
      createQueuedAttachment({
        id: attachmentId,
        filename: "report.pdf",
        mimeType: "application/pdf",
        category: "unclassified",
        categorySource: "default_unclassified",
        storageKey: "local://attachments/report.pdf",
        consent: null,
      }),
    );

    const { stageService } = createStageService({
      chatAttachmentsRepository: repo,
    });

    const result = await stageService.runTurnStages({
      userId: user.id,
      threadId: "24b19287-75b8-4a3e-9c10-691908479405",
      messageId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      attachmentRefIds: [attachmentId],
    });

    expect(repo.update).toHaveBeenCalledWith(
      user.id,
      attachmentId,
      expect.objectContaining({
        category: "medical_document",
        status: "needs_consent",
        storageKey: null,
      }),
    );
    expect(result?.attachmentMetadata[0]?.consentState).toBe("needs_consent");
  });

  it("JPEG image (food photo MIME) is NOT gated as medical even when unclassified", async () => {
    const attachmentId = "a1000003-0000-4000-8000-000000000003";
    const repo = createRepositoryWithStatefulAttachment(
      createQueuedAttachment({
        id: attachmentId,
        filename: "meal.jpg",
        mimeType: "image/jpeg",
        category: "unclassified",
        storageKey: "local://attachments/meal.jpg",
      }),
    );

    const { stageService } = createStageService({
      chatAttachmentsRepository: repo,
    });

    const result = await stageService.runTurnStages({
      userId: user.id,
      threadId: "24b19287-75b8-4a3e-9c10-691908479405",
      messageId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      attachmentRefIds: [attachmentId],
    });

    // No medical gate fired — unclassified JPEG passes through.
    expect(result?.attachmentMetadata[0]?.consentState).toBe("none");
    expect(result?.outcomes[0]?.status).not.toBe("needs_consent");
  });

  it("medical attachment with existing consent passes through without purge", async () => {
    const attachmentId = "d1000003-0000-4000-8000-000000000003";
    const consentData = {
      consentScopes: ["upload_storage"] as const,
      consentVersion: "v1",
      consentGrantedAt: "2026-05-26T12:00:00.000Z",
      documentType: "lab_report" as const,
      documentTitle: "CBC Panel",
    };

    const repo = createRepositoryWithStatefulAttachment(
      createQueuedAttachment({
        id: attachmentId,
        filename: "labs.pdf",
        mimeType: "application/pdf",
        category: "medical_document",
        categorySource: "user_selected",
        storageKey: "local://attachments/labs.pdf",
        consent: consentData,
        status: "queued",
      }),
    );

    const { stageService } = createStageService({
      chatAttachmentsRepository: repo,
    });

    const result = await stageService.runTurnStages({
      userId: user.id,
      threadId: "24b19287-75b8-4a3e-9c10-691908479405",
      messageId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      attachmentRefIds: [attachmentId],
    });

    // Must NOT be purged — consent exists.
    expect(result?.attachmentMetadata[0]?.consentState).toBe("granted");
    expect(result?.attachmentMetadata[0]?.category).toBe("medical_document");
    // Storage ref should still be present (not purged).
    expect(result?.attachmentMetadata[0]?.storageRef).not.toBeNull();
  });

  it("returns null when attachment ref list is empty", async () => {
    const { stageService } = createStageService({});

    const result = await stageService.runTurnStages({
      userId: user.id,
      threadId: "24b19287-75b8-4a3e-9c10-691908479405",
      messageId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      attachmentRefIds: [],
    });

    expect(result).toBeNull();
  });

  it("falls back to default stage order when attachment config has invalid order", async () => {
    const invalidConfigService = createDefaultAiBehaviorConfigService();
    const defaults = invalidConfigService.getAttachmentBehavior();
    vi.spyOn(invalidConfigService, "getAttachmentBehavior").mockReturnValue({
      ...defaults,
      turnStages: {
        order: ["validate_refs", "link_to_message"] as never,
      },
    });

    const attachmentId = "a1000099-0000-4000-8000-000000000099";
    const repo = createRepositoryWithStatefulAttachment(
      createQueuedAttachment({
        id: attachmentId,
        filename: "IMG_1234.jpg",
        category: "unclassified",
      }),
    );

    const { stageService } = createStageService({
      aiBehaviorConfigService: invalidConfigService,
      chatAttachmentsRepository: repo,
    });

    // Should fall back to default 3-stage order and complete without error.
    const result = await stageService.runTurnStages({
      userId: user.id,
      threadId: "24b19287-75b8-4a3e-9c10-691908479405",
      messageId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      attachmentRefIds: [attachmentId],
    });

    expect(result).not.toBeNull();
    expect(result?.attachmentMetadata[0]?.refId).toBe(attachmentId);
  });

  it("buildBoundedMetadata carries storageRef from storageKey", async () => {
    const attachmentId = "a1000005-0000-4000-8000-000000000005";
    const repo = createRepositoryWithStatefulAttachment(
      createQueuedAttachment({
        id: attachmentId,
        mimeType: "image/jpeg",
        category: "food_photo",
        categorySource: "user_selected",
        storageKey: "local://attachments/food.jpg",
        consent: null,
      }),
    );

    const { stageService } = createStageService({
      chatAttachmentsRepository: repo,
    });

    const result = await stageService.runTurnStages({
      userId: user.id,
      threadId: "24b19287-75b8-4a3e-9c10-691908479405",
      messageId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      attachmentRefIds: [attachmentId],
    });

    expect(result?.attachmentMetadata[0]?.storageRef).toBe("local://attachments/food.jpg");
    expect(result?.attachmentMetadata[0]?.mimeType).toBe("image/jpeg");
  });
});
