import {
  buildDefaultAiBehaviorConfig,
  buildDefaultAttachmentBehaviorConfig,
  resolveLoadedAiBehaviorConfig,
  resolveLoadedAttachmentBehaviorConfig,
} from "@health/types";
import { describe, expect, it } from "vitest";
import { AiBehaviorConfigService } from "./ai-behavior-config.service.js";

describe("AiBehaviorConfigService", () => {
  it("exposes repo-backed config sections from preload result", () => {
    const service = new AiBehaviorConfigService(
      resolveLoadedAiBehaviorConfig({ defaults: buildDefaultAiBehaviorConfig() }),
      resolveLoadedAttachmentBehaviorConfig({
        defaults: buildDefaultAttachmentBehaviorConfig(),
      }),
    );

    expect(service.getLoadSource()).toBe("defaults");
    expect(service.getAttachmentLoadSource()).toBe("defaults");
    expect(service.getDirectPaths().enabled).toBe(true);
    expect(service.getProposalRevisionRouting().fallbackCapabilityId).toBe("general");
    expect(service.getDeterministicProposalTriggers().wellbeingCheckin.enabled).toBe(true);
    expect(service.getAttachmentBehavior().turnStages.order[0]).toBe("validate_refs");
  });

  it("falls back to defaults when attachment preload is invalid", () => {
    const defaults = buildDefaultAttachmentBehaviorConfig();
    const service = new AiBehaviorConfigService(
      resolveLoadedAiBehaviorConfig({ defaults: buildDefaultAiBehaviorConfig() }),
      resolveLoadedAttachmentBehaviorConfig({
        fileValue: { version: 99 },
        defaults,
      }),
    );

    expect(service.getAttachmentLoadSource()).toBe("defaults");
    expect(service.getAttachmentBehavior()).toEqual(defaults);
    expect(service.getAttachmentLoadErrors().length).toBeGreaterThan(0);
    expect(service.getAttachmentLoadWarnings()).toContain(
      "Invalid attachment behavior config; using built-in defaults.",
    );
    expect(service.getAttachmentBehavior().safetyFloors.requireMedicalConsent).toBe(true);
  });

  it("compiles live pipeline router template with safe fallback for invalid config bodies", () => {
    // openai_coach_loop was removed; the live pipeline uses router/domain_*/decision keys.
    const defaults = buildDefaultAiBehaviorConfig();
    const service = new AiBehaviorConfigService({
      config: {
        ...defaults,
        promptTemplates: {
          templates: {
            router: {
              templateKey: "router",
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

    // Invalid body → falls back to default
    expect(service.getCompiledPromptTemplates().templates.router.source).toBe("default");
    const rendered = service.getCompiledPromptTemplates().renderRouterDecision({
      normalizedText: "test",
      originalText: "test",
      detectedLanguage: "en",
      preprocessorJson: "{}",
      attachmentHintsJson: "[]",
      recentMessageHintsJson: "[]",
      availableDomainsJson: "[]",
      safetyGuardrailsJson: "[]",
    });
    expect(rendered).toContain("domain router");
  });

  it("openai_coach_loop is not a live template key in compiled templates", () => {
    const service = new AiBehaviorConfigService(
      resolveLoadedAiBehaviorConfig({ defaults: buildDefaultAiBehaviorConfig() }),
      resolveLoadedAttachmentBehaviorConfig({ defaults: buildDefaultAttachmentBehaviorConfig() }),
    );

    // The old single-LLM coach loop was removed; only fan-out pipeline keys should exist
    expect("openai_coach_loop" in service.getCompiledPromptTemplates().templates).toBe(false);
    expect("renderCoachLoop" in service.getCompiledPromptTemplates()).toBe(false);
  });
});
