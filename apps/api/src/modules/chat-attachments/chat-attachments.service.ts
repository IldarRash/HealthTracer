import type {
  ChatAttachmentRecord,
  ChatAttachmentRecognitionResponse,
  ClassifiedChatAttachmentCategory,
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
  getProvisionalAttachmentMimeTypeError,
  getProvisionalAttachmentSizeError,
  isChatAttachmentExpired,
  isChatAttachmentImageMimeType,
  inferMealContextFromMessage,
  isChatAttachmentPendingMessageFirstSend,
  isTrustedUserSelectedChatAttachmentUpload,
  MEDICAL_ATTACHMENT_CONSENT_REQUIRED_REASON,
  resolveProvisionalUploadCategorySource,
  resolveProvisionalUploadDisposition,
  resolveSendTimeAttachmentCategory,
  resolveSendTimeCategorySource,
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
import { ChatRepository } from "../chat/chat.repository.js";
import { UsersService } from "../users/users.service.js";
import { toChatAttachmentRecord, toOwnedChatAttachmentRef } from "./chat-attachment.mapper.js";
import { ChatAttachmentClassifierService } from "./chat-attachment-classifier.service.js";
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
    private readonly chatAttachmentClassifierService: ChatAttachmentClassifierService,
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
    const content = decodeAttachmentContent(input.fileContentBase64);

    if (input.threadId) {
      const thread = await this.chatRepository.findThreadById(user.id, input.threadId);

      if (!thread) {
        throw new NotFoundException("Chat thread not found.");
      }
    }

    if (
      isTrustedUserSelectedChatAttachmentUpload({
        category: input.category ?? "unclassified",
        categorySource: input.categorySource,
        consentScopes: input.consentScopes,
      })
    ) {
      return this.createTrustedUserSelectedAttachment(user.id, input, content);
    }

    return this.createClassifiedProvisionalAttachment(user.id, input, content);
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
      retentionPolicy: getChatAttachmentRetentionPolicy(category),
    });

    return this.toRecordWithUploadMeta(row, {
      providerId: "user_selected",
      method: "user_selected",
    });
  }

  private async createClassifiedProvisionalAttachment(
    userId: string,
    input: CreateChatAttachmentInput,
    content: Buffer,
  ): Promise<ChatAttachmentRecord> {
    const mimeError = getProvisionalAttachmentMimeTypeError(input.mimeType);

    if (mimeError) {
      throw new BadRequestException(mimeError);
    }

    const sizeError = getProvisionalAttachmentSizeError(content.byteLength);

    if (sizeError) {
      throw new BadRequestException(sizeError);
    }

    if (input.consentScopes?.length) {
      throw new BadRequestException(
        "Consent scopes apply only after a medical document category is assigned.",
      );
    }

    const attachmentId = crypto.randomUUID();
    const classification = await this.chatAttachmentClassifierService.classify({
      message: "",
      attachment: {
        id: attachmentId,
        filename: input.filename,
        mimeType: input.mimeType,
        category: "unclassified",
        consent: null,
        storageKey: null,
      },
      content,
      categorySource: input.categorySource,
    });

    const disposition = resolveProvisionalUploadDisposition({
      classification,
      attachmentId,
    });

    let storageKey: string | null = null;

    if (disposition.shouldPersistContent) {
      storageKey = await this.storage.store(userId, attachmentId, content, input.mimeType);
    }

    const row = await this.chatAttachmentsRepository.create({
      id: attachmentId,
      userId,
      threadId: input.threadId ?? null,
      category: disposition.category,
      categorySource: resolveProvisionalUploadCategorySource({
        dispositionCategory: disposition.category,
        inputCategorySource: input.categorySource,
      }),
      status: disposition.status,
      filename: input.filename,
      mimeType: input.mimeType,
      fileSizeBytes: content.byteLength,
      storageKey,
      linkedImageRefId: disposition.linkedImageRefId,
      consent: null,
      failureReason: disposition.failureReason,
      retentionPolicy: disposition.retentionPolicy,
    });

    return this.toRecordWithUploadMeta(row, {
      providerId: classification.classificationProviderId ?? "unknown",
      method: classification.classificationMethod ?? "unknown",
    });
  }

  private toRecordWithUploadMeta(
    row: Awaited<ReturnType<ChatAttachmentsRepository["create"]>>,
    meta: ChatAttachmentUploadClassificationMeta,
  ): ChatAttachmentRecord {
    return {
      ...toChatAttachmentRecord(row),
      uploadClassificationMeta: meta,
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
        documentType: input.documentType,
        documentTitle: input.documentTitle,
        fileContentBase64: input.fileContentBase64,
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

  async classifyAndRecognizeAttachmentsForMessage(input: {
    auth: ClerkAuthContext;
    userId: string;
    messageContent: string;
    attachments: readonly ChatAttachmentRecord[];
  }): Promise<ChatAttachmentRecord[]> {
    const processed: ChatAttachmentRecord[] = [];

    for (const attachment of input.attachments) {
      if (
        !isChatAttachmentPendingMessageFirstSend({
          category: attachment.category,
          status: attachment.status,
          recognition: attachment.recognition,
        })
      ) {
        processed.push(attachment);
        continue;
      }

      const attachmentContent = attachment.storageKey
        ? await this.storage.read(attachment.storageKey)
        : Buffer.alloc(0);

      const classification = await this.chatAttachmentClassifierService.classify({
        message: input.messageContent,
        attachment,
        content: attachmentContent,
        categorySource: attachment.categorySource,
      });

      if (
        classification.suggestedAction === "manual_fallback" ||
        classification.suggestedAction === "unsupported"
      ) {
        await this.chatAttachmentsRepository.update(input.userId, attachment.id, {
          category: "unclassified",
          categorySource: resolveSendTimeCategorySource({
            previousCategorySource: attachment.categorySource,
            resolvedCategory: "unclassified",
          }),
          status: "needs_review",
          failureReason: classification.rationale.slice(0, 240),
          retentionPolicy: getChatAttachmentRetentionPolicy("unclassified"),
        });

        const row = await this.chatAttachmentsRepository.findByIdForUser(
          input.userId,
          attachment.id,
        );

        if (row) {
          processed.push(toChatAttachmentRecord(row));
        }

        continue;
      }

      const classifiedCategory = resolveSendTimeAttachmentCategory({
        attachmentCategory: attachment.category,
        attachmentCategorySource: attachment.categorySource,
        consentScopes: attachment.consent?.consentScopes,
        classificationCategory: classification.category as ClassifiedChatAttachmentCategory,
      });

      const categorySource = resolveSendTimeCategorySource({
        previousCategorySource: attachment.categorySource,
        resolvedCategory: classifiedCategory,
      });

      const mealContextLabel =
        classification.mealContextLabel ?? inferMealContextFromMessage(input.messageContent);

      const consent = attachment.consent;
      let linkedImageRefId = attachment.linkedImageRefId;
      const retentionPolicy = getChatAttachmentRetentionPolicy(classifiedCategory);

      if (classifiedCategory === "food_photo") {
        linkedImageRefId = attachment.id;
      }

      if (classifiedCategory === "medical_document" && !consent) {
        await this.purgeStoredAttachmentContent(attachment.storageKey);

        await this.chatAttachmentsRepository.update(input.userId, attachment.id, {
          category: classifiedCategory,
          categorySource,
          status: "needs_consent",
          storageKey: null,
          linkedImageRefId,
          retentionPolicy,
          failureReason: MEDICAL_ATTACHMENT_CONSENT_REQUIRED_REASON,
        });

        const row = await this.chatAttachmentsRepository.findByIdForUser(
          input.userId,
          attachment.id,
        );

        if (row) {
          processed.push(toChatAttachmentRecord(row));
        }

        continue;
      }

      await this.chatAttachmentsRepository.update(input.userId, attachment.id, {
        category: classifiedCategory,
        categorySource,
        status: "recognizing",
        linkedImageRefId,
        retentionPolicy,
        failureReason: null,
      });

      const refreshed = await this.chatAttachmentsRepository.findByIdForUser(
        input.userId,
        attachment.id,
      );

      if (!refreshed) {
        continue;
      }

      const attachmentForRecognition = toChatAttachmentRecord(refreshed);

      const outcome = await this.chatAttachmentRecognitionService.recognizeAttachment({
        auth: input.auth,
        userId: input.userId,
        attachment: attachmentForRecognition,
        category: classifiedCategory,
        storage: this.storage,
        messageContext: {
          mealContextLabel,
          boundedMessage: input.messageContent.trim().slice(0, 500),
        },
      });

      const updated = await this.chatAttachmentsRepository.update(input.userId, attachment.id, {
        category: classifiedCategory,
        categorySource,
        status: outcome.status,
        recognition: outcome.recognition,
        failureReason: outcome.failureReason,
        linkedDocumentId: outcome.linkedDocumentId,
        linkedImageRefId:
          classifiedCategory === "food_photo" ? attachment.id : linkedImageRefId,
        expiresAt: outcome.expiresAt,
        retentionPolicy: getChatAttachmentRetentionPolicy(classifiedCategory),
      });

      if (updated) {
        processed.push(toChatAttachmentRecord(updated));
      }
    }

    return processed;
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

  private async purgeStoredAttachmentContent(storageKey: string | null): Promise<void> {
    if (!storageKey) {
      return;
    }

    await this.storage.delete(storageKey);
  }
}
