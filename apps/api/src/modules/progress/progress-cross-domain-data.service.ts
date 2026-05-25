import type {
  DailyChecklistSnapshot,
  HabitCompletionSnapshot,
  HabitsProgressAggregate,
  NutritionAdherenceSnapshot,
  NutritionProgressAggregate,
  NutritionTargetCompletion,
  RecipesProgressAggregate,
  TodayChecklistItem,
  TodayProgressAggregate,
} from "@health/types";
import {
  aggregateHabitsProgressWeek,
  aggregateNutritionAdherenceWeek,
  aggregateRecipesActivityWeek,
  aggregateTodayChecklists,
  getTodayIsoDateInTimezone,
  habitPlanPayloadSchema,
  habitScheduleMatchesDate,
  nutritionTargetCompletionSchema,
  resolveHabitAdherenceOutcome,
  shiftIsoDate,
  todayChecklistItemSchema,
} from "@health/types";
import { Injectable } from "@nestjs/common";
import { HabitsRepository } from "../habits/habits.repository.js";
import { NutritionRepository } from "../nutrition/nutrition.repository.js";
import { RecipesRepository } from "../recipes/recipes.repository.js";
import { TodayRepository } from "../today/today.repository.js";

@Injectable()
export class ProgressCrossDomainDataService {
  constructor(
    private readonly todayRepository: TodayRepository,
    private readonly nutritionRepository: NutritionRepository,
    private readonly habitsRepository: HabitsRepository,
    private readonly recipesRepository: RecipesRepository,
  ) {}

  async buildTodayAggregate(
    userId: string,
    weekStart: string,
    weekEnd: string,
  ): Promise<TodayProgressAggregate> {
    const rows = await this.todayRepository.listByUserAndDateRange(userId, weekStart, weekEnd);
    const checklists: DailyChecklistSnapshot[] = rows.map((row) => ({
      date: row.date,
      items: parseChecklistItems(row.items),
    }));

    return aggregateTodayChecklists(checklists);
  }

  async buildNutritionAggregate(
    userId: string,
    weekStart: string,
    weekEnd: string,
  ): Promise<NutritionProgressAggregate> {
    const plan = await this.nutritionRepository.findActivePlanByUserId(userId);
    const adherenceRows = await this.nutritionRepository.listAdherenceByUserAndDateRange(
      userId,
      weekStart,
      weekEnd,
    );

    const snapshots: NutritionAdherenceSnapshot[] = adherenceRows.map((row) => ({
      date: row.date,
      targetCompletion: parseTargetCompletion(row.targetCompletion),
      mealCompletionCount: Array.isArray(row.mealCompletion) ? row.mealCompletion.length : 0,
    }));

    return aggregateNutritionAdherenceWeek({
      hasActivePlan: Boolean(plan?.activeRevisionId),
      adherenceRows: snapshots,
    });
  }

  async buildHabitsAggregate(
    userId: string,
    timezone: string,
    weekStart: string,
    weekEnd: string,
  ): Promise<HabitsProgressAggregate> {
    const plan = await this.habitsRepository.findActivePlanByUserId(userId);

    if (!plan?.activeRevisionId) {
      return aggregateHabitsProgressWeek({
        activeHabitCount: 0,
        completionRows: [],
      });
    }

    const activeRevision = await this.habitsRepository.findActiveRevisionByPlanId(
      plan.id,
      plan.activeRevisionId,
    );
    const parsedPayload = habitPlanPayloadSchema.safeParse(activeRevision?.payload);

    if (!parsedPayload.success) {
      return aggregateHabitsProgressWeek({
        activeHabitCount: 0,
        completionRows: [],
      });
    }

    const completionRows = await this.habitsRepository.listCompletionsInDateRange(
      userId,
      weekStart,
      weekEnd,
    );
    const windowEnd = getTodayIsoDateInTimezone(timezone);
    const completionByKey = new Map(
      completionRows.map((row) => [`${row.habitDefinitionId}:${row.date}`, row.status]),
    );
    const activeHabits = parsedPayload.data.habits.filter((habit) => habit.status === "active");
    const snapshots: HabitCompletionSnapshot[] = [];

    for (let offset = 0; offset < 7; offset += 1) {
      const date = shiftIsoDate(weekStart, offset);

      if (date > weekEnd) {
        break;
      }

      for (const habit of activeHabits) {
        if (!habitScheduleMatchesDate(habit, date)) {
          continue;
        }

        const rawStatus = completionByKey.get(`${habit.habitDefinitionId}:${date}`) as
          | "completed"
          | "skipped"
          | "pending"
          | undefined;

        snapshots.push({
          habitDefinitionId: habit.habitDefinitionId,
          date,
          status: resolveHabitAdherenceOutcome(rawStatus, date, windowEnd),
        });
      }
    }

    return aggregateHabitsProgressWeek({
      activeHabitCount: activeHabits.length,
      completionRows: snapshots,
    });
  }

  async buildRecipesAggregate(
    userId: string,
    weekStart: string,
    weekEnd: string,
  ): Promise<RecipesProgressAggregate> {
    const counts = await this.recipesRepository.countWeeklyActivityByUserId(
      userId,
      weekStart,
      weekEnd,
    );

    return aggregateRecipesActivityWeek(counts);
  }
}

function parseChecklistItems(value: unknown): TodayChecklistItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const parsed = todayChecklistItemSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

function parseTargetCompletion(value: unknown): NutritionTargetCompletion {
  const parsed = nutritionTargetCompletionSchema.safeParse(value);

  if (parsed.success) {
    return parsed.data;
  }

  return {
    caloriesOnTarget: null,
    proteinOnTarget: null,
    carbsOnTarget: null,
    fatOnTarget: null,
  };
}
