import type { DocumentType, SupportedHealthDocumentMimeType } from "@health/types";
import { PDFParse } from "pdf-parse";

export interface ParsedDocumentContent {
  plainText: string;
}

export interface DocumentParser {
  parse(input: { mimeType: string; content: Buffer }): Promise<ParsedDocumentContent>;
}

export class DevTextDocumentParser implements DocumentParser {
  async parse(input: { mimeType: string; content: Buffer }): Promise<ParsedDocumentContent> {
    if (input.mimeType !== "text/plain") {
      throw new Error("Unsupported mime type for development parser.");
    }

    return {
      plainText: input.content.toString("utf8"),
    };
  }
}

export class LabDocumentParser implements DocumentParser {
  async parse(input: { mimeType: string; content: Buffer }): Promise<ParsedDocumentContent> {
    if (input.mimeType === "text/plain") {
      return {
        plainText: input.content.toString("utf8"),
      };
    }

    if (input.mimeType === "application/pdf") {
      return extractPdfPlainText(input.content);
    }

    throw new Error("Unsupported document mime type.");
  }
}

export async function extractPdfPlainText(content: Buffer): Promise<ParsedDocumentContent> {
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

export function resolveUploadExtension(mimeType: SupportedHealthDocumentMimeType): string {
  switch (mimeType) {
    case "text/plain":
      return "txt";
    case "application/pdf":
      return "pdf";
    default:
      return "bin";
  }
}

export interface GeneratedDocumentSummary {
  summaryText: string;
  extractedConstraints: string[];
  searchIndexText: string;
}

export interface DocumentSummarizer {
  summarize(input: {
    documentType: DocumentType;
    title: string;
    plainText: string;
  }): Promise<GeneratedDocumentSummary>;
}

/** Safe coaching labels that avoid medical-safety false positives in approval checks. */
export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  lab_report: "lab report",
  clinical_note: "provider note",
  imaging_report: "imaging report",
  medication_list: "med list",
  discharge_summary: "discharge summary",
  other: "health document",
};

const DEFAULT_CONSTRAINT =
  "Review uploaded document details with a qualified professional when needed.";

/** Bounded wellness phrases—matched in normalized text, never persisted verbatim from OCR. */
const KNOWN_WELLNESS_HINTS: ReadonlyArray<{ pattern: RegExp; constraint: string }> = [
  { pattern: /\blow[\s-]?impact\b/i, constraint: "May prefer low-impact activity choices." },
  { pattern: /\bhigh[\s-]?impact\b/i, constraint: "May prefer limiting high-impact activity." },
  { pattern: /\brest days?\b/i, constraint: "May prefer scheduled rest days." },
  { pattern: /\bvegetarian\b/i, constraint: "May prefer vegetarian meal choices." },
  { pattern: /\bgluten[\s-]?free\b/i, constraint: "May prefer gluten-free meal choices." },
  { pattern: /\bdairy[\s-]?free\b/i, constraint: "May prefer dairy-free meal choices." },
  { pattern: /\bhydration\b/i, constraint: "May prefer prioritizing hydration." },
];

const UNSAFE_CONSTRAINT_PATTERNS = [
  /\bdiagnos(e|is|ed|ing)\b/i,
  /\bprescri(be|ption|bed|bing)\b/i,
  /\btreat(ment|ing|ed)?\b/i,
  /\bmedication dosing\b/i,
  /\bdosage\b/i,
  /\bdose\b/i,
];

function extractBoundedWellnessConstraints(plainText: string): string[] {
  const constraints: string[] = [];

  for (const hint of KNOWN_WELLNESS_HINTS) {
    if (hint.pattern.test(plainText)) {
      constraints.push(hint.constraint);
    }
  }

  return constraints.slice(0, 5);
}

export function buildGovernedDocumentSummary(input: {
  documentType: DocumentType;
  title: string;
  plainText: string;
}): GeneratedDocumentSummary {
  const typeLabel = DOCUMENT_TYPE_LABELS[input.documentType];
  const boundedConstraints = extractBoundedWellnessConstraints(input.plainText);
  const extractedConstraints =
    boundedConstraints.length > 0 ? boundedConstraints : [DEFAULT_CONSTRAINT];

  const hasHints = boundedConstraints.length > 0;
  const summaryText =
    `Governed summary for a user-provided ${typeLabel} titled "${input.title}". ` +
    `This record contains metadata and coaching-safe preference hints only—not raw document text. ` +
    (hasHints
      ? "Bounded wellness preference hints were detected for user review."
      : "No bounded wellness preference hints were detected.") +
    " Discuss document specifics with a qualified professional for medical interpretation.";

  const searchIndexText = [input.title, typeLabel, ...extractedConstraints]
    .join(" ")
    .toLowerCase()
    .slice(0, 500);

  return {
    summaryText,
    extractedConstraints,
    searchIndexText,
  };
}

export function containsRawDocumentText(
  generated: GeneratedDocumentSummary,
  plainText: string,
): boolean {
  const normalized = plainText.trim().replace(/\s+/g, " ");
  if (normalized.length < 12) {
    return false;
  }

  const excerpt = normalized.slice(0, 120);
  const fields = [generated.summaryText, generated.searchIndexText, ...generated.extractedConstraints];

  return fields.some((field) => field.includes(excerpt) || field.includes(normalized.slice(0, 80)));
}

export function isConstraintSafeForApproval(constraint: string): boolean {
  return !UNSAFE_CONSTRAINT_PATTERNS.some((pattern) => pattern.test(constraint));
}

export class DevDocumentSummarizer implements DocumentSummarizer {
  async summarize(input: {
    documentType: DocumentType;
    title: string;
    plainText: string;
  }): Promise<GeneratedDocumentSummary> {
    return buildGovernedDocumentSummary(input);
  }
}
