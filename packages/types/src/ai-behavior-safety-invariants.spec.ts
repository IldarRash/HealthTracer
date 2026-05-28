import { describe, expect, it } from "vitest";
import {
  buildDefaultAiBehaviorConfig,
  mergeCapabilityConfigOverrides,
  normalizeAiBehaviorConfig,
  resolveLoadedAiBehaviorConfig,
  type AiBehaviorConfig,
} from "./ai-behavior-config.js";
import {
  shouldTriggerNutritionIncidentProposal,
  shouldTriggerRecipeRecommendationRequest,
  shouldTriggerWellbeingCheckinProposal,
} from "./chat-action-proposals.js";
import { AGENT_CAPABILITY_CONFIGS } from "./capability-config.js";
import { clampContextBudgetPolicy, CONTEXT_BUDGET_ABSOLUTE_LIMITS } from "./context-budget.js";
import {
  compileDirectPathMatcher,
  compileRegexPatternRule,
  detectDirectChatPathCandidateFromConfig,
} from "./direct-chat-path-matcher.js";
import {
  compileProposalExplainerMatcher,
  detectProposalExplainerRequestFromConfig,
} from "./proposal-explainer-matcher.js";
import { compilePromptTemplates } from "./prompt-template-renderer.js";

describe("ai behavior safety invariants", () => {
  describe("invalid config fail-closed loading", () => {
    it("replaces invalid file config with full defaults instead of partial merge", () => {
      const defaults = buildDefaultAiBehaviorConfig();
      const loaded = resolveLoadedAiBehaviorConfig({
        fileValue: {
          version: 1,
          directPaths: { enabled: false },
        },
        defaults,
      });

      expect(loaded.source).toBe("defaults");
      expect(loaded.config).toEqual(defaults);
      expect(loaded.errors.length).toBeGreaterThan(0);
    });

    it("rejects config profiles that exceed absolute budget limits at parse time", () => {
      expect(() =>
        normalizeAiBehaviorConfig({
          contextBudgets: {
            profiles: {
              default: {
                profile: "default",
                maxSlices: CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxSlices + 1,
                maxRawItems: 0,
                maxLookbackDays: 7,
                allowDocuments: false,
                allowSensitiveHealthContext: false,
                maxExpansionRounds: 0,
                maxSlicesPerExpansionRound: 0,
              },
            },
          },
        } as unknown as Partial<AiBehaviorConfig>),
      ).toThrow();
    });

    it("clamps resolved budget numeric limits to code-owned absolute limits", () => {
      const clamped = clampContextBudgetPolicy({
        profile: "default",
        maxSlices: CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxSlices + 5,
        maxRawItems: CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxRawItems + 5,
        maxLookbackDays: CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxLookbackDays + 30,
        allowDocuments: true,
        allowSensitiveHealthContext: true,
        maxExpansionRounds: CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxExpansionRounds + 2,
        maxSlicesPerExpansionRound: CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxSlicesPerExpansionRound + 2,
      });

      expect(clamped.maxSlices).toBe(CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxSlices);
      expect(clamped.maxRawItems).toBe(CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxRawItems);
      expect(clamped.maxLookbackDays).toBe(CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxLookbackDays);
      expect(clamped.maxExpansionRounds).toBe(CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxExpansionRounds);
      expect(clamped.maxSlicesPerExpansionRound).toBe(
        CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxSlicesPerExpansionRound,
      );
      expect(clamped.allowDocuments).toBe(false);
      expect(clamped.allowSensitiveHealthContext).toBe(false);
    });

    it("cannot enable documents or sensitive health via loaded file config", () => {
      const defaults = buildDefaultAiBehaviorConfig();
      const loaded = resolveLoadedAiBehaviorConfig({
        fileValue: {
          ...defaults,
          contextBudgets: {
            ...defaults.contextBudgets,
            profiles: {
              default: {
                ...defaults.contextBudgets.profiles.default,
                allowDocuments: true,
                allowSensitiveHealthContext: true,
              },
              deep_review: {
                ...defaults.contextBudgets.profiles.deep_review,
                allowDocuments: true,
                allowSensitiveHealthContext: true,
              },
            },
          },
        },
        defaults,
      });

      expect(loaded.source).toBe("file");
      expect(loaded.config.contextBudgets.profiles.default.allowDocuments).toBe(false);
      expect(loaded.config.contextBudgets.profiles.default.allowSensitiveHealthContext).toBe(
        false,
      );
      expect(loaded.config.contextBudgets.profiles.deep_review.allowDocuments).toBe(false);
      expect(loaded.config.contextBudgets.profiles.deep_review.allowSensitiveHealthContext).toBe(
        false,
      );
      expect(
        loaded.warnings.some((warning) => warning.includes("document/sensitive-health")),
      ).toBe(true);
    });

    it("falls back to default deep-review trigger regex when file patterns are invalid", () => {
      const defaults = buildDefaultAiBehaviorConfig();
      const loaded = resolveLoadedAiBehaviorConfig({
        fileValue: {
          ...defaults,
          contextBudgets: {
            ...defaults.contextBudgets,
            triggers: {
              ...defaults.contextBudgets.triggers,
              monthlyReviewMessagePattern: "(unclosed",
              multiDomainMessagePattern: "[invalid",
            },
          },
        },
        defaults,
      });

      expect(loaded.config.contextBudgets.triggers.monthlyReviewMessagePattern).toBe(
        defaults.contextBudgets.triggers.monthlyReviewMessagePattern,
      );
      expect(loaded.config.contextBudgets.triggers.multiDomainMessagePattern).toBe(
        defaults.contextBudgets.triggers.multiDomainMessagePattern,
      );
      expect(loaded.warnings.some((warning) => warning.includes("invalid regex"))).toBe(true);
    });
  });

  describe("invalid regex and template fallback", () => {
    it("drops invalid direct-path regex rules instead of matching broadly", () => {
      expect(compileRegexPatternRule({ source: "(unclosed", flags: "i" })).toBeNull();

      const matcher = compileDirectPathMatcher(
        normalizeAiBehaviorConfig({
          directPaths: {
            kinds: [
              {
                kind: "today_summary_read",
                refreshHintsOnExecuted: [],
                matchPatterns: [{ source: "(unclosed", flags: "i" }],
                negativePatterns: [],
              },
            ],
            detectionOrder: ["today_summary_read"],
          },
        } as unknown as Partial<AiBehaviorConfig>).directPaths,
      );

      expect(matcher.kindsByOrder[0]?.matchPatterns).toEqual([]);
      expect(detectDirectChatPathCandidateFromConfig(matcher.config, "What is today?")).toBeNull();
    });

    it("drops invalid proposal explainer regex rules instead of detecting explainer turns", () => {
      const config = normalizeAiBehaviorConfig({
        proposalExplainer: {
          detectionPatterns: {
            positivePatterns: [{ source: "(unclosed", flags: "i" }],
            negativePatterns: [],
          },
        },
      } as unknown as Partial<AiBehaviorConfig>).proposalExplainer;

      expect(compileProposalExplainerMatcher(config).positivePatterns).toEqual([]);
      expect(detectProposalExplainerRequestFromConfig(config, "Why this proposal?")).toBe(false);
    });

    it("falls back to default prompt templates when config bodies are invalid", () => {
      const compiled = compilePromptTemplates({
        templates: {
          openai_intent_router: {
            templateKey: "openai_intent_router",
            body: "Broken template without placeholders",
            placeholders: [],
          },
        },
      });

      expect(compiled.templates.openai_intent_router.source).toBe("default");
      expect(compiled.renderIntentRouter({ intentCatalogJson: "[]" })).toContain(
        "internal intent router",
      );
    });
  });

  describe("direct path and explainer guards", () => {
    it("blocks direct paths when attachments are present even with permissive match patterns", () => {
      const config = normalizeAiBehaviorConfig({
        directPaths: {
          blockWhenAttachments: true,
          kinds: [
            {
              kind: "today_summary_read",
              refreshHintsOnExecuted: [],
              matchPatterns: [{ source: ".*", flags: "i" }],
              negativePatterns: [],
            },
          ],
          detectionOrder: ["today_summary_read"],
        },
      } as unknown as Partial<AiBehaviorConfig>).directPaths;

      expect(
        detectDirectChatPathCandidateFromConfig(config, "anything", { hasAttachments: true }),
      ).toBeNull();
    });

    it("blocks proposal explainer detection during proposal revision turns", () => {
      const config = buildDefaultAiBehaviorConfig().proposalExplainer;

      expect(
        detectProposalExplainerRequestFromConfig(config, "Why this proposal?", {
          hasProposalRevision: true,
        }),
      ).toBe(false);
    });
  });

  describe("deterministic proposal trigger safety", () => {
    it("honors skipWhenCrisis from config for wellbeing triggers", () => {
      const config = normalizeAiBehaviorConfig({
        deterministicProposalTriggers: {
          wellbeingCheckin: {
            moodPhrases: ["custom mood"],
            excludeContainsPhrases: [],
            excludeWhenNutritionIncidentSignal: false,
            requireNoTodayCheckIn: false,
            skipWhenCrisis: true,
            enabled: true,
          },
        },
      } as unknown as Partial<AiBehaviorConfig>).deterministicProposalTriggers;

      expect(shouldTriggerWellbeingCheckinProposal("custom mood", false, config)).toBe(true);
      expect(shouldTriggerWellbeingCheckinProposal("custom mood I want to die", false, config)).toBe(
        false,
      );
    });

    it("honors enabled=false from config for nutrition and recipe triggers", () => {
      const config = normalizeAiBehaviorConfig({
        deterministicProposalTriggers: {
          nutritionIncident: {
            phrases: ["cheat meal"],
            enabled: false,
            skipWhenCrisis: true,
          },
          recipeRecommendation: {
            phrases: ["dinner ideas"],
            enabled: false,
            excludeWhenNutritionIncidentSignal: true,
            skipWhenCrisis: true,
          },
        },
      } as unknown as Partial<AiBehaviorConfig>).deterministicProposalTriggers;

      expect(shouldTriggerNutritionIncidentProposal("I had a cheat meal tonight", config)).toBe(
        false,
      );
      expect(
        shouldTriggerRecipeRecommendationRequest("Can you suggest some dinner ideas?", config),
      ).toBe(false);
    });
  });

  describe("capability override safety", () => {
    it("ignores invalid capability overrides without dropping the base catalog", () => {
      const merged = mergeCapabilityConfigOverrides(AGENT_CAPABILITY_CONFIGS, [
        { capabilityId: "not-a-real-capability" } as never,
      ]);

      expect(merged.length).toBe(AGENT_CAPABILITY_CONFIGS.length);
    });
  });
});
