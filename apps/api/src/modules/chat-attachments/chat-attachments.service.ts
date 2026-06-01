import type {
  ChatAttachmentRecord,
  CreateChatAttachmentInput,
  GrantChatAttachmentConsentInput,
} from "@health/types";
import {
  getChatAttachmentMimeTypeError,
  getChatAttachmentRetentionPolicy,
  getChatAttachmentSizeError,
  getMedicalAttachmentConsentErrors,
  isChatAttachmentExpired,
  isChatAttachmentImageMimeType,
  isTrustedUserSelectedChatAttachmentUpload,
} from "@health/types";
import type { ChatAttachmentUploadClassificationMeta } from "@health/types";
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
import { buildMedicalAttachmentConsent } from "./medical-document-attachment-recognizer.js";
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

    if (
      !isTrustedUserSelectedChatAttachmentUpload({
        category: input.category ?? "unclassified",
        categorySource: input.categorySource,
        consentScopes: input.consentScopes,
      })
    ) {
      throw new BadRequestException(
        "Provisional unclassified uploads are no longer supported. Use category and categorySource to declare the attachment type before upload.",
      );
    }

    return this.createTrustedUserSelectedAttachment(user.id, input, content);
  }

  private async createTrustedUserSelectedAttachment(
    userId: string,
    input: CreateChatAttachmentInput,
    content: Buffer,
  ): Promise<ChatAttachmentRecord> {
    const category = input.category ?? "unclassified";
    const mimeError = getChatAttachmentMimeTypeError(category, input.mimeType);

    if (mimeError) {
      throw new BadRequestException(mimeError);
    }

    const sizeError = getChatAttachmentSizeError(category, content.byteLength);

    if (sizeError) {
      throw new BadRequestException(sizeError);
    }

    const consentErrors = getMedicalAttachmentConsentErrors(category, input.consentScopes);

    if (consentErrors.length > 0) {
      throw new BadRequestException(consentErrors.join(" "));
    }

    const attachmentId = crypto.randomUUID();
    const storageKey = await this.storage.store(userId, attachmentId, content, input.mimeType);
    const consent =
      category === "medical_document" && input.consentScopes
        ? buildMedicalAttachmentConsent({
            consentScopes: input.consentScopes,
            consentVersion: input.consentVersion ?? "v1",
            documentType: input.documentType!,
            documentTitle: input.documentTitle!,
          })
        : null;

    const row = await this.chatAttachmentsRepository.create({
      id: attachmentId,
      userId,
      threadId: input.threadId ?? null,
      category,
      categorySource: "user_selected",
      status: "queued",
      filename: input.filename,
      mimeType: input.mimeType,
      fileSizeBytes: content.byteLength,
      storageKey,
      linkedImageRefId: category === "food_photo" ? attachmentId : null,
      consent,
      retentionPolicy: this.resolveRetentionPolicy(category),
    });

    return {
      ...toChatAttachmentRecord(row),
      uploadClassificationMeta: {
        providerId: "user_selected",
        method: "user_selected",
      } satisfies ChatAttachmentUploadClassificationMeta,
    };
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

  async grantConsent(
    auth: ClerkAuthContext,
    attachmentId: string,
    input: GrantChatAttachmentConsentInput,
  ): Promise<ChatAttachmentRecord> {
    const user = await this.usersService.resolveFromAuth(auth);
    const existing = await this.chatAttachmentsRepository.findByIdForUser(user.id, attachmentId);

    if (!existing) {
      throw new NotFoundException("Chat attachment not found.");
    }

    if (existing.category !== "medical_document") {
      throw new BadRequestException("Consent grants apply only to medical document attachments.");
    }

    const consentErrors = getMedicalAttachmentConsentErrors(
      "medical_document",
      input.consentScopes,
    );

    if (consentErrors.length > 0) {
      throw new BadRequestException(consentErrors.join(" "));
    }

    const current = toChatAttachmentRecord(existing);
    const documentType = input.documentType ?? current.consent?.documentType;
    const documentTitle = input.documentTitle ?? current.consent?.documentTitle;

    if (!documentType || !documentTitle) {
      throw new BadRequestException(
        "Medical attachment is missing document metadata required for consent.",
      );
    }

    let storageKey = current.storageKey;

    if (!storageKey) {
      if (!input.fileContentBase64) {
        throw new BadRequestException(
          "Medical document content must be re-uploaded with consent before processing.",
        );
      }

      const content = decodeAttachmentContent(input.fileContentBase64);
      const sizeError = getChatAttachmentSizeError("medical_document", content.byteLength);

      if (sizeError) {
        throw new BadRequestException(sizeError);
      }

      const mimeError = getChatAttachmentMimeTypeError("medical_document", current.mimeType);

      if (mimeError) {
        throw new BadRequestException(mimeError);
      }

      storageKey = await this.storage.store(
        user.id,
        attachmentId,
        content,
        current.mimeType,
      );
    }

    const consent = buildMedicalAttachmentConsent({
      consentScopes: input.consentScopes,
      consentVersion: input.consentVersion,
      documentType,
      documentTitle,
    });

    const updated = await this.chatAttachmentsRepository.update(user.id, attachmentId, {
      consent,
      status: "queued",
      failureReason: null,
      storageKey,
    });

    if (!updated) {
      throw new NotFoundException("Chat attachment not found.");
    }

    return toChatAttachmentRecord(updated);
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
