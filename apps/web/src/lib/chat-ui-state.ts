import type { ChatMessage, ChatThread } from "@health/types";

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

export const SUGGESTED_CHAT_PROMPTS = [
  "Review my workout week",
  "Help me adjust my goals",
  "What's in my nutrition plan?",
] as const;

export function createOptimisticUserMessage(
  threadId: string,
  content: string,
): OptimisticChatMessage {
  return {
    id: `optimistic-${Date.now()}`,
    threadId,
    role: "user",
    content,
    createdAt: new Date().toISOString(),
    metadata: {},
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
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
