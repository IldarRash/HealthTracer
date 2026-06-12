/**
 * chat-stream.spec.ts
 *
 * Tests for the pure SSE-stream helpers in chat-stream.ts.
 *
 * Cycle-proof import: chatTurnStreamEventSchema is imported directly from
 * @health/types (which previously had a circular dep via index.ts ->
 * chat-turn-stream.ts -> index.ts). This import proving the cycle is gone is
 * intentional and must be kept.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { chatTurnStreamEventSchema } from "@health/types";
import {
  isUnparseableFinalFrame,
  parseSseFrames,
  parseChatStreamEvent,
  resolveStageCopy,
  shouldFallbackToSync,
  streamChatMessage,
  StreamError,
  type ChatTurnStreamEvent,
  type StreamFailureReason,
} from "./chat-stream";

// ---------------------------------------------------------------------------
// Cycle-proof: chatTurnStreamEventSchema must be importable from @health/types
// ---------------------------------------------------------------------------

describe("@health/types circular-dep regression", () => {
  it("chatTurnStreamEventSchema is importable from @health/types without throwing", () => {
    // If a circular dep exists in Zod v4, discriminatedUnion init throws during module load.
    // Reaching this assertion proves the cycle is resolved.
    expect(chatTurnStreamEventSchema).toBeDefined();
    expect(typeof chatTurnStreamEventSchema.safeParse).toBe("function");
  });

  it("chatTurnStreamEventSchema accepts a valid turn_accepted event", () => {
    const result = chatTurnStreamEventSchema.safeParse({
      kind: "turn_accepted",
      threadId: "thread-1",
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseSseFrames
// ---------------------------------------------------------------------------

describe("parseSseFrames", () => {
  it("parses a single complete frame", () => {
    const b = "data: {\"kind\":\"turn_accepted\"}\n\n";
    const { frames, remainder } = parseSseFrames(b);
    expect(frames).toHaveLength(1);
    expect(frames[0]?.data).toBe("{\"kind\":\"turn_accepted\"}");
    expect(remainder).toBe("");
  });

  it("returns partial chunk as remainder", () => {
    const b = "data: {\"kind\":\"stage\",\"stage\":\"routing\"}";
    const { frames, remainder } = parseSseFrames(b);
    expect(frames).toHaveLength(0);
    expect(remainder).toBe(b);
  });

  it("parses multiple frames in one chunk", () => {
    const b =
      "data: {\"kind\":\"turn_accepted\",\"threadId\":\"t1\"}\n\n" +
      "data: {\"kind\":\"error\",\"message\":\"x\"}\n\n";
    const { frames, remainder } = parseSseFrames(b);
    expect(frames).toHaveLength(2);
    expect(remainder).toBe("");
  });

  it("splits chunk with complete + partial frame", () => {
    const b =
      "data: {\"kind\":\"turn_accepted\",\"threadId\":\"t1\"}\n\n" +
      "data: {\"kind\":";
    const { frames, remainder } = parseSseFrames(b);
    expect(frames).toHaveLength(1);
    expect(remainder).toBe("data: {\"kind\":");
  });

  it("handles event: prefix lines", () => {
    const b = "event: message\ndata: {\"kind\":\"error\",\"message\":\"x\"}\n\n";
    const { frames } = parseSseFrames(b);
    expect(frames).toHaveLength(1);
    expect(frames[0]?.event).toBe("message");
    expect(frames[0]?.data).toBe("{\"kind\":\"error\",\"message\":\"x\"}");
  });

  it("returns empty frames and remainder for empty input", () => {
    const { frames, remainder } = parseSseFrames("");
    expect(frames).toHaveLength(0);
    expect(remainder).toBe("");
  });
});

// ---------------------------------------------------------------------------
// parseChatStreamEvent fixtures
// ---------------------------------------------------------------------------

const validThread = {
  id: "aaaaaaaa-0000-4000-a000-000000000001",
  userId: "aaaaaaaa-0000-4000-a000-000000000002",
  title: "Test",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};
const validMsg = {
  id: "aaaaaaaa-0000-4000-a000-000000000003",
  threadId: "aaaaaaaa-0000-4000-a000-000000000001",
  role: "user",
  content: "Hello",
  metadata: {},
  createdAt: "2024-01-01T00:00:00.000Z",
  attachments: [],
};
const validAsstMsg = {
  ...validMsg,
  id: "aaaaaaaa-0000-4000-a000-000000000004",
  role: "assistant",
};
const validResp = {
  thread: validThread,
  userMessage: validMsg,
  assistantMessage: validAsstMsg,
  proposals: [],
};

// ---------------------------------------------------------------------------
// parseChatStreamEvent
// ---------------------------------------------------------------------------

describe("parseChatStreamEvent", () => {
  it("returns null for invalid JSON", () => {
    expect(parseChatStreamEvent("not-json")).toBeNull();
  });

  it("returns null for unknown event kind", () => {
    expect(parseChatStreamEvent(JSON.stringify({ kind: "unknown" }))).toBeNull();
  });

  it("parses a turn_accepted event", () => {
    const e = parseChatStreamEvent(
      JSON.stringify({ kind: "turn_accepted", threadId: "t1" }),
    );
    expect(e).not.toBeNull();
    expect(e?.kind).toBe("turn_accepted");
  });

  it("parses a stage event", () => {
    const e = parseChatStreamEvent(
      JSON.stringify({ kind: "stage", stage: "routing" }),
    );
    expect(e).not.toBeNull();
    expect(e?.kind).toBe("stage");
  });

  it("parses a stage event with selectedDomains", () => {
    const e = parseChatStreamEvent(
      JSON.stringify({
        kind: "stage",
        stage: "domains_running",
        selectedDomains: ["workout", "nutrition"],
      }),
    );
    expect(e).not.toBeNull();
    if (e?.kind === "stage") {
      expect(e.selectedDomains).toEqual(["workout", "nutrition"]);
    }
  });

  it("parses a final event", () => {
    const e = parseChatStreamEvent(
      JSON.stringify({ kind: "final", response: validResp }),
    );
    expect(e).not.toBeNull();
    expect(e?.kind).toBe("final");
  });

  it("parses an error event", () => {
    const e = parseChatStreamEvent(
      JSON.stringify({ kind: "error", message: "boom" }),
    );
    expect(e).not.toBeNull();
    expect(e?.kind).toBe("error");
  });

  it("returns null for a stage with an unknown stage name", () => {
    expect(
      parseChatStreamEvent(JSON.stringify({ kind: "stage", stage: "bogus" })),
    ).toBeNull();
  });

  it("returns null for final event missing response field", () => {
    expect(parseChatStreamEvent(JSON.stringify({ kind: "final" }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveStageCopy
// ---------------------------------------------------------------------------

describe("resolveStageCopy", () => {
  it("returns Thinking for preprocessing", () => {
    const e = parseChatStreamEvent(
      JSON.stringify({ kind: "stage", stage: "preprocessing" }),
    );
    if (e?.kind !== "stage") throw new Error("unexpected");
    expect(resolveStageCopy(e)).toBe("Thinking…");
  });

  it("returns Thinking for routing", () => {
    const e = parseChatStreamEvent(
      JSON.stringify({ kind: "stage", stage: "routing" }),
    );
    if (e?.kind !== "stage") throw new Error("unexpected");
    expect(resolveStageCopy(e)).toBe("Thinking…");
  });

  it("returns generic coaching copy for domains_running with no domains", () => {
    const e = parseChatStreamEvent(
      JSON.stringify({ kind: "stage", stage: "domains_running" }),
    );
    if (e?.kind !== "stage") throw new Error("unexpected");
    expect(resolveStageCopy(e)).toBe("Consulting your coach…");
  });

  it("lists domain name for domains_running with one domain", () => {
    const e = parseChatStreamEvent(
      JSON.stringify({ kind: "stage", stage: "domains_running", selectedDomains: ["workout"] }),
    );
    if (e?.kind !== "stage") throw new Error("unexpected");
    expect(resolveStageCopy(e)).toBe("Consulting your workout coach…");
  });

  it("joins multiple domains with comma", () => {
    const e = parseChatStreamEvent(
      JSON.stringify({
        kind: "stage",
        stage: "domains_running",
        selectedDomains: ["nutrition", "health"],
      }),
    );
    if (e?.kind !== "stage") throw new Error("unexpected");
    expect(resolveStageCopy(e)).toBe("Consulting your nutrition, health coach…");
  });

  it("returns synthesis copy", () => {
    const e = parseChatStreamEvent(
      JSON.stringify({ kind: "stage", stage: "synthesis" }),
    );
    if (e?.kind !== "stage") throw new Error("unexpected");
    expect(resolveStageCopy(e)).toBe("Putting your answer together…");
  });

  it("returns safety copy for validating", () => {
    const e = parseChatStreamEvent(
      JSON.stringify({ kind: "stage", stage: "validating" }),
    );
    if (e?.kind !== "stage") throw new Error("unexpected");
    expect(resolveStageCopy(e)).toBe("Double-checking safety…");
  });
});

// ---------------------------------------------------------------------------
// shouldFallbackToSync
// ---------------------------------------------------------------------------

describe("shouldFallbackToSync", () => {
  const fallbackReasons: StreamFailureReason[] = [
    "http_error",
    "stream_error_event",
    "no_final_event",
    "read_error",
  ];
  for (const reason of fallbackReasons) {
    it("returns true for reason " + JSON.stringify(reason), () => {
      expect(shouldFallbackToSync(reason)).toBe(true);
    });
  }

  it("returns false for final_unparseable — the backend turn succeeded, a re-send buys a duplicate paid turn", () => {
    expect(shouldFallbackToSync("final_unparseable")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// StreamError
// ---------------------------------------------------------------------------

describe("StreamError", () => {
  it("sets message and reason correctly", () => {
    const err = new StreamError("oops", "http_error");
    expect(err.message).toBe("oops");
    expect(err.reason).toBe("http_error");
    expect(err.name).toBe("StreamError");
    expect(err instanceof Error).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Fix 2 regression: shouldFallbackToSync known limitation
// ---------------------------------------------------------------------------
//
// shouldFallbackToSync("read_error") returns true. A late read_error can fire
// AFTER a `final` event has already been received. Callers MUST guard against
// this by checking whether finalTurn is set before consulting shouldFallbackToSync.
// If finalTurn is non-null, the turn succeeded — no fallback should run.
//
// This block documents the guard contract with explicit assertions.

describe("Fix 2 — shouldFallbackToSync known limitation", () => {
  it("shouldFallbackToSync(read_error) returns true — caller must check finalTurn first", () => {
    // shouldFallbackToSync is unaware of whether a final event was received.
    // It always returns true for read_error. The caller (sendMessageStreaming in
    // chat-workspace.tsx) must check finalTurn !== null before calling this.
    expect(shouldFallbackToSync("read_error")).toBe(true);
  });

  it("parseChatStreamEvent for a valid final event produces a non-null result (simulates finalTurn being set)", () => {
    // Simulates: final event arrives, onEvent fires, finalTurn is set.
    // Even if a subsequent read_error fires, the guard `if (finalTurn !== null)`
    // must short-circuit and apply the turn, NOT fall back.
    const event = parseChatStreamEvent(
      JSON.stringify({ kind: "final", response: validResp }),
    );
    // finalTurn equivalent is non-null — the sync fallback must NOT run.
    expect(event).not.toBeNull();
    expect(event?.kind).toBe("final");
  });

  it("late read_error + non-null finalTurn: guard prevents duplicate — shouldFallbackToSync must NOT be consulted", () => {
    // This test documents the invariant from the chat-workspace fix:
    //   finalTurn !== null => apply and return, regardless of shouldFallbackToSync.
    //
    // We cannot test the React hook directly here, but we can verify the pure
    // pieces: finalTurn is set by parseChatStreamEvent, shouldFallbackToSync
    // would return true for read_error, but the guard must override it.
    const finalEvent = parseChatStreamEvent(
      JSON.stringify({ kind: "final", response: validResp }),
    );
    const finalTurn = finalEvent?.kind === "final" ? finalEvent.response : null;

    // If finalTurn is set, the workspace applies it and returns — never reaches
    // shouldFallbackToSync. Verified by the non-null assertion below.
    expect(finalTurn).not.toBeNull();

    // shouldFallbackToSync would still return true if asked — but the guard
    // ensures it is never reached when finalTurn is set.
    const wouldFallBack = shouldFallbackToSync("read_error");
    expect(wouldFallBack).toBe(true); // confirms the danger — guard is essential
  });
});

// ---------------------------------------------------------------------------
// final_unparseable — a final frame ARRIVED but failed schema validation.
// The backend turn succeeded and was persisted; falling back to the sync
// endpoint would re-run the turn and bill a duplicate LLM call.
// ---------------------------------------------------------------------------

describe("isUnparseableFinalFrame", () => {
  it("returns true for a kind=final frame that fails schema validation", () => {
    expect(isUnparseableFinalFrame(JSON.stringify({ kind: "final" }))).toBe(true);
    expect(
      isUnparseableFinalFrame(
        JSON.stringify({ kind: "final", response: { not: "a turn" } }),
      ),
    ).toBe(true);
  });

  it("returns false for non-final frames and invalid JSON", () => {
    expect(isUnparseableFinalFrame(JSON.stringify({ kind: "stage", stage: "bogus" }))).toBe(false);
    expect(isUnparseableFinalFrame("not-json")).toBe(false);
    expect(isUnparseableFinalFrame(JSON.stringify(null))).toBe(false);
  });
});

describe("streamChatMessage — final frame handling", () => {
  function sseFetchResponse(frames: string[]) {
    const encoder = new TextEncoder();
    const chunks = frames.map((frame) => encoder.encode(frame));
    let index = 0;

    return {
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: async () =>
            index < chunks.length
              ? { done: false, value: chunks[index++] }
              : { done: true, value: undefined },
          cancel: async () => undefined,
        }),
      },
    };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects with final_unparseable when the final frame arrives but fails validation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseFetchResponse([
          `data: ${JSON.stringify({ kind: "stage", stage: "routing" })}\n\n`,
          `data: ${JSON.stringify({ kind: "final", response: { broken: true } })}\n\n`,
        ]),
      ),
    );

    const events: ChatTurnStreamEvent[] = [];

    const failure = await streamChatMessage({
      token: "t",
      threadId: "thread-1",
      body: { content: "hi" },
      onEvent: (event) => events.push(event),
    }).then(
      () => null,
      (err: unknown) => err,
    );

    expect(failure).toBeInstanceOf(StreamError);
    expect((failure as StreamError).reason).toBe("final_unparseable");
    // The duplicate-turn guard: this reason must NOT fall back to sync.
    expect(shouldFallbackToSync((failure as StreamError).reason)).toBe(false);
    // Stage events before the broken final frame were still delivered.
    expect(events.map((event) => event.kind)).toEqual(["stage"]);
  });

  it("resolves and delivers the final event when the final frame is valid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseFetchResponse([
          `data: ${JSON.stringify({ kind: "final", response: validResp })}\n\n`,
        ]),
      ),
    );

    const events: ChatTurnStreamEvent[] = [];

    await streamChatMessage({
      token: "t",
      threadId: "thread-1",
      body: { content: "hi" },
      onEvent: (event) => events.push(event),
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("final");
  });

  it("still rejects with no_final_event when the stream ends without any final frame", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseFetchResponse([
          `data: ${JSON.stringify({ kind: "stage", stage: "routing" })}\n\n`,
        ]),
      ),
    );

    const failure = await streamChatMessage({
      token: "t",
      threadId: "thread-1",
      body: { content: "hi" },
      onEvent: () => undefined,
    }).then(
      () => null,
      (err: unknown) => err,
    );

    expect(failure).toBeInstanceOf(StreamError);
    expect((failure as StreamError).reason).toBe("no_final_event");
    expect(shouldFallbackToSync((failure as StreamError).reason)).toBe(true);
  });
});