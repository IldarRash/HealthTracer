import { describe, expect, it } from "vitest";
import {
  aiProposalSchema,
  collectHabitTemplateReferences,
  computeHabitAdherenceSummary,
  createEmptyHabitAdherenceResponse,
  filterScheduledHabitDefinitions,
  getHabitPlanDomainErrors,
  getHabitTemplateUsageErrors,
  getProposedChangesSchemaForIntent,
  getTodayIsoDateInTimezone,
  habitAdherenceQuerySchema,
  habitPlanPayloadSchema,
  habitScheduleMatchesDate,
  habitTemplateSchema,
  proposalIntentSchema,
  rawAiProposalSchema,
  resolveHabitAdherenceOutcome,
  resolveIsoDateDayOfWeek,
  summarizeHabitAdherenceForCoaching,
  summarizeHabitPlanForCoaching,
} from "./index.js";

const habitDefinitionId = "a1000001-0000-4000-8000-000000000001";

const baseHabit = {
  habitDefinitionId,
  title: "Morning hydration",
  category: "hydration" as const,
  status: "active" as const,
  schedule: { type: "daily" as const },
  target: { type: "boolean" as const },
  required: true,
  displayOrder: 0,
};

describe("habit plan schemas", () => {
  it("accepts a valid habit plan payload", () => {
    const payload = habitPlanPayloadSchema.parse({
      habits: [baseHabit],
    });

    expect(payload.habits).toHaveLength(1);
    expect(getHabitPlanDomainErrors(payload)).toEqual([]);
  });

  it("rejects unsupported target shapes at schema level", () => {
    expect(() =>
      habitPlanPayloadSchema.parse({
        habits: [
          {
            ...baseHabit,
            target: { type: "percentage", value: 50 },
          },
        ],
      }),
    ).toThrow();
  });

  it("flags more than twelve active habits", () => {
    const habits = Array.from({ length: 13 }, (_, index) => ({
      ...baseHabit,
      habitDefinitionId: `a1000001-0000-4000-8000-${(index + 1).toString(16).padStart(12, "0")}`,
      title: `Habit ${index}`,
      displayOrder: index,
    }));

    const payload = habitPlanPayloadSchema.parse({ habits });
    const errors = getHabitPlanDomainErrors(payload);

    expect(errors).toContain("habits: At most 12 active habits are allowed.");
  });

  it("flags duplicate habitDefinitionId values", () => {
    const payload = habitPlanPayloadSchema.parse({
      habits: [
        baseHabit,
        {
          ...baseHabit,
          title: "Duplicate id habit",
          displayOrder: 1,
        },
      ],
    });

    expect(getHabitPlanDomainErrors(payload)).toContain(
      "habits: habitDefinitionId values must be unique within a plan revision.",
    );
  });

  it("flags wellness-unsafe coaching copy", () => {
    const payload = habitPlanPayloadSchema.parse({
      habits: [
        {
          ...baseHabit,
          coachingNote: "This medication will treat your disorder.",
        },
      ],
    });

    expect(getHabitPlanDomainErrors(payload)[0]).toMatch(/wellness coaching language/);
  });

  it("flags wellness-unsafe text in habit titles", () => {
    const payload = habitPlanPayloadSchema.parse({
      habits: [{ ...baseHabit, title: "Follow this medication schedule" }],
    });

    expect(getHabitPlanDomainErrors(payload)[0]).toMatch(/wellness coaching language/);
  });

  it("flags duplicate displayOrder values", () => {
    const payload = habitPlanPayloadSchema.parse({
      habits: [
        baseHabit,
        {
          ...baseHabit,
          habitDefinitionId: "a1000002-0000-4000-8000-000000000002",
          title: "Another habit",
          displayOrder: 0,
        },
      ],
    });

    expect(getHabitPlanDomainErrors(payload)).toContain(
      "habits: displayOrder values must be unique within a plan revision.",
    );
  });

  it("flags duplicate daysOfWeek entries in selected_weekdays schedules", () => {
    const payload = habitPlanPayloadSchema.parse({
      habits: [
        {
          ...baseHabit,
          schedule: { type: "selected_weekdays", daysOfWeek: [1, 1, 3] },
        },
      ],
    });

    expect(getHabitPlanDomainErrors(payload)).toContain(
      'habits: "Morning hydration" selected_weekdays daysOfWeek must not contain duplicates.',
    );
  });

  it("does not count paused or removed habits toward the active limit", () => {
    const habits = Array.from({ length: 13 }, (_, index) => ({
      ...baseHabit,
      habitDefinitionId: `a1000001-0000-4000-8000-${(index + 1).toString(16).padStart(12, "0")}`,
      title: `Habit ${index}`,
      status: (index === 12 ? "paused" : "active") as "active" | "paused",
      displayOrder: index,
    }));

    const payload = habitPlanPayloadSchema.parse({ habits });
    expect(getHabitPlanDomainErrors(payload)).toEqual([]);
  });

  it("rejects selected_weekdays schedules without daysOfWeek at schema level", () => {
    expect(() =>
      habitPlanPayloadSchema.parse({
        habits: [{ ...baseHabit, schedule: { type: "selected_weekdays", daysOfWeek: [] } }],
      }),
    ).toThrow();
  });

  it("matches daily habits for any date and selected weekdays by UTC day", () => {
    expect(habitScheduleMatchesDate(baseHabit, "2026-05-22")).toBe(true);
    expect(resolveIsoDateDayOfWeek("2026-05-22")).toBe(5);

    expect(
      habitScheduleMatchesDate(
        {
          ...baseHabit,
          schedule: { type: "selected_weekdays", daysOfWeek: [5] },
        },
        "2026-05-22",
      ),
    ).toBe(true);

    expect(
      habitScheduleMatchesDate(
        {
          ...baseHabit,
          schedule: { type: "selected_weekdays", daysOfWeek: [1] },
        },
        "2026-05-22",
      ),
    ).toBe(false);
  });

  it("excludes paused or removed habits from scheduled definitions", () => {
    const payload = habitPlanPayloadSchema.parse({
      habits: [
        baseHabit,
        { ...baseHabit, habitDefinitionId: "b2000002-0000-4000-8000-000000000002", status: "paused", displayOrder: 1 },
        { ...baseHabit, habitDefinitionId: "c3000003-0000-4000-8000-000000000003", status: "removed", displayOrder: 2 },
      ],
    });

    expect(filterScheduledHabitDefinitions(payload.habits, "2026-05-22")).toHaveLength(1);
  });

  it("excludes selected_weekdays habits on non-matching dates", () => {
    const payload = habitPlanPayloadSchema.parse({
      habits: [
        {
          ...baseHabit,
          schedule: { type: "selected_weekdays", daysOfWeek: [1] },
        },
      ],
    });

    expect(filterScheduledHabitDefinitions(payload.habits, "2026-05-22")).toHaveLength(0);
    expect(filterScheduledHabitDefinitions(payload.habits, "2026-05-25")).toHaveLength(1);
  });

  it("sorts scheduled habits by displayOrder", () => {
    const payload = habitPlanPayloadSchema.parse({
      habits: [
        {
          ...baseHabit,
          habitDefinitionId: "b2000002-0000-4000-8000-000000000002",
          title: "Second",
          displayOrder: 2,
        },
        {
          ...baseHabit,
          habitDefinitionId: "c3000003-0000-4000-8000-000000000003",
          title: "First",
          displayOrder: 0,
        },
      ],
    });

    const scheduled = filterScheduledHabitDefinitions(payload.habits, "2026-05-22");

    expect(scheduled.map((habit) => habit.title)).toEqual(["First", "Second"]);
  });
});

describe("summarizeHabitPlanForCoaching", () => {
  it("counts only active habits and preserves coaching summary fields", () => {
    const payload = habitPlanPayloadSchema.parse({
      habits: [
        baseHabit,
        {
          ...baseHabit,
          habitDefinitionId: "b2000002-0000-4000-8000-000000000002",
          title: "Weekday walk",
          category: "movement",
          schedule: { type: "selected_weekdays", daysOfWeek: [1, 3, 5] },
          target: { type: "duration_minutes", value: 20 },
          linkedSource: "workout_movement_context",
          displayOrder: 1,
        },
        {
          ...baseHabit,
          habitDefinitionId: "c3000003-0000-4000-8000-000000000003",
          title: "Paused habit",
          status: "paused",
          displayOrder: 2,
        },
      ],
    });

    const summary = summarizeHabitPlanForCoaching(payload);

    expect(summary.activeHabitCount).toBe(2);
    expect(summary.habits).toHaveLength(3);
  });
});

describe("habit adherence contracts and math", () => {
  it("accepts only 7 or 30 day adherence windows in query schema", () => {
    expect(habitAdherenceQuerySchema.parse({ window: "7" }).window).toBe(7);
    expect(habitAdherenceQuerySchema.parse({ window: 30 }).window).toBe(30);
    expect(habitAdherenceQuerySchema.safeParse({ window: 14 }).success).toBe(false);
  });

  it("treats pending today as neither completed nor missed", () => {
    expect(resolveHabitAdherenceOutcome(undefined, "2026-05-24", "2026-05-24")).toBe("pending");
    expect(resolveHabitAdherenceOutcome("pending", "2026-05-23", "2026-05-24")).toBe("missed");
  });

  it("computes required habit streaks that break on skipped or missed days", () => {
    const requiredHabitId = "a1000001-0000-4000-8000-000000000001";
    const payload = habitPlanPayloadSchema.parse({
      habits: [{ ...baseHabit, habitDefinitionId: requiredHabitId }],
    });

    const summary = computeHabitAdherenceSummary({
      habits: payload.habits,
      window: 7,
      windowEnd: "2026-05-24",
      completionRows: [
        { habitDefinitionId: requiredHabitId, date: "2026-05-24", status: "pending" },
        { habitDefinitionId: requiredHabitId, date: "2026-05-23", status: "completed" },
        { habitDefinitionId: requiredHabitId, date: "2026-05-22", status: "completed" },
        { habitDefinitionId: requiredHabitId, date: "2026-05-21", status: "skipped" },
        { habitDefinitionId: requiredHabitId, date: "2026-05-20", status: "completed" },
      ],
    });

    expect(summary.habits[0]).toMatchObject({
      scheduled: 7,
      completed: 3,
      skipped: 1,
      missed: 2,
      currentStreak: 2,
    });
    expect(summary.habits[0]?.completionRate).toBeCloseTo(3 / 7, 4);
    expect(summary.plan.requiredCompletionRate).toBeCloseTo(3 / 7, 4);
  });

  it("does not break optional habit streaks on skipped or missed days", () => {
    const optionalHabitId = "b2000002-0000-4000-8000-000000000002";
    const payload = habitPlanPayloadSchema.parse({
      habits: [
        {
          ...baseHabit,
          habitDefinitionId: optionalHabitId,
          required: false,
        },
      ],
    });

    const summary = computeHabitAdherenceSummary({
      habits: payload.habits,
      window: 7,
      windowEnd: "2026-05-24",
      completionRows: [
        { habitDefinitionId: optionalHabitId, date: "2026-05-24", status: "pending" },
        { habitDefinitionId: optionalHabitId, date: "2026-05-23", status: "skipped" },
        { habitDefinitionId: optionalHabitId, date: "2026-05-22", status: "completed" },
        { habitDefinitionId: optionalHabitId, date: "2026-05-21", status: "completed" },
      ],
    });

    expect(summary.habits[0]).toMatchObject({
      skipped: 1,
      missed: 3,
      currentStreak: 2,
    });
    expect(summary.plan.requiredCompletionRate).toBeNull();
  });

  it("returns empty summaries when no habits are active", () => {
    const empty = createEmptyHabitAdherenceResponse(30, "2026-05-24");

    expect(empty).toEqual({
      plan: {
        window: 30,
        windowStart: "2026-04-25",
        windowEnd: "2026-05-24",
        scheduled: 0,
        completed: 0,
        skipped: 0,
        missed: 0,
        requiredCompletionRate: null,
      },
      habits: [],
    });
  });

  it("falls back to UTC when timezone is invalid or empty", () => {
    const now = new Date("2026-05-24T15:00:00.000Z");
    const utcToday = getTodayIsoDateInTimezone("UTC", now);
    const invalidTimezoneToday = getTodayIsoDateInTimezone("Not/A_Timezone", now);
    const emptyTimezoneToday = getTodayIsoDateInTimezone("", now);

    expect(invalidTimezoneToday).toBe(utcToday);
    expect(emptyTimezoneToday).toBe(utcToday);
  });

  it("uses the user's local calendar date near UTC midnight boundaries", () => {
    const earlyUtcMorning = new Date("2026-05-24T06:00:00.000Z");

    expect(getTodayIsoDateInTimezone("UTC", earlyUtcMorning)).toBe("2026-05-24");
    expect(getTodayIsoDateInTimezone("America/Los_Angeles", earlyUtcMorning)).toBe(
      "2026-05-23",
    );
  });

  it("excludes pending today from plan outcome counts while keeping it scheduled", () => {
    const summary = computeHabitAdherenceSummary({
      habits: habitPlanPayloadSchema.parse({ habits: [baseHabit] }).habits,
      window: 7,
      windowEnd: "2026-05-24",
      completionRows: [{ habitDefinitionId, date: "2026-05-24", status: "pending" }],
    });

    expect(summary.plan).toMatchObject({
      scheduled: 7,
      completed: 0,
      skipped: 0,
      missed: 6,
    });
    expect(summary.habits[0]).toMatchObject({
      scheduled: 7,
      completed: 0,
      missed: 6,
    });
  });

  it("continues required streaks through pending today but breaks on missed days", () => {
    const requiredHabitId = "a1000001-0000-4000-8000-000000000001";
    const habits = habitPlanPayloadSchema.parse({
      habits: [{ ...baseHabit, habitDefinitionId: requiredHabitId }],
    }).habits;

    const continuingSummary = computeHabitAdherenceSummary({
      habits,
      window: 7,
      windowEnd: "2026-05-24",
      completionRows: [
        { habitDefinitionId: requiredHabitId, date: "2026-05-24", status: "pending" },
        { habitDefinitionId: requiredHabitId, date: "2026-05-23", status: "completed" },
        { habitDefinitionId: requiredHabitId, date: "2026-05-22", status: "completed" },
      ],
    });

    const brokenSummary = computeHabitAdherenceSummary({
      habits,
      window: 7,
      windowEnd: "2026-05-24",
      completionRows: [
        { habitDefinitionId: requiredHabitId, date: "2026-05-24", status: "pending" },
        { habitDefinitionId: requiredHabitId, date: "2026-05-22", status: "completed" },
      ],
    });

    expect(continuingSummary.habits[0]?.currentStreak).toBe(2);
    expect(brokenSummary.habits[0]?.currentStreak).toBe(0);
  });

  it("counts weekday streaks only on scheduled days", () => {
    const weekdayHabitId = "a1000001-0000-4000-8000-000000000001";
    const habits = habitPlanPayloadSchema.parse({
      habits: [
        {
          ...baseHabit,
          habitDefinitionId: weekdayHabitId,
          schedule: { type: "selected_weekdays", daysOfWeek: [1, 3, 5] },
        },
      ],
    }).habits;

    const summary = computeHabitAdherenceSummary({
      habits,
      window: 7,
      windowEnd: "2026-05-22",
      completionRows: [
        { habitDefinitionId: weekdayHabitId, date: "2026-05-22", status: "pending" },
        { habitDefinitionId: weekdayHabitId, date: "2026-05-20", status: "completed" },
        { habitDefinitionId: weekdayHabitId, date: "2026-05-18", status: "completed" },
      ],
    });

    expect(summary.habits[0]).toMatchObject({
      scheduled: 3,
      completed: 2,
      currentStreak: 2,
    });
  });

  it("computes plan requiredCompletionRate from required habits only", () => {
    const requiredHabitId = "a1000001-0000-4000-8000-000000000001";
    const optionalHabitId = "b2000002-0000-4000-8000-000000000002";
    const habits = habitPlanPayloadSchema.parse({
      habits: [
        { ...baseHabit, habitDefinitionId: requiredHabitId, required: true, displayOrder: 0 },
        {
          ...baseHabit,
          habitDefinitionId: optionalHabitId,
          title: "Optional stretch",
          required: false,
          displayOrder: 1,
        },
      ],
    }).habits;

    const summary = computeHabitAdherenceSummary({
      habits,
      window: 7,
      windowEnd: "2026-05-24",
      completionRows: [
        { habitDefinitionId: requiredHabitId, date: "2026-05-24", status: "pending" },
        { habitDefinitionId: requiredHabitId, date: "2026-05-23", status: "completed" },
        { habitDefinitionId: requiredHabitId, date: "2026-05-22", status: "completed" },
        { habitDefinitionId: requiredHabitId, date: "2026-05-21", status: "completed" },
      ],
    });

    expect(summary.plan.requiredCompletionRate).toBeCloseTo(3 / 7, 4);
    expect(summary.habits.find((habit) => habit.habitDefinitionId === optionalHabitId)).toMatchObject({
      completed: 0,
      missed: 6,
      completionRate: 0,
    });
  });

  it("builds a compact coaching summary from adherence response", () => {
    const response = computeHabitAdherenceSummary({
      habits: habitPlanPayloadSchema.parse({ habits: [baseHabit] }).habits,
      window: 7,
      windowEnd: "2026-05-24",
      completionRows: [
        { habitDefinitionId, date: "2026-05-23", status: "completed" },
        { habitDefinitionId, date: "2026-05-22", status: "completed" },
      ],
    });

    const coachingSummary = summarizeHabitAdherenceForCoaching(response);

    expect(coachingSummary).toMatchObject({
      windowDays: 7,
      windowStart: "2026-05-18",
      windowEnd: "2026-05-24",
      habits: [
        expect.objectContaining({
          habitDefinitionId,
          title: "Morning hydration",
          currentStreak: 2,
        }),
      ],
    });
    expect(coachingSummary.requiredCompletionRate).toBeCloseTo(2 / 7, 4);
  });
});

describe("habit template schemas and guardrails", () => {
  const hydrationTemplateId = "d1000001-0000-4000-8000-000000000001";

  const hydrationTemplate = habitTemplateSchema.parse({
    id: hydrationTemplateId,
    slug: "daily-hydration",
    title: "Daily hydration",
    category: "hydration",
    defaultTarget: { type: "boolean" },
    targetConstraints: { allowedTargetTypes: ["boolean"] },
    defaultSchedule: { type: "daily" },
    linkedSourceHint: "nutrition_hydration_target",
    defaultRequired: true,
    defaultTimeOfDayHint: "morning",
    coachingNoteDefault: "Start with water.",
    source: "health_tracer_seed",
    status: "active",
    createdAt: "2026-05-22T12:00:00.000Z",
    updatedAt: "2026-05-22T12:00:00.000Z",
  });

  const walkTemplate = habitTemplateSchema.parse({
    id: "d1000001-0000-4000-8000-000000000002",
    slug: "daily-walk",
    title: "Daily walk",
    category: "movement",
    defaultTarget: { type: "duration_minutes", value: 20 },
    targetConstraints: {
      allowedTargetTypes: ["duration_minutes"],
      durationMinutesMin: 10,
      durationMinutesMax: 45,
    },
    defaultSchedule: { type: "daily" },
    linkedSourceHint: "workout_movement_context",
    defaultRequired: true,
    defaultTimeOfDayHint: "anytime",
    coachingNoteDefault: "A short walk supports movement.",
    source: "health_tracer_seed",
    status: "active",
    createdAt: "2026-05-22T12:00:00.000Z",
    updatedAt: "2026-05-22T12:00:00.000Z",
  });

  it("accepts optional template references on habit definitions", () => {
    const payload = habitPlanPayloadSchema.parse({
      habits: [
        {
          ...baseHabit,
          templateId: hydrationTemplateId,
          templateSlug: "daily-hydration",
          linkedSource: "nutrition_hydration_target",
        },
      ],
    });

    expect(payload.habits[0]?.templateId).toBe(hydrationTemplateId);
  });

  it("remains backward compatible when template references are omitted", () => {
    const payload = habitPlanPayloadSchema.parse({ habits: [baseHabit] });

    expect(payload.habits[0]?.templateId).toBeUndefined();
    expect(collectHabitTemplateReferences(payload)).toEqual({
      templateIds: [],
      templateSlugs: [],
    });
  });

  it("rejects unknown template ids and conflicting template usage", () => {
    const templatesById = new Map([[hydrationTemplate.id, hydrationTemplate]]);
    const templatesBySlug = new Map([[hydrationTemplate.slug, hydrationTemplate]]);

    const unknownIdErrors = getHabitTemplateUsageErrors(
      [
        {
          ...baseHabit,
          templateId: "d1000001-0000-4000-8000-000000000099",
        },
      ],
      templatesById,
      templatesBySlug,
    );

    expect(unknownIdErrors[0]).toMatch(/templateId/);
    expect(unknownIdErrors[0]).toMatch(/not found in the active habit template catalog/);

    const conflictErrors = getHabitTemplateUsageErrors(
      [
        {
          ...baseHabit,
          templateId: hydrationTemplateId,
          templateSlug: walkTemplate.slug,
          linkedSource: "nutrition_hydration_target",
        },
      ],
      templatesById,
      new Map([[walkTemplate.slug, walkTemplate]]),
    );

    expect(conflictErrors).toContain(
      'habits: "Morning hydration" templateId and templateSlug refer to different habit templates.',
    );
  });

  it("enforces hydration and movement template linkage and target constraints", () => {
    const templatesById = new Map([
      [hydrationTemplate.id, hydrationTemplate],
      [walkTemplate.id, walkTemplate],
    ]);
    const templatesBySlug = new Map([
      [hydrationTemplate.slug, hydrationTemplate],
      [walkTemplate.slug, walkTemplate],
    ]);

    const hydrationErrors = getHabitTemplateUsageErrors(
      [
        {
          ...baseHabit,
          templateSlug: "daily-hydration",
          linkedSource: undefined,
        },
      ],
      templatesById,
      templatesBySlug,
    );

    expect(hydrationErrors).toContain(
      'habits: "Morning hydration" must set linkedSource "nutrition_hydration_target" when using template "daily-hydration".',
    );

    const walkErrors = getHabitTemplateUsageErrors(
      [
        {
          ...baseHabit,
          habitDefinitionId: "b2000002-0000-4000-8000-000000000002",
          title: "Daily walk",
          category: "movement",
          templateSlug: "daily-walk",
          linkedSource: "workout_movement_context",
          target: { type: "duration_minutes", value: 5 },
          displayOrder: 1,
        },
      ],
      templatesById,
      templatesBySlug,
    );

    expect(walkErrors).toContain(
      'habits: "Daily walk" duration target is below the allowed template minimum.',
    );
  });
});

describe("habit proposal intent plumbing", () => {
  it("includes create_habit_plan and adapt_habit_plan intents", () => {
    expect(proposalIntentSchema.options).toEqual(
      expect.arrayContaining(["create_habit_plan", "adapt_habit_plan"]),
    );
  });

  it("parses raw AI proposals for habit plan intents", () => {
    const proposal = rawAiProposalSchema.parse({
      intent: "create_habit_plan",
      targetDomain: "general",
      title: "Start a hydration habit",
      reason: "Build a simple daily hydration prompt.",
      proposedChanges: { habits: [baseHabit] },
    });

    expect(proposal.intent).toBe("create_habit_plan");
    expect(proposal.proposedChanges).toEqual({ habits: [baseHabit] });
  });

  it("parses adapt_habit_plan raw AI proposals", () => {
    const proposal = rawAiProposalSchema.parse({
      intent: "adapt_habit_plan",
      targetDomain: "general",
      title: "Adjust hydration target",
      reason: "User prefers a smaller count target.",
      proposedChanges: { habits: [baseHabit] },
    });

    expect(proposal.intent).toBe("adapt_habit_plan");
  });

  it("routes habit intents to habitPlanPayloadSchema", () => {
    for (const intent of ["create_habit_plan", "adapt_habit_plan"] as const) {
      expect(getProposedChangesSchemaForIntent(intent)).toBe(habitPlanPayloadSchema);
    }
  });

  it("rejects persisted habit proposals with invalid proposedChanges shape", () => {
    const result = aiProposalSchema.safeParse({
      id: "14a08176-64a7-4a2d-8a44-581807368394",
      userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
      threadId: "24b19287-75b8-4a3e-9c10-691908479405",
      sourceMessageId: null,
      intent: "create_habit_plan",
      targetDomain: "general",
      title: "Start habits",
      reason: "Build consistency.",
      proposedChanges: { habits: [{ title: "Missing fields" }] },
      status: "pending",
      validationStatus: "valid",
      validationErrors: [],
      userDecisionAt: null,
      appliedReference: null,
      createdAt: "2026-05-22T12:00:00.000Z",
      updatedAt: "2026-05-22T12:00:00.000Z",
    });

    expect(result.success).toBe(false);
  });

  it("accepts persisted create_habit_plan proposals with valid habit payloads", () => {
    const result = aiProposalSchema.safeParse({
      id: "14a08176-64a7-4a2d-8a44-581807368394",
      userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
      threadId: "24b19287-75b8-4a3e-9c10-691908479405",
      sourceMessageId: null,
      intent: "create_habit_plan",
      targetDomain: "general",
      title: "Start habits",
      reason: "Build consistency.",
      proposedChanges: { habits: [baseHabit] },
      status: "pending",
      validationStatus: "valid",
      validationErrors: [],
      userDecisionAt: null,
      appliedReference: null,
      createdAt: "2026-05-22T12:00:00.000Z",
      updatedAt: "2026-05-22T12:00:00.000Z",
    });

    expect(result.success).toBe(true);
  });
});
