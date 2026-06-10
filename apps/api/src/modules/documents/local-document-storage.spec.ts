import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  LocalStorageInProductionError,
  StorageTraversalError,
} from "../../common/local-storage.js";
import { LocalDocumentStorageAdapter } from "./local-document-storage.js";

describe("LocalDocumentStorageAdapter", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "doc-storage-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("production guard", () => {
    it("throws LocalStorageInProductionError when nodeEnv is production without opt-in", () => {
      expect(
        () => new LocalDocumentStorageAdapter(tempDir, { nodeEnv: "production" }),
      ).toThrowError(LocalStorageInProductionError);
    });

    it("throws with a message pointing at STORAGE_ALLOW_LOCAL_IN_PRODUCTION", () => {
      expect(
        () => new LocalDocumentStorageAdapter(tempDir, { nodeEnv: "production" }),
      ).toThrowError(/STORAGE_ALLOW_LOCAL_IN_PRODUCTION/);
    });

    it("allows construction in production when allowInProduction is true", () => {
      expect(
        () =>
          new LocalDocumentStorageAdapter(tempDir, {
            nodeEnv: "production",
            allowInProduction: true,
          }),
      ).not.toThrow();
    });

    it("allows construction in development without opt-in", () => {
      expect(
        () => new LocalDocumentStorageAdapter(tempDir, { nodeEnv: "development" }),
      ).not.toThrow();
    });
  });

  describe("path traversal guard", () => {
    it("rejects a reference containing directory traversal", async () => {
      const adapter = new LocalDocumentStorageAdapter(tempDir, { nodeEnv: "development" });

      await expect(adapter.read("../../etc/passwd")).rejects.toThrowError(StorageTraversalError);
    });

    it("rejects an absolute path reference that escapes root", async () => {
      const adapter = new LocalDocumentStorageAdapter(tempDir, { nodeEnv: "development" });

      await expect(adapter.read("/etc/passwd")).rejects.toThrowError(StorageTraversalError);
    });

    it("allows a normal relative reference that stays within root", async () => {
      const adapter = new LocalDocumentStorageAdapter(tempDir, { nodeEnv: "development" });
      const ref = "user123/somefile.txt";

      mkdirSync(join(tempDir, "user123"), { recursive: true });
      writeFileSync(join(tempDir, "user123", "somefile.txt"), "hello");

      const content = await adapter.read(ref);
      expect(content.toString()).toBe("hello");
    });
  });

  describe("store and read round-trip", () => {
    it("stores content and returns a normalized slash reference", async () => {
      const adapter = new LocalDocumentStorageAdapter(tempDir, { nodeEnv: "development" });
      const ref = await adapter.store("user1", "doc-1", Buffer.from("data"), "text/plain");

      expect(ref).toMatch(/^user1\/doc-1\.\w+$/);
      expect(ref).not.toContain("\\");
    });

    it("can read back stored content", async () => {
      const adapter = new LocalDocumentStorageAdapter(tempDir, { nodeEnv: "development" });
      const ref = await adapter.store("user1", "doc-2", Buffer.from("hello world"), "text/plain");
      const content = await adapter.read(ref);

      expect(content.toString()).toBe("hello world");
    });
  });
});
