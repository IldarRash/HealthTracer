/**
 * chat-stream.ts — Pure helpers for consuming the chat-turn SSE stream.
 *
 * These are extracted as testable, DOM-free functions:
 *   - parseSseFrames:       parse SSE frames from a raw text chunk (accumulated buffer)
 *   - parseChatStreamEvent: validate a single parsed frame
 *   - resolveStageCopy:     map a stage event to coaching-toned progress copy
 *   - shouldFallbackToSync: decide when a stream failure should fall back to the sync path
 *   - streamChatMessage:    fetch + stream an SSE chat turn, invoking onEvent per event
 *   - buildStreamChatMessageBody: build the request body for the stream endpoint
 *
 * Privacy floor: this module never logs event data payloads — only structural
 * metadata (frame counts, event kind). The `final` event carries reply text and
 * proposals which must reach the component layer via onEvent, never console.
 */

import {
  chatTurnStreamEventSchema,
  sendChatMessageSchema,
  type ChatTurnResponse,
  type ChatTurnStreamEvent,
  type ChatTurnStreamStageEvent,
  type RouterDomain,
} from "@health/types";
import { clientApiBaseUrl } from "../env";
import {
  REQUEST_ID_HEADER,
  createRequestId,
} from "./request-correlation";

// Re-export types consumed by the chat workspace component.
export type { ChatTurnStreamEvent };

// ---------------------------------------------------------------------------
// SSE frame parser
// ---------------------------------------------------------------------------

export type ParsedSseFrame = {
  event?: string;
  data: string;
};

/**
 * parseSseFrames — split a text buffer on double-newlines into SSE frames.
 *
 * Returns an array of parsed frames and the remaining (incomplete) buffer
 * suffix that has not yet been terminated with `\n\n`.
 *
 * Handles:
 * - Multiple frames in one chunk
 * - Partial chunks (buffer returned as remainder)
 * - Lines without a recognized field prefix (ignored)
 * - Multi-line data values (joined by LF, though the backend always sends
 *   single-line JSON data)
 */
export function parseSseFrames(buffer: string): {
  frames: ParsedSseFrame[];
  remainder: string;
} {
  const frames: ParsedSseFrame[] = [];
  // Split on double newline — each block is one SSE event.
  const blocks = buffer.split(/\n\n/);
  // The last block may be incomplete; keep it as the remainder.
  const remainder = blocks.pop() ?? "";

  for (const block of blocks) {
    if (!block.trim()) {
      continue;
    }

    let event: string | undefined;
    const dataParts: string[] = [];

    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) {
        event = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        dataParts.push(line.slice("data:".length).trimStart());
      }
      // ignore comment lines (`:`) and other fields like `id:`
    }

    if (dataParts.length > 0) {
      frames.push({ event, data: dataParts.join("\n") });
    }
  }

  return { frames, remainder };
}

// ---------------------------------------------------------------------------
// Event validation
// ---------------------------------------------------------------------------

/**
 * parseChatStreamEvent — attempt to parse and validate a single SSE data
 * string. Returns the typed event or null if validation fails.
 *
 * Invalid frames are dropped silently (console.debug only, no throw) so that
 * a single malformed frame does not break the stream.
 */
export function parseChatStreamEvent(data: string): ChatTurnStreamEvent | null {
  let json: unknown;

  try {
    json = JSON.parse(data);
  } catch {
    console.debug("[chat-stream] invalid JSON frame — skipping");
    return null;
  }

  const result = chatTurnStreamEventSchema.safeParse(json);
  if (!result.success) {
    console.debug("[chat-stream] unknown event shape — skipping");
    return null;
  }

  return result.data;
}

/**
 * isUnparseableFinalFrame — true when an SSE data string IS a `final` frame
 * (kind === "final") but failed full schema validation.
 *
 * This case is fundamentally different from a missing final event: the backend
 * turn SUCCEEDED and was persisted — only the client-side contract parse of the
 * payload failed. Re-sending through the sync endpoint would run a second paid
 * LLM turn for the same message, so this must never trigger the sync fallback.
 */
export function isUnparseableFinalFrame(data: string): boolean {
  try {
    const json: unknown = JSON.parse(data);
    return (
      typeof json === "object" &&
      json !== null &&
      (json as { kind?: unknown }).kind === "final"
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Stage → coaching-toned copy
// ---------------------------------------------------------------------------

const DOMAIN_DISPLAY_NAMES: Record<RouterDomain, string> = {
  workout: "workout",
  nutrition: "nutrition",
  health: "health",
};

/**
 * resolveStageCopy — map a stage event to a coaching-toned progress label
 * shown in the UI while a streaming turn is in flight.
 *
 * Copy is in English, consistent with the rest of the English UI strings.
 */
export function resolveStageCopy(event: ChatTurnStreamStageEvent): string {
  switch (event.stage) {
    case "preprocessing":
      return "Thinking…";
    case "routing":
      return "Thinking…";
    case "domains_running": {
      const domains = event.selectedDomains ?? [];
      if (domains.length === 0) {
        return "Consulting your coach…";
      }
      const names = domains
        .map((d) => DOMAIN_DISPLAY_NAMES[d as RouterDomain] ?? d)
        .join(", ");
      return `Consulting your ${names} coach…`;
    }
    case "synthesis":
      return "Putting your answer together…";
    case "validating":
      return "Double-checking safety…";
    default: {
      // TypeScript exhaustive narrowing guard
      const _exhaustive: never = event.stage;
      return String(_exhaustive);
    }
  }
}

// ---------------------------------------------------------------------------
// Fallback decision
// ---------------------------------------------------------------------------

export type StreamFailureReason =
  | "http_error"
  | "stream_error_event"
  | "no_final_event"
  | "final_unparseable"
  | "read_error";

/**
 * shouldFallbackToSync — return true when the given failure reason warrants
 * an automatic retry through the sync endpoint.
 *
 * Every transport-level failure falls back, keeping the chat unbreakable.
 *
 * The one exception is `final_unparseable`: the final frame ARRIVED, so the
 * backend turn succeeded and was persisted — only the client-side schema parse
 * failed. Re-sending would buy a duplicate paid LLM turn; the caller should
 * instead refetch the thread (the tolerant contract reveals the persisted turn).
 *
 * Known limitation: this function returns true even for `read_error`, which
 * can fire as a late stream-close race AFTER the `final` event has already
 * been received and applied. Callers MUST check whether `finalTurn` is
 * already set before consulting this function. If `finalTurn` is non-null,
 * the sync fallback must NOT run regardless of what this function returns —
 * falling back after a successful final event produces duplicate messages.
 * See the `sendMessageStreaming` implementation in `chat-workspace.tsx`.
 */
export function shouldFallbackToSync(reason: StreamFailureReason): boolean {
  return reason !== "final_unparseable";
}

// ---------------------------------------------------------------------------
// Streaming fetch
// ---------------------------------------------------------------------------

export type ChatStreamOptions = {
  token: string;
  threadId: string;
  body: Record<string, unknown>;
  onEvent: (event: ChatTurnStreamEvent) => void;
  signal?: AbortSignal;
};

/**
 * streamChatMessage — POST to the streaming endpoint and invoke onEvent for
 * each valid SSE event.
 *
 * Rejects when:
 * - HTTP response is not OK → `StreamError` with reason `http_error`
 * - stream produces an `error` event → `StreamError` with reason `stream_error_event`
 * - stream ends without a `final` event → `StreamError` with reason `no_final_event`
 * - a `final` frame arrives but fails schema validation → `StreamError` with
 *   reason `final_unparseable` (backend turn succeeded — must NOT re-send)
 * - ReadableStream read throws → `StreamError` with reason `read_error`
 *
 * The consumer (ChatWorkspace) catches these and consults shouldFallbackToSync
 * before retrying through the sync path.
 */
export class StreamError extends Error {
  constructor(
    message: string,
    public readonly reason: StreamFailureReason,
  ) {
    super(message);
    this.name = "StreamError";
  }
}

export async function streamChatMessage(options: ChatStreamOptions): Promise<void> {
  const { token, threadId, body, onEvent, signal } = options;
  const requestId = createRequestId();

  let response: Response;
  try {
    response = await fetch(
      `${clientApiBaseUrl}/chat/threads/${threadId}/messages/stream`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          [REQUEST_ID_HEADER]: requestId,
        },
        body: JSON.stringify(body),
        signal,
      },
    );
  } catch (err) {
    // AbortError is rethrown as-is so callers can detect intentional cancellation.
    if (err instanceof Error && err.name === "AbortError") {
      throw err;
    }
    throw new StreamError("Network error connecting to stream", "read_error");
  }

  if (!response.ok) {
    throw new StreamError(
      `Stream endpoint returned ${response.status}`,
      "http_error",
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new StreamError("Response body is not readable", "read_error");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let receivedFinal = false;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const { frames, remainder } = parseSseFrames(buffer);
      buffer = remainder;

      for (const frame of frames) {
        const event = parseChatStreamEvent(frame.data);
        if (!event) {
          // A final frame that arrived but failed validation means the backend
          // turn succeeded — surface it as its own non-fallback failure reason.
          if (isUnparseableFinalFrame(frame.data)) {
            throw new StreamError(
              "Final event failed schema validation",
              "final_unparseable",
            );
          }
          continue;
        }

        onEvent(event);

        if (event.kind === "final") {
          receivedFinal = true;
        }

        if (event.kind === "error") {
          throw new StreamError(event.message, "stream_error_event");
        }
      }
    }
  } catch (err) {
    reader.cancel().catch(() => undefined);
    if (err instanceof StreamError) {
      throw err;
    }
    throw new StreamError("Error reading stream", "read_error");
  }

  if (!receivedFinal) {
    throw new StreamError(
      "Stream ended without a final event",
      "no_final_event",
    );
  }
}

// ---------------------------------------------------------------------------
// Typed SSE body builder — mirrors sendChatMessage in api.ts
// ---------------------------------------------------------------------------

/**
 * buildStreamChatMessageBody — build and validate the request body for the
 * streaming endpoint. Uses the same sendChatMessageSchema as the sync path
 * to guarantee shape parity.
 */
export function buildStreamChatMessageBody(
  content: string,
  options?: {
    proposalRevision?: unknown;
    attachmentRefIds?: string[];
  },
): Record<string, unknown> {
  return sendChatMessageSchema.parse({
    content,
    ...(options?.proposalRevision ? { proposalRevision: options.proposalRevision } : {}),
    ...(options?.attachmentRefIds?.length
      ? { attachmentRefIds: options.attachmentRefIds }
      : {}),
  }) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Re-export ChatTurnResponse type for consumers of the final event
// ---------------------------------------------------------------------------
export type { ChatTurnResponse };
