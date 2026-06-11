"use client";

import { useTranslations, useLocale } from "next-intl";
import { useAuth } from "@clerk/nextjs";
import type { AiProposal, ChatTurnResponse, ProposalModifyResponse } from "@health/types";
import { MAX_CHAT_USER_MESSAGE_CHARS } from "@health/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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
  findPrecedingUserMessage,
  resolveChatMessageDegradedTurn,
} from "../../lib/chat-degraded-ui-state";
import { useChatAutoScroll } from "../../lib/use-chat-auto-scroll";
import {
  formatChatDateSeparator,
  shouldShowDateSeparator,
} from "../../lib/chat-transcript-grouping";
import { shouldSendOnEnter } from "../../lib/chat-composer-ui-state";
import {
  createOptimisticUserMessage,
  mergeDisplayMessages,
  resolveChatMessageCrisisSupport,
  resolveChatMessageWeeklyReview,
  resolvePrimaryThreadId,
  SUGGESTED_CHAT_PROMPT_DEFINITIONS,
  type OptimisticChatMessage,
} from "../../lib/chat-ui-state";
import {
  resolveChatMessageAttachmentPreviews,
  resolveChatMessageTextContent,
} from "../../lib/chat-message-attachments";
import {
  buildStreamChatMessageBody,
  resolveStageCopy,
  shouldFallbackToSync,
  streamChatMessage,
  type ChatTurnStreamEvent,
} from "../../lib/chat-stream";
import { CrisisSupportPanel } from "../wellbeing/crisis-support-panel";
import { ChatAttachmentOutcomePanel } from "./chat-attachment-outcome-panel";
import { ChatComposerAttachmentInput } from "./chat-composer-attachment-input";
import { ChatComposerAttachments } from "./chat-composer-attachments";
import { ChatMessageAttachmentPreviews } from "./chat-message-attachment-previews";
import { PhotoGuide } from "./photo-guide";
import { PhotoStripMsg } from "./photo-strip-msg";
import { ChatDateSeparator } from "./chat-date-separator";
import { ChatJumpToLatest } from "./chat-jump-to-latest";
import { ChatMessageMarkdown } from "./chat-message-markdown";
import { ChatTurnErrorCard } from "./chat-turn-error-card";
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
  const t = useTranslations("Chat");
  const locale = useLocale();
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

  /**
   * Streaming-specific state.
   * - streamingCopy: the current coaching-toned stage label shown in the
   *   ThinkingIndicator while a stream is in flight (null = not streaming).
   * - streamingInFlight: true while the SSE stream or its sync fallback is
   *   actively running. Controls send-button disabled state to match the
   *   sync mutation's isPending behavior.
   */
  const [streamingCopy, setStreamingCopy] = useState<string | null>(null);
  const [streamingInFlight, setStreamingInFlight] = useState(false);
  const streamAbortRef = useRef<AbortController | null>(null);

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

  // ---------------------------------------------------------------------------
  // Shared cache-update handler — called identically by the streaming and sync
  // paths so there is no duplication of the TanStack Query invalidation logic.
  // ---------------------------------------------------------------------------
  const applyTurnResponse = useCallback(
    (turn: ChatTurnResponse) => {
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
    [queryClient],
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
      applyTurnResponse(turn);
    },
    onError: () => {
      setOptimisticMessage(null);
    },
  });

  // ---------------------------------------------------------------------------
  // Streaming send — attempts the SSE endpoint and falls back to sync on failure.
  // ---------------------------------------------------------------------------

  /**
   * sendMessageStreaming — attempt to stream a chat turn via the SSE endpoint.
   * On any stream failure, automatically retries via sendMessageMutation (sync path).
   *
   * While the stream is in flight, streamingInFlight=true mirrors the
   * sendMessageMutation.isPending behavior so the UI stays consistent.
   */
  const sendMessageStreaming = useCallback(
    async (
      content: string,
      options?: { proposalRevision?: unknown; attachmentRefIds?: string[] },
    ) => {
      if (!primaryThreadId) {
        return;
      }

      const token = await getToken();
      if (!token) {
        // No token — fall directly to sync.
        const syncInput = options?.attachmentRefIds?.length
          ? { content, attachmentRefIds: options.attachmentRefIds }
          : content;
        sendMessageMutation.mutate(syncInput as ChatSendMutationInput);
        return;
      }

      // Abort any previous in-flight stream.
      streamAbortRef.current?.abort();
      const abortController = new AbortController();
      streamAbortRef.current = abortController;

      setStreamingInFlight(true);
      setStreamingCopy(null);

      // Set optimistic user message so the thread renders immediately.
      const messageContent = content;
      setOptimisticMessage(
        options?.attachmentRefIds?.length
          ? createOptimisticUserMessage(
              primaryThreadId,
              messageContent,
              buildOptimisticAttachmentDisplays(composerAttachments),
            )
          : createOptimisticUserMessage(primaryThreadId, messageContent),
      );

      let finalTurn: ChatTurnResponse | null = null;

      const body = buildStreamChatMessageBody(content, options);

      const onEvent = (event: ChatTurnStreamEvent) => {
        if (event.kind === "stage") {
          setStreamingCopy(resolveStageCopy(event));
        }
        if (event.kind === "final") {
          finalTurn = event.response as ChatTurnResponse;
        }
      };

      try {
        await streamChatMessage({
          token,
          threadId: primaryThreadId,
          body,
          onEvent,
          signal: abortController.signal,
        });
      } catch (err) {
        // AbortError means we deliberately cancelled the stream — don't fall back.
        if (err instanceof Error && err.name === "AbortError") {
          setStreamingInFlight(false);
          setStreamingCopy(null);
          setOptimisticMessage(null);
          return;
        }

        // Fix 2 (duplicate-message guard): if we already received the final event,
        // the turn was fully delivered — treat as success regardless of any late
        // read error that fires after the final frame. A late read_error after
        // final is a stream-close race and must NOT trigger the sync fallback,
        // which would re-send the message and produce duplicate user+assistant
        // messages in the thread.
        if (finalTurn !== null) {
          setStreamingInFlight(false);
          setStreamingCopy(null);
          applyTurnResponse(finalTurn);
          return;
        }

        // finalTurn is null — stream failed before a final event was delivered.
        // shouldFallbackToSync governs whether we retry via the sync endpoint.
        // Known limitation: shouldFallbackToSync always returns true for all
        // current failure reasons; see chat-stream.ts for the documentation of
        // why callers must check finalTurn before consulting it.
        if (!shouldFallbackToSync("read_error")) {
          setStreamingInFlight(false);
          setStreamingCopy(null);
          setOptimisticMessage(null);
          return;
        }
        // fall through to sync fallback
      }

      if (finalTurn !== null) {
        // Stream completed cleanly with a final event — apply the turn response.
        setStreamingInFlight(false);
        setStreamingCopy(null);
        applyTurnResponse(finalTurn);
        return;
      }

      // Fallback: stream failed — retry via sync mutation.
      // Keep streamingInFlight=true so the UI stays in the loading state
      // seamlessly until the sync mutation resolves.
      setStreamingCopy(null);

      const syncInput: ChatSendMutationInput = options?.attachmentRefIds?.length
        ? { content, attachmentRefIds: options.attachmentRefIds }
        : content;

      // Clear optimistic message so the sync mutation's onMutate re-sets it.
      setOptimisticMessage(null);
      sendMessageMutation.mutate(syncInput, {
        onSettled: () => {
          setStreamingInFlight(false);
        },
      });
    },
    [
      applyTurnResponse,
      composerAttachments,
      getToken,
      primaryThreadId,
      sendMessageMutation,
    ],
  );

  // Whether a turn is currently in flight (streaming or sync mutation).
  const isSendPending = streamingInFlight || sendMessageMutation.isPending;

  const messages = mergeDisplayMessages(
    threadDetailQuery.data?.messages ?? [],
    optimisticMessage,
  );

  const { transcriptRef, isAtBottom, scrollToLatest } = useChatAutoScroll({
    messages,
    isSendPending,
  });

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
    if (chatBodyFlowStep === "analyzing" || isSendPending) {
      return chatBodyFlowStep ?? null;
    }
    if (chatBodyFlowStep === "uploading") return "uploading";
    if (bodyPhotoRequestMessage) return "ask";
    return null;
  }, [bodyAnalysisSaved, bodyPhotoRequestMessage, chatBodyFlowStep, isSendPending]);

  /**
   * Whether to show the PhotoGuide card after the body-photo-request coach message.
   * Only shown during the "ask" step — once the user starts uploading, it is dismissed.
   */
  const showPhotoGuide =
    resolvedBodyFlowStep === "ask" &&
    bodyPhotoRequestMessage !== null &&
    !isSendPending;

  /**
   * Whether to show the body analysis ThinkingBlock label during the analyzing step.
   */
  const showBodyAnalysisThinking = isSendPending && chatBodyFlowStep === "analyzing";

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
        isSendPending,
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
      void sendMessageStreaming(content, { attachmentRefIds });
      return;
    }

    if (!content) {
      return;
    }

    void sendMessageStreaming(content);
  };

  const sendDisabled = !canSendChatComposer({
    draftText: draft,
    attachments: composerAttachments,
    isSendPending,
  });

  const handlePromptSelect = (prompt: string) => {
    if (isSendPending || !primaryThreadId) {
      return;
    }

    void sendMessageStreaming(prompt);
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
    if (revisionSend.message.trim() && primaryThreadId && !isSendPending) {
      setPendingRevisionSend(revisionSend);
      void sendMessageStreaming(revisionSend.message, {
        proposalRevision: revisionSend.proposalRevision,
      });
    }
  };

  const showRevisionSendRetry = shouldShowProposalRevisionSendRetry({
    pendingRevisionSend,
    isSendError: sendMessageMutation.isError,
    isSendPending,
  });

  const isBootstrapping =
    threadsQuery.isLoading ||
    ensureThreadMutation.isPending ||
    (Boolean(primaryThreadId) && threadDetailQuery.isLoading);

  // Determine the thinking indicator content.
  // Streaming stage copy takes precedence over the generic body-analysis label.
  const thinkingContent = (() => {
    if (showBodyAnalysisThinking) {
      return (
        <p className="chat-thinking-indicator__body-label">
          {BODY_ANALYSIS_THINKING_LABEL}
        </p>
      );
    }
    if (streamingCopy) {
      return (
        <p
          className="chat-thinking-indicator__stage"
          aria-live="polite"
          aria-atomic="true"
        >
          {streamingCopy}
        </p>
      );
    }
    return <ChatThinkingIndicator />;
  })();

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
          <ChatTranscript ref={transcriptRef}>
            {messages.length === 0 && !isSendPending ? (
              <li className="chat-empty-state">
                <EmptyState
                  title={t("emptyStateTitle")}
                  description={t("emptyStateDescription")}
                />
                <PromptChipList>
                  {SUGGESTED_CHAT_PROMPT_DEFINITIONS.map((prompt) => (
                    <PromptChip
                      key={prompt.message}
                      disabled={isSendPending}
                      onClick={() => handlePromptSelect(prompt.message)}
                    >
                      {t(`suggestedPrompts.${prompt.labelKey}`)}
                    </PromptChip>
                  ))}
                </PromptChipList>
              </li>
            ) : null}

            {messages.map((message, messageIndex) => {
              const prevMessage = messageIndex > 0 ? messages[messageIndex - 1] : null;
              const showSeparator = shouldShowDateSeparator(prevMessage ?? null, message);
              const separatorLabel = showSeparator
                ? formatChatDateSeparator(message.createdAt, locale, t("dateToday"), t("dateYesterday"))
                : null;

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
              const degradedTurn = isUser
                ? null
                : resolveChatMessageDegradedTurn(message);

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
                <React.Fragment key={message.id}>
                  {showSeparator && separatorLabel ? (
                    <ChatDateSeparator
                      label={separatorLabel}
                      dateTime={message.createdAt}
                    />
                  ) : null}
                <li>
                  <ChatBubble
                    role={isUser ? "user" : "assistant"}
                    variant={
                      isUser ? "default" : crisisSupportCopy ? "crisis" : "coach"
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
                            caption={t("bodyPhotoCaption")}
                          />
                        ) : attachmentPreviews.length > 0 ? (
                          <ChatMessageAttachmentPreviews previews={attachmentPreviews} />
                        ) : null}
                        {isUser && messageText ? <p className="chat-bubble__text">{messageText}</p> : null}
                        {!isUser && degradedTurn ? (
                          <ChatTurnErrorCard
                            onRetry={() => {
                              const precedingText = findPrecedingUserMessage(messages, messageIndex);
                              if (precedingText) {
                                void sendMessageStreaming(precedingText);
                              }
                            }}
                            onEditRequest={() => {
                              const precedingText = findPrecedingUserMessage(messages, messageIndex);
                              if (precedingText) {
                                setDraft(precedingText);
                              }
                            }}
                          />
                        ) : (!isUser && messageText ? <ChatMessageMarkdown>{messageText}</ChatMessageMarkdown> : null)}
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
                      disabled={isSendPending}
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
                </React.Fragment>
              );
            })}

            {isSendPending ? (
              <li>
                <ChatBubble role="assistant">
                  {thinkingContent}
                </ChatBubble>
              </li>
            ) : null}
          </ChatTranscript>

          <ChatJumpToLatest visible={!isAtBottom} onClick={scrollToLatest} />

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
                      disabled={isSendPending}
                      onClick={() => {
                        if (pendingRevisionSend) {
                          void sendMessageStreaming(pendingRevisionSend.message, {
                            proposalRevision: pendingRevisionSend.proposalRevision,
                          });
                        }
                      }}
                    >
                      {isSendPending ? "Retrying…" : "Retry revision message"}
                    </Button>
                  </div>
                </div>
              ) : null}
              <ChatComposerAttachments
                attachments={composerAttachments}
                disabled={isSendPending}
                onAttachmentsChange={setComposerAttachments}
              />
              <div className="chat-composer-controls">
                <ChatComposerAttachmentInput
                  attachments={composerAttachments}
                  disabled={isSendPending}
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
                  rows={1}
                  value={draft}
                  placeholder={t("composerPlaceholder")}
                  disabled={isSendPending}
                  maxLength={MAX_CHAT_USER_MESSAGE_CHARS}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      shouldSendOnEnter({
                        key: event.key,
                        shiftKey: event.shiftKey,
                        isComposing: event.nativeEvent.isComposing,
                      })
                    ) {
                      event.preventDefault();
                      const form = event.currentTarget.form;
                      if (form) {
                        form.requestSubmit();
                      }
                    }
                  }}
                />
                <Button
                  type="submit"
                  className="button-coach chat-composer-controls__send"
                  disabled={sendDisabled || !primaryThreadId}
                  aria-label="Send message"
                >
                  {isSendPending ? (
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
            <div className="chat-composer-footer">
              <p className="chat-composer-disclaimer">
                {t("disclaimer")}
              </p>
              <p className="chat-composer-enter-hint" aria-hidden="true">
                {t("enterHint")}
              </p>
            </div>
          </ChatComposer>
        </>
      ) : null}
    </div>
  );
}
