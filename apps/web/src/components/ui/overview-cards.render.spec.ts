import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const uiDir = dirname(fileURLToPath(import.meta.url));

const overviewCardsSource = readFileSync(join(uiDir, "overview-cards.tsx"), "utf8");
const promptChipSource = readFileSync(join(uiDir, "prompt-chip.tsx"), "utf8");
const promptChipUiStateSource = readFileSync(
  join(uiDir, "../../lib/prompt-chip-ui-state.ts"),
  "utf8",
);
const stylesSource = readFileSync(join(uiDir, "../../../app/styles.css"), "utf8");

describe("Overview card primitive contracts", () => {
  it("defines hero overview card as a dark section container", () => {
    expect(overviewCardsSource).toContain("OverviewHeroCard");
    expect(overviewCardsSource).toContain('className={cn("dashboard-hero"');
    expect(overviewCardsSource).toContain("dashboard-hero--full");
  });

  it("defines domain signal list items and read-only trend sections", () => {
    expect(overviewCardsSource).toContain("OverviewSignalList");
    expect(overviewCardsSource).toContain("OverviewSignalItem");
    expect(overviewCardsSource).toContain("overview-signal-item--muted");
    expect(overviewCardsSource).toContain("OverviewTrendSection");
    expect(overviewCardsSource).toContain('role="note"');
    expect(overviewCardsSource).toContain("OverviewReadOnlyNotice");
    expect(overviewCardsSource).toContain('role="status"');
    expect(overviewCardsSource).toContain("OverviewSparseHint");
  });

  it("defines link-based card CTAs and compact canvas empty states", () => {
    expect(overviewCardsSource).toContain("OverviewCardLink");
    expect(overviewCardsSource).toContain("confirmation-card__link");
    expect(overviewCardsSource).toContain("OverviewInlineEmptyState");
    expect(overviewCardsSource).toContain("overviewCanvasEmptyClassName");
  });

  it("defines accessible chat prompt chip links", () => {
    expect(promptChipSource).toContain("PromptChipLink");
    expect(promptChipSource).toContain("buildPromptChipLinkAriaLabel");
    expect(promptChipSource).toContain('role="listitem"');
    expect(promptChipSource).toContain("promptLabel");
    expect(promptChipSource).toContain("PromptChipList");
    expect(promptChipSource).toContain('role="list"');
    expect(promptChipSource).toContain("aria-label={label}");
  });

  it("keeps short visible labels separate from full prompt aria context", () => {
    expect(promptChipSource).toContain("buildPromptChipLinkAriaLabel");
    expect(promptChipSource).toContain("promptLabel");
    expect(promptChipUiStateSource).toContain("isPlainChatRoute");
    expect(promptChipUiStateSource).toContain("Open Chat —");
    expect(promptChipUiStateSource).toContain("Open Chat and discuss:");
  });

  it("maps structured canvas overview styles and focus targets", () => {
    expect(stylesSource).toMatch(
      /\.app-shell__main--structured \.dashboard-card[\s\S]*background:\s*var\(--color-surface-content-elevated\)/,
    );
    expect(stylesSource).toMatch(/\.dashboard-card--coach[\s\S]*border-color:/);
    expect(stylesSource).toMatch(/\.overview-signal-list[\s\S]*border-radius:/);
    expect(stylesSource).toMatch(/\.overview-trend-section[\s\S]*gap:/);
    expect(stylesSource).toMatch(/\.chat-prompt-chip:focus-visible[\s\S]*outline:/);
    expect(stylesSource).toMatch(
      /\.app-shell__main--structured \.chat-prompt-chip[\s\S]*border-color:/,
    );
  });

  it("keeps one dark hero surface separate from light overview cards", () => {
    expect(overviewCardsSource).toContain('className={cn("dashboard-hero"');
    expect(stylesSource).toMatch(
      /\.dashboard-hero[\s\S]*background:[\s\S]*var\(--color-surface-hero-dark\)/,
    );
    expect(stylesSource).toMatch(
      /\.app-shell__main--structured \.dashboard-card[\s\S]*background:\s*var\(--color-surface-content-elevated\)/,
    );
    expect(stylesSource).not.toMatch(
      /\.app-shell__main--structured \.dashboard-hero[\s\S]*--color-surface-content-elevated/,
    );
  });

  it("defines read-only trend notice with note semantics", () => {
    expect(overviewCardsSource).toContain("OverviewReadOnlyNotice");
    expect(overviewCardsSource).toContain('role="note"');
    expect(overviewCardsSource).toContain("overview-readonly-notice");
  });
});
