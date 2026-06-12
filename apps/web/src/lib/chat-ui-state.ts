import type {
  ChatMessage,
  ChatThread,
  SuggestedQuickAction,
  WellbeingCrisisSupportCopy,
} from "@health/types";
import type { ChatMessageAttachmentPreview } from "./chat-message-attachments.js";
import {
  parseChatMessageSuggestedQuickActions,
  WELLBEING_CRISIS_SUPPORT_COPY,
  wellbeingCrisisEvaluationSchema,
} from "@health/types";
import {
  buildChatWeeklyReviewPackView,
  parseChatWeeklyReviewMetadata,
  WEEKLY_REVIEW_CHAT_PROMPT,
  type ChatWeeklyReviewPackView,
} from "./weekly-review-ui-state";

export type OptimisticChatMessage = {
  id: string;
  threadId: string;
  role: "user";
  content: string;
  createdAt: string;
  metadata: Record<string, unknown>;
  optimistic: true;
};

export type DisplayChatMessage = ChatMessage | OptimisticChatMessage;

export type SuggestedChatPrompt = {
  /** i18n key within Chat.suggestedPrompts namespace — resolved by the component. */
  labelKey: string;
  /** Message sent to the coach when the chip is selected. */
  message: string;
};

/**
 * Prompt chips for the chat empty state.
 * Labels are i18n keys (Chat.suggestedPrompts.*); messages are semantic backend prompts.
 */
export const SUGGESTED_CHAT_PROMPT_DEFINITIONS: readonly SuggestedChatPrompt[] = [
  {
    labelKey: "reviewWeekly",
    message: WEEKLY_REVIEW_CHAT_PROMPT,
  },
  {
    labelKey: "reviewWorkouts",
    message: "Review my workout week",
  },
  {
    labelKey: "adjustGoals",
    message: "Help me adjust my goals",
  },
  {
    labelKey: "nutritionPlan",
    message: "What's in my nutrition plan?",
  },
];

export function createOptimisticUserMessage(
  threadId: string,
  content: string,
  attachmentPreviews: readonly ChatMessageAttachmentPreview[] = [],
): OptimisticChatMessage {
  const trimmed = content.trim();

  return {
    id: `optimistic-${Date.now()}`,
    threadId,
    role: "user",
    content: trimmed,
    createdAt: new Date().toISOString(),
    metadata:
      attachmentPreviews.length > 0
        ? { optimisticAttachmentDisplays: attachmentPreviews }
        : {},
    optimistic: true,
  };
}

export function isOptimisticMessage(
  message: DisplayChatMessage,
): message is OptimisticChatMessage {
  return "optimistic" in message && message.optimistic === true;
}

export function resolvePrimaryThreadId(
  threads: readonly ChatThread[],
): string | null {
  if (threads.length === 0) {
    return null;
  }

  return [...threads].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  )[0]?.id ?? null;
}

export function mergeDisplayMessages(
  serverMessages: readonly ChatMessage[],
  optimisticMessage: OptimisticChatMessage | null,
): DisplayChatMessage[] {
  if (!optimisticMessage) {
    return [...serverMessages];
  }

  return [...serverMessages, optimisticMessage];
}

export function resolveChatMessageCrisisSupport(
  message: Pick<ChatMessage, "role" | "metadata">,
): WellbeingCrisisSupportCopy | null {
  if (message.role !== "assistant" || message.metadata.crisisBoundary !== true) {
    return null;
  }

  const parsed = wellbeingCrisisEvaluationSchema.safeParse(message.metadata.crisisSupport);
  if (parsed.success && parsed.data.shouldShowCrisisSupport && parsed.data.copy) {
    return parsed.data.copy;
  }

  return WELLBEING_CRISIS_SUPPORT_COPY;
}

/**
 * Resolve persisted quick-action chips from an assistant message's metadata
 * (metadata.suggestedQuickActions). The persisted metadata is the single source
 * of truth — the live turn renders its assistant message only after the thread
 * query refetch, so chips appear immediately on live turns AND survive a thread
 * reload. Returns null for user messages, missing/invalid metadata, and
 * turnError turns (the backend omits the key on those).
 */
export function resolveChatMessageSuggestedQuickActions(
  message: Pick<ChatMessage, "role" | "metadata">,
): SuggestedQuickAction[] | null {
  if (message.role !== "assistant") {
    return null;
  }

  return parseChatMessageSuggestedQuickActions(message.metadata);
}

export function resolveChatMessageWeeklyReview(
  message: Pick<ChatMessage, "role" | "metadata">,
): ChatWeeklyReviewPackView | null {
  if (message.role !== "assistant") {
    return null;
  }

  const metadata = parseChatWeeklyReviewMetadata(message.metadata);
  if (!metadata) {
    return null;
  }

  return buildChatWeeklyReviewPackView(metadata);
}
