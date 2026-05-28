import {
  extractTextAttachmentClassificationExcerpt,
  isChatAttachmentImageMimeType,
  isPdfAttachmentMimeType,
} from "@health/types";

export function buildNonImageClassificationPromptParts(input: {
  metadataPrompt: string;
  mimeType: string;
  content: Buffer;
}): Array<Record<string, unknown>> {
  const textExcerpt = extractTextAttachmentClassificationExcerpt(
    input.content,
    input.mimeType,
  );

  if (textExcerpt) {
    return [
      { type: "text", text: input.metadataPrompt },
      {
        type: "text",
        text: `File text excerpt (truncated):\n${textExcerpt}`,
      },
    ];
  }

  if (isPdfAttachmentMimeType(input.mimeType)) {
    return [
      {
        type: "text",
        text: [
          input.metadataPrompt,
          "PDF file content is not parsed in this release. Classify from filename, MIME type, and user message only.",
          "Do not assume medical_document from application/pdf alone. Prefer manual_fallback when uncertain.",
        ].join("\n"),
      },
    ];
  }

  return [{ type: "text", text: input.metadataPrompt }];
}

export function resolveOpenAiClassificationMethod(mimeType: string): "vision" | "text_excerpt" | "metadata_only" {
  if (isChatAttachmentImageMimeType(mimeType)) {
    return "vision";
  }

  if (mimeType === "text/plain") {
    return "text_excerpt";
  }

  return "metadata_only";
}
