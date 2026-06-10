import { z } from "zod";
import { isCalendarValidIsoDate } from "./dates.js";
import { directChatPathCandidateSchema } from "./direct-chat-path.js";
import { detectDirectChatPathCandidate } from "./direct-chat-path-matcher.js";

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
];

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
  });
}
