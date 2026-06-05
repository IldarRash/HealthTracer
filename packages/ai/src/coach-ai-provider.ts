import type {
  AgentLoopOutputInput,
  AgentToolCallResult,
  AiStructuredOutputInput,
  DomainLlmStepOutputInput,
  DomainLlmStepRequest,
  FinalDecisionOutputInput,
  FinalDecisionRequest,
  IntentCatalogEntry,
  RouterDecisionOutputInput,
  RouterDecisionRequest,
} from "@health/types";

export interface CoachAiRequest {
  readonly userMessage: string;
  readonly recentMessages: ReadonlyArray<{
    readonly role: "user" | "assistant" | "system";
    readonly content: string;
  }>;
  readonly coachingContext: Record<string, unknown>;
  readonly agentMetadata?: {
    readonly purpose: string;
    readonly intent: string;
    readonly catalogIntentId?: string;
    readonly depth: string;
    readonly timeRange: string;
    readonly safetyConstraints: readonly string[];
    readonly expectedResponseMode?: string;
    readonly safetyFlags?: readonly string[];
    readonly missingContextNotes?: readonly string[];
    readonly intentDefinition?: IntentCatalogEntry;
    readonly allowedTools?: readonly string[];
    readonly allowedProposalIntents?: readonly string[];
    readonly messageUnderstandingSummary?: Record<string, unknown>;
    readonly responseModeExecutor?: {
      readonly mode: string;
      readonly handlerPath: string;
      readonly maxLoopIterations: number;
      readonly allowToolLoop: boolean;
      readonly useContextExpansionMetadata: boolean;
    };
  };
}

export interface CoachAiLoopRequest extends CoachAiRequest {
  readonly iteration: number;
  readonly maxIterations: number;
  readonly priorToolResults: ReadonlyArray<AgentToolCallResult>;
}

export interface CoachAiProvider {
  generateAgentLoopStep(request: CoachAiLoopRequest): Promise<AgentLoopOutputInput>;
  generateCoachResponse(request: CoachAiRequest): Promise<AiStructuredOutputInput>;
  generateRouterDecision(request: RouterDecisionRequest): Promise<RouterDecisionOutputInput>;
  generateDomainStep(request: DomainLlmStepRequest): Promise<DomainLlmStepOutputInput>;
  generateFinalDecision(request: FinalDecisionRequest): Promise<FinalDecisionOutputInput>;
}
