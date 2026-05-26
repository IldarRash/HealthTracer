"use client";

import { useAuth } from "@clerk/nextjs";
import type { AiProposal, ProposalModifyResponse } from "@health/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  decideProposal,
  modifyProposal,
  apiQueryKeys,
  getProposalDecisionRefreshQueryKeys,
} from "./api";

type UseInlineProposalActionsOptions = {
  proposal: AiProposal;
  onDecision?: (proposal: AiProposal) => void;
  onModifyRequest?: (response: ProposalModifyResponse) => void;
  getAcceptPayload?: () => unknown | null;
};

export function useInlineProposalActions({
  proposal,
  onDecision,
  onModifyRequest,
  getAcceptPayload,
}: UseInlineProposalActionsOptions) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [isModifyMode, setIsModifyMode] = useState(false);
  const [modificationFeedback, setModificationFeedback] = useState("");

  const decisionMutation = useMutation({
    mutationFn: async (decision: "accept" | "reject") => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const proposedChanges =
        decision === "accept" ? getAcceptPayload?.() ?? undefined : undefined;

      if (decision === "accept" && getAcceptPayload && proposedChanges == null) {
        throw new Error("Complete the required fields before applying.");
      }

      const result = await decideProposal(token, proposal.id, decision, {
        ...(proposedChanges !== undefined ? { proposedChanges } : {}),
      });
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Proposal decision failed.");
      }

      return result.data;
    },
    onSuccess: (updated) => {
      setIsModifyMode(false);
      setModificationFeedback("");
      void queryClient.invalidateQueries({ queryKey: apiQueryKeys.proposals });
      void queryClient.invalidateQueries({ queryKey: ["chat-thread", proposal.threadId] });
      for (const queryKey of getProposalDecisionRefreshQueryKeys(updated)) {
        void queryClient.invalidateQueries({ queryKey });
      }
      onDecision?.(updated);
    },
  });

  const modifyMutation = useMutation({
    mutationFn: async (feedback: string) => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await modifyProposal(token, proposal.id, feedback);
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Proposal revision request failed.");
      }

      return result.data;
    },
    onSuccess: (response) => {
      setIsModifyMode(false);
      setModificationFeedback("");
      void queryClient.invalidateQueries({ queryKey: apiQueryKeys.proposals });
      void queryClient.invalidateQueries({ queryKey: ["chat-thread", proposal.threadId] });
      void queryClient.invalidateQueries({ queryKey: ["proposals", proposal.threadId] });
      onDecision?.(response.proposal);
      onModifyRequest?.(response);
    },
  });

  const isActionPending = decisionMutation.isPending || modifyMutation.isPending;
  const trimmedModifyFeedback = modificationFeedback.trim();

  return {
    decisionMutation,
    modifyMutation,
    isActionPending,
    isModifyMode,
    setIsModifyMode,
    modificationFeedback,
    setModificationFeedback,
    trimmedModifyFeedback,
  };
}
