import { z } from "zod";
import { isoDateSchema, isoDateTimeSchema } from "./dates.js";

export const habitCategorySchema = z.enum([
  "hydration",
  "movement",
  "nutrition_support",
  "sleep_routine",
  "mobility",
  "mindfulness",
  "planning",
  "other",
]);

export type HabitCategory = z.infer<typeof habitCategorySchema>;

export const habitDefinitionStatusSchema = z.enum(["active", "paused", "removed"]);

export type HabitDefinitionStatus = z.infer<typeof habitDefinitionStatusSchema>;

export const habitTimeOfDayHintSchema = z.enum([
  "morning",
  "midday",
  "evening",
  "anytime",
]);

export type HabitTimeOfDayHint = z.infer<typeof habitTimeOfDayHintSchema>;

export const habitLinkedSourceSchema = z.enum([
  "nutrition_hydration_target",
  "workout_movement_context",
]);

export type HabitLinkedSource = z.infer<typeof habitLinkedSourceSchema>;

export const habitScheduleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("daily") }),
  z.object({
    type: z.literal("selected_weekdays"),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  }),
]);

export type HabitSchedule = z.infer<typeof habitScheduleSchema>;

export const habitBooleanTargetSchema = z.object({
  type: z.literal("boolean"),
});

export const habitCountTargetSchema = z.object({
  type: z.literal("count"),
  value: z.number().int().positive().max(100),
  unit: z.string().min(1).max(40).optional(),
});

export const habitDurationTargetSchema = z.object({
  type: z.literal("duration_minutes"),
  value: z.number().int().positive().max(480),
});

export const habitNumericTargetSchema = z.object({
  type: z.literal("numeric"),
  value: z.number().positive().max(10000),
  unit: z.string().min(1).max(40).optional(),
});

export const habitTargetSchema = z.discriminatedUnion("type", [
  habitBooleanTargetSchema,
  habitCountTargetSchema,
  habitDurationTargetSchema,
  habitNumericTargetSchema,
]);

export type HabitTarget = z.infer<typeof habitTargetSchema>;

export const habitTemplateStatusSchema = z.enum(["active", "archived"]);

export type HabitTemplateStatus = z.infer<typeof habitTemplateStatusSchema>;

export const habitTemplateTargetConstraintsSchema = z.object({
  allowedTargetTypes: z
    .array(z.enum(["boolean", "count", "duration_minutes", "numeric"]))
    .min(1),
  countValueMin: z.number().int().positive().optional(),
  countValueMax: z.number().int().positive().optional(),
  durationMinutesMin: z.number().int().positive().optional(),
  durationMinutesMax: z.number().int().positive().optional(),
  numericValueMin: z.number().positive().optional(),
  numericValueMax: z.number().positive().optional(),
});

export type HabitTemplateTargetConstraints = z.infer<
  typeof habitTemplateTargetConstraintsSchema
>;

export const habitTemplateSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1).max(80),
  title: z.string().min(1).max(160),
  category: habitCategorySchema,
  defaultTarget: habitTargetSchema,
  targetConstraints: habitTemplateTargetConstraintsSchema,
  defaultSchedule: habitScheduleSchema,
  linkedSourceHint: habitLinkedSourceSchema.nullable().optional(),
  defaultRequired: z.boolean(),
  defaultTimeOfDayHint: habitTimeOfDayHintSchema.nullable().optional(),
  coachingNoteDefault: z.string().min(1).max(500).nullable().optional(),
  source: z.string().min(1).max(160),
  status: habitTemplateStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type HabitTemplate = z.infer<typeof habitTemplateSchema>;

export const habitTemplateListResponseSchema = z.object({
  templates: z.array(habitTemplateSchema),
});

export type HabitTemplateListResponse = z.infer<typeof habitTemplateListResponseSchema>;

export const habitDefinitionSchema = z.object({
  habitDefinitionId: z.string().uuid(),
  title: z.string().min(1).max(160),
  category: habitCategorySchema,
  status: habitDefinitionStatusSchema.default("active"),
  schedule: habitScheduleSchema,
  target: habitTargetSchema,
  required: z.boolean().default(true),
  timeOfDayHint: habitTimeOfDayHintSchema.optional(),
  linkedSource: habitLinkedSourceSchema.optional(),
  coachingNote: z.string().min(1).max(500).optional(),
  displayOrder: z.number().int().nonnegative().max(100),
  templateId: z.string().uuid().optional(),
  templateSlug: z.string().min(1).max(80).optional(),
});

export type HabitDefinition = z.infer<typeof habitDefinitionSchema>;

export const habitPlanPayloadSchema = z.object({
  habits: z.array(habitDefinitionSchema).max(20).default([]),
});

export type HabitPlanPayload = z.infer<typeof habitPlanPayloadSchema>;

const UNSAFE_HABIT_MEDICAL_PATTERNS = [
  /\bdiagnos(e|is|ed|ing)\b/i,
  /\bprescri(be|ption|bed|bing)\b/i,
  /\btreat(ment|ing|ed)\b/i,
  /\bmedication\b/i,
  /\bcure\b/i,
  /\bclinical(?:ly)?\b/i,
  /\bpatholog(y|ical)\b/i,
  /\bdisorder\b/i,
  /\bsymptom\b/i,
  /\bmedical advice\b/i,
];

const MAX_ACTIVE_HABITS = 12;

export function getHabitPlanDomainErrors(payload: HabitPlanPayload): string[] {
  const errors: string[] = [];

  const activeHabits = payload.habits.filter((habit) => habit.status === "active");

  if (activeHabits.length > MAX_ACTIVE_HABITS) {
    errors.push(`habits: At most ${MAX_ACTIVE_HABITS} active habits are allowed.`);
  }

  const definitionIds = payload.habits.map((habit) => habit.habitDefinitionId);
  if (new Set(definitionIds).size !== definitionIds.length) {
    errors.push("habits: habitDefinitionId values must be unique within a plan revision.");
  }

  const displayOrders = payload.habits.map((habit) => habit.displayOrder);
  if (new Set(displayOrders).size !== displayOrders.length) {
    errors.push("habits: displayOrder values must be unique within a plan revision.");
  }

  for (const habit of payload.habits) {
    if (habit.schedule.type === "selected_weekdays") {
      const uniqueDays = new Set(habit.schedule.daysOfWeek);
      if (uniqueDays.size !== habit.schedule.daysOfWeek.length) {
        errors.push(
          `habits: "${habit.title}" selected_weekdays daysOfWeek must not contain duplicates.`,
        );
      }
    }

    const unsafeText = [habit.title, habit.coachingNote].filter(Boolean).join(" ");
    if (UNSAFE_HABIT_MEDICAL_PATTERNS.some((pattern) => pattern.test(unsafeText))) {
      errors.push(
        `habits: "${habit.title}" copy must stay in wellness coaching language without medical claims.`,
      );
    }
  }

  return errors;
}

export function habitHasTemplateReference(
  habit: Pick<HabitDefinition, "templateId" | "templateSlug">,
): boolean {
  return habit.templateId != null || habit.templateSlug != null;
}

export function collectHabitTemplateReferences(payload: HabitPlanPayload): {
  templateIds: string[];
  templateSlugs: string[];
} {
  const templateIds: string[] = [];
  const templateSlugs: string[] = [];

  for (const habit of payload.habits) {
    if (habit.templateId) {
      templateIds.push(habit.templateId);
    }

    if (habit.templateSlug) {
      templateSlugs.push(habit.templateSlug);
    }
  }

  return {
    templateIds: [...new Set(templateIds)],
    templateSlugs: [...new Set(templateSlugs)],
  };
}

function resolveTemplateForHabit(
  habit: Pick<HabitDefinition, "templateId" | "templateSlug">,
  templatesById: ReadonlyMap<string, HabitTemplate>,
  templatesBySlug: ReadonlyMap<string, HabitTemplate>,
): HabitTemplate | null {
  const byId = habit.templateId ? templatesById.get(habit.templateId) : undefined;
  const bySlug = habit.templateSlug ? templatesBySlug.get(habit.templateSlug) : undefined;

  if (byId && bySlug && byId.id !== bySlug.id) {
    return null;
  }

  return byId ?? bySlug ?? null;
}

function getTargetValueRangeErrors(
  habitTitle: string,
  target: HabitTarget,
  constraints: HabitTemplateTargetConstraints,
): string[] {
  const errors: string[] = [];

  if (target.type === "count" && target.value != null) {
    if (constraints.countValueMin != null && target.value < constraints.countValueMin) {
      errors.push(
        `habits: "${habitTitle}" count target is below the allowed template minimum.`,
      );
    }

    if (constraints.countValueMax != null && target.value > constraints.countValueMax) {
      errors.push(
        `habits: "${habitTitle}" count target exceeds the allowed template maximum.`,
      );
    }
  }

  if (target.type === "duration_minutes") {
    if (
      constraints.durationMinutesMin != null &&
      target.value < constraints.durationMinutesMin
    ) {
      errors.push(
        `habits: "${habitTitle}" duration target is below the allowed template minimum.`,
      );
    }

    if (
      constraints.durationMinutesMax != null &&
      target.value > constraints.durationMinutesMax
    ) {
      errors.push(
        `habits: "${habitTitle}" duration target exceeds the allowed template maximum.`,
      );
    }
  }

  if (target.type === "numeric" && target.value != null) {
    if (constraints.numericValueMin != null && target.value < constraints.numericValueMin) {
      errors.push(
        `habits: "${habitTitle}" numeric target is below the allowed template minimum.`,
      );
    }

    if (constraints.numericValueMax != null && target.value > constraints.numericValueMax) {
      errors.push(
        `habits: "${habitTitle}" numeric target exceeds the allowed template maximum.`,
      );
    }
  }

  return errors;
}

export function getHabitTemplateUsageErrors(
  habits: HabitDefinition[],
  templatesById: ReadonlyMap<string, HabitTemplate>,
  templatesBySlug: ReadonlyMap<string, HabitTemplate>,
): string[] {
  const errors: string[] = [];

  for (const habit of habits) {
    if (!habitHasTemplateReference(habit)) {
      continue;
    }

    const byId = habit.templateId ? templatesById.get(habit.templateId) : undefined;
    const bySlug = habit.templateSlug ? templatesBySlug.get(habit.templateSlug) : undefined;

    if (habit.templateId && !byId) {
      errors.push(
        `habits: "${habit.title}" templateId "${habit.templateId}" was not found in the active habit template catalog.`,
      );
      continue;
    }

    if (habit.templateSlug && !bySlug) {
      errors.push(
        `habits: "${habit.title}" templateSlug "${habit.templateSlug}" was not found in the active habit template catalog.`,
      );
      continue;
    }

    if (byId && bySlug && byId.id !== bySlug.id) {
      errors.push(
        `habits: "${habit.title}" templateId and templateSlug refer to different habit templates.`,
      );
      continue;
    }

    const template = resolveTemplateForHabit(habit, templatesById, templatesBySlug);

    if (!template) {
      continue;
    }

    if (habit.category !== template.category) {
      errors.push(
        `habits: "${habit.title}" category "${habit.category}" does not match template category "${template.category}".`,
      );
    }

    if (
      template.linkedSourceHint &&
      habit.linkedSource &&
      habit.linkedSource !== template.linkedSourceHint
    ) {
      errors.push(
        `habits: "${habit.title}" linkedSource "${habit.linkedSource}" conflicts with template linkedSource "${template.linkedSourceHint}".`,
      );
    }

    if (template.linkedSourceHint && !habit.linkedSource) {
      errors.push(
        `habits: "${habit.title}" must set linkedSource "${template.linkedSourceHint}" when using template "${template.slug}".`,
      );
    }

    if (!template.targetConstraints.allowedTargetTypes.includes(habit.target.type)) {
      errors.push(
        `habits: "${habit.title}" target type "${habit.target.type}" is not allowed for template "${template.slug}".`,
      );
    }

    errors.push(
      ...getTargetValueRangeErrors(habit.title, habit.target, template.targetConstraints),
    );
  }

  return errors;
}

export const habitPlanStatusSchema = z.enum(["active", "archived"]);

export type HabitPlanStatus = z.infer<typeof habitPlanStatusSchema>;

export const habitPlanSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  activeRevisionId: z.string().uuid().nullable(),
  status: habitPlanStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type HabitPlan = z.infer<typeof habitPlanSchema>;

export const habitPlanRevisionSchema = z.object({
  id: z.string().uuid(),
  habitPlanId: z.string().uuid(),
  revisionNumber: z.number().int().positive(),
  reason: z.string().min(1).max(1000),
  source: z.string().min(1).max(80),
  payload: habitPlanPayloadSchema,
  createdAt: isoDateTimeSchema,
});

export type HabitPlanRevision = z.infer<typeof habitPlanRevisionSchema>;

export const activeHabitPlanResponseSchema = z.object({
  plan: habitPlanSchema.nullable(),
  activeRevision: habitPlanRevisionSchema.nullable(),
});

export type ActiveHabitPlanResponse = z.infer<typeof activeHabitPlanResponseSchema>;

export const habitPlanRevisionsResponseSchema = z.object({
  revisions: z.array(habitPlanRevisionSchema),
});

export type HabitPlanRevisionsResponse = z.infer<typeof habitPlanRevisionsResponseSchema>;

export const habitCompletionStatusSchema = z.enum(["completed", "skipped", "pending"]);

export type HabitCompletionStatus = z.infer<typeof habitCompletionStatusSchema>;

export const habitCompletionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  habitDefinitionId: z.string().uuid(),
  date: isoDateSchema,
  status: habitCompletionStatusSchema,
  progressValue: z.number().nullable(),
  sourceChecklistItemId: z.string().uuid().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type HabitCompletion = z.infer<typeof habitCompletionSchema>;

export function resolveIsoDateDayOfWeek(isoDate: string): number {
  const date = new Date(`${isoDate}T12:00:00.000Z`);

  return date.getUTCDay();
}

export function habitScheduleMatchesDate(
  habit: Pick<HabitDefinition, "status" | "schedule">,
  isoDate: string,
): boolean {
  if (habit.status !== "active") {
    return false;
  }

  if (habit.schedule.type === "daily") {
    return true;
  }

  return habit.schedule.daysOfWeek.includes(resolveIsoDateDayOfWeek(isoDate));
}

export function filterScheduledHabitDefinitions(
  habits: HabitDefinition[],
  isoDate: string,
): HabitDefinition[] {
  return habits
    .filter((habit) => habitScheduleMatchesDate(habit, isoDate))
    .sort((left, right) => left.displayOrder - right.displayOrder);
}

export interface HabitPlanCoachingHabitSummary {
  habitDefinitionId: string;
  title: string;
  category: HabitCategory;
  status: HabitDefinitionStatus;
  scheduleType: HabitSchedule["type"];
  daysOfWeek?: number[];
  targetType: HabitTarget["type"];
  targetValue?: number;
  targetUnit?: string;
  required: boolean;
  timeOfDayHint?: HabitTimeOfDayHint;
  linkedSource?: HabitLinkedSource;
  displayOrder: number;
}

export interface HabitPlanCoachingSummary {
  activeHabitCount: number;
  habits: HabitPlanCoachingHabitSummary[];
}

export function summarizeHabitPlanForCoaching(
  payload: HabitPlanPayload,
): HabitPlanCoachingSummary {
  return {
    activeHabitCount: payload.habits.filter((habit) => habit.status === "active").length,
    habits: payload.habits
      .slice()
      .sort((left, right) => left.displayOrder - right.displayOrder)
      .map((habit) => ({
        habitDefinitionId: habit.habitDefinitionId,
        title: habit.title,
        category: habit.category,
        status: habit.status,
        scheduleType: habit.schedule.type,
        daysOfWeek:
          habit.schedule.type === "selected_weekdays"
            ? habit.schedule.daysOfWeek
            : undefined,
        targetType: habit.target.type,
        targetValue:
          habit.target.type === "boolean" ? undefined : habit.target.value,
        targetUnit:
          habit.target.type === "count" || habit.target.type === "numeric"
            ? habit.target.unit
            : undefined,
        required: habit.required,
        timeOfDayHint: habit.timeOfDayHint,
        linkedSource: habit.linkedSource,
        displayOrder: habit.displayOrder,
      })),
  };
}

export const habitAdherenceWindowSchema = z.union([z.literal(7), z.literal(30)]);

export type HabitAdherenceWindow = z.infer<typeof habitAdherenceWindowSchema>;

export const habitAdherenceQuerySchema = z.object({
  window: z.coerce.number().pipe(habitAdherenceWindowSchema),
});

export type HabitAdherenceQuery = z.infer<typeof habitAdherenceQuerySchema>;

export const habitAdherenceCountsSchema = z.object({
  scheduled: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  missed: z.number().int().nonnegative(),
});

export type HabitAdherenceCounts = z.infer<typeof habitAdherenceCountsSchema>;

export const habitAdherencePlanSummarySchema = z.object({
  window: habitAdherenceWindowSchema,
  windowStart: isoDateSchema,
  windowEnd: isoDateSchema,
  scheduled: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  missed: z.number().int().nonnegative(),
  requiredCompletionRate: z.number().min(0).max(1).nullable(),
});

export type HabitAdherencePlanSummary = z.infer<typeof habitAdherencePlanSummarySchema>;

export const habitAdherenceHabitSummarySchema = z.object({
  habitDefinitionId: z.string().uuid(),
  title: z.string().min(1).max(160),
  required: z.boolean(),
  scheduled: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  missed: z.number().int().nonnegative(),
  completionRate: z.number().min(0).max(1).nullable(),
  currentStreak: z.number().int().nonnegative(),
});

export type HabitAdherenceHabitSummary = z.infer<typeof habitAdherenceHabitSummarySchema>;

export const habitAdherenceResponseSchema = z.object({
  plan: habitAdherencePlanSummarySchema,
  habits: z.array(habitAdherenceHabitSummarySchema),
});

export type HabitAdherenceResponse = z.infer<typeof habitAdherenceResponseSchema>;

export interface HabitAdherenceCoachingSummary {
  windowDays: 7;
  windowStart: string;
  windowEnd: string;
  requiredCompletionRate: number | null;
  scheduledRequired: number;
  completedRequired: number;
  habits: Array<{
    habitDefinitionId: string;
    title: string;
    required: boolean;
    completionRate: number | null;
    currentStreak: number;
  }>;
}

export type HabitAdherenceOutcome = "completed" | "skipped" | "missed" | "pending";

export function getTodayIsoDateInTimezone(timezone: string, now: Date = new Date()): string {
  return formatIsoDateInTimezone(timezone, now);
}

export function formatIsoDateInTimezone(timezone: string, date: Date): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }
}

export function shiftIsoDate(isoDate: string, dayOffset: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);

  if (!match) {
    throw new Error(`Expected ISO date in YYYY-MM-DD format, received "${isoDate}".`);
  }

  const year = Number.parseInt(match[1]!, 10);
  const month = Number.parseInt(match[2]!, 10);
  const day = Number.parseInt(match[3]!, 10);
  const shifted = new Date(Date.UTC(year, month - 1, day));
  shifted.setUTCDate(shifted.getUTCDate() + dayOffset);

  const shiftedYear = shifted.getUTCFullYear();
  const shiftedMonth = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const shiftedDay = String(shifted.getUTCDate()).padStart(2, "0");

  return `${shiftedYear}-${shiftedMonth}-${shiftedDay}`;
}

export function buildAdherenceWindowDates(
  windowEnd: string,
  windowDays: HabitAdherenceWindow,
): string[] {
  const dates: string[] = [];

  for (let offset = windowDays - 1; offset >= 0; offset -= 1) {
    dates.push(shiftIsoDate(windowEnd, -offset));
  }

  return dates;
}

export function resolveHabitAdherenceOutcome(
  completionStatus: HabitCompletionStatus | undefined,
  isoDate: string,
  todayIsoDate: string,
): HabitAdherenceOutcome {
  if (completionStatus === "completed") {
    return "completed";
  }

  if (completionStatus === "skipped") {
    return "skipped";
  }

  if (isoDate === todayIsoDate) {
    return "pending";
  }

  return "missed";
}

function createEmptyAdherenceCounts(): HabitAdherenceCounts {
  return {
    scheduled: 0,
    completed: 0,
    skipped: 0,
    missed: 0,
  };
}

function incrementAdherenceCount(
  counts: HabitAdherenceCounts,
  outcome: HabitAdherenceOutcome,
): void {
  if (outcome === "pending") {
    return;
  }

  counts[outcome] += 1;
}

function computeCompletionRate(
  completed: number,
  scheduled: number,
): number | null {
  if (scheduled === 0) {
    return null;
  }

  return Math.round((completed / scheduled) * 10000) / 10000;
}

function computeCurrentStreak(
  habit: Pick<HabitDefinition, "status" | "schedule" | "required">,
  windowDatesDescending: string[],
  completionByDate: Map<string, HabitCompletionStatus>,
  todayIsoDate: string,
): number {
  let streak = 0;

  for (const isoDate of windowDatesDescending) {
    if (!habitScheduleMatchesDate(habit, isoDate)) {
      continue;
    }

    const outcome = resolveHabitAdherenceOutcome(
      completionByDate.get(isoDate),
      isoDate,
      todayIsoDate,
    );

    if (habit.required) {
      if (outcome === "completed") {
        streak += 1;
        continue;
      }

      if (outcome === "pending") {
        continue;
      }

      break;
    }

    if (outcome === "completed") {
      streak += 1;
      continue;
    }

    if (outcome === "skipped" || outcome === "missed") {
      continue;
    }
  }

  return streak;
}

export function createEmptyHabitAdherenceResponse(
  window: HabitAdherenceWindow,
  windowEnd: string,
): HabitAdherenceResponse {
  const windowStart = shiftIsoDate(windowEnd, -(window - 1));

  return {
    plan: {
      window,
      windowStart,
      windowEnd,
      scheduled: 0,
      completed: 0,
      skipped: 0,
      missed: 0,
      requiredCompletionRate: null,
    },
    habits: [],
  };
}

export function computeHabitAdherenceSummary(input: {
  habits: HabitDefinition[];
  window: HabitAdherenceWindow;
  windowEnd: string;
  completionRows: Array<{
    habitDefinitionId: string;
    date: string;
    status: HabitCompletionStatus;
  }>;
}): HabitAdherenceResponse {
  const windowDates = buildAdherenceWindowDates(input.windowEnd, input.window);
  const windowDatesDescending = [...windowDates].reverse();
  const todayIsoDate = input.windowEnd;

  const completionByHabitAndDate = new Map<string, Map<string, HabitCompletionStatus>>();

  for (const row of input.completionRows) {
    const byDate =
      completionByHabitAndDate.get(row.habitDefinitionId) ?? new Map<string, HabitCompletionStatus>();
    byDate.set(row.date, row.status);
    completionByHabitAndDate.set(row.habitDefinitionId, byDate);
  }

  const planCounts = createEmptyAdherenceCounts();
  let scheduledRequired = 0;
  let completedRequired = 0;

  const activeHabits = input.habits
    .filter((habit) => habit.status === "active")
    .sort((left, right) => left.displayOrder - right.displayOrder);

  const habitSummaries = activeHabits.map((habit) => {
    const counts = createEmptyAdherenceCounts();
    const completionByDate = completionByHabitAndDate.get(habit.habitDefinitionId) ?? new Map();

    for (const isoDate of windowDates) {
      if (!habitScheduleMatchesDate(habit, isoDate)) {
        continue;
      }

      counts.scheduled += 1;
      planCounts.scheduled += 1;

      const outcome = resolveHabitAdherenceOutcome(
        completionByDate.get(isoDate),
        isoDate,
        todayIsoDate,
      );
      incrementAdherenceCount(counts, outcome);

      if (outcome !== "pending") {
        planCounts[outcome] += 1;
      }

      if (habit.required) {
        scheduledRequired += 1;

        if (outcome === "completed") {
          completedRequired += 1;
        }
      }
    }

    return {
      habitDefinitionId: habit.habitDefinitionId,
      title: habit.title,
      required: habit.required,
      scheduled: counts.scheduled,
      completed: counts.completed,
      skipped: counts.skipped,
      missed: counts.missed,
      completionRate: computeCompletionRate(counts.completed, counts.scheduled),
      currentStreak: computeCurrentStreak(
        habit,
        windowDatesDescending,
        completionByDate,
        todayIsoDate,
      ),
    };
  });

  return {
    plan: {
      window: input.window,
      windowStart: windowDates[0]!,
      windowEnd: input.windowEnd,
      scheduled: planCounts.scheduled,
      completed: planCounts.completed,
      skipped: planCounts.skipped,
      missed: planCounts.missed,
      requiredCompletionRate: computeCompletionRate(completedRequired, scheduledRequired),
    },
    habits: habitSummaries,
  };
}

export function summarizeHabitAdherenceForCoaching(
  response: HabitAdherenceResponse,
): HabitAdherenceCoachingSummary {
  const requiredHabits = response.habits.filter((habit) => habit.required);

  return {
    windowDays: 7,
    windowStart: response.plan.windowStart,
    windowEnd: response.plan.windowEnd,
    requiredCompletionRate: response.plan.requiredCompletionRate,
    scheduledRequired: requiredHabits.reduce((total, habit) => total + habit.scheduled, 0),
    completedRequired: requiredHabits.reduce((total, habit) => total + habit.completed, 0),
    habits: response.habits.map((habit) => ({
      habitDefinitionId: habit.habitDefinitionId,
      title: habit.title,
      required: habit.required,
      completionRate: habit.completionRate,
      currentStreak: habit.currentStreak,
    })),
  };
}
