import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LONGEVITY_CTA_ROUTES, WEEKDAY_TREND_LABELS, buildLongevityHeroTrendStripView, buildSevenDayTrendAriaLabel } from "../../lib/longevity-ui-state.js";

const componentSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "longevity-dashboard.tsx"),
  "utf8",
);

const stylesSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../app/styles.css"),
  "utf8",
);

describe("LongevityDashboard layout regressions", () => {
  it("uses full-width hero and harmonized span-6 desktop card rows", () => {
    expect(componentSource).toContain('className="dashboard-hero dashboard-hero--full"');
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

  it("shows honest sparse hero copy and hides metric ring and trend fills", () => {
    expect(componentSource).toContain(
      "const heroValue = hero.sparse ? hero.emptyMessage : `${hero.percent}%`",
    );
    expect(componentSource).toContain("{!hero.sparse ? (");
    expect(componentSource).toMatch(
      /\{!hero\.sparse \? \([\s\S]*?className="metric-ring"/,
    );
    expect(componentSource).toContain("{!heroTrend.sparse ? (");
    expect(componentSource).toMatch(
      /\{!heroTrend\.sparse \? \([\s\S]*?className="trend-strip__fill"/,
    );
  });

  it("renders weekday labels for the seven-day trend strip", () => {
    expect(componentSource).toContain("WEEKDAY_TREND_LABELS");
    expect(componentSource).toContain("trend-strip__day");
    expect(componentSource).toContain("trend-strip__label");
    expect(componentSource).toContain('aria-hidden="true"');
    expect(componentSource).toContain('role="img"');
    expect(componentSource).toContain("buildLongevityHeroTrendStripView");
    expect(componentSource).toContain('className={heroTrend.className}');
    expect(componentSource).toContain('className="sr-only"');
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

  it("keeps coach prompt chips accessible without page-load AI narrative", () => {
    expect(componentSource).toContain('aria-label="Suggested prompts for chat"');
    expect(componentSource).toContain("aria-label={`Open Chat and discuss: ${prompt}`}");
    expect(componentSource).toContain(
      "Static prompts based on what is visible here — open Chat to continue the conversation.",
    );
    expect(componentSource).not.toContain("useChat(");
    expect(componentSource).not.toContain("generateDashboard");
  });
});
