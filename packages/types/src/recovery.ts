import { z } from "zod";
import { isoDateSchema, isoDateTimeSchema } from "./dates.js";
import { shiftIsoDate } from "./habits.js";

export const recoveryReadinessBandSchema = z.enum([
  "well_supported",
  "moderate_load",
  "prioritize_recovery",
  "insufficient_data",
]);

export type RecoveryReadinessBand = z.infer<typeof recoveryReadinessBandSchema>;

export const recoveryScoreSchema = z.number().int().min(1).max(5);

export type RecoveryScore = z.infer<typeof recoveryScoreSchema>;

export const recoveryCheckInSourceSchema = z.enum(["user_entry"]);

export type RecoveryCheckInSource = z.infer<typeof recoveryCheckInSourceSchema>;

export const recoverySignalSourceSchema = z.enum([
  "manual_check_in",
  "device_sleep",
  "device_recovery_input",
  "workout_fatigue",
  "today_feedback",
]);

export type RecoverySignalSource = z.infer<typeof recoverySignalSourceSchema>;

export const recoveryDataSufficiencySchema = z.enum([
  "sufficient",
  "partial",
  "insufficient",
]);

export type RecoveryDataSufficiency = z.infer<typeof recoveryDataSufficiencySchema>;

export const recoverySignalSchema = z.object({
  source: recoverySignalSourceSchema,
  label: z.string().min(1).max(120),
  detail: z.string().min(1).max(240).optional(),
});

export type RecoverySignal = z.infer<typeof recoverySignalSchema>;

export const recoveryContextPayloadSchema = z.object({
  band: recoveryReadinessBandSchema,
  dataSufficiency: recoveryDataSufficiencySchema,
  signals: z.array(recoverySignalSchema).max(12),
  focusMessage: z.string().min(1).max(500),
});

export type RecoveryContextPayload = z.infer<typeof recoveryContextPayloadSchema>;

export const recoveryCheckInRecordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  date: isoDateSchema,
  soreness: recoveryScoreSchema,
  fatigue: recoveryScoreSchema,
  moodScore: recoveryScoreSchema.nullable(),
  perceivedStress: recoveryScoreSchema.nullable(),
  source: recoveryCheckInSourceSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type RecoveryCheckInRecord = z.infer<typeof recoveryCheckInRecordSchema>;

export const upsertRecoveryCheckInSchema = z
  .object({
    soreness: recoveryScoreSchema,
    fatigue: recoveryScoreSchema,
    moodScore: recoveryScoreSchema.nullable().optional(),
    perceivedStress: recoveryScoreSchema.nullable().optional(),
    date: isoDateSchema.optional(),
    source: recoveryCheckInSourceSchema.optional(),
  })
  .strict();

export type UpsertRecoveryCheckInInput = z.infer<typeof upsertRecoveryCheckInSchema>;

export const recoveryContextSnapshotSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  date: isoDateSchema,
  band: recoveryReadinessBandSchema,
  payload: recoveryContextPayloadSchema,
  calculatedAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type RecoveryContextSnapshot = z.infer<typeof recoveryContextSnapshotSchema>;

export const recoveryContextSourceRefSchema = z.object({
  date: isoDateSchema,
  snapshotId: z.string().uuid().optional(),
});

export type RecoveryContextSourceRef = z.infer<typeof recoveryContextSourceRefSchema>;

export function getRecoveryWorkoutAdaptationVolumeErrors(input: {
  increasesVolumeOrLoad: boolean;
  recoveryBand: RecoveryReadinessBand | null;
  allowVolumeIncrease?: boolean;
}): string[] {
  if (!input.increasesVolumeOrLoad) {
    return [];
  }

  if (input.recoveryBand !== "prioritize_recovery") {
    return [];
  }

  if (input.allowVolumeIncrease) {
    return [];
  }

  return [
    "proposedChanges: Workout adaptations that increase volume or load are not allowed while recovery support is prioritized unless allowVolumeIncrease is explicitly set.",
  ];
}

export const recoveryCheckInUpsertResponseSchema = z.object({
  checkIn: recoveryCheckInRecordSchema,
  context: recoveryContextSnapshotSchema,
});

export type RecoveryCheckInUpsertResponse = z.infer<
  typeof recoveryCheckInUpsertResponseSchema
>;

export const recoveryContextQuerySchema = z.object({
  date: isoDateSchema.optional(),
});

export type RecoveryContextQuery = z.infer<typeof recoveryContextQuerySchema>;

export const recoveryContextResponseSchema = z.object({
  context: recoveryContextSnapshotSchema,
  checkIn: recoveryCheckInRecordSchema.nullable(),
});

export type RecoveryContextResponse = z.infer<typeof recoveryContextResponseSchema>;

export const recoveryWeeklyContextQuerySchema = z.object({
  weekStart: isoDateSchema.optional(),
});

export type RecoveryWeeklyContextQuery = z.infer<typeof recoveryWeeklyContextQuerySchema>;

export const recoveryWeeklyContextEntrySchema = z.object({
  date: isoDateSchema,
  band: recoveryReadinessBandSchema,
  dataSufficiency: recoveryDataSufficiencySchema,
  signalCount: z.number().int().nonnegative(),
});

export type RecoveryWeeklyContextEntry = z.infer<typeof recoveryWeeklyContextEntrySchema>;

export const recoveryProgressAggregateSchema = z.object({
  daysWithContext: z.number().int().min(0).max(7),
  checkInCount: z.number().int().min(0).max(7),
  bandCounts: z.object({
    well_supported: z.number().int().nonnegative(),
    moderate_load: z.number().int().nonnegative(),
    prioritize_recovery: z.number().int().nonnegative(),
    insufficient_data: z.number().int().nonnegative(),
  }),
  dominantBand: recoveryReadinessBandSchema.nullable(),
  dataSufficiency: recoveryDataSufficiencySchema,
  message: z.string().min(1).max(500),
});

export type RecoveryProgressAggregate = z.infer<typeof recoveryProgressAggregateSchema>;

export const recoveryWeeklyContextResponseSchema = z.object({
  weekStart: isoDateSchema,
  weekEnd: isoDateSchema,
  entries: z.array(recoveryWeeklyContextEntrySchema).max(7),
  summary: recoveryProgressAggregateSchema,
});

export type RecoveryWeeklyContextResponse = z.infer<
  typeof recoveryWeeklyContextResponseSchema
>;

export const aiRecoveryContextSummarySchema = z.object({
  band: recoveryReadinessBandSchema,
  dataSufficiency: recoveryDataSufficiencySchema,
  focusMessage: z.string().min(1).max(500),
  signals: z.array(recoverySignalSchema).max(8),
  date: isoDateSchema,
  weeklySummary: recoveryProgressAggregateSchema.optional(),
});

export type AiRecoveryContextSummary = z.infer<typeof aiRecoveryContextSummarySchema>;

export interface RecoveryBandInputSignal {
  source: RecoverySignalSource;
  label: string;
  detail?: string;
  loadScore: number | null;
  recoveryScore: number | null;
}

export interface ComputeRecoveryBandInput {
  signals: RecoveryBandInputSignal[];
}

const UNSAFE_RECOVERY_PATTERNS = [
  /\bdiagnos(e|is|ed|ing)\b/i,
  /\btreat(ment|ing|ed)?\b/i,
  /\bclinical(?:ly)?\b/i,
  /\bmedical(?:ly)?\b/i,
  /\breadiness score\b/i,
  /\brecovery score\b/i,
  /\bovertraining\b/i,
];

export function isWellnessSafeRecoveryMessage(message: string): boolean {
  return !UNSAFE_RECOVERY_PATTERNS.some((pattern) => pattern.test(message));
}

function qualitativeLoad(score: number): string {
  if (score >= 4) {
    return "High";
  }

  if (score >= 3) {
    return "Moderate";
  }

  return "Low";
}

function qualitativeRecovery(score: number): string {
  if (score >= 4) {
    return "Strong";
  }

  if (score >= 3) {
    return "Moderate";
  }

  return "Limited";
}

export function buildManualCheckInSignals(input: {
  soreness: number;
  fatigue: number;
  moodScore?: number | null;
  perceivedStress?: number | null;
}): RecoveryBandInputSignal[] {
  const signals: RecoveryBandInputSignal[] = [
    {
      source: "manual_check_in",
      label: "Soreness check-in",
      detail: `${qualitativeLoad(input.soreness)} soreness`,
      loadScore: input.soreness,
      recoveryScore: 6 - input.soreness,
    },
    {
      source: "manual_check_in",
      label: "Fatigue check-in",
      detail: `${qualitativeLoad(input.fatigue)} fatigue`,
      loadScore: input.fatigue,
      recoveryScore: 6 - input.fatigue,
    },
  ];

  if (input.moodScore != null) {
    signals.push({
      source: "manual_check_in",
      label: "Mood check-in",
      detail: `${qualitativeRecovery(input.moodScore)} mood`,
      loadScore: 6 - input.moodScore,
      recoveryScore: input.moodScore,
    });
  }

  if (input.perceivedStress != null) {
    signals.push({
      source: "manual_check_in",
      label: "Perceived stress check-in",
      detail: `${qualitativeLoad(input.perceivedStress)} stress`,
      loadScore: input.perceivedStress,
      recoveryScore: 6 - input.perceivedStress,
    });
  }

  return signals;
}

export function buildWorkoutFatigueSignal(fatigue: number): RecoveryBandInputSignal {
  const normalizedLoad = Math.max(1, Math.min(5, Math.ceil(fatigue / 2)));

  return {
    source: "workout_fatigue",
    label: "Recent workout fatigue",
    detail: `${qualitativeLoad(normalizedLoad)} reported fatigue`,
    loadScore: normalizedLoad,
    recoveryScore: 6 - normalizedLoad,
  };
}

export function buildTodayFeedbackSignals(input: {
  energy?: number | null;
  difficulty?: number | null;
}): RecoveryBandInputSignal[] {
  const signals: RecoveryBandInputSignal[] = [];

  if (input.energy != null) {
    const normalizedRecovery = Math.max(1, Math.min(5, Math.ceil(input.energy / 2)));

    signals.push({
      source: "today_feedback",
      label: "Today energy feedback",
      detail: `${qualitativeRecovery(normalizedRecovery)} energy`,
      loadScore: 6 - normalizedRecovery,
      recoveryScore: normalizedRecovery,
    });
  }

  if (input.difficulty != null) {
    const normalizedLoad = Math.max(1, Math.min(5, Math.ceil(input.difficulty / 2)));

    signals.push({
      source: "today_feedback",
      label: "Today difficulty feedback",
      detail: `${qualitativeLoad(normalizedLoad)} difficulty`,
      loadScore: normalizedLoad,
      recoveryScore: 6 - normalizedLoad,
    });
  }

  return signals;
}

export function buildSleepMetricSignal(durationMinutes: number): RecoveryBandInputSignal {
  let recoveryScore = 3;
  let detail = "Moderate sleep duration";

  if (durationMinutes < 360) {
    recoveryScore = 1;
    detail = "Shorter sleep duration logged";
  } else if (durationMinutes < 420) {
    recoveryScore = 2;
    detail = "Below-target sleep duration logged";
  } else if (durationMinutes >= 450) {
    recoveryScore = 4;
    detail = "Solid sleep duration logged";
  }

  return {
    source: "device_sleep",
    label: "Synced sleep summary",
    detail,
    loadScore: 6 - recoveryScore,
    recoveryScore,
  };
}

export function buildDeviceRecoveryInputSignal(
  inputType: string,
  value: number | string,
): RecoveryBandInputSignal {
  let loadScore: number | null = null;
  let recoveryScore: number | null = null;
  let detail = "Synced recovery input logged";

  if (typeof value === "number") {
    if (inputType === "readiness_score") {
      detail = "Vendor readiness input recorded as one signal only";
      recoveryScore = Math.max(1, Math.min(5, Math.round(value / 20)));
      loadScore = 6 - recoveryScore;
    } else if (inputType === "resting_heart_rate") {
      detail = value >= 70 ? "Higher resting heart rate logged" : "Resting heart rate logged";
      loadScore = value >= 70 ? 4 : 2;
      recoveryScore = 6 - loadScore;
    } else if (inputType === "hrv_summary") {
      detail = value <= 30 ? "Lower HRV summary logged" : "HRV summary logged";
      loadScore = value <= 30 ? 4 : 2;
      recoveryScore = 6 - loadScore;
    } else {
      loadScore = Math.max(1, Math.min(5, Math.round(value)));
      recoveryScore = 6 - loadScore;
    }
  }

  return {
    source: "device_recovery_input",
    label: "Synced recovery metric",
    detail,
    loadScore,
    recoveryScore,
  };
}

export function computeRecoveryBand(input: ComputeRecoveryBandInput): RecoveryContextPayload {
  const signals = input.signals.filter(
    (signal) => signal.loadScore != null || signal.recoveryScore != null,
  );

  if (signals.length === 0) {
    return {
      band: "insufficient_data",
      dataSufficiency: "insufficient",
      signals: [],
      focusMessage:
        "Not enough recovery data yet. Log how you feel today to build a clearer recovery focus.",
    };
  }

  const loadScores = signals
    .map((signal) => signal.loadScore)
    .filter((value): value is number => value != null);
  const recoveryScores = signals
    .map((signal) => signal.recoveryScore)
    .filter((value): value is number => value != null);

  const averageLoad =
    loadScores.length > 0
      ? loadScores.reduce((total, value) => total + value, 0) / loadScores.length
      : null;
  const averageRecovery =
    recoveryScores.length > 0
      ? recoveryScores.reduce((total, value) => total + value, 0) / recoveryScores.length
      : null;

  const maxLoad = loadScores.length > 0 ? Math.max(...loadScores) : null;
  const minRecovery = recoveryScores.length > 0 ? Math.min(...recoveryScores) : null;

  const hasHighLoad = maxLoad != null && maxLoad >= 4;
  const hasLowRecovery = minRecovery != null && minRecovery <= 2;
  const hasStrongRecovery =
    averageRecovery != null && averageRecovery >= 3.5 && (maxLoad == null || maxLoad <= 3);

  let band: RecoveryReadinessBand = "moderate_load";

  if (hasHighLoad || hasLowRecovery) {
    band = "prioritize_recovery";
  } else if (hasStrongRecovery && (averageLoad == null || averageLoad <= 2.5)) {
    band = "well_supported";
  }

  const manualSignals = signals.filter((signal) => signal.source === "manual_check_in");
  const deviceSignals = signals.filter(
    (signal) => signal.source === "device_sleep" || signal.source === "device_recovery_input",
  );

  if (
    manualSignals.some((signal) => (signal.recoveryScore ?? 0) >= 4) &&
    deviceSignals.some((signal) => (signal.loadScore ?? 0) >= 4)
  ) {
    band = "moderate_load";
  }

  const dataSufficiency: RecoveryDataSufficiency =
    signals.length >= 3 ? "sufficient" : signals.length >= 1 ? "partial" : "insufficient";

  const publicSignals: RecoverySignal[] = signals.slice(0, 8).map((signal) => ({
    source: signal.source,
    label: signal.label,
    detail: signal.detail,
  }));

  const focusMessage = buildRecoveryFocusMessage(band, publicSignals.length);

  return {
    band,
    dataSufficiency,
    signals: publicSignals,
    focusMessage,
  };
}

export function buildRecoveryFocusMessage(
  band: RecoveryReadinessBand,
  signalCount: number,
): string {
  switch (band) {
    case "well_supported":
      return "Based on what you logged, recovery support looks fairly solid today. Keep your usual rhythm unless something feels off.";
    case "moderate_load":
      return signalCount > 1
        ? "Based on what you logged, today may carry a moderate load. A balanced pace could help you stay consistent."
        : "Based on limited recovery data, today may carry a moderate load. A balanced pace could help you stay consistent.";
    case "prioritize_recovery":
      return "Based on what you logged, today may be a good day to prioritize recovery habits and keep training load lighter.";
    case "insufficient_data":
      return "Not enough recovery data yet. Log how you feel today to build a clearer recovery focus.";
  }
}

export function aggregateRecoveryProgress(
  entries: readonly Pick<RecoveryWeeklyContextEntry, "band" | "dataSufficiency">[],
  checkInCount: number,
): RecoveryProgressAggregate {
  const bandCounts = {
    well_supported: 0,
    moderate_load: 0,
    prioritize_recovery: 0,
    insufficient_data: 0,
  };

  for (const entry of entries) {
    bandCounts[entry.band] += 1;
  }

  const daysWithContext = entries.filter((entry) => entry.band !== "insufficient_data").length;
  const rankedBands = (
    Object.entries(bandCounts) as Array<[RecoveryReadinessBand, number]>
  ).filter(([band]) => band !== "insufficient_data");
  rankedBands.sort((left, right) => right[1] - left[1]);

  const topBand = rankedBands[0];
  const dominantBand =
    topBand != null && topBand[1] > 0 ? topBand[0] : null;

  const dataSufficiency: RecoveryDataSufficiency =
    daysWithContext >= 4 ? "sufficient" : daysWithContext >= 2 ? "partial" : "insufficient";

  const message =
    daysWithContext === 0
      ? "Recovery patterns are not available for this week yet. Daily check-ins can help build a clearer picture."
      : dominantBand === "prioritize_recovery"
        ? "This week includes several days where recovery support may be worth prioritizing based on what you logged."
        : dominantBand === "well_supported"
          ? "This week includes several days where recovery support looked fairly solid based on what you logged."
          : "This week shows a mixed recovery pattern based on the entries available.";

  return {
    daysWithContext,
    checkInCount,
    bandCounts,
    dominantBand,
    dataSufficiency,
    message,
  };
}

export function buildRecoveryWeeklyEntries(
  snapshots: readonly Pick<RecoveryContextSnapshot, "date" | "band" | "payload">[],
  weekStart: string,
): RecoveryWeeklyContextEntry[] {
  const entries: RecoveryWeeklyContextEntry[] = [];

  for (let offset = 0; offset < 7; offset += 1) {
    const date = shiftIsoDate(weekStart, offset);
    const snapshot = snapshots.find((item) => item.date === date);

    entries.push({
      date,
      band: snapshot?.band ?? "insufficient_data",
      dataSufficiency: snapshot?.payload.dataSufficiency ?? "insufficient",
      signalCount: snapshot?.payload.signals.length ?? 0,
    });
  }

  return entries;
}
