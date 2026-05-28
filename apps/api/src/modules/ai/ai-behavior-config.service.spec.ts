import {
  buildDefaultAiBehaviorConfig,
  buildDefaultAttachmentBehaviorConfig,
  normalizeAiBehaviorConfig,
  normalizeAttachmentBehaviorConfig,
  resolveLoadedAiBehaviorConfig,
  resolveLoadedAttachmentBehaviorConfig,
} from "@health/types";
import { describe, expect, it, vi } from "vitest";
import { AiBehaviorConfigService } from "./ai-behavior-config.service.js";
import { LocalChatAttachmentClassificationProvider } from "../chat-attachments/local-chat-attachment-classification.provider.js";
import { OpenAiChatAttachmentClassificationProvider } from "../chat-attachments/openai-chat-attachment-classification.provider.js";

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
    expect(service.getAttachmentRouting().defaultCapabilityId).toBe("attachment_food_photo");
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

  it("uses attachment behavior routing as the sole runtime routing source", () => {
    const attachmentDefaults = buildDefaultAttachmentBehaviorConfig();
    const attachmentConfig = normalizeAttachmentBehaviorConfig({
      routing: {
        ...attachmentDefaults.routing,
        defaultCapabilityId: "attachment_workout",
        categoryToCapability: {
          ...attachmentDefaults.routing.categoryToCapability,
          food_photo: "attachment_workout",
        },
      },
    });
    const aiBehaviorConfig = normalizeAiBehaviorConfig({
      attachmentRouting: {
        ...buildDefaultAiBehaviorConfig().attachmentRouting,
        defaultCapabilityId: "attachment_food_photo",
      },
    });

    const service = new AiBehaviorConfigService(
      {
        config: aiBehaviorConfig,
        source: "file",
        errors: [],
        warnings: [],
      },
      {
        config: attachmentConfig,
        source: "file",
        errors: [],
        warnings: [],
      },
    );

    expect(service.getAttachmentRouting().defaultCapabilityId).toBe("attachment_workout");
    expect(service.getAttachmentRouting().categoryToCapability.food_photo).toBe("attachment_workout");
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

describe("config-driven attachment classification providers", () => {
  it("changes dev classification rationale from attachment config", async () => {
    const defaults = buildDefaultAttachmentBehaviorConfig();
    const attachmentConfig = normalizeAttachmentBehaviorConfig({
      classification: {
        ...defaults.classification,
        rationales: {
          ...defaults.classification.rationales,
          devAmbiguousManualFallback: "Attachment-config dev fallback copy.",
        },
      },
    });
    const service = new AiBehaviorConfigService(
      resolveLoadedAiBehaviorConfig({ defaults: buildDefaultAiBehaviorConfig() }),
      {
        config: attachmentConfig,
        source: "file",
        errors: [],
        warnings: [],
      },
    );
    const provider = new LocalChatAttachmentClassificationProvider(service);

    const result = await provider.classify({
      message: "",
      filename: "IMG_1234.jpg",
      mimeType: "image/jpeg",
      attachmentId: "u1000001-0000-4000-8000-000000000001",
      content: Buffer.from("fake-image"),
      userSelectedCategory: null,
      hasMedicalConsent: false,
    });

    expect(result.rationale).toBe("Attachment-config dev fallback copy.");
  });

  it("changes OpenAI classifier prompts from attachment config", async () => {
    const defaults = buildDefaultAttachmentBehaviorConfig();
    const attachmentConfig = normalizeAttachmentBehaviorConfig({
      classification: {
        ...defaults.classification,
        llmClassifierPrompt: "CONFIG_ONLY_SYSTEM_PROMPT",
        llmUserPromptIntro: "CONFIG_ONLY_USER_INTRO",
      },
    });
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                category: "workout_attachment",
                confidence: "medium",
                rationale: "Training equipment visible.",
                suggestedAction: "run_category_recognition",
                mealContextLabel: null,
              }),
            },
          },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAiChatAttachmentClassificationProvider({
      apiKey: "test-key",
      model: "gpt-4o-mini",
      classification: attachmentConfig.classification,
    });

    await provider.classify({
      message: "",
      filename: "IMG_1234.jpg",
      mimeType: "image/jpeg",
      attachmentId: "u1000001-0000-4000-8000-000000000001",
      content: Buffer.from("fake-image"),
      userSelectedCategory: null,
      hasMedicalConsent: false,
    });

    const fetchCall = fetchMock.mock.calls[0] as [string, RequestInit] | undefined;
    const requestBody = JSON.parse(String(fetchCall?.[1]?.body)) as {
      messages: Array<{ role: string; content: string | Array<{ text?: string }> }>;
    };

    expect(requestBody.messages[0]?.content).toBe("CONFIG_ONLY_SYSTEM_PROMPT");
    const userText = requestBody.messages[1]?.content;
    const userPrompt = Array.isArray(userText) ? userText[0]?.text : userText;
    expect(userPrompt).toContain("CONFIG_ONLY_USER_INTRO");

    vi.unstubAllGlobals();
  });
});
