import type { ChatMessage, DirectChatPathMetadata, DirectChatPathRefreshHint } from "@health/types";
import { directChatPathMetadataSchema } from "@health/types";

export type ChatDirectPathFeedbackView = {
  message: string;
};

export function parseChatDirectPathMetadata(
  metadata: Record<string, unknown>,
): DirectChatPathMetadata | null {
  if (!("directPath" in metadata)) {
    return null;
  }

  const parsed = directChatPathMetadataSchema.safeParse(metadata.directPath);
  return parsed.success ? parsed.data : null;
}

export function resolveChatMessageDirectPathFeedback(
  message: Pick<ChatMessage, "role" | "content" | "metadata">,
): ChatDirectPathFeedbackView | null {
  if (message.role !== "assistant") {
    return null;
  }

  const directPath = parseChatDirectPathMetadata(message.metadata);
  const outcomeMessage = directPath?.outcome?.message?.trim();

  if (!outcomeMessage) {
    return null;
  }

  const trimmedContent = message.content.trim();
  if (trimmedContent.length > 0) {
    return null;
  }

  return { message: outcomeMessage };
}

export function getDirectChatPathRefreshHints(
  metadata: Record<string, unknown>,
): ReadonlyArray<DirectChatPathRefreshHint> {
  const directPath = parseChatDirectPathMetadata(metadata);
  return directPath?.outcome?.refreshHints ?? [];
}
