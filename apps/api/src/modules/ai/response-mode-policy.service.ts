import type { CatalogIntentId, ExpectedResponseMode } from "@health/types";
import { resolveDefaultExpectedResponseMode } from "@health/types";
import { Injectable } from "@nestjs/common";
import { AiBehaviorConfigService } from "./ai-behavior-config.service.js";
import { CapabilityRegistryService } from "./capability-registry.service.js";

export interface ResponseModePolicyInput {
  capabilityId: CatalogIntentId;
  routeProvidedMode?: ExpectedResponseMode;
}

@Injectable()
export class ResponseModePolicyService {
  constructor(
    private readonly capabilityRegistryService: CapabilityRegistryService,
    private readonly aiBehaviorConfigService: AiBehaviorConfigService,
  ) {}

  resolve(input: ResponseModePolicyInput): ExpectedResponseMode {
    if (input.routeProvidedMode) {
      return input.routeProvidedMode;
    }

    return this.resolveFromCapabilityPolicy(input.capabilityId);
  }

  resolveFromCapabilityPolicy(capabilityId: CatalogIntentId): ExpectedResponseMode {
    const config = this.capabilityRegistryService.getConfig(capabilityId);
    const policyMode = config.responseMetadata?.expectedResponseMode;

    if (policyMode) {
      return policyMode;
    }

    return resolveDefaultExpectedResponseMode(config.mappedAgentIntent);
  }

  resolveSafeFallback(): ExpectedResponseMode {
    return this.resolveFromCapabilityPolicy(
      this.aiBehaviorConfigService.getResponseModes().fallbackCapabilityId,
    );
  }
}
