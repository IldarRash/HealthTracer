import type { DirectChatPathKind, DirectChatPathRefreshHint } from "./direct-chat-path.js";

export type RegexPatternRuleInput = {
  source: string;
  flags: string;
};

export type DirectPathsSharedPatternsConfig = {
  adviceOrImplicitMutation: RegexPatternRuleInput;
  workoutCompletionCommandHint: RegexPatternRuleInput;
};

export type DirectPathKindMatcherConfig = {
  kind: DirectChatPathKind;
  refreshHintsOnExecuted: DirectChatPathRefreshHint[];
  matchPatterns: RegexPatternRuleInput[];
  negativePatterns: RegexPatternRuleInput[];
  requireTodayMention?: boolean;
  todayMentionPatterns?: RegexPatternRuleInput[];
  requireWorkoutLexeme?: boolean;
  workoutLexemePattern?: string;
};

export type DefaultDirectPathsPatternConfig = {
  sharedPatterns: DirectPathsSharedPatternsConfig;
  detectionOrder: DirectChatPathKind[];
  kinds: DirectPathKindMatcherConfig[];
};

const APOSTROPHE = "['\u2019]";

function pattern(source: string, flags = "i"): { source: string; flags: string } {
  return { source, flags };
}

export const DEFAULT_DIRECT_PATH_SHARED_PATTERNS: DirectPathsSharedPatternsConfig = {
  adviceOrImplicitMutation: pattern(
    "\\b(?:should|could|would|can i|do i|shall i|worth it|recommend|suggest|advise|easier|harder|adapt|adjust|change|modify|update|create|build|make my|make the)\\b",
  ),
  workoutCompletionCommandHint: pattern(
    `\\b(?:mark|set|check off|log|complete|finish)\\s+(?:today(?:${APOSTROPHE}s|s)?\\s+)?(?:my\\s+)?(?:workout|training)\\b`,
  ),
};

const WORKOUT_MATCH_PATTERNS = [
  pattern(
    `\\b(?:mark|set|check off|log)\\s+(?:today(?:${APOSTROPHE}s|s)?\\s+)?(?:my\\s+)?(?:workout|training)\\s+(?:as\\s+)?(?:done|complete|completed|finished)\\b`,
  ),
  pattern(
    `\\b(?:mark|set|check off|log)\\s+(?:my\\s+)?(?:today(?:${APOSTROPHE}s|s)?\\s+)?(?:workout|training)\\s+(?:as\\s+)?(?:done|complete|completed|finished)\\b`,
  ),
  pattern(
    `\\bcheck off\\s+(?:today(?:${APOSTROPHE}s|s)?\\s+)?(?:my\\s+)?(?:workout|training)\\b`,
  ),
  pattern(
    `\\b(?:complete|finish)\\s+(?:today(?:${APOSTROPHE}s|s)?\\s+)?(?:my\\s+)?(?:workout|training)\\b`,
  ),
  pattern(
    `\\b(?:complete|finish)\\s+(?:my\\s+)?(?:today(?:${APOSTROPHE}s|s)?\\s+)?(?:workout|training)\\b`,
  ),
  pattern("(?:отмет|заверш|сделай).*(?:тренировк|workout).*(?:выполн|done|complete|готов)"),
];

const TODAY_SUMMARY_MATCH_PATTERNS = [
  pattern(`^what(?:${APOSTROPHE}s| is)\\s+today\\s*\\??$`),
  pattern(
    `^what(?:${APOSTROPHE}s| is)\\s+(?:my\\s+)?today(?:${APOSTROPHE}s|s)?(?:\\s+(?:plan|summary|checklist))?\\s*\\??$`,
  ),
  pattern(
    `^what(?:${APOSTROPHE}s| is)\\s+(?:my\\s+)?(?:plan|schedule|agenda)\\s+(?:for\\s+)?today\\s*\\??$`,
  ),
  pattern(
    `^what(?:${APOSTROPHE}s| is)\\s+(?:on\\s+)?(?:my\\s+)?(?:plan|schedule|agenda)\\s+(?:for\\s+)?today\\s*\\??$`,
  ),
  pattern(
    `^(?:show|tell)\\s+(?:me\\s+)?(?:my\\s+)?today(?:${APOSTROPHE}s|s)?(?:\\s+(?:plan|summary|checklist))?\\s*\\??$`,
  ),
  pattern(
    `^(?:show|tell)\\s+(?:me\\s+)?(?:my\\s+)?(?:plan|summary|checklist)\\s+(?:for\\s+)?today\\s*\\??$`,
  ),
  pattern(`^today(?:${APOSTROPHE}s|s)?\\s+(?:plan|summary|checklist)\\s*\\??$`),
  pattern("^summ(?:ary|arise)\\s+(?:for\\s+)?today\\s*\\??$"),
  pattern("^что\\s+(?:у меня\\s+)?(?:на\\s+)?сегодня\\s*\\??$"),
  pattern("^(?:покажи|расскажи)\\s+(?:мой\\s+)?(?:план|расписание)\\s+(?:на\\s+)?сегодня\\s*\\??$"),
  pattern("^план\\s+на\\s+сегодня\\s*\\??$"),
];

const NUTRITION_PLAN_MATCH_PATTERNS = [
  pattern(`^what(?:${APOSTROPHE}s| is)\\s+(?:in\\s+)?(?:my\\s+)?(?:nutrition|meal|diet)\\s+plan\\s*\\??$`),
  pattern("^show\\s+(?:me\\s+)?(?:my\\s+)?(?:nutrition|meal|diet)\\s+plan\\s*\\??$"),
  pattern("^(?:my\\s+)?(?:nutrition|meal|diet)\\s+plan\\s*\\??$"),
  pattern("^что\\s+(?:в\\s+)?(?:мо[её]м?|у меня)\\s+план(?:е)?\\s+питани(?:я|е)\\s*\\??$"),
  pattern("^покажи\\s+(?:мой\\s+)?план\\s+питани(?:я|е)\\s*\\??$"),
  pattern("^(?:мой\\s+)?план\\s+питани(?:я|е)\\s*\\??$"),
];

const WEEKLY_PROGRESS_MATCH_PATTERNS = [
  pattern("^(?:show\\s+(?:me\\s+)?)?(?:my\\s+)?weekly\\s+progress\\s*\\??$"),
  pattern("^(?:show\\s+(?:me\\s+)?)?(?:my\\s+)?progress\\s+(?:for\\s+|of\\s+)?(?:this|the)\\s+week\\s*\\??$"),
  pattern("^how\\s+(?:was|did)\\s+(?:my|the)\\s+week(?:\\s+go)?\\s*\\??$"),
  pattern("^(?:покажи\\s+)?(?:мой\\s+)?прогресс\\s+за\\s+(?:эту\\s+|последнюю\\s+)?неделю\\s*\\??$"),
  pattern("^как\\s+прошла\\s+(?:моя\\s+)?неделя\\s*\\??$"),
  pattern("^(?:мой\\s+)?недельный\\s+прогресс\\s*\\??$"),
];

const WEEKLY_PROGRESS_ANALYTIC_NEGATIVE_EN = pattern(
  "\\b(?:analy[sz]e|analysis|review|why|improve|compare|advice)\\b",
);

const WEEKLY_PROGRESS_ANALYTIC_NEGATIVE_RU = pattern(
  "(?:проанализ|анализ|разбор|разбер|почему|повлиял|не так|улучш|сравн|посовет)",
);

const WEEKLY_PROGRESS_LONG_LOOKBACK_NEGATIVE = pattern(
  "\\b(?:month|months|monthly|quarter|year|all[- ]?time|history)\\b" +
    "|месяц|квартал|полгода|пол года|за год|за вс[её] время|истори",
);

const WORKOUT_PLAN_MATCH_PATTERNS = [
  pattern(`^what(?:${APOSTROPHE}s| is)\\s+(?:in\\s+)?(?:my\\s+)?(?:workout|training)\\s+plan\\s*\\??$`),
  pattern("^show\\s+(?:me\\s+)?(?:my\\s+)?(?:workout|training)\\s+plan\\s*\\??$"),
  pattern("^(?:my\\s+)?(?:workout|training)\\s+plan\\s*\\??$"),
  pattern("^что\\s+(?:в\\s+)?(?:мо[её]м?|у меня)\\s+план(?:е)?\\s+тренировок\\s*\\??$"),
  pattern("^покажи\\s+(?:мой\\s+)?план\\s+тренировок\\s*\\??$"),
  pattern("^(?:мой\\s+)?план\\s+тренировок\\s*\\??$"),
];

// Only verbs NOT already covered by shared.adviceOrImplicitMutation (which is always applied).
const WORKOUT_PLAN_MUTATION_NEGATIVE_EN = pattern(
  "\\b(?:add|remove|edit|improve|make)\\b",
);

const WORKOUT_PLAN_MUTATION_NEGATIVE_RU = pattern(
  "(?:созда|сдела|измени|адаптир|улучш|поменя|обнов|порекоменд|посовет)",
);

export const DEFAULT_DIRECT_PATH_DETECTION_ORDER: readonly DirectChatPathKind[] = [
  "mark_today_workout_done",
  "today_summary_read",
  "nutrition_plan_read",
  "weekly_progress_read",
  "workout_plan_read",
];

export function buildDefaultDirectPathKindMatchers(): DirectPathKindMatcherConfig[] {
  const shared = DEFAULT_DIRECT_PATH_SHARED_PATTERNS;

  return [
    {
      kind: "mark_today_workout_done",
      refreshHintsOnExecuted: ["today", "dashboard", "longevity"],
      matchPatterns: WORKOUT_MATCH_PATTERNS,
      negativePatterns: [
        // adviceOrImplicitMutation already covers should/could/would/can i/do i/shall i
        shared.adviceOrImplicitMutation,
        pattern("\\?\\s*$"),
        pattern("\\b(?:i\\s+)?(?:finished|completed|did)\\s+(?:my\\s+)?(?:workout|training)\\b"),
      ],
      requireWorkoutLexeme: true,
      workoutLexemePattern: "(?:\\b(?:workout|training)\\b|трениров)",
    },
    {
      kind: "today_summary_read",
      refreshHintsOnExecuted: ["today"],
      matchPatterns: TODAY_SUMMARY_MATCH_PATTERNS,
      negativePatterns: [
        // adviceOrImplicitMutation already covers should/could/would/can i/do i/shall i
        shared.adviceOrImplicitMutation,
        shared.workoutCompletionCommandHint!,
      ],
      requireTodayMention: true,
      todayMentionPatterns: [pattern("\\btoday\\b"), pattern("сегодня")],
    },
    {
      kind: "nutrition_plan_read",
      refreshHintsOnExecuted: [],
      matchPatterns: NUTRITION_PLAN_MATCH_PATTERNS,
      negativePatterns: [
        // adviceOrImplicitMutation already covers should/could/would/can i/do i/shall i
        shared.adviceOrImplicitMutation,
        // Only verbs NOT already covered by shared.adviceOrImplicitMutation.
        pattern("\\b(?:add|remove|edit)\\b"),
      ],
    },
    {
      kind: "weekly_progress_read",
      refreshHintsOnExecuted: [],
      matchPatterns: WEEKLY_PROGRESS_MATCH_PATTERNS,
      negativePatterns: [
        // adviceOrImplicitMutation already covers should/could/would/can i/do i/shall i
        shared.adviceOrImplicitMutation,
        // Analytic/advice phrasing must fall through to the LLM fan-out.
        WEEKLY_PROGRESS_ANALYTIC_NEGATIVE_EN,
        WEEKLY_PROGRESS_ANALYTIC_NEGATIVE_RU,
        // Longer-than-week lookbacks fall through to the fan-out (Tier 2 review path).
        WEEKLY_PROGRESS_LONG_LOOKBACK_NEGATIVE,
      ],
    },
    {
      kind: "workout_plan_read",
      refreshHintsOnExecuted: [],
      matchPatterns: WORKOUT_PLAN_MATCH_PATTERNS,
      negativePatterns: [
        // adviceOrImplicitMutation already covers should/could/would/can i/do i/shall i
        shared.adviceOrImplicitMutation,
        // Create/change/adapt phrasing must fall through to the proposal fan-out.
        WORKOUT_PLAN_MUTATION_NEGATIVE_EN,
        WORKOUT_PLAN_MUTATION_NEGATIVE_RU,
      ],
    },
  ];
}

export function buildDefaultDirectPathsBehaviorConfig(): DefaultDirectPathsPatternConfig {
  return {
    sharedPatterns: DEFAULT_DIRECT_PATH_SHARED_PATTERNS,
    detectionOrder: [...DEFAULT_DIRECT_PATH_DETECTION_ORDER],
    kinds: buildDefaultDirectPathKindMatchers(),
  };
}
