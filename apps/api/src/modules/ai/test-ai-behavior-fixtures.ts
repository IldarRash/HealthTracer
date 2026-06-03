import {
  buildDefaultAiBehaviorConfig,
  buildDefaultAttachmentBehaviorConfig,
  resolveLoadedAiBehaviorConfig,
  resolveLoadedAttachmentBehaviorConfig,
} from "@health/types";
import { ContextBudgetPolicyService } from "../coaching-context/context-budget-policy.service.js";
import { AiBehaviorConfigService } from "./ai-behavior-config.service.js";
import { CapabilityRegistryService } from "./capability-registry.service.js";
import { ResponseModePolicyService } from "./response-mode-policy.service.js";
import { DirectChatPathMatcherService } from "./direct-chat-path-matcher.service.js";
import { ProposalExplainerMatcherService } from "./proposal-explainer-matcher.service.js";
import { SystemPlannerService } from "./system-planner.service.js";

export function createDefaultAiBehaviorConfigService(): AiBehaviorConfigService {
  return new AiBehaviorConfigService(
    resolveLoadedAiBehaviorConfig({
      defaults: buildDefaultAiBehaviorConfig(),
    }),
    resolveLoadedAttachmentBehaviorConfig({
      defaults: buildDefaultAttachmentBehaviorConfig(),
    }),
  );
}

export function createAiPolicyTestStack() {
  const aiBehaviorConfigService = createDefaultAiBehaviorConfigService();
  const capabilityRegistryService = new CapabilityRegistryService(aiBehaviorConfigService);
  const responseModePolicyService = new ResponseModePolicyService(
    capabilityRegistryService,
    aiBehaviorConfigService,
  );
  const contextBudgetPolicyService = new ContextBudgetPolicyService(aiBehaviorConfigService);
  const directChatPathMatcherService = new DirectChatPathMatcherService(aiBehaviorConfigService);
  const proposalExplainerMatcherService = new ProposalExplainerMatcherService(
    aiBehaviorConfigService,
  );
  const systemPlannerService = new SystemPlannerService(
    capabilityRegistryService,
    responseModePolicyService,
    contextBudgetPolicyService,
    aiBehaviorConfigService,
    directChatPathMatcherService,
    proposalExplainerMatcherService,
  );

  return {
    aiBehaviorConfigService,
    capabilityRegistryService,
    responseModePolicyService,
    contextBudgetPolicyService,
    directChatPathMatcherService,
    proposalExplainerMatcherService,
    systemPlannerService,
  };
}
