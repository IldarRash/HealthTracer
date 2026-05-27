import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AMBIGUOUS_IMAGE_ATTACHMENT_COPY,
  CHAT_ATTACHMENT_PRIVACY_NOTICE,
  MEDICAL_ATTACHMENT_WELLNESS_NOTICE,
  MESSAGE_FIRST_ATTACHMENT_COPY,
} from "../../lib/chat-attachment-ui-state.js";

const chatDir = dirname(fileURLToPath(import.meta.url));

const chatWorkspaceSource = readFileSync(join(chatDir, "chat-workspace.tsx"), "utf8");
const composerAttachmentsSource = readFileSync(
  join(chatDir, "chat-composer-attachments.tsx"),
  "utf8",
);
const outcomePanelSource = readFileSync(
  join(chatDir, "chat-attachment-outcome-panel.tsx"),
  "utf8",
);

const ATTACHMENT_USER_VISIBLE_SOURCES = [
  chatWorkspaceSource,
  composerAttachmentsSource,
  outcomePanelSource,
  CHAT_ATTACHMENT_PRIVACY_NOTICE,
  MEDICAL_ATTACHMENT_WELLNESS_NOTICE,
  MESSAGE_FIRST_ATTACHMENT_COPY,
];

const FORBIDDEN_ATTACHMENT_TERMS = [
  "diagnosis",
  "diagnose",
  "treatment plan",
  "prescribe",
  "clinical assessment",
  "medical certainty",
];

describe("chat composer attachments wiring", () => {
  it("wires upload, consent, optional recognize, and send with attachment refs", () => {
    expect(chatWorkspaceSource).toContain("uploadChatAttachment");
    expect(chatWorkspaceSource).toContain("recognizeChatAttachment");
    expect(chatWorkspaceSource).toContain("grantChatAttachmentConsent");
    expect(chatWorkspaceSource).toContain("attachmentRefIds");
    expect(chatWorkspaceSource).toContain("ChatComposerAttachments");
    expect(chatWorkspaceSource).toContain("ChatAttachmentOutcomePanel");
    expect(chatWorkspaceSource).toContain("canSendChatComposer");
    expect(chatWorkspaceSource).toContain('phase: "uploaded"');
    expect(chatWorkspaceSource).toContain("enrichAttachmentOutcomesWithProposalContext");
  });

  it("uses shared file input and consent primitives", () => {
    expect(composerAttachmentsSource).toContain("FileInputTrigger");
    expect(composerAttachmentsSource).toContain("ConsentScopeChecklist");
    expect(composerAttachmentsSource).toContain("AttachmentPreviewThumb");
    expect(composerAttachmentsSource).toContain("AttachmentStatusBadge");
    expect(composerAttachmentsSource).toContain('inputId="chat-attachment-input"');
    expect(composerAttachmentsSource).toContain("labelText=");
  });

  it("does not require category select on the message-first happy path", () => {
    expect(composerAttachmentsSource).toContain("MESSAGE_FIRST_ATTACHMENT_COPY");
    expect(composerAttachmentsSource).toContain("Recognized after send");
    expect(composerAttachmentsSource).toContain('option value="">Auto-detect on send</option>');
    expect(composerAttachmentsSource).toContain("OPTIONAL_CATEGORY_CORRECTION_COPY");
    expect(composerAttachmentsSource).not.toMatch(
      /<label[^>]+>[\s\S]*Category[\s\S]*<\/label>[\s\S]*<select[^>]+required/s,
    );
  });

  it("exposes accessible attachment groups, remove labels, and live region updates", () => {
    expect(composerAttachmentsSource).toContain('role="group"');
    expect(composerAttachmentsSource).toContain("aria-labelledby={nameId}");
    expect(composerAttachmentsSource).toContain("aria-label={`Remove ${attachment.file.name}`}");
    expect(composerAttachmentsSource).toContain('aria-live="polite"');
  });

  it("gates medical uploads behind consent scopes and wellness copy", () => {
    expect(composerAttachmentsSource).toContain("Consent scopes");
    expect(composerAttachmentsSource).toContain("Upload document");
    expect(composerAttachmentsSource).toContain("Grant consent and retry upload");
    expect(composerAttachmentsSource).toContain("MEDICAL_ATTACHMENT_WELLNESS_NOTICE");
    expect(composerAttachmentsSource).toContain("document-title-");
    expect(composerAttachmentsSource).toContain("document-type-");
  });

  it("renders attachment outcomes with inferred category, meal context, and profile review links", () => {
    expect(outcomePanelSource).toContain("ChatMetadataPanel");
    expect(outcomePanelSource).toContain("Attachment results");
    expect(outcomePanelSource).toContain("resolveMedicalDocumentProfileHref");
    expect(outcomePanelSource).toContain("resolveAttachmentOutcomeFallbackCopy");
    expect(outcomePanelSource).toContain("resolveAttachmentOutcomeConfidenceLabel");
    expect(outcomePanelSource).toContain("Meal context:");
    expect(outcomePanelSource).toContain("Classification confidence:");
    expect(outcomePanelSource).toContain("Nothing changes until you apply");
    expect(outcomePanelSource).toContain('aria-label="Attachment recognition results"');
  });

  it("avoids forbidden clinical terms in attachment user-visible copy", () => {
    const combined = ATTACHMENT_USER_VISIBLE_SOURCES.join("\n").toLowerCase();

    for (const term of FORBIDDEN_ATTACHMENT_TERMS) {
      expect(combined).not.toContain(term);
    }
  });

  it("auto-uploads non-medical attachments on select without pre-send recognize", () => {
    expect(composerAttachmentsSource).toContain("shouldAutoProcessChatAttachmentOnSelect");
    expect(composerAttachmentsSource).toMatch(
      /shouldAutoProcessChatAttachmentOnSelect\(draft\)[\s\S]*onProcessDraft\(draft\)/,
    );
    expect(composerAttachmentsSource).not.toContain(">Recognize<");
    expect(composerAttachmentsSource).toContain("Preview recognition (optional)");
    expect(AMBIGUOUS_IMAGE_ATTACHMENT_COPY).toMatch(/Send it with your message/i);
  });

  it("resets validation when category is corrected before upload", () => {
    expect(composerAttachmentsSource).toContain("applyChatAttachmentCategoryChange");
    expect(composerAttachmentsSource).toContain("handleCategoryChange");
    expect(composerAttachmentsSource).not.toContain("categoryOverride");
  });

  it("does not render medical summary snippets before profile review", () => {
    expect(outcomePanelSource).not.toContain("summarySnippet");
    expect(outcomePanelSource).toContain("Review document in Profile");
    expect(outcomePanelSource).toContain("available in Profile after review");
  });

  it("keeps medical consent scopes unchecked until the user opts in", () => {
    expect(composerAttachmentsSource).toContain("ConsentScopeChecklist");
    expect(composerAttachmentsSource).toContain("Upload storage is required");
    expect(composerAttachmentsSource).toContain("Upload document");
  });
});
