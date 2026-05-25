import { validateProposalSafety } from "@health/ai";
import type {
  AiProposal,
  CorrelationEvidenceRef,
  ProposalDecisionInput,
  ProposalModifyResponse,
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

    const safetyErrors = validateProposalSafety({
      intent: proposal.intent,
      targetDomain: proposal.targetDomain,
      title: proposal.title,
      reason: proposal.reason,
      proposedChanges: proposal.proposedChanges,
    });
    const validation = this.proposalValidationService.validateStoredProposal(
      proposal.intent,
      proposal.proposedChanges,
    );
    const provenanceErrors =
      await this.proposalValidationService.validateProvenanceOwnership(
        user.id,
        proposal.intent,
        proposal.proposedChanges,
      );
    const progressLinkedProvenanceErrors =
      this.proposalValidationService.validateProgressLinkedProvenanceRequired(
        proposal.intent,
        proposal.proposedChanges,
      );
    const exerciseReferenceErrors =
      await this.proposalValidationService.validateExerciseReferences(
        user.id,
        proposal.intent,
        proposal.proposedChanges,
      );
    const habitProposalContextErrors =
      await this.proposalValidationService.validateHabitProposalContext(
        user.id,
        proposal.intent,
        proposal.proposedChanges,
      );
    const goalHierarchyErrors =
      await this.proposalValidationService.validateGoalProposalHierarchy(
        user.id,
        proposal.intent,
        proposal.proposedChanges,
      );
    const todaySourceRefErrors =
      await this.proposalValidationService.validateTodayChecklistGoalSourceRefs(
        user.id,
        proposal.intent,
        proposal.proposedChanges,
      );
    const recoveryAdaptationErrors =
      await this.proposalValidationService.validateRecoveryAwareWorkoutAdaptation(
        user.id,
        proposal.intent,
        proposal.proposedChanges,
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
      (lockedProposal) =>
        this.proposalApplyService.applyAcceptedProposal(auth, user.id, lockedProposal),
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
