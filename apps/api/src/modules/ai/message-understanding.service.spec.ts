import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFallbackPreprocessorResult } from "@health/types";
import { AiBehaviorConfigService } from "./ai-behavior-config.service.js";
import { CapabilityRegistryService } from "./capability-registry.service.js";
import { MessageUnderstandingService } from "./message-understanding.service.js";

const mockGenerateMessageUnderstanding = vi.hoisted(() => vi.fn());

vi.mock("./coach-provider.factory.js", () => ({
  createCoachAiProvider: vi.fn(() => ({
    generateMessageUnderstanding: mockGenerateMessageUnderstanding,
  })),
  resolveAiCoachProviderMode: vi.fn(() => "stub"),
}));

describe("MessageUnderstandingService", () => {
  beforeEach(() => {
    mockGenerateMessageUnderstanding.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function createService() {
    const aiBehaviorConfigService = new AiBehaviorConfigService();
    const capabilityRegistryService = new CapabilityRegistryService(aiBehaviorConfigService);
    return new MessageUnderstandingService(aiBehaviorConfigService, capabilityRegistryService);
  }

  it("builds a typed request from preprocessor output and attachment summaries", () => {
    const service = createService();
    const preprocessorResult = createFallbackPreprocessorResult({
      userMessage: "Can you review this meal photo?",
      hasAttachments: true,
    });

    const request = service.buildRequest({
      preprocessorResult,
      attachmentContextSummaries: [
        {
          attachmentRefId: "a1000001-0000-4000-8000-000000000001",
          category: "food_photo",
          status: "ready",
          routingCapabilityId: "attachment_food_photo",
          contextHint: "Prepared food photo context",
          recognitionPresent: true,
        },
      ],
      recentMessages: [{ role: "user", content: "Here is my lunch" }],
    });

    expect(request.originalText).toBe(preprocessorResult.originalText);
    expect(request.attachmentContextSummaries).toHaveLength(1);
    expect(request.catalogHints.length).toBeGreaterThan(0);
    expect(request.recentMessageHints).toEqual([
      { role: "user", content: "Here is my lunch" },
    ]);
  });

  it("returns validated llm understanding when provider output is valid", async () => {
    const service = createService();
    const providerOutput = {
      signals: ["question" as const],
      entities: [],
      capabilityHints: [{ capabilityId: "general" as const, confidence: 0.81 }],
      complexity: "simple" as const,
      directCommand: { detected: false },
      safetyFlags: [],
      needsContext: [],
      confidence: 0.81,
    };

    mockGenerateMessageUnderstanding.mockResolvedValue(providerOutput);

    const result = await service.understand({
      preprocessorResult: createFallbackPreprocessorResult({
        userMessage: "How am I doing this week?",
      }),
    });

    expect(result.source).toBe("llm");
    expect(result.validationErrors).toEqual([]);
    expect(result.output).toEqual(providerOutput);
  });

  it.each([
    ["reply", "You should rest today."],
    ["proposals", [{ intent: "adapt_workout_plan" }]],
    ["catalogIntentId", "adjust_workout"],
    ["expectedResponseMode", "advice_only"],
  ] as const)(
    "fail-closes to low-confidence fallback when provider returns forbidden field %s",
    async (forbiddenField, forbiddenValue) => {
      const service = createService();

      mockGenerateMessageUnderstanding.mockResolvedValue({
        signals: [],
        entities: [],
        capabilityHints: [{ capabilityId: "general", confidence: 0.9 }],
        complexity: "simple",
        directCommand: { detected: false },
        safetyFlags: [],
        needsContext: [],
        confidence: 0.9,
        [forbiddenField]: forbiddenValue,
      });

      const result = await service.understand({
        preprocessorResult: createFallbackPreprocessorResult({
          userMessage: "I feel sore after training.",
        }),
      });

      expect(result.source).toBe("fallback");
      expect(result.output.confidence).toBe(0.35);
      expect(result.validationErrors.some((error) => error.includes(forbiddenField))).toBe(true);
    },
  );

  it("fail-closes to fallback when provider throws", async () => {
    const service = createService();

    mockGenerateMessageUnderstanding.mockRejectedValue(new Error("provider timeout"));

    const result = await service.understand({
      preprocessorResult: createFallbackPreprocessorResult({
        userMessage: "Help me adjust my plan.",
      }),
    });

    expect(result.source).toBe("fallback");
    expect(result.output.confidence).toBe(0.35);
    expect(result.validationErrors).toEqual(["provider timeout"]);
  });
});
