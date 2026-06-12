import { parseChatMessageTurnError } from "@health/types";
import type { ChatTurnError } from "@health/types";
import type { DisplayChatMessage } from "./chat-ui-state.js";

/**
 * Resolve whether an assistant message has a turnError (decision_failed / reply_blocked).
 * Returns the parsed ChatTurnError if present and valid, null otherwise.
 *
 * turnError is the reply-ABSENT honest-failure contract (metadata.turnError) and the
 * single error-card path. Its counterpart, metadata.turnDegraded (reply PRESENT,
 * telemetry-only), is deliberately not consumed by the web UI — the persisted reply
 * is shown as-is.
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
