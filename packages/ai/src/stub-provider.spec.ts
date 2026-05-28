import { describe, expect, it, vi } from "vitest";
import { turnDecisionOutputSchema } from "@health/types";
import { StubCoachAiProvider } from "./stub-provider.js";

describe("StubCoachAiProvider", () => {
  const provider = new StubCoachAiProvider();

  it("returns user-facing coaching replies from generateCoachResponse only", async () => {
    const output = await provider.generateCoachResponse({
      userMessage: "Explain progressive overload.",
      recentMessages: [],
      coachingContext: {},
      agentMetadata: {
        purpose: "general_chat",
        intent: "general",
        depth: "small",
        timeRange: "7d",
        safetyConstraints: ["Do not diagnose."],
      },
    });

    expect(typeof output.reply).toBe("string");
    expect(output.reply.length).toBeGreaterThan(0);
    expect(Array.isArray(output.proposals)).toBe(true);
  });

  it("returns typed turn decision output with attachment hints for photo turns", async () => {
    const output = turnDecisionOutputSchema.parse(
      await provider.generateTurnDecision({
        originalText: "Log this meal",
        normalizedText: "log this meal",
        preprocessor: {
          originalText: "Log this meal",
          normalizedText: "log this meal",
          detectedLanguage: "en",
          responseLanguage: "en",
          hasAttachments: true,
          mentionedDates: [],
          simpleSignals: {
            workout: false,
            nutrition: true,
            today: false,
            sleep: false,
            fatigue: false,
            pain: false,
            document: false,
            attachment: true,
          },
          directPathCandidate: null,
        },
        attachmentContextSummaries: [
          {
            attachmentRefId: "a1000001-0000-4000-8000-000000000002",
            category: "food_photo",
            status: "recognized",
            routingCapabilityId: "attachment_food_photo",
            contextHint: "Lunch photo",
            recognitionPresent: true,
          },
        ],
        recentMessageHints: [],
        catalogHints: [
          {
            id: "attachment_food_photo",
            description: "Food photo",
            routerGuidance: "Log meals from photos",
          },
        ],
        availableTools: ["getUserContextSlice"],
      }),
    );

    expect(output.routeCapabilityHints.some((hint) => hint.capabilityId === "attachment_food_photo")).toBe(
      true,
    );
    expect(output.attachmentHints).toHaveLength(1);
    expect(output).not.toHaveProperty("reply");
  });

  it("returns typed turn decision output for text-only workout adaptation turns", async () => {
    const output = turnDecisionOutputSchema.parse(
      await provider.generateTurnDecision({
        originalText: "Can you adapt my workout plan this week?",
        normalizedText: "can you adapt my workout plan this week?",
        preprocessor: {
          originalText: "Can you adapt my workout plan this week?",
          normalizedText: "can you adapt my workout plan this week?",
          detectedLanguage: "en",
          responseLanguage: "en",
          hasAttachments: false,
          mentionedDates: [],
          simpleSignals: {
            workout: true,
            nutrition: false,
            today: false,
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
        catalogHints: [
          {
            id: "adjust_workout",
            description: "Adjust workout",
            routerGuidance: "Adapt training plans",
          },
        ],
        availableTools: ["getUserContextSlice"],
      }),
    );

    expect(output.routeCapabilityHints.some((hint) => hint.capabilityId === "adjust_workout")).toBe(
      true,
    );
    expect(output.attachmentHints).toEqual([]);
    expect(output).not.toHaveProperty("reply");
    expect(output).not.toHaveProperty("proposals");
  });
});
