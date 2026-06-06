import type {
  ChatMessage,
  ChatThread,
  WellbeingCrisisSupportCopy,
} from "@health/types";
import type { ChatMessageAttachmentPreview } from "./chat-message-attachments.js";
import {
  WELLBEING_CRISIS_SUPPORT_COPY,
  wellbeingCrisisEvaluationSchema,
} from "@health/types";
import {
  buildChatWeeklyReviewPackView,
  parseChatWeeklyReviewMetadata,
  WEEKLY_REVIEW_CHAT_PROMPT,
  type ChatWeeklyReviewPackView,
} from "./weekly-review-ui-state";
import { formatDateTimeMedium } from "./date-format";

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
  /** Short coach-forward label shown on the prompt chip. */
  label: string;
  /** Message sent to the coach when the chip is selected. */
  message: string;
};

export const CHAT_EMPTY_STATE_TITLE = "Start a conversation with your coach";

export const CHAT_EMPTY_STATE_DESCRIPTION =
  "Ask about your week, workouts, goals, nutrition, or how you're feeling.";

export const SUGGESTED_CHAT_PROMPTS: readonly SuggestedChatPrompt[] = [
  {
    label: "Review my weekly progress",
    message: WEEKLY_REVIEW_CHAT_PROMPT,
  },
  {
    label: "Review my workout week",
    message: "Review my workout week",
  },
  {
    label: "Help me adjust my goals",
    message: "Help me adjust my goals",
  },
  {
    label: "What's in my nutrition plan?",
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

export function formatChatTimestamp(value: string): string {
  return formatDateTimeMedium(value);
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
