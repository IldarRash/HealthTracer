import { validateProposalSafety } from "@health/ai";
import type { AiProposal, ProposalDecisionInput } from "@health/types";
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
    const validationErrors = [...safetyErrors, ...validation.errors];

    if (validationErrors.length > 0) {
      await this.proposalsRepository.markValidation(proposalId, "invalid", validationErrors);

      throw new BadRequestException({
        message: "Proposal failed validation and cannot be applied.",
        validationErrors,
      });
    }

    let acceptedProposal;

    acceptedProposal = await this.proposalsRepository.acceptPendingProposal(
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
}
