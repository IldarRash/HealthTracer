import type { ChatMessage, ChatThread } from "@health/types";
import type { ChatMessageRow, ChatThreadRow } from "./chat.repository.js";

export function toChatThread(row: ChatThreadRow): ChatThread {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toChatMessage(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    threadId: row.threadId,
    role: row.role,
    content: row.content,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
  };
}
