import { Module } from "@nestjs/common";
import { CoachingContextModule } from "../coaching-context/coaching-context.module.js";
import { ActionResolverService } from "./action-resolver.service.js";
import { AgentOrchestratorService } from "./agent-orchestrator.service.js";
import { AgentToolRegistryService } from "./agent-tool-registry.service.js";
import { AiBehaviorModule } from "./ai-behavior.module.js";
import { AiService } from "./ai.service.js";
import { CapabilityRegistryService } from "./capability-registry.service.js";
import { DirectChatPathMatcherService } from "./direct-chat-path-matcher.service.js";
import { MessagePreprocessorService } from "./message-preprocessor.service.js";
import { MessageUnderstandingService } from "./message-understanding.service.js";
import { TurnDecisionService } from "./turn-decision.service.js";
import { ProposalExplainerMatcherService } from "./proposal-explainer-matcher.service.js";
import { ResponseModeExecutorService } from "./response-mode-executor.service.js";
import { ResponseModePolicyService } from "./response-mode-policy.service.js";
import { SystemPlannerService } from "./system-planner.service.js";

@Module({
  imports: [AiBehaviorModule, CoachingContextModule],
  providers: [
    ActionResolverService,
    AgentToolRegistryService,
    CapabilityRegistryService,
    DirectChatPathMatcherService,
    MessagePreprocessorService,
    MessageUnderstandingService,
    TurnDecisionService,
    ProposalExplainerMatcherService,
    ResponseModeExecutorService,
    ResponseModePolicyService,
    SystemPlannerService,
    AgentOrchestratorService,
    AiService,
  ],
  exports: [
    AiService,
    AgentOrchestratorService,
    AgentToolRegistryService,
    AiBehaviorModule,
    CapabilityRegistryService,
    DirectChatPathMatcherService,
    MessagePreprocessorService,
    MessageUnderstandingService,
    TurnDecisionService,
    ProposalExplainerMatcherService,
    ResponseModeExecutorService,
    ResponseModePolicyService,
    SystemPlannerService,
  ],
})
export class AiModule {}
