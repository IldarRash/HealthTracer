import { z } from "zod";
import { isCalendarValidIsoDate } from "./dates.js";
import { directChatPathCandidateSchema } from "./direct-chat-path.js";
import { detectDirectChatPathCandidate } from "./direct-chat-path-matcher.js";
import { PROGRESS_HISTORY_MONTHLY_MAX_GRANTED_DAYS } from "./progress-history.js";

/**
 * Sentinel for "за всё время / all time / entire history" lookback requests.
 * Aligned with the Phase 1 monthly-granularity clamp (24 calendar months,
 * PROGRESS_HISTORY_MONTHLY_MAX_GRANTED_DAYS) so a full-history ask lands
 * exactly on what the granularity ladder can grant.
 */
export const PROGRESS_HISTORY_FULL_LOOKBACK_DAYS: number =
  PROGRESS_HISTORY_MONTHLY_MAX_GRANTED_DAYS;

/** Upper bound for detected lookback requests (~100 years; matches requestedPeriodDays max). */
export const MAX_REQUESTED_LOOKBACK_DAYS = 36500 as const;

export const messagePreprocessorMentionedDateTokenSchema = z.enum([
  "today",
  "tomorrow",
  "yesterday",
]);

export type MessagePreprocessorMentionedDateToken = z.infer<
  typeof messagePreprocessorMentionedDateTokenSchema
>;

export const messagePreprocessorMentionedDateSchema = z.union([
  messagePreprocessorMentionedDateTokenSchema,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(isCalendarValidIsoDate, {
      message: "Expected a valid calendar date in YYYY-MM-DD format",
    }),
]);

export type MessagePreprocessorMentionedDate = z.infer<
  typeof messagePreprocessorMentionedDateSchema
>;

export const messagePreprocessorSimpleSignalsSchema = z.object({
  workout: z.boolean(),
  nutrition: z.boolean(),
  today: z.boolean(),
  sleep: z.boolean(),
  fatigue: z.boolean(),
  pain: z.boolean(),
  document: z.boolean(),
  attachment: z.boolean(),
  /**
   * True when the user explicitly requests creation or modification of a workout
   * or nutrition plan (EN + RU). Used by ActionResolver to guard against the
   * decision-maker returning plain_reply when a valid proposal candidate exists.
   */
  plan_request: z.boolean(),
  /**
   * True when the user asks for a retrospective review/analysis of their data
   * (EN + RU). Combined with requestedLookbackDays by the deterministic
   * ContextBudgetPolicyService to select the deep_review/deep_history budget
   * profiles — the LLM never decides the budget tier.
   */
  review_request: z.boolean(),
});

export type MessagePreprocessorSimpleSignals = z.infer<
  typeof messagePreprocessorSimpleSignalsSchema
>;

export const EMPTY_MESSAGE_PREPROCESSOR_SIMPLE_SIGNALS: MessagePreprocessorSimpleSignals = {
  workout: false,
  nutrition: false,
  today: false,
  sleep: false,
  fatigue: false,
  pain: false,
  document: false,
  attachment: false,
  plan_request: false,
  review_request: false,
};

export const messagePreprocessorLanguageCodeSchema = z
  .string()
  .min(2)
  .max(5)
  .regex(/^[a-z]{2}(-[a-z]{2})?$/);

export type MessagePreprocessorLanguageCode = z.infer<
  typeof messagePreprocessorLanguageCodeSchema
>;

export const messagePreprocessorInputSchema = z.object({
  userMessage: z.string(),
  hasAttachments: z.boolean().optional().default(false),
  responseLanguageHint: messagePreprocessorLanguageCodeSchema.nullable().optional(),
});

export type MessagePreprocessorInput = z.infer<typeof messagePreprocessorInputSchema>;

export const messagePreprocessorResultSchema = z.object({
  originalText: z.string(),
  normalizedText: z.string(),
  detectedLanguage: messagePreprocessorLanguageCodeSchema.nullable(),
  responseLanguage: messagePreprocessorLanguageCodeSchema.nullable(),
  hasAttachments: z.boolean(),
  mentionedDates: z.array(messagePreprocessorMentionedDateSchema),
  simpleSignals: messagePreprocessorSimpleSignalsSchema,
  directPathCandidate: directChatPathCandidateSchema.nullable(),
  /**
   * Deterministically detected lookback period (days) the user asked about,
   * or null when no period phrase was found. The LONGEST mentioned period wins.
   * Full-history asks resolve to PROGRESS_HISTORY_FULL_LOOKBACK_DAYS.
   */
  requestedLookbackDays: z
    .number()
    .int()
    .min(1)
    .max(MAX_REQUESTED_LOOKBACK_DAYS)
    .nullable(),
});

export type MessagePreprocessorResult = z.infer<typeof messagePreprocessorResultSchema>;

const RELATIVE_DATE_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  token: MessagePreprocessorMentionedDateToken;
}> = [
  { pattern: /\btoday\b/i, token: "today" },
  { pattern: /сегодня/i, token: "today" },
  { pattern: /\btomorrow\b/i, token: "tomorrow" },
  { pattern: /завтра/i, token: "tomorrow" },
  { pattern: /\byesterday\b/i, token: "yesterday" },
  { pattern: /вчера/i, token: "yesterday" },
];

const ISO_DATE_PATTERN = /\b(\d{4}-\d{2}-\d{2})\b/g;

const SIGNAL_PATTERNS: ReadonlyArray<{
  key: keyof MessagePreprocessorSimpleSignals;
  patterns: RegExp[];
}> = [
  {
    key: "workout",
    patterns: [
      /\bwork(?:out|outs|ing)\b/i,
      /\btrain(?:ing)?\b/i,
      /\bexercise\b/i,
      /\btraining\b/i,
      /\bgym\b/i,
      /\brun(?:ning)?\b/i,
      /\blift(?:ing)?\b/i,
      /трениров/i,
      /упражнен/i,
      /\bзал\b/i,
      /\bбег\b/i,
    ],
  },
  {
    key: "nutrition",
    patterns: [
      /\bmeal\b/i,
      /\bfood\b/i,
      /\beat(?:ing)?\b/i,
      /\bnutrition\b/i,
      /\bcalor(?:y|ies)\b/i,
      /\bprotein\b/i,
      /\bdiet\b/i,
      /\blunch\b/i,
      /\bdinner\b/i,
      /\bbreakfast\b/i,
      /питани/i,
      /калори/i,
      /\bбелок\b/i,
      /\bобед\b/i,
      /\bужин\b/i,
      /\bзавтрак\b/i,
      /\bеда\b/i,
    ],
  },
  {
    key: "today",
    patterns: [/\btoday\b/i, /сегодня/i],
  },
  {
    key: "sleep",
    patterns: [
      /\bsleep(?:ing)?\b/i,
      /\bslept\b/i,
      /\binsomnia\b/i,
      /\bсон\b/i,
      /спал/i,
      /не\s+спал/i,
      /плохо\s+спал/i,
    ],
  },
  {
    key: "fatigue",
    patterns: [
      /\btired\b/i,
      /\bfatigue\b/i,
      /\bexhausted\b/i,
      /\bweary\b/i,
      /устал/i,
      /усталост/i,
      /вымотан/i,
      /нет\s+сил/i,
    ],
  },
  {
    key: "pain",
    patterns: [
      /\bpain\b/i,
      /\bhurt(?:ing)?\b/i,
      /\bache\b/i,
      /\bsore\b/i,
      /\bболь\b/i,
      /болит/i,
      /больно/i,
    ],
  },
  {
    key: "document",
    patterns: [
      /\bdocument\b/i,
      /\breport\b/i,
      /\blab\b/i,
      /\bblood\s+test\b/i,
      /\banalys(?:is|es)\b/i,
      /анализ/i,
      /документ/i,
      /справк/i,
      /\bpdf\b/i,
    ],
  },
  {
    key: "attachment",
    patterns: [
      /\battach(?:ed|ment)?\b/i,
      /\bupload(?:ed|ing)?\b/i,
      /\bphoto\b/i,
      /\bimage\b/i,
      /\bfile\b/i,
      /прикреп/i,
      /загруз/i,
      /\bфото\b/i,
      /\bфайл\b/i,
    ],
  },
  {
    // Explicit plan creation or modification request (EN + RU).
    // Used by ActionResolver to guard against plain_reply when a valid proposal
    // candidate exists. Deliberately narrow — only clear create/adapt/modify verbs
    // paired with plan/program/workout/nutrition/training nouns.
    key: "plan_request",
    patterns: [
      // English: create/make/build/generate a plan/program
      /\b(?:create|make|build|generate|write|give me|make me)\s+(?:a\s+|my\s+|me\s+a\s+)?(?:workout|training|nutrition|meal|fitness|diet)\s+plan\b/i,
      /\b(?:create|make|build|generate)\s+(?:a\s+)?(?:workout|training|nutrition|meal|fitness)\s+program\b/i,
      /\b(?:create|make|build|give me)\s+(?:a\s+)?plan\b/i,
      // English: update/change/modify/adjust/adapt existing plan
      /\b(?:update|change|modify|adjust|adapt|revise|redo)\s+(?:my\s+)?(?:workout|training|nutrition|meal|fitness|diet)?\s*plan\b/i,
      /\b(?:update|change|modify|adjust|adapt)\s+(?:my\s+)?(?:workout|training|nutrition)\b/i,
      // Russian: составь/сделай/создай план/программу
      /составь\s+(?:мне\s+)?(?:план|программу|тренировк|питани|рацион)/i,
      /сделай\s+(?:мне\s+)?(?:план|программу|тренировк|питани|рацион)/i,
      /создай\s+(?:мне\s+)?(?:план|программу|тренировк|питани|рацион)/i,
      /напиши\s+(?:мне\s+)?(?:план|программу|тренировк|питани|рацион)/i,
      // Russian: обнови/измени/поменяй/скорректируй план/тренировку/питание
      /обнови\s+(?:мой\s+|мою\s+)?(?:план|программу|тренировк|питани|рацион)/i,
      /измени\s+(?:мой\s+|мою\s+)?(?:план|программу|тренировк|питани|рацион)/i,
      /поменяй\s+(?:мою\s+|мой\s+)?(?:план|программу|тренировк|питани|рацион)/i,
      /скорректируй\s+(?:мою\s+|мой\s+)?(?:план|программу|тренировк|питани|рацион)/i,
      /подправь\s+(?:мой\s+|мою\s+)?(?:план|программу|тренировк|питани|рацион)/i,
    ],
  },
  {
    // Retrospective review / analysis request (EN + RU). Read by the
    // deterministic budget-profile selection (deep_review / deep_history).
    key: "review_request",
    patterns: [
      /анализ/i, // also covers "проанализируй", "анализируй"
      /разбор/i,
      /как\s+повлиял/i,
      /что\s+я\s+делал\s+не\s+так/i,
      /итог/i, // итог, итоги
      /оцени\s+(?:мой|мои|мо[еёю])/i,
      /\breview\b/i,
      /\banaly[sz]/i, // analyze, analysis, analyse
      /\bretrospect/i,
      /\bhow\s+did\b.*\b(?:affect|impact)/i,
      /\bwhat\s+went\s+wrong\b/i,
    ],
  },
];

// ---------------------------------------------------------------------------
// Requested lookback detection (deterministic floor for adaptive reviews)
// ---------------------------------------------------------------------------

/**
 * Fixed RU/EN period phrases → lookback days. Bare numeric forms
 * ("за N месяцев", "last N months", "N weeks") are handled separately by
 * NUMERIC_LOOKBACK_RULES. When several phrases match, the longest period wins.
 */
const LOOKBACK_PHRASE_RULES: ReadonlyArray<{ pattern: RegExp; days: number }> = [
  // today → 1
  { pattern: /сегодня/i, days: 1 },
  { pattern: /\btoday\b/i, days: 1 },
  // (за/последнюю) неделю / last|past week → 7
  // NOTE: \w does not match Cyrillic in JS — use explicit [а-яё] stems.
  { pattern: /(?:за|последн[а-яё]*)\s+недел/i, days: 7 },
  { pattern: /\b(?:last|past)\s+week\b/i, days: 7 },
  // две недели / two weeks → 14 (digit forms covered by numeric rules)
  { pattern: /дв(?:е|ух)\s*недел/i, days: 14 },
  { pattern: /\btwo\s+weeks\b/i, days: 14 },
  // месяц / last|past month → 30
  { pattern: /месяц/i, days: 30 },
  { pattern: /\b(?:last|past|this)\s+month\b/i, days: 30 },
  { pattern: /\bmonth\b/i, days: 30 },
  // квартал / quarter → 90 ("3 months" / "90 days" via numeric rules)
  { pattern: /квартал/i, days: 90 },
  { pattern: /\bquarter\b/i, days: 90 },
  // полгода / шесть месяцев / six months / half a year → 180
  { pattern: /пол\s*года/i, days: 180 },
  { pattern: /шесть\s*месяцев/i, days: 180 },
  { pattern: /\bsix\s+months\b/i, days: 180 },
  { pattern: /\bhalf\s+a?\s*year\b/i, days: 180 },
  // год / year / 12 months → 365
  // Cyrillic has no \b semantics in JS regex — guard with letter lookarounds so
  // "год" does not match inside "полгода"/"погода"/"выгода"; the extra
  // lookbehind keeps the spaced "пол года" (180) from also counting as a year.
  { pattern: /(?<![а-яё])(?<!пол\s)год(?:а|у)?(?![а-яё])/i, days: 365 },
  { pattern: /(?<!half\s)(?<!half\sa\s)\byear\b/i, days: 365 },
  { pattern: /\b12\s*months\b/i, days: 365 },
  { pattern: /12\s*месяцев/i, days: 365 },
  // full history → sentinel (731 = monthly ladder grant)
  { pattern: /за\s+вс[её]\s+время/i, days: PROGRESS_HISTORY_FULL_LOOKBACK_DAYS },
  { pattern: /вс(?:я|ю|ей)\s+истори/i, days: PROGRESS_HISTORY_FULL_LOOKBACK_DAYS },
  { pattern: /\ball[\s-]?time\b/i, days: PROGRESS_HISTORY_FULL_LOOKBACK_DAYS },
  { pattern: /\b(?:entire|whole|full)\s+history\b/i, days: PROGRESS_HISTORY_FULL_LOOKBACK_DAYS },
];

/**
 * Generic numeric forms: "за 3 месяца" / "last 2 months" / "6 weeks" / "за 2 года".
 * Each match contributes unit × N days; the longest mentioned period wins.
 */
const NUMERIC_LOOKBACK_RULES: ReadonlyArray<{ pattern: RegExp; daysPerUnit: number }> = [
  // (?<!\d) guards against matching the tail of a longer number ("2026 год").
  { pattern: /(?<!\d)(\d{1,4})\s*(?:days?|дн(?:ей|я|ь))/gi, daysPerUnit: 1 },
  { pattern: /(?<!\d)(\d{1,3})\s*(?:weeks?|недел\w*)/gi, daysPerUnit: 7 },
  { pattern: /(?<!\d)(\d{1,3})\s*(?:months?|месяц\w*)/gi, daysPerUnit: 30 },
  { pattern: /(?<!\d)(\d{1,2})\s*(?:years?|год(?:а|у|ов)?|лет)/gi, daysPerUnit: 365 },
];

/**
 * Detect the lookback period (days) a message asks about, or null when no
 * RU/EN period phrase matches. Deterministic; the longest period mentioned
 * wins (e.g. "сравни месяц и полгода" → 180, "за 2 года" → 730).
 */
export function detectRequestedLookbackDays(text: string): number | null {
  let longest: number | null = null;

  const consider = (days: number): void => {
    const capped = Math.min(days, MAX_REQUESTED_LOOKBACK_DAYS);

    if (capped >= 1 && (longest === null || capped > longest)) {
      longest = capped;
    }
  };

  for (const { pattern, days } of LOOKBACK_PHRASE_RULES) {
    if (pattern.test(text)) {
      consider(days);
    }
  }

  for (const { pattern, daysPerUnit } of NUMERIC_LOOKBACK_RULES) {
    for (const match of text.matchAll(pattern)) {
      const count = Number.parseInt(match[1] ?? "", 10);

      if (Number.isFinite(count) && count >= 1) {
        consider(count * daysPerUnit);
      }
    }
  }

  return longest;
}

export function normalizePreprocessorText(text: string): string {
  return text.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function detectPreprocessorLanguage(text: string): MessagePreprocessorLanguageCode | null {
  const letters = text.match(/\p{L}/gu) ?? [];

  if (letters.length === 0) {
    return null;
  }

  let cyrillic = 0;
  let latin = 0;

  for (const letter of letters) {
    if (/\p{Script=Cyrillic}/u.test(letter)) {
      cyrillic += 1;
      continue;
    }

    if (/\p{Script=Latin}/u.test(letter)) {
      latin += 1;
    }
  }

  const classified = cyrillic + latin;

  if (classified === 0) {
    return null;
  }

  if (cyrillic / classified >= 0.3) {
    return "ru";
  }

  if (latin / classified >= 0.3) {
    return "en";
  }

  return null;
}

export function extractMentionedPreprocessorDates(text: string): MessagePreprocessorMentionedDate[] {
  const mentioned = new Set<MessagePreprocessorMentionedDate>();

  for (const { pattern, token } of RELATIVE_DATE_PATTERNS) {
    if (pattern.test(text)) {
      mentioned.add(token);
    }
  }

  for (const match of text.matchAll(ISO_DATE_PATTERN)) {
    const isoDate = match[1];

    if (isoDate && isCalendarValidIsoDate(isoDate)) {
      mentioned.add(isoDate);
    }
  }

  return [...mentioned];
}

export function detectPreprocessorSimpleSignals(
  text: string,
  hasAttachments: boolean,
): MessagePreprocessorSimpleSignals {
  const signals: MessagePreprocessorSimpleSignals = {
    ...EMPTY_MESSAGE_PREPROCESSOR_SIMPLE_SIGNALS,
  };

  for (const { key, patterns } of SIGNAL_PATTERNS) {
    signals[key] = patterns.some((pattern) => pattern.test(text));
  }

  if (hasAttachments) {
    signals.attachment = true;
  }

  return signals;
}

export function resolvePreprocessorResponseLanguage(
  detectedLanguage: MessagePreprocessorLanguageCode | null,
  responseLanguageHint?: MessagePreprocessorLanguageCode | null,
): MessagePreprocessorLanguageCode | null {
  return responseLanguageHint ?? detectedLanguage;
}

export function preprocessMessage(input: MessagePreprocessorInput): MessagePreprocessorResult {
  const parsedInput = messagePreprocessorInputSchema.safeParse(input);

  if (!parsedInput.success) {
    return createFallbackPreprocessorResult(input);
  }

  const { userMessage, hasAttachments, responseLanguageHint } = parsedInput.data;
  const originalText = userMessage;
  const normalizedText = normalizePreprocessorText(userMessage);
  const detectedLanguage = detectPreprocessorLanguage(normalizedText);
  const responseLanguage = resolvePreprocessorResponseLanguage(
    detectedLanguage,
    responseLanguageHint,
  );

  const result: MessagePreprocessorResult = {
    originalText,
    normalizedText,
    detectedLanguage,
    responseLanguage,
    hasAttachments,
    mentionedDates: extractMentionedPreprocessorDates(normalizedText),
    simpleSignals: detectPreprocessorSimpleSignals(normalizedText, hasAttachments),
    directPathCandidate: detectDirectChatPathCandidate(normalizedText, { hasAttachments }),
    requestedLookbackDays: detectRequestedLookbackDays(normalizedText),
  };

  return messagePreprocessorResultSchema.parse(result);
}

export function createFallbackPreprocessorResult(
  input: Partial<MessagePreprocessorInput> = {},
): MessagePreprocessorResult {
  const originalText = typeof input.userMessage === "string" ? input.userMessage : "";
  const normalizedText = normalizePreprocessorText(originalText);
  const hasAttachments = input.hasAttachments === true;
  const parsedHint = messagePreprocessorLanguageCodeSchema.safeParse(input.responseLanguageHint);
  const detectedLanguage = detectPreprocessorLanguage(normalizedText);
  const responseLanguage = resolvePreprocessorResponseLanguage(
    detectedLanguage,
    parsedHint.success ? parsedHint.data : null,
  );

  return messagePreprocessorResultSchema.parse({
    originalText,
    normalizedText,
    detectedLanguage,
    responseLanguage,
    hasAttachments,
    mentionedDates: extractMentionedPreprocessorDates(normalizedText),
    simpleSignals: detectPreprocessorSimpleSignals(normalizedText, hasAttachments),
    directPathCandidate: detectDirectChatPathCandidate(normalizedText, { hasAttachments }),
    requestedLookbackDays: detectRequestedLookbackDays(normalizedText),
  });
}
