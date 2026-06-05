import type {
  DomainLlmStepOutputInput,
  DomainLlmStepRequest,
  FinalDecisionOutputInput,
  FinalDecisionRequest,
  RouterDecisionOutputInput,
  RouterDecisionRequest,
} from "@health/types";

export interface CoachAiProvider {
  generateRouterDecision(request: RouterDecisionRequest): Promise<RouterDecisionOutputInput>;
  generateDomainStep(request: DomainLlmStepRequest): Promise<DomainLlmStepOutputInput>;
  generateFinalDecision(request: FinalDecisionRequest): Promise<FinalDecisionOutputInput>;
}
