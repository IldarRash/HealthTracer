import type { DocumentSignalKey, ExtractedDocumentSignalDraft } from "@health/types";
import { validateExtractedDocumentSignalDrafts } from "@health/types";

type SignalPattern = {
  signalKey: DocumentSignalKey;
  displayLabel: string;
  unit: string;
  pattern: RegExp;
  sourceSection: string;
  confidenceScore: number;
};

const SIGNAL_PATTERNS: SignalPattern[] = [
  {
    signalKey: "vitamin_d",
    displayLabel: "Vitamin D",
    unit: "ng/mL",
    pattern: /vitamin\s*d[:\s]+([0-9]+(?:\.[0-9]+)?)\s*(?:ng\/ml|ng\/mL)?/i,
    sourceSection: "Lab results",
    confidenceScore: 0.85,
  },
  {
    signalKey: "ferritin",
    displayLabel: "Ferritin",
    unit: "ng/mL",
    pattern: /ferritin[:\s]+([0-9]+(?:\.[0-9]+)?)\s*(?:ng\/ml|ng\/mL)?/i,
    sourceSection: "Lab results",
    confidenceScore: 0.85,
  },
  {
    signalKey: "hemoglobin",
    displayLabel: "Hemoglobin",
    unit: "g/dL",
    pattern: /hemoglobin[:\s]+([0-9]+(?:\.[0-9]+)?)\s*(?:g\/dl|g\/dL)?/i,
    sourceSection: "Lab results",
    confidenceScore: 0.85,
  },
  {
    signalKey: "fasting_glucose",
    displayLabel: "Fasting glucose",
    unit: "mg/dL",
    pattern: /(?:fasting\s*)?glucose[:\s]+([0-9]+(?:\.[0-9]+)?)\s*(?:mg\/dl|mg\/dL)?/i,
    sourceSection: "Lab results",
    confidenceScore: 0.8,
  },
  {
    signalKey: "total_cholesterol",
    displayLabel: "Total cholesterol",
    unit: "mg/dL",
    pattern: /(?:total\s*)?cholesterol[:\s]+([0-9]+(?:\.[0-9]+)?)\s*(?:mg\/dl|mg\/dL)?/i,
    sourceSection: "Lab results",
    confidenceScore: 0.8,
  },
  {
    signalKey: "resting_heart_rate",
    displayLabel: "Resting heart rate",
    unit: "bpm",
    pattern: /(?:resting\s*)?(?:heart\s*rate|pulse)[:\s]+([0-9]+(?:\.[0-9]+)?)\s*(?:bpm)?/i,
    sourceSection: "Vitals",
    confidenceScore: 0.75,
  },
  {
    signalKey: "energy_level",
    displayLabel: "Energy level",
    unit: "score",
    pattern: /energy(?:\s*level)?[:\s]+([0-9]+(?:\.[0-9]+)?)\s*(?:\/\s*10)?/i,
    sourceSection: "Self-reported",
    confidenceScore: 0.65,
  },
];

const REFERENCE_RANGE_PATTERN =
  /(?:reference|ref(?:erence)?\s*range)[:\s]+([0-9]+(?:\.[0-9]+)?\s*(?:-|to)\s*[0-9]+(?:\.[0-9]+)?[^,\n]{0,40})/i;

const OBSERVED_DATE_PATTERN =
  /(?:collected|observed|reported|date)[:\s]+([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4})/i;

function parseObservedDate(value: string): string | null {
  const trimmed = value.trim();

  if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(trimmed)) {
    return trimmed;
  }

  const slashMatch = /^([0-9]{1,2})\/([0-9]{1,2})\/([0-9]{2,4})$/.exec(trimmed);

  if (!slashMatch) {
    return null;
  }

  const month = slashMatch[1]!.padStart(2, "0");
  const day = slashMatch[2]!.padStart(2, "0");
  const yearRaw = slashMatch[3]!;
  const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;

  return `${year}-${month}-${day}`;
}

export interface DocumentSignalExtractor {
  extract(plainText: string): ExtractedDocumentSignalDraft[];
}

export class DevLabSignalExtractor implements DocumentSignalExtractor {
  extract(plainText: string): ExtractedDocumentSignalDraft[] {
    const normalized = plainText.replace(/\r\n/g, "\n");
    const observedAtMatch = OBSERVED_DATE_PATTERN.exec(normalized);
    const observedAt = observedAtMatch ? parseObservedDate(observedAtMatch[1]!) : null;
    const referenceRangeMatch = REFERENCE_RANGE_PATTERN.exec(normalized);
    const referenceRangeText = referenceRangeMatch?.[1]?.trim() ?? null;

    const drafts: ExtractedDocumentSignalDraft[] = [];
    const seenKeys = new Set<DocumentSignalKey>();

    for (const pattern of SIGNAL_PATTERNS) {
      const match = pattern.pattern.exec(normalized);

      if (!match || seenKeys.has(pattern.signalKey)) {
        continue;
      }

      seenKeys.add(pattern.signalKey);
      drafts.push({
        signalKey: pattern.signalKey,
        displayLabel: pattern.displayLabel,
        valueText: match[1]!,
        unit: pattern.unit,
        referenceRangeText,
        observedAt,
        sourceSection: pattern.sourceSection,
        confidenceScore: pattern.confidenceScore,
      });
    }

    const { valid, errors } = validateExtractedDocumentSignalDrafts(drafts);

    if (errors.length > 0) {
      throw new Error("Extracted signal payload failed validation.");
    }

    return valid;
  }
}

export function buildIgnoredContentExplanation(signalCount: number): string | null {
  if (signalCount > 0) {
    return null;
  }

  return (
    "No allowlisted wellness-relevant lab fields were detected. " +
    "Raw document text is not stored in extracted signals and is excluded from coaching context."
  );
}
