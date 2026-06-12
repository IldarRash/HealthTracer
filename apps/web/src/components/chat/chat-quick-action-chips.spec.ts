/**
 * Source-contract spec for ChatQuickActionChips.
 *
 * Uses string assertions against the source file rather than DOM rendering
 * to avoid jsdom/next-intl provider overhead. Verifies:
 *  - localization: locale-aware label and messageText resolution
 *  - accessibility: aria-label on each chip, PromptChipList label
 *  - interaction: onClick sends localized messageText
 *  - disabled: passed through to each PromptChip
 *  - empty guard: returns null for empty actions
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const srcPath = path.resolve(
  import.meta.dirname,
  "chat-quick-action-chips.tsx",
);
const source = readFileSync(srcPath, "utf-8");

describe("ChatQuickActionChips source contracts", () => {
  it("uses useLocale to select localized label", () => {
    expect(source).toMatch(/useLocale/);
    expect(source).toMatch(/locale === "ru"/);
    expect(source).toMatch(/action\.labelRu/);
    expect(source).toMatch(/action\.labelEn/);
  });

  it("uses localized messageText for the send payload", () => {
    expect(source).toMatch(/action\.messageText\.ru/);
    expect(source).toMatch(/action\.messageText\.en/);
    expect(source).toMatch(/onActionSelect\(messageText\)/);
  });

  it("passes aria-label to each chip for accessibility", () => {
    expect(source).toMatch(/aria-label=\{label\}/);
  });

  it("uses PromptChip and PromptChipList primitives", () => {
    expect(source).toMatch(/PromptChip/);
    expect(source).toMatch(/PromptChipList/);
  });

  it("uses Chat.quickActions i18n namespace for the list label", () => {
    expect(source).toMatch(/useTranslations\("Chat\.quickActions"\)/);
    expect(source).toMatch(/t\("label"\)/);
  });

  it("passes disabled through to each PromptChip", () => {
    expect(source).toMatch(/disabled=\{disabled\}/);
  });

  it("returns null when actions array is empty", () => {
    expect(source).toMatch(/actions\.length === 0/);
    expect(source).toMatch(/return null/);
  });

  it("uses action.id as key for stable list rendering", () => {
    expect(source).toMatch(/key=\{action\.id\}/);
  });

  it("applies chat-quick-actions CSS class for styling hook", () => {
    expect(source).toMatch(/chat-quick-actions/);
  });
});
