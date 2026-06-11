import { z } from "zod";
import type { AgentIntent, AgentRoutingMethod, AgentToolName, CatalogIntentId } from "./agent-context.js";
import {
  agentIntentSchema,
  agentRoutingMethodSchema,
  agentToolNameSchema,
  catalogIntentIdSchema,
  contextSliceRequestSchema,
  expectedResponseModeSchema,
  resolveDefaultExpectedResponseMode,
} from "./agent-context.js";
import {
  AGENT_INTENT_CATALOG,
  intentCatalogEntrySchema,
  intentCatalogKindSchema,
  type IntentCatalogEntry,
} from "./intent-catalog.js";

export const capabilityKindSchema = intentCatalogKindSchema;

export type CapabilityKind = z.infer<typeof capabilityKindSchema>;

const capabilityProposalIntentSchema = intentCatalogEntrySchema.shape.allowedProposalIntents.element;

export type CapabilityProposalIntent = z.infer<typeof capabilityProposalIntentSchema>;

export const capabilityContextStrategySchema = contextSliceRequestSchema;

export type CapabilityContextStrategy = z.infer<typeof capabilityContextStrategySchema>;

export const capabilityResponseMetadataSchema = z
  .object({
    defaultRoutingMethod: agentRoutingMethodSchema.optional(),
    expectedResponseMode: expectedResponseModeSchema.optional(),
  })
  .optional();

export type CapabilityResponseMetadata = z.infer<typeof capabilityResponseMetadataSchema>;

export const capabilityCompositionStrategySchema = z.enum(["primary_only", "additive_supporting"]);

export type CapabilityCompositionStrategy = z.infer<typeof capabilityCompositionStrategySchema>;

export const capabilityCompositionMetadataSchema = z.object({
  strategy: capabilityCompositionStrategySchema,
  relatedCapabilities: z.array(catalogIntentIdSchema).max(5),
  secondaryCapabilities: z.array(catalogIntentIdSchema).max(5),
});

export type CapabilityCompositionMetadata = z.infer<typeof capabilityCompositionMetadataSchema>;

export const capabilityWidgetDescriptorSchema = z.object({
  id: z.string().min(1).max(80),
  type: z.string().min(1).max(80),
  proposalIntent: capabilityProposalIntentSchema.optional(),
});

export type CapabilityWidgetDescriptor = z.infer<typeof capabilityWidgetDescriptorSchema>;

export const capabilityActionDescriptorSchema = z.object({
  id: z.string().min(1).max(80),
  type: z.string().min(1).max(80),
  proposalIntent: capabilityProposalIntentSchema.optional(),
});

export type CapabilityActionDescriptor = z.infer<typeof capabilityActionDescriptorSchema>;

export const DEFAULT_CAPABILITY_COMPOSITION_METADATA: CapabilityCompositionMetadata = {
  strategy: "primary_only",
  relatedCapabilities: [],
  secondaryCapabilities: [],
};

export type ResolvedCapabilityPresentationMetadata = {
  primaryCapabilityId: CatalogIntentId;
  selectedCapabilityIds: readonly CatalogIntentId[];
  compositionStrategy: CapabilityCompositionStrategy;
  widgetDescriptors: readonly CapabilityWidgetDescriptor[];
  actionDescriptors: readonly CapabilityActionDescriptor[];
};

export const capabilityConfigSchema = z.object({
  capabilityId: catalogIntentIdSchema,
  kind: capabilityKindSchema,
  description: z.string().min(1).max(500),
  routingGuidance: z.string().min(1).max(1000),
  examples: z.array(z.string().min(1).max(240)).max(8),
  defaultContextStrategy: capabilityContextStrategySchema,
  allowedTools: z.array(agentToolNameSchema).max(6),
  allowedProposals: z.array(capabilityProposalIntentSchema).max(15),
  safetyNotes: z.array(z.string().min(1).max(240)).max(10),
  prompt: z.string().min(1).max(4000),
  mappedAgentIntent: agentIntentSchema,
  responseMetadata: capabilityResponseMetadataSchema,
  compositionMetadata: capabilityCompositionMetadataSchema.default(
    DEFAULT_CAPABILITY_COMPOSITION_METADATA,
  ),
  widgetDescriptors: z.array(capabilityWidgetDescriptorSchema).max(10).default([]),
  actionDescriptors: z.array(capabilityActionDescriptorSchema).max(10).default([]),
});

export type CapabilityConfig = z.infer<typeof capabilityConfigSchema>;

export type CapabilityConfigParseResult =
  | { success: true; data: CapabilityConfig }
  | { success: false; errors: readonly string[] };

export type RouterSerializedCapabilityConfig = {
  id: CatalogIntentId;
  description: string;
  routerGuidance: string;
  examples: readonly string[];
};

// B7 removal: "attachment_family" and "llm_router" enum values deleted from agentRoutingMethodSchema.
// The attachment_family capability KIND is kept (intent-catalog.ts:277-320) — only the
// agent-context routing ENUM values were in B7 scope.
// Attachment capabilities now map to "unified_turn_decision" as their routing metadata default.
function resolveDefaultRoutingMethodForKind(_kind: CapabilityKind): AgentRoutingMethod {
  return "unified_turn_decision";
}

function resolveResponseMetadataForCatalogEntry(
  entry: IntentCatalogEntry,
): CapabilityResponseMetadata {
  if (entry.id === "proposal_explainer") {
    return {
      defaultRoutingMethod: "rule_based",
      expectedResponseMode: "advice_only",
    };
  }

  return {
    defaultRoutingMethod: resolveDefaultRoutingMethodForKind(entry.kind),
    expectedResponseMode: resolveDefaultExpectedResponseMode(entry.mappedAgentIntent),
  };
}

function resolveDefaultCompositionMetadataForCatalogEntry(
  _entry: IntentCatalogEntry,
): CapabilityCompositionMetadata {
  return { ...DEFAULT_CAPABILITY_COMPOSITION_METADATA };
}

function resolveDefaultWidgetDescriptorsForCatalogEntry(
  entry: IntentCatalogEntry,
): CapabilityWidgetDescriptor[] {
  return entry.allowedProposalIntents.map((proposalIntent) => ({
    id: `${proposalIntent}_card`,
    type: "proposal_card",
    proposalIntent,
  }));
}

function resolveDefaultActionDescriptorsForCatalogEntry(
  entry: IntentCatalogEntry,
): CapabilityActionDescriptor[] {
  return entry.allowedProposalIntents.map((proposalIntent) => ({
    id: proposalIntent,
    type: "create_proposal",
    proposalIntent,
  }));
}

function dedupeDescriptorsById<T extends { id: string }>(descriptors: readonly T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const descriptor of descriptors) {
    if (seen.has(descriptor.id)) {
      continue;
    }

    seen.add(descriptor.id);
    deduped.push(descriptor);
  }

  return deduped;
}

export function resolveSelectedCapabilityIdsFromComposition(
  primaryCapabilityId: CatalogIntentId,
  composition: CapabilityCompositionMetadata,
): CatalogIntentId[] {
  if (composition.strategy === "primary_only") {
    return [primaryCapabilityId];
  }

  const supporting: CatalogIntentId[] = [];
  const seen = new Set<CatalogIntentId>();

  for (const capabilityId of [
    ...composition.relatedCapabilities,
    ...composition.secondaryCapabilities,
  ]) {
    if (seen.has(capabilityId)) {
      continue;
    }

    seen.add(capabilityId);
    supporting.push(capabilityId);
  }

  return resolveSelectedCapabilityIds(primaryCapabilityId, supporting);
}

export function resolveSelectedCapabilityIds(
  primaryCapabilityId: CatalogIntentId,
  selectedCapabilityIds?: readonly CatalogIntentId[],
): CatalogIntentId[] {
  const normalizedSelected = selectedCapabilityIds?.length
    ? [...selectedCapabilityIds]
    : [primaryCapabilityId];

  if (normalizedSelected[0] === primaryCapabilityId) {
    return normalizedSelected;
  }

  const withoutPrimary = normalizedSelected.filter((id) => id !== primaryCapabilityId);
  return [primaryCapabilityId, ...withoutPrimary];
}

export function resolveCapabilityPresentationMetadata(
  primaryCapabilityId: CatalogIntentId,
  options?: {
    selectedCapabilityIds?: readonly CatalogIntentId[];
    getConfig?: (capabilityId: CatalogIntentId) => CapabilityConfig;
  },
): ResolvedCapabilityPresentationMetadata {
  const getConfig = options?.getConfig ?? getCapabilityConfig;
  const primaryConfig = getConfig(primaryCapabilityId);
  const selectedCapabilityIds = resolveSelectedCapabilityIds(
    primaryCapabilityId,
    options?.selectedCapabilityIds,
  );

  const widgetDescriptors: CapabilityWidgetDescriptor[] = [];
  const actionDescriptors: CapabilityActionDescriptor[] = [];

  for (const capabilityId of selectedCapabilityIds) {
    const config = getConfig(capabilityId);
    widgetDescriptors.push(...config.widgetDescriptors);
    actionDescriptors.push(...config.actionDescriptors);
  }

  return {
    primaryCapabilityId,
    selectedCapabilityIds,
    compositionStrategy: primaryConfig.compositionMetadata.strategy,
    widgetDescriptors: dedupeDescriptorsById(widgetDescriptors),
    actionDescriptors: dedupeDescriptorsById(actionDescriptors),
  };
}

export function formatCapabilityConfigValidationErrors(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "capabilityConfig";
    return `${path}: ${issue.message}`;
  });
}

export function safeParseCapabilityConfig(value: unknown): CapabilityConfigParseResult {
  const parsed = capabilityConfigSchema.safeParse(value);

  if (parsed.success) {
    return { success: true, data: parsed.data };
  }

  return { success: false, errors: formatCapabilityConfigValidationErrors(parsed.error) };
}

export function validateCapabilityConfig(value: unknown): string[] {
  const result = safeParseCapabilityConfig(value);
  return result.success ? [] : [...result.errors];
}

export function convertCatalogEntryToCapabilityConfig(
  entry: IntentCatalogEntry,
): CapabilityConfig {
  return {
    capabilityId: entry.id,
    kind: entry.kind,
    description: entry.description,
    routingGuidance: entry.routerGuidance,
    examples: [...entry.examples],
    defaultContextStrategy: capabilityContextStrategySchema.parse(entry.defaultContextSlice),
    allowedTools: [...entry.allowedTools],
    allowedProposals: [...entry.allowedProposalIntents],
    safetyNotes: [...entry.safetyGuidance],
    prompt: entry.promptInstructions,
    mappedAgentIntent: entry.mappedAgentIntent,
    responseMetadata: resolveResponseMetadataForCatalogEntry(entry),
    compositionMetadata: resolveDefaultCompositionMetadataForCatalogEntry(entry),
    widgetDescriptors: resolveDefaultWidgetDescriptorsForCatalogEntry(entry),
    actionDescriptors: resolveDefaultActionDescriptorsForCatalogEntry(entry),
  };
}

export const AGENT_CAPABILITY_CONFIGS: readonly CapabilityConfig[] = AGENT_INTENT_CATALOG.map(
  convertCatalogEntryToCapabilityConfig,
);

export const AGENT_CAPABILITY_CONFIG_BY_ID: Readonly<Record<CatalogIntentId, CapabilityConfig>> =
  Object.fromEntries(AGENT_CAPABILITY_CONFIGS.map((config) => [config.capabilityId, config])) as Record<
    CatalogIntentId,
    CapabilityConfig
  >;

export function getCapabilityConfig(capabilityId: CatalogIntentId): CapabilityConfig {
  const config = AGENT_CAPABILITY_CONFIG_BY_ID[capabilityId];

  if (!config) {
    throw new Error(`Unknown capability id: ${capabilityId}`);
  }

  return config;
}

export function listCapabilityConfigs(): CapabilityConfig[] {
  return [...AGENT_CAPABILITY_CONFIGS];
}

export function listRouterCapabilityConfigs(): CapabilityConfig[] {
  return AGENT_CAPABILITY_CONFIGS.filter(
    (config) => config.kind === "normal" && config.capabilityId !== "proposal_explainer",
  );
}

export function serializeCapabilityConfigsForRouter(
  configs: ReadonlyArray<CapabilityConfig> = listRouterCapabilityConfigs(),
): RouterSerializedCapabilityConfig[] {
  return configs.map((config) => ({
    id: config.capabilityId,
    description: config.description,
    routerGuidance: config.routingGuidance,
    examples: config.examples,
  }));
}

export function getAllowedToolsForCapability(
  capabilityId: CatalogIntentId,
): readonly AgentToolName[] {
  return getCapabilityConfig(capabilityId).allowedTools;
}

export function getAllowedProposalsForCapability(
  capabilityId: CatalogIntentId,
): readonly CapabilityProposalIntent[] {
  return getCapabilityConfig(capabilityId).allowedProposals;
}

export function getDefaultContextStrategyForCapability(
  capabilityId: CatalogIntentId,
): CapabilityContextStrategy {
  return getCapabilityConfig(capabilityId).defaultContextStrategy;
}

export function resolveMappedAgentIntentForCapability(capabilityId: CatalogIntentId): AgentIntent {
  return getCapabilityConfig(capabilityId).mappedAgentIntent;
}

export function getCompositionMetadataForCapability(
  capabilityId: CatalogIntentId,
): CapabilityCompositionMetadata {
  return getCapabilityConfig(capabilityId).compositionMetadata;
}

export function getWidgetDescriptorsForCapability(
  capabilityId: CatalogIntentId,
): readonly CapabilityWidgetDescriptor[] {
  return getCapabilityConfig(capabilityId).widgetDescriptors;
}

export function getActionDescriptorsForCapability(
  capabilityId: CatalogIntentId,
): readonly CapabilityActionDescriptor[] {
  return getCapabilityConfig(capabilityId).actionDescriptors;
}
