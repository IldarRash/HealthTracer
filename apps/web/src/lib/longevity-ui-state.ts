import type {
  DeviceConnection,
  Goal,
  HealthDocument,
  HealthMetricAggregate,
  HealthMetricSnapshot,
  HabitAdherenceResponse,
  NutritionAdherenceRecord,
  RecoveryInputType,
  TodayDayResponse,
  TodayHistoryEntry,
  WeeklyProgressSummaryResponse,
  WorkoutSession,
} from "@health/types";
import { hasDocumentConsentScope } from "@health/types";
import {
  computeWeeklyConsistency,
  goalStatusLabel,
  goalTypeLabel,
  summarizeWorkoutAdherence,
  type WeeklyConsistency,
} from "./dashboard-ui-state";
import { buildHabitAdherenceSummaryView } from "./habit-ui-state";
import {
  formatDocumentTimestamp,
  isDocumentRevoked,
  parseStatusLabel,
} from "./documents-ui-state";
import {
  findActiveConnection,
  formatAggregateSummary,
} from "./metrics-ui-state";
import {
  deferredDomainAvailabilityLabel,
  isProgressSummaryNotFoundError,
  progressDomainLabel,
  sortTrendObservations,
  summarizeDeferredDomains,
  summarizeWorkoutAggregate,
  trendDataSufficiencyLabel,
  trendDirectionLabel,
  trendTypeLabel,
} from "./progress-ui-state";
import { formatAdherenceScore, formatAdherenceSummary } from "./today-ui-state";
import { formatLocalIsoDate } from "./training-ui-state";

export const FORBIDDEN_LONGEVITY_TERMS = [
  "longevity score",
  "health score",
  "readiness score",
  "biological age",
  "risk",
  "normal",
  "abnormal",
] as const;

export const SAFE_BACKEND_MESSAGE_FALLBACK =
  "Weekly wellness pattern noted from your logged activity.";

export const UNSAFE_RECOVERY_INPUT_TYPES: readonly RecoveryInputType[] = [
  "readiness_score",
  "resting_heart_rate",
  "hrv_summary",
];

export const SAFE_SELF_CHECKIN_INPUT_TYPES: readonly RecoveryInputType[] = [
  "mood",
  "soreness",
  "fatigue",
];

export const LONGEVITY_COACH_PROMPTS = [
  "Help me improve consistency this week",
  "Review my logged recovery pattern",
  "What should I focus on in Today?",
] as const;

function startOfWeek(date: Date): Date {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function mergeTodayHistoryIntoTrend(
  trend: readonly number[],
  history: readonly TodayHistoryEntry[],
  now = new Date(),
): number[] {
  const weekStart = startOfWeek(now);

  return trend.map((value, index) => {
    const day = new Date(weekStart);
    day.setDate(day.getDate() + index);
    const iso = toIsoDate(day);
    const entry = history.find((candidate) => candidate.date === iso);
    const todayValue =
      entry?.adherence.score != null ? Math.round(entry.adherence.score * 100) : 0;

    return Math.max(value, todayValue);
  });
}

export function hasSparseLongevityData(input: {
  sessions: readonly WorkoutSession[];
  goals: readonly Goal[];
  todayHistory: readonly TodayHistoryEntry[];
  todayDay: TodayDayResponse | null;
  now?: Date;
}): boolean {
  const workoutAdherence = summarizeWorkoutAdherence(input.sessions, input.now);
  const activeGoals = input.goals.filter((goal) => goal.status === "active").length;
  const historyHasSignals = input.todayHistory.some(
    (entry) =>
      entry.adherence.totalRequired > 0 ||
      entry.adherence.score != null ||
      entry.hasFeedback,
  );
  const todayHasSignals =
    input.todayDay != null &&
    (input.todayDay.adherence.totalRequired > 0 ||
      input.todayDay.adherence.score != null ||
      (input.todayDay.feedback != null &&
        Object.keys(input.todayDay.feedback).length > 0));

  return (
    workoutAdherence.planned === 0 &&
    activeGoals === 0 &&
    !historyHasSignals &&
    !todayHasSignals
  );
}

export function buildLongevityWeeklyHero(input: {
  sessions: readonly WorkoutSession[];
  goals: readonly Goal[];
  todayHistory: readonly TodayHistoryEntry[];
  todayDay: TodayDayResponse | null;
  now?: Date;
}): WeeklyConsistency & { sparse: boolean; emptyMessage: string | null } {
  const base = computeWeeklyConsistency(input.sessions, input.goals, input.now);
  const trend = mergeTodayHistoryIntoTrend(base.trend, input.todayHistory, input.now);
  const activeDays = trend.filter((value) => value > 0).length;
  const sparse = hasSparseLongevityData(input);

  return {
    ...base,
    trend,
    activeDaysLabel: `${activeDays} of 7 days with logged activity`,
    subtitle: sparse
      ? "Not enough data yet — log tasks on Today or complete a workout to start seeing patterns."
      : "Based on your logged workouts, Today adherence, and active goals this week.",
    sparse,
    emptyMessage: sparse ? "Not enough data yet" : null,
  };
}

export type TodayAdherenceCardView =
  | { status: "empty"; message: string }
  | {
      status: "ready";
      scoreLabel: string;
      summary: string;
      feedbackNote: string | null;
    };

export function buildTodayAdherenceCardView(
  todayDay: TodayDayResponse | null,
): TodayAdherenceCardView {
  if (!todayDay || todayDay.adherence.totalRequired === 0) {
    return {
      status: "empty",
      message: "No required tasks for today yet. Open Today to see your checklist.",
    };
  }

  const feedbackParts: string[] = [];
  if (todayDay.feedback?.energy != null) {
    feedbackParts.push(`Energy self-check-in: ${todayDay.feedback.energy}/10`);
  }
  if (todayDay.feedback?.difficulty != null) {
    feedbackParts.push(`Difficulty self-check-in: ${todayDay.feedback.difficulty}/10`);
  }

  return {
    status: "ready",
    scoreLabel: formatAdherenceScore(todayDay.adherence),
    summary: formatAdherenceSummary(todayDay.adherence),
    feedbackNote: feedbackParts.length > 0 ? feedbackParts.join(" · ") : null,
  };
}

export type NutritionConsistencyCardView =
  | { status: "empty"; message: string }
  | { status: "plan_only"; title: string; summary: string }
  | { status: "ready"; title: string; summary: string; detail: string };

export function buildNutritionConsistencyCardView(input: {
  planTitle: string | null;
  planSummary: string | null;
  adherence: NutritionAdherenceRecord | null;
}): NutritionConsistencyCardView {
  if (!input.planTitle) {
    return {
      status: "empty",
      message: "No active nutrition plan yet. Accept a nutrition proposal in Chat to begin.",
    };
  }

  if (!input.adherence || input.adherence.mealCompletion.length === 0) {
    return {
      status: "plan_only",
      title: input.planTitle,
      summary: input.planSummary ?? "Track meals on Today as you follow your plan.",
    };
  }

  const completedMeals = input.adherence.mealCompletion.filter((meal) => meal.completed).length;
  const totalMeals = input.adherence.mealCompletion.length;

  return {
    status: "ready",
    title: input.planTitle,
    summary: input.planSummary ?? "Based on your logged meals today.",
    detail: `${completedMeals} of ${totalMeals} planned meals logged today`,
  };
}

export type WellnessSignalItem = {
  id: string;
  label: string;
  detail: string;
  source: "synced" | "self_check_in";
};

export type WellnessSignalsPanelView =
  | { status: "consent_required"; message: string }
  | { status: "revoked"; message: string }
  | { status: "empty"; message: string }
  | { status: "ready"; signals: WellnessSignalItem[] };

function selfCheckInLabel(inputType: RecoveryInputType): string {
  switch (inputType) {
    case "mood":
      return "Mood self-check-in";
    case "soreness":
      return "Soreness self-check-in";
    case "fatigue":
      return "Fatigue self-check-in";
    default:
      return "Wellness self-check-in";
  }
}

function isSafeRecoveryInput(inputType: RecoveryInputType): boolean {
  return SAFE_SELF_CHECKIN_INPUT_TYPES.includes(inputType);
}

function collectTodaySelfCheckInSignals(
  todayDay: TodayDayResponse | null,
): WellnessSignalItem[] {
  const signals: WellnessSignalItem[] = [];

  if (todayDay?.feedback?.energy != null) {
    signals.push({
      id: "today-energy",
      label: "Energy self-check-in",
      detail: `From Today · ${todayDay.feedback.energy}/10 today`,
      source: "self_check_in",
    });
  }

  return signals;
}

export function sanitizeLongevityBackendText(text: string): string {
  const lower = text.toLowerCase();

  for (const term of FORBIDDEN_LONGEVITY_TERMS) {
    if (lower.includes(term)) {
      return SAFE_BACKEND_MESSAGE_FALLBACK;
    }
  }

  return text;
}

export function buildWellnessSignalsPanelView(input: {
  connections: readonly DeviceConnection[];
  aggregates: readonly HealthMetricAggregate[];
  snapshots: readonly HealthMetricSnapshot[];
  todayDay: TodayDayResponse | null;
}): WellnessSignalsPanelView {
  const activeConnection = findActiveConnection(input.connections);
  const todaySignals = collectTodaySelfCheckInSignals(input.todayDay);

  if (
    input.connections.length > 0 &&
    input.connections.every((connection) => connection.status === "revoked") &&
    todaySignals.length === 0
  ) {
    return {
      status: "revoked",
      message:
        "Device sync consent was revoked. Manage wellness data sharing from Profile when you are ready.",
    };
  }

  const grantedScopes = activeConnection?.grantedScopes ?? [];
  const signals: WellnessSignalItem[] = [...todaySignals];

  if (activeConnection && grantedScopes.includes("steps")) {
    const stepsAggregate = input.aggregates.find((entry) => entry.metricType === "steps");
    if (stepsAggregate) {
      signals.push({
        id: "steps",
        label: "Logged wellness signals",
        detail: `Steps trend · ${formatAggregateSummary(stepsAggregate)}`,
        source: "synced",
      });
    }
  }

  if (activeConnection && grantedScopes.includes("sleep")) {
    const sleepAggregate = input.aggregates.find((entry) => entry.metricType === "sleep");
    if (sleepAggregate) {
      signals.push({
        id: "sleep",
        label: "Sleep trend",
        detail: formatAggregateSummary(sleepAggregate),
        source: "synced",
      });
    }
  }

  if (activeConnection && grantedScopes.includes("weight")) {
    const weightAggregate = input.aggregates.find((entry) => entry.metricType === "weight");
    if (weightAggregate) {
      signals.push({
        id: "weight",
        label: "Weight trend",
        detail: formatAggregateSummary(weightAggregate),
        source: "synced",
      });
    }
  }

  if (activeConnection && grantedScopes.includes("recovery_inputs")) {
    const recoveryAggregate = input.aggregates.find(
      (entry) => entry.metricType === "recovery_input",
    );
    const recoveryPayload = recoveryAggregate?.aggregatePayload;
    if (recoveryPayload && "inputs" in recoveryPayload && Array.isArray(recoveryPayload.inputs)) {
      for (const entry of recoveryPayload.inputs) {
        if (!isSafeRecoveryInput(entry.inputType)) {
          continue;
        }

        signals.push({
          id: `recovery-${entry.inputType}`,
          label: selfCheckInLabel(entry.inputType),
          detail: `Latest ${String(entry.latestValue)}${entry.unit ? ` ${entry.unit}` : ""}`,
          source: "self_check_in",
        });
      }
    }

    for (const snapshot of input.snapshots) {
      if (snapshot.metricType !== "recovery_input") {
        continue;
      }

      const inputType = snapshot.normalizedPayload.inputType;
      if (typeof inputType !== "string" || !isSafeRecoveryInput(inputType as RecoveryInputType)) {
        continue;
      }

      if (signals.some((signal) => signal.id === `recovery-${inputType}`)) {
        continue;
      }

      signals.push({
        id: `recovery-${inputType}`,
        label: selfCheckInLabel(inputType as RecoveryInputType),
        detail: `From synced data you shared · ${String(snapshot.normalizedPayload.value)}`,
        source: "self_check_in",
      });
    }
  }

  if (!activeConnection && input.connections.length === 0 && signals.length === 0) {
    return {
      status: "consent_required",
      message:
        "Connect a device or log self-check-ins on Today to see wellness trends here. Consent is managed from Profile.",
    };
  }

  if (signals.length === 0) {
    return {
      status: "empty",
      message:
        "No wellness trends yet. Log on Today or sync consented device data to populate this panel.",
    };
  }

  return { status: "ready", signals };
}

export type DocumentContextItem = {
  id: string;
  title: string;
  uploadedLabel: string;
  parseStatusLabel: string;
  consentLabel: string;
};

export function buildDocumentsContextView(
  documents: readonly HealthDocument[],
): { status: "empty"; message: string } | { status: "ready"; items: DocumentContextItem[] } {
  const activeDocuments = documents
    .filter((document) => !document.deletedAt && !isDocumentRevoked(document))
    .sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt))
    .slice(0, 3);

  if (activeDocuments.length === 0) {
    return {
      status: "empty",
      message: "No documents uploaded yet. Add context from Profile when you want your coach to reference it.",
    };
  }

  return {
    status: "ready",
    items: activeDocuments.map((document) => ({
      id: document.id,
      title: document.title,
      uploadedLabel: formatDocumentTimestamp(document.uploadedAt),
      parseStatusLabel: parseStatusLabel(document.parseStatus),
      consentLabel: hasDocumentConsentScope(document.consentScopes, "coach_chat_context")
        ? "Coach context consented"
        : "Coach context not shared",
    })),
  };
}

export type LongevityTrendsView =
  | { status: "empty"; message: string }
  | {
      status: "ready";
      headline: string;
      detail: string;
      trends: Array<{ id: string; title: string; meta: string; message: string }>;
      deferredSummary: string;
      deferredDomains: Array<{ domain: string; detail: string }>;
    };

export function buildLongevityTrendsView(
  progress: WeeklyProgressSummaryResponse | null,
): LongevityTrendsView {
  if (!progress) {
    return {
      status: "empty",
      message:
        "Not enough data yet for a weekly trends summary. Complete workouts and check back, or open Training for plan details.",
    };
  }

  const workoutSummary = summarizeWorkoutAggregate(progress.summary.sourceAggregates.workout);
  const sortedTrends = sortTrendObservations(progress.trends);

  return {
    status: "ready",
    headline: workoutSummary.headline,
    detail: workoutSummary.detail,
    trends: sortedTrends.map((trend) => ({
      id: trend.id,
      title: `${trendTypeLabel(trend.trendType)} · ${progressDomainLabel(trend.domain)}`,
      meta: `${trendDataSufficiencyLabel(trend.dataSufficiency)} · ${trendDirectionLabel(trend.direction)}`,
      message: sanitizeLongevityBackendText(trend.message),
    })),
    deferredSummary: sanitizeLongevityBackendText(
      summarizeDeferredDomains(progress.summary.deferredDomains),
    ),
    deferredDomains: progress.summary.deferredDomains.map((entry) => ({
      domain: progressDomainLabel(entry.domain),
      detail: `${deferredDomainAvailabilityLabel(entry.domain)} · ${sanitizeLongevityBackendText(entry.message)}`,
    })),
  };
}

export function buildLongevityCoachPrompts(input: {
  sparseHero: boolean;
  wellnessStatus: WellnessSignalsPanelView["status"];
  activeGoalCount: number;
  goalsFetchFailed?: boolean;
}): readonly string[] {
  const prompts = new Set<string>(LONGEVITY_COACH_PROMPTS);

  if (input.sparseHero) {
    prompts.add("Help me build a simple weekly routine");
  }

  if (input.wellnessStatus === "empty" || input.wellnessStatus === "consent_required") {
    prompts.add("What wellness signals should I track this week?");
  }

  if (input.activeGoalCount === 0 && !input.goalsFetchFailed) {
    prompts.add("Help me set a wellness goal");
  }

  return [...prompts].slice(0, 4);
}

export function summarizeActiveGoals(goals: readonly Goal[]): {
  count: number;
  items: Array<{ id: string; title: string; meta: string }>;
} {
  const activeGoals = goals.filter((goal) => goal.status === "active");

  return {
    count: activeGoals.length,
    items: activeGoals.slice(0, 3).map((goal) => ({
      id: goal.id,
      title: goal.title,
      meta: `${goalTypeLabel(goal.type)} · ${goalStatusLabel(goal.status)}`,
    })),
  };
}

export type GoalsSectionView =
  | { status: "load_error"; title: string; description: string }
  | { status: "empty"; title: string; description: string }
  | {
      status: "ready";
      count: number;
      items: Array<{ id: string; title: string; meta: string }>;
    };

export function buildGoalsSectionView(input: {
  goals: readonly Goal[];
  fetchFailed: boolean;
}): GoalsSectionView {
  const summary = summarizeActiveGoals(input.goals);

  if (input.fetchFailed && summary.count === 0) {
    return {
      status: "load_error",
      title: "Goals unavailable",
      description:
        "Your goals could not be loaded right now. Other wellness data is still shown below.",
    };
  }

  if (summary.count === 0) {
    return {
      status: "empty",
      title: "No active goals yet",
      description: "Ask your coach in Chat to help you set a wellness goal.",
    };
  }

  return {
    status: "ready",
    count: summary.count,
    items: summary.items,
  };
}

export function summarizeHabitConsistencyHint(
  habitAdherence: HabitAdherenceResponse | null,
): string | null {
  const view = buildHabitAdherenceSummaryView(habitAdherence);
  if (view.status === "empty") {
    return null;
  }

  return `${view.requiredCompletionRate} required habit completion · ${view.streakTitle}`;
}

export function isOptionalProgressNotFound(error: string | undefined): boolean {
  return Boolean(error && isProgressSummaryNotFoundError(error));
}

export function todayIsoDate(now = new Date()): string {
  return formatLocalIsoDate(now);
}
