// ---------------------------------------------------------------------------
// Wellness-insight language safety guard.
//
// Relocated from document-signals.ts when the documents module was deleted
// (biomarkers slice S5). Used by the proposal validation layer to reject
// evidence labels with medical wording, and by web UI wording guards.
// ---------------------------------------------------------------------------

const WELLNESS_INSIGHT_UNSAFE_PATTERNS = [
  /\bdiagnos(e|is|ed|ing)\b/i,
  /\bprescri(be|ption|bed|bing)\b/i,
  /\btreat(ment|ing|ed)\b/i,
  /\bmedication\b/i,
  /\bdosage\b/i,
  /\bdose\b/i,
  /\bclinical(?:ly)?\b/i,
  /\bpatholog(y|ical)\b/i,
  /\bdisorder\b/i,
  /\bcure\b/i,
  /\babnormal\b/i,
  /\bdeficient\b/i,
  /\bnormal range\b/i,
];

// Russian counterparts of the patterns above, at the same (strict) altitude:
// evidence labels are short generated strings, so standalone medical stems are
// blocked outright — unlike coach-reply safety, no proximity calibration is
// needed here. Kept local on purpose: importing the RU list from @health/ai
// would create a packages dependency cycle (ai depends on types).
// `(?<![а-яё])` / `(?![а-яё])` are the Cyrillic word-boundary guards (`\b` is
// ASCII-only); the `u` flag makes `i` case-fold Cyrillic correctly.
const WELLNESS_INSIGHT_UNSAFE_PATTERNS_RU = [
  // диагноз / диагнозы / диагностика / диагностировать
  /(?<![а-яё])диагноз/iu,
  /(?<![а-яё])диагности/iu,
  // лечение / лечения / лечить / лечу (treatment)
  /(?<![а-яё])лечени/iu,
  /(?<![а-яё])лечить(?![а-яё])/iu,
  /(?<![а-яё])лечу(?![а-яё])/iu,
  // назначаю / назначать / назначено / назначение (prescribing)
  /(?<![а-яё])назнач(?:а|ен)/iu,
  // рецепт / рецепта (prescription)
  /(?<![а-яё])рецепт/iu,
  // дозировка / доза / дозу / дозы / дозе / дозой (dosing)
  /(?<![а-яё])дозировк/iu,
  /(?<![а-яё])доз(?:а|у|ы|е|ой)(?![а-яё])/iu,
  // медикамент / препарат (medication)
  /(?<![а-яё])медикамент/iu,
  /(?<![а-яё])препарат/iu,
  // психотерапия / психотерапевт
  /(?<![а-яё])психотерап/iu,
  // отклонение / отклонения (abnormality framing)
  /(?<![а-яё])отклонени/iu,
];

export function containsUnsafeWellnessInsightLanguage(text: string): boolean {
  return (
    WELLNESS_INSIGHT_UNSAFE_PATTERNS.some((pattern) => pattern.test(text)) ||
    WELLNESS_INSIGHT_UNSAFE_PATTERNS_RU.some((pattern) => pattern.test(text))
  );
}
