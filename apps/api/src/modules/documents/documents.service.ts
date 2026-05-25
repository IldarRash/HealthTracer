import { containsUnsafeDocumentSummaryLanguage } from "@health/ai";
import type {
  AiDocumentContextSummary,
  CreateHealthDocumentInput,
  DocumentSearchQuery,
  DocumentSearchResponse,
  HealthDocument,
  HealthDocumentDetail,
  HealthDocumentListResponse,
  HealthDocumentSummary,
  UpdateDocumentConsentInput,
  UpdateDocumentSummaryReviewInput,
} from "@health/types";
import { hasDocumentConsentScope, MAX_HEALTH_DOCUMENT_UPLOAD_BYTES } from "@health/types";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { resolve } from "node:path";
import type { ClerkAuthContext } from "../../auth.types.js";
import { env } from "../../env.js";
import { UsersService } from "../users/users.service.js";
import {
  DevDocumentSummarizer,
  LabDocumentParser,
  type DocumentParser,
  type DocumentSummarizer,
} from "./document-processing.js";
import {
  filterContextReferences,
  filterSearchResults,
  toHealthDocument,
  toHealthDocumentDetail,
  toHealthDocumentSummary,
} from "./document.mapper.js";
import {
  LocalDocumentStorageAdapter,
  type DocumentStorageAdapter,
} from "./local-document-storage.js";
import { DocumentsRepository } from "./documents.repository.js";
import { DocumentSignalsService } from "./document-signals.service.js";

const REQUIRED_UPLOAD_CONSENT = "upload_storage" as const;

@Injectable()
export class DocumentsService {
  private readonly storage: DocumentStorageAdapter;
  private readonly parser: DocumentParser;
  private readonly summarizer: DocumentSummarizer;

  constructor(
    private readonly documentsRepository: DocumentsRepository,
    private readonly documentSignalsService: DocumentSignalsService,
    private readonly usersService: UsersService,
  ) {
    const storageRoot = resolve(process.cwd(), env.DOCUMENT_STORAGE_PATH);
    this.storage = new LocalDocumentStorageAdapter(storageRoot);
    this.parser = new LabDocumentParser();
    this.summarizer = new DevDocumentSummarizer();
  }

  async createDocument(
    auth: ClerkAuthContext,
    input: CreateHealthDocumentInput,
  ): Promise<HealthDocumentDetail> {
    if (!hasDocumentConsentScope(input.consentScopes, REQUIRED_UPLOAD_CONSENT)) {
      throw new BadRequestException("Upload consent is required before creating a document.");
    }

    if (!input.sampleText && !input.fileContentBase64) {
      throw new BadRequestException(
        "Uploads require sampleText or fileContentBase64 for supported document types.",
      );
    }

    const user = await this.usersService.resolveFromAuth(auth);
    const content = resolveUploadContent(input);

    if (content.byteLength === 0) {
      throw new BadRequestException("Uploaded document content is empty.");
    }

    if (content.byteLength > MAX_HEALTH_DOCUMENT_UPLOAD_BYTES) {
      throw new BadRequestException(
        `Uploaded document exceeds the ${MAX_HEALTH_DOCUMENT_UPLOAD_BYTES} byte limit.`,
      );
    }

    const documentId = crypto.randomUUID();
    const storageReference = await this.storage.store(
      user.id,
      documentId,
      content,
      input.mimeType,
    );

    const document = await this.documentsRepository.create(user.id, {
      id: documentId,
      ...input,
      storageReference,
      fileSizeBytes: content.byteLength,
    });

    return toHealthDocumentDetail(document, null);
  }

  async listDocuments(auth: ClerkAuthContext): Promise<HealthDocumentListResponse> {
    const user = await this.usersService.resolveFromAuth(auth);
    const documents = await this.documentsRepository.listActiveByUserId(user.id);

    return {
      documents: documents.map(toHealthDocument),
    };
  }

  async getDocument(auth: ClerkAuthContext, documentId: string): Promise<HealthDocumentDetail> {
    const user = await this.usersService.resolveFromAuth(auth);
    const document = await this.documentsRepository.findActiveById(user.id, documentId);

    if (!document) {
      throw new NotFoundException("Document not found.");
    }

    const summary = await this.documentsRepository.findLatestSummary(document.id);

    return toHealthDocumentDetail(document, summary);
  }

  async updateConsent(
    auth: ClerkAuthContext,
    documentId: string,
    input: UpdateDocumentConsentInput,
  ): Promise<HealthDocument> {
    const user = await this.usersService.resolveFromAuth(auth);
    const existing = await this.documentsRepository.findActiveById(user.id, documentId);

    if (!existing) {
      throw new NotFoundException("Document not found.");
    }

    const document = await this.documentsRepository.updateConsent(user.id, documentId, {
      consentScopes: input.consentScopes,
      revokedAt: input.revoke ? new Date() : undefined,
      parseStatus: input.revoke ? "revoked" : undefined,
    });

    if (!document) {
      throw new NotFoundException("Document not found.");
    }

    if (input.revoke) {
      await this.documentsRepository.tombstoneSummariesForDocument(user.id, documentId);
      await this.documentSignalsService.revokeSignalsForDocument(user.id, documentId);
    }

    return toHealthDocument(document);
  }

  async reviewSummary(
    auth: ClerkAuthContext,
    documentId: string,
    input: UpdateDocumentSummaryReviewInput,
  ): Promise<HealthDocumentSummary> {
    const user = await this.usersService.resolveFromAuth(auth);
    const document = await this.documentsRepository.findActiveById(user.id, documentId);

    if (!document) {
      throw new NotFoundException("Document not found.");
    }

    const summary = await this.documentsRepository.findLatestSummary(document.id);

    if (!summary) {
      throw new NotFoundException("Document summary not found.");
    }

    if (
      containsUnsafeDocumentSummaryLanguage(summary.summaryText) ||
      summary.extractedConstraints.some((constraint) =>
        containsUnsafeDocumentSummaryLanguage(constraint),
      )
    ) {
      throw new ForbiddenException(
        "Summary cannot be approved because it contains unsafe medical wording.",
      );
    }

    const updated = await this.documentsRepository.updateSummaryReview(
      user.id,
      summary.id,
      input.reviewStatus,
    );

    if (!updated) {
      throw new NotFoundException("Document summary not found.");
    }

    return toHealthDocumentSummary(updated);
  }

  async parseAndSummarize(
    auth: ClerkAuthContext,
    documentId: string,
  ): Promise<HealthDocumentDetail> {
    const user = await this.usersService.resolveFromAuth(auth);
    const document = await this.documentsRepository.findActiveById(user.id, documentId);

    if (!document) {
      throw new NotFoundException("Document not found.");
    }

    if (document.revokedAt) {
      throw new ForbiddenException("Revoked documents cannot be parsed.");
    }

    if (!hasDocumentConsentScope(document.consentScopes, "parse_ocr")) {
      throw new ForbiddenException("Parse consent is required before processing a document.");
    }

    if (!hasDocumentConsentScope(document.consentScopes, "ai_summarization")) {
      throw new ForbiddenException(
        "Summarization consent is required before generating a summary.",
      );
    }

    await this.documentsRepository.updateParseStatus(user.id, documentId, {
      parseStatus: "processing",
      parseFailureReason: null,
    });

    try {
      const content = await this.storage.read(document.storageReference);
      const parsed = await this.parser.parse({
        mimeType: document.mimeType,
        content,
      });
      const generated = await this.summarizer.summarize({
        documentType: document.documentType,
        title: document.title,
        plainText: parsed.plainText,
      });

      const summary = await this.documentsRepository.createSummary({
        healthDocumentId: document.id,
        userId: user.id,
        summaryText: generated.summaryText,
        extractedConstraints: generated.extractedConstraints,
        searchIndexText: generated.searchIndexText,
      });

      const updated = await this.documentsRepository.updateParseStatus(user.id, documentId, {
        parseStatus: "summary_ready",
        parseFailureReason: null,
      });

      if (!updated) {
        throw new NotFoundException("Document not found.");
      }

      return toHealthDocumentDetail(updated, summary);
    } catch {
      const failed = await this.documentsRepository.updateParseStatus(user.id, documentId, {
        parseStatus: "failed",
        parseFailureReason: "Processing failed. No document content was logged.",
      });

      if (!failed) {
        throw new NotFoundException("Document not found.");
      }

      throw new BadRequestException("Document processing failed.");
    }
  }

  async searchDocuments(
    auth: ClerkAuthContext,
    query: DocumentSearchQuery,
  ): Promise<DocumentSearchResponse> {
    const user = await this.usersService.resolveFromAuth(auth);
    const rows = await this.documentsRepository.searchApprovedSummaries(
      user.id,
      query.q.toLowerCase(),
      query.limit,
    );

    return {
      results: filterSearchResults(rows),
    };
  }

  async deleteDocument(auth: ClerkAuthContext, documentId: string): Promise<HealthDocument> {
    const user = await this.usersService.resolveFromAuth(auth);
    const existing = await this.documentsRepository.findActiveById(user.id, documentId);

    if (!existing) {
      throw new NotFoundException("Document not found.");
    }

    await this.storage.delete(existing.storageReference);
    await this.documentsRepository.tombstoneSummariesForDocument(user.id, documentId);
    await this.documentSignalsService.revokeSignalsForDocument(user.id, documentId);
    const document = await this.documentsRepository.softDelete(user.id, documentId);

    if (!document) {
      throw new NotFoundException("Document not found.");
    }

    return toHealthDocument(document);
  }

  async buildDocumentContextSummary(userId: string): Promise<AiDocumentContextSummary> {
    const rows = await this.documentsRepository.listContextCandidates(userId);

    return {
      items: filterContextReferences(rows).slice(0, 10),
      generatedAt: new Date().toISOString(),
    };
  }
}

function resolveUploadContent(input: CreateHealthDocumentInput): Buffer {
  if (input.sampleText) {
    return Buffer.from(input.sampleText, "utf8");
  }

  if (!input.fileContentBase64) {
    throw new BadRequestException("Uploaded document content is missing.");
  }

  try {
    return Buffer.from(input.fileContentBase64, "base64");
  } catch {
    throw new BadRequestException("Uploaded document content is not valid base64.");
  }
}
