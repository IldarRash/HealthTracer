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
  pattern("^что\\s+(?:в\\s+)?(?:моём?|у меня)\\s+план(?:е)?\\s+питани(?:я|е)\\s*\\??$"),
  pattern("^покажи\\s+(?:мой\\s+)?план\\s+питани(?:я|е)\\s*\\??$"),
  pattern("^(?:мой\\s+)?план\\s+питани(?:я|е)\\s*\\??$"),
];

export const DEFAULT_DIRECT_PATH_DETECTION_ORDER: readonly DirectChatPathKind[] = [
  "mark_today_workout_done",
  "today_summary_read",
  "nutrition_plan_read",
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
        pattern("\\b(?:change|modify|update|create|build|add|remove|edit)\\b"),
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
