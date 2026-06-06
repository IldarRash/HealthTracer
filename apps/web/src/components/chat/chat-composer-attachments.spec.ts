import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MEDICAL_ATTACHMENT_WELLNESS_NOTICE,
} from "../../lib/chat-attachment-ui-state.js";

const chatDir = dirname(fileURLToPath(import.meta.url));

const chatWorkspaceSource = readFileSync(join(chatDir, "chat-workspace.tsx"), "utf8");
const composerAttachmentsSource = readFileSync(
  join(chatDir, "chat-composer-attachments.tsx"),
  "utf8",
);
const composerAttachmentInputSource = readFileSync(
  join(chatDir, "chat-composer-attachment-input.tsx"),
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
  it("wires upload and send with attachment refs (recognize endpoint removed, no consent gate on upload)", () => {
    expect(chatWorkspaceSource).toContain("uploadChatAttachment");
    expect(chatWorkspaceSource).not.toContain("recognizeChatAttachment");
    expect(chatWorkspaceSource).toContain("attachmentRefIds");
    expect(chatWorkspaceSource).toContain("ChatComposerAttachments");
    expect(chatWorkspaceSource).toContain("ChatComposerAttachmentInput");
    expect(chatWorkspaceSource).toContain("ChatMessageAttachmentPreviews");
    expect(chatWorkspaceSource).toContain("chat-composer-controls");
    expect(chatWorkspaceSource).toContain("buildOptimisticAttachmentDisplays");
    expect(chatWorkspaceSource).toContain("ChatAttachmentOutcomePanel");
    expect(chatWorkspaceSource).toContain("canSendChatComposer");
    expect(chatWorkspaceSource).toContain('phase: "uploaded"');
    expect(chatWorkspaceSource).not.toContain("enrichAttachmentOutcomesWithProposalContext");
  });

  it("places the attach control in the composer input row", () => {
    // New design: two hidden file inputs + icon buttons (clip + camera), no FileInputTrigger wrapper.
    expect(composerAttachmentInputSource).toContain('id="chat-attachment-input"');
    expect(composerAttachmentInputSource).toContain('id="chat-camera-input"');
    expect(composerAttachmentInputSource).toContain('capture="environment"');
    expect(composerAttachmentsSource).not.toContain("Attachment privacy");
    expect(composerAttachmentsSource).not.toContain("CHAT_ATTACHMENT_PRIVACY_NOTICE");
  });

  it("uses icon buttons for attachment and camera, and attachment preview thumb", () => {
    // New design: clip + camera Icon buttons replace the old FileInputTrigger/labelText wrapper.
    expect(composerAttachmentInputSource).toContain('name="clip"');
    expect(composerAttachmentInputSource).toContain('name="camera"');
    expect(composerAttachmentInputSource).toContain('id="chat-attachment-input"');
    expect(composerAttachmentsSource).toContain("AttachmentPreviewThumb");
    expect(composerAttachmentsSource).not.toContain("PrivacyBoundaryNote");
  });

  it("renders compact attachment chips without privacy panels or category pickers", () => {
    expect(composerAttachmentsSource).toContain("chat-composer-attachments__chips");
    expect(composerAttachmentsSource).toContain("chat-composer-attachments__chip");
    expect(composerAttachmentsSource).not.toContain("PrivacyBoundaryNote");
    expect(composerAttachmentsSource).not.toContain("Recognized after send");
    expect(composerAttachmentsSource).not.toContain("CHAT_ATTACHMENT_PRIVACY_NOTICE");
    expect(composerAttachmentsSource).not.toContain("formatChatAttachmentFileSize");
    expect(composerAttachmentsSource).not.toContain("AttachmentStatusBadge");
  });

  it("has no category correction picker or optional category correction copy", () => {
    expect(composerAttachmentsSource).not.toContain("OPTIONAL_CATEGORY_CORRECTION_COPY");
    expect(composerAttachmentsSource).not.toContain("isAmbiguousFoodOrWorkoutImage");
    expect(composerAttachmentsSource).not.toContain("isUnclassifiedLikelyMedicalDocumentDraft");
    expect(composerAttachmentsSource).not.toContain('option value="">Auto-detect on send</option>');
    expect(composerAttachmentsSource).not.toContain("chat-composer-attachments__category-correction");
  });

  it("has no pre-upload medical consent form in the composer", () => {
    expect(composerAttachmentsSource).not.toContain("Consent scopes");
    expect(composerAttachmentsSource).not.toContain("Upload document");
    expect(composerAttachmentsSource).not.toContain("Grant consent and retry upload");
    expect(composerAttachmentsSource).not.toContain("MEDICAL_ATTACHMENT_WELLNESS_NOTICE");
    expect(composerAttachmentsSource).not.toContain("document-title-");
    expect(composerAttachmentsSource).not.toContain("document-type-");
    expect(composerAttachmentsSource).not.toContain("ConsentScopeChecklist");
  });

  it("exposes accessible attachment groups, remove labels, and live region updates", () => {
    expect(composerAttachmentsSource).toContain('role="group"');
    expect(composerAttachmentsSource).toContain("aria-labelledby={nameId}");
    expect(composerAttachmentsSource).toContain("aria-label={`Remove ${attachment.file.name}`}");
    expect(composerAttachmentsSource).toContain('aria-live="polite"');
  });

  it("renders attachment outcomes with inferred category and fallback copy", () => {
    expect(outcomePanelSource).toContain("ChatMetadataPanel");
    expect(outcomePanelSource).toContain("Attachment results");
    expect(outcomePanelSource).toContain("resolveAttachmentOutcomeFallbackCopy");
    expect(outcomePanelSource).not.toContain("resolveAttachmentOutcomeConfidenceLabel");
    expect(outcomePanelSource).not.toContain("Meal context:");
    expect(outcomePanelSource).not.toContain("Classification confidence:");
    expect(outcomePanelSource).not.toContain("Nothing changes until you apply");
    expect(outcomePanelSource).not.toContain('aria-label="Attachment recognition results"');
    expect(outcomePanelSource).toContain('aria-label="Attachment results"');
    // Post-send consent path removed — never reached since backend always returns unclassified
    expect(outcomePanelSource).not.toContain("Grant consent and process");
    expect(outcomePanelSource).not.toContain("ConsentScopeChecklist");
    expect(chatWorkspaceSource).not.toContain("pendingMedicalConsentByAttachmentId");
    expect(chatWorkspaceSource).not.toContain("buildGrantMedicalAttachmentConsentInput");
  });

  it("avoids forbidden clinical terms in attachment user-visible copy", () => {
    const combined = ATTACHMENT_USER_VISIBLE_SOURCES.join("\n").toLowerCase();

    for (const term of FORBIDDEN_ATTACHMENT_TERMS) {
      expect(combined).not.toContain(term);
    }
  });

  it("auto-uploads all valid attachments on select without pre-send gate", () => {
    // Input auto-uploads: calls onProcessDraft for every draft without a validation error.
    expect(composerAttachmentInputSource).not.toContain("shouldAutoProcessChatAttachmentOnSelect");
    expect(composerAttachmentInputSource).toContain("localValidationError");
    expect(composerAttachmentInputSource).toContain("onProcessDraft(draft)");
    expect(composerAttachmentsSource).not.toContain(">Recognize<");
    expect(composerAttachmentsSource).not.toContain("canPreviewRecognizeChatAttachmentDraft");
    expect(composerAttachmentsSource).not.toContain("Preview recognition (optional)");
    expect(composerAttachmentsSource).not.toContain("onRecognizeDraft");
    expect(composerAttachmentsSource).not.toContain("categoryOverride");
  });

  it("does not render medical summary snippets, profile review links, or consent forms", () => {
    // Medical summary snippets and profile review links were in the removed consent path.
    expect(outcomePanelSource).not.toContain("summarySnippet");
    expect(outcomePanelSource).not.toContain("Review document in Profile");
    expect(outcomePanelSource).not.toContain("available in Profile after review");
    // Consent form elements removed (backend never produces needs_consent outcomes).
    expect(outcomePanelSource).not.toContain("Grant consent and process");
    expect(outcomePanelSource).not.toContain("ConsentScopeChecklist");
  });

  it("has no consent form in either the outcome panel or the composer (post-send consent path removed)", () => {
    // Post-send consent path removed: backend never produces needs_consent outcomes (always unclassified).
    expect(outcomePanelSource).not.toContain("ConsentScopeChecklist");
    expect(composerAttachmentsSource).not.toContain("ConsentScopeChecklist");
    expect(composerAttachmentsSource).not.toContain("onGrantConsentAndRecognize");
    expect(chatWorkspaceSource).not.toContain("grantChatAttachmentConsent");
  });
});
