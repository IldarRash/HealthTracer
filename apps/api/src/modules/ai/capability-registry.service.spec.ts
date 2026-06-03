import { describe, expect, it } from "vitest";
import {
  AGENT_CAPABILITY_CONFIGS,
  getCapabilityConfig,
  serializeCapabilityConfigsForRouter,
  serializeIntentCatalogForRouter,
} from "@health/types";
import { CapabilityRegistryService } from "./capability-registry.service.js";
import { createDefaultAiBehaviorConfigService } from "./test-ai-behavior-fixtures.js";

describe("CapabilityRegistryService", () => {
  const registry = new CapabilityRegistryService(createDefaultAiBehaviorConfigService());

  it("loads and validates every mirrored capability config", () => {
    expect(registry.listConfigs().length).toBe(AGENT_CAPABILITY_CONFIGS.length);
    expect(registry.getConfig("general").capabilityId).toBe("general");
  });

  it("serializes router catalog with catalog parity", () => {
    expect(registry.serializeForRouter()).toEqual(serializeIntentCatalogForRouter());
    expect(registry.serializeForRouter()).toEqual(
      serializeCapabilityConfigsForRouter(registry.listRouterConfigs()),
    );
  });

  it("exposes only normal capabilities to the router list", () => {
    expect(registry.listRouterConfigs().every((config) => config.kind === "normal")).toBe(true);
    expect(
      registry.listRouterConfigs().some((config) => config.capabilityId === "attachment_food_photo"),
    ).toBe(false);
  });

  it("derives coach intent metadata from capability config", () => {
    const config = getCapabilityConfig("adjust_workout");
    const metadata = registry.getCoachIntentDefinition("adjust_workout");

    expect(metadata.id).toBe("adjust_workout");
    expect(metadata.promptInstructions).toBe(config.prompt);
    expect(metadata.safetyGuidance).toEqual(config.safetyNotes);
    expect(metadata.allowedTools).toEqual(config.allowedTools);
    expect(metadata.allowedProposalIntents).toEqual(config.allowedProposals);
  });

  it("falls back to general for unknown capability ids", () => {
    const fallback = registry.getConfig("general");

    expect(registry.getConfig("not_a_capability" as "general")).toEqual(fallback);
    expect(registry.getAllowedTools("not_a_capability" as "general")).toEqual(
      fallback.allowedTools,
    );
    expect(registry.getAllowedProposals("not_a_capability" as "general")).toEqual(
      fallback.allowedProposals,
    );
    expect(registry.resolveMappedAgentIntent("not_a_capability" as "general")).toBe("general");
    expect(registry.getCoachIntentDefinition("not_a_capability" as "general").id).toBe("general");
    expect(registry.getDefaultContextStrategy("not_a_capability" as "general")).toEqual(
      fallback.defaultContextStrategy,
    );
    expect(registry.getCompositionMetadata("not_a_capability" as "general")).toEqual(
      fallback.compositionMetadata,
    );
    expect(registry.getWidgetDescriptors("not_a_capability" as "general")).toEqual(
      fallback.widgetDescriptors,
    );
    expect(registry.getActionDescriptors("not_a_capability" as "general")).toEqual(
      fallback.actionDescriptors,
    );
  });

  it("exposes composition and presentation metadata accessors", () => {
    const workout = getCapabilityConfig("adjust_workout");

    expect(registry.getCompositionMetadata("adjust_workout")).toEqual(workout.compositionMetadata);
    expect(registry.getWidgetDescriptors("adjust_workout")).toEqual(workout.widgetDescriptors);
    expect(registry.getActionDescriptors("adjust_workout")).toEqual(workout.actionDescriptors);

    const presentation = registry.resolvePresentationMetadata("adjust_workout", [
      "adjust_workout",
      "ask_about_today",
    ]);

    expect(presentation.primaryCapabilityId).toBe("adjust_workout");
    expect(presentation.selectedCapabilityIds).toEqual(["adjust_workout", "ask_about_today"]);
    expect(presentation.widgetDescriptors.length).toBeGreaterThan(workout.widgetDescriptors.length);
  });

  it("resolves selected capabilities from composition metadata", () => {
    expect(registry.resolveSelectedCapabilityIds("adjust_workout")).toEqual(["adjust_workout"]);
    expect(registry.resolveTurnPresentationMetadata("adjust_workout")).toMatchObject({
      primaryCapabilityId: "adjust_workout",
      selectedCapabilityIds: ["adjust_workout"],
    });
  });
});
