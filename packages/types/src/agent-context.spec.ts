import { describe, expect, it } from "vitest";
import {
  agentContextPacketSchema,
  agentFanOutDiagnosticsSchema,
  agentRoutingMethodSchema,
  agentToolCallRequestSchema,
  agentToolCallResultSchema,
  agentTurnCapabilityPresentationSchema,
  agentTurnMetadataSchema,
  buildAgentContextRequestSchema,
  buildContextSliceRequestForIntent,
  buildRouteFromCatalogIntent,
  DEFAULT_AGENT_SAFETY_CONSTRAINTS,
  getUserContextSliceInputSchema,
  INTENT_TO_SLICE_PURPOSE,
  MAX_CONTEXT_SLICES,
  normalizeContextSlicePlan,
  resolveDefaultDepthForPurpose,
  resolveDefaultTimeRangeForPurpose,
  shouldIncludeDocumentsForPurpose,
  userContextSliceSchema,
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

  describe("routing method schema — surviving values only (B7 removal)", () => {
    it("accepts unified_turn_decision routing metadata on agent turns", () => {
      const metadata = agentTurnMetadataSchema.parse({
        provider: "openai",
        intent: "general",
        purpose: "general_chat",
        depth: "small",
        timeRange: "7d",
        safety: {
          status: "passed",
        },
        routing: {
          confidence: 0.42,
          routingMethod: "unified_turn_decision",
          llmRouterInvoked: true,
          unifiedTurnDecisionInvoked: true,
          safetyFlags: ["fatigue"],
          expectedResponseMode: "advice_only",
          contextSliceCount: 1,
        },
      });

      expect(metadata.toolsInvoked).toEqual([]);
    });

    it("rejects deprecated llm_router routing method (B7 removal)", () => {
      const result = agentRoutingMethodSchema.safeParse("llm_router");
      expect(result.success).toBe(false);
    });

    it("rejects deprecated message_understanding routing method (B7 removal)", () => {
      const result = agentRoutingMethodSchema.safeParse("message_understanding");
      expect(result.success).toBe(false);
    });

    it("rejects deprecated attachment_family routing method (B7 removal)", () => {
      const result = agentRoutingMethodSchema.safeParse("attachment_family");
      expect(result.success).toBe(false);
    });
  });

  it("accepts optional capability composition metadata on agent turns", () => {
    const presentation = agentTurnCapabilityPresentationSchema.parse({
      primaryCapabilityId: "adjust_workout",
      selectedCapabilityIds: ["adjust_workout", "ask_about_today"],
      compositionStrategy: "primary_only",
      widgetDescriptors: [{ id: "adapt_workout_plan_card", type: "proposal_card" }],
      actionDescriptors: [{ id: "adapt_workout_plan", type: "create_proposal" }],
    });

    const metadata = agentTurnMetadataSchema.parse({
      provider: "openai",
      intent: "adjust_workout",
      catalogIntentId: "adjust_workout",
      primaryCapabilityId: "adjust_workout",
      selectedCapabilityIds: ["adjust_workout", "ask_about_today"],
      capabilityPresentation: presentation,
      purpose: "workout_adaptation",
      depth: "medium",
      timeRange: "14d",
      safety: { status: "passed" },
    });

    expect(metadata.capabilityPresentation?.widgetDescriptors).toHaveLength(1);
    expect(metadata.selectedCapabilityIds).toEqual(["adjust_workout", "ask_about_today"]);
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

  it("builds catalog routes with unified_turn_decision routing metadata", () => {
    const merged = buildRouteFromCatalogIntent({
      catalogIntentId: "adjust_nutrition",
      mappedAgentIntent: "adjust_nutrition",
      confidence: 0.84,
      routingMethod: "unified_turn_decision",
      requiredContextSlices: [
        buildContextSliceRequestForIntent("adjust_nutrition"),
        { type: "weekly_review", depth: "medium", timeRange: "7d" },
      ],
      safetyFlags: ["hunger"],
      expectedResponseMode: "recommendation_with_optional_proposal",
    });

    expect(merged.routingMethod).toBe("unified_turn_decision");
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
      // Cap is now MAX_CHAT_USER_MESSAGE_CHARS (20 000); 20 001 must be rejected.
      expect(
        buildAgentContextRequestSchema.safeParse({ userMessage: "a".repeat(20_001) }).success,
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

// ---------------------------------------------------------------------------
// W4 — fan-out diagnostics block (Workstream 1)
// ---------------------------------------------------------------------------

describe("agentFanOutDiagnosticsSchema (W1 — optional fan-out block)", () => {
  it("parses a minimal fanOut block with only defaults", () => {
    const parsed = agentFanOutDiagnosticsSchema.parse({});
    expect(parsed.domains).toEqual([]);
    expect(parsed.router).toBeUndefined();
    expect(parsed.decision).toBeUndefined();
    expect(parsed.resolution).toBeUndefined();
  });

  it("parses a full router + domains + decision + resolution block", () => {
    const parsed = agentFanOutDiagnosticsSchema.parse({
      router: {
        ran: true,
        source: "llm",
        confidence: 0.93,
        selectedDomains: [
          { domain: "workout", confidence: 0.93 },
        ],
        blockedFallback: false,
      },
      domains: [
        {
          domain: "workout",
          degraded: false,
          degradedReasons: [],
          candidateProposalCount: 1,
          loopIterations: 1,
          toolsInvoked: [],
          hasWorkoutCalorieEstimate: true,
        },
      ],
      decision: {
        degraded: false,
        selectedAction: "create_workout_plan",
        selectedProposalIdCount: 1,
        consentRequired: false,
      },
      resolution: {
        resolvedProposalCount: 1,
        droppedByAllowlist: 0,
        replyBlocked: false,
        finalProposalCount: 1,
      },
    });

    expect(parsed.router?.ran).toBe(true);
    expect(parsed.router?.source).toBe("llm");
    expect(parsed.router?.confidence).toBe(0.93);
    expect(parsed.router?.selectedDomains).toHaveLength(1);
    expect(parsed.domains).toHaveLength(1);
    expect(parsed.domains[0]?.candidateProposalCount).toBe(1);
    expect(parsed.domains[0]?.hasWorkoutCalorieEstimate).toBe(true);
    expect(parsed.decision?.selectedAction).toBe("create_workout_plan");
    expect(parsed.resolution?.finalProposalCount).toBe(1);
  });

  it("agentTurnMetadataSchema accepts a fanOut block (W1 additive extension)", () => {
    const metadata = agentTurnMetadataSchema.parse({
      provider: "openai",
      intent: "adjust_workout",
      purpose: "workout_adaptation",
      depth: "medium",
      timeRange: "14d",
      safety: { status: "passed" },
      fanOut: {
        router: {
          ran: true,
          source: "llm",
          confidence: 0.91,
          selectedDomains: [{ domain: "workout", confidence: 0.91 }],
        },
        domains: [
          {
            domain: "workout",
            degraded: false,
            degradedReasons: [],
            candidateProposalCount: 1,
            loopIterations: 1,
            toolsInvoked: ["getUserContextSlice"],
            hasWorkoutCalorieEstimate: false,
          },
        ],
        decision: {
          degraded: false,
          selectedAction: "create_workout_plan",
          selectedProposalIdCount: 1,
          consentRequired: false,
        },
        resolution: {
          resolvedProposalCount: 1,
          droppedByAllowlist: 0,
          replyBlocked: false,
          finalProposalCount: 1,
        },
      },
    });

    expect(metadata.fanOut).toBeDefined();
    expect(metadata.fanOut?.router?.ran).toBe(true);
    expect(metadata.fanOut?.domains).toHaveLength(1);
    expect(metadata.fanOut?.decision?.selectedAction).toBe("create_workout_plan");
  });

  it("agentTurnMetadataSchema accepts metadata WITHOUT fanOut (back-compat)", () => {
    // Existing metadata persisted before W1 must still parse correctly.
    const metadata = agentTurnMetadataSchema.parse({
      provider: "openai",
      intent: "general",
      purpose: "general_chat",
      depth: "small",
      timeRange: "7d",
      safety: { status: "passed" },
      // fanOut field is absent — must not fail validation
    });

    expect(metadata.fanOut).toBeUndefined();
    expect(metadata.intent).toBe("general");
  });

  it("fanOut block with degraded domain and null selectedAction represents a fallback turn", () => {
    const parsed = agentFanOutDiagnosticsSchema.parse({
      router: {
        ran: true,
        source: "llm",
        confidence: 0.6,
        selectedDomains: [],
      },
      domains: [],
      decision: {
        degraded: true,
        selectedAction: null,
        selectedProposalIdCount: 0,
        consentRequired: false,
      },
      resolution: {
        resolvedProposalCount: 0,
        droppedByAllowlist: 0,
        replyBlocked: false,
        finalProposalCount: 0,
      },
    });

    expect(parsed.decision?.degraded).toBe(true);
    expect(parsed.decision?.selectedAction).toBeNull();
    expect(parsed.resolution?.finalProposalCount).toBe(0);
  });

  it("fanOut domains block rejects unknown domain values", () => {
    const result = agentFanOutDiagnosticsSchema.safeParse({
      domains: [
        {
          domain: "medical", // not a valid RouterDomain
          degraded: false,
          degradedReasons: [],
          candidateProposalCount: 0,
          loopIterations: 1,
          toolsInvoked: [],
          hasWorkoutCalorieEstimate: false,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("fanOut domains block rejects unknown tool names", () => {
    const result = agentFanOutDiagnosticsSchema.safeParse({
      domains: [
        {
          domain: "workout",
          degraded: false,
          degradedReasons: [],
          candidateProposalCount: 0,
          loopIterations: 1,
          toolsInvoked: ["deleteUserData"], // not a valid AgentToolName
          hasWorkoutCalorieEstimate: false,
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
