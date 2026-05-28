import { chatAttachments } from "@health/db";
import type {
  ChatAttachmentCategory,
  ChatAttachmentCategorySource,
  ChatAttachmentConsent,
  ChatAttachmentRecognitionEnvelope,
  ChatAttachmentRetentionPolicy,
  ChatAttachmentStatus,
} from "@health/types";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import { DATABASE } from "../../database/database.tokens.js";
import type { HealthDatabase } from "../../database/database.types.js";

export type CreateChatAttachmentRowInput = {
  id?: string;
  userId: string;
  threadId?: string | null;
  category: ChatAttachmentCategory;
  categorySource?: ChatAttachmentCategorySource;
  status: ChatAttachmentStatus;
  filename: string;
  mimeType: string;
  fileSizeBytes: number;
  storageKey?: string | null;
  linkedDocumentId?: string | null;
  linkedImageRefId?: string | null;
  consent?: ChatAttachmentConsent | null;
  recognition?: ChatAttachmentRecognitionEnvelope | null;
  failureReason?: string | null;
  retentionPolicy: ChatAttachmentRetentionPolicy;
  expiresAt?: Date | null;
};

@Injectable()
export class ChatAttachmentsRepository {
  constructor(@Inject(DATABASE) private readonly db: HealthDatabase) {}

  async create(input: CreateChatAttachmentRowInput) {
    const [row] = await this.db
      .insert(chatAttachments)
      .values({
        ...(input.id ? { id: input.id } : {}),
        userId: input.userId,
        threadId: input.threadId ?? null,
        category: input.category,
        categorySource: input.categorySource ?? "default_unclassified",
        status: input.status,
        filename: input.filename,
        mimeType: input.mimeType,
        fileSizeBytes: input.fileSizeBytes,
        storageKey: input.storageKey ?? null,
        linkedDocumentId: input.linkedDocumentId ?? null,
        linkedImageRefId: input.linkedImageRefId ?? null,
        consent: input.consent ?? null,
        recognition: input.recognition ?? null,
        failureReason: input.failureReason ?? null,
        retentionPolicy: input.retentionPolicy,
        expiresAt: input.expiresAt ?? null,
      })
      .returning();

    if (!row) {
      throw new Error("Failed to create chat attachment.");
    }

    return row;
  }

  async findByIdForUser(userId: string, attachmentId: string) {
    const [row] = await this.db
      .select()
      .from(chatAttachments)
      .where(and(eq(chatAttachments.userId, userId), eq(chatAttachments.id, attachmentId)))
      .limit(1);

    return row ?? null;
  }

  async listByIdsForUser(userId: string, attachmentIds: readonly string[]) {
    if (attachmentIds.length === 0) {
      return [];
    }

    return this.db
      .select()
      .from(chatAttachments)
      .where(
        and(eq(chatAttachments.userId, userId), inArray(chatAttachments.id, [...attachmentIds])),
      );
  }

  async update(
    userId: string,
    attachmentId: string,
    patch: Partial<{
      category: ChatAttachmentCategory;
      categorySource: ChatAttachmentCategorySource;
      status: ChatAttachmentStatus;
      threadId: string | null;
      messageId: string | null;
      storageKey: string | null;
      linkedDocumentId: string | null;
      linkedImageRefId: string | null;
      consent: ChatAttachmentConsent | null;
      recognition: ChatAttachmentRecognitionEnvelope | null;
      failureReason: string | null;
      retentionPolicy: ChatAttachmentRetentionPolicy;
      expiresAt: Date | null;
    }>,
  ) {
    const [row] = await this.db
      .update(chatAttachments)
      .set({
        ...patch,
        updatedAt: new Date(),
      })
      .where(and(eq(chatAttachments.userId, userId), eq(chatAttachments.id, attachmentId)))
      .returning();

    return row ?? null;
  }
}

export type ChatAttachmentRow = typeof chatAttachments.$inferSelect;
