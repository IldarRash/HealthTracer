import { describe, it, expect } from "vitest";
import { chatTurnStreamEventSchema } from "./chat-turn-stream.js";

// ---------------------------------------------------------------------------
// Minimal valid ChatTurnResponse fixture used by the `final` event tests.
// ---------------------------------------------------------------------------

const validThread = {
  id: "aaaaaaaa-0000-4000-a000-000000000001",
  userId: "aaaaaaaa-0000-4000-a000-000000000002",
  title: "Test",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

const validMessage = {
  id: "aaaaaaaa-0000-4000-a000-000000000003",
  threadId: "aaaaaaaa-0000-4000-a000-000000000001",
  role: "user" as const,
  content: "Hello",
  metadata: {},
  createdAt: "2024-01-01T00:00:00.000Z",
  attachments: [],
};

const validAssistantMessage = {
  ...validMessage,
  id: "aaaaaaaa-0000-4000-a000-000000000004",
  role: "assistant" as const,
};

const validChatTurnResponse = {
  thread: validThread,
  userMessage: validMessage,
  assistantMessage: validAssistantMessage,
  proposals: [],
};

// ---------------------------------------------------------------------------

describe("chatTurnStreamEventSchema", () => {
  describe("turn_accepted", () => {
    it("accepts a minimal turn_accepted event (no userMessageId)", () => {
      const result = chatTurnStreamEventSchema.safeParse({
        kind: "turn_accepted",
        threadId: "abc123",
      });
      expect(result.success).toBe(true);
    });

    it("accepts turn_accepted with optional userMessageId", () => {
      const result = chatTurnStreamEventSchema.safeParse({
        kind: "turn_accepted",
        threadId: "abc123",
        userMessageId: "msg_xyz",
      });
      expect(result.success).toBe(true);
    });

    it("rejects turn_accepted without threadId", () => {
      const result = chatTurnStreamEventSchema.safeParse({
        kind: "turn_accepted",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("stage", () => {
    const validStages = [
      "preprocessing",
      "routing",
      "domains_running",
      "synthesis",
      "validating",
    ] as const;

    for (const stage of validStages) {
      it(`accepts a stage event with stage="${stage}"`, () => {
        const result = chatTurnStreamEventSchema.safeParse({
          kind: "stage",
          stage,
        });
        expect(result.success).toBe(true);
      });
    }

    it("accepts domains_running with selectedDomains list", () => {
      const result = chatTurnStreamEventSchema.safeParse({
        kind: "stage",
        stage: "domains_running",
        selectedDomains: ["workout", "nutrition"],
      });
      expect(result.success).toBe(true);
    });

    it("rejects a stage event with an unknown stage name", () => {
      const result = chatTurnStreamEventSchema.safeParse({
        kind: "stage",
        stage: "unknown_stage",
      });
      expect(result.success).toBe(false);
    });

    it("rejects selectedDomains containing an invalid domain name", () => {
      const result = chatTurnStreamEventSchema.safeParse({
        kind: "stage",
        stage: "domains_running",
        selectedDomains: ["workout", "invalid_domain"],
      });
      expect(result.success).toBe(false);
    });

    it("rejects stage event missing stage field", () => {
      const result = chatTurnStreamEventSchema.safeParse({
        kind: "stage",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("final", () => {
    it("accepts a valid final event with a full ChatTurnResponse", () => {
      const result = chatTurnStreamEventSchema.safeParse({
        kind: "final",
        response: validChatTurnResponse,
      });
      expect(result.success).toBe(true);
    });

    it("rejects a final event missing the response field", () => {
      const result = chatTurnStreamEventSchema.safeParse({
        kind: "final",
      });
      expect(result.success).toBe(false);
    });

    it("rejects a final event with a malformed response (missing proposals)", () => {
      const result = chatTurnStreamEventSchema.safeParse({
        kind: "final",
        response: {
          thread: validThread,
          userMessage: validMessage,
          assistantMessage: validAssistantMessage,
          // proposals is required
        },
      });
      expect(result.success).toBe(false);
    });
  });

  describe("error", () => {
    it("accepts a valid error event", () => {
      const result = chatTurnStreamEventSchema.safeParse({
        kind: "error",
        message: "Something went wrong.",
      });
      expect(result.success).toBe(true);
    });

    it("rejects an error event missing message", () => {
      const result = chatTurnStreamEventSchema.safeParse({
        kind: "error",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("discriminated union rejection", () => {
    it("rejects an unknown kind", () => {
      const result = chatTurnStreamEventSchema.safeParse({
        kind: "unknown_kind",
        data: "anything",
      });
      expect(result.success).toBe(false);
    });

    it("rejects an event with no kind", () => {
      const result = chatTurnStreamEventSchema.safeParse({
        stage: "routing",
      });
      expect(result.success).toBe(false);
    });
  });
});
