import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildLongevityWeekEyebrowFromAnchorDate,
  todayIsoDate,
} from "../../src/lib/longevity-ui-state.js";

const pageSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "page.tsx"),
  "utf8",
);

const headerSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../src/components/longevity/longevity-page-header.tsx"),
  "utf8",
);

describe("Longevity page header", () => {
  it("derives the week eyebrow on the client from todayIsoDate", () => {
    expect(pageSource).toContain("<LongevityPageHeader />");
    expect(pageSource).not.toContain("buildLongevityWeekEyebrow");
    expect(headerSource).toContain('"use client"');
    expect(headerSource).toContain("buildLongevityWeekEyebrowFromAnchorDate");
    expect(headerSource).toContain("todayIsoDate()");
    expect(buildLongevityWeekEyebrowFromAnchorDate("2026-05-22")).toContain("2026");
    expect(buildLongevityWeekEyebrowFromAnchorDate(todayIsoDate(new Date("2026-05-22T15:00:00.000Z")))).toContain(
      "2026",
    );
  });

  it("keeps wellness overview copy without clinical score terms", () => {
    expect(headerSource).toContain(
      "Your weekly wellness overview across Today, training, nutrition, goals, and logged signals.",
    );
    expect(headerSource).not.toMatch(/health score|longevity score|readiness score|biological age/i);
  });

  it("mounts longevity on the structured dashboard canvas variant", () => {
    expect(pageSource).toContain('variant="dashboard"');
    expect(pageSource).toContain("<LongevityDashboard />");
  });
});
