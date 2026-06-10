import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { ChatController } from "./chat.controller.js";

const authA = { clerkUserId: "clerk-user-a", email: "a@example.com", displayName: null };
const authB = { clerkUserId: "clerk-user-b", email: "b@example.com", displayName: null };

function createServiceMock() {
  return {
    listThreads: vi.fn(),
    createThread: vi.fn(),
    getThread: vi.fn(),
    sendMessage: vi.fn(),
  };
}

describe("ChatController", () => {
  describe("sendMessage — body validation", () => {
    it("rejects a body with empty content and no attachments (400)", () => {
      const service = createServiceMock();
      const controller = new ChatController(service as never);

      expect(() =>
        controller.sendMessage(authA as never, "thread-1", { content: "" }),
      ).toThrow(BadRequestException);
      expect(service.sendMessage).not.toHaveBeenCalled();
    });

    it("rejects a body with content exceeding 20 000 chars", () => {
      const service = createServiceMock();
      const controller = new ChatController(service as never);

      expect(() =>
        controller.sendMessage(authA as never, "thread-1", { content: "x".repeat(20_001) }),
      ).toThrow(BadRequestException);
      expect(service.sendMessage).not.toHaveBeenCalled();
    });

    it("rejects attachment ref IDs that are not UUIDs", () => {
      const service = createServiceMock();
      const controller = new ChatController(service as never);

      expect(() =>
        controller.sendMessage(authA as never, "thread-1", {
          content: "",
          attachmentRefIds: ["not-a-uuid"],
        }),
      ).toThrow(BadRequestException);
      expect(service.sendMessage).not.toHaveBeenCalled();
    });

    it("rejects more than 5 attachment ref IDs", () => {
      const service = createServiceMock();
      const controller = new ChatController(service as never);
      const ids = Array.from(
        { length: 6 },
        (_, i) => `a100000${i}-0000-4000-8000-000000000001`,
      );

      expect(() =>
        controller.sendMessage(authA as never, "thread-1", { content: "", attachmentRefIds: ids }),
      ).toThrow(BadRequestException);
    });

    it("accepts a message with text content only", () => {
      const service = createServiceMock();
      service.sendMessage.mockResolvedValue({ id: "msg-1" });
      const controller = new ChatController(service as never);

      controller.sendMessage(authA as never, "thread-42", { content: "Hello coach" });

      expect(service.sendMessage).toHaveBeenCalledWith(
        authA,
        "thread-42",
        expect.objectContaining({ content: "Hello coach" }),
      );
    });

    it("accepts empty content when at least one valid attachment ref ID is provided", () => {
      const service = createServiceMock();
      service.sendMessage.mockResolvedValue({ id: "msg-2" });
      const controller = new ChatController(service as never);

      controller.sendMessage(authA as never, "thread-42", {
        content: "",
        attachmentRefIds: ["a1000001-0000-4000-8000-000000000001"],
      });

      expect(service.sendMessage).toHaveBeenCalledWith(
        authA,
        "thread-42",
        expect.objectContaining({
          attachmentRefIds: ["a1000001-0000-4000-8000-000000000001"],
        }),
      );
    });
  });

  describe("sendMessage — auth identity forwarded (IDOR seam)", () => {
    it("passes caller's auth to the service, not a different user's auth", () => {
      const service = createServiceMock();
      service.sendMessage.mockResolvedValue({ id: "msg-3" });
      const controller = new ChatController(service as never);

      controller.sendMessage(authA as never, "thread-99", { content: "From A" });

      const [calledAuth] = service.sendMessage.mock.calls[0]!;
      expect(calledAuth).toEqual(authA);
      expect(calledAuth).not.toEqual(authB);
    });

    it("includes the threadId param in the service call (thread scope)", () => {
      const service = createServiceMock();
      service.sendMessage.mockResolvedValue({ id: "msg-4" });
      const controller = new ChatController(service as never);

      controller.sendMessage(authA as never, "thread-owned-by-a", { content: "hi" });

      expect(service.sendMessage).toHaveBeenCalledWith(
        authA,
        "thread-owned-by-a",
        expect.any(Object),
      );
    });
  });

  describe("createThread — body validation", () => {
    it("accepts an empty body (title is optional)", () => {
      const service = createServiceMock();
      service.createThread.mockResolvedValue({ id: "t-1" });
      const controller = new ChatController(service as never);

      controller.createThread(authA as never, {});

      expect(service.createThread).toHaveBeenCalledWith(authA, {});
    });

    it("rejects a title longer than 160 chars", () => {
      const service = createServiceMock();
      const controller = new ChatController(service as never);

      expect(() =>
        controller.createThread(authA as never, { title: "t".repeat(161) }),
      ).toThrow(BadRequestException);
    });
  });
});
