import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const componentSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "wellbeing-history-panel.tsx"),
  "utf8",
);

describe("WellbeingHistoryPanel accessibility", () => {
  it("labels the seven-day mood and stress chart for screen readers", () => {
    expect(componentSource).toContain(
      'aria-label="Seven day mood and stress history"',
    );
    expect(componentSource).toContain("wellbeing-trend-row__label");
    expect(componentSource).toContain("wellbeing-trend-day__label");
  });

  it("uses compact canvas error and loading states with route constants", () => {
    expect(componentSource).toContain("CanvasErrorState");
    expect(componentSource).toContain("CanvasLoadingState");
    expect(componentSource).toContain("OverviewInlineEmptyState");
    expect(componentSource).toContain("OverviewCardLink");
    expect(componentSource).toContain("LONGEVITY_CTA_ROUTES.today");
    expect(componentSource).toContain("formatWellbeingAggregatesError");
    expect(componentSource).not.toContain('role="alert"');
    expect(componentSource).not.toContain('href="/today"');
    expect(componentSource).not.toContain("clinical assessment");
  });
});
