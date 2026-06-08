import { validateProposalSafety } from "@health/ai";
import type {
  AiProposal,
  CalorieRecomputeFields,
  CorrelationEvidenceRef,
  ProposalDecisionInput,
  ProposalModifyResponse,
  WorkoutPlanProposalChanges,
} from "@health/types";
import {
  adaptWorkoutPlanFromProgressChangesSchema,
  extractEditableFieldValues,
  logWorkoutActivityProposalPayloadSchema,
  recomputeCaloriesFromDisplayContract,
  recomputeWorkoutProposalCaloriesFromDisplayContract,
  workoutPlanProposalChangesSchema,
} from "@health/types";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { UsersService } from "../users/users.service.js";
import { ProposalApplyService } from "./proposal-apply.service.js";
import { ProposalValidationService } from "./proposal-validation.service.js";
import { toAiProposal } from "./proposal.mapper.js";
import { ProposalsRepository } from "./proposals.repository.js";

@Injectable()
export class ProposalsService {
  constructor(
    private readonly proposalsRepository: ProposalsRepository,
    private readonly usersService: UsersService,
    private readonly proposalValidationService: ProposalValidationService,
    private readonly proposalApplyService: ProposalApplyService,
  ) {}

  async listProposals(
    auth: ClerkAuthContext,
    threadId?: string,
  ): Promise<AiProposal[]> {
    const user = await this.usersService.resolveFromAuth(auth);
    const proposals = await this.proposalsRepository.listByUserId(user.id, threadId);

    return proposals.map(toAiProposal);
  }

  async getProposal(auth: ClerkAuthContext, proposalId: string): Promise<AiProposal> {
    const user = await this.usersService.resolveFromAuth(auth);
    const proposal = await this.proposalsRepository.findById(user.id, proposalId);

    if (!proposal) {
      throw new NotFoundException("Proposal not found.");
    }

    return toAiProposal(proposal);
  }

  async decideProposal(
    auth: ClerkAuthContext,
    proposalId: string,
    input: ProposalDecisionInput,
  ): Promise<AiProposal> {
    if (input.decision === "modify") {
      throw new BadRequestException(
        "Modify decisions must use the proposal modification flow.",
      );
    }
    const user = await this.usersService.resolveFromAuth(auth);
    const proposal = await this.proposalsRepository.findById(user.id, proposalId);

    if (!proposal) {
      throw new NotFoundException("Proposal not found.");
    }

    if (input.decision === "reject") {
      if (proposal.status !== "pending") {
        throw new BadRequestException("Only pending proposals can be decided.");
      }

      const rejected = await this.proposalsRepository.claimPendingForReject(
        proposalId,
        user.id,
        proposal.validationStatus === "invalid" ? "invalid" : "valid",
        proposal.validationErrors,
      );

      if (!rejected) {
        throw new BadRequestException("Only pending proposals can be decided.");
      }

      return toAiProposal(rejected);
    }

    if (proposal.status === "accepted") {
      if (proposal.appliedReference) {
        return toAiProposal(proposal);
      }

      throw new NotFoundException(
        "Proposal acceptance is incomplete and cannot be retried safely.",
      );
    }

    if (proposal.status !== "pending") {
      throw new BadRequestException("Only pending proposals can be decided.");
    }

    let effectiveProposedChanges =
      input.proposedChanges !== undefined ? input.proposedChanges : proposal.proposedChanges;

    // -----------------------------------------------------------------------
    // Display-contract recompute + clamp (safety-critical, must not be bypassed)
    //
    // For all workout-plan intents that may carry a displayContract, recompute
    // estimatedSessionCalorieBurn using:
    //   - the STORED proposal's displayContract STRUCTURE (never the client's)
    //   - the STORED proposal's caloriePerHourRate (never the client's)
    //   - the client-submitted EDITABLE field values (extracted from the
    //     effective contract fields; each clamped to the stored field's min/max)
    //
    // The client total is always discarded.  The contract structure and rate are
    // always from the stored proposal (workout LLM source).
    //
    // Branching mirrors the action-resolver pattern:
    //   - create_workout_plan / adapt_workout_plan  → flat WorkoutPlanProposalChanges
    //   - adapt_workout_plan_from_progress          → nested .plan carries the contract
    // -----------------------------------------------------------------------
    if (effectiveProposedChanges != null) {
      if (
        proposal.intent === "create_workout_plan" ||
        proposal.intent === "adapt_workout_plan"
      ) {
        const parsedEffective = workoutPlanProposalChangesSchema.safeParse(effectiveProposedChanges);
        const parsedStored = workoutPlanProposalChangesSchema.safeParse(proposal.proposedChanges);

        if (parsedEffective.success && parsedStored.success) {
          let changes = parsedEffective.data;
          let recomputedTotal: number | null = null;

          if (parsedStored.data.displayContract) {
            // Extract client-submitted editable field values from the EFFECTIVE contract.
            // Use the stored contract as the structure — the client can only provide values.
            const clientFieldValues = parsedEffective.data.displayContract
              ? extractEditableFieldValues(parsedEffective.data.displayContract)
              : {};
            const recomputeResult = recomputeWorkoutProposalCaloriesFromDisplayContract(
              changes,
              parsedStored.data,
              clientFieldValues,
            );
            changes = recomputeResult.changes;
            recomputedTotal = recomputeResult.recomputedTotal;
          }

          // Always pin trusted calorie fields from the STORED proposal.
          // `recomputedTotal !== null` means the recompute actually produced a fresh
          // trusted value — only then should estimatedSessionCalorieBurn be the
          // recomputed number.  When recomputedTotal is null (no stored contract, no
          // isPrimaryTotal derived, or no resolvable rate input) we treat it as a
          // no-op and hard-pin all three calorie fields from the stored proposal so a
          // client override cannot smuggle an inflated burn or fabricated provenance.
          changes = pinTrustedCalorieFields(
            changes as Record<string, unknown>,
            parsedStored.data as Record<string, unknown>,
            recomputedTotal !== null,
            PLAN_CALORIE_FIELDS,
          ) as WorkoutPlanProposalChanges;
          effectiveProposedChanges = changes as unknown as Record<string, unknown>;
        }
      } else if (proposal.intent === "adapt_workout_plan_from_progress") {
        const parsedEffective = adaptWorkoutPlanFromProgressChangesSchema.safeParse(effectiveProposedChanges);
        const parsedStored = adaptWorkoutPlanFromProgressChangesSchema.safeParse(proposal.proposedChanges);

        if (parsedEffective.success && parsedStored.success) {
          let planChanges = parsedEffective.data.plan;
          let planRecomputedTotal: number | null = null;

          if (parsedStored.data.plan.displayContract) {
            // Extract client-submitted editable field values from the EFFECTIVE nested plan.
            const clientFieldValues = planChanges.displayContract
              ? extractEditableFieldValues(planChanges.displayContract)
              : {};
            const recomputeResult = recomputeWorkoutProposalCaloriesFromDisplayContract(
              planChanges,
              parsedStored.data.plan,
              clientFieldValues,
            );
            planChanges = recomputeResult.changes;
            planRecomputedTotal = recomputeResult.recomputedTotal;
          }

          // Always pin trusted calorie fields from the STORED proposal.
          // Use recomputedTotal !== null (not hadDisplayContract) so a stored
          // displayContract without isPrimaryTotal does NOT exempt client-submitted
          // calorie fields from hard-pinning.
          planChanges = pinTrustedCalorieFields(
            planChanges as Record<string, unknown>,
            parsedStored.data.plan as Record<string, unknown>,
            planRecomputedTotal !== null,
            PLAN_CALORIE_FIELDS,
          ) as WorkoutPlanProposalChanges;
          effectiveProposedChanges = {
            ...parsedEffective.data,
            plan: planChanges,
          } as unknown as Record<string, unknown>;
        }
      } else if (proposal.intent === "log_workout_activity") {
        const parsedEffective = logWorkoutActivityProposalPayloadSchema.safeParse(effectiveProposedChanges);
        const parsedStored = logWorkoutActivityProposalPayloadSchema.safeParse(proposal.proposedChanges);

        if (parsedEffective.success && parsedStored.success) {
          // Accept-time recompute for log_workout_activity editable card.
          //
          // recomputeCaloriesFromDisplayContract handles both the with-contract and
          // no-contract paths:
          //   - with-contract: uses STORED ratePerHour + displayContract structure,
          //     overlays clamped client editable values, produces a fresh recomputedTotal.
          //   - no-contract (or no isPrimaryTotal): returns recomputedTotal = null.
          //
          // C1 FIX: pin decision is `recomputedTotal !== null`, NOT `hadDisplayContract`.
          // This closes the gap where a stored contract without isPrimaryTotal (or an
          // unresolvable rate input) could skip the pin and let a client value through.
          const clientFieldValues = parsedEffective.data.displayContract
            ? extractEditableFieldValues(parsedEffective.data.displayContract)
            : {};
          const recomputeResult = recomputeCaloriesFromDisplayContract(
            parsedEffective.data as Record<string, unknown>,
            parsedStored.data as Record<string, unknown>,
            clientFieldValues,
            LOG_CALORIE_FIELDS,
          );
          const pinned = pinTrustedCalorieFields(
            recomputeResult.payload,
            parsedStored.data as Record<string, unknown>,
            recomputeResult.recomputedTotal !== null,
            LOG_CALORIE_FIELDS,
          );
          effectiveProposedChanges = pinned as unknown as Record<string, unknown>;
        }
      }
    }

    const safetyErrors = validateProposalSafety({
      intent: proposal.intent,
      targetDomain: proposal.targetDomain,
      title: proposal.title,
      reason: proposal.reason,
      proposedChanges: effectiveProposedChanges,
    });
    const validation = this.proposalValidationService.validateStoredProposal(
      proposal.intent,
      effectiveProposedChanges,
    );
    const provenanceErrors =
      await this.proposalValidationService.validateProvenanceOwnership(
        user.id,
        proposal.intent,
        effectiveProposedChanges,
      );
    const progressLinkedProvenanceErrors =
      this.proposalValidationService.validateProgressLinkedProvenanceRequired(
        proposal.intent,
        effectiveProposedChanges,
      );
    const exerciseReferenceErrors =
      await this.proposalValidationService.validateExerciseReferences(
        user.id,
        proposal.intent,
        effectiveProposedChanges,
      );
    const habitProposalContextErrors =
      await this.proposalValidationService.validateHabitProposalContext(
        user.id,
        proposal.intent,
        effectiveProposedChanges,
      );
    const goalHierarchyErrors =
      await this.proposalValidationService.validateGoalProposalHierarchy(
        user.id,
        proposal.intent,
        effectiveProposedChanges,
      );
    const todaySourceRefErrors =
      await this.proposalValidationService.validateTodayChecklistGoalSourceRefs(
        user.id,
        proposal.intent,
        effectiveProposedChanges,
      );
    const recoveryAdaptationErrors =
      await this.proposalValidationService.validateRecoveryAwareWorkoutAdaptation(
        user.id,
        proposal.intent,
        effectiveProposedChanges,
      );
    const wellbeingProposalContextErrors =
      await this.proposalValidationService.validateWellbeingCheckinProposalContext(
        user.id,
        proposal.intent,
        effectiveProposedChanges,
        { appliedReference: proposal.appliedReference },
      );
    const nutritionIncidentImageRefErrors =
      await this.proposalValidationService.validateNutritionIncidentImageRefOwnership(
        user.id,
        proposal.intent,
        effectiveProposedChanges,
      );
    const nutritionIncidentRecipeRecommendationErrors =
      await this.proposalValidationService.validateNutritionIncidentRecipeRecommendationContext(
        user.id,
        proposal.intent,
        effectiveProposedChanges,
      );
    const chatAttachmentProposalRefErrors =
      await this.proposalValidationService.validateChatAttachmentProposalRefs(
        user.id,
        proposal.intent,
        effectiveProposedChanges,
      );
    const adjustNutritionProteinFloorErrors =
      await this.proposalValidationService.validateAdjustNutritionProteinFloor(
        user.id,
        proposal.intent,
        effectiveProposedChanges,
      );
    const storedEvidenceRefs = proposal.evidenceRefs as CorrelationEvidenceRef[] | null;
    const evidenceRefErrors = this.proposalValidationService.validateCorrelationEvidenceRefs(
      storedEvidenceRefs ?? undefined,
    );
    const evidenceOwnershipErrors =
      await this.proposalValidationService.validateCorrelationEvidenceOwnership(
        user.id,
        storedEvidenceRefs ?? undefined,
      );
    const validationErrors = [
      ...safetyErrors,
      ...validation.errors,
      ...provenanceErrors,
      ...progressLinkedProvenanceErrors,
      ...exerciseReferenceErrors,
      ...habitProposalContextErrors,
      ...goalHierarchyErrors,
      ...todaySourceRefErrors,
      ...recoveryAdaptationErrors,
      ...wellbeingProposalContextErrors,
      ...nutritionIncidentImageRefErrors,
      ...nutritionIncidentRecipeRecommendationErrors,
      ...chatAttachmentProposalRefErrors,
      ...adjustNutritionProteinFloorErrors,
      ...evidenceRefErrors,
      ...evidenceOwnershipErrors,
    ];

    if (validationErrors.length > 0) {
      await this.proposalsRepository.markValidation(proposalId, "invalid", validationErrors);

      throw new BadRequestException({
        message: "Proposal failed validation and cannot be applied.",
        validationErrors,
      });
    }

    const acceptedProposal = await this.proposalsRepository.acceptPendingProposal(
      proposalId,
      user.id,
      (lockedProposal, tx) =>
        this.proposalApplyService.applyAcceptedProposal(auth, user.id, lockedProposal, tx),
      input.proposedChanges !== undefined
        ? {
            proposedChangesOverride: effectiveProposedChanges as Record<string, unknown>,
          }
        : undefined,
    );

    if (!acceptedProposal) {
      const currentProposal = await this.proposalsRepository.findById(user.id, proposalId);

      if (currentProposal?.status === "accepted" && currentProposal.appliedReference) {
        return toAiProposal(currentProposal);
      }

      throw new BadRequestException("Only pending proposals can be decided.");
    }

    return toAiProposal(acceptedProposal);
  }

  /**
   * Marks a pending proposal as superseded and returns revision context for a follow-up chat turn.
   * Does not apply structured state changes.
   */
  async requestProposalModification(
    auth: ClerkAuthContext,
    proposalId: string,
    modificationFeedback: string,
  ): Promise<ProposalModifyResponse> {
    const user = await this.usersService.resolveFromAuth(auth);
    const proposal = await this.proposalsRepository.findById(user.id, proposalId);

    if (!proposal) {
      throw new NotFoundException("Proposal not found.");
    }

    if (proposal.status !== "pending") {
      throw new BadRequestException("Only pending proposals can be modified.");
    }

    const superseded = await this.proposalsRepository.supersedePendingForModify(
      proposalId,
      user.id,
    );

    if (!superseded) {
      throw new BadRequestException("Only pending proposals can be modified.");
    }

    const trimmedFeedback = modificationFeedback.trim();
    const mappedProposal = toAiProposal(superseded);

    return {
      proposal: mappedProposal,
      revisionContext: {
        supersededProposalId: mappedProposal.id,
        originalIntent: mappedProposal.intent,
        originalTitle: mappedProposal.title,
        originalReason: mappedProposal.reason,
        modificationFeedback: trimmedFeedback,
        nextAction: "send_chat_message",
        suggestedUserMessage: buildProposalModificationUserMessage(
          mappedProposal.title,
          trimmedFeedback,
        ),
      },
    };
  }
}

function buildProposalModificationUserMessage(title: string, modificationFeedback: string): string {
  return `Please revise the proposal "${title}" with these changes: ${modificationFeedback}`;
}

// ---------------------------------------------------------------------------
// Calorie field descriptors for the generalized pin helper
// ---------------------------------------------------------------------------

/** Descriptor for workout-plan intents (flat and nested .plan). */
const PLAN_CALORIE_FIELDS: CalorieRecomputeFields = {
  rateField: "caloriePerHourRate",
  totalField: "estimatedSessionCalorieBurn",
  provenanceField: "calorieEstimateProvenance",
};

/** Descriptor for the log_workout_activity intent. */
const LOG_CALORIE_FIELDS: CalorieRecomputeFields = {
  rateField: "ratePerHour",
  totalField: "estimatedCalories",
};

// ---------------------------------------------------------------------------
// Generalized trusted-field pinning helper (replaces the two intent-specific ones)
//
// Hard-overwrites security-sensitive calorie fields on the effective payload
// with values from the STORED proposal, so neither a client override nor a
// no-contract path can smuggle an inflated rate or fabricated provenance.
//
// Called AFTER any displayContract recompute.  The ONLY thing a client override
// may legitimately change is the editable display-contract field VALUES (e.g. a
// duration slider).
// ---------------------------------------------------------------------------

/**
 * Pin trusted calorie fields on any accept payload.
 *
 * ALWAYS hard-overwrites `target[fields.rateField]` from stored — the client
 * can never inflate the trusted burn rate.
 *
 * When `freshTotalProduced` is false (recompute was a no-op):
 *   Also pins `target[fields.totalField]` and (when present) `target[fields.provenanceField]`
 *   from stored, closing the bypass where a client submits fabricated calorie totals
 *   or provenance on a no-contract accept.
 *
 * When `freshTotalProduced` is true (recompute produced a fresh total):
 *   Preserves the freshly recomputed total in `target`.  Only the rate field is
 *   re-pinned here as a belt-and-suspenders measure.
 *
 * @param target           Effective payload (possibly post-recompute), as a plain object.
 * @param stored           The STORED proposal's payload, as a plain object.
 * @param freshTotalProduced  Whether a fresh recomputed total was written into `target`.
 * @param fields           Descriptor identifying which keys carry rate / total / provenance.
 */
function pinTrustedCalorieFields(
  target: Record<string, unknown>,
  stored: Record<string, unknown>,
  freshTotalProduced: boolean,
  fields: CalorieRecomputeFields,
): Record<string, unknown> {
  const patched: Record<string, unknown> = { ...target };

  // Always pin the trusted rate.
  if (stored[fields.rateField] !== undefined) {
    patched[fields.rateField] = stored[fields.rateField];
  } else {
    delete patched[fields.rateField];
  }

  // When no fresh total was produced, also pin the total (and optional provenance).
  if (!freshTotalProduced) {
    if (stored[fields.totalField] !== undefined) {
      patched[fields.totalField] = stored[fields.totalField];

      if (fields.provenanceField !== undefined) {
        patched[fields.provenanceField] =
          stored[fields.provenanceField] ?? "workout_llm";
      }
    } else {
      delete patched[fields.totalField];

      if (fields.provenanceField !== undefined) {
        delete patched[fields.provenanceField];
      }
    }
  }

  return patched;
}
