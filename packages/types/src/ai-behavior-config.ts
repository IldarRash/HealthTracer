import { z } from "zod";
import {
  agentIntentSchema,
  agentRoutingMethodSchema,
  catalogIntentIdSchema,
  contextSlicePurposeSchema,
  contextTimeRangeSchema,
  expectedResponseModeSchema,
  type CatalogIntentId,
} from "./agent-context.js";
import { classifiedChatAttachmentCategorySchema } from "./chat-attachments.js";
import {
  capabilityConfigSchema,
  type CapabilityConfig,
} from "./capability-config.js";
import {
  CONTEXT_BUDGET_ABSOLUTE_LIMITS,
  applyContextBudgetSafetyFloor,
  clampContextBudgetPolicy,
  contextBudgetDegradationNotesSchema,
  contextBudgetPolicySchema,
  contextBudgetProfileSchema,
  DEEP_HISTORY_CONTEXT_BUDGET_POLICY,
  DEFAULT_CONTEXT_BUDGET_DEGRADATION_NOTES,
  DEFAULT_CONTEXT_BUDGET_POLICY,
  DEEP_REVIEW_CONTEXT_BUDGET_POLICY,
  tryCompileContextBudgetMessagePattern,
  type ContextBudgetPolicy,
} from "./context-budget.js";
import {
  directChatPathKindSchema,
  directChatPathRefreshHintSchema,
  type DirectChatPathKind,
  type DirectChatPathRefreshHint,
} from "./direct-chat-path.js";
import { DEFAULT_DETERMINISTIC_PROPOSAL_TRIGGERS } from "./deterministic-proposal-trigger-defaults.js";
import {
  buildDefaultDirectPathKindMatchers,
  DEFAULT_DIRECT_PATH_DETECTION_ORDER,
  DEFAULT_DIRECT_PATH_SHARED_PATTERNS,
} from "./direct-chat-path-default-patterns.js";
import {
  DEFAULT_DIRECT_PATH_REPLY_TEMPLATES,
  directPathReplyTemplatesSchema,
} from "./direct-chat-path-replies.js";
import { buildDefaultPromptTemplateEntries } from "./prompt-template-renderer.js";

import {
  DEFAULT_PROPOSAL_EXPLAINER_NEGATIVE_PATTERNS,
  DEFAULT_PROPOSAL_EXPLAINER_POSITIVE_PATTERNS,
  PROPOSAL_EXPLAINER_NO_PROPOSAL_REPLY,
} from "./proposal-explainer-default-patterns.js";

export { PROPOSAL_EXPLAINER_NO_PROPOSAL_REPLY };

export const proposalRevisionIntentSchema = z.enum([
  "update_profile",
  "create_goal",
  "update_goal",
  "create_workout_plan",
  "adapt_workout_plan",
  "adapt_workout_plan_from_progress",
  "create_nutrition_plan",
  "adjust_nutrition_plan",
  "recommend_recipes",
  "create_today_checklist",
  "summarize_progress",
  "create_habit_plan",
  "adapt_habit_plan",
  "capture_wellbeing_checkin",
  "log_nutrition_incident",
]);

export type ProposalRevisionIntent = z.infer<typeof proposalRevisionIntentSchema>;

/**
 * Default monthly/long-period review trigger pattern (EN + RU).
 * Cyrillic alternatives sit OUTSIDE the \b(...)\b group because JS \b
 * boundaries only work for ASCII word characters.
 */
export const DEFAULT_MONTHLY_REVIEW_MESSAGE_PATTERN =
  "\\b(month|monthly|last month|past month|30[- ]?day|thirty[- ]?day|quarter|90[- ]?day|half a year|six months|6 months|12 months|last year|past year|all[- ]?time|entire history|full history)\\b" +
  "|месяц|квартал|полгода|пол года|шесть месяцев|12 месяцев|за вс[её] время|вс(?:я|ю) истори|за (?:последний )?год";

export const AI_BEHAVIOR_CONFIG_VERSION = 1 as const;

export const aiBehaviorConfigVersionSchema = z.literal(AI_BEHAVIOR_CONFIG_VERSION);

export type AiBehaviorConfigVersion = z.infer<typeof aiBehaviorConfigVersionSchema>;

export const regexPatternFlagsSchema = z
  .string()
  .max(8)
  .regex(/^[gimsuy]*$/)
  .default("i");

export const regexPatternRuleSchema = z.object({
  source: z.string().min(1).max(2000),
  flags: regexPatternFlagsSchema,
});

export type RegexPatternRule = z.infer<typeof regexPatternRuleSchema>;

export const directPathsSharedPatternsConfigSchema = z.object({
  adviceOrImplicitMutation: regexPatternRuleSchema,
  workoutCompletionCommandHint: regexPatternRuleSchema,
});

export type DirectPathsSharedPatternsConfig = z.infer<
  typeof directPathsSharedPatternsConfigSchema
>;

export const directPathKindMatcherConfigSchema = z.object({
  kind: directChatPathKindSchema,
  refreshHintsOnExecuted: z.array(directChatPathRefreshHintSchema).max(5).default([]),
  matchPatterns: z.array(regexPatternRuleSchema).min(1).max(40),
  negativePatterns: z.array(regexPatternRuleSchema).max(40).default([]),
  requireTodayMention: z.boolean().optional(),
  todayMentionPatterns: z.array(regexPatternRuleSchema).max(10).optional(),
  requireWorkoutLexeme: z.boolean().optional(),
  workoutLexemePattern: z.string().min(1).max(500).optional(),
});

export type DirectPathKindMatcherConfig = z.infer<typeof directPathKindMatcherConfigSchema>;

/** @deprecated Use directPathKindMatcherConfigSchema */
export const directPathKindConfigSchema = directPathKindMatcherConfigSchema;

export type DirectPathKindConfig = DirectPathKindMatcherConfig;

export const directPathsBehaviorConfigSchema = z.object({
  enabled: z.boolean().default(true),
  confidence: z.number().min(0).max(1).default(0.95),
  routingMethod: z.literal("rule_based").default("rule_based"),
  blockWhenAttachments: z.boolean().default(true),
  blockWhenProposalRevision: z.boolean().default(true),
  detectionOrder: z.array(directChatPathKindSchema).min(1).max(10),
  sharedPatterns: directPathsSharedPatternsConfigSchema,
  kinds: z.array(directPathKindMatcherConfigSchema).min(1).max(10),
  replyTemplates: directPathReplyTemplatesSchema,
});

export const chatBehaviorConfigSchema = z.object({
  emptyAttachmentMessage: z.string().min(1).max(500),
});

export type ChatBehaviorConfig = z.infer<typeof chatBehaviorConfigSchema>;

export const DEFAULT_CHAT_BEHAVIOR: ChatBehaviorConfig = {
  emptyAttachmentMessage: "Shared attachment(s) for coaching review.",
};

export type DirectPathsBehaviorConfig = z.infer<typeof directPathsBehaviorConfigSchema>;

export const proposalRevisionRouteRuleSchema = z.object({
  proposalIntents: z.array(proposalRevisionIntentSchema).min(1).max(15),
  capabilityId: catalogIntentIdSchema,
});

export type ProposalRevisionRouteRule = z.infer<typeof proposalRevisionRouteRuleSchema>;

export const proposalRevisionRoutingConfigSchema = z.object({
  confidence: z.number().min(0).max(1).default(0.95),
  routingMethod: agentRoutingMethodSchema.default("rule_based"),
  expectedResponseMode: expectedResponseModeSchema.default("recommendation_with_optional_proposal"),
  fallbackCapabilityId: catalogIntentIdSchema.default("general"),
  routes: z.array(proposalRevisionRouteRuleSchema).min(1).max(20),
});

export type ProposalRevisionRoutingConfig = z.infer<typeof proposalRevisionRoutingConfigSchema>;

export const responseModesBehaviorConfigSchema = z.object({
  fallbackCapabilityId: catalogIntentIdSchema.default("general"),
});

export type ResponseModesBehaviorConfig = z.infer<typeof responseModesBehaviorConfigSchema>;

export const contextBudgetProfilesConfigSchema = z.object({
  default: contextBudgetPolicySchema,
  deep_review: contextBudgetPolicySchema,
  deep_history: contextBudgetPolicySchema,
});

export const CONTEXT_BUDGET_PROFILE_IDS = [
  "default",
  "deep_review",
  "deep_history",
] as const satisfies readonly z.infer<typeof contextBudgetProfileSchema>[];

export type ContextBudgetProfilesConfig = z.infer<typeof contextBudgetProfilesConfigSchema>;

export const contextBudgetTriggersConfigSchema = z.object({
  monthlyReviewMessagePattern: z.string().min(1).max(500),
  multiDomainMessagePattern: z.string().min(1).max(500),
  extendedLookbackTimeRanges: z.array(contextTimeRangeSchema).min(1).max(5),
  multiDomainSlicePurposes: z.array(contextSlicePurposeSchema).min(1).max(10),
  multiDomainSliceCountThreshold: z.number().int().min(1).max(10).default(2),
  multiDomainCapabilityCountThreshold: z.number().int().min(1).max(10).default(2),
  progressReviewCatalogIntentIds: z.array(catalogIntentIdSchema).min(1).max(10).default([
    "review_progress",
  ]),
  progressReviewAgentIntents: z.array(agentIntentSchema).min(1).max(10).default([
    "review_progress",
  ]),
  progressReviewSlicePurposes: z.array(contextSlicePurposeSchema).min(1).max(10).default([
    "weekly_review",
  ]),
  monthlyReviewCatalogIntentIds: z.array(catalogIntentIdSchema).min(1).max(10).default([
    "longevity_overview",
  ]),
  monthlyReviewAgentIntents: z.array(agentIntentSchema).min(1).max(10).default([
    "longevity_overview",
  ]),
  /**
   * Review-ish turns with a detected requestedLookbackDays above this value
   * select the deep_history profile (monthly granularity, mandatory
   * compression). Defaults to 91 so 90-day/quarter reviews stay deep_review.
   */
  deepHistoryMinLookbackDays: z.number().int().min(1).max(3650).default(91),
});

export type ContextBudgetTriggersConfig = z.infer<typeof contextBudgetTriggersConfigSchema>;

export const contextBudgetsBehaviorConfigSchema = z.object({
  profiles: contextBudgetProfilesConfigSchema,
  triggers: contextBudgetTriggersConfigSchema,
  /** EN/RU degradation note templates; fail-closed to built-in defaults. */
  degradationNotes: contextBudgetDegradationNotesSchema.default(
    DEFAULT_CONTEXT_BUDGET_DEGRADATION_NOTES,
  ),
});

export type ContextBudgetsBehaviorConfig = z.infer<typeof contextBudgetsBehaviorConfigSchema>;

export const promptTemplateEntrySchema = z.object({
  templateKey: z.string().min(1).max(120),
  body: z.string().min(1).max(20000),
  placeholders: z.array(z.string().min(1).max(80)).max(20).default([]),
});

export type PromptTemplateEntry = z.infer<typeof promptTemplateEntrySchema>;

export const promptTemplatesBehaviorConfigSchema = z.object({
  templates: z.record(z.string(), promptTemplateEntrySchema),
});

export type PromptTemplatesBehaviorConfig = z.infer<typeof promptTemplatesBehaviorConfigSchema>;

export const attachmentRoutingConfigSchema = z.object({
  categoryPriority: z.array(classifiedChatAttachmentCategorySchema).min(1).max(10),
  defaultCapabilityId: catalogIntentIdSchema,
  confidence: z.number().min(0).max(1).default(0.98),
  routingMethod: z.literal("attachment_family").default("attachment_family"),
});

export type AttachmentRoutingConfig = z.infer<typeof attachmentRoutingConfigSchema>;

export const proposalExplainerDetectionPatternsConfigSchema = z.object({
  positivePatterns: z.array(regexPatternRuleSchema).min(1).max(40),
  negativePatterns: z.array(regexPatternRuleSchema).max(40).default([]),
});

export type ProposalExplainerDetectionPatternsConfig = z.infer<
  typeof proposalExplainerDetectionPatternsConfigSchema
>;

export const proposalExplainerBehaviorConfigSchema = z.object({
  capabilityId: catalogIntentIdSchema.default("proposal_explainer"),
  confidence: z.number().min(0).max(1).default(0.95),
  routingMethod: agentRoutingMethodSchema.default("rule_based"),
  noProposalReply: z.string().min(1).max(2000).default(PROPOSAL_EXPLAINER_NO_PROPOSAL_REPLY),
  blockWhenAttachments: z.boolean().default(true),
  blockWhenProposalRevision: z.boolean().default(true),
  detectionPatterns: proposalExplainerDetectionPatternsConfigSchema,
});

export type ProposalExplainerBehaviorConfig = z.infer<typeof proposalExplainerBehaviorConfigSchema>;

export const wellbeingCheckinTriggerConfigSchema = z.object({
  enabled: z.boolean().default(true),
  moodPhrases: z.array(z.string().min(1).max(120)).min(1).max(50),
  excludeContainsPhrases: z.array(z.string().min(1).max(120)).max(20).default([]),
  excludeWhenNutritionIncidentSignal: z.boolean().default(true),
  requireNoTodayCheckIn: z.boolean().default(true),
  skipWhenCrisis: z.boolean().default(true),
});

export type WellbeingCheckinTriggerConfig = z.infer<typeof wellbeingCheckinTriggerConfigSchema>;

export const nutritionIncidentTriggerConfigSchema = z.object({
  enabled: z.boolean().default(true),
  phrases: z.array(z.string().min(1).max(120)).min(1).max(50),
  skipWhenCrisis: z.boolean().default(true),
});

export type NutritionIncidentTriggerConfig = z.infer<typeof nutritionIncidentTriggerConfigSchema>;

export const recipeRecommendationTriggerConfigSchema = z.object({
  enabled: z.boolean().default(true),
  phrases: z.array(z.string().min(1).max(120)).min(1).max(50),
  excludeWhenNutritionIncidentSignal: z.boolean().default(true),
  skipWhenCrisis: z.boolean().default(true),
});

export type RecipeRecommendationTriggerConfig = z.infer<
  typeof recipeRecommendationTriggerConfigSchema
>;

export const deterministicProposalTriggersConfigSchema = z.object({
  maxMergedProposals: z.number().int().min(1).max(10).default(5),
  wellbeingCheckin: wellbeingCheckinTriggerConfigSchema,
  nutritionIncident: nutritionIncidentTriggerConfigSchema,
  recipeRecommendation: recipeRecommendationTriggerConfigSchema,
});

export type DeterministicProposalTriggersConfig = z.infer<
  typeof deterministicProposalTriggersConfigSchema
>;

export const quickActionConfigSchema = z.object({
  id: directChatPathKindSchema,
  labelEn: z.string().min(1).max(120),
  labelRu: z.string().min(1).max(120),
  messageText: z.object({
    en: z.string().min(1).max(240),
    ru: z.string().min(1).max(240),
  }),
});

export type QuickActionConfig = z.infer<typeof quickActionConfigSchema>;

export const suggestedQuickActionsConfigSchema = z.object({
  actions: z.array(quickActionConfigSchema).max(10).default([]),
});

export type SuggestedQuickActionsConfig = z.infer<typeof suggestedQuickActionsConfigSchema>;

export const DEFAULT_SUGGESTED_QUICK_ACTIONS: SuggestedQuickActionsConfig = {
  actions: [
    {
      id: "today_summary_read",
      labelEn: "Today's summary",
      labelRu: "Сводка на сегодня",
      messageText: {
        en: "What's today?",
        ru: "Что у меня на сегодня?",
      },
    },
    {
      id: "mark_today_workout_done",
      labelEn: "Mark workout done",
      labelRu: "Отметить тренировку",
      messageText: {
        en: "Mark today's workout done",
        ru: "Отметь тренировку как выполненную",
      },
    },
    {
      id: "nutrition_plan_read",
      labelEn: "My nutrition plan",
      labelRu: "Мой план питания",
      messageText: {
        en: "Show my nutrition plan",
        ru: "Покажи мой план питания",
      },
    },
  ],
};

export const aiBehaviorConfigSchema = z.object({
  version: aiBehaviorConfigVersionSchema,
  capabilities: z.array(capabilityConfigSchema).max(50).default([]),
  chat: chatBehaviorConfigSchema,
  directPaths: directPathsBehaviorConfigSchema,
  proposalRevisionRouting: proposalRevisionRoutingConfigSchema,
  responseModes: responseModesBehaviorConfigSchema,
  contextBudgets: contextBudgetsBehaviorConfigSchema,
  promptTemplates: promptTemplatesBehaviorConfigSchema,
  attachmentRouting: attachmentRoutingConfigSchema,
  proposalExplainer: proposalExplainerBehaviorConfigSchema,
  deterministicProposalTriggers: deterministicProposalTriggersConfigSchema,
  suggestedQuickActions: suggestedQuickActionsConfigSchema,
});

export type AiBehaviorConfig = z.infer<typeof aiBehaviorConfigSchema>;

/** Runtime file shape: attachmentRouting moved to attachments.json and is optional here. */
export const aiBehaviorConfigFileSchema = aiBehaviorConfigSchema
  .omit({ attachmentRouting: true, suggestedQuickActions: true })
  .extend({
    attachmentRouting: attachmentRoutingConfigSchema.optional(),
    suggestedQuickActions: suggestedQuickActionsConfigSchema.optional(),
  });

export type AiBehaviorConfigFile = z.infer<typeof aiBehaviorConfigFileSchema>;

export type AiBehaviorConfigParseResult =
  | { success: true; data: AiBehaviorConfig }
  | { success: false; errors: readonly string[] };

export type AiBehaviorConfigLoadSource = "file" | "defaults";

export type AiBehaviorConfigLoadResult = {
  config: AiBehaviorConfig;
  source: AiBehaviorConfigLoadSource;
  errors: readonly string[];
  warnings: readonly string[];
};

const DEFAULT_PROPOSAL_REVISION_ROUTES: ProposalRevisionRouteRule[] = [
  {
    proposalIntents: [
      "create_workout_plan",
      "adapt_workout_plan",
      "adapt_workout_plan_from_progress",
    ],
    capabilityId: "adjust_workout",
  },
  {
    proposalIntents: ["create_nutrition_plan", "adjust_nutrition_plan"],
    capabilityId: "adjust_nutrition",
  },
  {
    proposalIntents: ["create_habit_plan", "adapt_habit_plan"],
    capabilityId: "longevity_overview",
  },
];

export function buildDefaultAiBehaviorConfig(): AiBehaviorConfig {
  return aiBehaviorConfigSchema.parse({
    version: AI_BEHAVIOR_CONFIG_VERSION,
    capabilities: [],
    chat: DEFAULT_CHAT_BEHAVIOR,
    directPaths: {
      enabled: true,
      confidence: 0.95,
      routingMethod: "rule_based",
      blockWhenAttachments: true,
      blockWhenProposalRevision: true,
      sharedPatterns: DEFAULT_DIRECT_PATH_SHARED_PATTERNS,
      detectionOrder: [...DEFAULT_DIRECT_PATH_DETECTION_ORDER],
      kinds: buildDefaultDirectPathKindMatchers(),
      replyTemplates: DEFAULT_DIRECT_PATH_REPLY_TEMPLATES,
    },
    proposalRevisionRouting: {
      confidence: 0.95,
      routingMethod: "rule_based",
      expectedResponseMode: "recommendation_with_optional_proposal",
      fallbackCapabilityId: "general",
      routes: DEFAULT_PROPOSAL_REVISION_ROUTES,
    },
    responseModes: {
      fallbackCapabilityId: "general",
    },
    contextBudgets: {
      profiles: {
        default: DEFAULT_CONTEXT_BUDGET_POLICY,
        deep_review: DEEP_REVIEW_CONTEXT_BUDGET_POLICY,
        deep_history: DEEP_HISTORY_CONTEXT_BUDGET_POLICY,
      },
      triggers: {
        monthlyReviewMessagePattern: DEFAULT_MONTHLY_REVIEW_MESSAGE_PATTERN,
        multiDomainMessagePattern:
          "\\b(workout|training|nutrition|food|sleep|recovery|habit|wellbeing|longevity)\\b.*\\b(and|plus|also|versus|vs)\\b.*\\b(workout|training|nutrition|food|sleep|recovery|habit|wellbeing|longevity)\\b",
        extendedLookbackTimeRanges: ["30d", "90d", "1y"],
        multiDomainSlicePurposes: [
          "workout_adaptation",
          "nutrition_adaptation",
          "weekly_review",
          "longevity_overview",
          "health_context",
        ],
        multiDomainSliceCountThreshold: 2,
        multiDomainCapabilityCountThreshold: 2,
        progressReviewCatalogIntentIds: ["review_progress"],
        progressReviewAgentIntents: ["review_progress"],
        progressReviewSlicePurposes: ["weekly_review"],
        monthlyReviewCatalogIntentIds: ["longevity_overview"],
        monthlyReviewAgentIntents: ["longevity_overview"],
        deepHistoryMinLookbackDays: 91,
      },
      degradationNotes: DEFAULT_CONTEXT_BUDGET_DEGRADATION_NOTES,
    },
    promptTemplates: {
      templates: buildDefaultPromptTemplateEntries(),
    },
    attachmentRouting: {
      categoryPriority: ["medical_document", "workout_attachment", "food_photo"],
      defaultCapabilityId: "attachment_food_photo",
      confidence: 0.98,
      routingMethod: "attachment_family",
    },
    proposalExplainer: {
      capabilityId: "proposal_explainer",
      confidence: 0.95,
      routingMethod: "rule_based",
      noProposalReply: PROPOSAL_EXPLAINER_NO_PROPOSAL_REPLY,
      blockWhenAttachments: true,
      blockWhenProposalRevision: true,
      detectionPatterns: {
        positivePatterns: [...DEFAULT_PROPOSAL_EXPLAINER_POSITIVE_PATTERNS],
        negativePatterns: [...DEFAULT_PROPOSAL_EXPLAINER_NEGATIVE_PATTERNS],
      },
    },
    deterministicProposalTriggers: DEFAULT_DETERMINISTIC_PROPOSAL_TRIGGERS,
    suggestedQuickActions: DEFAULT_SUGGESTED_QUICK_ACTIONS,
  });
}

export function formatAiBehaviorConfigValidationErrors(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "aiBehaviorConfig";
    return `${path}: ${issue.message}`;
  });
}

export function safeParseAiBehaviorConfig(value: unknown): AiBehaviorConfigParseResult {
  const parsed = aiBehaviorConfigFileSchema.safeParse(value);

  if (parsed.success) {
    const defaults = buildDefaultAiBehaviorConfig();
    const data = aiBehaviorConfigSchema.parse({
      ...parsed.data,
      attachmentRouting: parsed.data.attachmentRouting ?? defaults.attachmentRouting,
      suggestedQuickActions: parsed.data.suggestedQuickActions ?? defaults.suggestedQuickActions,
    });

    return { success: true, data };
  }

  return { success: false, errors: formatAiBehaviorConfigValidationErrors(parsed.error) };
}

export function validateAiBehaviorConfig(value: unknown): string[] {
  const result = safeParseAiBehaviorConfig(value);
  return result.success ? [] : [...result.errors];
}

export function sanitizeContextBudgetProfiles(
  profiles: ContextBudgetProfilesConfig,
): ContextBudgetProfilesConfig {
  return {
    default: applyContextBudgetSafetyFloor(clampContextBudgetPolicy(profiles.default)),
    deep_review: applyContextBudgetSafetyFloor(clampContextBudgetPolicy(profiles.deep_review)),
    deep_history: applyContextBudgetSafetyFloor(clampContextBudgetPolicy(profiles.deep_history)),
  };
}

const CONTEXT_BUDGET_TRIGGER_PATTERN_KEYS = [
  "monthlyReviewMessagePattern",
  "multiDomainMessagePattern",
] as const satisfies readonly (keyof ContextBudgetTriggersConfig)[];

export function sanitizeContextBudgetTriggers(
  triggers: ContextBudgetTriggersConfig,
  defaults: ContextBudgetTriggersConfig,
): { triggers: ContextBudgetTriggersConfig; warnings: string[] } {
  const warnings: string[] = [];
  const next = { ...triggers };

  for (const key of CONTEXT_BUDGET_TRIGGER_PATTERN_KEYS) {
    if (tryCompileContextBudgetMessagePattern(next[key])) {
      continue;
    }

    warnings.push(`contextBudgets.triggers.${key}: invalid regex; using default.`);
    next[key] = defaults[key];
  }

  return { triggers: next, warnings };
}

export function sanitizeContextBudgetsBehaviorConfig(
  contextBudgets: ContextBudgetsBehaviorConfig,
  defaults: ContextBudgetsBehaviorConfig,
): { contextBudgets: ContextBudgetsBehaviorConfig; warnings: string[] } {
  const profiles = sanitizeContextBudgetProfiles(contextBudgets.profiles);
  const { triggers, warnings } = sanitizeContextBudgetTriggers(
    contextBudgets.triggers,
    defaults.triggers,
  );

  return {
    contextBudgets: {
      profiles,
      triggers,
      degradationNotes: contextBudgets.degradationNotes,
    },
    warnings,
  };
}

export function normalizeAiBehaviorConfig(
  partial: Partial<AiBehaviorConfig> | undefined,
  defaults: AiBehaviorConfig = buildDefaultAiBehaviorConfig(),
): AiBehaviorConfig {
  const merged = {
    ...defaults,
    ...partial,
    chat: {
      ...defaults.chat,
      ...partial?.chat,
    },
    directPaths: {
      ...defaults.directPaths,
      ...partial?.directPaths,
      sharedPatterns: {
        ...defaults.directPaths.sharedPatterns,
        ...partial?.directPaths?.sharedPatterns,
      },
      detectionOrder: partial?.directPaths?.detectionOrder ?? defaults.directPaths.detectionOrder,
      kinds: partial?.directPaths?.kinds ?? defaults.directPaths.kinds,
      replyTemplates: {
        todaySummary: {
          ...defaults.directPaths.replyTemplates.todaySummary,
          ...partial?.directPaths?.replyTemplates?.todaySummary,
          itemStatusLabels: {
            ...defaults.directPaths.replyTemplates.todaySummary.itemStatusLabels,
            ...partial?.directPaths?.replyTemplates?.todaySummary?.itemStatusLabels,
          },
        },
        markWorkoutDone: {
          ...defaults.directPaths.replyTemplates.markWorkoutDone,
          ...partial?.directPaths?.replyTemplates?.markWorkoutDone,
        },
        nutritionPlan: {
          ...defaults.directPaths.replyTemplates.nutritionPlan,
          ...partial?.directPaths?.replyTemplates?.nutritionPlan,
        },
      },
    },
    proposalRevisionRouting: {
      ...defaults.proposalRevisionRouting,
      ...partial?.proposalRevisionRouting,
      routes: partial?.proposalRevisionRouting?.routes ?? defaults.proposalRevisionRouting.routes,
    },
    responseModes: {
      ...defaults.responseModes,
      ...partial?.responseModes,
    },
    contextBudgets: {
      profiles: {
        default: {
          ...defaults.contextBudgets.profiles.default,
          ...partial?.contextBudgets?.profiles?.default,
        },
        deep_review: {
          ...defaults.contextBudgets.profiles.deep_review,
          ...partial?.contextBudgets?.profiles?.deep_review,
        },
        deep_history: {
          ...defaults.contextBudgets.profiles.deep_history,
          ...partial?.contextBudgets?.profiles?.deep_history,
        },
      },
      triggers: {
        ...defaults.contextBudgets.triggers,
        ...partial?.contextBudgets?.triggers,
      },
      degradationNotes: {
        lookbackClamped: {
          ...defaults.contextBudgets.degradationNotes.lookbackClamped,
          ...partial?.contextBudgets?.degradationNotes?.lookbackClamped,
        },
      },
    },
    promptTemplates: {
      templates: {
        ...defaults.promptTemplates.templates,
        ...partial?.promptTemplates?.templates,
      },
    },
    attachmentRouting: {
      ...defaults.attachmentRouting,
      ...partial?.attachmentRouting,
    },
    proposalExplainer: {
      ...defaults.proposalExplainer,
      ...partial?.proposalExplainer,
      detectionPatterns: {
        ...defaults.proposalExplainer.detectionPatterns,
        ...partial?.proposalExplainer?.detectionPatterns,
        positivePatterns:
          partial?.proposalExplainer?.detectionPatterns?.positivePatterns ??
          defaults.proposalExplainer.detectionPatterns.positivePatterns,
        negativePatterns:
          partial?.proposalExplainer?.detectionPatterns?.negativePatterns ??
          defaults.proposalExplainer.detectionPatterns.negativePatterns,
      },
    },
    deterministicProposalTriggers: {
      ...defaults.deterministicProposalTriggers,
      ...partial?.deterministicProposalTriggers,
      wellbeingCheckin: {
        ...defaults.deterministicProposalTriggers.wellbeingCheckin,
        ...partial?.deterministicProposalTriggers?.wellbeingCheckin,
      },
      nutritionIncident: {
        ...defaults.deterministicProposalTriggers.nutritionIncident,
        ...partial?.deterministicProposalTriggers?.nutritionIncident,
      },
      recipeRecommendation: {
        ...defaults.deterministicProposalTriggers.recipeRecommendation,
        ...partial?.deterministicProposalTriggers?.recipeRecommendation,
      },
    },
    capabilities: partial?.capabilities ?? defaults.capabilities,
    suggestedQuickActions: {
      ...defaults.suggestedQuickActions,
      ...partial?.suggestedQuickActions,
      actions: partial?.suggestedQuickActions?.actions ?? defaults.suggestedQuickActions.actions,
    },
  };

  const parsed = aiBehaviorConfigSchema.parse(merged);
  const { contextBudgets } = sanitizeContextBudgetsBehaviorConfig(
    parsed.contextBudgets,
    defaults.contextBudgets,
  );

  return {
    ...parsed,
    contextBudgets,
  };
}

export function resolveLoadedAiBehaviorConfig(input: {
  fileValue?: unknown;
  defaults?: AiBehaviorConfig;
}): AiBehaviorConfigLoadResult {
  const defaults = input.defaults ?? buildDefaultAiBehaviorConfig();

  if (input.fileValue == null) {
    return {
      config: defaults,
      source: "defaults",
      errors: [],
      warnings: ["AI behavior config file missing; using built-in defaults."],
    };
  }

  const parsed = safeParseAiBehaviorConfig(input.fileValue);

  if (parsed.success) {
    const warnings: string[] = [];

    if (
      input.fileValue != null &&
      typeof input.fileValue === "object" &&
      "attachmentRouting" in input.fileValue
    ) {
      warnings.push(
        "attachmentRouting in ai-behavior.json is deprecated and ignored at runtime; configure routing in attachments.json instead.",
      );
    }

    for (const key of CONTEXT_BUDGET_TRIGGER_PATTERN_KEYS) {
      if (!tryCompileContextBudgetMessagePattern(parsed.data.contextBudgets.triggers[key])) {
        warnings.push(`contextBudgets.triggers.${key}: invalid regex; using default.`);
      }
    }

    for (const profile of CONTEXT_BUDGET_PROFILE_IDS) {
      const fileProfile = parsed.data.contextBudgets.profiles[profile];

      if (
        fileProfile.allowDocuments === true ||
        fileProfile.allowSensitiveHealthContext === true
      ) {
        warnings.push(
          `contextBudgets.profiles.${profile}: document/sensitive-health flags cannot be enabled via config; forced to false.`,
        );
      }
    }

    return {
      config: normalizeAiBehaviorConfig(parsed.data, defaults),
      source: "file",
      errors: [],
      warnings,
    };
  }

  return {
    config: defaults,
    source: "defaults",
    errors: parsed.errors,
    warnings: ["Invalid AI behavior config; using built-in defaults."],
  };
}

export function resolveProposalRevisionCapabilityId(
  config: ProposalRevisionRoutingConfig,
  proposalIntent: ProposalRevisionIntent,
): CatalogIntentId {
  for (const route of config.routes) {
    if (route.proposalIntents.includes(proposalIntent)) {
      return route.capabilityId;
    }
  }

  return config.fallbackCapabilityId;
}

export function resolveDirectPathRefreshHintsFromConfig(
  config: DirectPathsBehaviorConfig,
  kind: DirectChatPathKind,
  outcomeStatus: "executed" | "clarification_required" | "no_op",
): DirectChatPathRefreshHint[] {
  if (outcomeStatus !== "executed") {
    return [];
  }

  const kindConfig = config.kinds.find((entry) => entry.kind === kind);
  return kindConfig ? [...kindConfig.refreshHintsOnExecuted] : [];
}

export function resolveContextBudgetProfilePolicy(
  config: ContextBudgetsBehaviorConfig,
  profile: z.infer<typeof contextBudgetProfileSchema>,
): ContextBudgetPolicy {
  return applyContextBudgetSafetyFloor(clampContextBudgetPolicy(config.profiles[profile]));
}

export function mergeCapabilityConfigOverrides(
  baseConfigs: readonly CapabilityConfig[],
  overrides: readonly CapabilityConfig[],
): CapabilityConfig[] {
  if (overrides.length === 0) {
    return [...baseConfigs];
  }

  const byId = new Map(baseConfigs.map((config) => [config.capabilityId, config]));

  for (const override of overrides) {
    const parsed = capabilityConfigSchema.safeParse(override);

    if (!parsed.success) {
      continue;
    }

    const existing = byId.get(parsed.data.capabilityId);

    if (existing) {
      byId.set(parsed.data.capabilityId, {
        ...existing,
        ...parsed.data,
        compositionMetadata: parsed.data.compositionMetadata ?? existing.compositionMetadata,
        widgetDescriptors: parsed.data.widgetDescriptors ?? existing.widgetDescriptors,
        actionDescriptors: parsed.data.actionDescriptors ?? existing.actionDescriptors,
      });
      continue;
    }

    byId.set(parsed.data.capabilityId, parsed.data);
  }

  return [...byId.values()];
}

export { CONTEXT_BUDGET_ABSOLUTE_LIMITS };
