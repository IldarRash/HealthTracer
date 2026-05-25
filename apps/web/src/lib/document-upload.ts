import type {
  CreateHealthDocumentInput,
  DocumentConsentScope,
  DocumentType,
  SupportedHealthDocumentMimeType,
} from "@health/types";
import {
  MAX_HEALTH_DOCUMENT_UPLOAD_BYTES,
  SUPPORTED_HEALTH_DOCUMENT_MIME_TYPES,
} from "@health/types";

export const DOCUMENT_UPLOAD_ACCEPT =
  ".pdf,.txt,application/pdf,text/plain" as const;

export const DOCUMENT_UPLOAD_UNSUPPORTED_MESSAGE =
  "Choose a plain text (.txt) or PDF file. Other formats are not supported for wellness document upload.";

export const DOCUMENT_UPLOAD_SIZE_LIMIT_MESSAGE =
  "This file is larger than 5 MB. Choose a smaller document or paste a shorter sample.";

export const DOCUMENT_UPLOAD_SOURCE_REQUIRED_MESSAGE =
  "Add a supported file or paste development sample text.";

export const DOCUMENT_UPLOAD_MUTUAL_EXCLUSIVITY_MESSAGE =
  "Choose either a file upload or sample text, not both.";

export type DocumentFileValidationResult =
  | { ok: true; mimeType: SupportedHealthDocumentMimeType }
  | { ok: false; message: string };

export type DocumentUploadSourceInput = {
  title: string;
  documentType: DocumentType;
  consentScopes: DocumentConsentScope[];
  consentVersion: string;
  sampleText: string;
  selectedFile: File | null;
};

export type DocumentUploadPayloadResult =
  | { ok: true; payload: CreateHealthDocumentInput }
  | { ok: false; message: string };

export function isSupportedDocumentMimeType(
  mimeType: string,
): mimeType is SupportedHealthDocumentMimeType {
  return (SUPPORTED_HEALTH_DOCUMENT_MIME_TYPES as readonly string[]).includes(mimeType);
}

export function resolveSupportedDocumentMimeType(
  file: Pick<File, "name" | "type">,
): SupportedHealthDocumentMimeType | null {
  const normalizedType = file.type.trim().toLowerCase();

  if (isSupportedDocumentMimeType(normalizedType)) {
    return normalizedType;
  }

  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "pdf") {
    return "application/pdf";
  }

  if (extension === "txt") {
    return "text/plain";
  }

  return null;
}

export function validateSelectedDocumentFile(file: File): DocumentFileValidationResult {
  if (file.size > MAX_HEALTH_DOCUMENT_UPLOAD_BYTES) {
    return {
      ok: false,
      message: DOCUMENT_UPLOAD_SIZE_LIMIT_MESSAGE,
    };
  }

  const mimeType = resolveSupportedDocumentMimeType(file);
  if (!mimeType) {
    return {
      ok: false,
      message: DOCUMENT_UPLOAD_UNSUPPORTED_MESSAGE,
    };
  }

  return { ok: true, mimeType };
}

export function formatDocumentFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function readFileAsBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

export async function buildCreateDocumentUploadPayload(
  input: DocumentUploadSourceInput,
): Promise<DocumentUploadPayloadResult> {
  const title = input.title.trim();
  const sampleText = input.sampleText.trim();
  const hasSampleText = sampleText.length > 0;
  const hasSelectedFile = input.selectedFile !== null;

  if (hasSampleText && hasSelectedFile) {
    return { ok: false, message: DOCUMENT_UPLOAD_MUTUAL_EXCLUSIVITY_MESSAGE };
  }

  if (!hasSampleText && !hasSelectedFile) {
    return { ok: false, message: DOCUMENT_UPLOAD_SOURCE_REQUIRED_MESSAGE };
  }

  const base = {
    title,
    documentType: input.documentType,
    consentScopes: input.consentScopes,
    consentVersion: input.consentVersion,
  };

  if (hasSampleText) {
    return {
      ok: true,
      payload: {
        ...base,
        mimeType: "text/plain",
        sampleText,
      },
    };
  }

  const file = input.selectedFile;
  if (!file) {
    return { ok: false, message: DOCUMENT_UPLOAD_SOURCE_REQUIRED_MESSAGE };
  }

  const validation = validateSelectedDocumentFile(file);
  if (!validation.ok) {
    return { ok: false, message: validation.message };
  }

  const fileContentBase64 = await readFileAsBase64(file);

  return {
    ok: true,
    payload: {
      ...base,
      mimeType: validation.mimeType,
      fileContentBase64,
    },
  };
}
