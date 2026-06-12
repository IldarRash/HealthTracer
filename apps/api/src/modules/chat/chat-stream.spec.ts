/**
 * Streaming endpoint integration tests (Slice 3)
 *
 * Tests cover:
 *  1. Streaming endpoint emits turn_accepted → stage sequence → final with the
 *     same payload shape as the sync endpoint (ChatTurnResponse).
 *  2. Error path emits a generic `error` event and does not throw.
 *  3. Client-disconnect path: sendMessage continues to completion so persistence
 *     still happens, and no write-after-close errors occur.
 *  4. ChatService.sendMessage passes onProgress to AiService and emits
 *     preprocessing + validating stages.
 */

import { describe, it, expect, vi } from "vitest";
import type { ChatTurnStreamEvent, ProgressReporter } from "@health/types";
import { ChatTurnStreamWriter } from "./chat-turn-stream-writer.js";
import { ChatController } from "./chat.controller.js";
import { ChatService } from "./chat.service.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// These fixtures use Date objects because chat.mapper.ts calls .toISOString()
// on createdAt/updatedAt (they are Date columns from Drizzle).
const FIXTURE_DATE = new Date("2026-01-01T00:00:00.000Z");

const thread = {
  id: "24b19287-75b8-4a3e-9c10-691908479405",
  userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
  title: "Test thread",
  createdAt: FIXTURE_DATE,
  updatedAt: FIXTURE_DATE,
};

const userMessage = {
  id: "msg-user-0001",
  threadId: thread.id,
  role: "user" as const,
  content: "Adjust my workout",
  metadata: {},
  createdAt: FIXTURE_DATE,
  attachments: [],
};

const assistantMessage = {
  id: "msg-assistant-0001",
  threadId: thread.id,
  role: "assistant" as const,
  content: "Here is your updated plan.",
  metadata: {},
  createdAt: FIXTURE_DATE,
  attachments: [],
};

const mockChatTurnResponse = {
  thread,
  userMessage,
  assistantMessage,
  proposals: [],
};

const validInput = { content: "Adjust my workout" };

const auth = {
  clerkUserId: "user_123",
  displayName: "Test User",
  email: "test@example.com",
};

/**
 * Build a mock Response that captures SSE frames written to it.
 * Returns the mock and a helper to get all parsed events.
 */
function buildMockResponse() {
  const frames: string[] = [];
  let closed = false;
  const listeners: Record<string, Array<() => void>> = {};

  const res = {
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn((chunk: string) => {
      if (!closed) {
        frames.push(chunk);
      }
    }),
    end: vi.fn(() => {
      closed = true;
    }),
    on: vi.fn((event: string, fn: () => void) => {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(fn);
    }),
  };

  function emitClose() {
    (listeners["close"] ?? []).forEach((fn) => fn());
  }

  function parsedEvents(): ChatTurnStreamEvent[] {
    return frames
      .map((frame) => {
        // Extract data line: "event: kind\ndata: <json>\n\n"
        const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
        if (!dataLine) return null;
        try {
          return JSON.parse(dataLine.slice(6)) as ChatTurnStreamEvent;
        } catch {
          return null;
        }
      })
      .filter((e): e is ChatTurnStreamEvent => e !== null);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { res: res as unknown as any, emitClose, parsedEvents, frames };
}

// ---------------------------------------------------------------------------
// ChatTurnStreamWriter unit tests
// ---------------------------------------------------------------------------

describe("ChatTurnStreamWriter", () => {
  it("sets SSE headers on open()", () => {
    const { res } = buildMockResponse();
    const writer = new ChatTurnStreamWriter(res);
    writer.open();

    expect((res as unknown as { setHeader: ReturnType<typeof vi.fn> }).setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "text/event-stream",
    );
    expect((res as unknown as { setHeader: ReturnType<typeof vi.fn> }).setHeader).toHaveBeenCalledWith(
      "X-Accel-Buffering",
      "no",
    );
  });

  it("writes a turn_accepted frame with correct SSE format", () => {
    const { res, frames } = buildMockResponse();
    const writer = new ChatTurnStreamWriter(res);
    writer.open();
    writer.writeTurnAccepted({ kind: "turn_accepted", threadId: "thread-001" });

    expect(frames).toHaveLength(1);
    expect(frames[0]).toContain("event: turn_accepted");
    expect(frames[0]).toContain('"kind":"turn_accepted"');
    expect(frames[0]).toContain('"threadId":"thread-001"');
  });

  it("writes a stage frame and keeps the stream open", () => {
    const { res, parsedEvents } = buildMockResponse();
    const writer = new ChatTurnStreamWriter(res);
    writer.open();
    writer.writeEvent({ kind: "stage", stage: "routing" });

    const events = parsedEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "stage", stage: "routing" });
    expect((res as unknown as { end: ReturnType<typeof vi.fn> }).end).not.toHaveBeenCalled();
  });

  it("writeFinal writes the event and ends the stream", () => {
    const { res, parsedEvents } = buildMockResponse();
    const writer = new ChatTurnStreamWriter(res);
    writer.open();
    writer.writeFinal({ kind: "final", response: mockChatTurnResponse as never });

    const events = parsedEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("final");
    expect((res as unknown as { end: ReturnType<typeof vi.fn> }).end).toHaveBeenCalled();
  });

  it("writeError writes the event and ends the stream", () => {
    const { res, parsedEvents } = buildMockResponse();
    const writer = new ChatTurnStreamWriter(res);
    writer.open();
    writer.writeError({ kind: "error", message: "Something went wrong." });

    const events = parsedEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("error");
    expect((res as unknown as { end: ReturnType<typeof vi.fn> }).end).toHaveBeenCalled();
  });

  it("skips writes after client disconnects (close event)", () => {
    const { res, emitClose, frames } = buildMockResponse();
    const writer = new ChatTurnStreamWriter(res);
    writer.open();
    emitClose();
    writer.writeEvent({ kind: "stage", stage: "synthesis" });

    // Only the flushHeaders setup happened — no frames written after close.
    expect(frames).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// ChatController streaming endpoint integration tests
// ---------------------------------------------------------------------------

describe("ChatController — POST :threadId/messages/stream", () => {
  function buildController(chatService: Partial<ChatService>): ChatController {
    return new ChatController(chatService as ChatService);
  }

  it("emits turn_accepted → stage events → final in order", async () => {
    const capturedStages: string[] = [];

    const chatService: Partial<ChatService> = {
      sendMessage: vi.fn().mockImplementation(
        async (
          _auth: unknown,
          _threadId: string,
          _input: unknown,
          onProgress: ProgressReporter,
        ) => {
          // Simulate stage emissions from the pipeline
          onProgress({ kind: "stage", stage: "preprocessing" });
          onProgress({ kind: "stage", stage: "routing" });
          onProgress({ kind: "stage", stage: "domains_running", selectedDomains: ["workout"] });
          onProgress({ kind: "stage", stage: "synthesis" });
          onProgress({ kind: "stage", stage: "validating" });
          return mockChatTurnResponse;
        },
      ),
    };

    const controller = buildController(chatService);
    const { res, parsedEvents } = buildMockResponse();

    await controller.sendMessageStream(auth, thread.id, validInput, res);

    const events = parsedEvents();
    expect(events[0]?.kind).toBe("turn_accepted");
    expect(events[events.length - 1]?.kind).toBe("final");

    const stageEvents = events.filter((e) => e.kind === "stage");
    for (const e of stageEvents) {
      if (e.kind === "stage") {
        capturedStages.push(e.stage);
      }
    }

    expect(capturedStages).toContain("preprocessing");
    expect(capturedStages).toContain("routing");
    expect(capturedStages).toContain("domains_running");
    expect(capturedStages).toContain("synthesis");
    expect(capturedStages).toContain("validating");
  });

  it("final event carries the same payload shape as the sync endpoint", async () => {
    const chatService: Partial<ChatService> = {
      sendMessage: vi.fn().mockResolvedValue(mockChatTurnResponse),
    };

    const controller = buildController(chatService);
    const { res, parsedEvents } = buildMockResponse();

    await controller.sendMessageStream(auth, thread.id, validInput, res);

    const events = parsedEvents();
    const finalEvent = events.find((e) => e.kind === "final");
    expect(finalEvent).toBeDefined();
    expect(finalEvent?.kind).toBe("final");
    if (finalEvent?.kind === "final") {
      expect(finalEvent.response).toMatchObject({
        thread: expect.objectContaining({ id: thread.id }),
        userMessage: expect.objectContaining({ role: "user" }),
        assistantMessage: expect.objectContaining({ role: "assistant" }),
        proposals: [],
      });
    }
  });

  it("emits a generic error event when sendMessage throws", async () => {
    const chatService: Partial<ChatService> = {
      sendMessage: vi.fn().mockRejectedValue(new Error("Database connection lost")),
    };

    const controller = buildController(chatService);
    const { res, parsedEvents } = buildMockResponse();

    await controller.sendMessageStream(auth, thread.id, validInput, res);

    const events = parsedEvents();
    const errorEvent = events.find((e) => e.kind === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent?.kind).toBe("error");
    // The error message must be generic — no internals exposed
    if (errorEvent?.kind === "error") {
      expect(errorEvent.message).not.toContain("Database connection lost");
      expect(errorEvent.message).toBeTruthy();
    }
  });

  it("does not include raw error internals in the error event message", async () => {
    const sensitiveError = new Error("SELECT * FROM user_health_data WHERE userId = 'secret'");
    const chatService: Partial<ChatService> = {
      sendMessage: vi.fn().mockRejectedValue(sensitiveError),
    };

    const controller = buildController(chatService);
    const { res, parsedEvents } = buildMockResponse();

    await controller.sendMessageStream(auth, thread.id, validInput, res);

    const events = parsedEvents();
    const errorEvent = events.find((e) => e.kind === "error");
    if (errorEvent?.kind === "error") {
      expect(errorEvent.message).not.toContain("SELECT");
      expect(errorEvent.message).not.toContain("user_health_data");
    }
  });

  it("client-disconnect does not crash the controller: sendMessage continues to completion", async () => {
    let persistenceCalled = false;

    const chatService: Partial<ChatService> = {
      sendMessage: vi.fn().mockImplementation(
        async (
          _auth: unknown,
          _threadId: string,
          _input: unknown,
          _onProgress: ProgressReporter,
        ) => {
          // Simulate async work (persistence) after the client might disconnect
          await Promise.resolve();
          persistenceCalled = true;
          return mockChatTurnResponse;
        },
      ),
    };

    const controller = buildController(chatService);
    const { res, emitClose } = buildMockResponse();

    // Open the stream and immediately simulate client disconnect
    // (before sendMessage completes)
    const streamPromise = controller.sendMessageStream(auth, thread.id, validInput, res);
    emitClose();
    await streamPromise;

    // sendMessage ran to completion despite the disconnect
    expect(persistenceCalled).toBe(true);
    // No uncaught errors — the stream just ended
  });

  it("emits a turn_accepted event at the start even if later stages fail", async () => {
    const chatService: Partial<ChatService> = {
      sendMessage: vi.fn().mockRejectedValue(new Error("AI pipeline failed")),
    };

    const controller = buildController(chatService);
    const { res, parsedEvents } = buildMockResponse();

    await controller.sendMessageStream(auth, thread.id, validInput, res);

    const events = parsedEvents();
    expect(events[0]?.kind).toBe("turn_accepted");
  });

  it("Fix 1: invalid body throws BadRequestException BEFORE the SSE stream is opened (no SSE headers written)", async () => {
    // This test verifies the Fix 1 invariant: parseBody runs before writer.open(),
    // so an invalid body never results in a flushed 200 SSE response that is then
    // left unterminated.
    const chatService: Partial<ChatService> = {
      sendMessage: vi.fn(),
    };

    const controller = buildController(chatService);
    const { res } = buildMockResponse();
    const mockRes = res as unknown as {
      setHeader: ReturnType<typeof vi.fn>;
      flushHeaders: ReturnType<typeof vi.fn>;
    };

    // Send a body that fails sendChatMessageSchema (missing `content` field)
    const invalidBody = { notContent: "oops" };

    let thrownError: unknown;
    try {
      await controller.sendMessageStream(auth, thread.id, invalidBody, res);
    } catch (err) {
      thrownError = err;
    }

    // The exception must be propagated (BadRequestException from parseBody)
    expect(thrownError).toBeDefined();

    // Critically: SSE headers must NOT have been written — the stream was never opened
    expect(mockRes.setHeader).not.toHaveBeenCalled();
    expect(mockRes.flushHeaders).not.toHaveBeenCalled();

    // chatService must not have been called
    expect(chatService.sendMessage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// ChatService.sendMessage — onProgress threading tests
// ---------------------------------------------------------------------------

describe("ChatService.sendMessage — onProgress threading", () => {
  const noopProposalValidation = {
    validateRawProposal: () => ({ valid: true, errors: [] }),
    validateCorrelationEvidenceOwnership: async () => [],
    validateProvenanceOwnership: async () => [],
    validateProgressLinkedProvenanceRequired: () => [],
    validateGoalProposalHierarchy: async () => [],
    validateTodayChecklistGoalSourceRefs: async () => [],
    validateRecoveryAwareWorkoutAdaptation: async () => [],
    validateHabitProposalContext: async () => [],
    validateWellbeingCheckinProposalContext: async () => [],
    validateNutritionIncidentImageRefOwnership: async () => [],
    validateRecipeRecommendationProposalContext: async () => [],
    validateChatAttachmentProposalRefs: async () => [],
  };

  const baseUser = {
    id: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
    displayName: "Test User",
    email: "test@example.com",
    timezone: "UTC",
    locale: "en",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  function buildMockMessage(role: "user" | "assistant", id: string) {
    return {
      id,
      threadId: thread.id,
      role,
      content: "Test content",
      metadata: {},
      createdAt: FIXTURE_DATE,
    };
  }

  function buildChatService(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    aiGenerateResponse: (onProgress: ProgressReporter | undefined) => Promise<any>,
  ) {
    const aiService = {
      generateCoachResponse: vi.fn().mockImplementation(
        (input: { onProgress?: ProgressReporter }) => aiGenerateResponse(input.onProgress),
      ),
    };

    return new ChatService(
      {
        findThreadById: vi.fn().mockResolvedValue(thread),
        listMessagesByThreadId: vi.fn().mockResolvedValue([]),
        createMessage: vi.fn().mockImplementation(
          (_threadId: string, role: "user" | "assistant", _content: string) =>
            Promise.resolve(buildMockMessage(role, role === "user" ? "user-msg-id" : "asst-msg-id")),
        ),
        createProposal: vi.fn().mockResolvedValue({ id: "prop-001" }),
        touchThread: vi.fn().mockResolvedValue(undefined),
        findThreadById_forUpdate: vi.fn().mockResolvedValue(thread),
      } as never,
      { resolveFromAuth: vi.fn().mockResolvedValue(baseUser) } as never,
      aiService as never,
      noopProposalValidation as never,
      { normalizeProposal: async (_intent: unknown, changes: unknown) => changes } as never,
      { isAvailable: false, tryRepair: vi.fn().mockResolvedValue(null) } as never,
      { packChatWeeklyReviewProposals: vi.fn() } as never,
      { getCheckInForDate: vi.fn().mockResolvedValue({ checkIn: null }) } as never,
      { packChatRecipeRecommendationProposal: vi.fn().mockResolvedValue(null) } as never,
      { getMessageDisplayAttachments: vi.fn().mockResolvedValue(new Map()) } as never,
      {
        validateRefsForSend: vi.fn().mockResolvedValue(undefined),
        runTurnStages: vi.fn().mockResolvedValue(null),
      } as never,
      { tryExecute: vi.fn().mockResolvedValue(null) } as never,
      { resolvePreAiTurn: vi.fn().mockResolvedValue({ kind: "not_explainer" }) } as never,
      {
        getChat: vi.fn().mockReturnValue({ emptyAttachmentMessage: "Attachment" }),
        getDeterministicProposalTriggers: vi.fn().mockReturnValue({
          maxMergedProposals: 5,
          wellbeingCheckin: { enabled: false, moodPhrases: [], excludeContainsPhrases: [], excludeWhenNutritionIncidentSignal: false, requireNoTodayCheckIn: true, skipWhenCrisis: true },
          nutritionIncident: { enabled: false, phrases: [], skipWhenCrisis: true },
          recipeRecommendation: { enabled: false, phrases: [], excludeWhenNutritionIncidentSignal: false, skipWhenCrisis: true },
        }),
        getSuggestedQuickActions: vi.fn().mockReturnValue({ actions: [] }),
      } as never,
      {
        assertAiMessageAllowed: vi.fn().mockResolvedValue(undefined),
        recordAiMessageUsage: vi.fn().mockResolvedValue(1),
      } as never,
      { recordTurn: vi.fn() } as never,
    );
  }

  it("passes onProgress to aiService.generateCoachResponse", async () => {
    let capturedOnProgress: ProgressReporter | undefined;

    const service = buildChatService((onProgress) => {
      capturedOnProgress = onProgress;
      return Promise.resolve({
        output: { reply: "Great workout!", proposals: [] },
        parseErrors: [],
        replySafetyErrors: [],
        agentMetadata: {
          provider: "openai",
          intent: "general",
          catalogIntentId: "general",
          purpose: "general_chat",
          depth: "small",
          timeRange: "7d",
          toolsInvoked: [],
          citations: [],
          unifiedTurnDecision: { ran: false },
          safety: { status: "passed", blockedReasons: [], constraintsApplied: [] },
        },
      });
    });

    const capturedEvents: Parameters<ProgressReporter>[0][] = [];
    const onProgress: ProgressReporter = (event) => capturedEvents.push(event);

    await service.sendMessage(auth, thread.id, { content: "Adjust my workout" }, onProgress);

    // The onProgress passed to the service was forwarded to aiService
    expect(capturedOnProgress).toBe(onProgress);
  });

  it("emits preprocessing stage before calling aiService", async () => {
    const stageOrder: string[] = [];

    const service = buildChatService(() => {
      // This is called AFTER preprocessing is emitted
      stageOrder.push("ai_called");
      return Promise.resolve({
        output: { reply: "Great workout!", proposals: [] },
        parseErrors: [],
        replySafetyErrors: [],
        agentMetadata: {
          provider: "openai",
          intent: "general",
          catalogIntentId: "general",
          purpose: "general_chat",
          depth: "small",
          timeRange: "7d",
          toolsInvoked: [],
          citations: [],
          unifiedTurnDecision: { ran: false },
          safety: { status: "passed", blockedReasons: [], constraintsApplied: [] },
        },
      });
    });

    const onProgress: ProgressReporter = (event) => {
      stageOrder.push(event.stage);
    };

    await service.sendMessage(auth, thread.id, { content: "Adjust my workout" }, onProgress);

    expect(stageOrder).toContain("preprocessing");
    expect(stageOrder.indexOf("preprocessing")).toBeLessThan(stageOrder.indexOf("ai_called"));
  });

  it("emits validating stage after aiService returns but before the turn response is built", async () => {
    const stageOrder: string[] = [];
    let aiReturned = false;

    const service = buildChatService(() => {
      return Promise.resolve({
        output: { reply: "Great workout!", proposals: [] },
        parseErrors: [],
        replySafetyErrors: [],
        agentMetadata: {
          provider: "openai",
          intent: "general",
          catalogIntentId: "general",
          purpose: "general_chat",
          depth: "small",
          timeRange: "7d",
          toolsInvoked: [],
          citations: [],
          unifiedTurnDecision: { ran: false },
          safety: { status: "passed", blockedReasons: [], constraintsApplied: [] },
        },
      }).then((result) => {
        aiReturned = true;
        return result;
      });
    });

    const onProgress: ProgressReporter = (event) => {
      if (event.stage === "validating") {
        // When validating fires, ai must have already returned
        expect(aiReturned).toBe(true);
      }
      stageOrder.push(event.stage);
    };

    await service.sendMessage(auth, thread.id, { content: "Adjust my workout" }, onProgress);

    expect(stageOrder).toContain("validating");
  });
});
