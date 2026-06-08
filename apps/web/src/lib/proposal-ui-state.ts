import type { AiProposal, ProposalIntent, ProposalTargetDomain } from "@health/types";
import { getProgressLinkedProposalIntentLabel } from "./weekly-review-ui-state";

export function isHabitPlanProposalIntent(
  intent: ProposalIntent,
): intent is "create_habit_plan" | "adapt_habit_plan" {
  return intent === "create_habit_plan" || intent === "adapt_habit_plan";
}

export function getProposalIntentLabel(
  intent: ProposalIntent,
  proposedChanges?: unknown,
): string | null {
  const progressLabel =
    proposedChanges !== undefined
      ? getProgressLinkedProposalIntentLabel(intent, proposedChanges)
      : null;

  if (progressLabel) {
    return progressLabel;
  }

  switch (intent) {
    case "adapt_workout_plan_from_progress":
      return "Progress-based workout adaptation";
    case "create_habit_plan":
      return "New daily habit plan";
    case "adapt_habit_plan":
      return "Habit plan adjustment";
    case "capture_wellbeing_checkin":
      return "Wellbeing check-in";
    case "log_nutrition_incident":
      return "Nutrition incident log";
    case "log_workout_activity":
      return "Log activity";
    case "recommend_recipes":
      return "Recipe recommendations";
    case "save_body_analysis":
      return "Анализ тела";
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
    case "body":
      return "Body";
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
      return "/today";
    case "general":
      return null;
    case "body":
      return "/profile";
  }
}

export function getProposalIntentRoute(intent: ProposalIntent): string | null {
  if (isHabitPlanProposalIntent(intent)) {
    return "/today";
  }

  if (intent === "capture_wellbeing_checkin") {
    return "/today";
  }

  if (intent === "log_nutrition_incident") {
    return "/nutrition";
  }

  return null;
}

export function getProposalNavigationRoute(
  proposal: Pick<AiProposal, "intent" | "targetDomain">,
): string | null {
  return getProposalIntentRoute(proposal.intent) ?? getProposalDomainRoute(proposal.targetDomain);
}

export function getHabitProposalAppliedMessage(intent: ProposalIntent): string {
  switch (intent) {
    case "create_habit_plan":
      return "Daily habit plan saved. Scheduled habits will appear on Today.";
    case "adapt_habit_plan":
      return "Habit plan updated. Today will reflect your revised habits while keeping your history.";
    default:
      return "Change recorded in your coaching history.";
  }
}

export function formatHabitProposalValidationError(error: string): string {
  if (/create_habit_plan requires no active habit plan/i.test(error)) {
    return "You already have an active habit plan. Ask the coach to adjust your current plan instead of proposing a new one.";
  }

  if (/adapt_habit_plan requires an active habit plan; use create_habit_plan/i.test(error)) {
    return "There is no habit plan to adjust yet. Ask the coach to propose a new daily habit plan first.";
  }

  if (/adapt_habit_plan requires an active habit plan revision/i.test(error)) {
    return "Your habit plan could not be read for this adjustment. Try refreshing or ask the coach to try again.";
  }

  if (/requires a readable active habit plan revision/i.test(error)) {
    return "Your current habit plan could not be loaded for this adjustment.";
  }

  const continuityMatch = error.match(
    /adaptation must include habitDefinitionId "[^"]+" \("([^"]+)"\)/i,
  );
  if (continuityMatch) {
    return `"${continuityMatch[1]}" must stay in the adjustment or be explicitly removed so your completion history stays connected.`;
  }

  if (/adaptation must include habitDefinitionId/i.test(error)) {
    return "This adjustment would break continuity with an existing habit. Keep the same habit identity or mark removed habits explicitly.";
  }

  return error
    .replace(/^proposedChanges:\s*/i, "")
    .replace(/^habits:\s*/i, "")
    .trim();
}

export function formatHabitProposalValidationErrors(errors: readonly string[]): string[] {
  return errors.map(formatHabitProposalValidationError);
}

export function formatProposalValidationErrors(
  proposal: Pick<AiProposal, "intent" | "validationErrors">,
): string[] {
  if (isHabitPlanProposalIntent(proposal.intent)) {
    return formatHabitProposalValidationErrors(proposal.validationErrors);
  }

  return [...proposal.validationErrors];
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
    case "body":
      return "proposal-domain-pill--body";
  }
}

export const INLINE_PROPOSAL_VALIDATION_HEADING = "Needs attention";

export function shouldShowInlineProposalIntentLabel(
  intent: ProposalIntent,
  proposedChanges?: unknown,
): boolean {
  return getProposalIntentLabel(intent, proposedChanges) != null;
}

export function getProposalStatusLabel(
  status: AiProposal["status"],
): string {
  switch (status) {
    case "pending":
      return "Pending review";
    case "accepted":
      return "Applied";
    case "rejected":
      return "Rejected";
    case "superseded":
      return "Revised";
  }
}

export function getProposalRejectedMessage(
  proposal: Pick<AiProposal, "targetDomain" | "intent">,
): string {
  const domainLabel = getProposalDomainLabel(proposal.targetDomain).toLowerCase();

  if (isHabitPlanProposalIntent(proposal.intent)) {
    return "No changes were made. Your current habit plan stays as is.";
  }

  if (proposal.intent === "capture_wellbeing_checkin") {
    return "No changes were made. Today's wellbeing check-in was not saved.";
  }

  if (proposal.intent === "log_nutrition_incident") {
    return "No changes were made. This nutrition incident was not logged.";
  }

  if (proposal.intent === "recommend_recipes") {
    return "No changes were made. Recipe recommendations were not saved.";
  }

  if (proposal.intent === "save_body_analysis") {
    return "Analysis not saved. No data was added to your profile.";
  }

  if (proposal.targetDomain === "workout" || proposal.targetDomain === "nutrition") {
    return `No changes were made. Your ${domainLabel} plan stays as is.`;
  }

  if (proposal.targetDomain === "today") {
    return "No changes were made. Today's checklist stays as is.";
  }

  return "No changes were made. Your plan stays as is.";
}

export function getProposalSupersededMessage(): string {
  return "You asked to revise this suggestion. Look for the updated proposal in the chat.";
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
  proposal: Pick<AiProposal, "status" | "validationStatus" | "validationErrors" | "intent">,
): string | null {
  if (proposal.status !== "pending" || canAcceptProposal(proposal)) {
    return null;
  }

  if (proposal.validationErrors.length > 0) {
    if (isHabitPlanProposalIntent(proposal.intent)) {
      return "This habit proposal has validation issues and cannot be applied. Review the details below or use Modify to ask for a revision. You can still reject it.";
    }

    return "This proposal has validation issues and cannot be applied. You can still reject it or use Modify to ask for a revision.";
  }

  if (proposal.validationStatus === "invalid") {
    return "This proposal did not pass validation and cannot be applied. You can still reject it or use Modify to ask for a revision.";
  }

  return "Apply is unavailable for this proposal. You can still reject it or use Modify to ask for a revision.";
}
