import type {
  WellbeingCheckInAggregatesSummary,
  WellbeingCheckInDailyAggregate,
  WellbeingCheckInHistoryEntry,
  WellbeingCheckInRecord,
  WellbeingCrisisEvaluation,
  WellbeingDataSufficiency,
  WellbeingScore,
  WellbeingTrendDirection,
  UpsertWellbeingCheckInInput,
} from "@health/types";
import {
  evaluateWellbeingCrisisFlags,
  shiftIsoDate,
  WELLBEING_CRISIS_SUPPORT_COPY,
} from "@health/types";
import { formatDisplayDate } from "./today-ui-state";

export const WELLBEING_SCORE_OPTIONS: readonly WellbeingScore[] = [1, 2, 3, 4, 5] as const;

export const MOOD_SCORE_LABELS: Record<WellbeingScore, string> = {
  1: "Very low",
  2: "Low",
  3: "Okay",
  4: "Good",
  5: "Great",
};

export const STRESS_SCORE_LABELS: Record<WellbeingScore, string> = {
  1: "Very calm",
  2: "Calm",
  3: "Moderate",
  4: "Elevated",
  5: "Very high",
};

export function moodScoreLabel(score: WellbeingScore): string {
  return MOOD_SCORE_LABELS[score] ?? `Level ${score}`;
}

export function stressScoreLabel(score: WellbeingScore): string {
  return STRESS_SCORE_LABELS[score] ?? `Level ${score}`;
}

export function wellbeingScoreFillPercent(score: WellbeingScore | null): number {
  if (score == null) {
    return 0;
  }

  return Math.round(((score - 1) / 4) * 100);
}

export function formatWellbeingAggregatesError(
  error: string | null | undefined,
): string | null {
  if (!error) {
    return null;
  }

  return "Wellbeing check-in history could not be loaded right now. Other wellness sections are still shown.";
}

export function buildWellbeingCheckInPayload(input: {
  moodScore: WellbeingScore;
  stressScore: WellbeingScore;
  note: string;
}): UpsertWellbeingCheckInInput {
  const trimmedNote = input.note.trim();

  return {
    moodScore: input.moodScore,
    stressScore: input.stressScore,
    ...(trimmedNote.length > 0 ? { note: trimmedNote } : {}),
    source: "user_entry",
  };
}

export function checkInMatchesForm(input: {
  moodScore: WellbeingScore;
  stressScore: WellbeingScore;
  note: string;
  existingCheckIn: WellbeingCheckInRecord;
}): boolean {
  const trimmedNote = input.note.trim();
  const existingNote = input.existingCheckIn.note?.trim() ?? "";

  return (
    input.moodScore === input.existingCheckIn.moodScore &&
    input.stressScore === input.existingCheckIn.stressScore &&
    trimmedNote === existingNote
  );
}

export function canSubmitWellbeingCheckIn(input: {
  moodScore: WellbeingScore | null;
  stressScore: WellbeingScore | null;
  note: string;
  existingCheckIn: WellbeingCheckInRecord | null;
}): boolean {
  if (input.moodScore == null || input.stressScore == null) {
    return false;
  }

  if (!input.existingCheckIn) {
    return true;
  }

  return !checkInMatchesForm({
    moodScore: input.moodScore,
    stressScore: input.stressScore,
    note: input.note,
    existingCheckIn: input.existingCheckIn,
  });
}

export function resolveWellbeingCrisisPreview(input: {
  moodScore: WellbeingScore | null;
  note: string;
}): WellbeingCrisisEvaluation {
  if (input.moodScore == null) {
    return {
      shouldShowCrisisSupport: false,
      reasons: [],
      copy: null,
    };
  }

  return evaluateWellbeingCrisisFlags({
    moodScore: input.moodScore,
    note: input.note,
  });
}

export function wellbeingCheckInIndicatesCrisisSupport(
  checkIn: WellbeingCheckInRecord | null | undefined,
): boolean {
  if (!checkIn) {
    return false;
  }

  if (checkIn.crisisFlagReasons.length > 0) {
    return true;
  }

  return evaluateWellbeingCrisisFlags({
    moodScore: checkIn.moodScore,
    note: checkIn.note,
  }).shouldShowCrisisSupport;
}

export function resolveWellbeingCrisisDisplay(
  preview: WellbeingCrisisEvaluation,
  serverEvaluation: WellbeingCrisisEvaluation | null,
): WellbeingCrisisEvaluation {
  if (serverEvaluation?.shouldShowCrisisSupport) {
    return serverEvaluation;
  }

  if (preview.shouldShowCrisisSupport) {
    return {
      ...preview,
      copy: preview.copy ?? WELLBEING_CRISIS_SUPPORT_COPY,
    };
  }

  return {
    shouldShowCrisisSupport: false,
    reasons: [],
    copy: null,
  };
}

export function resolveWellbeingLiveCrisisPreviewForParent(
  preview: WellbeingCrisisEvaluation,
  serverCrisisSupport: WellbeingCrisisEvaluation | null,
): WellbeingCrisisEvaluation | null {
  return resolveWellbeingCrisisForParent({
    preview,
    serverCrisisSupport,
    persistedCheckIn: null,
  });
}

export function resolveWellbeingCrisisForParent(input: {
  preview: WellbeingCrisisEvaluation;
  serverCrisisSupport: WellbeingCrisisEvaluation | null;
  persistedCheckIn: WellbeingCheckInRecord | null;
}): WellbeingCrisisEvaluation | null {
  if (input.serverCrisisSupport?.shouldShowCrisisSupport) {
    return input.serverCrisisSupport;
  }

  if (
    input.persistedCheckIn &&
    wellbeingCheckInIndicatesCrisisSupport(input.persistedCheckIn)
  ) {
    const evaluation = evaluateWellbeingCrisisFlags({
      moodScore: input.persistedCheckIn.moodScore,
      note: input.persistedCheckIn.note,
    });

    return {
      shouldShowCrisisSupport: true,
      reasons:
        input.persistedCheckIn.crisisFlagReasons.length > 0
          ? input.persistedCheckIn.crisisFlagReasons
          : evaluation.reasons,
      copy: WELLBEING_CRISIS_SUPPORT_COPY,
    };
  }

  if (!input.preview.shouldShowCrisisSupport) {
    return null;
  }

  return {
    ...input.preview,
    copy: input.preview.copy ?? WELLBEING_CRISIS_SUPPORT_COPY,
  };
}

export function shouldRenderWellbeingCrisisInCard(input: {
  crisisDisplay: WellbeingCrisisEvaluation;
  crisisPreview?: WellbeingCrisisEvaluation;
  serverCrisisSupport?: WellbeingCrisisEvaluation | null;
  delegateLivePreviewToParent?: boolean;
  delegateToParent?: boolean;
}): boolean {
  if (!input.crisisDisplay.shouldShowCrisisSupport || !input.crisisDisplay.copy) {
    return false;
  }

  const delegateToParent =
    input.delegateToParent ??
    input.delegateLivePreviewToParent ??
    false;

  return !delegateToParent;
}

export type WellbeingCheckInCardView =
  | { status: "empty"; message: string }
  | {
      status: "saved";
      moodLabel: string;
      stressLabel: string;
      summaryLine: string;
      updatedLabel: string;
    };

export function buildWellbeingCheckInSummaryView(
  checkIn: WellbeingCheckInRecord,
): WellbeingCheckInCardView {
  return {
    status: "saved",
    moodLabel: moodScoreLabel(checkIn.moodScore),
    stressLabel: stressScoreLabel(checkIn.stressScore),
    summaryLine: `Mood ${checkIn.moodScore}/5 · Stress ${checkIn.stressScore}/5`,
    updatedLabel: `Updated ${formatDisplayDate(checkIn.date)}`,
  };
}

export function wellbeingTrendDirectionLabel(direction: WellbeingTrendDirection): string {
  switch (direction) {
    case "up":
      return "Trending up";
    case "down":
      return "Trending down";
    case "stable":
      return "Mostly steady";
    case "unknown":
      return "Not enough data";
  }
}

export function wellbeingDataSufficiencyMessage(
  sufficiency: WellbeingDataSufficiency,
): string {
  switch (sufficiency) {
    case "sufficient":
      return "Enough recent check-ins to show a simple pattern.";
    case "partial":
      return "A few check-ins logged — patterns may still be sparse.";
    case "insufficient":
      return "Log a few daily check-ins on Today to see trends here.";
  }
}

export type WellbeingTrendDay = {
  date: string;
  shortLabel: string;
  moodScore: WellbeingScore | null;
  stressScore: WellbeingScore | null;
  moodFillPercent: number;
  stressFillPercent: number;
  hasData: boolean;
};

function shortWeekdayLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) {
    return isoDate;
  }

  return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(
    new Date(year, month - 1, day),
  );
}

export function buildSevenDayWellbeingTrend(input: {
  aggregates: readonly WellbeingCheckInDailyAggregate[];
  history: readonly WellbeingCheckInHistoryEntry[];
  anchorDate: string;
  windowDays?: number;
}): WellbeingTrendDay[] {
  const windowDays = input.windowDays ?? 7;
  const byDate = new Map<string, { moodScore: WellbeingScore; stressScore: WellbeingScore }>();

  for (const aggregate of input.aggregates) {
    byDate.set(aggregate.date, {
      moodScore: aggregate.moodScore,
      stressScore: aggregate.stressScore,
    });
  }

  for (const entry of input.history) {
    if (!byDate.has(entry.date)) {
      byDate.set(entry.date, {
        moodScore: entry.moodScore,
        stressScore: entry.stressScore,
      });
    }
  }

  const days: WellbeingTrendDay[] = [];

  for (let offset = windowDays - 1; offset >= 0; offset -= 1) {
    const date = shiftIsoDate(input.anchorDate, -offset);
    const values = byDate.get(date) ?? null;

    days.push({
      date,
      shortLabel: shortWeekdayLabel(date),
      moodScore: values?.moodScore ?? null,
      stressScore: values?.stressScore ?? null,
      moodFillPercent: wellbeingScoreFillPercent(values?.moodScore ?? null),
      stressFillPercent: wellbeingScoreFillPercent(values?.stressScore ?? null),
      hasData: values != null,
    });
  }

  return days;
}

export type WellbeingHistoryPanelView =
  | { status: "empty"; title: string; message: string }
  | {
      status: "ready";
      title: string;
      summaryLine: string;
      sufficiencyMessage: string;
      moodTrendLabel: string;
      stressTrendLabel: string;
      streakLabel: string;
      days: WellbeingTrendDay[];
      sparse: boolean;
    };

export function buildWellbeingHistoryPanelView(input: {
  aggregates: readonly WellbeingCheckInDailyAggregate[];
  history: readonly WellbeingCheckInHistoryEntry[];
  summary: WellbeingCheckInAggregatesSummary | null;
  anchorDate: string;
}): WellbeingHistoryPanelView {
  const days = buildSevenDayWellbeingTrend({
    aggregates: input.aggregates,
    history: input.history,
    anchorDate: input.anchorDate,
  });
  const loggedDays = days.filter((day) => day.hasData).length;

  if (loggedDays === 0) {
    return {
      status: "empty",
      title: "No wellbeing check-ins yet",
      message:
        "Log mood and stress on Today to build a simple 7-day history. This is wellness context only — not a clinical assessment.",
    };
  }

  const summary = input.summary;
  const moodAverage =
    summary?.moodAverage != null ? summary.moodAverage.toFixed(1) : null;
  const stressAverage =
    summary?.stressAverage != null ? summary.stressAverage.toFixed(1) : null;

  const summaryParts: string[] = [];
  if (moodAverage != null) {
    summaryParts.push(`Mood avg ${moodAverage}/5`);
  }
  if (stressAverage != null) {
    summaryParts.push(`Stress avg ${stressAverage}/5`);
  }

  return {
    status: "ready",
    title: `${loggedDays} of 7 days logged`,
    summaryLine:
      summaryParts.length > 0
        ? summaryParts.join(" · ")
        : "Recent mood and stress check-ins from Today.",
    sufficiencyMessage: wellbeingDataSufficiencyMessage(
      summary?.dataSufficiency ?? "insufficient",
    ),
    moodTrendLabel: wellbeingTrendDirectionLabel(
      summary?.moodTrendDirection ?? "unknown",
    ),
    stressTrendLabel: wellbeingTrendDirectionLabel(
      summary?.stressTrendDirection ?? "unknown",
    ),
    streakLabel:
      summary && summary.currentStreak > 0
        ? `${summary.currentStreak}-day check-in streak`
        : "No active streak yet",
    days,
    sparse: loggedDays < 3,
  };
}
