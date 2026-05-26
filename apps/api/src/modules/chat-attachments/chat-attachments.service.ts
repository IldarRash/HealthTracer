import type {
  ChatAttachmentRecord,
  ChatAttachmentRecognitionResponse,
  CreateChatAttachmentInput,
  GrantChatAttachmentConsentInput,
  RecognizeChatAttachmentInput,
} from "@health/types";
import {
  getChatAttachmentMimeTypeError,
  getChatAttachmentRecognitionEligibilityErrors,
  getChatAttachmentRetentionPolicy,
  getChatAttachmentSizeError,
  getMedicalAttachmentConsentErrors,
  isChatAttachmentExpired,
} from "@health/types";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { resolve } from "node:path";
import type { ClerkAuthContext } from "../../auth.types.js";
import { env } from "../../env.js";
import { ChatRepository } from "../chat/chat.repository.js";
import { UsersService } from "../users/users.service.js";
import { toChatAttachmentRecord, toOwnedChatAttachmentRef } from "./chat-attachment.mapper.js";
import { ChatAttachmentRecognitionService } from "./chat-attachment-recognition.service.js";
import { ChatAttachmentsRepository } from "./chat-attachments.repository.js";
import { buildMedicalAttachmentConsent } from "./medical-document-attachment-recognizer.js";
import {
  decodeAttachmentContent,
  LocalChatAttachmentStorageAdapter,
} from "./local-chat-attachment-storage.js";

@Injectable()
export class ChatAttachmentsService {
  private readonly storage: LocalChatAttachmentStorageAdapter;

  constructor(
    private readonly chatAttachmentsRepository: ChatAttachmentsRepository,
    private readonly chatRepository: ChatRepository,
    private readonly chatAttachmentRecognitionService: ChatAttachmentRecognitionService,
    private readonly usersService: UsersService,
  ) {
    const storageRoot = resolve(process.cwd(), env.CHAT_ATTACHMENT_STORAGE_PATH);
    this.storage = new LocalChatAttachmentStorageAdapter(storageRoot);
  }

  async createAttachment(
    auth: ClerkAuthContext,
    input: CreateChatAttachmentInput,
  ): Promise<ChatAttachmentRecord> {
    const user = await this.usersService.resolveFromAuth(auth);
    const mimeError = getChatAttachmentMimeTypeError(input.category, input.mimeType);

    if (mimeError) {
      throw new BadRequestException(mimeError);
    }

    const content = decodeAttachmentContent(input.fileContentBase64);
    const sizeError = getChatAttachmentSizeError(input.category, content.byteLength);

    if (sizeError) {
      throw new BadRequestException(sizeError);
    }

    const consentErrors = getMedicalAttachmentConsentErrors(
      input.category,
      input.consentScopes,
    );

    if (consentErrors.length > 0) {
      throw new BadRequestException(consentErrors.join(" "));
    }

    if (input.threadId) {
      const thread = await this.chatRepository.findThreadById(user.id, input.threadId);

      if (!thread) {
        throw new NotFoundException("Chat thread not found.");
      }
    }

    const attachmentId = crypto.randomUUID();
    const storageKey = await this.storage.store(
      user.id,
      attachmentId,
      content,
      input.mimeType,
    );

    const initialStatus =
      input.category === "medical_document" && !input.consentScopes
        ? "needs_consent"
        : "queued";

    const consent =
      input.category === "medical_document" && input.consentScopes
        ? buildMedicalAttachmentConsent({
            consentScopes: input.consentScopes,
            consentVersion: input.consentVersion,
            documentType: input.documentType!,
            documentTitle: input.documentTitle!,
          })
        : null;

    const row = await this.chatAttachmentsRepository.create({
      id: attachmentId,
      userId: user.id,
      threadId: input.threadId ?? null,
      category: input.category,
      status: initialStatus,
      filename: input.filename,
      mimeType: input.mimeType,
      fileSizeBytes: content.byteLength,
      storageKey,
      linkedImageRefId: input.category === "food_photo" ? attachmentId : null,
      consent,
      retentionPolicy: getChatAttachmentRetentionPolicy(input.category),
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
    const uploadMetadata = current.consent;

    if (!uploadMetadata?.documentType || !uploadMetadata.documentTitle) {
      throw new BadRequestException(
        "Medical attachment is missing document metadata required for consent.",
      );
    }

    const consent = buildMedicalAttachmentConsent({
      consentScopes: input.consentScopes,
      consentVersion: input.consentVersion,
      documentType: uploadMetadata.documentType,
      documentTitle: uploadMetadata.documentTitle,
    });

    const updated = await this.chatAttachmentsRepository.update(user.id, attachmentId, {
      consent,
      status: "queued",
      failureReason: null,
    });

    if (!updated) {
      throw new NotFoundException("Chat attachment not found.");
    }

    return toChatAttachmentRecord(updated);
  }

  async recognizeAttachment(
    auth: ClerkAuthContext,
    attachmentId: string,
    input: RecognizeChatAttachmentInput,
  ): Promise<ChatAttachmentRecognitionResponse> {
    const user = await this.usersService.resolveFromAuth(auth);
    const existing = await this.chatAttachmentsRepository.findByIdForUser(user.id, attachmentId);

    if (!existing) {
      throw new NotFoundException("Chat attachment not found.");
    }

    const existingRecord = toChatAttachmentRecord(existing);

    if (isChatAttachmentExpired(existingRecord)) {
      throw new BadRequestException("Attachment recognition reference has expired.");
    }

    const category = existingRecord.category;

    if (input.consentScopes && category === "medical_document") {
      await this.grantConsent(auth, attachmentId, {
        consentScopes: input.consentScopes,
        consentVersion: input.consentVersion ?? "v1",
      });
    }

    const refreshedForValidation = await this.chatAttachmentsRepository.findByIdForUser(
      user.id,
      attachmentId,
    );

    if (!refreshedForValidation) {
      throw new NotFoundException("Chat attachment not found.");
    }

    const attachmentForValidation = toChatAttachmentRecord(refreshedForValidation);
    const eligibilityErrors = getChatAttachmentRecognitionEligibilityErrors(attachmentForValidation);

    if (eligibilityErrors.length > 0) {
      throw new BadRequestException(eligibilityErrors.join(" "));
    }

    await this.chatAttachmentsRepository.update(user.id, attachmentId, {
      status: "recognizing",
      failureReason: null,
    });

    const refreshed = await this.chatAttachmentsRepository.findByIdForUser(user.id, attachmentId);

    if (!refreshed) {
      throw new NotFoundException("Chat attachment not found.");
    }

    const refreshedAttachment = toChatAttachmentRecord(refreshed);

    const outcome = await this.chatAttachmentRecognitionService.recognizeAttachment({
      auth,
      userId: user.id,
      attachment: refreshedAttachment,
      category,
      storage: this.storage,
    });

    const updated = await this.chatAttachmentsRepository.update(user.id, attachmentId, {
      status: outcome.status,
      recognition: outcome.recognition,
      failureReason: outcome.failureReason,
      linkedDocumentId: outcome.linkedDocumentId,
      expiresAt: outcome.expiresAt,
    });

    if (!updated) {
      throw new NotFoundException("Chat attachment not found.");
    }

    const record = toChatAttachmentRecord(updated);
    const proposalCandidates = this.chatAttachmentRecognitionService.buildProposalCandidates({
      attachment: record,
      incidentDateTime: new Date().toISOString(),
    });

    return {
      attachment: record,
      proposalCandidates,
    };
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
}
