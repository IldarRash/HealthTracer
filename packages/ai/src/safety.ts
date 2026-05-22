import type { RawAiProposal } from "@health/types";

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
];

export function containsUnsafeMedicalLanguage(text: string): boolean {
  return UNSAFE_MEDICAL_PATTERNS.some((pattern) => pattern.test(text));
}

function collectProposalText(proposal: RawAiProposal): string[] {
  return [
    proposal.title,
    proposal.reason,
    JSON.stringify(proposal.proposedChanges),
  ];
}

export function validateProposalSafety(proposal: RawAiProposal): string[] {
  const errors: string[] = [];

  for (const text of collectProposalText(proposal)) {
    if (containsUnsafeMedicalLanguage(text)) {
      errors.push(
        "Proposal contains wording that may imply diagnosis or treatment guidance.",
      );
      break;
    }
  }

  return errors;
}

export function validateReplySafety(reply: string): string[] {
  if (containsUnsafeMedicalLanguage(reply)) {
    return [
      "Reply contains wording that may imply diagnosis or treatment guidance.",
    ];
  }

  return [];
}
