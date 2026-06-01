import type {
  ChatAttachmentConsent,
  ChatAttachmentRecord,
  DocumentType,
} from "@health/types";

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
