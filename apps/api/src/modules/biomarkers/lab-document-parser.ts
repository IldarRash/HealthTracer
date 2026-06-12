import type { LabReportFailureCode, SupportedLabReportMimeType } from "@health/types";
import { PDFParse } from "pdf-parse";

// The lab-extraction parser: extracts plain text from explicitly uploaded
// lab-report files (PDF / plain text) before the extraction LLM stage.

/** Hard cap on extractable text handed to the lab-extraction LLM stage. */
export const MAX_LAB_DOCUMENT_TEXT_CHARS = 60_000;

export type LabDocumentParseFailureCode = Extract<
  LabReportFailureCode,
  "file_unreadable" | "pdf_no_text" | "content_too_large"
>;

export type LabDocumentParseResult =
  | { ok: true; text: string }
  | { ok: false; failureCode: LabDocumentParseFailureCode };

export class LabDocumentParser {
  async parse(
    content: Buffer,
    mimeType: SupportedLabReportMimeType,
  ): Promise<LabDocumentParseResult> {
    if (mimeType === "text/plain") {
      const text = content.toString("utf8").trim();

      if (text.length === 0) {
        return { ok: false, failureCode: "file_unreadable" };
      }

      return capParsedText(text);
    }

    return parsePdfContent(content);
  }
}

async function parsePdfContent(content: Buffer): Promise<LabDocumentParseResult> {
  let parser: PDFParse;

  try {
    parser = new PDFParse({ data: content });
  } catch {
    return { ok: false, failureCode: "file_unreadable" };
  }

  try {
    const textResult = await parser.getText();
    const text = textResult.text.trim();

    if (text.length === 0) {
      return { ok: false, failureCode: "pdf_no_text" };
    }

    return capParsedText(text);
  } catch {
    return { ok: false, failureCode: "file_unreadable" };
  } finally {
    await parser.destroy();
  }
}

function capParsedText(text: string): LabDocumentParseResult {
  if (text.length > MAX_LAB_DOCUMENT_TEXT_CHARS) {
    return { ok: false, failureCode: "content_too_large" };
  }

  return { ok: true, text };
}
