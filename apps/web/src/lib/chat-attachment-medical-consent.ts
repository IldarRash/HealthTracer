import type {
  DocumentConsentScope,
  DocumentType,
  GrantChatAttachmentConsentInput,
} from "@health/types";
import { getMedicalAttachmentConsentErrors } from "@health/types";
import {
  validateChatAttachmentFile,
  type ChatComposerAttachmentDraft,
} from "./chat-attachment-ui-state";
import { readFileAsBase64 } from "./document-upload";
import { DOCUMENT_CONSENT_VERSION } from "./documents-ui-state";

export const MEDICAL_ATTACHMENT_NEEDS_CONSENT_OUTCOME_COPY =
  "This attachment was identified as a wellness document after send. Grant consent below to store and process it. Nothing is saved until you confirm.";

export const MEDICAL_ATTACHMENT_RESELECT_FILE_COPY =
  "Choose the wellness document file again before granting consent.";

export type PendingMedicalAttachmentConsent = {
  attachmentRefId: string;
  file: File | null;
  filename: string;
  documentType: DocumentType;
  documentTitle: string;
  consentScopes: DocumentConsentScope[];
  isGranting: boolean;
  error: string | null;
};

export type BuildGrantMedicalConsentResult =
  | { ok: true; payload: GrantChatAttachmentConsentInput }
  | { ok: false; message: string };

export function createPendingMedicalAttachmentConsentFromDraft(
  draft: ChatComposerAttachmentDraft,
): PendingMedicalAttachmentConsent {
  const defaultTitle = draft.file.name.replace(/\.[^.]+$/, "").slice(0, 160);

  return {
    attachmentRefId: draft.attachmentId!,
    file: draft.file,
    filename: draft.file.name,
    documentType: draft.category === "medical_document" ? draft.documentType : "other",
    documentTitle: draft.documentTitle.trim() || defaultTitle,
    consentScopes: [...draft.consentScopes],
    isGranting: false,
    error: null,
  };
}

export function createEmptyPendingMedicalAttachmentConsent(
  attachmentRefId: string,
): PendingMedicalAttachmentConsent {
  return {
    attachmentRefId,
    file: null,
    filename: "",
    documentType: "other",
    documentTitle: "",
    consentScopes: [],
    isGranting: false,
    error: null,
  };
}

export function getPendingMedicalAttachmentConsentErrors(
  pending: Pick<
    PendingMedicalAttachmentConsent,
    "documentTitle" | "consentScopes" | "file"
  >,
  options?: { requireFile?: boolean },
): string[] {
  const errors = [...getMedicalAttachmentConsentErrors("medical_document", pending.consentScopes)];

  if (!pending.documentTitle.trim()) {
    errors.push("Add a document title before granting consent.");
  }

  if (options?.requireFile !== false && !pending.file) {
    errors.push(MEDICAL_ATTACHMENT_RESELECT_FILE_COPY);
  }

  return errors;
}

export async function buildGrantMedicalAttachmentConsentInput(
  pending: Pick<
    PendingMedicalAttachmentConsent,
    "consentScopes" | "documentTitle" | "documentType" | "file"
  >,
  options?: { requireFile?: boolean },
): Promise<BuildGrantMedicalConsentResult> {
  const validationErrors = getPendingMedicalAttachmentConsentErrors(pending, options);

  if (validationErrors.length > 0) {
    return { ok: false, message: validationErrors[0]! };
  }

  const payload: GrantChatAttachmentConsentInput = {
    consentScopes: [...pending.consentScopes],
    consentVersion: DOCUMENT_CONSENT_VERSION,
    documentType: pending.documentType,
    documentTitle: pending.documentTitle.trim(),
  };

  if (pending.file) {
    const fileError = validateChatAttachmentFile(pending.file, "medical_document");

    if (fileError) {
      return { ok: false, message: fileError };
    }

    payload.fileContentBase64 = await readFileAsBase64(pending.file);
  }

  return { ok: true, payload };
}
