import type { AgentIntent, IntentRouteResult } from "@health/types";
import {
  INTENT_TO_SLICE_PURPOSE,
  isWeeklyReviewChatMessage,
  resolveDefaultDepthForPurpose,
  resolveDefaultTimeRangeForPurpose,
} from "@health/types";

export function routeAgentIntent(userMessage: string): IntentRouteResult {
  const normalized = userMessage.trim().toLowerCase();

  const intent = classifyIntent(normalized, userMessage);
  const purpose = INTENT_TO_SLICE_PURPOSE[intent];

  return {
    intent,
    purpose,
    depth: resolveDefaultDepthForPurpose(purpose),
    timeRange: resolveDefaultTimeRangeForPurpose(purpose),
    includeDocuments: intent === "ask_health_context",
    routingMethod: "rule_based",
  };
}

function classifyIntent(normalized: string, originalMessage: string): AgentIntent {
  if (isWeeklyReviewChatMessage(originalMessage)) {
    return "review_progress";
  }

  if (
    matchesAny(normalized, [
      "blood test",
      "lab result",
      "medical report",
      "health document",
      "doctor note",
      "consider my report",
      "my symptoms",
      "medical background",
      "анализ крови",
      "анализы",
      "лаборатор",
      "медицинск",
      "документ",
      "симптом",
    ])
  ) {
    return "ask_health_context";
  }

  if (
    matchesAny(normalized, [
      "longevity",
      "long-term health",
      "long term health",
      "life expectancy",
      "aging well",
      "healthspan",
      "долголет",
      "долгосрочн",
      "здоровье в будущем",
    ])
  ) {
    return "longevity_overview";
  }

  if (matchesAny(normalized, WORKOUT_ADAPTATION_PHRASES)) {
    return "adjust_workout";
  }

  if (isNutritionPrimaryAsk(normalized)) {
    return "adjust_nutrition";
  }

  if (matchesAny(normalized, WORKOUT_CONTEXT_PHRASES)) {
    return "adjust_workout";
  }

  if (
    matchesAny(normalized, [
      "check in",
      "check-in",
      "how am i doing today",
      "what should i do today",
      "this morning",
      "что делать сегодня",
      "сегодня",
      "как я сегодня",
      "чекап",
      "чек-ин",
    ]) ||
    normalized === "today"
  ) {
    return "ask_about_today";
  }

  if (matchesAny(normalized, NUTRITION_TOPIC_PHRASES)) {
    return "adjust_nutrition";
  }

  if (
    matchesAny(normalized, [
      "weekly summary",
      "weekly progress",
      "how was my week",
      "review my week",
      "week in review",
      "обзор недели",
      "итоги недели",
      "прогресс за неделю",
      "как прошла неделя",
    ])
  ) {
    return "review_progress";
  }

  return "general";
}

const WORKOUT_ADAPTATION_PHRASES = [
  "should i train",
  "skip gym",
  "reduce intensity",
  "feel tired",
  "fatigue",
  "sore",
  "adapt my program",
  "adapt my plan",
  "train today",
  "стоит ли тренироваться",
  "пропустить тренировку",
  "снизить интенсивность",
  "устал",
  "усталость",
  "болят мышцы",
  "адаптируй программу",
  "адаптируй план",
  "тренироваться сегодня",
] as const;

const WORKOUT_CONTEXT_PHRASES = [
  "workout",
  "training",
  "gym",
  "трениров",
  "силов",
  "упражнен",
  "зал",
  "спортзал",
] as const;

const NUTRITION_PRIMARY_PHRASES = [
  "protein",
  "calorie",
  "calories",
  "macro",
  "macros",
  "meal",
  "what should i eat",
  "food plan",
  "nutrition",
  "diet",
  "питани",
  "рацион",
  "калори",
  "ккал",
  "белок",
  "белки",
  "протеин",
  "макро",
  "углевод",
  "жир",
  "прием пищи",
  "приём пищи",
  "еда",
  "есть",
  "поесть",
  "диета",
] as const;

const NUTRITION_TOPIC_PHRASES = [
  ...NUTRITION_PRIMARY_PHRASES,
  "food",
  "план питания",
] as const;

function isNutritionPrimaryAsk(normalized: string): boolean {
  if (matchesAny(normalized, NUTRITION_PRIMARY_PHRASES)) {
    return true;
  }

  return (
    normalized.includes(" eat") ||
    normalized.startsWith("eat ") ||
    normalized.includes("eating")
  );
}

function matchesAny(text: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase));
}
