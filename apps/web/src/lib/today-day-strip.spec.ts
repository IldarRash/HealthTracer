/**
 * Guard tests for the DayStrip "no fabricated metric" invariant.
 *
 * The DayStrip must use only a qualitative recovery band + focusMessage.
 * It must not render numeric percentages, readiness scores, or metric donuts.
 * These tests check the source files directly to ensure no fabricated values
 * are returned as render content.
 */

import { describe, it, expect } from "vitest";
import { buildRecoveryFocusView } from "./recovery-ui-state.js";
import type { RecoveryContextSnapshot } from "@health/types";

const TEST_UUID = "00000000-0000-0000-0000-000000000001";
const TEST_DATE = "2026-06-05";
const TEST_DT = "2026-06-05T00:00:00.000Z";

const makeSnapshot = (band: RecoveryContextSnapshot["payload"]["band"]): RecoveryContextSnapshot => ({
  id: TEST_UUID,
  userId: TEST_UUID,
  date: TEST_DATE,
  band,
  calculatedAt: TEST_DT,
  createdAt: TEST_DT,
  updatedAt: TEST_DT,
  payload: {
    band,
    dataSufficiency: "sufficient",
    focusMessage: "Keep a steady, controlled pace today.",
    signals: [],
  },
});

describe("DayStrip: no numeric readiness score in recovery view", () => {
  it("buildRecoveryFocusView produces bandLabel (qualitative text), not a numeric percentage", () => {
    const view = buildRecoveryFocusView(makeSnapshot("well_supported"));
    expect(view.bandLabel).toBeDefined();
    // Must be a qualitative string, not a number
    expect(typeof view.bandLabel).toBe("string");
    // Must not be a numeric value or contain a %
    expect(view.bandLabel).not.toMatch(/^\d+$/);
    expect(view.bandLabel).not.toContain("%");
  });

  it("focusMessage is the hint line, not a fabricated readiness score", () => {
    const view = buildRecoveryFocusView(makeSnapshot("moderate_load"));
    expect(typeof view.focusMessage).toBe("string");
    expect(view.focusMessage.length).toBeGreaterThan(0);
    // focusMessage must not look like a numeric metric value
    expect(view.focusMessage).not.toMatch(/^\d+%$/);
  });

  it("produces the correct band label for all bands without numeric values", () => {
    const bands = [
      "well_supported",
      "moderate_load",
      "prioritize_recovery",
      "insufficient_data",
    ] as const;

    for (const band of bands) {
      const view = buildRecoveryFocusView(makeSnapshot(band));
      // band label must be non-empty qualitative text
      expect(view.bandLabel.length).toBeGreaterThan(0);
      expect(view.bandLabel).not.toMatch(/\d+%/);
    }
  });
});

describe("DayStrip: recovery band chip categories only (no sleep, no energy-reserve)", () => {
  it("bandLabel covers only the four known qualitative bands", () => {
    const validLabels = [
      "Solid recovery support",
      "Moderate load",
      "Prioritize recovery",
      "Building picture",
    ];

    const bands = [
      "well_supported",
      "moderate_load",
      "prioritize_recovery",
      "insufficient_data",
    ] as const;

    for (const band of bands) {
      const view = buildRecoveryFocusView(makeSnapshot(band));
      expect(validLabels).toContain(view.bandLabel);
    }
  });
});
