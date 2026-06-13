import { describe, expect, it } from "vitest";
import type { SleepNightSummary, SleepOverviewResponse } from "@health/types";
import {
  SLEEP_TARGET_HIGH_MINUTES,
  SLEEP_TARGET_LOW_MINUTES,
  buildSleepBarPoints,
  buildSleepHeroView,
  buildSleepNightRows,
  buildSleepStageSegments,
  formatSleepDuration,
  formatTimeShort,
  sleepHasData,
} from "./sleep-ui-state.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeNight(overrides: Partial<SleepNightSummary> = {}): SleepNightSummary {
  return {
    date: "2026-06-01",
    durationMinutes: 450,
    windowStart: "2026-05-31T23:00:00.000Z",
    windowEnd: "2026-06-01T06:30:00.000Z",
    stageSummary: {
      deepMinutes: 90,
      remMinutes: 110,
      lightMinutes: 220,
      awakeMinutes: 30,
    },
    ...overrides,
  };
}

function makeOverview(overrides: Partial<SleepOverviewResponse> = {}): SleepOverviewResponse {
  return {
    lastNight: null,
    trend: [],
    sevenDayAverageMinutes: null,
    recentNights: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// SLEEP_TARGET_LOW_MINUTES / SLEEP_TARGET_HIGH_MINUTES thresholds
// ---------------------------------------------------------------------------

describe("SLEEP_TARGET thresholds", () => {
  it("low threshold is 7 hours (420 minutes)", () => {
    expect(SLEEP_TARGET_LOW_MINUTES).toBe(420);
  });

  it("high threshold is 9 hours (540 minutes)", () => {
    expect(SLEEP_TARGET_HIGH_MINUTES).toBe(540);
  });
});

// ---------------------------------------------------------------------------
// formatSleepDuration
// ---------------------------------------------------------------------------

describe("formatSleepDuration", () => {
  it("returns em dash for null", () => {
    expect(formatSleepDuration(null)).toBe("—");
  });

  it("returns em dash for undefined", () => {
    expect(formatSleepDuration(undefined)).toBe("—");
  });

  it("returns em dash for zero", () => {
    expect(formatSleepDuration(0)).toBe("—");
  });

  it("returns em dash for negative values", () => {
    expect(formatSleepDuration(-30)).toBe("—");
  });

  it("formats whole hours with no minutes part", () => {
    expect(formatSleepDuration(480)).toBe("8h");
  });

  it("formats sub-hour durations without hour prefix", () => {
    expect(formatSleepDuration(45)).toBe("45m");
  });

  it("formats hours and minutes together", () => {
    expect(formatSleepDuration(7 * 60 + 32)).toBe("7h 32m");
  });

  it("formats 1 minute", () => {
    expect(formatSleepDuration(1)).toBe("1m");
  });

  it("formats exactly on the target boundaries", () => {
    // 7h = 420 min, 9h = 540 min
    expect(formatSleepDuration(420)).toBe("7h");
    expect(formatSleepDuration(540)).toBe("9h");
  });
});

// ---------------------------------------------------------------------------
// formatTimeShort
// ---------------------------------------------------------------------------

describe("formatTimeShort", () => {
  it("returns em dash for null", () => {
    expect(formatTimeShort(null)).toBe("—");
  });

  it("returns em dash for undefined", () => {
    expect(formatTimeShort(undefined)).toBe("—");
  });

  it("returns em dash for an empty string", () => {
    expect(formatTimeShort("")).toBe("—");
  });

  it("returns em dash for an unparseable string", () => {
    expect(formatTimeShort("not-a-date")).toBe("—");
  });

  it("returns a non-empty string for a valid ISO datetime", () => {
    // The exact formatted value depends on the local timezone in CI, so we
    // verify shape rather than a fixed string.
    const result = formatTimeShort("2026-06-01T06:30:00.000Z");
    expect(result).not.toBe("—");
    // Must match "HH:MM" pattern (24-hour, hour12: false).
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// buildSleepBarPoints
// ---------------------------------------------------------------------------

describe("buildSleepBarPoints", () => {
  it("returns an empty array for an empty trend", () => {
    expect(buildSleepBarPoints([])).toEqual([]);
  });

  it("orders points oldest → newest", () => {
    const points = buildSleepBarPoints([
      { date: "2026-06-03", durationMinutes: 420 },
      { date: "2026-06-01", durationMinutes: 480 },
      { date: "2026-06-02", durationMinutes: 300 },
    ]);
    expect(points.map((p) => p.date)).toEqual(["2026-06-01", "2026-06-02", "2026-06-03"]);
  });

  it("includes date, minutes, a non-empty label, and a formatted durationLabel", () => {
    const [point] = buildSleepBarPoints([{ date: "2026-06-01", durationMinutes: 452 }]);
    expect(point!.date).toBe("2026-06-01");
    expect(point!.minutes).toBe(452);
    expect(point!.label).toBeTruthy();
    expect(point!.durationLabel).toBe("7h 32m");
  });

  it("marks meetsTarget true when duration is within 7–9 h band (inclusive)", () => {
    const within = buildSleepBarPoints([{ date: "2026-06-01", durationMinutes: 480 }]);
    expect(within[0]!.meetsTarget).toBe(true);

    const exact_low = buildSleepBarPoints([{ date: "2026-06-01", durationMinutes: 420 }]);
    expect(exact_low[0]!.meetsTarget).toBe(true);

    const exact_high = buildSleepBarPoints([{ date: "2026-06-01", durationMinutes: 540 }]);
    expect(exact_high[0]!.meetsTarget).toBe(true);
  });

  it("marks meetsTarget false when duration falls outside the 7–9 h band", () => {
    const too_short = buildSleepBarPoints([{ date: "2026-06-01", durationMinutes: 360 }]);
    expect(too_short[0]!.meetsTarget).toBe(false);

    const too_long = buildSleepBarPoints([{ date: "2026-06-01", durationMinutes: 600 }]);
    expect(too_long[0]!.meetsTarget).toBe(false);
  });

  it("formats durationLabel as em dash for zero minutes", () => {
    const [point] = buildSleepBarPoints([{ date: "2026-06-01", durationMinutes: 0 }]);
    expect(point!.durationLabel).toBe("—");
    expect(point!.meetsTarget).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildSleepStageSegments
// ---------------------------------------------------------------------------

describe("buildSleepStageSegments", () => {
  it("returns null for null stageSummary", () => {
    expect(buildSleepStageSegments(null)).toBeNull();
  });

  it("returns null when all stage values are null/zero", () => {
    expect(
      buildSleepStageSegments({
        deepMinutes: null,
        remMinutes: null,
        lightMinutes: null,
        awakeMinutes: null,
      }),
    ).toBeNull();

    expect(
      buildSleepStageSegments({
        deepMinutes: 0,
        remMinutes: 0,
        lightMinutes: 0,
        awakeMinutes: 0,
      }),
    ).toBeNull();
  });

  it("returns 4 segments in deep → REM → light → awake order", () => {
    const segments = buildSleepStageSegments({
      deepMinutes: 90,
      remMinutes: 110,
      lightMinutes: 220,
      awakeMinutes: 30,
    })!;
    expect(segments).not.toBeNull();
    expect(segments.map((s) => s.key)).toEqual(["deep", "rem", "light", "awake"]);
  });

  it("computes correct percentages that sum to approximately 100", () => {
    // 90 + 110 + 220 + 30 = 450 total minutes
    const segments = buildSleepStageSegments({
      deepMinutes: 90,
      remMinutes: 110,
      lightMinutes: 220,
      awakeMinutes: 30,
    })!;
    const sum = segments.reduce((acc, s) => acc + s.pct, 0);
    // Rounded percentages can add to 99–101 due to rounding
    expect(sum).toBeGreaterThanOrEqual(99);
    expect(sum).toBeLessThanOrEqual(101);

    // Individual checks for known proportions
    expect(segments.find((s) => s.key === "deep")!.pct).toBe(Math.round((90 / 450) * 100));
    expect(segments.find((s) => s.key === "awake")!.pct).toBe(Math.round((30 / 450) * 100));
  });

  it("assigns distinct colors to each stage key", () => {
    const segments = buildSleepStageSegments({
      deepMinutes: 60,
      remMinutes: 60,
      lightMinutes: 60,
      awakeMinutes: 60,
    })!;
    const colors = segments.map((s) => s.color);
    // All colors should be defined strings
    for (const color of colors) {
      expect(color).toBeTruthy();
    }
    // deep and rem should have different colors (sanity check that map is wired)
    expect(colors[0]).not.toBe(colors[1]);
  });

  it("handles a single non-zero stage", () => {
    const segments = buildSleepStageSegments({
      deepMinutes: 120,
      remMinutes: null,
      lightMinutes: null,
      awakeMinutes: null,
    })!;
    expect(segments).not.toBeNull();
    expect(segments.find((s) => s.key === "deep")!.pct).toBe(100);
    expect(segments.find((s) => s.key === "rem")!.pct).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildSleepHeroView
// ---------------------------------------------------------------------------

describe("buildSleepHeroView", () => {
  it("builds the hero view from a full SleepNightSummary", () => {
    const view = buildSleepHeroView(makeNight());
    expect(view.durationLabel).toBe("7h 30m");
    // date label: "Jun 1"
    expect(view.date).toContain("Jun 1");
    // bed/wake labels are non-empty strings in HH:MM format or em dash
    expect(view.bedLabel).toMatch(/^\d{2}:\d{2}$|^—$/);
    expect(view.wakeLabel).toMatch(/^\d{2}:\d{2}$|^—$/);
    // stage segments are present because stageSummary has non-zero values
    expect(view.stageSegments).not.toBeNull();
    expect(view.stageSegments!.length).toBe(4);
  });

  it("returns stageSegments null when stageSummary is null", () => {
    const view = buildSleepHeroView(makeNight({ stageSummary: null }));
    expect(view.stageSegments).toBeNull();
  });

  it("returns em dashes for null windowStart/windowEnd", () => {
    const view = buildSleepHeroView(
      makeNight({ windowStart: null, windowEnd: null }),
    );
    expect(view.bedLabel).toBe("—");
    expect(view.wakeLabel).toBe("—");
  });

  it("returns em dash durationLabel for zero duration", () => {
    const view = buildSleepHeroView(makeNight({ durationMinutes: 0 }));
    expect(view.durationLabel).toBe("—");
  });
});

// ---------------------------------------------------------------------------
// buildSleepNightRows
// ---------------------------------------------------------------------------

describe("buildSleepNightRows", () => {
  it("returns empty array for empty nights input", () => {
    expect(buildSleepNightRows([])).toEqual([]);
  });

  it("maps each night to a row with the expected shape", () => {
    const rows = buildSleepNightRows([makeNight()]);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.date).toBe("2026-06-01");
    expect(row.dateLabel).toContain("Jun 1");
    expect(row.durationLabel).toBe("7h 30m");
    expect(row.bedLabel).toMatch(/^\d{2}:\d{2}$|^—$/);
    expect(row.wakeLabel).toMatch(/^\d{2}:\d{2}$|^—$/);
  });

  it("marks meetsTarget correctly for rows within / outside the target band", () => {
    const rows = buildSleepNightRows([
      makeNight({ durationMinutes: 480 }),  // 8h — within band
      makeNight({ durationMinutes: 360, date: "2026-06-02" }),  // 6h — short
      makeNight({ durationMinutes: 600, date: "2026-06-03" }),  // 10h — long
    ]);
    expect(rows[0]!.meetsTarget).toBe(true);
    expect(rows[1]!.meetsTarget).toBe(false);
    expect(rows[2]!.meetsTarget).toBe(false);
  });

  it("marks meetsTarget true at exact boundary values", () => {
    const rows = buildSleepNightRows([
      makeNight({ durationMinutes: 420 }),  // exactly 7h
      makeNight({ durationMinutes: 540, date: "2026-06-02" }),  // exactly 9h
    ]);
    expect(rows[0]!.meetsTarget).toBe(true);
    expect(rows[1]!.meetsTarget).toBe(true);
  });

  it("returns em dash durationLabel for zero duration night", () => {
    const rows = buildSleepNightRows([makeNight({ durationMinutes: 0 })]);
    expect(rows[0]!.durationLabel).toBe("—");
  });
});

// ---------------------------------------------------------------------------
// sleepHasData
// ---------------------------------------------------------------------------

describe("sleepHasData", () => {
  it("returns false when lastNight is null and trend is empty", () => {
    expect(sleepHasData(makeOverview())).toBe(false);
  });

  it("returns true when lastNight is present", () => {
    expect(sleepHasData(makeOverview({ lastNight: makeNight() }))).toBe(true);
  });

  it("returns true when trend has at least one point", () => {
    expect(
      sleepHasData(
        makeOverview({
          trend: [{ date: "2026-06-01", durationMinutes: 480 }],
        }),
      ),
    ).toBe(true);
  });

  it("returns true when both lastNight and trend are present", () => {
    expect(
      sleepHasData(
        makeOverview({
          lastNight: makeNight(),
          trend: [{ date: "2026-06-01", durationMinutes: 480 }],
        }),
      ),
    ).toBe(true);
  });
});
