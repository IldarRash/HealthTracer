import type { AiProposal, ProposalIntent, ProposalTargetDomain } from "@health/types";

export function getProposalIntentLabel(intent: ProposalIntent): string | null {
  switch (intent) {
    case "adapt_workout_plan_from_progress":
      return "Progress-based workout adaptation";
    default:
      return null;
  }
}

export function getProposalDomainLabel(domain: ProposalTargetDomain): string {
  switch (domain) {
    case "workout":
      return "Workout";
    case "goal":
      return "Goal";
    case "nutrition":
      return "Nutrition";
    case "recipe":
      return "Recipe";
    case "profile":
      return "Profile";
    case "today":
      return "Today";
    case "general":
      return "Coaching";
  }
}

export function getProposalDomainRoute(domain: ProposalTargetDomain): string | null {
  switch (domain) {
    case "workout":
      return "/training";
    case "goal":
      return "/profile#goals";
    case "nutrition":
      return "/nutrition";
    case "recipe":
      return "/nutrition";
    case "profile":
      return "/profile";
    case "today":
    case "general":
      return null;
  }
}

export function getProposalDomainPillClass(domain: ProposalTargetDomain): string {
  switch (domain) {
    case "workout":
      return "proposal-domain-pill--workout";
    case "goal":
      return "proposal-domain-pill--goal";
    case "nutrition":
      return "proposal-domain-pill--nutrition";
    case "recipe":
      return "proposal-domain-pill--recipe";
    case "profile":
      return "proposal-domain-pill--profile";
    case "today":
    case "general":
      return "proposal-domain-pill--general";
  }
}

export function getProposalStatusLabel(
  status: AiProposal["status"],
): string {
  switch (status) {
    case "pending":
      return "Pending review";
    case "accepted":
      return "Accepted";
    case "rejected":
      return "Declined";
    case "superseded":
      return "Superseded";
  }
}

export function getProposalStatusBadgeTone(
  status: AiProposal["status"],
): "pending" | "success" | "error" | "neutral" {
  switch (status) {
    case "pending":
      return "pending";
    case "accepted":
      return "success";
    case "rejected":
      return "error";
    case "superseded":
      return "neutral";
  }
}

export function mergeProposalsById(
  server: readonly AiProposal[],
  local: readonly AiProposal[],
): AiProposal[] {
  const byId = new Map<string, AiProposal>();

  for (const proposal of server) {
    byId.set(proposal.id, proposal);
  }

  for (const proposal of local) {
    byId.set(proposal.id, proposal);
  }

  return [...byId.values()];
}

export function canDecideProposal(
  proposal: Pick<AiProposal, "status" | "validationStatus">,
): boolean {
  return proposal.status === "pending";
}

export function canAcceptProposal(
  proposal: Pick<AiProposal, "status" | "validationStatus">,
): boolean {
  return proposal.status === "pending" && proposal.validationStatus === "valid";
}

export function getAcceptDisabledReason(
  proposal: Pick<AiProposal, "status" | "validationStatus" | "validationErrors">,
): string | null {
  if (proposal.status !== "pending" || canAcceptProposal(proposal)) {
    return null;
  }

  if (proposal.validationErrors.length > 0) {
    return "This proposal has validation issues and cannot be accepted. You can still reject it.";
  }

  if (proposal.validationStatus === "invalid") {
    return "This proposal did not pass validation and cannot be accepted. You can still reject it.";
  }

  return "Accept is unavailable for this proposal. You can still reject it.";
}
