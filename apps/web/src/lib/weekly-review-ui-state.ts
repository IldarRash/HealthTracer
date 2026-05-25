import type {
  DomainSufficiencyLevel,
  ProgressSourceAggregates,
  ProposalIntent,
  WeeklyProgressSummaryResponse,
  WeeklyReviewCandidateProposal,
  WeeklyReviewLane,
  WeeklyReviewLaneOutcome,
  WeeklyReviewResponse,
} from "@health/types";
import {
  getProgressProvenanceFromProposal,
  weeklyReviewLaneOutcomeSchema,
  weeklyReviewPackMetaSchema,
} from "@health/types";
import { z } from "zod";
import {
  progressDataStatusLabel,
  progressDomainLabel,
  sanitizeWellnessDisplayText,
  summarizeWorkoutAggregate,
} from "./progress-ui-state";

export { WEEKLY_REVIEW_CHAT_PROMPT } from "@health/types";

export const WEEKLY_REVIEW_CANDIDATE_NOTICE =
  "These adaptation previews are not saved as formal proposals yet. Continue in Chat to receive proposals you can accept or decline individually.";

export const WEEKLY_REVIEW_READ_ONLY_NOTICE =
  "Weekly review observations are read-only on Longevity and Training. Any plan or habit changes still require accepting a typed proposal in Chat.";

export const WEEKLY_REVIEW_CHAT_ACTION_NOTICE =
  "When typed adaptations are packaged, they appear as proposal cards below. Accept or decline each one individually—nothing updates until you approve.";

export const chatWeeklyReviewMetadataSchema = z.object({
  summaryId: z.string().uuid(),
  laneOutcomes: z.array(weeklyReviewLaneOutcomeSchema),
  packMeta: weeklyReviewPackMetaSchema,
});

export type ChatWeeklyReviewMetadata = z.infer<typeof chatWeeklyReviewMetadataSchema>;

export type ChatWeeklyReviewPackView = {
  summaryId: string;
  adaptationMessage: string;
  lanes: WeeklyReviewLaneView[];
  droppedLanes: Array<{ laneLabel: string; reason: string }>;
};

export type CrossDomainAggregateView = {
  id: string;
  domain: string;
  sufficiency: string;
  headline: string;
  detail: string;
};

export type WeeklyReviewLaneView = {
  lane: WeeklyReviewLane;
  label: string;
  statusLabel: string;
  detail: string;
};

export type WeeklyReviewCandidateView = {
  id: string;
  laneLabel: string;
  title: string;
  reason: string;
  intentLabel: string;
};

export type WeeklyReviewPackView = {
  adaptationMessage: string;
  lanes: WeeklyReviewLaneView[];
  candidates: WeeklyReviewCandidateView[];
  droppedLanes: Array<{ laneLabel: string; reason: string }>;
  hasPersistedCandidates: false;
};

export function weeklyReviewLaneLabel(lane: WeeklyReviewLane): string {
  switch (lane) {
    case "workout":
      return "Workout plan";
    case "nutrition":
      return "Nutrition plan";
    case "habits_recovery":
      return "Habits & recovery";
  }
}

export function domainSufficiencyLabel(level: DomainSufficiencyLevel): string {
  switch (level) {
    case "sufficient":
      return "Sufficient data";
    case "partial":
      return "Partial data";
    case "deferred":
      return "Deferred this week";
  }
}

function recoverySufficiencyLabel(
  level: "sufficient" | "partial" | "insufficient",
): string {
  switch (level) {
    case "sufficient":
      return "Sufficient data";
    case "partial":
      return "Partial data";
    case "insufficient":
      return "Not enough data yet";
  }
}

export function blockedLaneReasonLabel(reason: string | null): string {
  switch (reason) {
    case "pending_proposal_in_domain_family":
      return "Blocked while another proposal in this area is pending review.";
    case "insufficient_workout_data":
      return "Not enough logged workout sessions yet.";
    case "insufficient_nutrition_data":
      return "Not enough nutrition adherence logged yet.";
    case "insufficient_habits_recovery_data":
      return "Not enough habit, Today, or recovery signals yet.";
    default:
      return reason
        ? sanitizeWellnessDisplayText(reason.replaceAll("_", " "))
        : "Not eligible for adaptation packaging this week.";
  }
}

export function droppedLaneReasonLabel(reason: string): string {
  switch (reason) {
    case "global_cap_reached":
      return "Weekly review already includes the maximum number of adaptation suggestions.";
    case "lane_cap_reached":
      return "Only one adaptation suggestion is allowed per lane.";
    case "conflict_downgraded":
      return "Skipped because it conflicted with a higher-confidence suggestion.";
    case "conflict_replaced":
      return "Replaced by a higher-confidence suggestion after a conflict check.";
    case "no_candidate_proposal":
      return "Eligible, but no typed candidate was available to package.";
    default:
      return sanitizeWellnessDisplayText(reason.replaceAll("_", " "));
  }
}

export function summarizeTodayAggregate(
  aggregate: NonNullable<ProgressSourceAggregates["today"]>,
): { headline: string; detail: string } {
  const adherence =
    aggregate.averageAdherencePercent === null
      ? "Adherence not calculated"
      : `${Math.round(aggregate.averageAdherencePercent)}% average adherence`;

  return {
    headline: `${aggregate.daysWithChecklist} of 7 days with Today checklists`,
    detail: [
      adherence,
      `${aggregate.completedRequiredItems} of ${aggregate.totalRequiredItems} required items completed`,
    ].join(" · "),
  };
}

export function summarizeNutritionProgressAggregate(
  aggregate: NonNullable<ProgressSourceAggregates["nutrition"]>,
): { headline: string; detail: string } {
  if (!aggregate.hasActivePlan) {
    return {
      headline: "No active nutrition plan",
      detail: sanitizeWellnessDisplayText(aggregate.message),
    };
  }

  const completion =
    aggregate.averageTargetCompletionPercent === null
      ? "Target completion not calculated"
      : `${Math.round(aggregate.averageTargetCompletionPercent)}% average target completion`;

  return {
    headline: `${aggregate.daysWithAdherenceLogged} of 7 days with nutrition logs`,
    detail: [completion, sanitizeWellnessDisplayText(aggregate.message)].join(" · "),
  };
}

export function summarizeHabitsAggregate(
  aggregate: NonNullable<ProgressSourceAggregates["habits"]>,
): { headline: string; detail: string } {
  const adherence =
    aggregate.adherencePercent === null
      ? "Adherence not calculated"
      : `${Math.round(aggregate.adherencePercent)}% adherence`;

  return {
    headline: `${aggregate.activeHabitCount} active habit${aggregate.activeHabitCount === 1 ? "" : "s"} tracked`,
    detail: [
      adherence,
      `${aggregate.completedCount} completed · ${aggregate.missedCount} missed`,
      sanitizeWellnessDisplayText(aggregate.message),
    ].join(" · "),
  };
}

export function summarizeRecoveryAggregate(
  aggregate: NonNullable<ProgressSourceAggregates["recovery"]>,
): { headline: string; detail: string } {
  return {
    headline: `${aggregate.daysWithContext} of 7 days with recovery context`,
    detail: [
      `${aggregate.checkInCount} check-in${aggregate.checkInCount === 1 ? "" : "s"}`,
      sanitizeWellnessDisplayText(aggregate.message),
    ].join(" · "),
  };
}

export function buildCrossDomainAggregateViews(
  aggregates: ProgressSourceAggregates,
): CrossDomainAggregateView[] {
  const views: CrossDomainAggregateView[] = [];

  if (aggregates.workout) {
    const summary = summarizeWorkoutAggregate(aggregates.workout);
    views.push({
      id: "workout",
      domain: progressDomainLabel("workout"),
      sufficiency:
        aggregates.workout.plannedCount >= 2 ? "Sufficient data" : "Partial data",
      headline: summary.headline,
      detail: summary.detail,
    });
  }

  if (aggregates.today) {
    const summary = summarizeTodayAggregate(aggregates.today);
    views.push({
      id: "today",
      domain: progressDomainLabel("today"),
      sufficiency: domainSufficiencyLabel(aggregates.today.dataSufficiency),
      headline: summary.headline,
      detail: summary.detail,
    });
  }

  if (aggregates.nutrition) {
    const summary = summarizeNutritionProgressAggregate(aggregates.nutrition);
    views.push({
      id: "nutrition",
      domain: progressDomainLabel("nutrition"),
      sufficiency: domainSufficiencyLabel(aggregates.nutrition.dataSufficiency),
      headline: summary.headline,
      detail: summary.detail,
    });
  }

  if (aggregates.habits) {
    const summary = summarizeHabitsAggregate(aggregates.habits);
    views.push({
      id: "habits",
      domain: "Habits",
      sufficiency: domainSufficiencyLabel(aggregates.habits.dataSufficiency),
      headline: summary.headline,
      detail: summary.detail,
    });
  }

  if (aggregates.recovery) {
    const summary = summarizeRecoveryAggregate(aggregates.recovery);
    views.push({
      id: "recovery",
      domain: progressDomainLabel("recovery"),
      sufficiency: recoverySufficiencyLabel(aggregates.recovery.dataSufficiency),
      headline: summary.headline,
      detail: summary.detail,
    });
  }

  return views;
}

export function buildLongevityCrossDomainHeadline(
  progress: WeeklyProgressSummaryResponse,
): { headline: string; detail: string; dataStatusLabel: string } {
  const aggregates = buildCrossDomainAggregateViews(progress.summary.sourceAggregates);
  const includedCount = aggregates.filter(
    (entry) => !entry.sufficiency.includes("Deferred"),
  ).length;

  if (aggregates.length === 0) {
    return {
      headline: "Not enough data yet",
      detail: sanitizeWellnessDisplayText(progress.summary.userMessage),
      dataStatusLabel: progressDataStatusLabel(progress.summary.dataStatus),
    };
  }

  const primary = aggregates[0];
  const headline =
    includedCount >= 2
      ? `Cross-domain review across ${includedCount} areas`
      : primary?.headline ?? "Weekly progress available";

  const detailParts = [
    progressDataStatusLabel(progress.summary.dataStatus),
    sanitizeWellnessDisplayText(progress.summary.userMessage),
  ];

  return {
    headline,
    detail: detailParts.join(" · "),
    dataStatusLabel: progressDataStatusLabel(progress.summary.dataStatus),
  };
}

export function getProgressLinkedProposalIntentLabel(
  intent: ProposalIntent,
  proposedChanges: unknown,
): string | null {
  if (!getProgressProvenanceFromProposal(intent, proposedChanges)) {
    return null;
  }

  switch (intent) {
    case "adapt_workout_plan_from_progress":
      return "Progress-based workout adaptation";
    case "adjust_nutrition_plan":
      return "Progress-based nutrition adjustment";
    case "adapt_habit_plan":
      return "Progress-based habit & recovery adjustment";
    default:
      return null;
  }
}

export function isProgressLinkedProposal(input: {
  intent: ProposalIntent;
  proposedChanges: unknown;
}): boolean {
  return getProgressProvenanceFromProposal(input.intent, input.proposedChanges) != null;
}

function buildCandidateView(
  candidate: WeeklyReviewCandidateProposal,
  index: number,
): WeeklyReviewCandidateView {
  return {
    id: `${candidate.lane}-${candidate.intent}-${index}`,
    laneLabel: weeklyReviewLaneLabel(candidate.lane),
    title: candidate.title,
    reason: sanitizeWellnessDisplayText(candidate.reason),
    intentLabel:
      getProgressLinkedProposalIntentLabel(
        candidate.intent as ProposalIntent,
        candidate.proposedChanges,
      ) ?? candidate.intent.replaceAll("_", " "),
  };
}

export function explanationOnlyLaneDetail(): string {
  return "Eligible, but no typed proposal was packaged after conflict checks. The coach reply above covers this lane.";
}

function buildLaneView(outcome: WeeklyReviewLaneOutcome): WeeklyReviewLaneView {
  let detail: string;
  if (!outcome.eligible) {
    detail = blockedLaneReasonLabel(outcome.blockedReason);
  } else if (outcome.explanationOnly) {
    detail = explanationOnlyLaneDetail();
  } else {
    detail = "This lane passed weekly review eligibility checks.";
  }

  return {
    lane: outcome.lane,
    label: weeklyReviewLaneLabel(outcome.lane),
    statusLabel: outcome.eligible
      ? outcome.explanationOnly
        ? "Explanation only"
        : "Eligible for adaptation"
      : "Not eligible",
    detail,
  };
}

export function buildChatWeeklyReviewPackView(
  metadata: ChatWeeklyReviewMetadata,
): ChatWeeklyReviewPackView {
  return {
    summaryId: metadata.summaryId,
    adaptationMessage: sanitizeWellnessDisplayText(metadata.packMeta.adaptationMessage),
    lanes: metadata.laneOutcomes.map(buildLaneView),
    droppedLanes: metadata.packMeta.droppedLanes.map((entry) => ({
      laneLabel: weeklyReviewLaneLabel(entry.lane),
      reason: droppedLaneReasonLabel(entry.reason),
    })),
  };
}

export function parseChatWeeklyReviewMetadata(
  metadata: Record<string, unknown>,
): ChatWeeklyReviewMetadata | null {
  const parsed = chatWeeklyReviewMetadataSchema.safeParse(metadata.weeklyReview);
  return parsed.success ? parsed.data : null;
}

export function buildWeeklyReviewPackView(review: WeeklyReviewResponse): WeeklyReviewPackView {
  return {
    adaptationMessage: sanitizeWellnessDisplayText(review.packMeta.adaptationMessage),
    lanes: review.laneOutcomes.map(buildLaneView),
    candidates: review.candidateProposals.map(buildCandidateView),
    droppedLanes: review.packMeta.droppedLanes.map((entry) => ({
      laneLabel: weeklyReviewLaneLabel(entry.lane),
      reason: droppedLaneReasonLabel(entry.reason),
    })),
    hasPersistedCandidates: false,
  };
}

export function buildWeeklyReviewChatRoute(): string {
  return "/chat";
}
