/**
 * AttachmentTextExtractionService
 *
 * Extracts plain text from document_file chat attachments (PDF, text/*, markdown)
 * for ephemeral per-turn context. Extracted text reaches ALL selected domain LLMs
 * but is NEVER persisted, stored, or logged beyond the turn boundary.
 *
 * Safety floors (never relaxable):
 *  - Text content is NEVER written to the database.
 *  - Text content is NEVER logged (only refId + status are logged).
 *  - Only document_file MIME types are processed; images are skipped.
 *  - Each extraction is wrapped in a ~5s timeout and degrades gracefully.
 *  - Storage read failures degrade to status "failed" without throwing.
 *  - Empty text layers degrade to status "empty" without throwing.
 */

import { Injectable, Logger } from "@nestjs/common";
import { isChatAttachmentDocumentMimeType, MAX_ATTACHMENT_TEXT_CONTENT_CHARS } from "@health/types";
import { ChatAttachmentsService } from "./chat-attachments.service.js";
import { extractPdfPlainText } from "./pdf-text-extraction.js";

/** Per-attachment extraction timeout in milliseconds. */
const EXTRACTION_TIMEOUT_MS = 5_000;

export type AttachmentTextExtractionStatus = "ok" | "empty" | "failed";

export interface AttachmentTextExtractionResult {
  text?: string;
  truncated: boolean;
  status: AttachmentTextExtractionStatus;
}

@Injectable()
export class AttachmentTextExtractionService {
  private readonly logger = new Logger(AttachmentTextExtractionService.name);

  constructor(private readonly chatAttachmentsService: ChatAttachmentsService) {}

  /**
   * Extract text from document-MIME attachments for this turn.
   *
   * Returns a Map from attachmentRefId → extraction result. Only document_file
   * MIME attachments with a non-null storageRef are processed; image attachments
   * and attachments without storage are skipped (not included in the result map).
   *
   * The caller (AgentOrchestratorService) passes the result map to every domain
   * executor so that textContent is populated on DomainAttachmentItems for ALL
   * selected domains (including workout).
   *
   * NEVER throws. Each extraction degrades independently.
   */
  async extractTurnAttachmentTexts(
    items: ReadonlyArray<{
      attachmentRefId: string;
      mimeType: string;
      storageRef: string | null;
    }>,
  ): Promise<Map<string, AttachmentTextExtractionResult>> {
    const result = new Map<string, AttachmentTextExtractionResult>();

    const documentItems = items.filter(
      (item) => isChatAttachmentDocumentMimeType(item.mimeType) && item.storageRef != null,
    );

    if (documentItems.length === 0) {
      return result;
    }

    await Promise.all(
      documentItems.map(async (item) => {
        const extraction = await this.extractSingle(item.attachmentRefId, item.mimeType, item.storageRef!);
        result.set(item.attachmentRefId, extraction);
      }),
    );

    return result;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async extractSingle(
    refId: string,
    mimeType: string,
    storageRef: string,
  ): Promise<AttachmentTextExtractionResult> {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<AttachmentTextExtractionResult>((resolve) => {
      timeoutHandle = setTimeout(() => {
        this.logger.warn({ event: "attachment_text_extraction_timeout", refId });
        resolve({ truncated: false, status: "failed" });
      }, EXTRACTION_TIMEOUT_MS);
    });

    const extractPromise = this.extractWithStorage(refId, mimeType, storageRef).then((result) => {
      // Clear the timer so it never fires after extraction already resolved.
      clearTimeout(timeoutHandle);
      return result;
    });

    return Promise.race([extractPromise, timeoutPromise]);
  }

  private async extractWithStorage(
    refId: string,
    mimeType: string,
    storageRef: string,
  ): Promise<AttachmentTextExtractionResult> {
    let buffer: Buffer;

    try {
      buffer = await this.chatAttachmentsService.readStoredContent(storageRef);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn({ event: "attachment_text_extraction_storage_error", refId, message });
      return { truncated: false, status: "failed" };
    }

    return this.extractFromBuffer(refId, mimeType, buffer);
  }

  private async extractFromBuffer(
    refId: string,
    mimeType: string,
    buffer: Buffer,
  ): Promise<AttachmentTextExtractionResult> {
    try {
      let rawText: string;

      if (mimeType === "application/pdf") {
        let parsed: { plainText: string };

        try {
          parsed = await extractPdfPlainText(buffer);
        } catch (pdfError) {
          const pdfMessage = pdfError instanceof Error ? pdfError.message : String(pdfError);

          // extractPdfPlainText throws a well-known message when the PDF has no text
          // layer (image-only PDFs, etc.). Map that specific case to "empty" — it is not
          // a processing failure, just an absence of extractable content.
          if (pdfMessage.includes("did not contain extractable text")) {
            this.logger.log({ event: "attachment_text_extraction_empty", refId });
            return { truncated: false, status: "empty" };
          }

          throw pdfError;
        }

        rawText = parsed.plainText;
      } else {
        // text/plain, text/markdown, text/x-markdown → read as UTF-8
        rawText = buffer.toString("utf8");
      }

      const trimmed = rawText.trim();

      if (trimmed.length === 0) {
        this.logger.log({ event: "attachment_text_extraction_empty", refId });
        return { truncated: false, status: "empty" };
      }

      if (trimmed.length > MAX_ATTACHMENT_TEXT_CONTENT_CHARS) {
        const text = trimmed.slice(0, MAX_ATTACHMENT_TEXT_CONTENT_CHARS);
        this.logger.log({ event: "attachment_text_extraction_ok", refId, truncated: true });
        return { text, truncated: true, status: "ok" };
      }

      this.logger.log({ event: "attachment_text_extraction_ok", refId, truncated: false });
      return { text: trimmed, truncated: false, status: "ok" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn({ event: "attachment_text_extraction_error", refId, message });
      return { truncated: false, status: "failed" };
    }
  }
}
