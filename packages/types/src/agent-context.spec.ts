import { describe, expect, it } from "vitest";
import type { AgentSafetyFlag } from "./agent-context.js";
import {
  agentContextPacketSchema,
  agentToolCallRequestSchema,
  agentToolCallResultSchema,
  agentTurnMetadataSchema,
  buildAgentContextRequestSchema,
  buildContextSliceRequestForIntent,
  DEFAULT_AGENT_SAFETY_CONSTRAINTS,
  getUserContextSliceInputSchema,
  INTENT_TO_SLICE_PURPOSE,
  llmIntentRouterOutputSchema,
  MAX_CONTEXT_SLICES,
  mergeLlmRouterOutputIntoRoute,
  normalizeContextSlicePlan,
  resolveDefaultDepthForPurpose,
  resolveDefaultTimeRangeForPurpose,
  shouldIncludeDocumentsForPurpose,
  userContextSliceSchema,
  validateLlmRouterOutputShape,
} from "./agent-context.js";

describe("agent context contracts", () => {
  it("parses getUserContextSlice input with defaults", () => {
    const parsed = getUserContextSliceInputSchema.parse({
      purpose: "workout_adaptation",
    });

    expect(parsed.includeRawData).toBe(false);
    expect(parsed.includeDocuments).toBe(false);
  });

  it("maps intents to slice purposes", () => {
    expect(INTENT_TO_SLICE_PURPOSE.adjust_workout).toBe("workout_adaptation");
    expect(INTENT_TO_SLICE_PURPOSE.ask_health_context).toBe("health_context");
  });

  it("resolves conservative defaults by purpose", () => {
    expect(resolveDefaultDepthForPurpose("general_chat")).toBe("small");
    expect(resolveDefaultDepthForPurpose("workout_adaptation")).toBe("medium");
    expect(resolveDefaultTimeRangeForPurpose("longevity_overview")).toBe("90d");
    expect(shouldIncludeDocumentsForPurpose("health_context")).toBe(true);
    expect(shouldIncludeDocumentsForPurpose("nutrition_adaptation")).toBe(false);
  });

  it("accepts a minimal user context slice packet", () => {
    const slice = userContextSliceSchema.parse({
      purpose: "general_chat",
      depth: "small",
      timeRange: "7d",
      generatedAt: new Date().toISOString(),
      recommendationConstraints: DEFAULT_AGENT_SAFETY_CONSTRAINTS.slice(),
    });

    expect(slice.relevantMemories).toEqual([]);
    expect(slice.snapshots).toEqual([]);
  });

  it("accepts an agent context packet envelope", () => {
    const generatedAt = new Date().toISOString();
    const packet = agentContextPacketSchema.parse({
      purpose: "daily_checkin",
      depth: "small",
      timeRange: "7d",
      intent: "ask_about_today",
      generatedAt,
      safetyConstraints: DEFAULT_AGENT_SAFETY_CONSTRAINTS.slice(),
      slice: {
        purpose: "daily_checkin",
        depth: "small",
        timeRange: "7d",
        generatedAt,
      },
    });

    expect(packet.intent).toBe("ask_about_today");
  });

  it("accepts agent turn metadata for chat persistence", () => {
    const metadata = agentTurnMetadataSchema.parse({
      provider: "stub",
      intent: "general",
      purpose: "general_chat",
      depth: "small",
      timeRange: "7d",
      safety: {
        status: "passed",
      },
      routing: {
        confidence: 0.42,
        routingMethod: "llm_router",
        llmRouterInvoked: true,
        safetyFlags: ["fatigue"],
        expectedResponseMode: "advice_only",
        contextSliceCount: 1,
      },
    });

    expect(metadata.toolsInvoked).toEqual([]);
  });

  it("normalizes router context slice plans to bounded defaults", () => {
    const plan = normalizeContextSlicePlan([
      { type: "workout_adaptation" },
      { type: "daily_checkin", depth: "small", timeRange: "7d" },
      { type: "workout_adaptation" },
      { type: "weekly_review" },
      { type: "nutrition_adaptation" },
    ]);

    expect(plan).toHaveLength(MAX_CONTEXT_SLICES);
    expect(plan[0]?.type).toBe("workout_adaptation");
    expect(plan[0]?.depth).toBe("medium");
  });

  it("validates llm router output and rejects user-facing advice fields", () => {
    const valid = llmIntentRouterOutputSchema.parse({
      intent: "adjust_workout",
      confidence: 0.86,
      routingMethod: "llm_router",
      requiredContextSlices: [buildContextSliceRequestForIntent("adjust_workout")],
      safetyFlags: ["fatigue"],
      expectedResponseMode: "recommendation_with_optional_proposal",
    });

    expect(valid.routingMethod).toBe("llm_router");
    expect(
      validateLlmRouterOutputShape({
        ...valid,
        reply: "You should skip training today.",
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/must not include user-facing field "reply"/),
      ]),
    );
    expect(
      validateLlmRouterOutputShape({
        ...valid,
        proposals: [{ intent: "adapt_workout_plan" }],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/must not include user-facing field "proposals"/),
      ]),
    );
    expect(
      validateLlmRouterOutputShape({
        ...valid,
        advice: "Eat more protein tonight.",
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/must not include user-facing field "advice"/),
      ]),
    );
  });

  it("merges llm router output into an uncertain rule route", () => {
    const uncertainRoute = {
      intent: "general" as const,
      confidence: 0.4,
      isConfident: false,
      purpose: "general_chat" as const,
      depth: "small" as const,
      timeRange: "7d" as const,
      includeDocuments: false,
      routingMethod: "rule_based" as const,
      requiredContextSlices: [buildContextSliceRequestForIntent("general")],
      safetyFlags: [] as AgentSafetyFlag[],
      expectedResponseMode: "advice_only" as const,
    };

    const merged = mergeLlmRouterOutputIntoRoute(uncertainRoute, {
      intent: "adjust_nutrition",
      confidence: 0.84,
      routingMethod: "llm_router",
      requiredContextSlices: [
        buildContextSliceRequestForIntent("adjust_nutrition"),
        { type: "weekly_review", depth: "medium", timeRange: "7d" },
      ],
      safetyFlags: ["hunger"],
      expectedResponseMode: "recommendation_with_optional_proposal",
    });

    expect(merged.routingMethod).toBe("llm_router");
    expect(merged.intent).toBe("adjust_nutrition");
    expect(merged.requiredContextSlices).toHaveLength(2);
  });

  describe("invalid agent context payloads", () => {
    it("rejects unknown slice purpose and depth values", () => {
      expect(
        getUserContextSliceInputSchema.safeParse({ purpose: "unknown_purpose" }).success,
      ).toBe(false);
      expect(
        getUserContextSliceInputSchema.safeParse({
          purpose: "workout_adaptation",
          depth: "xlarge",
        }).success,
      ).toBe(false);
    });

    it("rejects empty buildAgentContext requests", () => {
      expect(buildAgentContextRequestSchema.safeParse({ userMessage: "" }).success).toBe(false);
      expect(
        buildAgentContextRequestSchema.safeParse({ userMessage: "a".repeat(4001) }).success,
      ).toBe(false);
    });

    it("rejects unknown tool names and invalid provider metadata", () => {
      expect(
        agentToolCallRequestSchema.safeParse({
          tool: "deleteUserData",
          input: {},
        }).success,
      ).toBe(false);
      expect(
        agentTurnMetadataSchema.safeParse({
          provider: "anthropic",
          intent: "general",
          purpose: "general_chat",
          depth: "small",
          timeRange: "7d",
          safety: { status: "passed" },
        }).success,
      ).toBe(false);
    });

    it("accepts typed tool failure results", () => {
      const result = agentToolCallResultSchema.parse({
        tool: "getUserContextSlice",
        ok: false,
        errors: ["purpose: Invalid enum value"],
      });

      expect(result.result).toBeUndefined();
      expect(result.errors).toHaveLength(1);
    });

    it("rejects user context slices with invalid rag provenance", () => {
      expect(
        userContextSliceSchema.safeParse({
          purpose: "health_context",
          depth: "large",
          timeRange: "30d",
          generatedAt: new Date().toISOString(),
          ragResults: [
            {
              documentId: "not-a-uuid",
              summaryId: "a1000001-0000-4000-8000-000000000001",
              title: "Blood panel",
              snippet: "Approved summary only.",
              provenance: "approved_document_summary",
              consentScope: "semantic_indexing",
            },
          ],
        }).success,
      ).toBe(false);
    });

    it("rejects agent context packets with invalid intent values", () => {
      const generatedAt = new Date().toISOString();

      expect(
        agentContextPacketSchema.safeParse({
          purpose: "general_chat",
          depth: "small",
          timeRange: "7d",
          intent: "unsupported_intent",
          generatedAt,
          safetyConstraints: DEFAULT_AGENT_SAFETY_CONSTRAINTS.slice(),
          slice: {
            purpose: "general_chat",
            depth: "small",
            timeRange: "7d",
            generatedAt,
          },
        }).success,
      ).toBe(false);
    });

    it("rejects agent context packets when envelope purpose mismatches slice purpose", () => {
      const generatedAt = new Date().toISOString();
      const parsed = agentContextPacketSchema.safeParse({
        purpose: "nutrition_adaptation",
        depth: "medium",
        timeRange: "14d",
        intent: "adjust_nutrition",
        generatedAt,
        safetyConstraints: DEFAULT_AGENT_SAFETY_CONSTRAINTS.slice(),
        slice: {
          purpose: "workout_adaptation",
          depth: "medium",
          timeRange: "14d",
          generatedAt,
        },
      });

      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues.some((issue) => /slice\.purpose/i.test(issue.message))).toBe(
          true,
        );
      }
    });
  });
});
