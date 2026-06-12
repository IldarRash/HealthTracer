import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const uiDir = dirname(fileURLToPath(import.meta.url));

const attachmentPreviewSource = readFileSync(join(uiDir, "attachment-preview.tsx"), "utf8");

describe("Attachment preview primitive contracts", () => {
  it("uses descriptive preview alt text and file icon semantics", () => {
    expect(attachmentPreviewSource).toContain("Preview of");
    expect(attachmentPreviewSource).toContain('role="img"');
    expect(attachmentPreviewSource).toContain("aria-label={`${fileName} file`}");
  });

  it("renders the design-system doc Icon as the no-preview fallback (no emoji)", () => {
    expect(attachmentPreviewSource).toContain('<Icon name="doc"');
    expect(attachmentPreviewSource).not.toContain("📄");
  });

  it("exposes status badge aria-label with optional context", () => {
    expect(attachmentPreviewSource).toContain("AttachmentStatusBadge");
    expect(attachmentPreviewSource).toContain("aria-label={ariaLabel}");
    expect(attachmentPreviewSource).toContain("contextLabel");
  });
});
