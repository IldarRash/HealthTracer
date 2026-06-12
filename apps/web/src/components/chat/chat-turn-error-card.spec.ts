/**
 * Source-contract spec for ChatTurnErrorCard.
 *
 * Uses string assertions against the source file rather than DOM rendering
 * to avoid jsdom/next-intl provider overhead. Verifies:
 *  - accessibility: role="alert" present
 *  - i18n keys: Chat.error and Chat.turnError namespaces + expected keys consumed
 *  - action buttons: onRetry and onEditRequest wired
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

  it("uses the Chat.error i18n namespace for legacy degraded-turn variant", () => {
    expect(source).toMatch(/useTranslations\("Chat\.error"\)/);
  });

  it("uses the Chat.turnError i18n namespace for honest turn-error variant", () => {
    expect(source).toMatch(/useTranslations\("Chat\.turnError"\)/);
  });

  it("renders the error title for both variants", () => {
    // tError("title") and tTurnError("title") are both present
    expect(source).toMatch(/tError\("title"\)/);
    expect(source).toMatch(/tTurnError\("title"\)/);
  });

  it("renders the error body for both variants", () => {
    expect(source).toMatch(/tError\("body"\)/);
    expect(source).toMatch(/tTurnError\("body"\)/);
  });

  it("renders the reply_blocked body line only for reply_blocked reason", () => {
    expect(source).toMatch(/reply_blocked/);
    expect(source).toMatch(/tTurnError\("bodyBlocked"\)/);
  });

  it("renders the retry button with localized label for both variants", () => {
    expect(source).toMatch(/tError\("retry"\)/);
    expect(source).toMatch(/tTurnError\("retry"\)/);
  });

  it("renders the edit-request button only for the legacy variant (no reason prop)", () => {
    expect(source).toMatch(/tError\("editRequest"\)/);
  });

  it("wires onRetry to the retry button", () => {
    expect(source).toMatch(/onClick={onRetry}/);
  });

  it("wires onEditRequest to the edit button (legacy variant only)", () => {
    expect(source).toMatch(/onClick={onEditRequest}/);
  });

  it("wires the disabled prop to the retry button", () => {
    expect(source).toMatch(/disabled={disabled}/);
  });

  it("accepts optional reason prop for decision_failed and reply_blocked", () => {
    expect(source).toMatch(/reason\?: "decision_failed" \| "reply_blocked"/);
  });

  it("accepts optional disabled prop for retry-while-send-pending", () => {
    expect(source).toMatch(/disabled\?: boolean/);
  });

  it("uses the chat-turn-error-card CSS class for styling hooks", () => {
    expect(source).toMatch(/className="chat-turn-error-card"/);
  });

  it("uses the --retry and --edit button variant classes", () => {
    expect(source).toMatch(/chat-turn-error-card__btn--retry/);
    expect(source).toMatch(/chat-turn-error-card__btn--edit/);
  });
});
