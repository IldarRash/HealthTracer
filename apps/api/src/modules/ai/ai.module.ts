import { Module } from "@nestjs/common";
import { CoachingContextModule } from "../coaching-context/coaching-context.module.js";
import { AgentOrchestratorService } from "./agent-orchestrator.service.js";
import { AgentToolRegistryService } from "./agent-tool-registry.service.js";
import { AiService } from "./ai.service.js";

@Module({
  imports: [CoachingContextModule],
  providers: [AgentToolRegistryService, AgentOrchestratorService, AiService],
  exports: [AiService, AgentOrchestratorService, AgentToolRegistryService],
})
export class AiModule {}
