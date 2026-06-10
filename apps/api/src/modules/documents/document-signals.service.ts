import { containsUnsafeDocumentSummaryLanguage } from "@health/ai";
import type {
  AiDocumentSignalContextSummary,
  DocumentSignal,
  DocumentSignalListResponse,
  UpdateDocumentSignalReviewInput,
} from "@health/types";
import { hasDocumentConsentScope, validateExtractedDocumentSignalDrafts } from "@health/types";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { env } from "../../env.js";
import { UsersService } from "../users/users.service.js";
import {
  DevLabSignalExtractor,
  type DocumentSignalExtractor,
} from "./document-signal-extraction.js";
import {
  filterDocumentSignalContextRefs,
  toDocumentSignal,
  toDocumentSignalListResponse,
} from "./document-signal.mapper.js";
import { LabDocumentParser, type DocumentParser } from "./document-processing.js";
import {
  LocalDocumentStorageAdapter,
  type DocumentStorageAdapter,
} from "./local-document-storage.js";
import { DocumentsRepository } from "./documents.repository.js";
import { DocumentSignalsRepository } from "./document-signals.repository.js";

const REQUIRED_SIGNAL_CONSENT = "coach_chat_context" as const;

@Injectable()
export class DocumentSignalsService {
  private readonly storage: DocumentStorageAdapter;
  private readonly parser: DocumentParser;
  private readonly extractor: DocumentSignalExtractor;

  constructor(
    private readonly documentsRepository: DocumentsRepository,
    private readonly documentSignalsRepository: DocumentSignalsRepository,
    private readonly usersService: UsersService,
  ) {
    this.storage = new LocalDocumentStorageAdapter(env.DOCUMENT_STORAGE_PATH, {
      allowInProduction: env.STORAGE_ALLOW_LOCAL_IN_PRODUCTION === true,
    });
    this.parser = new LabDocumentParser();
    this.extractor = new DevLabSignalExtractor();
  }

  async listSignals(
    auth: ClerkAuthContext,
    documentId: string,
  ): Promise<DocumentSignalListResponse> {
    const user = await this.usersService.resolveFromAuth(auth);
    const document = await this.documentsRepository.findActiveById(user.id, documentId);

    if (!document) {
      throw new NotFoundException("Document not found.");
    }

    const signals = await this.documentSignalsRepository.listByDocumentId(user.id, documentId);

    return toDocumentSignalListResponse(document, signals.map(toDocumentSignal));
  }

  async extractSignals(
    auth: ClerkAuthContext,
    documentId: string,
  ): Promise<DocumentSignalListResponse> {
    const user = await this.usersService.resolveFromAuth(auth);
    const document = await this.documentsRepository.findActiveById(user.id, documentId);

    if (!document) {
      throw new NotFoundException("Document not found.");
    }

    if (document.revokedAt) {
      throw new ForbiddenException("Revoked documents cannot be processed for signals.");
    }

    if (!hasDocumentConsentScope(document.consentScopes, "parse_ocr")) {
      throw new ForbiddenException("Parse consent is required before extracting signals.");
    }

    if (!hasDocumentConsentScope(document.consentScopes, REQUIRED_SIGNAL_CONSENT)) {
      throw new ForbiddenException(
        "Coaching-context consent is required before extracting wellness signals.",
      );
    }

    await this.documentSignalsRepository.updateSignalExtractionStatus(user.id, documentId, {
      signalExtractionStatus: "processing",
      signalExtractionFailureReason: null,
    });

    try {
      const content = await this.storage.read(document.storageReference);
      const parsed = await this.parser.parse({
        mimeType: document.mimeType,
        content,
      });
      const drafts = this.extractor.extract(parsed.plainText);
      const validation = validateExtractedDocumentSignalDrafts(drafts);

      if (validation.errors.length > 0) {
        throw new BadRequestException({
          message: "Extracted signal payload failed validation.",
          validationErrors: validation.errors,
        });
      }

      const signals = await this.documentSignalsRepository.replaceSignalsForDocument(
        user.id,
        documentId,
        validation.valid,
      );
      const updatedDocument = await this.documentSignalsRepository.updateSignalExtractionStatus(
        user.id,
        documentId,
        {
          signalExtractionStatus: "ready",
          signalExtractionFailureReason: null,
          signalExtractedAt: new Date(),
        },
      );

      if (!updatedDocument) {
        throw new NotFoundException("Document not found.");
      }

      return toDocumentSignalListResponse(updatedDocument, signals.map(toDocumentSignal));
    } catch (error) {
      await this.documentSignalsRepository.updateSignalExtractionStatus(user.id, documentId, {
        signalExtractionStatus: "failed",
        signalExtractionFailureReason:
          "Signal extraction failed. No document content was logged.",
      });

      if (error instanceof BadRequestException || error instanceof ForbiddenException) {
        throw error;
      }

      throw new BadRequestException("Signal extraction failed.");
    }
  }

  async reviewSignal(
    auth: ClerkAuthContext,
    documentId: string,
    signalId: string,
    input: UpdateDocumentSignalReviewInput,
  ): Promise<DocumentSignal> {
    const user = await this.usersService.resolveFromAuth(auth);
    const document = await this.documentsRepository.findActiveById(user.id, documentId);

    if (!document) {
      throw new NotFoundException("Document not found.");
    }

    const signal = await this.documentSignalsRepository.findById(user.id, signalId);

    if (!signal || signal.healthDocumentId !== documentId) {
      throw new NotFoundException("Document signal not found.");
    }

    const mapped = toDocumentSignal(signal);
    const reviewText = [
      mapped.displayLabel,
      mapped.valueText,
      mapped.unit,
      mapped.sourceSection,
      mapped.referenceRangeText ?? "",
    ].join(" ");

    if (containsUnsafeDocumentSummaryLanguage(reviewText)) {
      throw new ForbiddenException(
        "Signal cannot be approved because it contains unsafe medical wording.",
      );
    }

    const updated = await this.documentSignalsRepository.updateSignalReview(
      user.id,
      signalId,
      input.reviewStatus,
      input.reviewStatus === "ignored" ? (input.ignoredReason ?? "Ignored by user.") : null,
    );

    if (!updated) {
      throw new NotFoundException("Document signal not found.");
    }

    return toDocumentSignal(updated);
  }

  async buildSignalContextSummary(userId: string): Promise<AiDocumentSignalContextSummary> {
    const rows = await this.documentSignalsRepository.listContextCandidates(userId);

    return {
      signals: filterDocumentSignalContextRefs(rows).slice(0, 20),
      generatedAt: new Date().toISOString(),
    };
  }

  async revokeSignalsForDocument(userId: string, documentId: string): Promise<void> {
    await this.documentSignalsRepository.tombstoneSignalsForDocument(userId, documentId);
    await this.documentSignalsRepository.updateSignalExtractionStatus(userId, documentId, {
      signalExtractionStatus: "revoked",
      signalExtractionFailureReason: null,
    });
  }
}
