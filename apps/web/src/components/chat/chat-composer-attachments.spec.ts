import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AMBIGUOUS_IMAGE_ATTACHMENT_COPY,
  CHAT_ATTACHMENT_PRIVACY_NOTICE,
  FOOD_OR_WORKOUT_RECOGNIZE_COPY,
  MEDICAL_ATTACHMENT_WELLNESS_NOTICE,
} from "../../lib/chat-attachment-ui-state.js";

const chatDir = dirname(fileURLToPath(import.meta.url));
const webSrcDir = join(chatDir, "../..");

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
  it("wires upload, consent, recognize, and send with attachment refs", () => {
    expect(chatWorkspaceSource).toContain("uploadChatAttachment");
    expect(chatWorkspaceSource).toContain("recognizeChatAttachment");
    expect(chatWorkspaceSource).toContain("grantChatAttachmentConsent");
    expect(chatWorkspaceSource).toContain("attachmentRefIds");
    expect(chatWorkspaceSource).toContain("ChatComposerAttachments");
    expect(chatWorkspaceSource).toContain("ChatAttachmentOutcomePanel");
    expect(chatWorkspaceSource).toContain("canSendChatComposer");
  });

  it("uses shared file input and consent primitives", () => {
    expect(composerAttachmentsSource).toContain("FileInputTrigger");
    expect(composerAttachmentsSource).toContain("ConsentScopeChecklist");
    expect(composerAttachmentsSource).toContain("AttachmentPreviewThumb");
    expect(composerAttachmentsSource).toContain("AttachmentStatusBadge");
    expect(composerAttachmentsSource).toContain('inputId="chat-attachment-input"');
    expect(composerAttachmentsSource).toContain("labelText=");
  });

  it("exposes accessible attachment groups, remove labels, and category controls", () => {
    expect(composerAttachmentsSource).toContain('role="group"');
    expect(composerAttachmentsSource).toContain("aria-labelledby={nameId}");
    expect(composerAttachmentsSource).toContain("aria-label={`Remove ${attachment.file.name}`}");
    expect(composerAttachmentsSource).toContain("attachment-category-");
    expect(composerAttachmentsSource).toContain('aria-live="polite"');
  });

  it("gates medical uploads behind consent scopes and wellness copy", () => {
    expect(composerAttachmentsSource).toContain("Consent scopes");
    expect(composerAttachmentsSource).toContain("Upload and recognize");
    expect(composerAttachmentsSource).toContain("Grant consent and recognize");
    expect(composerAttachmentsSource).toContain("MEDICAL_ATTACHMENT_WELLNESS_NOTICE");
    expect(composerAttachmentsSource).toContain("document-title-");
    expect(composerAttachmentsSource).toContain("document-type-");
  });

  it("renders attachment outcomes with metadata panel and profile review links", () => {
    expect(outcomePanelSource).toContain("ChatMetadataPanel");
    expect(outcomePanelSource).toContain("Attachment results");
    expect(outcomePanelSource).toContain("resolveMedicalDocumentProfileHref");
    expect(outcomePanelSource).toContain("resolveAttachmentOutcomeFallbackCopy");
    expect(outcomePanelSource).toContain("Nothing changes until you apply");
    expect(outcomePanelSource).toContain('aria-label="Attachment recognition results"');
  });

  it("avoids forbidden clinical terms in attachment user-visible copy", () => {
    const combined = ATTACHMENT_USER_VISIBLE_SOURCES.join("\n").toLowerCase();

    for (const term of FORBIDDEN_ATTACHMENT_TERMS) {
      expect(combined).not.toContain(term);
    }
  });

  it("resets validation when category is corrected before upload", () => {
    expect(composerAttachmentsSource).toContain("applyChatAttachmentCategoryChange");
    expect(composerAttachmentsSource).toContain("handleCategoryChange");
    expect(composerAttachmentsSource).not.toContain("categoryOverride");
  });

  it("does not auto-upload or recognize ambiguous images on file selection", () => {
    expect(composerAttachmentsSource).toContain("shouldAutoProcessChatAttachmentOnSelect");
    expect(composerAttachmentsSource).not.toMatch(
      /for\s*\(\s*const\s+draft\s+of\s+nextDrafts\s*\)\s*\{[^}]*draft\.category\s*!==\s*"medical_document"/s,
    );
    expect(composerAttachmentsSource).toContain("AMBIGUOUS_IMAGE_ATTACHMENT_COPY");
    expect(composerAttachmentsSource).toContain("FOOD_OR_WORKOUT_RECOGNIZE_COPY");
    expect(AMBIGUOUS_IMAGE_ATTACHMENT_COPY).toMatch(/Food photo or Workout\/training/i);
    expect(FOOD_OR_WORKOUT_RECOGNIZE_COPY).toMatch(/Food photo or Workout\/training/i);
    expect(composerAttachmentsSource).toContain("Recognize");
    expect(composerAttachmentsSource).toMatch(
      /shouldAutoProcessChatAttachmentOnSelect\(draft\)[\s\S]*onProcessDraft\(draft\)/,
    );
  });

  it("requires explicit Recognize before provider calls for food and workout", () => {
    expect(composerAttachmentsSource).toContain("showFoodOrWorkoutFields");
    expect(composerAttachmentsSource).toContain("FOOD_OR_WORKOUT_RECOGNIZE_COPY");
    expect(composerAttachmentsSource).toContain('onClick={() => onProcessDraft(attachment)}');
    expect(composerAttachmentsSource).not.toContain("uploadChatAttachment");
    expect(composerAttachmentsSource).not.toContain("recognizeChatAttachment");
  });

  it("does not send categoryOverride during recognize calls", () => {
    expect(chatWorkspaceSource).not.toContain("categoryOverride");
  });

  it("does not render medical summary snippets before profile review", () => {
    expect(outcomePanelSource).not.toContain("summarySnippet");
    expect(outcomePanelSource).toContain("Review document in Profile");
    expect(outcomePanelSource).toContain("available in Profile after review");
  });

  it("keeps medical consent scopes unchecked until the user opts in", () => {
    expect(composerAttachmentsSource).toContain("ConsentScopeChecklist");
    expect(composerAttachmentsSource).toContain("Upload storage is required");
    expect(composerAttachmentsSource).toContain("Upload and recognize");
  });
});
