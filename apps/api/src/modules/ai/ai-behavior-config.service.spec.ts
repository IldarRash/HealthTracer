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

  it("compiles prompt templates with safe fallback for invalid config bodies", () => {
    const defaults = buildDefaultAiBehaviorConfig();
    const service = new AiBehaviorConfigService({
      config: {
        ...defaults,
        promptTemplates: {
          templates: {
            openai_coach_loop: {
              templateKey: "openai_coach_loop",
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

    expect(service.getCompiledPromptTemplates().templates.openai_coach_loop.source).toBe("default");
    expect(
      service.getCompiledPromptTemplates().renderCoachLoop({
        iteration: "1",
        maxIterations: "3",
        selectedIntentLabel: "general",
        intentInstructions: "Coach",
        intentSafetyGuidance: "none",
        allowedTools: "getUserContextSlice",
        allowedProposalIntents: "none",
        taskPurpose: "general_chat",
        taskIntent: "general",
        expectedResponseMode: "advice_only",
        safetyFlags: "none",
        missingContextNotes: "none",
        priorToolResultsJson: "none",
        safetyConstraints: "Stay conservative",
        coachingContextJson: "{}",
      }),
    ).toContain("AI wellness coach");
  });
});

