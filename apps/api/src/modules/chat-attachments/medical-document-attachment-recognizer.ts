import type {
  ChatAttachmentConsent,
  ChatAttachmentRecord,
  DocumentType,
  MedicalDocumentRecognitionEnvelope,
} from "@health/types";
import {
  assertRecognitionProviderIsolation,
  ATTACHMENT_CONTEXT_ONLY_PLACEHOLDER_DOCUMENT_ID,
  recognitionProvenanceSchema,
} from "@health/types";
import { randomUUID } from "node:crypto";

type MedicalUploadMetadata = {
  documentType: DocumentType;
  documentTitle: string;
};

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

export function buildMedicalDocumentContextOnlyRecognition(input: {
  attachment: ChatAttachmentRecord;
  consent: ChatAttachmentConsent;
  uploadMetadata: MedicalUploadMetadata;
  wellnessContextOnlyNotice: string;
}): MedicalDocumentRecognitionEnvelope {
  assertRecognitionProviderIsolation({
    category: "medical_document",
    payload: {
      documentType: input.uploadMetadata.documentType,
      documentTitle: input.uploadMetadata.documentTitle,
      consentScopes: input.consent.consentScopes,
    },
  });

  const recognitionId = randomUUID();

  return {
    category: "medical_document",
    attachmentRefId: input.attachment.id,
    documentId: ATTACHMENT_CONTEXT_ONLY_PLACEHOLDER_DOCUMENT_ID,
    documentType: input.uploadMetadata.documentType,
    title: input.uploadMetadata.documentTitle,
    parseStatus: "uploaded",
    summarySnippet: null,
    reviewStatus: null,
    documentReviewPath: null,
    consentScopes: [...input.consent.consentScopes],
    provenance: recognitionProvenanceSchema.parse({
      source: "attachment_context_only",
      providerId: "chat_attachment",
      recognitionId,
      confidence: "medium",
    }),
    wellnessContextOnlyNotice: input.wellnessContextOnlyNotice,
    documentPersistenceStatus: "attachment_context_only",
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
