import { z } from "zod";
import { calculateTodayAdherence, todayChecklistItemSchema } from "./today.js";

export const domainSufficiencyLevelSchema = z.enum([
  "sufficient",
  "partial",
  "deferred",
]);

export type DomainSufficiencyLevel = z.infer<typeof domainSufficiencyLevelSchema>;

export const todayProgressAggregateSchema = z.object({
  daysWithChecklist: z.number().int().min(0).max(7),
  averageAdherencePercent: z.number().min(0).max(100).nullable(),
  completedRequiredItems: z.number().int().nonnegative(),
  totalRequiredItems: z.number().int().nonnegative(),
  habitItemCompletionPercent: z.number().min(0).max(100).nullable(),
  dataSufficiency: domainSufficiencyLevelSchema,
  message: z.string().min(1).max(500),
});

export type TodayProgressAggregate = z.infer<typeof todayProgressAggregateSchema>;

/**
 * Weekly aggregate of confirmed nutrition_incidents for the performed (eaten) log.
 * Separate from adherence tracking — captures what was actually logged via proposals.
 */
export const nutritionPerformedAggregateSchema = z.object({
  daysWithIncidentsLogged: z.number().int().min(0).max(7),
  incidentCount: z.number().int().nonnegative(),
  totalCalories: z.number().int().nonnegative(),
  totalProteinGrams: z.number().int().nonnegative(),
  totalCarbsGrams: z.number().int().nonnegative(),
  totalFatGrams: z.number().int().nonnegative(),
  /** Average daily calories across days that had at least one incident. Null when no incidents. */
  averageDailyCalories: z.number().int().nonnegative().nullable(),
});

export type NutritionPerformedAggregate = z.infer<typeof nutritionPerformedAggregateSchema>;

export const nutritionProgressAggregateSchema = z.object({
  hasActivePlan: z.boolean(),
  daysWithAdherenceLogged: z.number().int().min(0).max(7),
  averageTargetCompletionPercent: z.number().min(0).max(100).nullable(),
  dataSufficiency: domainSufficiencyLevelSchema,
  message: z.string().min(1).max(500),
  /** Aggregated performed (eaten) incidents for the week. Null when no incidents were logged. */
  performed: nutritionPerformedAggregateSchema.nullable().optional(),
});

export type NutritionProgressAggregate = z.infer<typeof nutritionProgressAggregateSchema>;

export const habitsProgressAggregateSchema = z.object({
  activeHabitCount: z.number().int().nonnegative(),
  scheduledDays: z.number().int().min(0).max(7),
  completedCount: z.number().int().nonnegative(),
  missedCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  adherencePercent: z.number().min(0).max(100).nullable(),
  dataSufficiency: domainSufficiencyLevelSchema,
  message: z.string().min(1).max(500),
});

export type HabitsProgressAggregate = z.infer<typeof habitsProgressAggregateSchema>;

export const recipesProgressAggregateSchema = z.object({
  recommendationCount: z.number().int().nonnegative(),
  savedCount: z.number().int().nonnegative(),
  dataSufficiency: domainSufficiencyLevelSchema,
  message: z.string().min(1).max(500),
});

export type RecipesProgressAggregate = z.infer<typeof recipesProgressAggregateSchema>;

export const weeklyReviewLaneSchema = z.enum([
  "workout",
  "nutrition",
  "habits_recovery",
]);

export type WeeklyReviewLane = z.infer<typeof weeklyReviewLaneSchema>;

export const weeklyReviewLaneOutcomeSchema = z.object({
  lane: weeklyReviewLaneSchema,
  eligible: z.boolean(),
  blockedReason: z.string().max(240).nullable(),
  confidence: z.number().min(0).max(1),
  explanationOnly: z.boolean().default(false),
});

export type WeeklyReviewLaneOutcome = z.infer<typeof weeklyReviewLaneOutcomeSchema>;

export const weeklyReviewPackMetaSchema = z.object({
  selectedLanes: z.array(weeklyReviewLaneSchema).max(3),
  droppedLanes: z.array(
    z.object({
      lane: weeklyReviewLaneSchema,
      reason: z.string().min(1).max(240),
    }),
  ),
  adaptationMessage: z.string().min(1).max(500),
});

export type WeeklyReviewPackMeta = z.infer<typeof weeklyReviewPackMetaSchema>;

export const weeklyReviewCandidateProposalSchema = z.object({
  lane: weeklyReviewLaneSchema,
  intent: z.string().min(1),
  targetDomain: z.string().min(1),
  title: z.string().min(1).max(160),
  reason: z.string().min(1).max(1000),
  proposedChanges: z.unknown(),
  confidence: z.number().min(0).max(1).default(0.5),
});

export type WeeklyReviewCandidateProposal = z.infer<
  typeof weeklyReviewCandidateProposalSchema
>;

export interface DailyChecklistSnapshot {
  date: string;
  items: z.infer<typeof todayChecklistItemSchema>[];
}

export interface NutritionAdherenceSnapshot {
  date: string;
  targetCompletion: {
    caloriesOnTarget: boolean | null;
    proteinOnTarget: boolean | null;
    carbsOnTarget: boolean | null;
    fatOnTarget: boolean | null;
  };
  mealCompletionCount: number;
}

export interface HabitCompletionSnapshot {
  habitDefinitionId: string;
  date: string;
  status: "completed" | "skipped" | "pending" | "missed";
}

/**
 * Lightweight snapshot of a single nutrition_incident row for weekly aggregation.
 * All macro/calorie fields are the final stored values after any user edits.
 */
export interface NutritionIncidentSnapshot {
  date: string;
  estimatedCalories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
}

/**
 * Aggregate confirmed nutrition_incidents for a week into a performed summary.
 * Pure helper — mirrors the shape of aggregateNutritionAdherenceWeek.
 */
export function aggregateNutritionIncidentsWeek(
  incidents: readonly NutritionIncidentSnapshot[],
): NutritionPerformedAggregate {
  if (incidents.length === 0) {
    return {
      daysWithIncidentsLogged: 0,
      incidentCount: 0,
      totalCalories: 0,
      totalProteinGrams: 0,
      totalCarbsGrams: 0,
      totalFatGrams: 0,
      averageDailyCalories: null,
    };
  }

  let totalCalories = 0;
  let totalProteinGrams = 0;
  let totalCarbsGrams = 0;
  let totalFatGrams = 0;

  const uniqueDates = new Set<string>();

  for (const incident of incidents) {
    uniqueDates.add(incident.date);
    totalCalories += incident.estimatedCalories;
    totalProteinGrams += incident.proteinGrams;
    totalCarbsGrams += incident.carbsGrams;
    totalFatGrams += incident.fatGrams;
  }

  // C5: clamp to 7 so a >7-day window cannot exceed nutritionPerformedAggregateSchema .max(7).
  const daysWithIncidentsLogged = Math.min(7, uniqueDates.size);
  // The divisor is ≥1 here (non-empty input past the early-return above).
  const averageDailyCalories = Math.round(totalCalories / daysWithIncidentsLogged);

  return {
    daysWithIncidentsLogged,
    incidentCount: incidents.length,
    // Math.round so non-integer per-incident macro values never fail .int() parsing.
    totalCalories: Math.round(totalCalories),
    totalProteinGrams: Math.round(totalProteinGrams),
    totalCarbsGrams: Math.round(totalCarbsGrams),
    totalFatGrams: Math.round(totalFatGrams),
    averageDailyCalories,
  };
}

export function aggregateTodayChecklists(
  checklists: readonly DailyChecklistSnapshot[],
): TodayProgressAggregate {
  if (checklists.length === 0) {
    return {
      daysWithChecklist: 0,
      averageAdherencePercent: null,
      completedRequiredItems: 0,
      totalRequiredItems: 0,
      habitItemCompletionPercent: null,
      dataSufficiency: "deferred",
      message:
        "Daily checklist data was not available for this week, so Today execution is deferred.",
    };
  }

  let totalAdherence = 0;
  let adherenceDays = 0;
  let completedRequiredItems = 0;
  let totalRequiredItems = 0;
  let habitCompleted = 0;
  let habitTotal = 0;

  for (const checklist of checklists) {
    const adherence = calculateTodayAdherence(checklist.items);

    if (adherence.totalRequired > 0 && adherence.score != null) {
      totalAdherence += adherence.score * 100;
      adherenceDays += 1;
    }

    completedRequiredItems += adherence.completedRequired;
    totalRequiredItems += adherence.totalRequired;

    for (const item of checklist.items) {
      if (item.kind !== "habit") {
        continue;
      }

      habitTotal += 1;

      if (item.status === "completed") {
        habitCompleted += 1;
      }
    }
  }

  const averageAdherencePercent =
    adherenceDays > 0 ? Math.round(totalAdherence / adherenceDays) : null;
  const habitItemCompletionPercent =
    habitTotal > 0 ? Math.round((habitCompleted / habitTotal) * 100) : null;

  let dataSufficiency: DomainSufficiencyLevel;
  let message: string;

  if (checklists.length >= 4 && averageAdherencePercent != null && averageAdherencePercent >= 50) {
    dataSufficiency = "sufficient";
    message = `You logged Today checklists on ${checklists.length} days this week with roughly ${averageAdherencePercent}% required-item completion based on the entries available.`;
  } else if (checklists.length >= 2) {
    dataSufficiency = "partial";
    message = `You logged Today checklists on ${checklists.length} days this week. More daily entries could help clarify execution patterns.`;
  } else {
    dataSufficiency = "deferred";
    message =
      "Only a few Today checklist entries were available this week, so daily execution patterns remain limited.";
  }

  return {
    daysWithChecklist: checklists.length,
    averageAdherencePercent,
    completedRequiredItems,
    totalRequiredItems,
    habitItemCompletionPercent,
    dataSufficiency,
    message,
  };
}

export function aggregateNutritionAdherenceWeek(input: {
  hasActivePlan: boolean;
  adherenceRows: readonly NutritionAdherenceSnapshot[];
}): NutritionProgressAggregate {
  if (!input.hasActivePlan) {
    return {
      hasActivePlan: false,
      daysWithAdherenceLogged: 0,
      averageTargetCompletionPercent: null,
      dataSufficiency: "deferred",
      message:
        "No active nutrition plan was found, so nutrition adherence is deferred for this weekly review.",
    };
  }

  if (input.adherenceRows.length === 0) {
    return {
      hasActivePlan: true,
      daysWithAdherenceLogged: 0,
      averageTargetCompletionPercent: null,
      dataSufficiency: "deferred",
      message:
        "Your nutrition plan is active, but no adherence entries were logged this week yet.",
    };
  }

  const completionPercents = input.adherenceRows.map((row) => {
    const flags = [
      row.targetCompletion.caloriesOnTarget,
      row.targetCompletion.proteinOnTarget,
      row.targetCompletion.carbsOnTarget,
      row.targetCompletion.fatOnTarget,
    ].filter((value) => value != null);

    if (flags.length === 0) {
      return row.mealCompletionCount > 0 ? 50 : null;
    }

    const met = flags.filter((value) => value === true).length;
    return Math.round((met / flags.length) * 100);
  });

  const validPercents = completionPercents.filter(
    (value): value is number => typeof value === "number",
  );
  const averageTargetCompletionPercent =
    validPercents.length > 0
      ? Math.round(validPercents.reduce((total, value) => total + value, 0) / validPercents.length)
      : null;

  let dataSufficiency: DomainSufficiencyLevel = "partial";
  let message = `Nutrition adherence was logged on ${input.adherenceRows.length} day${input.adherenceRows.length === 1 ? "" : "s"} this week based on the entries available.`;

  if (input.adherenceRows.length >= 4 && averageTargetCompletionPercent != null) {
    dataSufficiency = "sufficient";
    message = `Nutrition adherence was logged on ${input.adherenceRows.length} days this week with roughly ${averageTargetCompletionPercent}% target alignment based on the entries available.`;
  } else if (input.adherenceRows.length <= 1) {
    dataSufficiency = "deferred";
    message =
      "Only limited nutrition adherence entries were available this week, so nutrition patterns remain partial.";
  }

  return {
    hasActivePlan: true,
    daysWithAdherenceLogged: input.adherenceRows.length,
    averageTargetCompletionPercent,
    dataSufficiency,
    message,
  };
}

export function aggregateHabitsProgressWeek(input: {
  activeHabitCount: number;
  completionRows: readonly HabitCompletionSnapshot[];
}): HabitsProgressAggregate {
  if (input.activeHabitCount === 0) {
    return {
      activeHabitCount: 0,
      scheduledDays: 0,
      completedCount: 0,
      missedCount: 0,
      skippedCount: 0,
      adherencePercent: null,
      dataSufficiency: "deferred",
      message:
        "No active habit plan habits were found, so habit execution is deferred for this weekly review.",
    };
  }

  const completedCount = input.completionRows.filter(
    (row) => row.status === "completed",
  ).length;
  const skippedCount = input.completionRows.filter((row) => row.status === "skipped").length;
  const missedCount = input.completionRows.filter((row) => row.status === "missed").length;
  const scheduledDays = new Set(input.completionRows.map((row) => row.date)).size;
  const totalTracked = completedCount + skippedCount + missedCount;
  const adherencePercent =
    totalTracked > 0 ? Math.round((completedCount / totalTracked) * 100) : null;

  let dataSufficiency: DomainSufficiencyLevel = "partial";
  let message = `Habit completions were tracked on ${scheduledDays} day${scheduledDays === 1 ? "" : "s"} this week based on the entries available.`;

  if (scheduledDays >= 4 && totalTracked >= 4 && adherencePercent != null) {
    dataSufficiency = "sufficient";
    message = `Habit completions were tracked across ${scheduledDays} days this week with roughly ${adherencePercent}% marked completed based on the entries available.`;
  } else if (totalTracked === 0) {
    dataSufficiency = "deferred";
    message =
      "Habit plan habits exist, but no completion entries were available for this week yet.";
  } else if (scheduledDays <= 1) {
    dataSufficiency = "deferred";
    message =
      "Only limited habit completion entries were available this week, so habit patterns remain partial.";
  }

  return {
    activeHabitCount: input.activeHabitCount,
    scheduledDays,
    completedCount,
    missedCount,
    skippedCount,
    adherencePercent,
    dataSufficiency,
    message,
  };
}

export function aggregateRecipesActivityWeek(input: {
  recommendationCount: number;
  savedCount: number;
}): RecipesProgressAggregate {
  if (input.recommendationCount === 0 && input.savedCount === 0) {
    return {
      recommendationCount: 0,
      savedCount: 0,
      dataSufficiency: "deferred",
      message: "No recipe recommendations or saves were recorded this week.",
    };
  }

  return {
    recommendationCount: input.recommendationCount,
    savedCount: input.savedCount,
    dataSufficiency: input.recommendationCount >= 2 ? "partial" : "deferred",
    message:
      input.recommendationCount > 0
        ? `${input.recommendationCount} recipe recommendation${input.recommendationCount === 1 ? "" : "s"} appeared this week based on the entries available.`
        : "Recipe activity was limited this week based on the entries available.",
  };
}

export function countSufficientDomains(
  aggregates: {
    workout?: { plannedCount: number } | null;
    today?: TodayProgressAggregate | null;
    nutrition?: NutritionProgressAggregate | null;
    habits?: HabitsProgressAggregate | null;
    recovery?: { daysWithContext: number; dataSufficiency?: string } | null;
  },
): number {
  let count = 0;

  if (aggregates.workout && aggregates.workout.plannedCount >= 2) {
    count += 1;
  }

  if (aggregates.today?.dataSufficiency === "sufficient") {
    count += 1;
  }

  if (aggregates.nutrition?.dataSufficiency === "sufficient") {
    count += 1;
  }

  if (aggregates.habits?.dataSufficiency === "sufficient") {
    count += 1;
  }

  if (
    aggregates.recovery &&
    aggregates.recovery.daysWithContext >= 3 &&
    aggregates.recovery.dataSufficiency !== "insufficient"
  ) {
    count += 1;
  }

  return count;
}

export const WEEKLY_REVIEW_MAX_PROPOSALS = 3;
/** Preferred readability target; packing may still reach {@link WEEKLY_REVIEW_MAX_PROPOSALS}. */
export const WEEKLY_REVIEW_TARGET_PROPOSALS = 2;

export const WEEKLY_REVIEW_CHAT_PROMPT =
  "Review my cross-domain weekly summary and suggest typed adaptations I can approve individually. Nothing should change until I accept a proposal.";

export function isWeeklyReviewChatMessage(content: string): boolean {
  const normalized = content.trim().toLowerCase();

  if (normalized === WEEKLY_REVIEW_CHAT_PROMPT.toLowerCase()) {
    return true;
  }

  return (
    normalized.includes("cross-domain") &&
    normalized.includes("weekly") &&
    (normalized.includes("summary") || normalized.includes("review")) &&
    (normalized.includes("approve individually") ||
      normalized.includes("typed adaptation"))
  );
}

export function evaluateWeeklyReviewLaneEligibility(input: {
  lane: WeeklyReviewLane;
  aggregates: {
    workout?: { plannedCount: number; completedCount: number } | null;
    nutrition?: NutritionProgressAggregate | null;
    habits?: HabitsProgressAggregate | null;
    recovery?: { daysWithContext: number; dataSufficiency?: string } | null;
    today?: TodayProgressAggregate | null;
  };
  hasPendingProposalInLaneFamily: boolean;
}): WeeklyReviewLaneOutcome {
  if (input.hasPendingProposalInLaneFamily) {
    return {
      lane: input.lane,
      eligible: false,
      blockedReason: "pending_proposal_in_domain_family",
      confidence: 0,
      explanationOnly: false,
    };
  }

  switch (input.lane) {
    case "workout": {
      const workout = input.aggregates.workout;
      const eligible = Boolean(workout && workout.plannedCount >= 2);
      const confidence =
        workout && workout.plannedCount >= 3
          ? 0.85
          : workout && workout.plannedCount >= 2
            ? 0.65
            : 0;

      return {
        lane: "workout",
        eligible,
        blockedReason: eligible ? null : "insufficient_workout_data",
        confidence,
        explanationOnly: false,
      };
    }
    case "nutrition": {
      const nutrition = input.aggregates.nutrition;
      const eligible = Boolean(
        nutrition &&
          nutrition.hasActivePlan &&
          nutrition.dataSufficiency !== "deferred" &&
          nutrition.daysWithAdherenceLogged >= 2,
      );
      const confidence =
        nutrition?.dataSufficiency === "sufficient"
          ? 0.8
          : nutrition && nutrition.daysWithAdherenceLogged >= 2
            ? 0.6
            : 0;

      return {
        lane: "nutrition",
        eligible,
        blockedReason: eligible ? null : "insufficient_nutrition_data",
        confidence,
        explanationOnly: false,
      };
    }
    case "habits_recovery": {
      const habits = input.aggregates.habits;
      const recovery = input.aggregates.recovery;
      const today = input.aggregates.today;
      const habitSignal =
        habits != null &&
        habits.dataSufficiency !== "deferred" &&
        habits.activeHabitCount > 0;
      const recoverySignal =
        recovery != null &&
        recovery.daysWithContext >= 2 &&
        recovery.dataSufficiency !== "insufficient";
      const todaySignal = today != null && today.dataSufficiency !== "deferred";
      const eligible = habitSignal || recoverySignal || todaySignal;
      const confidence = habits?.dataSufficiency === "sufficient"
        ? 0.75
        : recoverySignal
          ? 0.65
          : todaySignal
            ? 0.55
            : 0;

      return {
        lane: "habits_recovery",
        eligible,
        blockedReason: eligible ? null : "insufficient_habits_recovery_data",
        confidence,
        explanationOnly: false,
      };
    }
    default:
      return {
        lane: input.lane,
        eligible: false,
        blockedReason: "unsupported_lane",
        confidence: 0,
        explanationOnly: false,
      };
  }
}

export function detectCrossDomainProposalConflict(
  left: WeeklyReviewCandidateProposal,
  right: WeeklyReviewCandidateProposal,
): boolean {
  if (left.lane === right.lane) {
    return true;
  }

  if (
    left.lane === "workout" &&
    right.lane === "habits_recovery" &&
    isVolumeIncreaseWorkoutProposal(left) &&
    isRecoveryIntensiveHabitProposal(right)
  ) {
    return true;
  }

  if (
    right.lane === "workout" &&
    left.lane === "habits_recovery" &&
    isVolumeIncreaseWorkoutProposal(right) &&
    isRecoveryIntensiveHabitProposal(left)
  ) {
    return true;
  }

  return false;
}

function isVolumeIncreaseWorkoutProposal(proposal: WeeklyReviewCandidateProposal): boolean {
  const reason = `${proposal.title} ${proposal.reason}`.toLowerCase();

  if (/\b(reduce|lower|decrease|lighten|deload)\b/.test(reason)) {
    return false;
  }

  return (
    /\b(increase|add|more|extra)\b/.test(reason) &&
    /\b(volume|load)\b/.test(reason)
  );
}

function isRecoveryIntensiveHabitProposal(proposal: WeeklyReviewCandidateProposal): boolean {
  const reason = `${proposal.title} ${proposal.reason}`.toLowerCase();
  return /\b(recovery|rest|sleep|stress|simplify|reduce)\b/.test(reason);
}

export function markExplanationOnlyLanes(
  laneOutcomes: readonly WeeklyReviewLaneOutcome[],
  explanationOnlyLanes: readonly WeeklyReviewLane[],
): WeeklyReviewLaneOutcome[] {
  const explanationOnlySet = new Set(explanationOnlyLanes);

  return laneOutcomes.map((outcome) =>
    explanationOnlySet.has(outcome.lane)
      ? { ...outcome, explanationOnly: true }
      : outcome,
  );
}

export function packWeeklyReviewProposals(input: {
  laneOutcomes: readonly WeeklyReviewLaneOutcome[];
  candidates: readonly WeeklyReviewCandidateProposal[];
}): {
  packed: WeeklyReviewCandidateProposal[];
  meta: WeeklyReviewPackMeta;
  explanationOnlyLanes: WeeklyReviewLane[];
} {
  const eligibleLanes = new Set(
    input.laneOutcomes.filter((lane) => lane.eligible).map((lane) => lane.lane),
  );
  const sortedCandidates = [...input.candidates]
    .filter((candidate) => eligibleLanes.has(candidate.lane))
    .sort((left, right) => right.confidence - left.confidence);

  const selected: WeeklyReviewCandidateProposal[] = [];
  const dropped: WeeklyReviewPackMeta["droppedLanes"] = [];
  const explanationOnlyLanes: WeeklyReviewLane[] = [];
  const usedLanes = new Set<WeeklyReviewLane>();

  for (const candidate of sortedCandidates) {
    if (selected.length >= WEEKLY_REVIEW_MAX_PROPOSALS) {
      dropped.push({ lane: candidate.lane, reason: "global_cap_reached" });
      continue;
    }

    if (usedLanes.has(candidate.lane)) {
      dropped.push({ lane: candidate.lane, reason: "lane_cap_reached" });
      continue;
    }

    const conflicts = selected.some((existing) =>
      detectCrossDomainProposalConflict(existing, candidate),
    );

    if (conflicts) {
      const incumbent = selected.find((existing) =>
        detectCrossDomainProposalConflict(existing, candidate),
      );

      if (incumbent && incumbent.confidence >= candidate.confidence) {
        dropped.push({ lane: candidate.lane, reason: "conflict_downgraded" });
        explanationOnlyLanes.push(candidate.lane);
        continue;
      }

      if (incumbent) {
        dropped.push({ lane: incumbent.lane, reason: "conflict_replaced" });
        const index = selected.indexOf(incumbent);
        selected.splice(index, 1);
        usedLanes.delete(incumbent.lane);
      }
    }

    selected.push(candidate);
    usedLanes.add(candidate.lane);
  }

  for (const lane of input.laneOutcomes) {
    if (!lane.eligible) {
      continue;
    }

    if (!usedLanes.has(lane.lane) && !dropped.some((entry) => entry.lane === lane.lane)) {
      dropped.push({
        lane: lane.lane,
        reason: "no_candidate_proposal",
      });
    }
  }

  const adaptationMessage =
    selected.length > 0
      ? `This weekly review includes up to ${selected.length} typed adaptation suggestion${selected.length === 1 ? "" : "s"} you can approve individually. Nothing changes until you accept a proposal.`
      : "No safe adaptation was packaged for this weekly review based on the data and eligibility checks available. You can still use the summary observations above.";

  return {
    packed: selected,
    meta: {
      selectedLanes: selected.map((proposal) => proposal.lane),
      droppedLanes: dropped,
      adaptationMessage,
    },
    explanationOnlyLanes,
  };
}
