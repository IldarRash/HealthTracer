import type { CapabilityConfig, IntentCatalogEntry } from "@health/types";

export type CoachIntentDefinitionMetadata = IntentCatalogEntry;

export function toCoachIntentDefinitionMetadata(
  config: CapabilityConfig,
): CoachIntentDefinitionMetadata {
  return {
    id: config.capabilityId,
    kind: config.kind,
    description: config.description,
    routerGuidance: config.routingGuidance,
    examples: [...config.examples],
    defaultContextSlice: config.defaultContextStrategy,
    allowedTools: [...config.allowedTools],
    allowedProposalIntents: [...config.allowedProposals],
    safetyGuidance: [...config.safetyNotes],
    promptInstructions: config.prompt,
    mappedAgentIntent: config.mappedAgentIntent,
  };
}
