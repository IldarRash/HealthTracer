/**
 * Source-contract spec for ChatTurnErrorCard.
 *
 * Uses string assertions against the source file rather than DOM rendering
 * to avoid jsdom/next-intl provider overhead. Verifies:
 *  - accessibility: role="alert" present
 *  - i18n keys: Chat.error namespace + expected keys consumed
 *  - action buttons: onRetry and onEditRequest wired
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

  it("uses the Chat.error i18n namespace", () => {
    expect(source).toMatch(/useTranslations\("Chat\.error"\)/);
  });

  it("renders the error title via t('title')", () => {
    expect(source).toMatch(/t\("title"\)/);
  });

  it("renders the error body via t('body')", () => {
    expect(source).toMatch(/t\("body"\)/);
  });

  it("renders the retry button via t('retry')", () => {
    expect(source).toMatch(/t\("retry"\)/);
  });

  it("renders the edit-request button via t('editRequest')", () => {
    expect(source).toMatch(/t\("editRequest"\)/);
  });

  it("wires onRetry to the retry button", () => {
    expect(source).toMatch(/onClick={onRetry}/);
  });

  it("wires onEditRequest to the edit button", () => {
    expect(source).toMatch(/onClick={onEditRequest}/);
  });

  it("uses the chat-turn-error-card CSS class for styling hooks", () => {
    expect(source).toMatch(/className="chat-turn-error-card"/);
  });

  it("uses the --retry and --edit button variant classes", () => {
    expect(source).toMatch(/chat-turn-error-card__btn--retry/);
    expect(source).toMatch(/chat-turn-error-card__btn--edit/);
  });
});
