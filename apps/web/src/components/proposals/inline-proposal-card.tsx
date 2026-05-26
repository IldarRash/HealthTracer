"use client";

import type { AiProposal, ProposalModifyResponse } from "@health/types";
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
  if (props.proposal.intent === "capture_wellbeing_checkin") {
    return <WellbeingCheckinProposalCard {...props} />;
  }

  if (props.proposal.intent === "log_nutrition_incident") {
    return <NutritionIncidentProposalCard {...props} />;
  }

  if (props.proposal.intent === "recommend_recipes") {
    return <RecommendRecipesProposalCard {...props} />;
  }

  return <GenericInlineProposalCard {...props} />;
}
