import type { CoachingContextSnapshot } from "./coaching-context.service.js";
import type {
  ContextDepth,
  ContextSlicePurpose,
  ContextSourceRef,
  ContextTimeRange,
  GetUserContextSliceInput,
  ParsedGetUserContextSliceInput,
  NutritionPlanPayload,
  UserContextSlice,
  UserMemoryCategory,
  UserMemoryItem,
} from "@health/types";
import {
  DEFAULT_AGENT_SAFETY_CONSTRAINTS,
  getUserContextSliceInputSchema,
  nutritionPlanPayloadSchema,
  resolveDefaultDepthForPurpose,
  resolveDefaultTimeRangeForPurpose,
  userContextSliceSchema,
} from "@health/types";

export function resolveSliceOptions(input: ParsedGetUserContextSliceInput): {
  depth: ContextDepth;
  timeRange: ContextTimeRange;
} {
  return {
    depth: input.depth ?? resolveDefaultDepthForPurpose(input.purpose),
    timeRange: input.timeRange ?? resolveDefaultTimeRangeForPurpose(input.purpose),
  };
}

export function buildUserContextSliceFromSnapshot(
  snapshot: CoachingContextSnapshot,
  input: GetUserContextSliceInput,
  options?: {
    activeNutritionPlan?: NutritionPlanPayload | null;
    curatedMemories?: UserMemoryItem[];
  },
): UserContextSlice {
  const normalized = getUserContextSliceInputSchema.parse(input);
  const resolved = resolveSliceOptions(normalized);
  const generatedAt = new Date().toISOString();
  const sourceRefs: ContextSourceRef[] = [];
  const base = {
    purpose: normalized.purpose,
    depth: resolved.depth,
    timeRange: resolved.timeRange,
    generatedAt,
    recommendationConstraints: [...DEFAULT_AGENT_SAFETY_CONSTRAINTS],
    // `relevantMemories`: persisted user_memory rows are not wired yet; profile-derived fallback only.
    relevantMemories: options?.curatedMemories ?? [],
    // `snapshots`: persisted context_snapshots rows are not wired yet; weekly_review uses progress summary only.
    snapshots: buildPlaceholderSnapshots(snapshot, normalized.purpose),
    sourceRefs,
  };

  switch (normalized.purpose) {
    case "general_chat":
      return userContextSliceSchema.parse({
        ...base,
        ...buildProfileGoalsSection(snapshot, sourceRefs),
        activeWorkoutPlan: summarizeWorkoutPlan(snapshot),
        activeHabitPlan: snapshot.activeHabitPlanSummary,
        weeklyProgress: summarizeWeeklyProgress(snapshot, "small"),
      });

    case "daily_checkin":
      return userContextSliceSchema.parse({
        ...base,
        activeWorkoutPlan: summarizeWorkoutPlan(snapshot),
        activeHabitPlan: snapshot.activeHabitPlanSummary,
        recentHabitAdherence: mapHabitAdherence(snapshot.recentHabitAdherenceSummary),
        metricsSummary: snapshot.metricsSummary,
        wellbeingSummary: snapshot.wellbeingSummary,
        recoveryContext: snapshot.recoveryContext,
      });

    case "workout_adaptation":
      return userContextSliceSchema.parse({
        ...base,
        ...buildProfileGoalsSection(snapshot, sourceRefs),
        activeWorkoutPlan: summarizeWorkoutPlan(snapshot),
        recentWorkoutExecution: extractWorkoutExecution(snapshot),
        recoveryContext: snapshot.recoveryContext,
        metricsSummary: snapshot.metricsSummary,
        recentHabitAdherence: mapHabitAdherence(snapshot.recentHabitAdherenceSummary),
        relevantMemories: deriveMemoriesFromProfile(snapshot, options?.curatedMemories),
      });

    case "nutrition_adaptation":
      return userContextSliceSchema.parse({
        ...base,
        ...buildProfileGoalsSection(snapshot, sourceRefs),
        activeNutritionPlan: summarizeNutritionPlan(options?.activeNutritionPlan ?? null),
        metricsSummary: snapshot.metricsSummary,
        relevantMemories: deriveMemoriesFromProfile(snapshot, options?.curatedMemories),
      });

    case "weekly_review":
      return userContextSliceSchema.parse({
        ...base,
        weeklyProgress: summarizeWeeklyProgress(snapshot, "large"),
        recentWorkoutExecution: extractWorkoutExecution(snapshot),
        recentHabitAdherence: mapHabitAdherence(snapshot.recentHabitAdherenceSummary),
        metricsSummary: snapshot.metricsSummary,
        wellbeingSummary: snapshot.wellbeingSummary,
      });

    case "longevity_overview":
      return userContextSliceSchema.parse({
        ...base,
        ...buildProfileGoalsSection(snapshot, sourceRefs, true),
        activeWorkoutPlan: summarizeWorkoutPlan(snapshot),
        activeHabitPlan: snapshot.activeHabitPlanSummary,
        recentHabitAdherence: mapHabitAdherence(snapshot.recentHabitAdherenceSummary),
        metricsSummary: snapshot.metricsSummary,
        wellbeingSummary: snapshot.wellbeingSummary,
        recoveryContext: snapshot.recoveryContext,
        weeklyProgress: summarizeWeeklyProgress(snapshot, "medium"),
      });

    // Deep-review numeric aggregates plus a small recent-baseline contrast.
    // Deliberately NO wellbeingSummary / recoveryContext (sensitive-context
    // floor stays untouched) and NO documentContext / ragResults — trends reach
    // the review only as the numbers-only progressHistory packet.
    case "progress_history_review":
      return userContextSliceSchema.parse({
        ...base,
        progressHistory: snapshot.progressHistory ?? undefined,
        activeWorkoutPlan: summarizeWorkoutPlan(snapshot),
        recentWorkoutExecution: extractWorkoutExecution(snapshot),
        weeklyProgress: summarizeWeeklyProgress(snapshot, "small"),
      });

    case "health_context": {
      // biomarkerContext is structured, user-visible, consent-gated data and is
      // exempt from the allowDocuments budget floor by design — eligibility is
      // enforced where the summary is built (BiomarkersService), not here.
      appendBiomarkerSourceRefs(sourceRefs, snapshot);

      return userContextSliceSchema.parse({
        ...base,
        userProfile: snapshot.personalContextSummary,
        activeGoals: mapGoals(snapshot),
        biomarkerContext: snapshot.biomarkerContext,
        metricsSummary: snapshot.metricsSummary,
      });
    }

    default: {
      const _exhaustive: never = normalized.purpose;
      return _exhaustive;
    }
  }
}

function buildProfileGoalsSection(
  snapshot: CoachingContextSnapshot,
  sourceRefs: ContextSourceRef[],
  includeHierarchy = false,
) {
  sourceRefs.push({
    domain: "profile",
    label: "User profile summary",
    generatedAt: new Date().toISOString(),
  });

  const section: Record<string, unknown> = {
    userProfile: snapshot.personalContextSummary,
    activeGoals: mapGoals(snapshot),
  };

  if (includeHierarchy) {
    section.coachingHierarchy = {
      directionStatement: snapshot.coachingHierarchy.direction?.statement ?? null,
      weeklyFocusCount: snapshot.coachingHierarchy.weeklyFocus.length,
    };
  }

  return section;
}

function mapGoals(snapshot: CoachingContextSnapshot) {
  return snapshot.goals
    .filter((goal) => goal.status === "active")
    .slice(0, 10)
    .map((goal) => ({
      id: goal.id,
      type: goal.type,
      status: goal.status,
      priority: goal.priority,
      title: goal.title,
      horizon: goal.horizon,
    }));
}

function summarizeWorkoutPlan(snapshot: CoachingContextSnapshot) {
  if (!snapshot.activeWorkoutPlanSummary) {
    return null;
  }

  return {
    title: snapshot.activeWorkoutPlanSummary.title,
    summary: snapshot.activeWorkoutPlanSummary.summary,
    sessionCount: snapshot.activeWorkoutPlanSummary.dayCount,
  };
}

function summarizeNutritionPlan(payload: NutritionPlanPayload | null) {
  if (!payload) {
    return null;
  }

  const parsed = nutritionPlanPayloadSchema.safeParse(payload);

  if (!parsed.success) {
    return null;
  }

  return {
    title: parsed.data.title,
    summary: parsed.data.summary,
    caloriesPerDay: parsed.data.caloriesPerDay,
    proteinGrams: parsed.data.proteinGrams,
    carbsGrams: parsed.data.carbsGrams,
    fatGrams: parsed.data.fatGrams,
    hydrationLiters: parsed.data.hydrationLiters,
    preferences: parsed.data.preferences,
    restrictions: parsed.data.restrictions,
  };
}

function extractWorkoutExecution(snapshot: CoachingContextSnapshot) {
  const workout = snapshot.weeklyProgressSummary?.summary.sourceAggregates.workout;

  if (!workout) {
    return null;
  }

  return {
    plannedCount: workout.plannedCount,
    completedCount: workout.completedCount,
    skippedCount: workout.skippedCount,
    adherencePercent: workout.adherencePercent,
    averageFatigue: workout.averageFatigue,
  };
}

function summarizeWeeklyProgress(
  snapshot: CoachingContextSnapshot,
  depth: "small" | "medium" | "large",
) {
  if (!snapshot.weeklyProgressSummary) {
    return null;
  }

  const { summary, trends } = snapshot.weeklyProgressSummary;
  const trendLimit = depth === "small" ? 2 : depth === "medium" ? 4 : 8;

  return {
    weekStart: summary.weekStart,
    weekEnd: summary.weekEnd,
    dataStatus: summary.dataStatus,
    userMessage: summary.userMessage,
    trends: trends.slice(0, trendLimit).map((trend) => ({
      id: trend.id,
      domain: trend.domain,
      direction: trend.direction,
      message: trend.message,
    })),
  };
}

function appendBiomarkerSourceRefs(
  sourceRefs: ContextSourceRef[],
  snapshot: CoachingContextSnapshot,
) {
  const generatedAt = snapshot.biomarkerContext.generatedAt;

  for (const item of snapshot.biomarkerContext.items.slice(0, 5)) {
    sourceRefs.push({
      domain: "biomarker",
      label: item.displayLabel,
      generatedAt,
    });
  }
}

function buildPlaceholderSnapshots(
  snapshot: CoachingContextSnapshot,
  purpose: ContextSlicePurpose,
) {
  if (purpose !== "weekly_review" || !snapshot.weeklyProgressSummary) {
    return [];
  }

  const weekly = snapshot.weeklyProgressSummary.summary;

  return [
    {
      id: weekly.id,
      type: "weekly_review" as const,
      periodStart: weekly.weekStart,
      periodEnd: weekly.weekEnd,
      summary: weekly.userMessage,
      generatedAt: weekly.generatedAt,
    },
  ];
}

function mapHabitAdherence(
  summary: CoachingContextSnapshot["recentHabitAdherenceSummary"],
) {
  if (!summary) {
    return null;
  }

  return {
    window: summary.windowDays,
    windowStart: summary.windowStart,
    windowEnd: summary.windowEnd,
    scheduled: summary.scheduledRequired,
    completed: summary.completedRequired,
    skipped: 0,
    missed: Math.max(summary.scheduledRequired - summary.completedRequired, 0),
    requiredCompletionRate: summary.requiredCompletionRate,
  };
}

function mapCoachingNoteCategory(
  category: "preference" | "constraint" | "context" | "motivation" | undefined,
): UserMemoryCategory {
  switch (category) {
    case "preference":
      return "preference";
    case "constraint":
      return "constraint";
    case "motivation":
      return "pattern";
    case "context":
    default:
      return "insight";
  }
}

function deriveMemoriesFromProfile(
  snapshot: CoachingContextSnapshot,
  curatedMemories: UserMemoryItem[] | undefined,
): UserMemoryItem[] {
  if (curatedMemories && curatedMemories.length > 0) {
    return curatedMemories.filter((memory) => memory.revokedAt == null);
  }

  const profile = snapshot.profile;

  if (!profile) {
    return [];
  }

  const derived: UserMemoryItem[] = [];

  for (const preference of profile.preferences.slice(0, 3)) {
    derived.push({
      id: crypto.randomUUID(),
      text: preference,
      category: "preference",
      source: "user_stated",
      staleAfter: null,
      revokedAt: null,
    });
  }

  for (const constraint of profile.constraints.slice(0, 3)) {
    derived.push({
      id: crypto.randomUUID(),
      text: constraint,
      category: "constraint",
      source: "user_stated",
      staleAfter: null,
      revokedAt: null,
    });
  }

  for (const note of profile.coachingNotes.slice(0, 2)) {
    derived.push({
      id: crypto.randomUUID(),
      text: note.text,
      category: mapCoachingNoteCategory(note.category),
      source: "coach_observed",
      staleAfter: null,
      revokedAt: null,
    });
  }

  return derived;
}
