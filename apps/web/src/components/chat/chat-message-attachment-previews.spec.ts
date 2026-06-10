import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const chatDir = dirname(fileURLToPath(import.meta.url));

const previewsSource = readFileSync(
  join(chatDir, "chat-message-attachment-previews.tsx"),
  "utf8",
);

describe("ChatMessageAttachmentPreviews component", () => {
  it("renders an image card for viewable image attachments (Case 1)", () => {
    // The component should render a ChatAttachmentCard with variant="image"
    // when isImageAttachmentPreview is true and previewUrl is present.
    expect(previewsSource).toContain("isImageAttachmentPreview");
    expect(previewsSource).toContain("ChatAttachmentCard");
    expect(previewsSource).toContain('variant="image"');
    expect(previewsSource).toContain("preview.previewUrl");
  });

  it("renders a file card for non-image present files (Case 2 — AC #2)", () => {
    // A ready PDF/text file has hasViewableContent=false by design (not an image),
    // but must NOT show a status label — it falls to the plain file card case.
    expect(previewsSource).toContain('variant="file"');
    expect(previewsSource).toContain("ChatAttachmentCard");
    // The unavailable card path also exists
    expect(previewsSource).toContain('variant="unavailable"');
  });

  it("distinguishes unavailable attachments from present non-image files via isGenuinelyUnavailable", () => {
    // The predicate must be named or use logic that avoids treating ready/non-image as unavailable.
    expect(previewsSource).toContain("isGenuinelyUnavailable");
    // needs_consent must trigger the unavailable status chip.
    expect(previewsSource).toContain("needs_consent");
    // failed and unsupported are also unavailability signals.
    expect(previewsSource).toContain("failed");
    expect(previewsSource).toContain("unsupported");
    // ready/low_confidence/needs_review must NOT appear in the status label resolver
    // as they are now handled by the plain chip (Case 2).
    expect(previewsSource).not.toContain('"ready"');
    expect(previewsSource).not.toContain('"low_confidence"');
    expect(previewsSource).not.toContain('"needs_review"');
  });

  it("labels unavailable attachments with human-readable status (needs_consent, expired, etc.)", () => {
    expect(previewsSource).toContain("Consent required");
    // "Unavailable" must NOT appear — ready non-image files are plain chips, not labeled unavailable.
    expect(previewsSource).not.toContain('"Unavailable"');
    expect(previewsSource).toContain("No longer available");
    expect(previewsSource).toContain("Upload failed");
  });

  it("does not import or call the N×2 fetch-storm helpers (getChatAttachment, fetchChatAttachmentContentBlob)", () => {
    expect(previewsSource).not.toContain("getChatAttachment");
    expect(previewsSource).not.toContain("fetchChatAttachmentContentBlob");
  });

  it("does not use useEffect or useState for loading persisted previews", () => {
    // The dead per-render lazy-load loop has been removed.
    expect(previewsSource).not.toContain("useEffect");
    expect(previewsSource).not.toContain("useState");
  });

  it("does not use useAuth (no token required for server-metadata-based render)", () => {
    expect(previewsSource).not.toContain("useAuth");
  });

  it("provides an accessible aria-label on the attachment list", () => {
    expect(previewsSource).toContain('aria-label="Message attachments"');
  });

  it("passes accessible aria-labels down to the card primitives via props", () => {
    // ChatAttachmentCard receives fileName and categoryLabel/statusLabel for aria-labels
    expect(previewsSource).toContain("fileName={filename}");
    expect(previewsSource).toContain("categoryLabel={categoryLabel}");
  });

  it("does not render raw medical content, storage keys, or recognition payloads", () => {
    // These are the actual sensitive fields that must never appear in the render.
    expect(previewsSource).not.toContain("storageKey");
    expect(previewsSource).not.toContain("recognition");
    // "consentScope" / consent details must not be rendered here
    // (the consent grant flow lives in ChatAttachmentOutcomePanel, not here).
    expect(previewsSource).not.toContain("consentScope");
    expect(previewsSource).not.toContain("documentText");
    // Should not import or call the full attachment record API
    expect(previewsSource).not.toContain("chatAttachmentRecordSchema");
  });
});
