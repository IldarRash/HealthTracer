import { parseChatMessageDegradedTurn, parseChatMessageTurnError } from "@health/types";
import type { ChatMessageDegradedTurn, ChatTurnError } from "@health/types";
import type { DisplayChatMessage } from "./chat-ui-state.js";

/**
 * Resolve whether an assistant message represents a degraded turn.
 * Returns the parsed degraded-turn object if the message is an assistant message
 * with a valid turnDegraded metadata entry; null otherwise.
 */
export function resolveChatMessageDegradedTurn(
  message: Pick<DisplayChatMessage, "role" | "metadata">,
): ChatMessageDegradedTurn | null {
  if (message.role !== "assistant") {
    return null;
  }

  const meta = message.metadata;
  if (!meta || typeof meta !== "object") {
    return null;
  }

  return parseChatMessageDegradedTurn(meta as Record<string, unknown>);
}

/**
 * Resolve whether an assistant message has a turnError (decision_failed / reply_blocked).
 * Returns the parsed ChatTurnError if present and valid, null otherwise.
 * Distinct from the older turnDegraded path — turnError is the new honest-failure contract
 * stored in metadata.turnError.
 */
export function resolveChatMessageTurnError(
  message: Pick<DisplayChatMessage, "role" | "metadata">,
): ChatTurnError | null {
  if (message.role !== "assistant") {
    return null;
  }

  const meta = message.metadata;
  if (!meta || typeof meta !== "object") {
    return null;
  }

  return parseChatMessageTurnError(meta as Record<string, unknown>);
}

/**
 * Find the most recent user message that precedes the given index in the messages array.
 * Returns the message content if found, null otherwise.
 * Used by the error card to pre-fill the composer with the failed request.
 */
export function findPrecedingUserMessage(
  messages: readonly Pick<DisplayChatMessage, "role" | "content">[],
  index: number,
): string | null {
  for (let i = index - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg && msg.role === "user") {
      return typeof msg.content === "string" ? msg.content : null;
    }
  }

  return null;
}
