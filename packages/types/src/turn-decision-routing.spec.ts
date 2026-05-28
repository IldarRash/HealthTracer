import { describe, expect, it } from "vitest";
import {
  buildBoundedUnifiedTurnDecisionMetadata,
  clampTurnDecisionOutput,
  isTurnDecisionRouteConfident,
  isUnifiedTurnDecisionBlockedFallback,
  pickPrimaryCapabilityFromTurnDecision,
  shouldRunUnifiedTurnDecision,
  shouldSuppressAttachmentProposalSideChannel,
} from "./turn-decision-routing.js";
import {
  turnDecisionOutputSchema,
  turnDecisionRequestSchema,
  turnDecisionResultSchema,
} from "./turn-decision.js";

describe("turn decision routing", () => {
  it("runs unified turn decision for normal and attachment turns", () => {
    expect(shouldRunUnifiedTurnDecision({})).toBe(true);
    expect(
      shouldRunUnifiedTurnDecision({
        proposalRevision: { supersededProposalId: "id" },
      }),
    ).toBe(false);
  });

  it("detects confident unified routes from llm output", () => {
    const result = turnDecisionResultSchema.parse({
      output: turnDecisionOutputSchema.parse({
        signals: ["attachment_reference"],
        entities: [],
        routeCapabilityHints: [{ capabilityId: "attachment_workout", confidence: 0.86 }],
        complexity: "moderate",
        directCommand: { detected: false },
        safetyFlags: [],
        contextNeeds: ["attachment_context"],
        attachmentHints: [],
        toolNeeds: [],
        confidence: 0.84,
      }),
      source: "llm",
      validationErrors: [],
    });

    expect(isTurnDecisionRouteConfident(result)).toBe(true);
  });

  it("clamps unknown catalog ids and tools", () => {
    const request = turnDecisionRequestSchema.parse({
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
      catalogHints: [{ id: "general", description: "General", routerGuidance: "General chat" }],
      availableTools: ["getUserContextSlice"],
    });

    const clamped = clampTurnDecisionOutput({
      output: turnDecisionOutputSchema.parse({
        signals: [],
        entities: [],
        routeCapabilityHints: [
          { capabilityId: "general", confidence: 0.9 },
          { capabilityId: "attachment_workout", confidence: 0.95 },
        ],
        complexity: "simple",
        directCommand: { detected: false },
        safetyFlags: [],
        contextNeeds: [],
        attachmentHints: [],
        toolNeeds: [
          { tool: "getUserContextSlice" },
          { tool: "getDocumentContext" },
        ],
        confidence: 0.9,
      }),
      allowedCatalogIds: new Set(["general"]),
      allowedTools: new Set(["getUserContextSlice"]),
    });

    expect(clamped.routeCapabilityHints.map((hint) => hint.capabilityId)).toEqual(["general"]);
    expect(clamped.toolNeeds).toEqual([{ tool: "getUserContextSlice" }]);
    expect(request.catalogHints[0]?.id).toBe("general");
  });

  it("picks the highest-confidence capability hint as the primary route", () => {
    const primary = pickPrimaryCapabilityFromTurnDecision(
      turnDecisionOutputSchema.parse({
        signals: [],
        entities: [],
        routeCapabilityHints: [
          { capabilityId: "general", confidence: 0.55 },
          { capabilityId: "adjust_workout", confidence: 0.91 },
        ],
        complexity: "moderate",
        directCommand: { detected: false },
        safetyFlags: [],
        contextNeeds: [],
        attachmentHints: [],
        toolNeeds: [],
        confidence: 0.91,
      }),
    );

    expect(primary).toBe("adjust_workout");
  });

  it("treats fallback turn decision output as not route-confident", () => {
    const result = turnDecisionResultSchema.parse({
      output: turnDecisionOutputSchema.parse({
        signals: [],
        entities: [],
        routeCapabilityHints: [{ capabilityId: "adjust_workout", confidence: 0.86 }],
        complexity: "moderate",
        directCommand: { detected: false },
        safetyFlags: [],
        contextNeeds: [],
        attachmentHints: [],
        toolNeeds: [],
        confidence: 0.86,
      }),
      source: "fallback",
      validationErrors: ["provider unavailable"],
    });

    expect(isTurnDecisionRouteConfident(result)).toBe(false);
  });

  it("nulls attachment hint routing capabilities outside the allowed catalog", () => {
    const clamped = clampTurnDecisionOutput({
      output: turnDecisionOutputSchema.parse({
        signals: [],
        entities: [],
        routeCapabilityHints: [{ capabilityId: "general", confidence: 0.9 }],
        complexity: "simple",
        directCommand: { detected: false },
        safetyFlags: [],
        contextNeeds: [],
        attachmentHints: [
          {
            attachmentRefId: "a1000001-0000-4000-8000-000000000001",
            category: "food_photo",
            routingCapabilityId: "attachment_food_photo",
          },
        ],
        toolNeeds: [],
        confidence: 0.9,
      }),
      allowedCatalogIds: new Set(["general"]),
      allowedTools: new Set([]),
    });

    expect(clamped.attachmentHints[0]?.routingCapabilityId).toBeNull();
  });

  it.each([
    ["parse_failed", "parse_failed" as const],
    ["provider_error", "provider_error" as const],
    ["reply_blocked", "reply_blocked" as const],
  ] as const)(
    "marks unified blocked fallback when AI fails with %s",
    (_label, safetyStatus) => {
      expect(
        shouldSuppressAttachmentProposalSideChannel({
          unifiedTurnDecisionRan: true,
          safetyStatus,
          parseErrors: [],
          replySafetyErrors: [],
        }),
      ).toBe(true);
    },
  );

  it("does not mark blocked fallback when unified turn decision safety passed cleanly", () => {
    expect(
      shouldSuppressAttachmentProposalSideChannel({
        unifiedTurnDecisionRan: true,
        safetyStatus: "passed",
        parseErrors: [],
        replySafetyErrors: [],
      }),
    ).toBe(false);

    expect(
      shouldSuppressAttachmentProposalSideChannel({
        unifiedTurnDecisionRan: false,
        safetyStatus: "parse_failed",
        parseErrors: ["bad loop"],
        replySafetyErrors: [],
      }),
    ).toBe(false);
  });

  it("marks unified blocked fallback metadata from non-passing safety status", () => {
    expect(
      isUnifiedTurnDecisionBlockedFallback({
        provider: "stub",
        intent: "general",
        catalogIntentId: "attachment_food_photo",
        purpose: "nutrition_adaptation",
        depth: "small",
        timeRange: "7d",
        toolsInvoked: [],
        citations: [],
        missingContextNotes: [],
        unifiedTurnDecision: { ran: true, routingMethod: "unified_turn_decision" },
        safety: { status: "reply_blocked", blockedReasons: [], constraintsApplied: [] },
      }),
    ).toBe(true);
  });

  it("builds bounded unified turn decision metadata without leaking validation details", () => {
    expect(
      buildBoundedUnifiedTurnDecisionMetadata({
        ran: true,
        result: turnDecisionResultSchema.parse({
          output: turnDecisionOutputSchema.parse({
            signals: [],
            entities: [],
            routeCapabilityHints: [{ capabilityId: "general", confidence: 0.4 }],
            complexity: "simple",
            directCommand: { detected: false },
            safetyFlags: [],
            contextNeeds: [],
            attachmentHints: [],
            toolNeeds: [],
            confidence: 0.4,
          }),
          source: "fallback",
          validationErrors: ["invalid route", "missing hint"],
        }),
      }),
    ).toEqual({
      ran: true,
      routingMethod: "unified_turn_decision",
      source: "fallback",
      confidence: 0.4,
      validationErrorCount: 2,
    });
  });
});
