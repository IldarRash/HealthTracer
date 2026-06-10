import { z } from "zod";
import { isoDateSchema, isoDateTimeSchema } from "./dates.js";
import { shiftIsoDate } from "./habits.js";

export const wellbeingScoreSchema = z.number().int().min(1).max(5);

export type WellbeingScore = z.infer<typeof wellbeingScoreSchema>;

export const wellbeingCheckInSourceSchema = z.enum(["user_entry"]);

export type WellbeingCheckInSource = z.infer<typeof wellbeingCheckInSourceSchema>;

export const wellbeingTagSchema = z.string().min(1).max(40);

export const wellbeingCrisisFlagReasonSchema = z.enum(["lowest_mood", "keyword_match"]);

export type WellbeingCrisisFlagReason = z.infer<typeof wellbeingCrisisFlagReasonSchema>;

export const wellbeingTrendDirectionSchema = z.enum(["up", "down", "stable", "unknown"]);

export type WellbeingTrendDirection = z.infer<typeof wellbeingTrendDirectionSchema>;

export const wellbeingDataSufficiencySchema = z.enum([
  "sufficient",
  "partial",
  "insufficient",
]);

export type WellbeingDataSufficiency = z.infer<typeof wellbeingDataSufficiencySchema>;

export const upsertWellbeingCheckInSchema = z
  .object({
    moodScore: wellbeingScoreSchema,
    stressScore: wellbeingScoreSchema,
    tags: z.array(wellbeingTagSchema).max(8).optional(),
    note: z.string().min(1).max(280).nullable().optional(),
    source: wellbeingCheckInSourceSchema.optional(),
  })
  .strict();

export type UpsertWellbeingCheckInInput = z.infer<typeof upsertWellbeingCheckInSchema>;

export const wellbeingCheckInRecordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  date: isoDateSchema,
  moodScore: wellbeingScoreSchema,
  stressScore: wellbeingScoreSchema,
  tags: z.array(wellbeingTagSchema).max(8),
  note: z.string().min(1).max(280).nullable(),
  source: wellbeingCheckInSourceSchema,
  crisisFlagReasons: z.array(wellbeingCrisisFlagReasonSchema),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type WellbeingCheckInRecord = z.infer<typeof wellbeingCheckInRecordSchema>;

export const wellbeingCheckInResponseSchema = z.object({
  checkIn: wellbeingCheckInRecordSchema.nullable(),
});

export type WellbeingCheckInResponse = z.infer<typeof wellbeingCheckInResponseSchema>;

export const wellbeingCheckInHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(30).default(14),
});

export type WellbeingCheckInHistoryQuery = z.infer<typeof wellbeingCheckInHistoryQuerySchema>;

export const wellbeingCheckInHistoryEntrySchema = wellbeingCheckInRecordSchema.pick({
  date: true,
  moodScore: true,
  stressScore: true,
  tags: true,
  crisisFlagReasons: true,
  updatedAt: true,
});

export type WellbeingCheckInHistoryEntry = z.infer<typeof wellbeingCheckInHistoryEntrySchema>;

export const wellbeingCheckInHistoryResponseSchema = z.object({
  entries: z.array(wellbeingCheckInHistoryEntrySchema),
});

export type WellbeingCheckInHistoryResponse = z.infer<
  typeof wellbeingCheckInHistoryResponseSchema
>;

export const wellbeingCheckInAggregatePeriodTypeSchema = z.enum(["daily"]);

export type WellbeingCheckInAggregatePeriodType = z.infer<
  typeof wellbeingCheckInAggregatePeriodTypeSchema
>;

export const wellbeingCheckInAggregatesQuerySchema = z.object({
  periodType: wellbeingCheckInAggregatePeriodTypeSchema.default("daily"),
  limit: z.coerce.number().int().min(1).max(90).default(30),
});

export type WellbeingCheckInAggregatesQuery = z.infer<
  typeof wellbeingCheckInAggregatesQuerySchema
>;

export const wellbeingCheckInDailyAggregateSchema = z.object({
  date: isoDateSchema,
  moodScore: wellbeingScoreSchema,
  stressScore: wellbeingScoreSchema,
});

export type WellbeingCheckInDailyAggregate = z.infer<
  typeof wellbeingCheckInDailyAggregateSchema
>;

export const wellbeingCheckInAggregatesSummarySchema = z.object({
  windowDays: z.number().int().positive(),
  checkInCount: z.number().int().nonnegative(),
  moodAverage: z.number().nullable(),
  stressAverage: z.number().nullable(),
  moodTrendDirection: wellbeingTrendDirectionSchema,
  stressTrendDirection: wellbeingTrendDirectionSchema,
  currentStreak: z.number().int().nonnegative(),
  dataSufficiency: wellbeingDataSufficiencySchema,
});

export type WellbeingCheckInAggregatesSummary = z.infer<
  typeof wellbeingCheckInAggregatesSummarySchema
>;

export const wellbeingCheckInAggregatesResponseSchema = z.object({
  periodType: wellbeingCheckInAggregatePeriodTypeSchema,
  aggregates: z.array(wellbeingCheckInDailyAggregateSchema),
  summary: wellbeingCheckInAggregatesSummarySchema,
});

export type WellbeingCheckInAggregatesResponse = z.infer<
  typeof wellbeingCheckInAggregatesResponseSchema
>;

export const wellbeingCrisisSupportResourceSchema = z.object({
  label: z.string().min(1).max(160),
  url: z.string().min(1).max(500),
});

export const wellbeingCrisisSupportCopySchema = z.object({
  title: z.string().min(1).max(160),
  message: z.string().min(1).max(1000),
  resources: z.array(wellbeingCrisisSupportResourceSchema).min(1).max(5),
});

export type WellbeingCrisisSupportCopy = z.infer<typeof wellbeingCrisisSupportCopySchema>;

export const WELLBEING_CRISIS_SUPPORT_COPY: WellbeingCrisisSupportCopy = {
  title: "Support is available",
  message:
    "This app supports everyday wellness coaching and is not a crisis service. If you are in distress or need immediate help, please reach out to someone you trust or contact local emergency resources.",
  resources: [
    {
      label: "988 Suicide & Crisis Lifeline (US)",
      url: "tel:988",
    },
    {
      label: "Crisis Text Line (US)",
      url: "https://www.crisistextline.org/",
    },
  ],
};

export const WELLBEING_CRISIS_KEYWORDS = [
  "suicide",
  "kill myself",
  "want to die",
  "end my life",
  "self harm",
  "self-harm",
  "hurt myself",
] as const;

/**
 * Russian-language crisis keywords matched after lowercasing the input text.
 *
 * Calibration notes:
 * - Each pattern targets a prescriptive, high-specificity phrase indicating
 *   suicidal ideation or self-harm intent — not general sadness/distress.
 * - The `u` flag is required for \b behaviour with Cyrillic; we use it on all
 *   patterns in this array for consistency.
 * - Lookarounds (?<![а-яё]) / (?![а-яё]) simulate word boundaries for Cyrillic
 *   since \b does not work correctly with Unicode letter-class boundaries.
 * - Input is .toLowerCase() before matching so case-insensitivity is handled
 *   uniformly without the `i` flag (which would interact with `u` differently
 *   across JS engines on Windows).
 *
 * MUST NOT false-positive on typical fitness/wellness phrases such as:
 *   "убиться на тренировке" (colloquial "train hard"), "хочу умереть от жары",
 *   "устал до смерти" (idiomatic), "причинить вред здоровью" (general health risk).
 * Those edge cases are tested explicitly in the spec.
 */
export const WELLBEING_CRISIS_KEYWORDS_RU: ReadonlyArray<RegExp> = [
  // суицид, суицидальный, суицидные мысли, etc. — match the stem (no word-end guard needed)
  /(?<![а-яё])суицид/u,
  // самоубийство, самоубийств*
  /(?<![а-яё])самоубийств/u,
  // убить себя / убить себе
  /убить себ[яе]/u,
  // покончить с собой / с жизнью
  /покончить с (собой|жизнью)/u,
  // не хочу … жить — covers direct forms and forms with up to 2 inserted words, e.g.:
  //   "не хочу жить", "не хочу больше жить", "не хочу уже жить",
  //   "не хочу так жить", "я не хочу так жить", "не хочу уже так жить".
  // (\S+\s+){0,2} allows 0–2 non-space word tokens between хочу and жить.
  // Bounded repetition prevents catastrophic backtracking.
  // Note: this will also match phrases like "не хочу жить в этом районе" — this is
  // intentional safe-side over-triggering for a crisis safety gate (better a false
  // positive than a missed genuine crisis signal).
  /не хочу (\S+\s+){0,2}жить/u,
  // свести счёты с жизнью
  /свести счёт[ыа] с жизнью/u,
  // порезать себя
  /порезать себ[яе]/u,
  // причинить себе вред (high-specificity — self-harm intent phrasing)
  /причинить себе вред/u,
  // навредить себе
  /навредить себ[еёи]/u,
];

export const wellbeingCrisisEvaluationSchema = z.object({
  shouldShowCrisisSupport: z.boolean(),
  reasons: z.array(wellbeingCrisisFlagReasonSchema),
  copy: wellbeingCrisisSupportCopySchema.nullable(),
});

export type WellbeingCrisisEvaluation = z.infer<typeof wellbeingCrisisEvaluationSchema>;

export const wellbeingCheckInUpsertResponseSchema = z.object({
  checkIn: wellbeingCheckInRecordSchema,
  crisisSupport: wellbeingCrisisEvaluationSchema,
});

export type WellbeingCheckInUpsertResponse = z.infer<
  typeof wellbeingCheckInUpsertResponseSchema
>;

export const aiWellbeingContextSummarySchema = z.object({
  latestDate: isoDateSchema.nullable(),
  latestMoodScore: wellbeingScoreSchema.nullable(),
  latestStressScore: wellbeingScoreSchema.nullable(),
  windowDays: z.literal(7),
  windowStart: isoDateSchema.nullable(),
  windowEnd: isoDateSchema.nullable(),
  checkInCount: z.number().int().nonnegative(),
  moodAverage: z.number().nullable(),
  stressAverage: z.number().nullable(),
  moodTrendDirection: wellbeingTrendDirectionSchema,
  stressTrendDirection: wellbeingTrendDirectionSchema,
  currentStreak: z.number().int().nonnegative(),
  dataSufficiency: wellbeingDataSufficiencySchema,
  generatedAt: isoDateTimeSchema,
});

export type AiWellbeingContextSummary = z.infer<typeof aiWellbeingContextSummarySchema>;

function normalizeNote(note: string | null | undefined): string | null {
  if (note == null) {
    return null;
  }

  const trimmed = note.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function containsWellbeingCrisisKeyword(note: string): boolean {
  const normalized = note.trim().toLowerCase();

  if (WELLBEING_CRISIS_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return true;
  }

  return WELLBEING_CRISIS_KEYWORDS_RU.some((pattern) => pattern.test(normalized));
}

export function evaluateWellbeingCrisisFromText(text: string): WellbeingCrisisEvaluation {
  if (containsWellbeingCrisisKeyword(text)) {
    return {
      shouldShowCrisisSupport: true,
      reasons: ["keyword_match"],
      copy: WELLBEING_CRISIS_SUPPORT_COPY,
    };
  }

  return {
    shouldShowCrisisSupport: false,
    reasons: [],
    copy: null,
  };
}

export function formatWellbeingCrisisSupportReply(copy: WellbeingCrisisSupportCopy): string {
  const resourceLines = copy.resources
    .map((resource) => `${resource.label}: ${resource.url}`)
    .join("\n");

  return `${copy.title}\n\n${copy.message}\n\n${resourceLines}`;
}

export function evaluateWellbeingCrisisFlags(input: {
  moodScore: number;
  note?: string | null;
}): WellbeingCrisisEvaluation {
  const reasons: WellbeingCrisisFlagReason[] = [];

  if (input.moodScore === 1) {
    reasons.push("lowest_mood");
  }

  const note = normalizeNote(input.note);

  if (note && containsWellbeingCrisisKeyword(note)) {
    reasons.push("keyword_match");
  }

  const shouldShowCrisisSupport = reasons.length > 0;

  return {
    shouldShowCrisisSupport,
    reasons,
    copy: shouldShowCrisisSupport ? WELLBEING_CRISIS_SUPPORT_COPY : null,
  };
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round((total / values.length) * 100) / 100;
}

function resolveTrendDirection(values: number[]): WellbeingTrendDirection {
  if (values.length < 2) {
    return "unknown";
  }

  const midpoint = Math.floor(values.length / 2);
  const earlier = values.slice(0, midpoint);
  const later = values.slice(midpoint);

  const earlierAverage = average(earlier);
  const laterAverage = average(later);

  if (earlierAverage == null || laterAverage == null) {
    return "unknown";
  }

  const delta = laterAverage - earlierAverage;

  if (Math.abs(delta) < 0.25) {
    return "stable";
  }

  return delta > 0 ? "up" : "down";
}

function resolveDataSufficiency(checkInCount: number): WellbeingDataSufficiency {
  if (checkInCount >= 4) {
    return "sufficient";
  }

  if (checkInCount >= 1) {
    return "partial";
  }

  return "insufficient";
}

function resolveCurrentStreak(
  checkIns: Array<{ date: string }>,
  anchorDate: string,
): number {
  const dates = new Set(checkIns.map((checkIn) => checkIn.date));
  let streak = 0;
  let cursor = anchorDate;

  while (dates.has(cursor)) {
    streak += 1;
    cursor = shiftIsoDate(cursor, -1);
  }

  return streak;
}

export function buildWellbeingCoachingSummary(input: {
  checkIns: Array<{ date: string; moodScore: number; stressScore: number }>;
  anchorDate: string;
  generatedAt?: string;
}): AiWellbeingContextSummary {
  const sorted = [...input.checkIns].sort((left, right) => right.date.localeCompare(left.date));
  const windowStart = shiftIsoDate(input.anchorDate, -6);
  const windowCheckIns = sorted
    .filter((checkIn) => checkIn.date >= windowStart && checkIn.date <= input.anchorDate)
    .sort((left, right) => left.date.localeCompare(right.date));
  const latest = sorted.find((checkIn) => checkIn.date <= input.anchorDate) ?? null;

  const moodValues = windowCheckIns.map((checkIn) => checkIn.moodScore);
  const stressValues = windowCheckIns.map((checkIn) => checkIn.stressScore);

  return {
    latestDate: latest?.date ?? null,
    latestMoodScore: latest?.moodScore ?? null,
    latestStressScore: latest?.stressScore ?? null,
    windowDays: 7,
    windowStart: windowCheckIns.length > 0 ? windowStart : null,
    windowEnd: windowCheckIns.length > 0 ? input.anchorDate : null,
    checkInCount: windowCheckIns.length,
    moodAverage: average(moodValues),
    stressAverage: average(stressValues),
    moodTrendDirection: resolveTrendDirection(moodValues),
    stressTrendDirection: resolveTrendDirection(stressValues),
    currentStreak: resolveCurrentStreak(sorted, input.anchorDate),
    dataSufficiency: resolveDataSufficiency(windowCheckIns.length),
    generatedAt: input.generatedAt ?? new Date().toISOString(),
  };
}
