import type { AgentCitation, AgentContextPacket, ContextSourceRef } from "@health/types";

/** Keys from legacy `toPromptContext(snapshot)` that must never reach agent providers. */
export const LEGACY_BROAD_COACHING_CONTEXT_KEYS = [
  "user",
  "profile",
  "onboardingCompleted",
  "coachingHierarchy",
  "personalContextSummary",
  "goals",
  "activeWorkoutRevisionId",
  "activeNutritionRevisionId",
  "activeHabitRevisionId",
  "recentHabitAdherenceSummary",
  "weeklyProgressSummary",
  "documentSignalContext",
  "correlationInsights",
] as const;

const SLICE_ENVELOPE_KEYS = new Set([
  "purpose",
  "depth",
  "timeRange",
  "generatedAt",
  "sourceRefs",
  "recommendationConstraints",
]);

export function buildAgentPromptContextFromPacket(
  packet: AgentContextPacket,
): Record<string, unknown> {
  const context: Record<string, unknown> = {
    agentContext: {
      purpose: packet.purpose,
      depth: packet.depth,
      timeRange: packet.timeRange,
      intent: packet.intent,
      safetyConstraints: packet.safetyConstraints,
      routing: packet.routing,
      missingContextNotes: packet.missingContextNotes,
    },
  };

  appendSliceFields(context, packet.slice);

  if (packet.supplementarySlices.length > 0) {
    context.supplementaryContextSlices = packet.supplementarySlices.map((slice) => {
      const section: Record<string, unknown> = {
        purpose: slice.purpose,
        depth: slice.depth,
        timeRange: slice.timeRange,
      };

      appendSliceFields(section, slice);

      return section;
    });
  }

  return context;
}

function appendSliceFields(
  target: Record<string, unknown>,
  slice: AgentContextPacket["slice"],
) {
  for (const [key, value] of Object.entries(slice)) {
    if (SLICE_ENVELOPE_KEYS.has(key) || value === undefined) {
      continue;
    }

    target[key] = value;
  }
}

export function mapContextSourceRefsToAgentCitations(
  sourceRefs: ReadonlyArray<ContextSourceRef>,
): AgentCitation[] {
  return sourceRefs.map((ref) => ({
    sourceType: mapDomainToCitationSourceType(ref.domain),
    label: ref.label,
    referenceId: ref.referenceId,
  }));
}

export function mapDomainToCitationSourceType(
  domain: string,
): AgentCitation["sourceType"] {
  const normalized = domain.trim().toLowerCase();

  if (
    normalized === "document" ||
    normalized === "document_summary" ||
    normalized === "rag" ||
    normalized.startsWith("document_")
  ) {
    return "document_summary";
  }

  if (normalized === "memory") {
    return "memory";
  }

  if (normalized === "snapshot") {
    return "snapshot";
  }

  return "structured_state";
}
