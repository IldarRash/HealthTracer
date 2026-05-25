export interface ProposalSafetyInput {
  readonly intent: string;
  readonly targetDomain: string;
  readonly title: string;
  readonly reason: string;
  readonly proposedChanges: unknown;
}

const UNSAFE_MEDICAL_PATTERNS = [
  /\bdiagnos(e|is|ed|ing)\b/i,
  /\bprescri(be|ption|bed|bing)\b/i,
  /\btreat(ment|ing|ed)?\b/i,
  /\bmedication\b/i,
  /\bcure\b/i,
  /\bclinical(?:ly)?\b/i,
  /\bpatholog(y|ical)\b/i,
  /\bdisorder\b/i,
  /\bsymptom\b/i,
  /\bmedical advice\b/i,
  /\btherap(?:y|ist|ies|eutic)\b/i,
  /\bpsychotherap(?:y|ist)\b/i,
  /\bmental illness\b/i,
  /\bcbt\b/i,
  /\bdbt\b/i,
];

const UNSAFE_LANGUAGE_ERROR =
  "Reply contains wording that may imply diagnosis, treatment, or therapy guidance.";

const DOCUMENT_TYPE_PHRASES = [
  "lab report",
  "clinical note",
  "provider note",
  "imaging report",
  "medication list",
  "med list",
  "discharge summary",
  "health document",
];

const UNSAFE_DOCUMENT_SUMMARY_PATTERNS = [
  /\bdiagnos(e|is|ed|ing)\b/i,
  /\bprescri(be|ption|bed|bing)\b/i,
  /\btreat(ment|ing|ed)\b/i,
  /\bmedication dosing\b/i,
  /\bmedical advice\b/i,
  /\bpatholog(y|ical)\b/i,
  /\bcure\b/i,
  /\bemergency\b/i,
  /\bdosage\b/i,
  /\bdose\b/i,
  /\bsymptom\b/i,
  /\bdisorder\b/i,
];

export function containsUnsafeMedicalLanguage(text: string): boolean {
  return UNSAFE_MEDICAL_PATTERNS.some((pattern) => pattern.test(text));
}

function stripDocumentTypePhrases(text: string): string {
  let normalized = text;

  for (const phrase of DOCUMENT_TYPE_PHRASES) {
    normalized = normalized.replace(
      new RegExp(`\\b${phrase.replace(/\s+/g, "\\s+")}\\b`, "gi"),
      "",
    );
  }

  return normalized;
}

export function containsUnsafeDocumentSummaryLanguage(text: string): boolean {
  const normalized = stripDocumentTypePhrases(text);
  return UNSAFE_DOCUMENT_SUMMARY_PATTERNS.some((pattern) => pattern.test(normalized));
}

function collectProposalText(proposal: ProposalSafetyInput): string[] {
  return [
    proposal.title,
    proposal.reason,
    JSON.stringify(proposal.proposedChanges),
  ];
}

export function validateProposalSafety(proposal: ProposalSafetyInput): string[] {
  const errors: string[] = [];

  for (const text of collectProposalText(proposal)) {
    if (containsUnsafeMedicalLanguage(text)) {
      errors.push(
        "Proposal contains wording that may imply diagnosis, treatment, or therapy guidance.",
      );
      break;
    }
  }

  return errors;
}

export function validateReplySafety(reply: string): string[] {
  if (containsUnsafeMedicalLanguage(reply)) {
    return [UNSAFE_LANGUAGE_ERROR];
  }

  return [];
}
