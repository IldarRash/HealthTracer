import { afterEach, describe, expect, it, vi } from "vitest";
import { compilePromptTemplates } from "@health/types";
import {
  createOpenAiCoachProvider,
  OpenAiCoachProviderMissingKeyError,
} from "./openai-coach-provider.js";

describe("OpenAiCoachProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws a clear error when the API key is missing", () => {
    expect(() => createOpenAiCoachProvider(undefined, "gpt-4o-mini")).toThrow(
      OpenAiCoachProviderMissingKeyError,
    );
    expect(() => createOpenAiCoachProvider("   ", "gpt-4o-mini")).toThrow(
      /OPENAI_API_KEY is not configured/,
    );
  });

  it("keeps a valid reply and drops invalid proposals instead of failing the turn", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                kind: "final_answer",
                reply: "Вот безопасный план питания как обычный ответ.",
                proposals: [
                  {
                    intent: "made_up_nutrition_intent",
                    targetDomain: "nutrition",
                    title: "Invalid",
                    reason: "Invalid",
                    proposedChanges: {},
                  },
                ],
              }),
            },
          },
        ],
      }),
    } as Response);

    const provider = createOpenAiCoachProvider("test-key", "gpt-4o-mini");
    const output = await provider.generateCoachResponse({
      userMessage: "подбери мне план питания",
      recentMessages: [],
      coachingContext: {},
      agentMetadata: {
        purpose: "nutrition_adaptation",
        intent: "adjust_nutrition",
        depth: "medium",
        timeRange: "14d",
        safetyConstraints: ["Do not diagnose."],
      },
    });

    expect(output).toEqual({
      reply: "Вот безопасный план питания как обычный ответ.",
      proposals: [],
    });
  });

  it("rejects llm router output that includes user-facing advice or proposals", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                catalogIntentId: "adjust_workout",
                confidence: 0.86,
                routingMethod: "llm_router",
                requiredContextSlices: [
                  { type: "workout_adaptation", depth: "medium", timeRange: "14d" },
                ],
                safetyFlags: ["fatigue"],
                expectedResponseMode: "recommendation_with_optional_proposal",
                reply: "You should skip training today.",
                proposals: [{ intent: "adapt_workout_plan", targetDomain: "workout" }],
              }),
            },
          },
        ],
      }),
    } as Response);

    const provider = createOpenAiCoachProvider("test-key", "gpt-4o-mini");

    await expect(
      provider.generateIntentRoute({
        userMessage: "I feel completely off today. What should I do?",
        recentMessages: [],
      }),
    ).rejects.toThrow(/must not include user-facing field/);
  });

  it("accepts valid llm router output and applies bounded context slice defaults", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                catalogIntentId: "adjust_nutrition",
                confidence: 0.84,
                routingMethod: "llm_router",
                requiredContextSlices: [
                  { type: "nutrition_adaptation" },
                  { type: "weekly_review", depth: "medium", timeRange: "7d" },
                  { type: "daily_checkin", depth: "small", timeRange: "7d" },
                ],
                safetyFlags: ["hunger"],
                expectedResponseMode: "recommendation_with_optional_proposal",
              }),
            },
          },
        ],
      }),
    } as Response);

    const provider = createOpenAiCoachProvider("test-key", "gpt-4o-mini");
    const route = await provider.generateIntentRoute({
      userMessage: "I feel tired and hungry all the time.",
      recentMessages: [],
    });

    expect(route.routingMethod).toBe("llm_router");
    expect(route.catalogIntentId).toBe("adjust_nutrition");
    expect(route.requiredContextSlices).toHaveLength(3);
    expect(route.requiredContextSlices[0]?.type).toBe("nutrition_adaptation");
    expect(route.requiredContextSlices[0]?.depth).toBe("medium");
    expect(route).not.toHaveProperty("reply");
    expect(route).not.toHaveProperty("proposals");
  });

  it("rejects attachment-family catalog ids from llm router output", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                catalogIntentId: "attachment_food_photo",
                confidence: 0.95,
                routingMethod: "llm_router",
                requiredContextSlices: [
                  { type: "nutrition_adaptation", depth: "medium", timeRange: "14d" },
                ],
                safetyFlags: [],
                expectedResponseMode: "recommendation_with_optional_proposal",
              }),
            },
          },
        ],
      }),
    } as Response);

    const provider = createOpenAiCoachProvider("test-key", "gpt-4o-mini");

    await expect(
      provider.generateIntentRoute({
        userMessage: "What is in this meal photo?",
        recentMessages: [],
      }),
    ).rejects.toThrow(/Invalid enum value|Invalid option/);
  });

  it("rejects llm router output that exceeds the max context slice count", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                catalogIntentId: "adjust_nutrition",
                confidence: 0.84,
                routingMethod: "llm_router",
                requiredContextSlices: [
                  { type: "nutrition_adaptation" },
                  { type: "weekly_review", depth: "medium", timeRange: "7d" },
                  { type: "daily_checkin", depth: "small", timeRange: "7d" },
                  { type: "general_chat", depth: "small", timeRange: "7d" },
                ],
                safetyFlags: ["hunger"],
                expectedResponseMode: "recommendation_with_optional_proposal",
              }),
            },
          },
        ],
      }),
    } as Response);

    const provider = createOpenAiCoachProvider("test-key", "gpt-4o-mini");

    await expect(
      provider.generateIntentRoute({
        userMessage: "I feel tired and hungry all the time.",
        recentMessages: [],
      }),
    ).rejects.toThrow(/Too big: expected array to have <=3 items/);
  });

  it("renders repo-backed prompt template overrides", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                catalogIntentId: "general",
                confidence: 0.8,
                routingMethod: "llm_router",
                requiredContextSlices: [
                  { type: "general_chat", depth: "medium", timeRange: "14d" },
                ],
                safetyFlags: [],
                expectedResponseMode: "advice_only",
              }),
            },
          },
        ],
      }),
    } as Response);

    const provider = createOpenAiCoachProvider(
      "test-key",
      "gpt-4o-mini",
      compilePromptTemplates({
        templates: {
          openai_intent_router: {
            templateKey: "openai_intent_router",
            body: "Custom router {{intentCatalogJson}}",
            placeholders: ["intentCatalogJson"],
          },
        },
      }),
    );

    await provider.generateIntentRoute({
      userMessage: "hello",
      recentMessages: [],
    });

    const requestBody = JSON.parse(String((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]?.body));
    expect(requestBody.messages[0].content).toMatch(/^Custom router /);
    expect(requestBody.messages[0].content).toContain('"id":"general"');
  });

  it("returns user-facing coaching text only from generateCoachResponse", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                kind: "final_answer",
                reply: "I recommend a lighter recovery session you can review first.",
                proposals: [],
              }),
            },
          },
        ],
      }),
    } as Response);

    const provider = createOpenAiCoachProvider("test-key", "gpt-4o-mini");
    const output = await provider.generateCoachResponse({
      userMessage: "Should I train today?",
      recentMessages: [],
      coachingContext: {},
      agentMetadata: {
        purpose: "workout_adaptation",
        intent: "adjust_workout",
        depth: "medium",
        timeRange: "14d",
        safetyConstraints: ["Do not diagnose."],
      },
    });

    expect(output.reply).toContain("recovery session");
    expect(output.proposals).toEqual([]);
  });
});
