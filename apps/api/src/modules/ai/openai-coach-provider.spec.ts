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
});
