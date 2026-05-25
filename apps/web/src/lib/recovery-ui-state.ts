import type {
  RecoveryCheckInRecord,
  RecoveryContextSnapshot,
  RecoveryDataSufficiency,
  RecoveryReadinessBand,
  RecoveryScore,
  RecoverySignal,
  UpsertRecoveryCheckInInput,
} from "@health/types";
import { formatDisplayDate } from "./today-ui-state";

export const RECOVERY_SCORE_OPTIONS: readonly RecoveryScore[] = [1, 2, 3, 4, 5] as const;

export const SORENESS_SCORE_LABELS: Record<RecoveryScore, string> = {
  1: "None",
  2: "Mild",
  3: "Moderate",
  4: "Noticeable",
  5: "High",
};

export const FATIGUE_SCORE_LABELS: Record<RecoveryScore, string> = {
  1: "Fresh",
  2: "Light",
  3: "Moderate",
  4: "Tired",
  5: "Exhausted",
};

export const RECOVERY_MOOD_SCORE_LABELS: Record<RecoveryScore, string> = {
  1: "Very low",
  2: "Low",
  3: "Okay",
  4: "Good",
  5: "Great",
};

export const RECOVERY_STRESS_SCORE_LABELS: Record<RecoveryScore, string> = {
  1: "Very calm",
  2: "Calm",
  3: "Moderate",
  4: "Elevated",
  5: "Very high",
};

export function sorenessScoreLabel(score: RecoveryScore): string {
  return SORENESS_SCORE_LABELS[score] ?? `Level ${score}`;
}

export function fatigueScoreLabel(score: RecoveryScore): string {
  return FATIGUE_SCORE_LABELS[score] ?? `Level ${score}`;
}

export function recoveryMoodScoreLabel(score: RecoveryScore): string {
  return RECOVERY_MOOD_SCORE_LABELS[score] ?? `Level ${score}`;
}

export function recoveryStressScoreLabel(score: RecoveryScore): string {
  return RECOVERY_STRESS_SCORE_LABELS[score] ?? `Level ${score}`;
}

export function recoveryBandLabel(band: RecoveryReadinessBand): string {
  switch (band) {
    case "well_supported":
      return "Solid recovery support";
    case "moderate_load":
      return "Moderate load";
    case "prioritize_recovery":
      return "Prioritize recovery";
    case "insufficient_data":
      return "Building picture";
  }
}

export function recoveryBandBadgeClass(band: RecoveryReadinessBand): string {
  switch (band) {
    case "well_supported":
      return "badge badge-session-completed recovery-band-badge";
    case "moderate_load":
      return "badge badge-info recovery-band-badge";
    case "prioritize_recovery":
      return "badge badge-session-skipped recovery-band-badge";
    case "insufficient_data":
      return "badge badge-session-pending recovery-band-badge";
  }
}

export function recoveryDataSufficiencyMessage(
  sufficiency: RecoveryDataSufficiency,
): string {
  switch (sufficiency) {
    case "sufficient":
      return "Enough recovery signals logged for a clearer daily focus.";
    case "partial":
      return "Some recovery signals logged — the picture may still be sparse.";
    case "insufficient":
      return "Not enough recovery data yet. Log how you feel to build a clearer focus.";
  }
}

export function buildRecoveryCheckInPayload(input: {
  soreness: RecoveryScore;
  fatigue: RecoveryScore;
  moodScore: RecoveryScore | null;
  perceivedStress: RecoveryScore | null;
  date?: string;
}): UpsertRecoveryCheckInInput {
  return {
    soreness: input.soreness,
    fatigue: input.fatigue,
    ...(input.moodScore != null ? { moodScore: input.moodScore } : { moodScore: null }),
    ...(input.perceivedStress != null
      ? { perceivedStress: input.perceivedStress }
      : { perceivedStress: null }),
    ...(input.date ? { date: input.date } : {}),
    source: "user_entry",
  };
}

export function checkInMatchesForm(input: {
  soreness: RecoveryScore;
  fatigue: RecoveryScore;
  moodScore: RecoveryScore | null;
  perceivedStress: RecoveryScore | null;
  existingCheckIn: RecoveryCheckInRecord;
}): boolean {
  return (
    input.soreness === input.existingCheckIn.soreness &&
    input.fatigue === input.existingCheckIn.fatigue &&
    input.moodScore === input.existingCheckIn.moodScore &&
    input.perceivedStress === input.existingCheckIn.perceivedStress
  );
}

export function canSubmitRecoveryCheckIn(input: {
  soreness: RecoveryScore | null;
  fatigue: RecoveryScore | null;
  moodScore: RecoveryScore | null;
  perceivedStress: RecoveryScore | null;
  existingCheckIn: RecoveryCheckInRecord | null;
}): boolean {
  if (input.soreness == null || input.fatigue == null) {
    return false;
  }

  if (!input.existingCheckIn) {
    return true;
  }

  return !checkInMatchesForm({
    soreness: input.soreness,
    fatigue: input.fatigue,
    moodScore: input.moodScore,
    perceivedStress: input.perceivedStress,
    existingCheckIn: input.existingCheckIn,
  });
}

export type RecoveryCheckInSummaryView = {
  status: "saved";
  summaryLine: string;
  detailLine: string;
  updatedLabel: string;
};

export function buildRecoveryCheckInSummaryView(
  checkIn: RecoveryCheckInRecord,
): RecoveryCheckInSummaryView {
  const parts = [
    `${sorenessScoreLabel(checkIn.soreness)} soreness`,
    `${fatigueScoreLabel(checkIn.fatigue)} fatigue`,
  ];

  if (checkIn.moodScore != null) {
    parts.push(`${recoveryMoodScoreLabel(checkIn.moodScore)} mood`);
  }

  if (checkIn.perceivedStress != null) {
    parts.push(`${recoveryStressScoreLabel(checkIn.perceivedStress)} stress`);
  }

  return {
    status: "saved",
    summaryLine: "Recovery check-in saved",
    detailLine: parts.join(" · "),
    updatedLabel: `Updated ${formatDisplayDate(checkIn.date)}`,
  };
}

export type RecoveryFocusView = {
  bandLabel: string;
  bandBadgeClass: string;
  focusMessage: string;
  sufficiencyMessage: string;
  signalLabels: string[];
  sparse: boolean;
};

export function buildRecoveryFocusView(
  context: RecoveryContextSnapshot,
): RecoveryFocusView {
  const { payload } = context;

  return {
    bandLabel: recoveryBandLabel(payload.band),
    bandBadgeClass: recoveryBandBadgeClass(payload.band),
    focusMessage: payload.focusMessage,
    sufficiencyMessage: recoveryDataSufficiencyMessage(payload.dataSufficiency),
    signalLabels: payload.signals.map(formatRecoverySignalLabel),
    sparse: payload.dataSufficiency !== "sufficient",
  };
}

export function formatRecoverySignalLabel(signal: RecoverySignal): string {
  return signal.detail ? `${signal.label} (${signal.detail})` : signal.label;
}
