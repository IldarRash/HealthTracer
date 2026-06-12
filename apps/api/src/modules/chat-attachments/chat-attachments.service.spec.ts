import { BadRequestException, NotFoundException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultAiBehaviorConfigService } from "../ai/test-ai-behavior-fixtures.js";
import { ChatAttachmentsService } from "./chat-attachments.service.js";
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

function createService(deps: {
  chatAttachmentsRepository?: Record<string, unknown>;
  chatRepository?: Record<string, unknown>;
}) {
  const chatAttachmentsRepository = {
    create: vi.fn(async (input: unknown) => ({
      ...(input as Record<string, unknown>),
      threadId: null,
      messageId: null,
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

  const service = new ChatAttachmentsService(
    chatAttachmentsRepository as never,
    chatRepository as never,
    {
      resolveFromAuth: async () => user,
    } as never,
    createDefaultAiBehaviorConfigService(),
  );

  return {
    service,
    chatAttachmentsRepository,
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

  it("stores an image upload as unclassified (context-only, no category declaration required)", async () => {
    const storeSpy = vi.spyOn(LocalChatAttachmentStorageAdapter.prototype, "store");
    const { service, chatAttachmentsRepository } = createService({});

    const record = await service.createAttachment(auth, {
      filename: "meal.jpg",
      mimeType: "image/jpeg",
      fileContentBase64: "dGVzdA==",
    });

    expect(storeSpy).toHaveBeenCalledOnce();
    expect(chatAttachmentsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "unclassified",
        categorySource: "default_unclassified",
        status: "queued",
        storageKey: expect.stringMatching(/^5d6e7f84/),
      }),
    );
    expect(record.category).toBe("unclassified");
    expect(record.status).toBe("queued");
  });

  it("stores a PNG image upload successfully", async () => {
    const storeSpy = vi.spyOn(LocalChatAttachmentStorageAdapter.prototype, "store");
    const { service } = createService({});

    const record = await service.createAttachment(auth, {
      filename: "workout-photo.png",
      mimeType: "image/png",
      fileContentBase64: "dGVzdA==",
    });

    expect(storeSpy).toHaveBeenCalledOnce();
    expect(record.mimeType).toBe("image/png");
    expect(record.category).toBe("unclassified");
  });

  it("rejects unsupported MIME types on upload", async () => {
    const { service } = createService({});

    await expect(
      service.createAttachment(auth, {
        filename: "report.exe",
        mimeType: "application/octet-stream",
        fileContentBase64: "dGVzdA==",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("accepts PDF upload as document_file category with mime_inferred categorySource", async () => {
    vi.spyOn(LocalChatAttachmentStorageAdapter.prototype, "store");
    const { service, chatAttachmentsRepository } = createService({});

    const record = await service.createAttachment(auth, {
      filename: "training-program.pdf",
      mimeType: "application/pdf",
      fileContentBase64: "dGVzdA==",
    });

    expect(chatAttachmentsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "document_file",
        categorySource: "mime_inferred",
      }),
    );
    // Context-only: the attachment never links to persisted health data
    // (no lab_reports / biomarker_readings rows are created from this path).
    expect("linkedDocumentId" in record).toBe(false);
    expect(record.category).toBe("document_file");
  });

  it("accepts text/plain upload as document_file category, never linked to persisted health data", async () => {
    vi.spyOn(LocalChatAttachmentStorageAdapter.prototype, "store");
    const { service, chatAttachmentsRepository } = createService({});

    const record = await service.createAttachment(auth, {
      filename: "notes.txt",
      mimeType: "text/plain",
      fileContentBase64: "dGVzdA==",
    });

    expect(chatAttachmentsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "document_file",
        categorySource: "mime_inferred",
      }),
    );
    // The attachment path never creates lab_reports / biomarker_readings rows;
    // the legacy linked-document field is gone from the contract entirely.
    expect("linkedDocumentId" in record).toBe(false);
  });

  it("upload resolves to queued status — no upfront consent gate, no needs_consent on create", async () => {
    vi.spyOn(LocalChatAttachmentStorageAdapter.prototype, "store");
    const { service } = createService({});

    // No category declaration, no consent scopes — just an image. Must succeed.
    const record = await service.createAttachment(auth, {
      filename: "health-snap.jpg",
      mimeType: "image/jpeg",
      fileContentBase64: "dGVzdA==",
    });

    // Must be queued (not needs_consent). No upfront gate applies.
    expect(record.status).toBe("queued");
    expect(record.category).toBe("unclassified");
    // consent is null — no consent was required or collected on create.
    expect(record.consent).toBeNull();
  });

  it("createAttachment does NOT insert lab_reports or biomarker_readings rows — attachment stays as chat record only", async () => {
    // The attachment pipeline must never auto-persist structured health data
    // (lab_reports / biomarker_readings) from an upload. Persistence is the
    // explicit Biomarkers lab-report upload only. This guards against
    // reintroduction of the removed auto-persist path.
    const labReportsInsert = vi.fn();
    const biomarkerReadingsInsert = vi.fn();
    const { service, chatAttachmentsRepository } = createService({});

    await service.createAttachment(auth, {
      filename: "my-scan.jpg",
      mimeType: "image/jpeg",
      fileContentBase64: "dGVzdA==",
    });

    // chatAttachmentsRepository.create was called (attachment row created).
    expect(chatAttachmentsRepository.create).toHaveBeenCalledOnce();
    // No structured health rows were written (no lab-report / reading auto-persist).
    expect(labReportsInsert).not.toHaveBeenCalled();
    expect(biomarkerReadingsInsert).not.toHaveBeenCalled();
  });

  it("rejects oversized uploads", async () => {
    const { service } = createService({});
    const oversized = Buffer.alloc(10_000_001).toString("base64");

    await expect(
      service.createAttachment(auth, {
        filename: "meal.jpg",
        mimeType: "image/jpeg",
        fileContentBase64: oversized,
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

  describe("getMessageDisplayAttachments", () => {
    const userId = user.id;
    const messageId = "m1000001-0000-4000-8000-000000000001";

    function buildAttachmentRow(overrides: Partial<{
      id: string;
      messageId: string | null;
      mimeType: string;
      storageKey: string | null;
      retentionPolicy: string;
      expiresAt: Date | null;
      category: string;
      status: string;
      filename: string;
    }> = {}) {
      return {
        id: "a1000001-0000-4000-8000-000000000001",
        userId,
        threadId: "t1000001-0000-4000-8000-000000000001",
        messageId,
        category: "food_photo",
        categorySource: "user_selected",
        status: "ready",
        filename: "food.jpg",
        mimeType: "image/jpeg",
        fileSizeBytes: 10000,
        storageKey: "local://attachments/food.jpg",
        linkedImageRefId: "a1000001-0000-4000-8000-000000000001",
        consent: null,
        recognition: null,
        failureReason: null,
        retentionPolicy: "ephemeral_recognition",
        expiresAt: null,
        createdAt: new Date("2026-05-27T12:00:00.000Z"),
        updatedAt: new Date("2026-05-27T12:00:00.000Z"),
        ...overrides,
      };
    }

    it("returns hasViewableContent=true for a present non-expired image attachment", async () => {
      const row = buildAttachmentRow({ storageKey: "local://attachments/food.jpg", mimeType: "image/jpeg", expiresAt: null });
      const { service } = createService({
        chatAttachmentsRepository: { listByMessageIds: vi.fn(async () => [row]) },
      });

      const result = await service.getMessageDisplayAttachments(userId, [messageId]);
      const metas = result.get(messageId) ?? [];

      expect(metas).toHaveLength(1);
      expect(metas[0]?.hasViewableContent).toBe(true);
    });

    it("returns hasViewableContent=false for a non-image (PDF) attachment", async () => {
      const row = buildAttachmentRow({
        mimeType: "application/pdf",
        storageKey: "local://attachments/doc.pdf",
        category: "workout_attachment",
        filename: "workout.pdf",
      });
      const { service } = createService({
        chatAttachmentsRepository: { listByMessageIds: vi.fn(async () => [row]) },
      });

      const result = await service.getMessageDisplayAttachments(userId, [messageId]);
      const metas = result.get(messageId) ?? [];

      expect(metas[0]?.hasViewableContent).toBe(false);
    });

    it("returns hasViewableContent=false when storageKey is null (purged/needs_consent)", async () => {
      const row = buildAttachmentRow({
        storageKey: null,
        mimeType: "image/jpeg",
        status: "needs_consent",
        category: "medical_document",
      });
      const { service } = createService({
        chatAttachmentsRepository: { listByMessageIds: vi.fn(async () => [row]) },
      });

      const result = await service.getMessageDisplayAttachments(userId, [messageId]);
      const metas = result.get(messageId) ?? [];

      expect(metas[0]?.hasViewableContent).toBe(false);
    });

    it("returns hasViewableContent=false for an expired ephemeral image attachment", async () => {
      const row = buildAttachmentRow({
        storageKey: "local://attachments/food.jpg",
        mimeType: "image/jpeg",
        retentionPolicy: "ephemeral_recognition",
        expiresAt: new Date("2020-01-01T00:00:00.000Z"),
      });
      const { service } = createService({
        chatAttachmentsRepository: { listByMessageIds: vi.fn(async () => [row]) },
      });

      const result = await service.getMessageDisplayAttachments(userId, [messageId]);
      const metas = result.get(messageId) ?? [];

      expect(metas[0]?.hasViewableContent).toBe(false);
    });

    it("returns an empty map when messageIds is empty", async () => {
      const listByMessageIds = vi.fn(async () => []);
      const { service } = createService({
        chatAttachmentsRepository: { listByMessageIds },
      });

      const result = await service.getMessageDisplayAttachments(userId, []);

      expect(result.size).toBe(0);
      expect(listByMessageIds).not.toHaveBeenCalled();
    });

    it("groups multiple attachments under their respective message IDs", async () => {
      const msgId2 = "m2000002-0000-4000-8000-000000000002";
      const row1 = buildAttachmentRow({ id: "a1000001-0000-4000-8000-000000000001", messageId });
      const row2 = buildAttachmentRow({
        id: "a2000002-0000-4000-8000-000000000002",
        messageId: msgId2,
        storageKey: null,
        status: "needs_consent",
        mimeType: "image/jpeg",
        category: "medical_document",
      });
      const { service } = createService({
        chatAttachmentsRepository: { listByMessageIds: vi.fn(async () => [row1, row2]) },
      });

      const result = await service.getMessageDisplayAttachments(userId, [messageId, msgId2]);

      expect(result.get(messageId)).toHaveLength(1);
      expect(result.get(msgId2)).toHaveLength(1);
      expect(result.get(messageId)?.[0]?.hasViewableContent).toBe(true);
      expect(result.get(msgId2)?.[0]?.hasViewableContent).toBe(false);
    });

    it("issues a single batched query regardless of how many messageIds are passed", async () => {
      const listByMessageIds = vi.fn(async () => []);
      const { service } = createService({
        chatAttachmentsRepository: { listByMessageIds },
      });

      await service.getMessageDisplayAttachments(userId, [
        "m1000001-0000-4000-8000-000000000001",
        "m2000002-0000-4000-8000-000000000002",
        "m3000003-0000-4000-8000-000000000003",
      ]);

      expect(listByMessageIds).toHaveBeenCalledTimes(1);
    });

    it("never exposes storageKey, consent, recognition, or bytes on the returned metadata", async () => {
      const row = buildAttachmentRow({ storageKey: "local://attachments/food.jpg" });
      const { service } = createService({
        chatAttachmentsRepository: { listByMessageIds: vi.fn(async () => [row]) },
      });

      const result = await service.getMessageDisplayAttachments(userId, [messageId]);
      const meta = result.get(messageId)?.[0];

      expect(meta).toBeDefined();
      expect(meta).not.toHaveProperty("storageKey");
      expect(meta).not.toHaveProperty("consent");
      expect(meta).not.toHaveProperty("recognition");
      expect(meta).not.toHaveProperty("fileContentBase64");
    });
  });

});
