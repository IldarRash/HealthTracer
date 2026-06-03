import {
  buildProposalExplainerTurnContext,
  type ProposalExplainerTurnContext,
} from "@health/types";
import { Injectable } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { AiBehaviorConfigService } from "../ai/ai-behavior-config.service.js";
import { ProposalExplainerMatcherService } from "../ai/proposal-explainer-matcher.service.js";
import { UsersService } from "../users/users.service.js";
import { ChatRepository } from "./chat.repository.js";

export type ProposalExplainerPreAiResult =
  | { kind: "not_explainer" }
  | { kind: "no_proposal"; reply: string }
  | { kind: "with_proposal"; context: ProposalExplainerTurnContext };

@Injectable()
export class ProposalExplainerService {
  constructor(
    private readonly chatRepository: ChatRepository,
    private readonly usersService: UsersService,
    private readonly aiBehaviorConfigService: AiBehaviorConfigService,
    private readonly proposalExplainerMatcherService: ProposalExplainerMatcherService,
  ) {}

  isExplainerTurn(input: {
    userMessage: string;
    hasAttachments: boolean;
    hasProposalRevision: boolean;
  }): boolean {
    return this.proposalExplainerMatcherService.detect(input.userMessage, {
      hasAttachments: input.hasAttachments,
      hasProposalRevision: input.hasProposalRevision,
    });
  }

  async resolvePreAiTurn(input: {
    auth: ClerkAuthContext;
    threadId: string;
    userMessage: string;
    hasAttachments: boolean;
    hasProposalRevision: boolean;
  }): Promise<ProposalExplainerPreAiResult> {
    if (
      !this.isExplainerTurn({
        userMessage: input.userMessage,
        hasAttachments: input.hasAttachments,
        hasProposalRevision: input.hasProposalRevision,
      })
    ) {
      return { kind: "not_explainer" };
    }

    const user = await this.usersService.resolveFromAuth(input.auth);
    const latestProposal = await this.chatRepository.findLatestProposalForThread(
      user.id,
      input.threadId,
    );

    if (!latestProposal) {
      return {
        kind: "no_proposal",
        reply: this.aiBehaviorConfigService.getProposalExplainer().noProposalReply,
      };
    }

    return {
      kind: "with_proposal",
      context: buildProposalExplainerTurnContext({
        proposalId: latestProposal.id,
        intent: latestProposal.intent,
        targetDomain: latestProposal.targetDomain,
        title: latestProposal.title,
        reason: latestProposal.reason,
        status: latestProposal.status,
        evidenceRefs: latestProposal.evidenceRefs ?? undefined,
        createdAt: latestProposal.createdAt.toISOString(),
      }),
    };
  }
}
