import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CHAT_PROVISIONAL_UPLOAD_MIME_TYPES } from "@health/types";
import {
  LocalStorageInProductionError,
  StorageTraversalError,
} from "../../common/local-storage.js";
import {
  LocalChatAttachmentStorageAdapter,
  inferAttachmentExtension,
} from "./local-chat-attachment-storage.js";

describe("LocalChatAttachmentStorageAdapter", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "chat-attachment-storage-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("production guard", () => {
    it("throws LocalStorageInProductionError in production without opt-in", () => {
      expect(
        () => new LocalChatAttachmentStorageAdapter(tempDir, { nodeEnv: "production" }),
      ).toThrowError(LocalStorageInProductionError);
    });

    it("throws with message pointing at STORAGE_ALLOW_LOCAL_IN_PRODUCTION", () => {
      expect(
        () => new LocalChatAttachmentStorageAdapter(tempDir, { nodeEnv: "production" }),
      ).toThrowError(/STORAGE_ALLOW_LOCAL_IN_PRODUCTION/);
    });

    it("allows construction in production when allowInProduction is true", () => {
      expect(
        () =>
          new LocalChatAttachmentStorageAdapter(tempDir, {
            nodeEnv: "production",
            allowInProduction: true,
          }),
      ).not.toThrow();
    });

    it("allows construction in development without opt-in", () => {
      expect(
        () => new LocalChatAttachmentStorageAdapter(tempDir, { nodeEnv: "development" }),
      ).not.toThrow();
    });
  });

  describe("path traversal guard", () => {
    it("rejects a reference containing directory traversal", async () => {
      const adapter = new LocalChatAttachmentStorageAdapter(tempDir, { nodeEnv: "development" });

      await expect(adapter.read("../../etc/passwd")).rejects.toThrowError(StorageTraversalError);
    });

    it("rejects an absolute path that escapes root", async () => {
      const adapter = new LocalChatAttachmentStorageAdapter(tempDir, { nodeEnv: "development" });

      await expect(adapter.read("/etc/shadow")).rejects.toThrowError(StorageTraversalError);
    });

    it("allows a normal relative reference within root", async () => {
      const adapter = new LocalChatAttachmentStorageAdapter(tempDir, { nodeEnv: "development" });
      const ref = await adapter.store(
        "user1",
        "attachment-1",
        Buffer.from("img"),
        "image/jpeg",
      );
      const content = await adapter.read(ref);
      expect(content.toString()).toBe("img");
    });
  });

  describe("MIME extension map (images + document files)", () => {
    it("covers all CHAT_PROVISIONAL_UPLOAD_MIME_TYPES with a non-bin extension", async () => {
      const adapter = new LocalChatAttachmentStorageAdapter(tempDir, { nodeEnv: "development" });

      for (const mimeType of CHAT_PROVISIONAL_UPLOAD_MIME_TYPES) {
        const ref = await adapter.store("user1", `attachment-${mimeType.replace("/", "-")}`, Buffer.from("x"), mimeType);
        expect(ref).not.toMatch(/\.bin$/);
      }
    });

    it("falls back to bin for a truly unsupported MIME type", async () => {
      const adapter = new LocalChatAttachmentStorageAdapter(tempDir, { nodeEnv: "development" });
      const ref = await adapter.store("user1", "attachment-zip", Buffer.from("x"), "application/zip");
      expect(ref).toMatch(/\.bin$/);
    });

    it("maps PDF and text/plain to their correct extensions", () => {
      // PDF and text MIMEs are now valid chat attachment document types.
      expect(inferAttachmentExtension("file.pdf", "application/pdf")).toBe("pdf");
      expect(inferAttachmentExtension("file", "application/pdf")).toBe("pdf");
      expect(inferAttachmentExtension("file", "text/plain")).toBe("txt");
      expect(inferAttachmentExtension("file", "text/markdown")).toBe("md");
      expect(inferAttachmentExtension("file", "text/x-markdown")).toBe("md");
    });
  });

  describe("store round-trip", () => {
    it("stores and reads back content", async () => {
      const adapter = new LocalChatAttachmentStorageAdapter(tempDir, { nodeEnv: "development" });
      const ref = await adapter.store("user1", "att-1", Buffer.from("pixel data"), "image/png");
      const content = await adapter.read(ref);
      expect(content.toString()).toBe("pixel data");
    });

    it("returns a forward-slash reference", async () => {
      const adapter = new LocalChatAttachmentStorageAdapter(tempDir, { nodeEnv: "development" });
      const ref = await adapter.store("user1", "att-2", Buffer.from("x"), "image/webp");
      expect(ref).not.toContain("\\");
      expect(ref).toMatch(/^user1\/att-2\.webp$/);
    });
  });
});
