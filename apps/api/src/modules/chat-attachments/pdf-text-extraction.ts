import { PDFParse } from "pdf-parse";

export interface ExtractedPdfContent {
  plainText: string;
}

/**
 * Extract the plain-text layer of a PDF buffer.
 * Relocated from the deleted documents module — the chat-attachments lazy
 * per-turn extraction is its only consumer (the explicit lab-report flow has
 * its own parser in modules/biomarkers/lab-document-parser.ts).
 * Throws "PDF did not contain extractable text." for image-only PDFs.
 */
export async function extractPdfPlainText(content: Buffer): Promise<ExtractedPdfContent> {
  const parser = new PDFParse({ data: content });

  try {
    const textResult = await parser.getText();
    const plainText = textResult.text.trim();

    if (plainText.length === 0) {
      throw new Error("PDF did not contain extractable text.");
    }

    return { plainText };
  } finally {
    await parser.destroy();
  }
}
