import type {
  HabitDefinition,
  HabitPlanCoachingSummary,
  HabitPlanPayload,
  HabitTarget,
} from "@health/types";

const STUB_HABIT_IDS = {
  hydration: "c1000001-0000-4000-8000-000000000001",
  walk: "c1000002-0000-4000-8000-000000000002",
  mindfulness: "c1000003-0000-4000-8000-000000000003",
} as const;

export const stubCreateHabitPlan: HabitPlanPayload = {
  habits: [
    {
      habitDefinitionId: STUB_HABIT_IDS.hydration,
      title: "Morning hydration",
      category: "hydration",
      status: "active",
      schedule: { type: "daily" },
      target: { type: "boolean" },
      required: true,
      timeOfDayHint: "morning",
      linkedSource: "nutrition_hydration_target",
      coachingNote: "Start the day with a glass of water to build consistency.",
      displayOrder: 0,
    },
    {
      habitDefinitionId: STUB_HABIT_IDS.walk,
      title: "Daily walk",
      category: "movement",
      status: "active",
      schedule: { type: "daily" },
      target: { type: "duration_minutes", value: 20 },
      required: true,
      timeOfDayHint: "anytime",
      linkedSource: "workout_movement_context",
      coachingNote: "A short walk supports overall movement without replacing workouts.",
      displayOrder: 1,
    },
    {
      habitDefinitionId: STUB_HABIT_IDS.mindfulness,
      title: "Evening breathing practice",
      category: "mindfulness",
      status: "active",
      schedule: { type: "daily" },
      target: { type: "duration_minutes", value: 5 },
      required: false,
      timeOfDayHint: "evening",
      coachingNote: "A brief breathing practice can support wind-down routines.",
      displayOrder: 2,
    },
  ],
};

function rebuildTargetFromSummary(
  targetType: HabitTarget["type"],
  targetValue?: number,
  targetUnit?: string,
): HabitTarget {
  switch (targetType) {
    case "boolean":
      return { type: "boolean" };
    case "count":
      return {
        type: "count",
        value: targetValue ?? 1,
        unit: targetUnit,
      };
    case "duration_minutes":
      return {
        type: "duration_minutes",
        value: targetValue ?? 10,
      };
    case "numeric":
      return {
        type: "numeric",
        value: targetValue ?? 1,
        unit: targetUnit,
      };
  }
}

function habitFromCoachingSummary(
  summary: HabitPlanCoachingSummary["habits"][number],
): HabitDefinition {
  const schedule =
    summary.scheduleType === "selected_weekdays"
      ? {
          type: "selected_weekdays" as const,
          daysOfWeek: summary.daysOfWeek ?? [1, 3, 5],
        }
      : { type: "daily" as const };

  return {
    habitDefinitionId: summary.habitDefinitionId,
    title: summary.title,
    category: summary.category,
    status: summary.status,
    schedule,
    target: rebuildTargetFromSummary(
      summary.targetType,
      summary.targetValue,
      summary.targetUnit,
    ),
    required: summary.required,
    timeOfDayHint: summary.timeOfDayHint,
    linkedSource: summary.linkedSource,
    displayOrder: summary.displayOrder,
  };
}

function resolveBaseHabits(coachingContext: Record<string, unknown>): HabitDefinition[] {
  const activePlan = coachingContext.activeHabitPlan as HabitPlanCoachingSummary | null | undefined;

  if (activePlan?.habits?.length) {
    return activePlan.habits.map(habitFromCoachingSummary);
  }

  return stubCreateHabitPlan.habits.map((habit) => ({ ...habit }));
}

function findOptionalMindfulnessHabit(habits: HabitDefinition[]): HabitDefinition | undefined {
  return habits.find(
    (habit) =>
      habit.category === "mindfulness" ||
      habit.title.toLowerCase().includes("breathing"),
  );
}

function findMovementHabit(habits: HabitDefinition[]): HabitDefinition | undefined {
  return habits.find((habit) => habit.category === "movement");
}

export function stubAdaptHabitPlan(
  normalizedMessage: string,
  coachingContext: Record<string, unknown>,
): HabitPlanPayload {
  const baseHabits = resolveBaseHabits(coachingContext);

  if (normalizedMessage.includes("remove") || normalizedMessage.includes("drop")) {
    const target = findOptionalMindfulnessHabit(baseHabits) ?? baseHabits.at(-1);

    return {
      habits: baseHabits.map((habit) =>
        habit.habitDefinitionId === target?.habitDefinitionId
          ? { ...habit, status: "removed" as const }
          : habit,
      ),
    };
  }

  if (normalizedMessage.includes("pause")) {
    const target = findOptionalMindfulnessHabit(baseHabits) ?? baseHabits.at(-1);

    return {
      habits: baseHabits.map((habit) =>
        habit.habitDefinitionId === target?.habitDefinitionId
          ? { ...habit, status: "paused" as const }
          : habit,
      ),
    };
  }

  const movementHabit = findMovementHabit(baseHabits);

  return {
    habits: baseHabits.map((habit) => {
      if (habit.habitDefinitionId !== movementHabit?.habitDefinitionId) {
        return habit;
      }

      const currentValue =
        habit.target.type === "duration_minutes" ? habit.target.value : 20;
      const nextValue = normalizedMessage.includes("easier") || normalizedMessage.includes("lighter")
        ? Math.max(10, currentValue - 5)
        : Math.max(10, currentValue - 5);

      return {
        ...habit,
        target: { type: "duration_minutes" as const, value: nextValue },
        coachingNote: "A slightly shorter walk can help you stay consistent on busy days.",
      };
    }),
  };
}

export function hasActiveHabitPlanInContext(
  coachingContext: Record<string, unknown>,
): boolean {
  const activePlan = coachingContext.activeHabitPlan as HabitPlanCoachingSummary | null | undefined;

  return Boolean(activePlan?.habits?.length);
}

export function isHabitRelatedMessage(normalizedMessage: string): boolean {
  return (
    normalizedMessage.includes("habit") ||
    normalizedMessage.includes("streak") ||
    normalizedMessage.includes("daily routine")
  );
}

export function isHabitAdaptCue(normalizedMessage: string): boolean {
  return (
    normalizedMessage.includes("adjust") ||
    normalizedMessage.includes("adapt") ||
    normalizedMessage.includes("change") ||
    normalizedMessage.includes("remove") ||
    normalizedMessage.includes("pause") ||
    normalizedMessage.includes("modify") ||
    normalizedMessage.includes("update") ||
    normalizedMessage.includes("drop") ||
    normalizedMessage.includes("lighter") ||
    normalizedMessage.includes("easier")
  );
}
