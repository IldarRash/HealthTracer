import { z } from "zod";
import { isoDateSchema } from "./dates.js";

export const goalHorizonSchema = z.enum(["direction", "quarterly", "weekly", "daily"]);

export type GoalHorizon = z.infer<typeof goalHorizonSchema>;

export const goalHorizonsStoredOnGoalsSchema = z.enum(["quarterly", "weekly", "daily"]);

export type GoalHorizonStoredOnGoal = z.infer<typeof goalHorizonsStoredOnGoalsSchema>;

export const MAX_ACTIVE_QUARTERLY_GOALS = 1;
export const MAX_ACTIVE_WEEKLY_FOCUS = 3;

export const longevityDirectionSchema = z.object({
  statement: z.string().min(1).max(500),
  tags: z.array(z.string().min(1).max(80)).max(10).default([]),
});

export type LongevityDirection = z.infer<typeof longevityDirectionSchema>;

export const coachingNoteCategorySchema = z.enum([
  "preference",
  "constraint",
  "context",
  "motivation",
]);

export type CoachingNoteCategory = z.infer<typeof coachingNoteCategorySchema>;

export const coachingNoteSchema = z.object({
  text: z.string().min(1).max(240),
  category: coachingNoteCategorySchema.optional(),
});

export type CoachingNote = z.infer<typeof coachingNoteSchema>;

export const coachingNotesSchema = z.array(coachingNoteSchema).max(20);

export const goalHierarchyFieldsSchema = z.object({
  horizon: goalHorizonsStoredOnGoalsSchema.nullable().optional(),
  parentGoalId: z.string().uuid().nullable().optional(),
  weekStart: isoDateSchema.nullable().optional(),
});

export const goalListQuerySchema = z.object({
  horizon: goalHorizonSchema.optional(),
  active: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return undefined;
      }

      if (typeof value === "boolean") {
        return value;
      }

      return value === "true";
    }),
  weekStart: isoDateSchema.optional(),
});

export type GoalListQuery = z.infer<typeof goalListQuerySchema>;

export type HierarchyGoal = {
  id: string;
  status: "active" | "paused" | "completed" | "archived";
  horizon: GoalHorizonStoredOnGoal | null;
  weekStart: string | null;
};

export type GoalHierarchyState = {
  horizon: GoalHorizonStoredOnGoal | null;
  parentGoalId: string | null;
  weekStart: string | null;
  status: HierarchyGoal["status"];
};

export type ParentGoalContext = Pick<HierarchyGoal, "id" | "status" | "horizon">;

export type HierarchyProfile = {
  longevityDirection: LongevityDirection | null;
  activityLevel:
    | "sedentary"
    | "lightly_active"
    | "moderately_active"
    | "very_active"
    | "athlete"
    | null;
  trainingExperience: "beginner" | "intermediate" | "advanced" | null;
  preferences: string[];
  constraints: string[];
  coachingNotes: CoachingNote[];
};

export const personalContextSummarySchema = z.object({
  activityLevel: z
    .enum([
      "sedentary",
      "lightly_active",
      "moderately_active",
      "very_active",
      "athlete",
    ])
    .nullable(),
  trainingExperience: z.enum(["beginner", "intermediate", "advanced"]).nullable(),
  preferences: z.array(z.string()),
  constraints: z.array(z.string()),
  coachingNotes: coachingNotesSchema,
});

export type PersonalContextSummary = z.infer<typeof personalContextSummarySchema>;

export function getWeekStartIsoDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);

  if (!match) {
    throw new Error(`Expected ISO date in YYYY-MM-DD format, received "${isoDate}".`);
  }

  const year = Number.parseInt(match[1]!, 10);
  const month = Number.parseInt(match[2]!, 10);
  const day = Number.parseInt(match[3]!, 10);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = date.getUTCDay();
  const daysFromMonday = (dayOfWeek + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysFromMonday);

  const weekYear = date.getUTCFullYear();
  const weekMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  const weekDay = String(date.getUTCDate()).padStart(2, "0");

  return `${weekYear}-${weekMonth}-${weekDay}`;
}

export function mergeGoalHierarchyState(
  existing: GoalHierarchyState,
  patch: Partial<GoalHierarchyState>,
): GoalHierarchyState {
  return {
    horizon: patch.horizon !== undefined ? patch.horizon : existing.horizon,
    parentGoalId:
      patch.parentGoalId !== undefined ? patch.parentGoalId : existing.parentGoalId,
    weekStart: patch.weekStart !== undefined ? patch.weekStart : existing.weekStart,
    status: patch.status !== undefined ? patch.status : existing.status,
  };
}

export function getGoalParentReferenceErrors(
  childHorizon: GoalHorizonStoredOnGoal | null,
  parentGoalId: string | null | undefined,
  parentGoal: ParentGoalContext | null | undefined,
): string[] {
  const errors: string[] = [];

  if (!parentGoalId) {
    return errors;
  }

  if (!parentGoal) {
    errors.push("goal: parentGoalId was not found for this user.");
    return errors;
  }

  if (childHorizon === "weekly") {
    if (parentGoal.horizon !== "quarterly" || parentGoal.status !== "active") {
      errors.push("goal: weekly goals must reference an active quarterly parent goal.");
    }
  } else if (childHorizon === "daily") {
    if (parentGoal.horizon !== "weekly" || parentGoal.status !== "active") {
      errors.push("goal: daily goals must reference an active weekly parent goal.");
    }
  }

  return errors;
}

export function getGoalHierarchyValidationErrors(input: {
  merged: GoalHierarchyState;
  existingGoals: Array<Pick<HierarchyGoal, "id" | "status" | "horizon">>;
  goalId?: string;
  parentGoal?: ParentGoalContext | null;
}): string[] {
  const errors: string[] = [];

  errors.push(
    ...getGoalHierarchyFieldErrors({
      horizon: input.merged.horizon,
      parentGoalId: input.merged.parentGoalId,
      weekStart: input.merged.weekStart,
    }),
  );

  if (
    input.merged.horizon &&
    input.merged.horizon !== "quarterly" &&
    input.merged.parentGoalId
  ) {
    errors.push(
      ...getGoalParentReferenceErrors(
        input.merged.horizon,
        input.merged.parentGoalId,
        input.parentGoal,
      ),
    );
  }

  if (
    input.merged.status !== "archived" &&
    input.merged.status !== "completed" &&
    input.merged.horizon
  ) {
    errors.push(
      ...getActiveHierarchyLimitErrors(
        input.existingGoals,
        input.goalId
          ? {
              id: input.goalId,
              status: input.merged.status,
              horizon: input.merged.horizon,
            }
          : {
              id: "candidate",
              status: input.merged.status,
              horizon: input.merged.horizon,
            },
      ),
    );
  }

  return errors;
}

export function getGoalHierarchyFieldErrors(input: {
  horizon?: GoalHorizonStoredOnGoal | null;
  parentGoalId?: string | null;
  weekStart?: string | null;
}): string[] {
  const errors: string[] = [];

  if (input.horizon === "weekly" && !input.weekStart) {
    errors.push("goal: weekStart is required when horizon is weekly.");
  }

  if (input.horizon !== "weekly" && input.weekStart) {
    errors.push("goal: weekStart is only allowed when horizon is weekly.");
  }

  if (input.horizon === "quarterly" && input.parentGoalId) {
    errors.push("goal: parentGoalId is not allowed for quarterly goals.");
  }

  if (input.horizon === "weekly" && !input.parentGoalId) {
    errors.push("goal: parentGoalId is required when horizon is weekly.");
  }

  if (input.horizon === "daily" && !input.parentGoalId) {
    errors.push("goal: parentGoalId is required when horizon is daily.");
  }

  return errors;
}

export function countActiveGoalsByHorizon(
  goals: Array<Pick<HierarchyGoal, "status" | "horizon">>,
  horizon: GoalHorizonStoredOnGoal,
): number {
  return goals.filter((goal) => goal.status === "active" && goal.horizon === horizon).length;
}

export function getActiveHierarchyLimitErrors(
  goals: Array<Pick<HierarchyGoal, "id" | "status" | "horizon">>,
  candidate?: Pick<HierarchyGoal, "id" | "status" | "horizon">,
): string[] {
  const errors: string[] = [];
  const mergedGoals = candidate
    ? goals.some((goal) => goal.id === candidate.id)
      ? goals.map((goal) => (goal.id === candidate.id ? candidate : goal))
      : [...goals, candidate]
    : goals;

  const activeQuarterly = countActiveGoalsByHorizon(mergedGoals, "quarterly");
  const activeWeekly = countActiveGoalsByHorizon(mergedGoals, "weekly");

  if (activeQuarterly > MAX_ACTIVE_QUARTERLY_GOALS) {
    errors.push(
      `goal: At most ${MAX_ACTIVE_QUARTERLY_GOALS} active quarterly goal is allowed.`,
    );
  }

  if (activeWeekly > MAX_ACTIVE_WEEKLY_FOCUS) {
    errors.push(
      `goal: At most ${MAX_ACTIVE_WEEKLY_FOCUS} active weekly focus goals are allowed.`,
    );
  }

  return errors;
}

export function summarizePersonalContext(
  profile: HierarchyProfile | null,
): PersonalContextSummary {
  return {
    activityLevel: profile?.activityLevel ?? null,
    trainingExperience: profile?.trainingExperience ?? null,
    preferences: profile?.preferences ?? [],
    constraints: profile?.constraints ?? [],
    coachingNotes: profile?.coachingNotes ?? [],
  };
}

export function buildCoachingHierarchySummary<TGoal extends HierarchyGoal>(
  profile: Pick<HierarchyProfile, "longevityDirection"> | null,
  goals: TGoal[],
  weekStart?: string,
): {
  direction: LongevityDirection | null;
  activeQuarterlyGoal: TGoal | null;
  weeklyFocus: TGoal[];
} {
  const activeQuarterlyGoal =
    goals.find((goal) => goal.status === "active" && goal.horizon === "quarterly") ?? null;

  const weeklyFocus = goals
    .filter((goal) => {
      if (goal.status !== "active" || goal.horizon !== "weekly") {
        return false;
      }

      if (!weekStart) {
        return true;
      }

      return goal.weekStart === weekStart;
    })
    .slice(0, MAX_ACTIVE_WEEKLY_FOCUS);

  return {
    direction: profile?.longevityDirection ?? null,
    activeQuarterlyGoal,
    weeklyFocus,
  };
}

export const onboardingQuarterlyGoalSchema = z.object({
  type: z.enum([
    "fat_loss",
    "muscle_gain",
    "maintenance",
    "endurance",
    "general_wellness",
  ]),
  priority: z.enum(["primary", "secondary"]).default("primary"),
  title: z.string().min(1).max(160),
  target: z.record(z.string(), z.unknown()).default({}),
  startDate: isoDateSchema,
  targetDate: isoDateSchema,
  horizon: z.literal("quarterly").default("quarterly"),
});

export type OnboardingQuarterlyGoalInput = z.infer<typeof onboardingQuarterlyGoalSchema>;
