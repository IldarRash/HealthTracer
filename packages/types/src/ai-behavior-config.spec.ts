import { describe, expect, it } from "vitest";
import {
  buildDefaultAiBehaviorConfig,
  mergeCapabilityConfigOverrides,
  normalizeAiBehaviorConfig,
  resolveLoadedAiBehaviorConfig,
  resolvePrimaryAttachmentCapabilityId,
  resolveProposalRevisionCapabilityId,
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
  DEFAULT_CONTEXT_BUDGET_POLICY,
  DEEP_REVIEW_CONTEXT_BUDGET_POLICY,
} from "./context-budget.js";
import { resolvePrimaryAttachmentCatalogIntentId } from "./intent-catalog.js";

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

  it("matches existing attachment routing priority semantics", () => {
    const config = buildDefaultAiBehaviorConfig();

    expect(
      resolvePrimaryAttachmentCapabilityId(config.attachmentRouting, [
        "food_photo",
        "workout_attachment",
      ]),
    ).toBe("attachment_workout");
    expect(
      resolvePrimaryAttachmentCapabilityId(config.attachmentRouting, [
        "food_photo",
        "medical_document",
      ]),
    ).toBe("attachment_medical_document");
    expect(
      resolvePrimaryAttachmentCapabilityId(config.attachmentRouting, ["food_photo"]),
    ).toBe("attachment_food_photo");
    expect(
      resolvePrimaryAttachmentCatalogIntentId({
        categories: ["food_photo", "workout_attachment"],
      }),
    ).toBe(
      resolvePrimaryAttachmentCapabilityId(config.attachmentRouting, [
        "food_photo",
        "workout_attachment",
      ]),
    );
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
    ]);
    expect(defaults.directPaths.kinds).toHaveLength(2);
    expect(defaults.directPaths.kinds[0]?.matchPatterns.length).toBeGreaterThan(0);
  });

  it("exposes deep review profile parity with legacy constants", () => {
    const defaults = buildDefaultAiBehaviorConfig();

    expect(defaults.contextBudgets.profiles.default).toEqual(DEFAULT_CONTEXT_BUDGET_POLICY);
    expect(defaults.contextBudgets.profiles.deep_review).toEqual(DEEP_REVIEW_CONTEXT_BUDGET_POLICY);
  });

  it("changes attachment routing priority from config without code changes", () => {
    const config = normalizeAiBehaviorConfig({
      attachmentRouting: {
        categoryPriority: ["food_photo", "medical_document", "workout_attachment"],
      },
    } as Partial<AiBehaviorConfig>);

    expect(
      resolvePrimaryAttachmentCapabilityId(config.attachmentRouting, [
        "workout_attachment",
        "food_photo",
      ]),
    ).toBe("attachment_food_photo");
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
