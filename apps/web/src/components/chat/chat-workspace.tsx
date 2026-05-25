"use client";

import { useAuth } from "@clerk/nextjs";
import type { AiProposal } from "@health/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  apiQueryKeys,
  createChatThread,
  getChatThread,
  listChatThreads,
  listProposals,
  sendChatMessage,
} from "../../lib/api";
import {
  createOptimisticUserMessage,
  formatChatTimestamp,
  mergeDisplayMessages,
  resolveChatMessageCrisisSupport,
  resolveChatMessageWeeklyReview,
  resolvePrimaryThreadId,
  SUGGESTED_CHAT_PROMPTS,
  type OptimisticChatMessage,
} from "../../lib/chat-ui-state";
import { CrisisSupportPanel } from "../wellbeing/crisis-support-panel";
import { WeeklyReviewChatSummary } from "./weekly-review-chat-summary";
import { mergeProposalsById } from "../../lib/proposal-ui-state";
import { InlineProposalCard } from "../proposals/inline-proposal-card";
import {
  Button,
  ChatBubble,
  ChatComposer,
  ChatTranscript,
  EmptyState,
  ErrorState,
  LoadingState,
} from "../ui";

export function ChatWorkspace() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [localProposals, setLocalProposals] = useState<AiProposal[]>([]);
  const [optimisticMessage, setOptimisticMessage] = useState<OptimisticChatMessage | null>(
    null,
  );

  const threadsQuery = useQuery({
    queryKey: ["chat-threads"],
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await listChatThreads(token);
      if (result.error) {
        throw new Error(result.error);
      }

      return result.data ?? [];
    },
  });

  const primaryThreadId = useMemo(
    () => resolvePrimaryThreadId(threadsQuery.data ?? []),
    [threadsQuery.data],
  );

  const ensureThreadMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await createChatThread(token);
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Conversation could not be started.");
      }

      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
    },
  });

  useEffect(() => {
    if (
      threadsQuery.isSuccess &&
      (threadsQuery.data?.length ?? 0) === 0 &&
      !ensureThreadMutation.isPending &&
      !ensureThreadMutation.isSuccess &&
      !ensureThreadMutation.isError
    ) {
      ensureThreadMutation.mutate();
    }
  }, [
    ensureThreadMutation,
    threadsQuery.data,
    threadsQuery.isSuccess,
  ]);

  const threadDetailQuery = useQuery({
    queryKey: ["chat-thread", primaryThreadId],
    enabled: Boolean(primaryThreadId),
    queryFn: async () => {
      const token = await getToken();
      if (!token || !primaryThreadId) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await getChatThread(token, primaryThreadId);
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Conversation could not be loaded.");
      }

      return result.data;
    },
  });

  const threadProposalsQuery = useQuery({
    queryKey: ["proposals", primaryThreadId],
    enabled: Boolean(primaryThreadId),
    queryFn: async () => {
      const token = await getToken();
      if (!token || !primaryThreadId) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await listProposals(token, primaryThreadId);
      if (result.error) {
        throw new Error(result.error);
      }

      return result.data ?? [];
    },
  });

  useEffect(() => {
    setLocalProposals([]);
    setOptimisticMessage(null);
  }, [primaryThreadId]);

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      const token = await getToken();
      if (!token || !primaryThreadId) {
        throw new Error("Your coaching conversation is not ready yet.");
      }

      const result = await sendChatMessage(token, primaryThreadId, content);
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Message could not be sent.");
      }

      return result.data;
    },
    onMutate: (content) => {
      if (!primaryThreadId) {
        return;
      }

      setOptimisticMessage(createOptimisticUserMessage(primaryThreadId, content));
    },
    onSuccess: (turn) => {
      setDraft("");
      setOptimisticMessage(null);
      setLocalProposals(turn.proposals);
      void queryClient.invalidateQueries({ queryKey: ["chat-thread", turn.thread.id] });
      void queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
      void queryClient.invalidateQueries({ queryKey: ["proposals", turn.thread.id] });
      void queryClient.invalidateQueries({ queryKey: apiQueryKeys.proposals });
    },
    onError: () => {
      setOptimisticMessage(null);
    },
  });

  const messages = mergeDisplayMessages(
    threadDetailQuery.data?.messages ?? [],
    optimisticMessage,
  );

  const proposalsByMessageId = useMemo(() => {
    const merged = mergeProposalsById(threadProposalsQuery.data ?? [], localProposals);
    const map = new Map<string, AiProposal[]>();

    for (const proposal of merged) {
      const key = proposal.sourceMessageId ?? "unlinked";
      const existing = map.get(key) ?? [];
      map.set(key, [...existing, proposal]);
    }

    return map;
  }, [localProposals, threadProposalsQuery.data]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sendMessageMutation.isPending || !primaryThreadId) {
      return;
    }

    sendMessageMutation.mutate(content);
  };

  const handlePromptSelect = (prompt: string) => {
    if (sendMessageMutation.isPending || !primaryThreadId) {
      return;
    }

    sendMessageMutation.mutate(prompt);
  };

  const handleProposalDecision = (updated: AiProposal) => {
    setLocalProposals((proposals) => mergeProposalsById(proposals, [updated]));
  };

  const isBootstrapping =
    threadsQuery.isLoading ||
    ensureThreadMutation.isPending ||
    (Boolean(primaryThreadId) && threadDetailQuery.isLoading);

  return (
    <div className="chat-single">
      {threadsQuery.isError ? (
        <ErrorState
          title="Conversation unavailable"
          description={
            threadsQuery.error instanceof Error
              ? threadsQuery.error.message
              : "Your coaching conversation could not be loaded."
          }
        />
      ) : null}

      {ensureThreadMutation.isError ? (
        <ErrorState
          title="Could not start coaching conversation"
          description={
            ensureThreadMutation.error instanceof Error
              ? ensureThreadMutation.error.message
              : "Please try again in a moment."
          }
        />
      ) : null}

      {isBootstrapping ? (
        <LoadingState title="Loading your coaching conversation…" />
      ) : null}

      {!isBootstrapping && threadDetailQuery.isError ? (
        <ErrorState
          title="Messages unavailable"
          description={
            threadDetailQuery.error instanceof Error
              ? threadDetailQuery.error.message
              : "Messages could not be loaded."
          }
        />
      ) : null}

      {!isBootstrapping && !threadDetailQuery.isError && primaryThreadId ? (
        <>
          <ChatTranscript>
            {messages.length === 0 && !sendMessageMutation.isPending ? (
              <li className="chat-empty-state">
                <EmptyState
                  title="Start a conversation with your coach"
                  description="Ask about workouts, goals, nutrition, or how you're feeling this week."
                />
                <div className="chat-prompt-chips" role="list">
                  {SUGGESTED_CHAT_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      className="chat-prompt-chip"
                      disabled={sendMessageMutation.isPending}
                      onClick={() => handlePromptSelect(prompt)}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </li>
            ) : null}

            {messages.map((message) => {
              const linkedProposals = proposalsByMessageId.get(message.id) ?? [];
              const isUser = message.role === "user";
              const crisisSupportCopy = isUser
                ? null
                : resolveChatMessageCrisisSupport(message);
              const weeklyReviewPack = isUser
                ? null
                : resolveChatMessageWeeklyReview(message);

              return (
                <li key={message.id}>
                  <ChatBubble
                    role={isUser ? "user" : "assistant"}
                    className={
                      isUser
                        ? undefined
                        : crisisSupportCopy
                          ? "chat-bubble--coach chat-bubble--crisis"
                          : "chat-bubble--coach"
                    }
                    meta={
                      <time dateTime={message.createdAt}>
                        {formatChatTimestamp(message.createdAt)}
                      </time>
                    }
                  >
                    {crisisSupportCopy ? (
                      <CrisisSupportPanel
                        copy={crisisSupportCopy}
                        titleId={`chat-crisis-${message.id}`}
                      />
                    ) : (
                      message.content
                    )}
                  </ChatBubble>

                  {weeklyReviewPack ? (
                    <WeeklyReviewChatSummary
                      pack={weeklyReviewPack}
                      titleId={`chat-weekly-review-${message.id}`}
                    />
                  ) : null}

                  {linkedProposals.length > 0 ? (
                    <div className="message-proposals">
                      {linkedProposals.map((proposal) => (
                        <InlineProposalCard
                          key={proposal.id}
                          proposal={proposal}
                          onDecision={handleProposalDecision}
                        />
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}

            {sendMessageMutation.isPending ? (
              <li>
                <ChatBubble role="assistant" className="chat-bubble--coach">
                  <span className="state-message__spinner" aria-hidden="true" />
                  Your coach is thinking…
                </ChatBubble>
              </li>
            ) : null}
          </ChatTranscript>

          <ChatComposer onSubmit={handleSubmit}>
            <div className="chat-composer-inner">
              <label className="sr-only" htmlFor="chat-message">
                Message your coach
              </label>
              <textarea
                id="chat-message"
                className="form-textarea"
                rows={2}
                value={draft}
                placeholder="Message your coach…"
                disabled={sendMessageMutation.isPending}
                onChange={(event) => setDraft(event.target.value)}
              />
              <div className="action-row composer-actions">
                <Button
                  type="submit"
                  className="button-coach"
                  disabled={!draft.trim() || sendMessageMutation.isPending}
                >
                  {sendMessageMutation.isPending ? "Sending…" : "Send"}
                </Button>
              </div>
              {sendMessageMutation.isError ? (
                <p className="form-error" role="alert">
                  {sendMessageMutation.error instanceof Error
                    ? sendMessageMutation.error.message
                    : "Message could not be sent."}
                </p>
              ) : null}
            </div>
          </ChatComposer>
        </>
      ) : null}
    </div>
  );
}
