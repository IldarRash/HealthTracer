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

  it("uses alert role for fetch errors and routes logging to Today", () => {
    expect(componentSource).toContain('role="alert"');
    expect(componentSource).toContain('href="/today"');
    expect(componentSource).not.toContain("clinical assessment");
  });

  it("maps raw wellbeing fetch errors to friendly dashboard copy", () => {
    expect(componentSource).toContain("formatWellbeingAggregatesError");
    expect(componentSource).toContain(
      "{formatWellbeingAggregatesError(errorMessage) ?? errorMessage}",
    );
  });
});
