import { describe, expect, it } from "vitest";
import {
  buildDefaultAiBehaviorConfig,
  DEFAULT_QUOTA_LIMIT_REPLY,
  mergeCapabilityConfigOverrides,
  normalizeAiBehaviorConfig,
  resolveLoadedAiBehaviorConfig,
  resolveProposalRevisionCapabilityId,
  resolveQuotaLimitReply,
  safeParseAiBehaviorConfig,
  validateAiBehaviorConfig,
  type AiBehaviorConfig,
} from "./ai-behavior-config.js";
import {
  shouldTriggerNutritionIncidentProposal,
  shouldTriggerRecipeRecommendationRequest,
  shouldTriggerWellbeingCheckinProposal,
} from "./chat-action-proposals.js";
import { AGENT_CAPABILITY_CONFIGS } from "./capability-config.js";
import {
  DEEP_HISTORY_CONTEXT_BUDGET_POLICY,
  DEFAULT_CONTEXT_BUDGET_DEGRADATION_NOTES,
  DEFAULT_CONTEXT_BUDGET_POLICY,
  DEEP_REVIEW_CONTEXT_BUDGET_POLICY,
} from "./context-budget.js";

describe("ai behavior config", () => {
  it("builds defaults that validate", () => {
    const defaults = buildDefaultAiBehaviorConfig();

    expect(validateAiBehaviorConfig(defaults)).toEqual([]);
    expect(defaults.version).toBe(1);
    expect(defaults.capabilities).toEqual([]);
  });

  it("rejects invalid config shapes", () => {
    const parsed = safeParseAiBehaviorConfig({ version: 2 });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.errors.length).toBeGreaterThan(0);
    }
  });

  it("falls back to defaults when file config is invalid", () => {
    const defaults = buildDefaultAiBehaviorConfig();
    const loaded = resolveLoadedAiBehaviorConfig({
      fileValue: { version: 2 },
      defaults,
    });

    expect(loaded.source).toBe("defaults");
    expect(loaded.config).toEqual(defaults);
    expect(loaded.errors.length).toBeGreaterThan(0);
    expect(loaded.warnings.length).toBeGreaterThan(0);
  });

  it("normalizes partial config onto defaults", () => {
    const normalized = normalizeAiBehaviorConfig({
      responseModes: {
        fallbackCapabilityId: "general",
      },
    });

    expect(normalized.responseModes.fallbackCapabilityId).toBe("general");
    expect(normalized.contextBudgets.profiles.default).toEqual(DEFAULT_CONTEXT_BUDGET_POLICY);
  });

  it("matches existing proposal revision routing semantics", () => {
    const config = buildDefaultAiBehaviorConfig();

    expect(
      resolveProposalRevisionCapabilityId(config.proposalRevisionRouting, "adapt_workout_plan"),
    ).toBe("adjust_workout");
    expect(
      resolveProposalRevisionCapabilityId(config.proposalRevisionRouting, "adjust_nutrition_plan"),
    ).toBe("adjust_nutrition");
    expect(
      resolveProposalRevisionCapabilityId(config.proposalRevisionRouting, "adapt_habit_plan"),
    ).toBe("longevity_overview");
    expect(
      resolveProposalRevisionCapabilityId(config.proposalRevisionRouting, "summarize_progress"),
    ).toBe("general");
  });


  it("preserves capability catalog size when no overrides are present", () => {
    const defaults = buildDefaultAiBehaviorConfig();
    const merged = mergeCapabilityConfigOverrides(AGENT_CAPABILITY_CONFIGS, defaults.capabilities);

    expect(merged.length).toBe(AGENT_CAPABILITY_CONFIGS.length);
  });

  it("validates direct path matcher config with full pattern sets", () => {
    const defaults = buildDefaultAiBehaviorConfig();

    expect(defaults.directPaths.detectionOrder).toEqual([
      "mark_today_workout_done",
      "today_summary_read",
      "nutrition_plan_read",
      "weekly_progress_read",
      "workout_plan_read",
    ]);
    expect(defaults.directPaths.kinds).toHaveLength(5);
    expect(defaults.directPaths.kinds[0]?.matchPatterns.length).toBeGreaterThan(0);
  });

  it("includes suggestedQuickActions in defaults with all five action ids", () => {
    const defaults = buildDefaultAiBehaviorConfig();

    expect(defaults.suggestedQuickActions).toBeDefined();
    const ids = defaults.suggestedQuickActions.actions.map((a) => a.id);
    expect(ids).toContain("today_summary_read");
    expect(ids).toContain("mark_today_workout_done");
    expect(ids).toContain("nutrition_plan_read");
    expect(ids).toContain("weekly_progress_read");
    expect(ids).toContain("workout_plan_read");
  });

  it("falls back to suggestedQuickActions defaults when file config omits the key", () => {
    const defaults = buildDefaultAiBehaviorConfig();
    const fileWithoutQuickActions = { ...defaults };
    // Remove the key to simulate an older JSON file
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (fileWithoutQuickActions as any).suggestedQuickActions;

    const loaded = resolveLoadedAiBehaviorConfig({
      fileValue: fileWithoutQuickActions,
      defaults,
    });

    expect(loaded.source).toBe("file");
    expect(loaded.config.suggestedQuickActions).toEqual(defaults.suggestedQuickActions);
  });

  it("exposes deep review profile parity with legacy constants", () => {
    const defaults = buildDefaultAiBehaviorConfig();

    expect(defaults.contextBudgets.profiles.default).toEqual(DEFAULT_CONTEXT_BUDGET_POLICY);
    expect(defaults.contextBudgets.profiles.deep_review).toEqual(DEEP_REVIEW_CONTEXT_BUDGET_POLICY);
    expect(defaults.contextBudgets.profiles.deep_history).toEqual(
      DEEP_HISTORY_CONTEXT_BUDGET_POLICY,
    );
    expect(defaults.contextBudgets.triggers.deepHistoryMinLookbackDays).toBe(91);
    expect(defaults.contextBudgets.degradationNotes).toEqual(
      DEFAULT_CONTEXT_BUDGET_DEGRADATION_NOTES,
    );
  });

  it("matches RU/EN long-period review phrases with the default monthly trigger pattern", () => {
    const defaults = buildDefaultAiBehaviorConfig();
    const pattern = new RegExp(defaults.contextBudgets.triggers.monthlyReviewMessagePattern, "i");

    for (const message of [
      "как прошёл месяц",
      "итоги за квартал",
      "проанализируй последние полгода",
      "review my last 6 months",
      "how did half a year of training go",
      "за всё время",
      "вся история",
      "my all-time progress",
      "entire history",
      "за последний год",
    ]) {
      expect(pattern.test(message)).toBe(true);
    }

    for (const message of ["составь план тренировок", "create a workout plan"]) {
      expect(pattern.test(message)).toBe(false);
    }
  });

  it("forces document/sensitive flags off for a malicious deep_history file profile", () => {
    const defaults = buildDefaultAiBehaviorConfig();
    const loaded = resolveLoadedAiBehaviorConfig({
      fileValue: {
        ...defaults,
        contextBudgets: {
          ...defaults.contextBudgets,
          profiles: {
            ...defaults.contextBudgets.profiles,
            deep_history: {
              ...defaults.contextBudgets.profiles.deep_history,
              allowDocuments: true,
              allowSensitiveHealthContext: true,
            },
          },
        },
      },
      defaults,
    });

    expect(loaded.source).toBe("file");
    expect(loaded.config.contextBudgets.profiles.deep_history.allowDocuments).toBe(false);
    expect(
      loaded.config.contextBudgets.profiles.deep_history.allowSensitiveHealthContext,
    ).toBe(false);
    expect(
      loaded.warnings.some((warning) => warning.includes("deep_history")),
    ).toBe(true);
  });

  it("loads file config without deprecated attachmentRouting", () => {
    const defaults = buildDefaultAiBehaviorConfig();
    const { attachmentRouting: _removed, ...fileWithoutAttachmentRouting } = defaults;
    const loaded = resolveLoadedAiBehaviorConfig({
      fileValue: fileWithoutAttachmentRouting,
      defaults,
    });

    expect(loaded.source).toBe("file");
    expect(loaded.errors).toEqual([]);
    expect(loaded.warnings).not.toContain(
      "attachmentRouting in ai-behavior.json is deprecated and ignored at runtime; configure routing in attachments.json instead.",
    );
    expect(loaded.config.attachmentRouting).toEqual(defaults.attachmentRouting);
  });

  it("warns when ai-behavior file still contains deprecated attachmentRouting", () => {
    const loaded = resolveLoadedAiBehaviorConfig({
      fileValue: {
        ...buildDefaultAiBehaviorConfig(),
        attachmentRouting: {
          categoryPriority: ["food_photo"],
          defaultCapabilityId: "attachment_food_photo",
          confidence: 0.98,
          routingMethod: "attachment_family",
        },
      },
    });

    expect(loaded.warnings).toContain(
      "attachmentRouting in ai-behavior.json is deprecated and ignored at runtime; configure routing in attachments.json instead.",
    );
  });

  it("changes proposal revision routing from config without code changes", () => {
    const config = normalizeAiBehaviorConfig({
      proposalRevisionRouting: {
        routes: [
          {
            proposalIntents: ["adapt_workout_plan"],
            capabilityId: "general",
          },
          {
            proposalIntents: ["create_nutrition_plan", "adjust_nutrition_plan"],
            capabilityId: "adjust_nutrition",
          },
          {
            proposalIntents: ["create_habit_plan", "adapt_habit_plan"],
            capabilityId: "longevity_overview",
          },
        ],
        fallbackCapabilityId: "general",
      },
    } as Partial<AiBehaviorConfig>);

    expect(
      resolveProposalRevisionCapabilityId(config.proposalRevisionRouting, "adapt_workout_plan"),
    ).toBe("general");
    expect(
      resolveProposalRevisionCapabilityId(config.proposalRevisionRouting, "adjust_nutrition_plan"),
    ).toBe("adjust_nutrition");
  });

  it("changes deterministic nutrition and recipe trigger phrases from config", () => {
    const config = normalizeAiBehaviorConfig({
      deterministicProposalTriggers: {
        nutritionIncident: {
          phrases: ["custom nutrition slip"],
          enabled: true,
          skipWhenCrisis: true,
        },
        recipeRecommendation: {
          phrases: ["custom recipe ask"],
          enabled: true,
          excludeWhenNutritionIncidentSignal: true,
          skipWhenCrisis: true,
        },
      },
    } as unknown as Partial<AiBehaviorConfig>).deterministicProposalTriggers;

    expect(shouldTriggerNutritionIncidentProposal("I had a custom nutrition slip", config)).toBe(
      true,
    );
    expect(shouldTriggerRecipeRecommendationRequest("custom recipe ask please", config)).toBe(
      true,
    );
    expect(shouldTriggerNutritionIncidentProposal("I had a cheat meal tonight", config)).toBe(false);
  });

  it("changes deterministic wellbeing trigger phrases from config", () => {
    const config = normalizeAiBehaviorConfig({
      deterministicProposalTriggers: {
        wellbeingCheckin: {
          moodPhrases: ["custom low mood phrase"],
          excludeContainsPhrases: [],
          excludeWhenNutritionIncidentSignal: false,
          requireNoTodayCheckIn: true,
          skipWhenCrisis: true,
          enabled: true,
        },
      },
    } as unknown as Partial<AiBehaviorConfig>).deterministicProposalTriggers;

    expect(
      shouldTriggerWellbeingCheckinProposal("custom low mood phrase today", false, config),
    ).toBe(true);
    expect(shouldTriggerWellbeingCheckinProposal("I feel bad today", false, config)).toBe(false);
  });
});

describe("chat.quotaLimitReply (deterministic quota gate copy)", () => {
  it("defaults include the bilingual quota reply", () => {
    const defaults = buildDefaultAiBehaviorConfig();

    expect(defaults.chat.quotaLimitReply).toEqual(DEFAULT_QUOTA_LIMIT_REPLY);
    expect(defaults.chat.quotaLimitReply.en.length).toBeGreaterThan(0);
    expect(defaults.chat.quotaLimitReply.ru.length).toBeGreaterThan(0);
  });

  it("falls back to the default reply when the file config omits the key (fail-closed)", () => {
    const parsed = safeParseAiBehaviorConfig({
      ...buildDefaultAiBehaviorConfig(),
      chat: { emptyAttachmentMessage: "Attachment." },
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.chat.quotaLimitReply).toEqual(DEFAULT_QUOTA_LIMIT_REPLY);
    }
  });

  it("honors file-config overrides for both languages", () => {
    const normalized = normalizeAiBehaviorConfig({
      chat: {
        emptyAttachmentMessage: "Attachment.",
        quotaLimitReply: { en: "Custom EN quota copy.", ru: "Кастомный лимит." },
      },
    });

    expect(resolveQuotaLimitReply(normalized.chat, "en")).toBe("Custom EN quota copy.");
    expect(resolveQuotaLimitReply(normalized.chat, "ru")).toBe("Кастомный лимит.");
  });

  it("resolveQuotaLimitReply falls back to English for unknown/null languages", () => {
    const chat = buildDefaultAiBehaviorConfig().chat;

    expect(resolveQuotaLimitReply(chat, null)).toBe(DEFAULT_QUOTA_LIMIT_REPLY.en);
    expect(resolveQuotaLimitReply(chat, undefined)).toBe(DEFAULT_QUOTA_LIMIT_REPLY.en);
    expect(resolveQuotaLimitReply(chat, "de")).toBe(DEFAULT_QUOTA_LIMIT_REPLY.en);
    expect(resolveQuotaLimitReply(chat, "ru")).toBe(DEFAULT_QUOTA_LIMIT_REPLY.ru);
  });
});
