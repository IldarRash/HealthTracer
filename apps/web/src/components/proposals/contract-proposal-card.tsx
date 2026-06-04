"use client";

import type { AiProposal, DisplayContract, ProposalModifyResponse } from "@health/types";
import Link from "next/link";
import { useState } from "react";
import {
  buildContractAcceptOverride,
} from "../../lib/display-contract-ui-state";
import {
  getProposalDomainLabel,
  getProposalNavigationRoute,
} from "../../lib/proposal-ui-state";
import { useInlineProposalActions } from "../../lib/use-inline-proposal-actions";
import { EditableProposalContract } from "./editable-proposal-contract";
import { ProposalCardShell } from "./proposal-card-shell";

type ContractProposalCardProps = {
  proposal: AiProposal;
  contract: DisplayContract;
  onDecision?: (proposal: AiProposal) => void;
  onModifyRequest?: (response: ProposalModifyResponse) => void;
};

/**
 * Renders any proposal that carries a displayContract in its proposedChanges.
 *
 * The contract's editable fields are rendered via EditableProposalContract;
 * the live-recomputed derived total updates as the user drags sliders.
 * On accept the edited field values are submitted as a proposedChanges
 * override — the backend recomputes the trusted total from the stored rate.
 */
export function ContractProposalCard({
  proposal,
  contract,
  onDecision,
  onModifyRequest,
}: ContractProposalCardProps) {
  // Seed fieldValues from the contract's stored field values
  const [fieldValues, setFieldValues] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const field of contract.fields) {
      if ((field.kind === "number" || field.kind === "slider" || field.kind === "readonly") && field.value !== undefined) {
        initial[field.key] = field.value;
      }
    }
    return initial;
  });

  const hookValues = useInlineProposalActions({
    proposal,
    onDecision,
    onModifyRequest,
    getAcceptPayload: () => buildContractAcceptOverride(proposal.proposedChanges, fieldValues),
  });
  const { isActionPending } = hookValues;

  const isPending = proposal.status === "pending";
  const domainRoute = getProposalNavigationRoute(proposal);
  const domainLabel = getProposalDomainLabel(proposal.targetDomain);

  const acceptedSuccessNode = (
    <>
      Activity logged.
      {domainRoute ? (
        <>
          {" "}
          <Link href={domainRoute} className="confirmation-card__link">
            View {domainLabel.toLowerCase()} →
          </Link>
        </>
      ) : null}
    </>
  );

  return (
    <ProposalCardShell
      {...hookValues}
      proposal={proposal}
      acceptLabel="Apply"
      modifyFormLabel="What would you like to change about this suggestion?"
      modifyFormPlaceholder="For example: I was playing for 45 minutes, not 90."
      acceptedSuccessNode={acceptedSuccessNode}
    >
      {isPending ? (
        <EditableProposalContract
          contract={contract}
          fieldValues={fieldValues}
          disabled={isActionPending}
          onFieldValuesChange={setFieldValues}
        />
      ) : null}
    </ProposalCardShell>
  );
}
