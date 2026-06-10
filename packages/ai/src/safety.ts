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

/**
 * Russian-language unsafe medical patterns for coach reply validation.
 *
 * Calibration:
 * - These mirror the English patterns' altitude: they block *prescriptive* medical
 *   language (diagnosis, prescribing a drug, dosing instructions) — not general
 *   wellness discussion.
 * - Input is lowercased before matching, so no `i` flag is needed.
 * - The `u` flag is used on all patterns for correct Cyrillic matching.
 * - Word-boundary lookarounds ((?<![а-яё]) / (?![а-яё])) prevent matching
 *   substrings inside longer words.
 *
 * NOT blocked (must not false-positive):
 *   "план тренировок — лучшая терапия" (metaphorical wellness use of терапия)
 *   "лечение травмы растяжкой" (general physical rehab phrasing)
 *   "принимайте участие в марафоне" (unrelated принимайте)
 *   "дозировка белка после тренировки" (protein dosing — nutrition, not pharmaceutical)
 *   "не диагноз" (explicit disclaimer — negation lookbehind prevents false-positive)
 *   "назначаю вам встречу в зале" (coaching scheduling — назначаю without pharmaceutical co-occurrence)
 *
 * Blocked (positive examples):
 *   "поставлю вам диагноз: ожирение" → matches диагноз(тиру*)
 *   "назначаю вам препарат" → matches назначаю + pharmaceutical word within 60 chars
 *   "назначаю вам метформин 500 мг" → matches назначаю + (медикамент|лекарств|таблетк|антибиотик|дозу|препарат) proximity
 *   "рецепт на антибиотики" → matches рецепт на антибиотики
 *   "принимайте по 2 таблетки в день" → matches принимайте по … таблетк
 *   "курс лечения заболевания" → matches лечени.*заболеван
 *   "дозировка препарата" → matches дозировка препарата
 */
const UNSAFE_MEDICAL_PATTERNS_RU: RegExp[] = [
  // диагноз / диагностирую / диагностировать (prescriptive diagnosis)
  // Negative lookbehind for "не " prevents false-positive on disclaimers like "не диагноз".
  /(?<!не )(?<![а-яё])диагноз(?![а-яё])/u,
  /(?<![а-яё])диагностиру/u,
  // назначаю + pharmaceutical co-occurrence within 60 chars (I prescribe [drug]).
  // Requires a pharmaceutical noun in proximity to avoid false-positives on
  // coaching scheduling language like "назначаю вам встречу в зале".
  // Blocked: "назначаю вам препарат", "назначаю метформин 500 мг", "назначаю дозу антибиотиков".
  // Allowed: "назначаю вам встречу", "назначаю тренировку на понедельник".
  /(?<![а-яё])назначаю.{0,60}(препарат|лекарств|таблетк|антибиотик|дозу|медикамент)/u,
  // рецепт на + pharmaceutical word (prescription for a drug; excludes culinary recipes)
  /рецепт на (антибиотики|препарат|лекарств|медикамент|таблетки|капсулы|мазь|инъекции)/u,
  // принимайте по … таблетк (dosing instruction pattern)
  /принимайте по .{0,40}таблетк/u,
  // дозировка препарата / дозировка лекарства (pharmaceutical dosing)
  /дозировк[аеи] (препарата|лекарства|медикамента)/u,
  // лечение … заболевания / лечу … заболевание (treatment of disease — requires заболеван* co-present)
  /лечени[еяем].{0,40}заболеван/u,
  /лечу.{0,40}заболеван/u,
  // психотерапия / психотерапевт (mirrors English psychotherapy/psychotherapist)
  /(?<![а-яё])психотерапи/u,
  /(?<![а-яё])психотерапевт(?![а-яё])/u,
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
  if (UNSAFE_MEDICAL_PATTERNS.some((pattern) => pattern.test(text))) {
    return true;
  }

  // Check Russian patterns on the lowercased text so callers need not pre-normalize.
  const lower = text.toLowerCase();
  return UNSAFE_MEDICAL_PATTERNS_RU.some((pattern) => pattern.test(lower));
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
