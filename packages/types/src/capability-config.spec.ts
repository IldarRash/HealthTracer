import { describe, expect, it } from "vitest";
import {
  AGENT_CAPABILITY_CONFIGS,
  AGENT_INTENT_CATALOG,
  capabilityActionDescriptorSchema,
  capabilityCompositionMetadataSchema,
  capabilityConfigSchema,
  capabilityWidgetDescriptorSchema,
  convertCatalogEntryToCapabilityConfig,
  DEFAULT_CAPABILITY_COMPOSITION_METADATA,
  getActionDescriptorsForCapability,
  getAllowedProposalsForCapability,
  getAllowedToolsForCapability,
  getCapabilityConfig,
  getCompositionMetadataForCapability,
  getWidgetDescriptorsForCapability,
  listRouterCapabilityConfigs,
  resolveCapabilityPresentationMetadata,
  resolveSelectedCapabilityIds,
  resolveSelectedCapabilityIdsFromComposition,
  safeParseCapabilityConfig,
  serializeCapabilityConfigsForRouter,
  serializeIntentCatalogForRouter,
  validateCapabilityConfig,
} from "./index.js";

describe("capability config", () => {
  it("validates every mirrored catalog entry as capability config", () => {
    expect(AGENT_CAPABILITY_CONFIGS.length).toBe(AGENT_INTENT_CATALOG.length);

    for (const entry of AGENT_INTENT_CATALOG) {
      const config = convertCatalogEntryToCapabilityConfig(entry);
      const parsed = safeParseCapabilityConfig(config);

      expect(parsed.success, `expected ${entry.id} to validate`).toBe(true);
      if (parsed.success) {
        expect(parsed.data.capabilityId).toBe(entry.id);
      }
    }
  });

  it("derives router serialization from capability config with catalog parity", () => {
    const fromCatalog = serializeIntentCatalogForRouter();
    const fromCapabilities = serializeCapabilityConfigsForRouter();

    expect(fromCapabilities).toEqual(fromCatalog);
  });

  it("exposes only normal capabilities to the text router list", () => {
    const routerConfigs = listRouterCapabilityConfigs();

    expect(routerConfigs.every((config) => config.kind === "normal")).toBe(true);
    expect(routerConfigs.some((config) => config.capabilityId === "attachment_food_photo")).toBe(
      false,
    );
    expect(routerConfigs.some((config) => config.capabilityId === "proposal_explainer")).toBe(
      false,
    );
  });

  it("matches catalog allowlists for representative capabilities", () => {
    expect(getAllowedToolsForCapability("general")).toEqual(["getUserContextSlice"]);
    expect(getAllowedProposalsForCapability("general")).toEqual([
      "update_profile",
      "create_goal",
      "update_goal",
    ]);

    expect(getAllowedToolsForCapability("adjust_workout")).toEqual([
      "getUserContextSlice",
      "getWeeklyProgressContext",
    ]);
    expect(getAllowedProposalsForCapability("adjust_workout")).toEqual([
      "create_workout_plan",
      "adapt_workout_plan",
      "adapt_workout_plan_from_progress",
    ]);

    expect(getAllowedToolsForCapability("attachment_medical_document")).toEqual([
      "getDocumentContext",
    ]);
    expect(getAllowedProposalsForCapability("attachment_medical_document")).toEqual([]);
  });

  it("keeps proposal explainer read-only with empty presentation descriptors", () => {
    const explainer = getCapabilityConfig("proposal_explainer");

    expect(explainer.responseMetadata).toEqual({
      defaultRoutingMethod: "rule_based",
      expectedResponseMode: "advice_only",
    });
    expect(explainer.allowedProposals).toEqual([]);
    expect(explainer.widgetDescriptors).toEqual([]);
    expect(explainer.actionDescriptors).toEqual([]);
    expect(explainer.compositionMetadata).toEqual(DEFAULT_CAPABILITY_COMPOSITION_METADATA);
  });

  it("includes response metadata derived from catalog mapping", () => {
    const general = getCapabilityConfig("general");
    const foodPhoto = getCapabilityConfig("attachment_food_photo");

    expect(general.responseMetadata).toEqual({
      defaultRoutingMethod: "llm_router",
      expectedResponseMode: "advice_only",
    });
    expect(foodPhoto.responseMetadata).toEqual({
      defaultRoutingMethod: "attachment_family",
      expectedResponseMode: "recommendation_with_optional_proposal",
    });
  });

  it("returns deterministic validation errors for invalid config", () => {
    const invalid = {
      capabilityId: "general",
      kind: "normal",
      description: "",
      routingGuidance: "Use for general coaching.",
      examples: [],
      defaultContextStrategy: { type: "general_chat" },
      allowedTools: ["getUserContextSlice"],
      allowedProposals: [],
      safetyNotes: [],
      prompt: "Coach the user.",
      mappedAgentIntent: "general",
    };

    const result = safeParseCapabilityConfig(invalid);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((error) => error.startsWith("description:"))).toBe(true);
      expect(validateCapabilityConfig(invalid)).toEqual(result.errors);
    }
  });

  it("rejects unknown capability ids at lookup time", () => {
    expect(() => getCapabilityConfig("not_a_capability" as "general")).toThrow(
      /Unknown capability id/,
    );
  });

  it("applies default composition metadata for catalog-derived configs", () => {
    for (const config of AGENT_CAPABILITY_CONFIGS) {
      expect(config.compositionMetadata).toEqual(DEFAULT_CAPABILITY_COMPOSITION_METADATA);
    }

    expect(getCompositionMetadataForCapability("general")).toEqual(
      DEFAULT_CAPABILITY_COMPOSITION_METADATA,
    );
  });

  it("derives widget and action descriptors from allowed proposals", () => {
    const workout = getCapabilityConfig("adjust_workout");

    expect(workout.widgetDescriptors).toEqual([
      { id: "create_workout_plan_card", type: "proposal_card", proposalIntent: "create_workout_plan" },
      { id: "adapt_workout_plan_card", type: "proposal_card", proposalIntent: "adapt_workout_plan" },
      {
        id: "adapt_workout_plan_from_progress_card",
        type: "proposal_card",
        proposalIntent: "adapt_workout_plan_from_progress",
      },
    ]);
    expect(workout.actionDescriptors).toEqual([
      { id: "create_workout_plan", type: "create_proposal", proposalIntent: "create_workout_plan" },
      { id: "adapt_workout_plan", type: "create_proposal", proposalIntent: "adapt_workout_plan" },
      {
        id: "adapt_workout_plan_from_progress",
        type: "create_proposal",
        proposalIntent: "adapt_workout_plan_from_progress",
      },
    ]);

    expect(getWidgetDescriptorsForCapability("attachment_medical_document")).toEqual([]);
    expect(getActionDescriptorsForCapability("attachment_medical_document")).toEqual([]);
  });

  it("parses configs missing composition and metadata fields with defaults", () => {
    const minimal = {
      capabilityId: "general",
      kind: "normal",
      description: "General coaching.",
      routingGuidance: "Use for general coaching.",
      examples: ["Stay consistent."],
      defaultContextStrategy: { type: "general_chat" },
      allowedTools: ["getUserContextSlice"],
      allowedProposals: ["update_profile"],
      safetyNotes: ["Do not diagnose."],
      prompt: "Coach the user.",
      mappedAgentIntent: "general",
    };

    const parsed = capabilityConfigSchema.parse(minimal);

    expect(parsed.compositionMetadata).toEqual(DEFAULT_CAPABILITY_COMPOSITION_METADATA);
    expect(parsed.widgetDescriptors).toEqual([]);
    expect(parsed.actionDescriptors).toEqual([]);
  });

  it("validates representative composition and metadata descriptors", () => {
    const composition = capabilityCompositionMetadataSchema.parse({
      strategy: "additive_supporting",
      relatedCapabilities: ["ask_about_today"],
      secondaryCapabilities: ["review_progress"],
    });
    const widget = capabilityWidgetDescriptorSchema.parse({
      id: "workout_plan_change_card",
      type: "proposal_card",
      proposalIntent: "adapt_workout_plan",
    });
    const action = capabilityActionDescriptorSchema.parse({
      id: "create_adapt_workout_plan",
      type: "create_proposal",
      proposalIntent: "adapt_workout_plan",
    });

    expect(composition.strategy).toBe("additive_supporting");
    expect(widget.proposalIntent).toBe("adapt_workout_plan");
    expect(action.type).toBe("create_proposal");
  });

  it("rejects invalid composition and metadata descriptors", () => {
    expect(
      capabilityCompositionMetadataSchema.safeParse({
        strategy: "primary_only",
        relatedCapabilities: ["not_a_capability"],
        secondaryCapabilities: [],
      }).success,
    ).toBe(false);

    expect(
      capabilityWidgetDescriptorSchema.safeParse({
        id: "",
        type: "proposal_card",
      }).success,
    ).toBe(false);

    expect(
      capabilityActionDescriptorSchema.safeParse({
        id: "create_proposal",
        type: "",
      }).success,
    ).toBe(false);
  });

  it("resolves selected capability ids with primary first", () => {
    expect(resolveSelectedCapabilityIds("adjust_workout")).toEqual(["adjust_workout"]);
    expect(
      resolveSelectedCapabilityIds("adjust_workout", [
        "ask_about_today",
        "adjust_workout",
        "review_progress",
      ]),
    ).toEqual(["adjust_workout", "ask_about_today", "review_progress"]);
  });

  it("resolves selected capability ids from composition metadata", () => {
    expect(
      resolveSelectedCapabilityIdsFromComposition("adjust_workout", {
        strategy: "primary_only",
        relatedCapabilities: ["ask_about_today"],
        secondaryCapabilities: [],
      }),
    ).toEqual(["adjust_workout"]);

    expect(
      resolveSelectedCapabilityIdsFromComposition("adjust_workout", {
        strategy: "additive_supporting",
        relatedCapabilities: ["ask_about_today"],
        secondaryCapabilities: ["review_progress", "ask_about_today"],
      }),
    ).toEqual(["adjust_workout", "ask_about_today", "review_progress"]);
  });

  it("merges presentation metadata across selected capabilities deterministically", () => {
    const merged = resolveCapabilityPresentationMetadata("adjust_workout", {
      selectedCapabilityIds: ["adjust_workout", "ask_about_today"],
    });

    expect(merged.primaryCapabilityId).toBe("adjust_workout");
    expect(merged.compositionStrategy).toBe("primary_only");
    expect(merged.widgetDescriptors.length).toBeGreaterThan(0);
    expect(merged.actionDescriptors.length).toBeGreaterThan(0);
    expect(merged.widgetDescriptors.map((descriptor) => descriptor.id)).toEqual([
      ...new Set(merged.widgetDescriptors.map((descriptor) => descriptor.id)),
    ]);
  });
});
