import type { AiStructuredOutput, AgentTurnMetadata } from "@health/types";
import { Injectable } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import {
  AgentOrchestratorService,
  type ProposalRevisionContext,
} from "./agent-orchestrator.service.js";

const SAFE_FALLBACK_REPLY =
  "I could not safely process that response. Please try again with a wellness-focused question.";

export interface GenerateCoachResponseInput {
  auth: ClerkAuthContext;
  userMessage: string;
  recentMessages: ReadonlyArray<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
  proposalRevision?: ProposalRevisionContext;
}

export interface GeneratedCoachResponse {
  output: AiStructuredOutput;
  parseErrors: string[];
  replySafetyErrors: string[];
  agentMetadata: AgentTurnMetadata;
}

@Injectable()
export class AiService {
  constructor(private readonly agentOrchestratorService: AgentOrchestratorService) {}

  async generateCoachResponse(
    input: GenerateCoachResponseInput,
  ): Promise<GeneratedCoachResponse> {
    const orchestrated = await this.agentOrchestratorService.orchestrateCoachTurn(input);

    return {
      output: orchestrated.output,
      parseErrors: orchestrated.parseErrors,
      replySafetyErrors: orchestrated.replySafetyErrors,
      agentMetadata: orchestrated.agentMetadata,
    };
  }

  getProviderMode() {
    return this.agentOrchestratorService.getProviderMode();
  }
}

export { SAFE_FALLBACK_REPLY };
