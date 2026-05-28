import { describe, expect, it } from "vitest";
import { buildDefaultAiBehaviorConfig, resolveLoadedAiBehaviorConfig } from "@health/types";
import { AiBehaviorConfigService } from "./ai-behavior-config.service.js";

describe("AiBehaviorConfigService", () => {
  it("exposes repo-backed config sections from preload result", () => {
    const service = new AiBehaviorConfigService(
      resolveLoadedAiBehaviorConfig({ defaults: buildDefaultAiBehaviorConfig() }),
    );

    expect(service.getLoadSource()).toBe("defaults");
    expect(service.getDirectPaths().enabled).toBe(true);
    expect(service.getProposalRevisionRouting().fallbackCapabilityId).toBe("general");
    expect(service.getDeterministicProposalTriggers().wellbeingCheckin.enabled).toBe(true);
  });

  it("compiles prompt templates with safe fallback for invalid config bodies", () => {
    const defaults = buildDefaultAiBehaviorConfig();
    const service = new AiBehaviorConfigService({
      config: {
        ...defaults,
        promptTemplates: {
          templates: {
            openai_intent_router: {
              templateKey: "openai_intent_router",
              body: "Broken template without required placeholders",
              placeholders: [],
            },
          },
        },
      },
      source: "defaults",
      errors: [],
      warnings: [],
    });

    expect(service.getCompiledPromptTemplates().templates.openai_intent_router.source).toBe(
      "default",
    );
    expect(service.getCompiledPromptTemplates().renderIntentRouter({ intentCatalogJson: "[]" })).toContain(
      "internal intent router",
    );
  });
});
