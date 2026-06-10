import type {
  ChatTurnStreamEvent,
  ChatTurnStreamFinalEvent,
  ChatTurnStreamErrorEvent,
  ChatTurnStreamTurnAcceptedEvent,
} from "@health/types";

/**
 * Minimal response interface required by the stream writer.
 *
 * We do not import from the `express` package directly because it is a
 * transitive dependency (via @nestjs/platform-express) and may not have
 * separate @types/express installed. The NestJS @Res() decorator injects
 * the concrete platform response at runtime; using a structural interface
 * here keeps the type-check self-contained.
 */
export interface StreamableResponse {
  setHeader(name: string, value: string): void;
  flushHeaders(): void;
  write(chunk: string): boolean | void;
  end(): void;
  on(event: string, listener: () => void): void;
}

/**
 * ChatTurnStreamWriter
 *
 * Writes SSE (Server-Sent Events) frames to an HTTP response for a single
 * streaming chat turn. Manages headers, frame formatting, client-disconnect
 * detection, and close-on-complete.
 *
 * Design choices:
 *
 * - POST endpoint (not GET): SSE is semantically a GET, but the chat turn
 *   requires a body (message content, proposal revision, etc.). We use a POST
 *   and write raw SSE frames rather than NestJS @Sse() which is GET-only.
 *
 * - Client-disconnect handling: when the client disconnects we stop writing
 *   further events BUT the underlying ChatService.sendMessage promise continues
 *   to completion. This ensures the user message and any AI proposals are always
 *   persisted regardless of whether the client is still listening. The
 *   `isClientConnected` flag is set to `false` on the "close" event and checked
 *   before each write attempt.
 *
 * - Error frames: on a caught error we emit a generic `error` event with no
 *   internals (no stack trace, no health data) then close the stream. The
 *   ChatService error path handles its own persistence concerns — we do not
 *   add extra persistence here.
 *
 * - Frame format: `event:<kind>\ndata:<json>\n\n` — standard SSE. The client
 *   can use EventSource or a raw fetch with stream reading.
 */
export class ChatTurnStreamWriter {
  private isClientConnected = true;

  constructor(private readonly res: StreamableResponse) {}

  /**
   * Set SSE response headers and attach a close listener.
   * Must be called once before the first write.
   */
  open(): void {
    this.res.setHeader("Content-Type", "text/event-stream");
    this.res.setHeader("Cache-Control", "no-cache");
    this.res.setHeader("Connection", "keep-alive");
    // Instruct nginx / Railway to disable proxy buffering so frames reach the
    // client immediately without waiting for the response to complete.
    this.res.setHeader("X-Accel-Buffering", "no");
    this.res.flushHeaders();

    this.res.on("close", () => {
      this.isClientConnected = false;
    });
  }

  /** Write a `turn_accepted` event. */
  writeTurnAccepted(event: ChatTurnStreamTurnAcceptedEvent): void {
    this.writeEvent(event);
  }

  /** Write a stage progress event. */
  writeEvent(event: ChatTurnStreamEvent): void {
    if (!this.isClientConnected) {
      return;
    }

    try {
      const frame = `event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`;
      this.res.write(frame);
    } catch {
      // If the write fails (e.g. broken pipe after disconnect) mark as
      // disconnected so subsequent writes are skipped cleanly.
      this.isClientConnected = false;
    }
  }

  /** Write the final validated payload and end the stream. */
  writeFinal(event: ChatTurnStreamFinalEvent): void {
    this.writeEvent(event);
    this.close();
  }

  /** Write a generic error event (no internals) and end the stream. */
  writeError(event: ChatTurnStreamErrorEvent): void {
    // Attempt the write even if we think the client is gone — it may still
    // receive the error frame before the connection fully closes.
    try {
      const frame = `event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`;
      this.res.write(frame);
    } catch {
      // Ignore — the client may already be gone.
    }

    this.close();
  }

  private close(): void {
    try {
      this.res.end();
    } catch {
      // Already ended — safe to ignore.
    }
  }
}
