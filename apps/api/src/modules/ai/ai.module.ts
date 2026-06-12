import { Module } from "@nestjs/common";
import { env } from "../../env.js";
import { ChatAttachmentsModule } from "../chat-attachments/chat-attachments.module.js";
import { CoachingContextModule } from "../coaching-context/coaching-context.module.js";
import { ExercisesModule } from "../exercises/exercises.module.js";
import { NutritionModule } from "../nutrition/nutrition.module.js";
import { ProgressModule } from "../progress/progress.module.js";
import { RecipesModule } from "../recipes/recipes.module.js";
import { WorkoutsModule } from "../workouts/workouts.module.js";
import { ActionResolverService } from "./action-resolver.service.js";
import { ActionVariantCatalogService } from "./action-variant-catalog.service.js";
import { AgentOrchestratorService } from "./agent-orchestrator.service.js";
import { AgentToolRegistryService } from "./agent-tool-registry.service.js";
import { AiDailyUsageTelemetryService } from "./ai-daily-usage-telemetry.service.js";
import { AiBehaviorModule } from "./ai-behavior.module.js";
import { AiService } from "./ai.service.js";
import { CapabilityRegistryService } from "./capability-registry.service.js";
import { DecisionMakerExecutorService } from "./decision-maker-executor.service.js";
import { DirectChatPathMatcherService } from "./direct-chat-path-matcher.service.js";
import { DomainLlmExecutorService } from "./domain-llm-executor.service.js";
import { MessagePreprocessorService } from "./message-preprocessor.service.js";
import { OpenAiProposalRepairProvider } from "./openai-proposal-repair-provider.js";
import { ProposalRepairService } from "./proposal-repair.service.js";
import { PROPOSAL_REPAIR_PROVIDER } from "./proposal-repair.tokens.js";
import { RouterLlmService } from "./router-llm.service.js";
import { ProposalExplainerMatcherService } from "./proposal-explainer-matcher.service.js";
import { ResponseModePolicyService } from "./response-mode-policy.service.js";
import { SystemPlannerService } from "./system-planner.service.js";

@Module({
  imports: [
    AiBehaviorModule,
    ChatAttachmentsModule,
    CoachingContextModule,
    ExercisesModule,
    NutritionModule,
    ProgressModule,
    RecipesModule,
    WorkoutsModule,
  ],
  providers: [
    ActionResolverService,
    ActionVariantCatalogService,
    AgentToolRegistryService,
    AiDailyUsageTelemetryService,
    CapabilityRegistryService,
    DecisionMakerExecutorService,
    DirectChatPathMatcherService,
    DomainLlmExecutorService,
    MessagePreprocessorService,
    {
      provide: PROPOSAL_REPAIR_PROVIDER,
      useFactory: () => {
        if (env.AI_COACH_PROVIDER === "openai" && env.OPENAI_API_KEY) {
          return new OpenAiProposalRepairProvider({
            apiKey: env.OPENAI_API_KEY,
            // Repair reuses the decision-stage model unless explicitly overridden.
            model: env.OPENAI_REPAIR_MODEL ?? env.OPENAI_MODEL_DECISION ?? env.OPENAI_MODEL,
          });
        }

        // No provider available (missing key); ProposalRepairService degrades to
        // null (no repair attempt) via @Optional() injection.
        return undefined;
      },
    },
    ProposalRepairService,
    RouterLlmService,
    ProposalExplainerMatcherService,
    ResponseModePolicyService,
    SystemPlannerService,
    AgentOrchestratorService,
    AiService,
  ],
  exports: [
    AiService,
    AiDailyUsageTelemetryService,
    ProposalRepairService,
    AgentOrchestratorService,
    AgentToolRegistryService,
    AiBehaviorModule,
    ActionVariantCatalogService,
    CapabilityRegistryService,
    DecisionMakerExecutorService,
    DirectChatPathMatcherService,
    DomainLlmExecutorService,
    MessagePreprocessorService,
    RouterLlmService,
    ProposalExplainerMatcherService,
    ResponseModePolicyService,
    SystemPlannerService,
  ],
})
export class AiModule {}
