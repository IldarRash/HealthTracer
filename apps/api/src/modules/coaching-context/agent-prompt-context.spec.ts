import { describe, expect, it } from "vitest";
import type { AgentContextPacket } from "@health/types";
import {
  buildAgentPromptContextFromPacket,
  LEGACY_BROAD_COACHING_CONTEXT_KEYS,
  mapContextSourceRefsToAgentCitations,
  mapDomainToCitationSourceType,
} from "./agent-prompt-context.js";

function createPacket(
  overrides: Partial<AgentContextPacket> & {
    slice?: Partial<AgentContextPacket["slice"]>;
  } = {},
): AgentContextPacket {
  const baseSlice = {
    purpose: "general_chat" as const,
    depth: "small" as const,
    timeRange: "7d" as const,
    generatedAt: new Date().toISOString(),
    relevantMemories: [],
    snapshots: [],
    recommendationConstraints: [],
    sourceRefs: [],
  };

  const { slice: sliceOverrides, ...packetOverrides } = overrides;

  return {
    purpose: "general_chat",
    depth: "small",
    timeRange: "7d",
    intent: "general",
    generatedAt: new Date().toISOString(),
    safetyConstraints: ["Do not diagnose medical conditions."],
    sourceRefs: [],
    supplementarySlices: [],
    missingContextNotes: [],
    slice: { ...baseSlice, ...(sliceOverrides ?? {}) },
    ...packetOverrides,
  };
}

describe("buildAgentPromptContextFromPacket", () => {
  it("derives provider context from the typed slice only", () => {
    const packet = createPacket({
      purpose: "workout_adaptation",
      intent: "adjust_workout",
      slice: {
        purpose: "workout_adaptation",
        depth: "medium",
        timeRange: "14d",
        generatedAt: new Date().toISOString(),
        relevantMemories: [],
        snapshots: [],
        recommendationConstraints: [],
        sourceRefs: [],
        activeWorkoutPlan: {
          title: "Strength block",
          summary: "Three sessions per week.",
          sessionCount: 3,
        },
      },
    });

    const context = buildAgentPromptContextFromPacket(packet);

    expect(context.agentContext).toMatchObject({
      purpose: "workout_adaptation",
      intent: "adjust_workout",
    });
    expect(context.activeWorkoutPlan).toMatchObject({ title: "Strength block" });
    for (const key of LEGACY_BROAD_COACHING_CONTEXT_KEYS) {
      expect(context).not.toHaveProperty(key);
    }
  });

  it("omits document fields when the slice excludes them", () => {
    const packet = createPacket({
      purpose: "nutrition_adaptation",
      intent: "adjust_nutrition",
      slice: {
        purpose: "nutrition_adaptation",
        depth: "medium",
        timeRange: "14d",
        generatedAt: new Date().toISOString(),
        relevantMemories: [],
        snapshots: [],
        recommendationConstraints: [],
        sourceRefs: [],
      },
    });

    const context = buildAgentPromptContextFromPacket(packet);

    expect(context).not.toHaveProperty("documentContext");
    expect(context).not.toHaveProperty("ragResults");
    expect(context).not.toHaveProperty("documentSignalContext");
  });
});

describe("mapContextSourceRefsToAgentCitations", () => {
  it("maps document and rag domains to document_summary citations", () => {
    const citations = mapContextSourceRefsToAgentCitations([
      {
        domain: "profile",
        label: "User profile summary",
      },
      {
        domain: "document",
        label: "Blood panel",
        referenceId: "d1000001-0000-4000-8000-000000000001",
      },
      {
        domain: "rag",
        label: "Blood panel snippet",
        referenceId: "d1000001-0000-4000-8000-000000000001",
      },
    ]);

    expect(citations[0]?.sourceType).toBe("structured_state");
    expect(citations[1]?.sourceType).toBe("document_summary");
    expect(citations[2]?.sourceType).toBe("document_summary");
  });

  it("maps memory and snapshot domains distinctly", () => {
    expect(mapDomainToCitationSourceType("memory")).toBe("memory");
    expect(mapDomainToCitationSourceType("snapshot")).toBe("snapshot");
  });
});
