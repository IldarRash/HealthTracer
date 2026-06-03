import type {
  ChatAttachmentRecord,
  ChatMessageAttachmentMeta,
  CreateChatAttachmentInput,
} from "@health/types";
import {
  getChatAttachmentMimeTypeError,
  getChatAttachmentRetentionPolicy,
  getChatAttachmentSizeError,
  isChatAttachmentExpired,
  isChatAttachmentImageMimeType,
} from "@health/types";
import {
  BadRequestException,
  GoneException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { resolve } from "node:path";
import type { ClerkAuthContext } from "../../auth.types.js";
import { env } from "../../env.js";
import { AiBehaviorConfigService } from "../ai/ai-behavior-config.service.js";
import { ChatRepository } from "../chat/chat.repository.js";
import { UsersService } from "../users/users.service.js";
import { resolveAttachmentRetentionPolicyFromBehavior } from "./attachment-behavior-policy.helpers.js";
import { toChatAttachmentRecord, toOwnedChatAttachmentRef } from "./chat-attachment.mapper.js";
import { ChatAttachmentsRepository } from "./chat-attachments.repository.js";
import {
  decodeAttachmentContent,
  LocalChatAttachmentStorageAdapter,
  type ChatAttachmentStorageAdapter,
} from "./local-chat-attachment-storage.js";

@Injectable()
export class ChatAttachmentsService {
  private readonly storage: LocalChatAttachmentStorageAdapter;

  constructor(
    private readonly chatAttachmentsRepository: ChatAttachmentsRepository,
    private readonly chatRepository: ChatRepository,
    private readonly usersService: UsersService,
    private readonly aiBehaviorConfigService: AiBehaviorConfigService,
  ) {
    const storageRoot = resolve(process.cwd(), env.CHAT_ATTACHMENT_STORAGE_PATH);
    this.storage = new LocalChatAttachmentStorageAdapter(storageRoot);
  }

  async createAttachment(
    auth: ClerkAuthContext,
    input: CreateChatAttachmentInput,
  ): Promise<ChatAttachmentRecord> {
    const user = await this.usersService.resolveFromAuth(auth);
    const content = decodeAttachmentContent(input.fileContentBase64);

    if (input.threadId) {
      const thread = await this.chatRepository.findThreadById(user.id, input.threadId);

      if (!thread) {
        throw new NotFoundException("Chat thread not found.");
      }
    }

    // Attachments are images-only (context-only pipeline).
    // Validate MIME and size using the "unclassified" category (image allowlist).
    const mimeError = getChatAttachmentMimeTypeError("unclassified", input.mimeType);

    if (mimeError) {
      throw new BadRequestException(mimeError);
    }

    const sizeError = getChatAttachmentSizeError("unclassified", content.byteLength);

    if (sizeError) {
      throw new BadRequestException(sizeError);
    }

    const attachmentId = crypto.randomUUID();
    const storageKey = await this.storage.store(user.id, attachmentId, content, input.mimeType);

    const row = await this.chatAttachmentsRepository.create({
      id: attachmentId,
      userId: user.id,
      threadId: input.threadId ?? null,
      category: "unclassified",
      categorySource: "default_unclassified",
      status: "queued",
      filename: input.filename,
      mimeType: input.mimeType,
      fileSizeBytes: content.byteLength,
      storageKey,
      linkedImageRefId: null,
      consent: null,
      retentionPolicy: this.resolveRetentionPolicy("unclassified"),
    });

    return toChatAttachmentRecord(row);
  }

  async getAttachment(
    auth: ClerkAuthContext,
    attachmentId: string,
  ): Promise<ChatAttachmentRecord> {
    const user = await this.usersService.resolveFromAuth(auth);
    const row = await this.chatAttachmentsRepository.findByIdForUser(user.id, attachmentId);

    if (!row) {
      throw new NotFoundException("Chat attachment not found.");
    }

    return toChatAttachmentRecord(row);
  }

  async getAttachmentContent(
    auth: ClerkAuthContext,
    attachmentId: string,
  ): Promise<{ content: Buffer; mimeType: string; filename: string }> {
    const user = await this.usersService.resolveFromAuth(auth);
    const row = await this.chatAttachmentsRepository.findByIdForUser(user.id, attachmentId);

    if (!row) {
      throw new NotFoundException("Chat attachment not found.");
    }

    if (!row.storageKey) {
      throw new NotFoundException("Chat attachment content is unavailable.");
    }

    if (
      isChatAttachmentExpired({
        retentionPolicy: row.retentionPolicy,
        expiresAt: row.expiresAt?.toISOString() ?? null,
      })
    ) {
      throw new GoneException("Chat attachment content has expired.");
    }

    if (!isChatAttachmentImageMimeType(row.mimeType)) {
      throw new BadRequestException("Only image attachments can be previewed inline.");
    }

    const content = await this.storage.read(row.storageKey);

    return {
      content,
      mimeType: row.mimeType,
      filename: row.filename,
    };
  }

  /**
   * Display-only projection for the chat thread view.
   * Loads all attachment rows linked to the given message IDs (batched, single query per thread).
   * Returns only display metadata — no bytes, storageKey, consent, recognition, or document text.
   * hasViewableContent is true only when: storageKey is non-null AND mimeType is an image AND the attachment is not expired.
   * This method performs zero row mutations.
   */
  async getMessageDisplayAttachments(
    userId: string,
    messageIds: readonly string[],
  ): Promise<Map<string, ChatMessageAttachmentMeta[]>> {
    if (messageIds.length === 0) {
      return new Map();
    }

    const rows = await this.chatAttachmentsRepository.listByMessageIds(userId, messageIds);
    const result = new Map<string, ChatMessageAttachmentMeta[]>();

    for (const row of rows) {
      if (!row.messageId) {
        continue;
      }

      const isImage = isChatAttachmentImageMimeType(row.mimeType);
      const isExpired = isChatAttachmentExpired({
        retentionPolicy: row.retentionPolicy,
        expiresAt: row.expiresAt?.toISOString() ?? null,
      });
      const hasViewableContent = row.storageKey != null && isImage && !isExpired;

      const meta: ChatMessageAttachmentMeta = {
        attachmentRefId: row.id,
        filename: row.filename,
        mimeType: row.mimeType,
        category: row.category,
        status: row.status,
        hasViewableContent,
      };

      const existing = result.get(row.messageId) ?? [];
      existing.push(meta);
      result.set(row.messageId, existing);
    }

    return result;
  }

  async assertOwnedAttachmentRefs(
    userId: string,
    attachmentRefIds: readonly string[],
  ): Promise<ChatAttachmentRecord[]> {
    const rows = await this.chatAttachmentsRepository.listByIdsForUser(userId, attachmentRefIds);

    if (rows.length !== attachmentRefIds.length) {
      throw new BadRequestException("One or more attachment references were not found for this user.");
    }

    const records = rows.map(toChatAttachmentRecord);
    const expiredRef = records.find((record) => isChatAttachmentExpired(record));

    if (expiredRef) {
      throw new BadRequestException("One or more attachment recognition references have expired.");
    }

    return records;
  }

  async readStoredContent(storageKey: string): Promise<Buffer> {
    return this.storage.read(storageKey);
  }

  async purgeStoredContent(storageKey: string | null): Promise<void> {
    await this.purgeStoredAttachmentContent(storageKey);
  }

  getStorageAdapter(): ChatAttachmentStorageAdapter {
    return this.storage;
  }

  async applyTurnStageUpdate(
    userId: string,
    attachmentId: string,
    patch: Parameters<ChatAttachmentsRepository["update"]>[2],
  ): Promise<ChatAttachmentRecord> {
    const updated = await this.chatAttachmentsRepository.update(userId, attachmentId, patch);

    if (!updated) {
      throw new NotFoundException("Chat attachment not found.");
    }

    return toChatAttachmentRecord(updated);
  }

  async linkAttachmentsToMessage(
    userId: string,
    attachmentRefIds: readonly string[],
    messageId: string,
    threadId: string,
  ): Promise<void> {
    for (const attachmentRefId of attachmentRefIds) {
      await this.chatAttachmentsRepository.update(userId, attachmentRefId, {
        messageId,
        threadId,
      });
    }
  }

  listOwnedRefsForValidation(userId: string, attachmentRefIds: readonly string[]) {
    return this.chatAttachmentsRepository
      .listByIdsForUser(userId, attachmentRefIds)
      .then((rows) => rows.map(toOwnedChatAttachmentRef));
  }

  private resolveRetentionPolicy(
    category: Parameters<typeof getChatAttachmentRetentionPolicy>[0],
  ) {
    return resolveAttachmentRetentionPolicyFromBehavior(
      category,
      this.aiBehaviorConfigService.getAttachmentBehavior(),
    );
  }

  private async purgeStoredAttachmentContent(storageKey: string | null): Promise<void> {
    if (!storageKey) {
      return;
    }

    await this.storage.delete(storageKey);
  }
}
