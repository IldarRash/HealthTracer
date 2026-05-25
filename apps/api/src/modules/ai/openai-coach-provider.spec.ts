import { afterEach, describe, expect, it, vi } from "vitest";
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
                intent: "adjust_workout",
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
                intent: "adjust_nutrition",
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
    expect(route.intent).toBe("adjust_nutrition");
    expect(route.requiredContextSlices).toHaveLength(3);
    expect(route.requiredContextSlices[0]?.type).toBe("nutrition_adaptation");
    expect(route.requiredContextSlices[0]?.depth).toBe("medium");
    expect(route).not.toHaveProperty("reply");
    expect(route).not.toHaveProperty("proposals");
  });

  it("rejects llm router output that exceeds the max context slice count", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: "adjust_nutrition",
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

  it("returns user-facing coaching text only from generateCoachResponse", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
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
