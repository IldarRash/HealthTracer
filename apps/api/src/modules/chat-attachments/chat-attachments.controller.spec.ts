import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { ChatAttachmentsController } from "./chat-attachments.controller.js";

const authA = { clerkUserId: "clerk-user-a", email: "a@example.com", displayName: null };
const authB = { clerkUserId: "clerk-user-b", email: "b@example.com", displayName: null };

function createServiceMock() {
  return {
    createAttachment: vi.fn(),
    getAttachment: vi.fn(),
    getAttachmentContent: vi.fn(),
  };
}

describe("ChatAttachmentsController", () => {
  describe("createAttachment — MIME enforcement", () => {
    it("rejects truly unsupported MIME type application/zip (400)", () => {
      const service = createServiceMock();
      const controller = new ChatAttachmentsController(service as never);

      expect(() =>
        controller.createAttachment(authA as never, {
          filename: "archive.zip",
          mimeType: "application/zip",
          fileContentBase64: "dGVzdA==",
        }),
      ).toThrow(BadRequestException);
      expect(service.createAttachment).not.toHaveBeenCalled();
    });

    it("accepts PDF (document_file category) and delegates to service", () => {
      const service = createServiceMock();
      service.createAttachment.mockResolvedValue({ attachmentRefId: "ref-2" });
      const controller = new ChatAttachmentsController(service as never);

      // Must not throw — PDF is now a valid provisional upload
      controller.createAttachment(authA as never, {
        filename: "training-program.pdf",
        mimeType: "application/pdf",
        fileContentBase64: "dGVzdA==",
      });

      expect(service.createAttachment).toHaveBeenCalledWith(
        authA,
        expect.objectContaining({ mimeType: "application/pdf" }),
      );
    });

    it("rejects an empty filename (400)", () => {
      const service = createServiceMock();
      const controller = new ChatAttachmentsController(service as never);

      expect(() =>
        controller.createAttachment(authA as never, {
          filename: "",
          mimeType: "image/jpeg",
          fileContentBase64: "dGVzdA==",
        }),
      ).toThrow(BadRequestException);
    });

    it("rejects an empty fileContentBase64 (400)", () => {
      const service = createServiceMock();
      const controller = new ChatAttachmentsController(service as never);

      expect(() =>
        controller.createAttachment(authA as never, {
          filename: "photo.jpg",
          mimeType: "image/jpeg",
          fileContentBase64: "",
        }),
      ).toThrow(BadRequestException);
    });

    it("accepts image/jpeg and delegates to service with caller auth", () => {
      const service = createServiceMock();
      service.createAttachment.mockResolvedValue({ attachmentRefId: "ref-1" });
      const controller = new ChatAttachmentsController(service as never);

      controller.createAttachment(authA as never, {
        filename: "photo.jpg",
        mimeType: "image/jpeg",
        fileContentBase64: "/9j/4AAQ",
      });

      expect(service.createAttachment).toHaveBeenCalledWith(
        authA,
        expect.objectContaining({ mimeType: "image/jpeg" }),
      );
    });

    it("accepts image/png", () => {
      const service = createServiceMock();
      service.createAttachment.mockResolvedValue({ attachmentRefId: "ref-2" });
      const controller = new ChatAttachmentsController(service as never);

      controller.createAttachment(authA as never, {
        filename: "image.png",
        mimeType: "image/png",
        fileContentBase64: "iVBORw0KGgo=",
      });

      expect(service.createAttachment).toHaveBeenCalledWith(
        authA,
        expect.objectContaining({ mimeType: "image/png" }),
      );
    });

    it("accepts image/webp", () => {
      const service = createServiceMock();
      service.createAttachment.mockResolvedValue({ attachmentRefId: "ref-3" });
      const controller = new ChatAttachmentsController(service as never);

      controller.createAttachment(authA as never, {
        filename: "photo.webp",
        mimeType: "image/webp",
        fileContentBase64: "UklGRg==",
      });

      expect(service.createAttachment).toHaveBeenCalledWith(
        authA,
        expect.objectContaining({ mimeType: "image/webp" }),
      );
    });
  });

  describe("getAttachment — ownership forwarding (IDOR seam)", () => {
    it("passes caller auth A to the service, not auth B", () => {
      const service = createServiceMock();
      service.getAttachment.mockResolvedValue({ id: "att-1" });
      const controller = new ChatAttachmentsController(service as never);

      controller.getAttachment(authA as never, "att-1");

      const [calledAuth] = service.getAttachment.mock.calls[0]!;
      expect(calledAuth).toEqual(authA);
      expect(calledAuth).not.toEqual(authB);
    });

    it("passes the attachmentId param to the service (scopes fetch to caller)", () => {
      const service = createServiceMock();
      service.getAttachment.mockResolvedValue({ id: "att-owned-by-a" });
      const controller = new ChatAttachmentsController(service as never);

      controller.getAttachment(authA as never, "att-owned-by-a");

      expect(service.getAttachment).toHaveBeenCalledWith(authA, "att-owned-by-a");
    });
  });

  describe("getAttachmentContent — ownership forwarding", () => {
    it("passes caller auth and attachmentId to the service", async () => {
      const service = createServiceMock();
      service.getAttachmentContent.mockResolvedValue({
        content: Buffer.from("data"),
        mimeType: "image/jpeg",
        filename: "photo.jpg",
      });
      const controller = new ChatAttachmentsController(service as never);

      await controller.getAttachmentContent(authA as never, "att-content-1");

      expect(service.getAttachmentContent).toHaveBeenCalledWith(authA, "att-content-1");
    });
  });
});
