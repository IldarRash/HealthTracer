import { describe, expect, it } from "vitest";
import { formatFileSize, readFileAsBase64 } from "./file-upload.js";

function createTestFile(content: string, name: string, type: string): File {
  return new File([content], name, { type });
}

describe("shared file upload helpers", () => {
  it("formats file sizes for display", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2.0 KB");
    expect(formatFileSize(2 * 1024 * 1024)).toBe("2.0 MB");
  });

  it("encodes file bytes as base64 without logging content", async () => {
    const file = createTestFile("wellness sample", "note.txt", "text/plain");
    await expect(readFileAsBase64(file)).resolves.toBe(
      Buffer.from("wellness sample", "utf8").toString("base64"),
    );
  });

  it("encodes multi-chunk files correctly", async () => {
    const content = "x".repeat(0x8000 + 17);
    const file = createTestFile(content, "big.txt", "text/plain");
    await expect(readFileAsBase64(file)).resolves.toBe(
      Buffer.from(content, "utf8").toString("base64"),
    );
  });
});
