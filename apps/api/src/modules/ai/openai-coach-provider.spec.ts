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

  it("rejects message understanding output that includes user-facing answer fields", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                signals: ["question"],
                entities: [],
                capabilityHints: [{ capabilityId: "general", confidence: 0.8 }],
                complexity: "simple",
                directCommand: { detected: false },
                safetyFlags: [],
                needsContext: [],
                confidence: 0.8,
                reply: "You should rest today.",
              }),
            },
          },
        ],
      }),
    } as Response);

    const provider = createOpenAiCoachProvider("test-key", "gpt-4o-mini");

    await expect(
      provider.generateMessageUnderstanding({
        originalText: "Should I train today?",
        normalizedText: "should i train today?",
        preprocessor: {
          originalText: "Should I train today?",
          normalizedText: "should i train today?",
          detectedLanguage: "en",
          responseLanguage: "en",
          hasAttachments: false,
          mentionedDates: ["today"],
          simpleSignals: {
            workout: true,
            nutrition: false,
            today: true,
            sleep: false,
            fatigue: true,
            pain: false,
            document: false,
            attachment: false,
          },
          directPathCandidate: null,
        },
        attachmentContextSummaries: [],
        recentMessageHints: [],
        catalogHints: [],
      }),
    ).rejects.toThrow(/must not include forbidden field/);
  });

  it("renders repo-backed message understanding prompt templates", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                signals: ["question"],
                entities: [],
                capabilityHints: [{ capabilityId: "general", confidence: 0.77 }],
                complexity: "simple",
                directCommand: { detected: false },
                safetyFlags: [],
                needsContext: [],
                confidence: 0.77,
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
          openai_message_understanding: {
            templateKey: "openai_message_understanding",
            body: "Custom understanding {{normalizedText}} :: {{originalText}} :: {{preprocessorJson}} :: {{attachmentContextSummariesJson}} :: {{recentMessageHintsJson}} :: {{catalogHintsJson}}",
            placeholders: [
              "normalizedText",
              "originalText",
              "preprocessorJson",
              "attachmentContextSummariesJson",
              "recentMessageHintsJson",
              "catalogHintsJson",
            ],
          },
        },
      }),
    );

    await provider.generateMessageUnderstanding({
      originalText: "hello",
      normalizedText: "hello",
      preprocessor: {
        originalText: "hello",
        normalizedText: "hello",
        detectedLanguage: "en",
        responseLanguage: "en",
        hasAttachments: false,
        mentionedDates: [],
        simpleSignals: {
          workout: false,
          nutrition: false,
          today: false,
          sleep: false,
          fatigue: false,
          pain: false,
          document: false,
          attachment: false,
        },
        directPathCandidate: null,
      },
      attachmentContextSummaries: [],
      recentMessageHints: [],
      catalogHints: [{ id: "general", description: "General chat", routerGuidance: "fallback" }],
    });

    const requestBody = JSON.parse(String((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]?.body));
    expect(requestBody.messages[0].content).toMatch(/^Custom understanding hello :: hello ::/);
    expect(requestBody.messages[0].content).toContain('"routerGuidance":"fallback"');
  });
});
