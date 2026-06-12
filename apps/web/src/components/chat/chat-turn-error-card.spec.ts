/**
 * Source-contract spec for ChatTurnErrorCard.
 *
 * Uses string assertions against the source file rather than DOM rendering
 * to avoid jsdom/next-intl provider overhead. Verifies:
 *  - accessibility: role="alert" present
 *  - i18n: only the Chat.turnError namespace is consumed (the legacy
 *    Chat.error degraded-turn variant was removed — single error-card path)
 *  - action button: onRetry wired, no edit-request branch remains
 *  - reason-specific body text for reply_blocked
 *  - disabled prop wired to retry button
 *  - CSS classes for styling hooks
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const srcPath = path.resolve(
  import.meta.dirname,
  "chat-turn-error-card.tsx",
);
const source = readFileSync(srcPath, "utf-8");

describe("ChatTurnErrorCard source contracts", () => {
  it('uses role="alert" for accessibility', () => {
    expect(source).toMatch(/role="alert"/);
  });

  it("uses only the Chat.turnError i18n namespace (legacy Chat.error removed)", () => {
    expect(source).toMatch(/useTranslations\("Chat\.turnError"\)/);
    expect(source).not.toMatch(/Chat\.error/);
  });

  it("renders the localized title, body, and retry label", () => {
    expect(source).toMatch(/t\("title"\)/);
    expect(source).toMatch(/t\("body"\)/);
    expect(source).toMatch(/t\("retry"\)/);
  });

  it("renders the reply_blocked body line only for reply_blocked reason", () => {
    expect(source).toMatch(/reason === "reply_blocked"/);
    expect(source).toMatch(/t\("bodyBlocked"\)/);
  });

  it("wires onRetry to the retry button", () => {
    expect(source).toMatch(/onClick={onRetry}/);
  });

  it("has no legacy edit-request branch", () => {
    expect(source).not.toMatch(/onEditRequest/);
    expect(source).not.toMatch(/editRequest/);
    expect(source).not.toMatch(/chat-turn-error-card__btn--edit/);
  });

  it("wires the disabled prop to the retry button", () => {
    expect(source).toMatch(/disabled={disabled}/);
  });

  it("requires the reason prop for decision_failed and reply_blocked", () => {
    expect(source).toMatch(/reason: "decision_failed" \| "reply_blocked"/);
  });

  it("accepts optional disabled prop for retry-while-send-pending", () => {
    expect(source).toMatch(/disabled\?: boolean/);
  });

  it("uses the chat-turn-error-card CSS class for styling hooks", () => {
    expect(source).toMatch(/className="chat-turn-error-card"/);
  });

  it("uses the --retry button variant class", () => {
    expect(source).toMatch(/chat-turn-error-card__btn--retry/);
  });
});
