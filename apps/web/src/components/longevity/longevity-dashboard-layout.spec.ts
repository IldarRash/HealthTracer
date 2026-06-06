import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_LONGEVITY_TERMS,
  LONGEVITY_CTA_ROUTES,
  WEEKDAY_TREND_LABELS,
  buildLongevityHeroTrendStripView,
  buildSevenDayTrendAriaLabel,
} from "../../lib/longevity-ui-state.js";

const componentSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "longevity-dashboard.tsx"),
  "utf8",
);

const stylesSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../app/styles.css"),
  "utf8",
);

function extractQuotedUserCopy(source: string): string[] {
  const matches = source.match(/"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'/g) ?? [];
  return matches.map((match) => match.slice(1, -1));
}

describe("LongevityDashboard layout regressions", () => {
  it("renders exactly one dark hero card above light overview cards", () => {
    const heroCardCount = (componentSource.match(/<OverviewHeroCard/g) ?? []).length;
    expect(heroCardCount).toBe(1);
    expect(componentSource).not.toMatch(/<section className="dashboard-hero"/);
    expect(componentSource).toContain("<OverviewHeroCard fullWidth>");
    expect(stylesSource).toMatch(
      /\.dashboard-hero[\s\S]*var\(--color-surface-hero-dark\)/,
    );
    expect(stylesSource).toMatch(
      /\.app-shell__main--structured \.dashboard-card[\s\S]*var\(--color-surface-content-elevated\)/,
    );
  });
  it("uses full-width hero and harmonized span-6 desktop card rows", () => {
    expect(componentSource).toContain("<OverviewHeroCard fullWidth>");
    expect(componentSource).toMatch(/className="dashboard-card--span-4"[\s\S]*?label="Today"/);
    expect(componentSource).toMatch(/className="dashboard-card--span-4"[\s\S]*?label="Workouts"/);
    expect(componentSource).toMatch(/className="dashboard-card--span-4"[\s\S]*?label="Nutrition"/);
    expect(componentSource).toMatch(/className="dashboard-card--span-6"[\s\S]*?label="Goals"/);
    expect(componentSource).toMatch(/className="dashboard-card--span-6"[\s\S]*?label="Wellbeing"/);
    expect(componentSource).toMatch(/className="dashboard-card--span-6"[\s\S]*?label="Wellness"/);
    expect(componentSource).toMatch(/className="dashboard-card--span-6"[\s\S]*?label="Trends"/);
    expect(componentSource).toMatch(/className="dashboard-card--span-6"[\s\S]*?label="Documents"/);
    expect(componentSource).toMatch(/className="dashboard-card--span-6 dashboard-card--coach"[\s\S]*?label="Coach"/);
  });

  it("shows honest sparse hero copy and switches between sparse invite and data ring", () => {
    expect(componentSource).toContain("{hero.sparse ? (");
    expect(componentSource).toContain("<DsRing");
    expect(componentSource).toContain("<DsTrendStrip");
    expect(componentSource).not.toContain("<OverviewMetricRing");
    expect(componentSource).not.toContain('className="sr-only"');
  });

  it("renders weekday labels for the seven-day trend strip via DsTrendStrip", () => {
    expect(componentSource).toContain("WEEKDAY_TREND_LABELS");
    expect(componentSource).toContain("buildLongevityHeroTrendStripView");
    expect(componentSource).toContain('ariaLabel={heroTrend.ariaLabel}');
    expect(WEEKDAY_TREND_LABELS).toHaveLength(7);
    expect(buildSevenDayTrendAriaLabel([0, 50, 0, 0, 80, 0, 0], false)).toContain("Mon: 0%");
    expect(buildSevenDayTrendAriaLabel([0, 0, 0, 0, 0, 0, 0], true)).toContain(
      "Not enough data yet",
    );
    expect(buildLongevityHeroTrendStripView([0, 0, 0, 0, 0, 0, 0], true).className).toContain(
      "trend-strip--sparse",
    );
  });

  it("keeps approved CTA routes without chat query prefill", () => {
    expect(componentSource).toContain(`href={LONGEVITY_CTA_ROUTES.chat}`);
    expect(componentSource).not.toMatch(/LONGEVITY_CTA_ROUTES\.chat\}\?/);
    expect(componentSource).not.toMatch(/\/chat\?/);
    expect(LONGEVITY_CTA_ROUTES.chat).toBe("/chat");
  });

  it("scopes profile twelve-column grid to desktop breakpoints", () => {
    expect(stylesSource).toMatch(
      /@media \(min-width: 900px\)[\s\S]*\.dashboard-grid--profile[\s\S]*\.dashboard-card--span-12[\s\S]*\.dashboard-card--span-6/,
    );
    expect(stylesSource).toMatch(
      /@media \(min-width: 900px\)[\s\S]*\.dashboard-hero > \.trend-strip[\s\S]*grid-row: 2/,
    );
    expect(stylesSource).toContain(".trend-strip--sparse .trend-strip__bar");
    expect(stylesSource).not.toMatch(
      /\/\* Profile dashboard[\s\S]*?^\.dashboard-grid--profile\s*\{/m,
    );
  });

  it("collapses dashboard grids to a single column on tablet and mobile", () => {
    expect(stylesSource).toMatch(
      /@media \(max-width: 768px\)[\s\S]*\.dashboard-grid[\s\S]*grid-template-columns:\s*1fr/,
    );
    expect(stylesSource).toMatch(
      /@media \(min-width: 1024px\)[\s\S]*\.dashboard-grid--profile[\s\S]*repeat\(12,\s*minmax\(0,\s*1fr\)\)/,
    );
  });

  it("renders hero subtitle text inline inside the visual dark layout, not via sr-only copies", () => {
    expect(componentSource).toContain("hero.subtitle");
    expect(componentSource).toContain("hero.activeDaysLabel");
    expect(componentSource).not.toContain("heroSubtitles");
    expect(componentSource).not.toContain("buildLongevityHeroSubtitles");
    expect(componentSource).not.toContain('className="sr-only"');
  });

  it("collapses deferred trend domains behind a native summary control", () => {
    expect(componentSource).toContain('className="overview-deferred-domains"');
    expect(componentSource).toContain("formatDeferredDomainsCollapsibleSummary");
    expect(componentSource).not.toContain('title="Deferred Domains"');
    expect(stylesSource).toContain(".overview-deferred-domains > summary");
  });

  it("uses overview inline empty states for sparse goals, wellness, and documents panels", () => {
    expect(componentSource).toContain("OverviewInlineEmptyState");
    expect(componentSource).not.toContain("<EmptyState");
  });

  it("keeps coach prompt chips accessible without page-load AI narrative", () => {
    expect(componentSource).toContain('<PromptChipList label="Suggested prompts for chat">');
    expect(componentSource).toContain("PromptChipLink");
    expect(componentSource).toContain("promptLabel={prompt.message}");
    expect(componentSource).toContain("{prompt.displayLabel}");
    expect(componentSource).toContain(
      "Static prompts based on what is visible here — open Chat to continue the conversation.",
    );
    expect(componentSource).not.toContain("useChat(");
    expect(componentSource).not.toContain("generateDashboard");
  });

  it("maps wellness consent and sparse empty states to inline overview empty states", () => {
    expect(componentSource).toContain('wellnessPanel.status === "consent_required"');
    expect(componentSource).toContain('wellnessPanel.status === "revoked"');
    expect(componentSource).toContain('"Connect wellness data"');
    expect(componentSource).toContain('"Sync consent revoked"');
    expect(componentSource).toContain('"No wellness trends yet"');
    expect(componentSource).toContain("Manage consent in Profile →");
    expect(componentSource).toContain("LONGEVITY_CTA_ROUTES.profileConsent");
  });

  it("keeps documents panel metadata-only with explicit non-clinical hint", () => {
    expect(componentSource).toContain("Metadata only — no clinical interpretation on this screen.");
    expect(componentSource).toContain("parseStatusLabel");
    expect(componentSource).toContain("consentLabel");
    expect(componentSource).not.toContain("summaryText");
    expect(componentSource).not.toContain("extractedConstraints");
  });

  it("keeps deferred trend domains collapsed by default behind native details", () => {
    expect(componentSource).toContain('<details className="overview-deferred-domains">');
    expect(componentSource).not.toMatch(/<details[^>]*\sopen(?:=|\s)/);
    expect(componentSource).toContain("<summary>");
    expect(componentSource).toContain("OverviewReadOnlyNotice");
    expect(componentSource).toContain("WEEKLY_REVIEW_READ_ONLY_NOTICE");
  });

  it("avoids forbidden clinical score terms in dashboard user copy", () => {
    const userCopy = extractQuotedUserCopy(componentSource).join(" ").toLowerCase();

    for (const term of FORBIDDEN_LONGEVITY_TERMS) {
      expect(userCopy).not.toContain(term);
    }
  });

});
