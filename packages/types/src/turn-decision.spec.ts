import { describe, expect, it } from "vitest";
import { createFallbackTurnDecision } from "./turn-decision-routing.js";
import {
  mapMessageUnderstandingRequestToTurnDecisionRequest,
  mapTurnDecisionOutputFromMessageUnderstanding,
  turnDecisionOutputSchema,
  turnDecisionRequestSchema,
  validateTurnDecisionOutputShape,
} from "./turn-decision.js";
import {
  messageUnderstandingOutputSchema,
  messageUnderstandingRequestSchema,
} from "./message-understanding.js";

describe("turn decision contracts", () => {
  const baseRequest = turnDecisionRequestSchema.parse({
    originalText: "I ate this for lunch",
    normalizedText: "i ate this for lunch",
    preprocessor: {
      originalText: "I ate this for lunch",
      normalizedText: "i ate this for lunch",
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
        attachmentRefId: "a1000001-0000-4000-8000-000000000001",
        category: "food_photo",
        status: "recognized",
        routingCapabilityId: "attachment_food_photo",
        contextHint: "Meal photo",
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
  });

  it("rejects user-facing fields in turn decision output", () => {
    const errors = validateTurnDecisionOutputShape({
      reply: "hello",
      routeCapabilityHints: [],
      complexity: "simple",
      directCommand: { detected: false },
      confidence: 0.8,
    });

    expect(errors.some((error) => error.includes("forbidden"))).toBe(true);
  });

  it("parses a valid turn decision output", () => {
    const parsed = turnDecisionOutputSchema.parse({
      signals: ["attachment_reference"],
      entities: [],
      routeCapabilityHints: [{ capabilityId: "attachment_food_photo", confidence: 0.82 }],
      complexity: "moderate",
      directCommand: { detected: false },
      safetyFlags: [],
      contextNeeds: ["attachment_context"],
      attachmentHints: [
        {
          attachmentRefId: "a1000001-0000-4000-8000-000000000001",
          category: "food_photo",
          routingCapabilityId: "attachment_food_photo",
        },
      ],
      toolNeeds: [],
      confidence: 0.82,
    });

    expect(parsed.routeCapabilityHints[0]?.capabilityId).toBe("attachment_food_photo");
  });

  it("builds deterministic fallback output from preprocessor signals", () => {
    const fallback = createFallbackTurnDecision(baseRequest);

    expect(fallback.routeCapabilityHints.length).toBeGreaterThan(0);
    expect(fallback.confidence).toBeLessThan(0.5);
    expect(fallback.attachmentHints).toHaveLength(1);
  });

  describe("message understanding compatibility adapters", () => {
    it("maps message understanding requests into turn decision requests with available tools", () => {
      const understandingRequest = messageUnderstandingRequestSchema.parse({
        originalText: "Can you adapt my workout plan this week?",
        normalizedText: "can you adapt my workout plan this week?",
        preprocessor: baseRequest.preprocessor,
        attachmentContextSummaries: baseRequest.attachmentContextSummaries,
        recentMessageHints: [],
        catalogHints: baseRequest.catalogHints,
      });

      const mapped = mapMessageUnderstandingRequestToTurnDecisionRequest(understandingRequest, [
        "getUserContextSlice",
      ]);

      expect(mapped.availableTools).toEqual(["getUserContextSlice"]);
      expect(mapped.attachmentContextSummaries[0]?.routingCapabilityId).toBe(
        "attachment_food_photo",
      );
    });

    it("maps message understanding output into turn decision attachment hints", () => {
      const understandingOutput = messageUnderstandingOutputSchema.parse({
        signals: ["attachment_reference"],
        entities: [],
        capabilityHints: [{ capabilityId: "attachment_food_photo", confidence: 0.82 }],
        complexity: "moderate",
        directCommand: { detected: false },
        safetyFlags: [],
        needsContext: ["attachment_context"],
        confidence: 0.82,
      });

      const mapped = mapTurnDecisionOutputFromMessageUnderstanding(
        understandingOutput,
        baseRequest,
      );

      expect(mapped.routeCapabilityHints[0]?.capabilityId).toBe("attachment_food_photo");
      expect(mapped.attachmentHints[0]).toMatchObject({
        attachmentRefId: "a1000001-0000-4000-8000-000000000001",
        category: "food_photo",
        routingCapabilityId: "attachment_food_photo",
      });
    });
  });
});
