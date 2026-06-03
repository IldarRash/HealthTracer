import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const uiDir = dirname(fileURLToPath(import.meta.url));

const chatBubbleSource = readFileSync(join(uiDir, "chat-bubble.tsx"), "utf8");
const promptChipSource = readFileSync(join(uiDir, "prompt-chip.tsx"), "utf8");
const metadataPanelSource = readFileSync(join(uiDir, "chat-metadata-panel.tsx"), "utf8");
const proposalConfirmationSource = readFileSync(join(uiDir, "proposal-confirmation.tsx"), "utf8");
const attachmentPreviewSource = readFileSync(join(uiDir, "attachment-preview.tsx"), "utf8");
const privacySource = readFileSync(join(uiDir, "privacy.tsx"), "utf8");
const stylesSource = readFileSync(join(uiDir, "../../../app/styles.css"), "utf8");

describe("Chat UI primitive contracts", () => {
  it("defines coach and crisis bubble variants with thinking status", () => {
    expect(chatBubbleSource).toContain('variant?: ChatBubbleVariant');
    expect(chatBubbleSource).toContain("chat-bubble--coach");
    expect(chatBubbleSource).toContain("chat-bubble--crisis");
    expect(chatBubbleSource).toContain('aria-live="polite"');
    expect(chatBubbleSource).toContain('role="status"');
    expect(chatBubbleSource).toContain("ChatThinkingIndicator");
  });

  it("defines transcript and composer accessibility labels", () => {
    expect(chatBubbleSource).toContain('label = "Coaching conversation"');
    expect(chatBubbleSource).toContain('label = "Message composer"');
    expect(chatBubbleSource).toContain("aria-live={live}");
  });

  it("defines prompt chip list semantics and link variant", () => {
    expect(promptChipSource).toContain('role="list"');
    expect(promptChipSource).toContain('role="listitem"');
    expect(promptChipSource).toContain('label = "Suggested prompts"');
    expect(promptChipSource).toContain("PromptChipLink");
    expect(promptChipSource).toContain("buildPromptChipLinkAriaLabel");
  });

  it("defines metadata panel tones for weekly review and crisis", () => {
    expect(metadataPanelSource).toContain('ChatMetadataPanelTone = "neutral" | "notice" | "crisis"');
    expect(metadataPanelSource).toContain("chat-metadata-panel--${tone}");
    expect(metadataPanelSource).toContain('role="region"');
    expect(metadataPanelSource).toContain("aria-labelledby={titleId}");
  });

  it("supports inline proposal summary cards", () => {
    expect(proposalConfirmationSource).toContain("inline?: boolean");
    expect(proposalConfirmationSource).toContain("proposal-summary-card");
    expect(proposalConfirmationSource).toContain("confirmation-card--inline");
  });

  it("maps chat polish tokens and reduced-motion rules in styles", () => {
    expect(stylesSource).toContain("--color-chat-bubble-user-bg");
    expect(stylesSource).toContain("--color-chat-bubble-assistant-bg");
    expect(stylesSource).toContain("--color-chat-success-bg");
    expect(stylesSource).toContain("--color-chat-notice-bg");
    expect(stylesSource).toContain("--color-chat-crisis-bg");
    expect(stylesSource).toContain("--color-chat-crisis-link");
    expect(stylesSource).toContain("--color-chat-user-immersive-bg");
    expect(stylesSource).toContain(".chat-metadata-panel--crisis");
    expect(stylesSource).toMatch(
      /\.chat-single \.wellbeing-crisis-panel\.chat-metadata-panel--crisis \.confirmation-card__link[\s\S]*color:\s*var\(--color-chat-crisis-link\)/,
    );
    expect(stylesSource).toContain(".chat-thinking");
    expect(stylesSource).toContain("mask-image: linear-gradient");
    expect(stylesSource).toMatch(/prefers-reduced-motion[\s\S]*\.chat-transcript/);
    expect(stylesSource).toMatch(/prefers-reduced-motion[\s\S]*\.chat-composer textarea/);
    expect(stylesSource).toMatch(/prefers-reduced-motion[\s\S]*\.chat-prompt-chip/);
    expect(stylesSource).toMatch(
      /prefers-reduced-motion[\s\S]*chat-weekly-review-summary__details > summary::before/,
    );
    expect(stylesSource).toMatch(
      /prefers-reduced-motion[\s\S]*\.chat-single \.chat-transcript/,
    );
  });

  it("defines composer focus-visible polish in dark chat layout", () => {
    expect(stylesSource).toContain(".chat-composer textarea:focus-visible");
    expect(stylesSource).toContain(".chat-single .chat-composer textarea:focus-visible");
  });

  it("exports attachment and consent primitives for chat composer reuse", () => {
    expect(attachmentPreviewSource).toContain("AttachmentPreviewThumb");
    expect(attachmentPreviewSource).toContain("AttachmentStatusBadge");
    expect(privacySource).toContain("FileInputTrigger");
    expect(privacySource).toContain("ConsentScopeChecklist");
    expect(stylesSource).toContain(".chat-composer-attachments");
    expect(stylesSource).toContain(".chat-composer-attachments__chips");
    expect(stylesSource).toContain(".chat-attachment-outcomes");
  });
});
