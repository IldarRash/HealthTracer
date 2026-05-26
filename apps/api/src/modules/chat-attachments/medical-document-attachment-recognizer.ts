import { containsUnsafeDocumentSummaryLanguage } from "@health/ai";
import type {
  ChatAttachmentConsent,
  ChatAttachmentRecord,
  DocumentType,
  MedicalDocumentRecognitionEnvelope,
} from "@health/types";
import {
  assertRecognitionProviderIsolation,
  buildDocumentSummarySnippet,
  recognitionProvenanceSchema,
} from "@health/types";
import { BadRequestException, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { ClerkAuthContext } from "../../auth.types.js";
import { DocumentsService } from "../documents/documents.service.js";
import {
  type ChatAttachmentStorageAdapter,
} from "./local-chat-attachment-storage.js";

type MedicalUploadMetadata = {
  documentType: DocumentType;
  documentTitle: string;
};

@Injectable()
export class MedicalDocumentAttachmentRecognizer {
  constructor(private readonly documentsService: DocumentsService) {}

  async recognize(input: {
    auth: ClerkAuthContext;
    attachment: ChatAttachmentRecord;
    consent: ChatAttachmentConsent;
    uploadMetadata: MedicalUploadMetadata;
    storage: ChatAttachmentStorageAdapter;
  }): Promise<MedicalDocumentRecognitionEnvelope> {
    assertRecognitionProviderIsolation({
      category: "medical_document",
      payload: {
        documentType: input.uploadMetadata.documentType,
        documentTitle: input.uploadMetadata.documentTitle,
        consentScopes: input.consent.consentScopes,
      },
    });

    if (!input.attachment.storageKey) {
      throw new BadRequestException("Medical document attachment is missing storage metadata.");
    }

    const content = await input.storage.read(input.attachment.storageKey);

    const documentDetail = await this.documentsService.createDocument(input.auth, {
      documentType: input.uploadMetadata.documentType,
      title: input.uploadMetadata.documentTitle,
      consentScopes: input.consent.consentScopes,
      consentVersion: input.consent.consentVersion,
      mimeType: input.attachment.mimeType as "text/plain" | "application/pdf",
      fileContentBase64: content.toString("base64"),
    });

    const parsedDetail = await this.documentsService.parseAndSummarize(
      input.auth,
      documentDetail.id,
    );

    const summarySnippet = parsedDetail.summary
      ? buildDocumentSummarySnippet(parsedDetail.summary.summaryText)
      : null;

    if (summarySnippet && containsUnsafeDocumentSummaryLanguage(summarySnippet)) {
      throw new BadRequestException(
        "Document summary contains unsafe medical wording and cannot be used for coaching context.",
      );
    }

    const recognitionId = randomUUID();

    return {
      category: "medical_document",
      attachmentRefId: input.attachment.id,
      documentId: parsedDetail.id,
      documentType: parsedDetail.documentType,
      title: parsedDetail.title,
      parseStatus:
        parsedDetail.parseStatus === "revoked"
          ? "failed"
          : parsedDetail.parseStatus,
      summarySnippet,
      reviewStatus: parsedDetail.summary?.reviewStatus ?? "pending_review",
      documentReviewPath: null,
      consentScopes: [...parsedDetail.consentScopes],
      provenance: recognitionProvenanceSchema.parse({
        source: "document_parser",
        providerId: "documents_module",
        recognitionId,
        confidence: "medium",
      }),
      wellnessContextOnlyNotice:
        "This document is wellness coaching context only. It is not a diagnosis or treatment plan.",
    };
  }
}

export function parseMedicalUploadMetadata(
  attachment: ChatAttachmentRecord,
): MedicalUploadMetadata | null {
  const raw = attachment.consent as ChatAttachmentConsent & Partial<MedicalUploadMetadata>;

  if (!raw?.documentType || !raw?.documentTitle) {
    return null;
  }

  return {
    documentType: raw.documentType,
    documentTitle: raw.documentTitle,
  };
}

export function buildMedicalAttachmentConsent(input: {
  consentScopes: ChatAttachmentConsent["consentScopes"];
  consentVersion: string;
  documentType: DocumentType;
  documentTitle: string;
}): ChatAttachmentConsent & MedicalUploadMetadata {
  return {
    consentScopes: input.consentScopes,
    consentVersion: input.consentVersion,
    consentGrantedAt: new Date().toISOString(),
    documentType: input.documentType,
    documentTitle: input.documentTitle,
  };
}
