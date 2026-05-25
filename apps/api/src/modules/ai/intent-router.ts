import type { AgentIntent, AgentSafetyFlag, IntentRouteResult } from "@health/types";
import {
  buildContextSliceRequestForIntent,
  INTENT_TO_SLICE_PURPOSE,
  isWeeklyReviewChatMessage,
  resolveDefaultDepthForPurpose,
  resolveDefaultExpectedResponseMode,
  resolveDefaultTimeRangeForPurpose,
  RULE_ROUTE_CONFIDENCE_THRESHOLD,
} from "@health/types";

export function routeAgentIntent(userMessage: string): IntentRouteResult {
  const normalized = userMessage.trim().toLowerCase();
  const classification = classifyIntentWithConfidence(normalized, userMessage);
  const purpose = INTENT_TO_SLICE_PURPOSE[classification.intent];
  const depth = resolveDefaultDepthForPurpose(purpose);
  const timeRange = resolveDefaultTimeRangeForPurpose(purpose);
  const includeDocuments = classification.intent === "ask_health_context";
  const safetyFlags = detectSafetyFlags(normalized);
  const isAmbiguous = isAmbiguousMessage(normalized, classification.intent);
  const confidence = isAmbiguous
    ? Math.min(classification.confidence, 0.55)
    : classification.confidence;
  const isConfident = confidence >= RULE_ROUTE_CONFIDENCE_THRESHOLD && !isAmbiguous;

  return {
    intent: classification.intent,
    confidence,
    isConfident,
    purpose,
    depth,
    timeRange,
    includeDocuments,
    routingMethod: "rule_based",
    requiredContextSlices: [
      buildContextSliceRequestForIntent(classification.intent, {
        depth,
        timeRange,
        includeDocuments,
      }),
    ],
    safetyFlags,
    expectedResponseMode: resolveDefaultExpectedResponseMode(classification.intent),
  };
}

interface IntentClassification {
  intent: AgentIntent;
  confidence: number;
}

function classifyIntentWithConfidence(
  normalized: string,
  originalMessage: string,
): IntentClassification {
  if (isWeeklyReviewChatMessage(originalMessage)) {
    return { intent: "review_progress", confidence: 0.95 };
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
    return { intent: "ask_health_context", confidence: 0.94 };
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
    return { intent: "longevity_overview", confidence: 0.9 };
  }

  if (matchesAny(normalized, WORKOUT_ADAPTATION_PHRASES)) {
    return { intent: "adjust_workout", confidence: 0.92 };
  }

  if (isNutritionPrimaryAsk(normalized)) {
    return { intent: "adjust_nutrition", confidence: 0.9 };
  }

  if (matchesAny(normalized, WORKOUT_CONTEXT_PHRASES)) {
    return { intent: "adjust_workout", confidence: 0.82 };
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
    return { intent: "ask_about_today", confidence: 0.88 };
  }

  if (matchesAny(normalized, NUTRITION_TOPIC_PHRASES)) {
    return { intent: "adjust_nutrition", confidence: 0.84 };
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
    return { intent: "review_progress", confidence: 0.93 };
  }

  return { intent: "general", confidence: 0.4 };
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

const AMBIGUOUS_PHRASES = [
  "feel off",
  "completely off",
  "not working",
  "not seeing results",
  "routine is not",
  "what should i do",
  "tired and hungry",
  "tired all the time",
  "feel tired and hungry",
  "чувствую себя плохо",
  "не работает",
  "не вижу результат",
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

function isAmbiguousMessage(normalized: string, intent: AgentIntent): boolean {
  if (intent === "general") {
    return true;
  }

  if (matchesAny(normalized, AMBIGUOUS_PHRASES)) {
    return true;
  }

  const workoutMatch = matchesAny(normalized, [
    ...WORKOUT_ADAPTATION_PHRASES,
    ...WORKOUT_CONTEXT_PHRASES,
  ]);
  const nutritionMatch = matchesAny(normalized, NUTRITION_TOPIC_PHRASES);

  return workoutMatch && nutritionMatch;
}

function detectSafetyFlags(normalized: string): AgentSafetyFlag[] {
  const flags = new Set<AgentSafetyFlag>();

  if (matchesAny(normalized, ["tired", "fatigue", "sleep", "slept badly", "устал", "сон"])) {
    flags.add("fatigue");
    flags.add("sleep_issue");
  }

  if (matchesAny(normalized, ["pain", "hurt", "sore", "боль", "болит"])) {
    flags.add("pain");
  }

  if (matchesAny(normalized, ["stress", "anxious", "overwhelmed", "стресс"])) {
    flags.add("stress");
  }

  if (matchesAny(normalized, ["hungry", "hunger", "голод"])) {
    flags.add("hunger");
  }

  if (
    matchesAny(normalized, [
      "no time",
      "busy",
      "schedule",
      "conflict",
      "нет времени",
      "занят",
    ])
  ) {
    flags.add("schedule_conflict");
  }

  if (
    matchesAny(normalized, [
      "blood test",
      "lab result",
      "medical",
      "symptom",
      "анализ",
      "медицин",
      "симптом",
    ])
  ) {
    flags.add("health_context");
  }

  return [...flags];
}

function matchesAny(text: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase));
}
