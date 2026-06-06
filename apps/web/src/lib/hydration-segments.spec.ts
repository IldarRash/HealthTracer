import { describe, it, expect } from "vitest";
import {
  hydrationSegments,
  hydrationLabel,
  WATER_SEGMENT_COUNT,
} from "./hydration-segments.js";

describe("hydrationSegments", () => {
  it("constant is 8", () => {
    expect(WATER_SEGMENT_COUNT).toBe(8);
  });

  it("returns 0 when consumed is null", () => {
    expect(hydrationSegments(null, 2.5)).toBe(0);
  });

  it("returns 0 when target is null", () => {
    expect(hydrationSegments(1.0, null)).toBe(0);
  });

  it("returns 0 when target is 0", () => {
    expect(hydrationSegments(1.0, 0)).toBe(0);
  });

  it("maps consumed=0 to 0 segments", () => {
    expect(hydrationSegments(0, 2.0)).toBe(0);
  });

  it("maps half consumed to 4 segments", () => {
    expect(hydrationSegments(1.0, 2.0)).toBe(4);
  });

  it("maps full consumption to 8 segments", () => {
    expect(hydrationSegments(2.5, 2.5)).toBe(8);
  });

  it("clamps overconsumption to 8 segments", () => {
    expect(hydrationSegments(5.0, 2.5)).toBe(8);
  });

  it("correctly rounds 3/8 of target", () => {
    // 0.75 / 2 = 0.375 → round to 3
    expect(hydrationSegments(0.75, 2.0)).toBe(3);
  });

  it("rounds 1/8 of target to 1 segment", () => {
    // 0.25 / 2 = 0.125 → round to 1
    expect(hydrationSegments(0.25, 2.0)).toBe(1);
  });

  it("rounds 5/8 of target", () => {
    // 1.25 / 2 = 0.625 → round to 5
    expect(hydrationSegments(1.25, 2.0)).toBe(5);
  });
});

describe("hydrationLabel", () => {
  it("formats consumed and target with L suffix", () => {
    expect(hydrationLabel(1.5, 2.5)).toBe("1.5 / 2.5 L");
  });

  it("shows 0 when consumed is null", () => {
    expect(hydrationLabel(null, 2.5)).toBe("0 / 2.5 L");
  });

  it("shows ? when target is null", () => {
    expect(hydrationLabel(1.0, null)).toBe("1.0 / ? L");
  });
});
