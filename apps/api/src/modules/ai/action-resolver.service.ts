import type {
  AiStructuredOutput,
  CatalogProposalIntent,
  FinalDecisionOutput,
  WorkoutPlanProposalChanges,
  AdaptWorkoutPlanFromProgressChanges,
  LogWorkoutActivityProposalPayload,
} from "@health/types";
import {
  adaptWorkoutPlanFromProgressChangesSchema,
  filterProposalsToAllowedIntents,
  logWorkoutActivityProposalPayloadSchema,
  workoutPlanProposalChangesSchema,
} from "@health/types";
import { Injectable } from "@nestjs/common";
import { PLAIN_REPLY_ACTION_VARIANT_ID } from "./action-variant-catalog.service.js";
import type { DomainFanoutEntry } from "./system-planner.service.js";

export type ActionResolverFinalDecisionInput = {
  /**
   * The validated output from DecisionMakerExecutorService.
   */
  finalDecision: FinalDecisionOutput;
  /**
   * The selected domain fan-out entries whose union of allowedProposalIntents
   * forms the active capability allowlist. Proposals are filtered to the UNION
   * of all selected domains' allowedProposalIntents (built by
   * buildUnionAllowedIntents), not per-domain.
   */
  selectedDomains: readonly DomainFanoutEntry[];
  /**
   * Calorie-burn estimate (kcal, integer) from the workout domain LLM's
   * domain_answer.workoutCalorieEstimate.
   *
   * ONLY sourced from the workout domain answer by AgentOrchestratorService.
   * The decision-maker and all non-workout domain LLMs must NEVER set this.
   * When present, ActionResolver stamps it onto every workout-plan proposal
   * in the resolved output with provenance 'workout_llm'.
   * When absent (undefined), the calorie fields are left unset on proposals.
   */
  workoutCalorieEstimate?: number;
  /**
   * Trusted kcal/hour burn rate from the workout domain LLM's
   * domain_answer.workoutCaloriePerHourRate.
   *
   * ONLY sourced from the workout domain answer by AgentOrchestratorService.
   * The decision-maker and all non-workout domain LLMs must NEVER set this.
   * When present, ActionResolver stamps it onto every workout-plan proposal
   * as caloriePerHourRate. When absent, any caloriePerHourRate from the
   * decision-maker or non-workout domain is scrubbed.
   */
  workoutCaloriePerHourRate?: number;
};

export type ActionResolverFinalDecisionResult = {
  /**
   * The coach's reply to the user (from the decision-maker).
   */
  reply: string;
  /**
   * The final typed proposal set, filtered to the active capability allowlist.
   * Empty if the decision-maker selected "plain_reply" or produced no proposals.
   */
  proposals: AiStructuredOutput["proposals"];
  /**
   * Whether the decision required explicit user consent (e.g. medical document save).
   * When true, proposals will contain a consent-gated proposal and NO health_documents
   * row is auto-persisted. The proposal must be explicitly accepted by the user.
   *
   * NOTE: `consentRequired` is currently produced (forwarded from the LLM output) but not
   * consumed by any client or enforced by a gate in this service. It is surfaced in the
   * ChatTurnResponse for the deferred medical special-save flow (proposal-driven,
   * domain-LLM recognition → consent-gated proposal → accept → persist health_document).
   * Do not remove the plumbing; add enforcement when the deferred flow is implemented.
   */
  consentRequired: boolean;
};

/**
 * Proposal-only action boundary after coach final-answer coercion.
 * Does not validate proposal payloads, apply mutations, or persist state.
 */
@Injectable()
export class ActionResolverService {
  /**
   * Resolve a FinalDecisionOutput (from DecisionMakerExecutorService) into a
   * typed proposal set filtered to the active capability allowlist.
   *
   * Safety invariants (must not be weakened):
   *  - proposals are filtered to the UNION of the selected domains' allowedProposalIntents.
   *  - "plain_reply" produces no proposals.
   *  - estimatedSessionCalorieBurn is ONLY stamped from workoutCalorieEstimate, which
   *    must have been sourced exclusively from the workout domain LLM by the caller.
   *    The decision-maker LLM and non-workout domains must never set this.
   *  - This method never mutates domain state or persists anything.
   */
  resolveFinalDecisionOutput(
    input: ActionResolverFinalDecisionInput,
  ): ActionResolverFinalDecisionResult {
    const { finalDecision, selectedDomains, workoutCalorieEstimate, workoutCaloriePerHourRate } = input;

    // Build the union of all domains' allowedProposalIntents for filtering.
    // This is the same allowlist floor that ActionVariantCatalogService used to build
    // the catalog — the decision-maker cannot select outside this set.
    const unionAllowedIntents = buildUnionAllowedIntents(selectedDomains);

    const selectedAction = finalDecision.selectedAction;

    // Plain reply: no proposals, no consent required.
    if (!selectedAction || selectedAction === PLAIN_REPLY_ACTION_VARIANT_ID) {
      return {
        reply: finalDecision.reply,
        proposals: [],
        consentRequired: false,
      };
    }

    // Filter proposals to the union allowlist, then stamp
    // the workout calorie estimate onto any workout-plan proposals.
    // The decision-maker's proposals come from domain LLMs; re-filtering here is
    // a defense-in-depth measure — the allowlist is the code-level floor.
    const filteredProposals = filterProposalsToAllowedIntents(
      [...unionAllowedIntents] as CatalogProposalIntent[],
      finalDecision.proposals as AiStructuredOutput["proposals"],
    );

    // Always scrub then conditionally re-stamp, so fabricated calorie fields from
    // the decision-maker or non-workout domain LLMs are removed regardless of
    // whether a trusted estimate is present.
    const proposals = scrubAndStampWorkoutCalorieEstimate(
      filteredProposals,
      workoutCalorieEstimate,
      workoutCaloriePerHourRate,
    );

    return {
      reply: finalDecision.reply,
      proposals,
      consentRequired: finalDecision.consentRequired,
    };
  }

}

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

/**
 * Build the union of all selected domains' allowedProposalIntents for use as
 * the active allowlist when resolving a FinalDecisionOutput.
 * Duplicates are removed (Set deduplication). Ordering preserves the iteration
 * order of selectedDomains so the primary domain's intents come first.
 */
function buildUnionAllowedIntents(
  selectedDomains: readonly DomainFanoutEntry[],
): ReadonlySet<string> {
  const union = new Set<string>();

  for (const domain of selectedDomains) {
    for (const intent of domain.allowedProposalIntents) {
      union.add(intent);
    }
  }

  return union;
}

/** Workout-plan proposal intents that may carry a calorie estimate (plan-level). */
const WORKOUT_PLAN_PROPOSAL_INTENTS = new Set([
  "create_workout_plan",
  "adapt_workout_plan",
  "adapt_workout_plan_from_progress",
]);

/**
 * For all workout-plan and log_workout_activity proposals, ALWAYS scrub any existing
 * calorie fields from proposedChanges (to prevent decision-maker / non-workout-LLM
 * injection), then conditionally re-stamp from the trusted `estimate` and `ratePerHour`
 * when present.
 *
 * Source restriction (code-level floor — must never be weakened):
 * - `estimate` MUST come exclusively from the workout domain LLM's
 *   domain_answer.workoutCalorieEstimate, passed by AgentOrchestratorService.
 * - `ratePerHour` MUST come exclusively from the workout domain LLM's
 *   domain_answer.workoutCaloriePerHourRate, passed by AgentOrchestratorService.
 * - The decision-maker LLM and all non-workout domain LLMs must NEVER be the source.
 * - This function is pure and mutation-free; it returns new proposal objects.
 *
 * Branching:
 * - For `create_workout_plan` and `adapt_workout_plan`: proposedChanges is a flat
 *   WorkoutPlanProposalChanges. The calorie fields live at the top level.
 * - For `adapt_workout_plan_from_progress`: proposedChanges is an
 *   AdaptWorkoutPlanFromProgressChanges wrapper with a nested `.plan` key.
 *   The calorie fields live on `.plan`, NOT at the top level of the wrapper.
 *   A top-level stamp would be invisible to the apply path and any validation
 *   that reads `.plan`, so we always scrub/stamp the nested plan.
 * - For `log_workout_activity`: proposedChanges is a LogWorkoutActivityProposalPayload.
 *   The calorie fields are `ratePerHour` and `estimatedCalories` at the top level.
 *   Scrub both from the decision-maker output, then re-stamp from the trusted
 *   workoutCaloriePerHourRate → ratePerHour and workoutCalorieEstimate → estimatedCalories.
 *   If NEITHER trusted value is available, leave both fields unset — the payload's
 *   .refine() will then reject the proposal as invalid downstream (fail-closed).
 *
 * The calorie fields live in proposedChanges (or its nested `.plan`) so they are
 * carried into the plan revision when the proposal is accepted
 * (stripWorkoutPlanProposalExtras + workoutPlanPayloadSchema.parse preserve optional
 * payload fields before the revision is written).
 */
function scrubAndStampWorkoutCalorieEstimate(
  proposals: AiStructuredOutput["proposals"],
  estimate: number | undefined,
  ratePerHour: number | undefined,
): AiStructuredOutput["proposals"] {
  const result = proposals.map((proposal) => {
    if (proposal.intent === "log_workout_activity") {
      return scrubAndStampLogWorkoutActivityProposal(proposal, proposal.proposedChanges, estimate, ratePerHour);
    }

    if (!WORKOUT_PLAN_PROPOSAL_INTENTS.has(proposal.intent)) {
      return proposal;
    }

    const proposedChanges = proposal.proposedChanges;

    if (proposal.intent === "adapt_workout_plan_from_progress") {
      return scrubAndStampFromProgressProposal(proposal, proposedChanges, estimate, ratePerHour);
    }

    return scrubAndStampFlatWorkoutProposal(proposal, proposedChanges, estimate, ratePerHour);
  });

  // The mapped array contains updated proposals whose proposedChanges carry scrubbed/
  // stamped calorie fields for workout intents and are unchanged for others.
  // Cast back to the proposals union type — content is structurally equivalent.
  return result as AiStructuredOutput["proposals"];
}

/**
 * Scrub then optionally stamp calorie fields on a flat WorkoutPlanProposalChanges
 * (create_workout_plan / adapt_workout_plan).
 */
function scrubAndStampFlatWorkoutProposal(
  proposal: AiStructuredOutput["proposals"][number],
  proposedChanges: unknown,
  estimate: number | undefined,
  ratePerHour: number | undefined,
): AiStructuredOutput["proposals"][number] {
  const parsed = workoutPlanProposalChangesSchema.safeParse(proposedChanges);

  if (!parsed.success) {
    // Cannot validate shape — return the proposal unchanged. ProposalValidationService
    // will reject it downstream when validateStoredProposal runs.
    return proposal;
  }

  // Scrub calorie fields first (source-exclusive enforcement).
  const scrubbed: WorkoutPlanProposalChanges = {
    ...parsed.data,
    estimatedSessionCalorieBurn: undefined,
    calorieEstimateProvenance: undefined,
    caloriePerHourRate: undefined,
  };

  // Stamp estimate when present.
  const withEstimate: WorkoutPlanProposalChanges =
    estimate !== undefined
      ? { ...scrubbed, estimatedSessionCalorieBurn: estimate, calorieEstimateProvenance: "workout_llm" }
      : scrubbed;

  // Stamp trusted kcal/hour rate when present.
  const stamped: WorkoutPlanProposalChanges =
    ratePerHour !== undefined
      ? { ...withEstimate, caloriePerHourRate: ratePerHour }
      : withEstimate;

  // Cast is safe: we've verified the intent and the proposedChanges shape.
  // The proposals union's proposedChanges type varies per intent; we've already
  // validated and rebuilt it, so the structural cast is correct.
  return {
    intent: proposal.intent,
    targetDomain: proposal.targetDomain,
    title: proposal.title,
    reason: proposal.reason,
    proposedChanges: stamped,
    ...(proposal.evidenceRefs !== undefined ? { evidenceRefs: proposal.evidenceRefs } : {}),
  } as AiStructuredOutput["proposals"][number];
}

/**
 * Scrub then optionally stamp `ratePerHour` and `estimatedCalories` on a
 * LogWorkoutActivityProposalPayload (log_workout_activity).
 *
 * Source-exclusivity invariant: both fields MUST come from the workout domain LLM
 * (workoutCaloriePerHourRate → ratePerHour, workoutCalorieEstimate → estimatedCalories).
 * Any fabricated values from the decision-maker or non-workout domain LLMs are stripped.
 *
 * If NEITHER trusted value is available, both fields are left unset — the payload's
 * .refine() ("estimatedCalories or ratePerHour must be provided") will then reject
 * the proposal downstream: this is the correct fail-closed behavior.
 */
function scrubAndStampLogWorkoutActivityProposal(
  proposal: AiStructuredOutput["proposals"][number],
  proposedChanges: unknown,
  estimate: number | undefined,
  ratePerHour: number | undefined,
): AiStructuredOutput["proposals"][number] {
  // Parse without .refine() validation so we can scrub before re-validating;
  // use the base object schema shape via safeParse — shape errors fall through to
  // ProposalValidationService downstream (the fail-closed path).
  const parsed = logWorkoutActivityProposalPayloadSchema.safeParse(proposedChanges);

  if (!parsed.success) {
    // Cannot validate shape — return the proposal unchanged.
    // ProposalValidationService will reject it downstream.
    return proposal;
  }

  // Scrub both calorie fields unconditionally (source-exclusivity enforcement).
  const scrubbed: LogWorkoutActivityProposalPayload = {
    ...parsed.data,
    ratePerHour: undefined,
    estimatedCalories: undefined,
  };

  // Re-stamp from trusted workout domain LLM values when present.
  // ratePerHour (workoutCaloriePerHourRate) takes priority for the rate field.
  const withRate: LogWorkoutActivityProposalPayload =
    ratePerHour !== undefined
      ? { ...scrubbed, ratePerHour }
      : scrubbed;

  // estimatedCalories (workoutCalorieEstimate) stamps the advisory total.
  const stamped: LogWorkoutActivityProposalPayload =
    estimate !== undefined
      ? { ...withRate, estimatedCalories: estimate }
      : withRate;

  return {
    intent: proposal.intent,
    targetDomain: proposal.targetDomain,
    title: proposal.title,
    reason: proposal.reason,
    proposedChanges: stamped,
    ...(proposal.evidenceRefs !== undefined ? { evidenceRefs: proposal.evidenceRefs } : {}),
  } as AiStructuredOutput["proposals"][number];
}

/**
 * Scrub then optionally stamp calorie fields on an AdaptWorkoutPlanFromProgressChanges
 * wrapper (adapt_workout_plan_from_progress).
 *
 * The calorie fields live on `.plan` (a WorkoutPlanProposalChanges), NOT at the top
 * level of the wrapper. The apply path (proposal-apply.service.ts) reads `.plan` and
 * passes it to WorkoutsService.applyWorkoutPlanProposal, which calls
 * stripWorkoutPlanProposalExtras + workoutPlanPayloadSchema.parse — so the calorie
 * fields must be on `.plan` to survive into the new revision.
 */
function scrubAndStampFromProgressProposal(
  proposal: AiStructuredOutput["proposals"][number],
  proposedChanges: unknown,
  estimate: number | undefined,
  ratePerHour: number | undefined,
): AiStructuredOutput["proposals"][number] {
  const parsed = adaptWorkoutPlanFromProgressChangesSchema.safeParse(proposedChanges);

  if (!parsed.success) {
    // Cannot validate shape — return unchanged; downstream validation will reject it.
    return proposal;
  }

  const wrapper: AdaptWorkoutPlanFromProgressChanges = parsed.data;

  // Scrub calorie fields from the nested plan first.
  const scrubbedPlan: WorkoutPlanProposalChanges = {
    ...wrapper.plan,
    estimatedSessionCalorieBurn: undefined,
    calorieEstimateProvenance: undefined,
    caloriePerHourRate: undefined,
  };

  // Stamp estimate when present.
  const withEstimate: WorkoutPlanProposalChanges =
    estimate !== undefined
      ? { ...scrubbedPlan, estimatedSessionCalorieBurn: estimate, calorieEstimateProvenance: "workout_llm" }
      : scrubbedPlan;

  // Stamp trusted kcal/hour rate when present.
  const stampedPlan: WorkoutPlanProposalChanges =
    ratePerHour !== undefined
      ? { ...withEstimate, caloriePerHourRate: ratePerHour }
      : withEstimate;

  const stampedWrapper: AdaptWorkoutPlanFromProgressChanges = {
    ...wrapper,
    plan: stampedPlan,
  };

  // Cast is safe: we've verified the intent and the proposedChanges shape.
  return {
    intent: proposal.intent,
    targetDomain: proposal.targetDomain,
    title: proposal.title,
    reason: proposal.reason,
    proposedChanges: stampedWrapper,
    ...(proposal.evidenceRefs !== undefined ? { evidenceRefs: proposal.evidenceRefs } : {}),
  } as AiStructuredOutput["proposals"][number];
}
