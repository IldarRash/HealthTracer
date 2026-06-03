import type {
  AgentIntent,
  AgentToolName,
  CapabilityActionDescriptor,
  CapabilityCompositionMetadata,
  CapabilityConfig,
  CapabilityContextStrategy,
  CapabilityProposalIntent,
  CapabilityWidgetDescriptor,
  CatalogIntentId,
  ResolvedCapabilityPresentationMetadata,
  RouterSerializedCapabilityConfig,
} from "@health/types";
import {
  AGENT_CAPABILITY_CONFIGS,
  getCapabilityConfig,
  mergeCapabilityConfigOverrides,
  resolveCapabilityPresentationMetadata,
  resolveSelectedCapabilityIdsFromComposition,
  safeParseCapabilityConfig,
  serializeCapabilityConfigsForRouter,
} from "@health/types";
import { Injectable, Logger } from "@nestjs/common";
import {
  toCoachIntentDefinitionMetadata,
  type CoachIntentDefinitionMetadata,
} from "./capability-intent-definition.adapter.js";
import { AiBehaviorConfigService } from "./ai-behavior-config.service.js";

@Injectable()
export class CapabilityRegistryService {
  private readonly logger = new Logger(CapabilityRegistryService.name);
  private readonly configsById = new Map<CatalogIntentId, CapabilityConfig>();
  private readonly fallbackConfig: CapabilityConfig;
  private readonly fallbackCapabilityId: CatalogIntentId;

  constructor(private readonly aiBehaviorConfigService: AiBehaviorConfigService) {
    this.fallbackCapabilityId = this.aiBehaviorConfigService.getResponseModes().fallbackCapabilityId;

    const mergedConfigs = mergeCapabilityConfigOverrides(
      AGENT_CAPABILITY_CONFIGS,
      this.aiBehaviorConfigService.getConfig().capabilities,
    );

    for (const config of mergedConfigs) {
      const parsed = safeParseCapabilityConfig(config);

      if (!parsed.success) {
        this.logger.warn(
          `Skipping invalid capability config "${config.capabilityId}": ${parsed.errors.join("; ")}`,
        );
        continue;
      }

      this.configsById.set(parsed.data.capabilityId, parsed.data);
    }

    this.fallbackConfig =
      this.configsById.get(this.fallbackCapabilityId) ??
      getCapabilityConfig(this.fallbackCapabilityId);
  }

  listConfigs(): readonly CapabilityConfig[] {
    return [...this.configsById.values()];
  }

  listRouterConfigs(): readonly CapabilityConfig[] {
    return this.listConfigs().filter(
      (config) => config.kind === "normal" && config.capabilityId !== "proposal_explainer",
    );
  }

  serializeForRouter(): RouterSerializedCapabilityConfig[] {
    return serializeCapabilityConfigsForRouter(this.listRouterConfigs());
  }

  getConfig(capabilityId: CatalogIntentId): CapabilityConfig {
    return this.configsById.get(capabilityId) ?? this.fallbackConfig;
  }

  getCoachIntentDefinition(capabilityId: CatalogIntentId): CoachIntentDefinitionMetadata {
    return toCoachIntentDefinitionMetadata(this.getConfig(capabilityId));
  }

  getAllowedTools(capabilityId: CatalogIntentId): readonly AgentToolName[] {
    return this.getConfig(capabilityId).allowedTools;
  }

  getAllowedProposals(capabilityId: CatalogIntentId): readonly CapabilityProposalIntent[] {
    return this.getConfig(capabilityId).allowedProposals;
  }

  resolveMappedAgentIntent(capabilityId: CatalogIntentId): AgentIntent {
    return this.getConfig(capabilityId).mappedAgentIntent;
  }

  getDefaultContextStrategy(capabilityId: CatalogIntentId): CapabilityContextStrategy {
    return this.getConfig(capabilityId).defaultContextStrategy;
  }

  getCompositionMetadata(capabilityId: CatalogIntentId): CapabilityCompositionMetadata {
    return this.getConfig(capabilityId).compositionMetadata;
  }

  getWidgetDescriptors(capabilityId: CatalogIntentId): readonly CapabilityWidgetDescriptor[] {
    return this.getConfig(capabilityId).widgetDescriptors;
  }

  getActionDescriptors(capabilityId: CatalogIntentId): readonly CapabilityActionDescriptor[] {
    return this.getConfig(capabilityId).actionDescriptors;
  }

  resolveSelectedCapabilityIds(primaryCapabilityId: CatalogIntentId): CatalogIntentId[] {
    return resolveSelectedCapabilityIdsFromComposition(
      primaryCapabilityId,
      this.getCompositionMetadata(primaryCapabilityId),
    );
  }

  resolvePresentationMetadata(
    primaryCapabilityId: CatalogIntentId,
    selectedCapabilityIds?: readonly CatalogIntentId[],
  ): ResolvedCapabilityPresentationMetadata {
    return resolveCapabilityPresentationMetadata(primaryCapabilityId, {
      selectedCapabilityIds,
      getConfig: (capabilityId) => this.getConfig(capabilityId),
    });
  }

  resolveTurnPresentationMetadata(
    primaryCapabilityId: CatalogIntentId,
  ): ResolvedCapabilityPresentationMetadata {
    const selectedCapabilityIds = this.resolveSelectedCapabilityIds(primaryCapabilityId);
    return this.resolvePresentationMetadata(primaryCapabilityId, selectedCapabilityIds);
  }
}
