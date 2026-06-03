import type {
  ContextBudgetPolicy,
  ContextExpansionDecisionResult,
  ContextExpansionLimits,
  ContextExpansionRequest,
  ContextExpansionValidationResult,
} from "@health/types";
import {
  denyContextExpansionRequest,
  evaluateContextExpansionRequest,
} from "@health/types";
import { Injectable } from "@nestjs/common";

@Injectable()
export class ContextExpansionPolicyService {
  evaluateRequest(input: {
    request: ContextExpansionRequest;
    budget: ContextBudgetPolicy;
    completedRounds?: number;
  }): ContextExpansionValidationResult {
    return evaluateContextExpansionRequest(input);
  }

  denyRequest(input: {
    request: ContextExpansionRequest;
    budget: ContextBudgetPolicy;
    completedRounds?: number;
    denialReason: string;
  }): ContextExpansionDecisionResult {
    return denyContextExpansionRequest(input);
  }

  createPolicySnapshot(budget: ContextBudgetPolicy, completedRounds = 0): ContextExpansionLimits {
    return {
      maxExpansionRounds: budget.maxExpansionRounds,
      maxSlicesPerRound: budget.maxSlicesPerExpansionRound,
      remainingRounds: Math.max(0, budget.maxExpansionRounds - completedRounds),
    };
  }

  /**
   * Safe integration point while the agent loop does not emit expansion requests.
   * Denies immediately when expansion is disabled or the round is out of policy.
   */
  handleExpansionRequestOrDeny(input: {
    request: ContextExpansionRequest;
    budget: ContextBudgetPolicy;
    completedRounds?: number;
  }): ContextExpansionDecisionResult {
    const completedRounds = input.completedRounds ?? input.request.roundIndex;

    if (input.budget.maxExpansionRounds === 0) {
      return this.denyRequest({
        request: input.request,
        budget: input.budget,
        completedRounds,
        denialReason: "Context expansion is disabled for the active budget profile.",
      });
    }

    const evaluation = this.evaluateRequest(input);

    if (!evaluation.ok) {
      return this.denyRequest({
        request: input.request,
        budget: input.budget,
        completedRounds,
        denialReason: evaluation.errors[0] ?? "Expansion request is out of policy.",
      });
    }

    return evaluation.decision;
  }
}
