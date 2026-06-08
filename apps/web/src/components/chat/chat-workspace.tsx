"use client";

import { useAuth } from "@clerk/nextjs";
import type { AiProposal, ProposalModifyResponse } from "@health/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  apiQueryKeys,
  createChatThread,
  getChatThread,
  getDirectChatPathRefreshQueryKeys,
  listChatThreads,
  listProposals,
  sendChatMessage,
  uploadChatAttachment,
} from "../../lib/api";
import {
  buildOptimisticAttachmentDisplays,
  canSendChatComposer,
  createChatComposerAttachmentDraft,
  isChatAttachmentSendEligible,
  revokeChatAttachmentPreviewUrl,
  type ChatAttachmentOutcomeDisplay,
  type ChatComposerAttachmentDraft,
} from "../../lib/chat-attachment-ui-state";
import { buildChatAttachmentUploadPayload } from "../../lib/chat-attachment-upload";
import {
  getDirectChatPathRefreshHints,
  resolveChatMessageDirectPathFeedback,
} from "../../lib/chat-direct-path-ui-state";
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
import {
  resolveChatMessageAttachmentPreviews,
  resolveChatMessageTextContent,
} from "../../lib/chat-message-attachments";
import { CrisisSupportPanel } from "../wellbeing/crisis-support-panel";
import { ChatAttachmentOutcomePanel } from "./chat-attachment-outcome-panel";
import { ChatComposerAttachmentInput } from "./chat-composer-attachment-input";
import { ChatComposerAttachments } from "./chat-composer-attachments";
import { ChatMessageAttachmentPreviews } from "./chat-message-attachment-previews";
import { PhotoGuide } from "./photo-guide";
import { PhotoStripMsg } from "./photo-strip-msg";
import { WeeklyReviewChatSummary } from "./weekly-review-chat-summary";
import {
  BODY_ANALYSIS_THINKING_LABEL,
  hasBodyAnalysisProposal,
  isBodyAnalysisProposalSaved,
  resolveBodyPhotoRequestMessage,
  type ChatBodyFlowStep,
} from "../../lib/chat-body-flow-ui-state";
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
  Icon,
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
  /**
   * chatBodyFlow — tracks whether we are in the body-analysis photo intake flow.
   * - "ask": coach has requested photos; PhotoGuide is mounted after the request message.
   * - "uploading": user selected files from PhotoGuide; they are in the composer draft.
   * - "analyzing": user sent the photo message; awaiting the AI response.
   * - "result" / "saved": save_body_analysis proposal returned / accepted.
   */
  const [chatBodyFlowStep, setChatBodyFlowStep] =
    useState<ChatBodyFlowStep | null>(null);

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
    setAttachmentOutcomesByMessageId({});
    setChatBodyFlowStep(null);
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
        setOptimisticMessage(
          createOptimisticUserMessage(
            primaryThreadId,
            input.content,
            buildOptimisticAttachmentDisplays(composerAttachments),
          ),
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

      // Advance body flow step: if the response contains a body analysis proposal, mark "result".
      if (hasBodyAnalysisProposal(turn.proposals)) {
        setChatBodyFlowStep("result");
      }

      setLocalProposals(turn.proposals);
      if (turn.attachmentOutcomes?.length) {
        setAttachmentOutcomesByMessageId((current) => ({
          ...current,
          [turn.assistantMessage.id]: turn.attachmentOutcomes ?? [],
        }));
      }
      void queryClient.invalidateQueries({ queryKey: ["chat-thread", turn.thread.id] });
      void queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
      void queryClient.invalidateQueries({ queryKey: ["proposals", turn.thread.id] });
      void queryClient.invalidateQueries({ queryKey: apiQueryKeys.proposals });

      const directPathRefreshHints = getDirectChatPathRefreshHints(turn.assistantMessage.metadata);
      if (directPathRefreshHints.length > 0) {
        for (const queryKey of getDirectChatPathRefreshQueryKeys(directPathRefreshHints)) {
          void queryClient.invalidateQueries({ queryKey });
        }
      }
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

  // ── Body analysis chat flow derived state ─────────────────────────────────
  //
  // Detect when the latest coach message is a body-photo request.
  // The "ask" step is shown when:
  //   (a) a body-photo-request message exists in the thread, AND
  //   (b) we are not already in a later step (uploading/analyzing/result/saved).
  const bodyPhotoRequestMessage = useMemo(
    () => resolveBodyPhotoRequestMessage(messages),
    [messages],
  );

  // Derive "saved" when all body proposals are accepted.
  const allBodyProposalsMerged = useMemo(
    () => mergeProposalsById(threadProposalsQuery.data ?? [], localProposals)
      .filter((p) => p.intent === "save_body_analysis"),
    [threadProposalsQuery.data, localProposals],
  );

  const bodyAnalysisSaved = useMemo(
    () => isBodyAnalysisProposalSaved(allBodyProposalsMerged),
    [allBodyProposalsMerged],
  );

  // The step to display — local chatBodyFlowStep state takes precedence (set by
  // user interactions), falling back to detecting "ask" from the message thread,
  // and "saved" from the proposal list.
  const resolvedBodyFlowStep: ChatBodyFlowStep | null = useMemo(() => {
    if (bodyAnalysisSaved) return "saved";
    if (chatBodyFlowStep === "result" || chatBodyFlowStep === "saved") return chatBodyFlowStep;
    if (chatBodyFlowStep === "analyzing" || sendMessageMutation.isPending) {
      return chatBodyFlowStep ?? null;
    }
    if (chatBodyFlowStep === "uploading") return "uploading";
    if (bodyPhotoRequestMessage) return "ask";
    return null;
  }, [bodyAnalysisSaved, bodyPhotoRequestMessage, chatBodyFlowStep, sendMessageMutation.isPending]);

  /**
   * Whether to show the PhotoGuide card after the body-photo-request coach message.
   * Only shown during the "ask" step — once the user starts uploading, it is dismissed.
   */
  const showPhotoGuide =
    resolvedBodyFlowStep === "ask" &&
    bodyPhotoRequestMessage !== null &&
    !sendMessageMutation.isPending;

  /**
   * Whether to show the body analysis ThinkingBlock label during the analyzing step.
   */
  const showBodyAnalysisThinking =
    sendMessageMutation.isPending && chatBodyFlowStep === "analyzing";

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
      // If we are in the body-photo "uploading" step, advance to "analyzing" on send.
      if (chatBodyFlowStep === "uploading" || resolvedBodyFlowStep === "ask") {
        setChatBodyFlowStep("analyzing");
      }
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

    // If a body analysis proposal is now accepted, mark the flow as saved.
    if (updated.intent === "save_body_analysis" && updated.status === "accepted") {
      setChatBodyFlowStep("saved");
    }
  };

  /**
   * Called when the user selects files from the PhotoGuide card.
   * Feeds the files into the standard attachment machinery and advances the flow step.
   */
  const handlePhotoGuideFilesSelected = useCallback(
    (files: File[]) => {
      if (files.length === 0 || !primaryThreadId) return;

      // Advance to "uploading" step — PhotoGuide is dismissed, files enter composer.
      setChatBodyFlowStep("uploading");

      // Build draft attachments from the selected files using the shared factory
      // and trigger the upload process for each one.
      const newDrafts = files.map((file) =>
        createChatComposerAttachmentDraft(file),
      );

      setComposerAttachments((attachments) => [...attachments, ...newDrafts]);

      for (const draft of newDrafts) {
        void processAttachmentDraft(draft);
      }
    },
    [primaryThreadId, processAttachmentDraft],
  );

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
          {/* Coach status header */}
          <div className="chat-header" aria-label="Coach status">
            <div className="chat-header__coach-label">
              <span className="chat-header__online-dot" aria-hidden="true" />
              <span className="chat-header__coach-name">Coach</span>
              <span className="chat-header__status">· online</span>
            </div>
          </div>
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
              const attachmentPreviews = isUser
                ? resolveChatMessageAttachmentPreviews(message)
                : [];
              const messageText = isUser
                ? resolveChatMessageTextContent(message.content, attachmentPreviews)
                : message.content;
              const crisisSupportCopy = isUser
                ? null
                : resolveChatMessageCrisisSupport(message);
              const weeklyReviewPack = isUser
                ? null
                : resolveChatMessageWeeklyReview(message);
              const directPathFeedback = isUser
                ? null
                : resolveChatMessageDirectPathFeedback(message);

              // Body-flow: show PhotoStripMsg instead of generic previews for user
              // messages that carry body-analysis photos (3 images in body flow context).
              const isBodyPhotoMessage =
                isUser &&
                attachmentPreviews.length >= 1 &&
                (chatBodyFlowStep === "uploading" ||
                  chatBodyFlowStep === "analyzing" ||
                  chatBodyFlowStep === "result" ||
                  chatBodyFlowStep === "saved");

              // Show PhotoGuide after the specific coach message that requested photos.
              const isBodyPhotoRequestMsg =
                !isUser &&
                showPhotoGuide &&
                bodyPhotoRequestMessage?.id === message.id;

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
                      <>
                        {/* Body-flow: labelled photo strip for the 3-angle upload */}
                        {isBodyPhotoMessage ? (
                          <PhotoStripMsg
                            previews={attachmentPreviews}
                            caption="Вот, со всех сторон"
                          />
                        ) : attachmentPreviews.length > 0 ? (
                          <ChatMessageAttachmentPreviews previews={attachmentPreviews} />
                        ) : null}
                        {messageText ? <p className="chat-bubble__text">{messageText}</p> : null}
                        {directPathFeedback ? (
                          <p className="notice notice-inline" role="status">
                            {directPathFeedback.message}
                          </p>
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
                      </>
                    )}
                  </ChatBubble>

                  {weeklyReviewPack ? (
                    <WeeklyReviewChatSummary
                      pack={weeklyReviewPack}
                      titleId={`chat-weekly-review-${message.id}`}
                    />
                  ) : null}

                  {/* Body-flow: PhotoGuide card after the coach's photo-request message */}
                  {isBodyPhotoRequestMsg ? (
                    <PhotoGuide
                      disabled={sendMessageMutation.isPending}
                      onFilesSelected={handlePhotoGuideFilesSelected}
                    />
                  ) : null}

                  {attachmentOutcomesByMessageId[message.id]?.length ? (
                    <ChatAttachmentOutcomePanel
                      outcomes={attachmentOutcomesByMessageId[message.id] ?? []}
                      titleId={`chat-attachment-outcomes-${message.id}`}
                    />
                  ) : null}
                </li>
              );
            })}

            {sendMessageMutation.isPending ? (
              <li>
                <ChatBubble role="assistant">
                  {/* Body-flow: show specialized thinking label during body analysis */}
                  {showBodyAnalysisThinking ? (
                    <p className="chat-thinking-indicator__body-label">
                      {BODY_ANALYSIS_THINKING_LABEL}
                    </p>
                  ) : (
                    <ChatThinkingIndicator />
                  )}
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
              />
              <div className="chat-composer-controls">
                <ChatComposerAttachmentInput
                  attachments={composerAttachments}
                  disabled={sendMessageMutation.isPending}
                  onAttachmentsChange={setComposerAttachments}
                  onProcessDraft={(draft) => {
                    void processAttachmentDraft(draft);
                  }}
                />
                <label className="sr-only" htmlFor="chat-message">
                  Message your coach
                </label>
                <textarea
                  id="chat-message"
                  className="chat-composer-controls__input"
                  rows={2}
                  value={draft}
                  placeholder="Message your coach…"
                  disabled={sendMessageMutation.isPending}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <Button
                  type="submit"
                  className="button-coach chat-composer-controls__send"
                  disabled={sendDisabled || !primaryThreadId}
                  aria-label="Send message"
                >
                  {sendMessageMutation.isPending ? (
                    <span className="chat-composer-controls__send-pending" aria-hidden>…</span>
                  ) : (
                    <Icon name="send" size={16} stroke="currentColor" aria-hidden />
                  )}
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
            <p className="chat-composer-disclaimer">
              Your coach suggests — the decision is always yours. This is lifestyle support, not medical advice.
            </p>
          </ChatComposer>
        </>
      ) : null}
    </div>
  );
}
