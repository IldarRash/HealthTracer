import { describe, expect, it } from "vitest";
import {
  OVERVIEW_WEEKDAY_LABELS,
  buildSevenDayTrendAriaLabel,
  buildTrendStripClassName,
  buildTrendStripView,
  overviewCanvasEmptyClassName,
} from "./overview-ui-state.js";

describe("overview-ui-state", () => {
  it("builds sparse and populated trend strip class names", () => {
    expect(buildTrendStripClassName(true)).toBe("trend-strip trend-strip--sparse");
    expect(buildTrendStripClassName(false)).toBe("trend-strip");
  });

  it("builds accessible seven-day trend labels", () => {
    expect(buildSevenDayTrendAriaLabel([0, 50, 0, 0, 80, 0, 0], OVERVIEW_WEEKDAY_LABELS, false)).toContain(
      "Mon: 0%",
    );
    expect(buildSevenDayTrendAriaLabel([0, 0, 0, 0, 0, 0, 0], OVERVIEW_WEEKDAY_LABELS, true)).toContain(
      "Not enough data yet",
    );
  });

  it("composes trend strip view objects for overview cards", () => {
    const sparse = buildTrendStripView([0, 0, 0, 0, 0, 0, 0], true);
    expect(sparse.className).toContain("trend-strip--sparse");
    expect(sparse.ariaLabel).toContain("Not enough data yet");

    const populated = buildTrendStripView([10, 20, 30, 40, 50, 60, 70], false);
    expect(populated.className).toBe("trend-strip");
    expect(populated.ariaLabel).toContain("Sun: 70%");
  });

  it("maps compact canvas empty state classes", () => {
    expect(overviewCanvasEmptyClassName()).toContain("state-message--canvas-compact");
  });
});
