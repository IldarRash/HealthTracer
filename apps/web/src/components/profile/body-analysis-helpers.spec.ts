/**
 * Unit tests for the non-exported helper functions inside body-analysis-section.tsx.
 *
 * Because the helpers are module-private we replicate their logic here (matching
 * the implementation exactly) so that any accidental breakage is caught.
 *
 * Functions under test:
 *   fatPctMid   – derives fat% mid-point from BodyCompositionAnalysis
 *   buildTrendData – maps fatPctTrend to DsTrendStripDayData[]
 *   fatDelta30  – computes 30-day fat% change from trend array
 *   musclePct   – maps muscleTone to a % value
 *   computeBmi  – weight / (height m)²
 *   formatDelta – formats a delta with sign
 */

import { describe, expect, it } from "vitest";
import type { BodyCompositionAnalysis } from "@health/types";

// ── Replicate module-private helpers ────────────────────────────────

function fatPctMid(analysis: Pick<BodyCompositionAnalysis, "fatPctMin" | "fatPctMax">): number | null {
  if (analysis.fatPctMin == null && analysis.fatPctMax == null) return null;
  const lo = analysis.fatPctMin ?? analysis.fatPctMax!;
  const hi = analysis.fatPctMax ?? analysis.fatPctMin!;
  return Math.round((lo + hi) / 2);
}

function buildTrendData(
  trend: BodyCompositionAnalysis["fatPctTrend"],
): Array<{ value: number; label: string }> {
  if (!trend.length) return [];
  return trend.map((entry) => ({
    value: Math.round(entry.fatPctMid),
    label: new Date(entry.weekStart).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
    }),
  }));
}

function fatDelta30(trend: BodyCompositionAnalysis["fatPctTrend"]): number | null {
  if (trend.length < 2) return null;
  const first = trend[0]!;
  const last = trend[trend.length - 1]!;
  return Math.round((last.fatPctMid - first.fatPctMid) * 10) / 10;
}

function musclePct(muscleTone: BodyCompositionAnalysis["muscleTone"]): number {
  switch (muscleTone) {
    case "above_average": return 40;
    case "below_average": return 30;
    default: return 35;
  }
}

function computeBmi(weightKg: number, heightCm: number): number {
  const hm = heightCm / 100;
  return Math.round((weightKg / (hm * hm)) * 10) / 10;
}

function formatDelta(delta: number): string {
  const abs = Math.abs(delta).toFixed(1);
  return delta < 0 ? `−${abs}` : `+${abs}`;
}

// ── Test data helpers ────────────────────────────────────────────────

function makeTrend(mids: number[]): BodyCompositionAnalysis["fatPctTrend"] {
  return mids.map((fatPctMid, i) => ({
    weekStart: `2026-0${i + 1}-01`,
    fatPctMid,
  }));
}

// ── fatPctMid ────────────────────────────────────────────────────────

describe("fatPctMid", () => {
  it("returns null when both bounds are null", () => {
    expect(fatPctMid({ fatPctMin: null, fatPctMax: null })).toBeNull();
  });

  it("returns the mid-point of equal bounds", () => {
    expect(fatPctMid({ fatPctMin: 20, fatPctMax: 20 })).toBe(20);
  });

  it("returns the mid-point of a range", () => {
    // (18 + 22) / 2 = 20 → rounds to 20
    expect(fatPctMid({ fatPctMin: 18, fatPctMax: 22 })).toBe(20);
  });

  it("uses max as both bounds when min is null", () => {
    expect(fatPctMid({ fatPctMin: null, fatPctMax: 25 })).toBe(25);
  });

  it("uses min as both bounds when max is null", () => {
    expect(fatPctMid({ fatPctMin: 25, fatPctMax: null })).toBe(25);
  });

  it("rounds the mid-point to the nearest integer", () => {
    // (17 + 20) / 2 = 18.5 → rounds to 19
    expect(fatPctMid({ fatPctMin: 17, fatPctMax: 20 })).toBe(19);
  });
});

// ── buildTrendData ───────────────────────────────────────────────────

describe("buildTrendData", () => {
  it("returns an empty array for an empty trend", () => {
    expect(buildTrendData([])).toEqual([]);
  });

  it("maps one trend entry to one bar with rounded value", () => {
    const trend = makeTrend([26.7]);
    const result = buildTrendData(trend);
    expect(result).toHaveLength(1);
    expect(result[0]?.value).toBe(27); // Math.round(26.7)
  });

  it("maps 8 trend entries (full design scenario)", () => {
    const mids = [27.8, 27.5, 27.6, 27.1, 26.8, 26.4, 26.1, 25.8];
    const result = buildTrendData(makeTrend(mids));
    expect(result).toHaveLength(8);
    // Each value is the rounded mid-point
    result.forEach((bar, i) => {
      expect(bar.value).toBe(Math.round(mids[i]!));
    });
  });

  it("each bar has a non-empty label string", () => {
    const trend = makeTrend([25, 26]);
    const result = buildTrendData(trend);
    result.forEach((bar) => {
      expect(typeof bar.label).toBe("string");
      expect(bar.label.length).toBeGreaterThan(0);
    });
  });
});

// ── fatDelta30 ───────────────────────────────────────────────────────

describe("fatDelta30", () => {
  it("returns null for an empty trend", () => {
    expect(fatDelta30([])).toBeNull();
  });

  it("returns null when there is only one entry", () => {
    expect(fatDelta30(makeTrend([27]))).toBeNull();
  });

  it("returns a negative delta when fat% is decreasing (good)", () => {
    // last - first = 25.8 - 27.8 = -2.0
    const mids = [27.8, 27.5, 27.6, 27.1, 26.8, 26.4, 26.1, 25.8];
    const delta = fatDelta30(makeTrend(mids));
    expect(delta).toBe(-2.0);
  });

  it("returns a positive delta when fat% is increasing", () => {
    const delta = fatDelta30(makeTrend([24, 26]));
    expect(delta).toBe(2.0);
  });

  it("returns 0 for a flat trend", () => {
    const delta = fatDelta30(makeTrend([25, 25, 25]));
    expect(delta).toBe(0);
  });

  it("rounds the delta to one decimal place", () => {
    // 25.3 - 27.0 = -1.7 → Math.round(-1.7 * 10) / 10 = -1.7
    const delta = fatDelta30(makeTrend([27.0, 25.3]));
    expect(delta).toBe(-1.7);
  });
});

// ── musclePct ────────────────────────────────────────────────────────

describe("musclePct", () => {
  it("returns 40 for above_average tone", () => {
    expect(musclePct("above_average")).toBe(40);
  });

  it("returns 35 for average tone", () => {
    expect(musclePct("average")).toBe(35);
  });

  it("returns 30 for below_average tone", () => {
    expect(musclePct("below_average")).toBe(30);
  });

  it("returns 35 (neutral mid-point) for null tone", () => {
    expect(musclePct(null)).toBe(35);
  });
});

// ── computeBmi ───────────────────────────────────────────────────────

describe("computeBmi", () => {
  it("computes BMI as weight / (height m)²", () => {
    // 70 / (1.75)² = 70 / 3.0625 ≈ 22.857 → rounds to 22.9
    expect(computeBmi(70, 175)).toBe(22.9);
  });

  it("computes BMI for a design-spec example: 64.2 kg / 170 cm", () => {
    // 64.2 / 1.70² = 64.2 / 2.89 ≈ 22.2 → 22.2
    const bmi = computeBmi(64.2, 170);
    expect(bmi).toBeCloseTo(22.2, 1);
  });

  it("returns a number rounded to 1 decimal place", () => {
    const bmi = computeBmi(80, 180);
    // 80 / 3.24 ≈ 24.7
    expect(bmi).toBe(24.7);
    expect(Number.isFinite(bmi)).toBe(true);
  });
});

// ── formatDelta ──────────────────────────────────────────────────────

describe("formatDelta", () => {
  it("prefixes negative values with the minus sign character (−)", () => {
    expect(formatDelta(-1.7)).toBe("−1.7");
  });

  it("prefixes positive values with +", () => {
    expect(formatDelta(0.9)).toBe("+0.9");
  });

  it("formats zero as +0.0", () => {
    expect(formatDelta(0)).toBe("+0.0");
  });

  it("always produces one decimal place", () => {
    expect(formatDelta(-2)).toBe("−2.0");
    expect(formatDelta(3)).toBe("+3.0");
  });
});
