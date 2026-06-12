"use client";

import type { AiProposal, ProposalModifyResponse } from "@health/types";
import { isValidatedProposal } from "@health/types";
import { parseDisplayContract } from "../../lib/display-contract-ui-state";
import { tryRenderAdjustNutritionPlanProposalCard } from "./adjust-nutrition-plan-proposal-card";
import { BodyAnalysisProposalCard } from "./body-analysis-proposal-card";
import { ContractProposalCard } from "./contract-proposal-card";
import { InlineProposalCard as GenericInlineProposalCard } from "./inline-proposal-card-generic";
import { NutritionIncidentProposalCard } from "./nutrition-incident-proposal-card";
import { RecommendRecipesProposalCard } from "./recommend-recipes-proposal-card";
import { WellbeingCheckinProposalCard } from "./wellbeing-checkin-proposal-card";

type InlineProposalCardProps = {
  proposal: AiProposal;
  onDecision?: (proposal: AiProposal) => void;
  onModifyRequest?: (response: ProposalModifyResponse) => void;
};

export function InlineProposalCard(props: InlineProposalCardProps) {
  // Unvalidated proposals ("invalid" and "pending_validation") route to the
  // generic card regardless of intent: it owns the honest notice with disabled
  // Apply plus working Reject/Modify. Specialized cards assume a payload that
  // passed per-intent validation, which only the validated variant guarantees.
  if (!isValidatedProposal(props.proposal)) {
    return <GenericInlineProposalCard {...props} />;
  }

  if (props.proposal.intent === "capture_wellbeing_checkin") {
    return <WellbeingCheckinProposalCard {...props} />;
  }

  if (props.proposal.intent === "log_nutrition_incident") {
    return <NutritionIncidentProposalCard {...props} />;
  }

  if (props.proposal.intent === "recommend_recipes") {
    return <RecommendRecipesProposalCard {...props} />;
  }

  if (props.proposal.intent === "save_body_analysis") {
    return <BodyAnalysisProposalCard {...props} />;
  }

  // adjust_nutrition_plan with structured swaps → C4 dietary draft compare card.
  const dietaryDraftCard = tryRenderAdjustNutritionPlanProposalCard(
    props.proposal,
    props.onDecision,
    props.onModifyRequest,
  );
  if (dietaryDraftCard) {
    return dietaryDraftCard;
  }

  // Any proposal carrying a displayContract (workout plan, log_workout_activity, etc.)
  // gets the interactive contract card with live-recomputed derived values.
  const contract = parseDisplayContract(props.proposal.proposedChanges);
  if (contract) {
    return <ContractProposalCard {...props} contract={contract} />;
  }

  return <GenericInlineProposalCard {...props} />;
}
