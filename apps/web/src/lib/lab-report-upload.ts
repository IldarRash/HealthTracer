import type {
  CreateLabReportInput,
  SupportedLabReportMimeType,
} from "@health/types";
import {
  MAX_LAB_REPORT_UPLOAD_BYTES,
  SUPPORTED_LAB_REPORT_MIME_TYPES,
} from "@health/types";
import { readFileAsBase64 } from "./file-upload";

export const LAB_REPORT_UPLOAD_ACCEPT =
  ".pdf,.txt,application/pdf,text/plain" as const;

/** i18n key suffixes in the Biomarkers namespace for file validation errors. */
export type LabReportFileErrorKey =
  | "upload.fileErrorUnsupported"
  | "upload.fileErrorTooLarge"
  | "upload.fileRequired";

export type LabReportFileValidationResult =
  | { ok: true; mimeType: SupportedLabReportMimeType }
  | { ok: false; errorKey: LabReportFileErrorKey };

export function isSupportedLabReportMimeType(
  mimeType: string,
): mimeType is SupportedLabReportMimeType {
  return (SUPPORTED_LAB_REPORT_MIME_TYPES as readonly string[]).includes(mimeType);
}

export function resolveSupportedLabReportMimeType(
  file: Pick<File, "name" | "type">,
): SupportedLabReportMimeType | null {
  const normalizedType = file.type.trim().toLowerCase();

  if (isSupportedLabReportMimeType(normalizedType)) {
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

export function validateSelectedLabReportFile(
  file: File,
): LabReportFileValidationResult {
  const mimeType = resolveSupportedLabReportMimeType(file);
  if (!mimeType) {
    return { ok: false, errorKey: "upload.fileErrorUnsupported" };
  }

  if (file.size > MAX_LAB_REPORT_UPLOAD_BYTES) {
    return { ok: false, errorKey: "upload.fileErrorTooLarge" };
  }

  return { ok: true, mimeType };
}

export type CreateLabReportPayloadResult =
  | { ok: true; payload: CreateLabReportInput }
  | { ok: false; errorKey: LabReportFileErrorKey };

export async function buildCreateLabReportPayload(input: {
  title: string;
  selectedFile: File | null;
  coachChat: boolean;
}): Promise<CreateLabReportPayloadResult> {
  if (!input.selectedFile) {
    return { ok: false, errorKey: "upload.fileRequired" };
  }

  const validation = validateSelectedLabReportFile(input.selectedFile);
  if (!validation.ok) {
    return validation;
  }

  const fileContentBase64 = await readFileAsBase64(input.selectedFile);

  return {
    ok: true,
    payload: {
      title: input.title.trim(),
      mimeType: validation.mimeType,
      fileContentBase64,
      consent: {
        storeAndParse: true,
        coachChat: input.coachChat,
      },
      consentVersion: "v2",
    },
  };
}
