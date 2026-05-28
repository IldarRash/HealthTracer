import type {
  AiStructuredOutput,
  CatalogIntentId,
  CatalogProposalIntent,
} from "@health/types";
import { filterProposalsToAllowedIntents } from "@health/types";
import { Injectable } from "@nestjs/common";

/** Reserved for future coach payloads; Phase 2 never executes these. */
export type CoachDirectActionAttempt = {
  type: string;
  payload?: unknown;
};

export type ActionResolverResolveInput = {
  output: AiStructuredOutput;
  catalogIntentId: CatalogIntentId;
  allowedProposalIntents: readonly CatalogProposalIntent[];
  directActions?: readonly CoachDirectActionAttempt[];
};

/**
 * Proposal-only action boundary after coach final-answer coercion.
 * Does not validate proposal payloads, apply mutations, or persist state.
 */
@Injectable()
export class ActionResolverService {
  resolveProposalOnlyOutput(input: ActionResolverResolveInput): AiStructuredOutput {
    // Phase 2: direct mutation actions are deferred; any supplied directActions are ignored.
    void input.directActions;

    return {
      reply: input.output.reply,
      proposals: filterProposalsToAllowedIntents(
        input.allowedProposalIntents,
        input.output.proposals,
      ),
    };
  }
}
