import { BadRequestException, NotFoundException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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

  const service = new ChatAttachmentsService(
    chatAttachmentsRepository as never,
    chatRepository as never,
    chatAttachmentRecognitionService as never,
    {
      resolveFromAuth: async () => user,
    } as never,
  );

  return {
    service,
    chatAttachmentsRepository,
    chatAttachmentRecognitionService,
  };
}

describe("ChatAttachmentsService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects unsupported MIME types on upload", async () => {
    const { service } = createService({});

    await expect(
      service.createAttachment(auth, {
        category: "food_photo",
        filename: "report.pdf",
        mimeType: "application/pdf",
        fileContentBase64: "dGVzdA==",
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

    const { service, chatAttachmentRecognitionService } = createService({
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
