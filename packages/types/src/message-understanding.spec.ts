import { describe, expect, it } from "vitest";
import {
  createFallbackMessageUnderstanding,
  createFallbackMessageUnderstandingResult,
  messageUnderstandingOutputSchema,
  messageUnderstandingRequestSchema,
  truncateRecentMessagesForUnderstandingHints,
  validateMessageUnderstandingOutputShape,
} from "./message-understanding.js";

describe("message understanding contracts", () => {
  const baseRequest = messageUnderstandingRequestSchema.parse({
    originalText: "I feel tired after yesterday's workout. Should I train today?",
    normalizedText: "i feel tired after yesterday's workout. should i train today?",
    preprocessor: {
      originalText: "I feel tired after yesterday's workout. Should I train today?",
      normalizedText: "i feel tired after yesterday's workout. should i train today?",
      detectedLanguage: "en",
      responseLanguage: "en",
      hasAttachments: false,
      mentionedDates: ["today", "yesterday"],
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
  });

  it("parses a strict understanding output shape", () => {
    const parsed = messageUnderstandingOutputSchema.parse({
      signals: ["question", "wellness_check_in"],
      entities: [{ kind: "date", value: "today", confidence: 0.8 }],
      capabilityHints: [{ capabilityId: "adjust_workout", confidence: 0.72 }],
      complexity: "moderate",
      directCommand: { detected: false },
      safetyFlags: ["fatigue"],
      needsContext: ["recent_conversation"],
      confidence: 0.74,
    });

    expect(parsed.signals).toEqual(["question", "wellness_check_in"]);
  });

  it.each([
    "reply",
    "advice",
    "answer",
    "proposals",
    "catalogIntentId",
    "expectedResponseMode",
    "routingMethod",
    "tool_request",
  ] as const)("rejects forbidden understanding field %s", (forbiddenField) => {
    const errors = validateMessageUnderstandingOutputShape({
      signals: [],
      entities: [],
      capabilityHints: [{ capabilityId: "general", confidence: 0.5 }],
      complexity: "simple",
      directCommand: { detected: false },
      safetyFlags: [],
      needsContext: [],
      confidence: 0.5,
      [forbiddenField]:
        forbiddenField === "proposals"
          ? [{ intent: "adapt_workout_plan" }]
          : forbiddenField === "tool_request"
            ? { tool: "getDocumentContext" }
            : "forbidden value",
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(new RegExp(`must not include forbidden field "${forbiddenField}"`)),
      ]),
    );
  });

  it("rejects extra keys because the schema is strict", () => {
    expect(
      messageUnderstandingOutputSchema.safeParse({
        signals: [],
        entities: [],
        capabilityHints: [{ capabilityId: "general", confidence: 0.5 }],
        complexity: "simple",
        directCommand: { detected: false },
        safetyFlags: [],
        needsContext: [],
        confidence: 0.5,
        answer: "hidden",
      }).success,
    ).toBe(false);
  });

  it("creates low-confidence generic fallback understanding", () => {
    const fallback = createFallbackMessageUnderstanding(baseRequest);

    expect(fallback.confidence).toBe(0.35);
    expect(fallback.capabilityHints[0]?.capabilityId).toBe("adjust_workout");
    expect(fallback.safetyFlags).toContain("fatigue");
    expect(fallback.signals).toContain("question");
  });

  it("marks direct-path preprocessor output in fallback understanding", () => {
    const request = messageUnderstandingRequestSchema.parse({
      ...baseRequest,
      preprocessor: {
        ...baseRequest.preprocessor,
        directPathCandidate: {
          kind: "today_summary_read",
          confidence: 0.95,
          routingMethod: "rule_based",
        },
      },
    });

    const fallback = createFallbackMessageUnderstanding(request);

    expect(fallback.directCommand).toEqual({
      detected: true,
      kind: "today_summary_read",
      confidence: 0.75,
    });
    expect(fallback.complexity).toBe("simple");
    expect(fallback.needsContext).toContain("today_summary");
  });

  it("wraps fallback output in a result envelope", () => {
    const result = createFallbackMessageUnderstandingResult(baseRequest, [
      "provider timeout",
    ]);

    expect(result.source).toBe("fallback");
    expect(result.validationErrors).toEqual(["provider timeout"]);
    expect(result.output.confidence).toBe(0.35);
  });

  it("truncates recent message hints for prompt safety", () => {
    const hints = truncateRecentMessagesForUnderstandingHints(
      [{ role: "user", content: "a".repeat(500) }],
      1,
      120,
    );

    expect(hints).toHaveLength(1);
    expect(hints[0]?.content.endsWith("...")).toBe(true);
    expect(hints[0]?.content.length).toBe(123);
  });
});
