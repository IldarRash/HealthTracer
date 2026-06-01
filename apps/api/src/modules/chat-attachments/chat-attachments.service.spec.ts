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

  it("rejects provisional unclassified uploads (classifier removed)", async () => {
    const { service } = createService({});

    await expect(
      service.createAttachment(auth, {
        filename: "meal.jpg",
        mimeType: "image/jpeg",
        fileContentBase64: "dGVzdA==",
        consentVersion: "v1",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("stores explicit user-selected food photo uploads", async () => {
    const storeSpy = vi.spyOn(LocalChatAttachmentStorageAdapter.prototype, "store");
    const { service, chatAttachmentsRepository } = createService({});

    const record = await service.createAttachment(auth, {
      category: "food_photo",
      categorySource: "user_selected",
      filename: "meal.jpg",
      mimeType: "image/jpeg",
      fileContentBase64: "dGVzdA==",
      consentVersion: "v1",
    });

    expect(storeSpy).toHaveBeenCalledOnce();
    expect(chatAttachmentsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "food_photo",
        categorySource: "user_selected",
        status: "queued",
        storageKey: expect.stringMatching(/^5d6e7f84/),
        linkedImageRefId: expect.any(String),
      }),
    );
    expect(record.category).toBe("food_photo");
    expect(record.uploadClassificationMeta?.providerId).toBe("user_selected");
  });

  it("stores explicit user-selected workout uploads", async () => {
    const storeSpy = vi.spyOn(LocalChatAttachmentStorageAdapter.prototype, "store");
    const { service, chatAttachmentsRepository } = createService({});

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

});
