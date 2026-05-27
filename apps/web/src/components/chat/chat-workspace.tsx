"use client";

import { useAuth } from "@clerk/nextjs";
import type { AiProposal, ProposalModifyResponse } from "@health/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  apiQueryKeys,
  createChatThread,
  getChatThread,
  grantChatAttachmentConsent,
  listChatThreads,
  listProposals,
  recognizeChatAttachment,
  sendChatMessage,
  uploadChatAttachment,
} from "../../lib/api";
import {
  buildOptimisticAttachmentSummary,
  canSendChatComposer,
  enrichAttachmentOutcomesWithProposalContext,
  isChatAttachmentSendEligible,
  revokeChatAttachmentPreviewUrl,
  type ChatAttachmentOutcomeDisplay,
  type ChatComposerAttachmentDraft,
} from "../../lib/chat-attachment-ui-state";
import {
  buildChatAttachmentUploadPayload,
  resolveRecognizeConsentScopes,
} from "../../lib/chat-attachment-upload";
import { DOCUMENT_CONSENT_VERSION } from "../../lib/documents-ui-state";
import {
  createOptimisticUserMessage,
  formatChatTimestamp,
  mergeDisplayMessages,
  resolveChatMessageCrisisSupport,
  resolveChatMessageWeeklyReview,
  CHAT_EMPTY_STATE_DESCRIPTION,
  CHAT_EMPTY_STATE_TITLE,
  resolvePrimaryThreadId,
  SUGGESTED_CHAT_PROMPTS,
  type OptimisticChatMessage,
} from "../../lib/chat-ui-state";
import { CrisisSupportPanel } from "../wellbeing/crisis-support-panel";
import { ChatAttachmentOutcomePanel } from "./chat-attachment-outcome-panel";
import { ChatComposerAttachments } from "./chat-composer-attachments";
import { WeeklyReviewChatSummary } from "./weekly-review-chat-summary";
import { mergeProposalsById } from "../../lib/proposal-ui-state";
import {
  buildProposalRevisionChatSend,
  isProposalRevisionChatSend,
  PROPOSAL_REVISION_CHAT_SEND_FAILED_MESSAGE,
  shouldShowProposalRevisionSendRetry,
  type ProposalRevisionChatSend,
} from "../../lib/proposal-revision";
import { InlineProposalCard } from "../proposals/inline-proposal-card";
import {
  Button,
  ChatBubble,
  ChatComposer,
  ChatThinkingIndicator,
  ChatTranscript,
  EmptyState,
  ErrorState,
  LoadingState,
  PromptChip,
  PromptChipList,
} from "../ui";

type ChatSendMutationInput =
  | string
  | ProposalRevisionChatSend
  | {
      content: string;
      attachmentRefIds: string[];
    };

export function ChatWorkspace() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [localProposals, setLocalProposals] = useState<AiProposal[]>([]);
  const [optimisticMessage, setOptimisticMessage] = useState<OptimisticChatMessage | null>(
    null,
  );
  const [pendingRevisionSend, setPendingRevisionSend] =
    useState<ProposalRevisionChatSend | null>(null);
  const [composerAttachments, setComposerAttachments] = useState<ChatComposerAttachmentDraft[]>(
    [],
  );
  const [attachmentOutcomesByMessageId, setAttachmentOutcomesByMessageId] = useState<
    Record<string, ChatAttachmentOutcomeDisplay[]>
  >({});

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
    setPendingRevisionSend(null);
    setComposerAttachments((current) => {
      for (const attachment of current) {
        revokeChatAttachmentPreviewUrl(attachment);
      }
      return [];
    });
  }, [primaryThreadId]);

  const updateComposerAttachment = useCallback(
    (localId: string, updater: (draft: ChatComposerAttachmentDraft) => ChatComposerAttachmentDraft) => {
      setComposerAttachments((attachments) =>
        attachments.map((attachment) =>
          attachment.localId === localId ? updater(attachment) : attachment,
        ),
      );
    },
    [],
  );

  const processAttachmentDraft = useCallback(
    async (draftInput: ChatComposerAttachmentDraft) => {
      if (!primaryThreadId) {
        return;
      }

      updateComposerAttachment(draftInput.localId, (current) => ({
        ...current,
        phase: "uploading",
        error: null,
      }));

      try {
        const token = await getToken();
        if (!token) {
          throw new Error("Clerk session token is unavailable.");
        }

        const payloadResult = await buildChatAttachmentUploadPayload({
          draft: draftInput,
          threadId: primaryThreadId,
        });

        if (!payloadResult.ok) {
          updateComposerAttachment(draftInput.localId, (current) => ({
            ...current,
            phase: "error",
            error: payloadResult.message,
          }));
          return;
        }

        const uploadResult = await uploadChatAttachment(token, payloadResult.payload);
        if (uploadResult.error || !uploadResult.data) {
          updateComposerAttachment(draftInput.localId, (current) => ({
            ...current,
            phase: "error",
            error: uploadResult.error ?? "Attachment could not be uploaded.",
          }));
          return;
        }

        if (uploadResult.data.status === "needs_consent") {
          updateComposerAttachment(draftInput.localId, (current) => ({
            ...current,
            attachmentId: uploadResult.data!.id,
            record: uploadResult.data!,
            phase: "needs_consent",
          }));
          return;
        }

        updateComposerAttachment(draftInput.localId, (current) => ({
          ...current,
          attachmentId: uploadResult.data!.id,
          record: uploadResult.data!,
          phase: "uploaded",
          error: null,
        }));
      } catch (error) {
        updateComposerAttachment(draftInput.localId, (current) => ({
          ...current,
          phase: "error",
          error: error instanceof Error ? error.message : "Attachment processing failed.",
        }));
      }
    },
    [getToken, primaryThreadId, updateComposerAttachment],
  );

  const grantConsentAndRetry = useCallback(
    async (localId: string) => {
      const draft = composerAttachments.find((attachment) => attachment.localId === localId);
      if (!draft) {
        return;
      }

      if (!draft.attachmentId) {
        await processAttachmentDraft(draft);
        return;
      }

      updateComposerAttachment(localId, (current) => ({
        ...current,
        phase: "uploading",
        error: null,
      }));

      try {
        const token = await getToken();
        if (!token) {
          throw new Error("Clerk session token is unavailable.");
        }

        const consentResult = await grantChatAttachmentConsent(token, draft.attachmentId, {
          consentScopes: [...draft.consentScopes],
          consentVersion: DOCUMENT_CONSENT_VERSION,
        });

        if (consentResult.error || !consentResult.data) {
          updateComposerAttachment(localId, (current) => ({
            ...current,
            phase: "needs_consent",
            error: consentResult.error ?? "Consent could not be recorded.",
          }));
          return;
        }

        updateComposerAttachment(localId, (current) => ({
          ...current,
          record: consentResult.data!,
          phase: "uploaded",
          error: null,
        }));
      } catch (error) {
        updateComposerAttachment(localId, (current) => ({
          ...current,
          phase: "needs_consent",
          error: error instanceof Error ? error.message : "Consent could not be recorded.",
        }));
      }
    },
    [composerAttachments, getToken, processAttachmentDraft, updateComposerAttachment],
  );

  const recognizeAttachmentDraft = useCallback(
    async (draftInput: ChatComposerAttachmentDraft) => {
      if (!draftInput.attachmentId) {
        return;
      }

      updateComposerAttachment(draftInput.localId, (current) => ({
        ...current,
        phase: "recognizing",
        error: null,
      }));

      try {
        const token = await getToken();
        if (!token) {
          throw new Error("Clerk session token is unavailable.");
        }

        const recognizeResult = await recognizeChatAttachment(token, draftInput.attachmentId, {
          consentScopes: resolveRecognizeConsentScopes(
            draftInput.category,
            draftInput.consentScopes,
          ),
          consentVersion: DOCUMENT_CONSENT_VERSION,
        });

        if (recognizeResult.error || !recognizeResult.data) {
          updateComposerAttachment(draftInput.localId, (current) => ({
            ...current,
            phase: "uploaded",
            error: recognizeResult.error ?? "Attachment could not be recognized.",
          }));
          return;
        }

        updateComposerAttachment(draftInput.localId, (current) => ({
          ...current,
          record: recognizeResult.data!.attachment,
          phase: "ready",
          proposalCandidateCount: recognizeResult.data!.proposalCandidates.length,
        }));
      } catch (error) {
        updateComposerAttachment(draftInput.localId, (current) => ({
          ...current,
          phase: "uploaded",
          error: error instanceof Error ? error.message : "Attachment recognition failed.",
        }));
      }
    },
    [getToken, updateComposerAttachment],
  );

  const sendMessageMutation = useMutation({
    mutationFn: async (input: ChatSendMutationInput) => {
      const token = await getToken();
      if (!token || !primaryThreadId) {
        throw new Error("Your coaching conversation is not ready yet.");
      }

      if (typeof input === "object" && "attachmentRefIds" in input) {
        const result = await sendChatMessage(token, primaryThreadId, input.content, {
          attachmentRefIds: input.attachmentRefIds,
        });
        if (result.error || !result.data) {
          throw new Error(result.error ?? "Message could not be sent.");
        }

        return result.data;
      }

      const content = isProposalRevisionChatSend(input) ? input.message : input;
      const proposalRevision = isProposalRevisionChatSend(input)
        ? input.proposalRevision
        : undefined;

      const result = await sendChatMessage(token, primaryThreadId, content, {
        proposalRevision,
      });
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Message could not be sent.");
      }

      return result.data;
    },
    onMutate: (input) => {
      if (!primaryThreadId) {
        return;
      }

      if (typeof input === "object" && "attachmentRefIds" in input) {
        const attachmentSummary = buildOptimisticAttachmentSummary(composerAttachments);
        setOptimisticMessage(
          createOptimisticUserMessage(primaryThreadId, input.content, attachmentSummary),
        );
        return;
      }

      const content = isProposalRevisionChatSend(input) ? input.message : input;
      setOptimisticMessage(createOptimisticUserMessage(primaryThreadId, content));
    },
    onSuccess: (turn) => {
      setDraft("");
      setOptimisticMessage(null);
      setPendingRevisionSend(null);
      setComposerAttachments((current) => {
        for (const attachment of current) {
          revokeChatAttachmentPreviewUrl(attachment);
        }
        return [];
      });
      setLocalProposals(turn.proposals);
      if (turn.attachmentOutcomes?.length) {
        setAttachmentOutcomesByMessageId((current) => ({
          ...current,
          [turn.assistantMessage.id]: enrichAttachmentOutcomesWithProposalContext(
            turn.attachmentOutcomes ?? [],
            turn.proposals,
          ),
        }));
      }
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
    const attachmentRefIds = composerAttachments
      .filter((attachment) => isChatAttachmentSendEligible(attachment.record, attachment))
      .map((attachment) => attachment.attachmentId)
      .filter((attachmentId): attachmentId is string => Boolean(attachmentId));

    if (
      !canSendChatComposer({
        draftText: draft,
        attachments: composerAttachments,
        isSendPending: sendMessageMutation.isPending,
      }) ||
      !primaryThreadId
    ) {
      return;
    }

    if (attachmentRefIds.length > 0) {
      sendMessageMutation.mutate({ content, attachmentRefIds });
      return;
    }

    if (!content) {
      return;
    }

    sendMessageMutation.mutate(content);
  };

  const sendDisabled = !canSendChatComposer({
    draftText: draft,
    attachments: composerAttachments,
    isSendPending: sendMessageMutation.isPending,
  });

  const handlePromptSelect = (prompt: string) => {
    if (sendMessageMutation.isPending || !primaryThreadId) {
      return;
    }

    sendMessageMutation.mutate(prompt);
  };

  const handleProposalDecision = (updated: AiProposal) => {
    setLocalProposals((proposals) => mergeProposalsById(proposals, [updated]));
  };

  const handleProposalModifyRequest = (response: ProposalModifyResponse) => {
    setLocalProposals((proposals) =>
      mergeProposalsById(proposals, [response.proposal]),
    );

    const revisionSend = buildProposalRevisionChatSend(response);
    if (revisionSend.message.trim() && primaryThreadId && !sendMessageMutation.isPending) {
      setPendingRevisionSend(revisionSend);
      sendMessageMutation.mutate(revisionSend);
    }
  };

  const showRevisionSendRetry = shouldShowProposalRevisionSendRetry({
    pendingRevisionSend,
    isSendError: sendMessageMutation.isError,
    isSendPending: sendMessageMutation.isPending,
  });

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
                  title={CHAT_EMPTY_STATE_TITLE}
                  description={CHAT_EMPTY_STATE_DESCRIPTION}
                />
                <PromptChipList>
                  {SUGGESTED_CHAT_PROMPTS.map((prompt) => (
                    <PromptChip
                      key={prompt.message}
                      disabled={sendMessageMutation.isPending}
                      onClick={() => handlePromptSelect(prompt.message)}
                    >
                      {prompt.label}
                    </PromptChip>
                  ))}
                </PromptChipList>
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
                    variant={
                      isUser ? "default" : crisisSupportCopy ? "crisis" : "coach"
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

                  {attachmentOutcomesByMessageId[message.id]?.length ? (
                    <ChatAttachmentOutcomePanel
                      outcomes={attachmentOutcomesByMessageId[message.id] ?? []}
                      titleId={`chat-attachment-outcomes-${message.id}`}
                    />
                  ) : null}

                  {linkedProposals.length > 0 ? (
                    <div className="message-proposals">
                      {linkedProposals.map((proposal) => (
                        <InlineProposalCard
                          key={proposal.id}
                          proposal={proposal}
                          onDecision={handleProposalDecision}
                          onModifyRequest={handleProposalModifyRequest}
                        />
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}

            {sendMessageMutation.isPending ? (
              <li>
                <ChatBubble role="assistant">
                  <ChatThinkingIndicator />
                </ChatBubble>
              </li>
            ) : null}
          </ChatTranscript>

          <ChatComposer onSubmit={handleSubmit}>
            <div className="chat-composer-inner">
              {showRevisionSendRetry ? (
                <div className="notice notice-inline" role="alert">
                  <p className="proposal-meta">
                    {PROPOSAL_REVISION_CHAT_SEND_FAILED_MESSAGE}
                  </p>
                  <div className="action-row">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={sendMessageMutation.isPending}
                      onClick={() => {
                        if (pendingRevisionSend) {
                          sendMessageMutation.mutate(pendingRevisionSend);
                        }
                      }}
                    >
                      {sendMessageMutation.isPending ? "Retrying…" : "Retry revision message"}
                    </Button>
                  </div>
                </div>
              ) : null}
              <ChatComposerAttachments
                attachments={composerAttachments}
                disabled={sendMessageMutation.isPending}
                onAttachmentsChange={setComposerAttachments}
                onProcessDraft={(draft) => {
                  void processAttachmentDraft(draft);
                }}
                onGrantConsentAndRecognize={(localId) => {
                  void grantConsentAndRetry(localId);
                }}
                onRecognizeDraft={(draft) => {
                  void recognizeAttachmentDraft(draft);
                }}
              />
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
                  disabled={sendDisabled || !primaryThreadId}
                >
                  {sendMessageMutation.isPending ? "Sending…" : "Send"}
                </Button>
              </div>
              {sendMessageMutation.isError && !showRevisionSendRetry ? (
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
