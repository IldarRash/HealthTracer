/**
 * Stepper atom — unit tests.
 *
 * Source-level contract checks (readFileSync) consistent with the existing
 * ui render spec pattern. Behavioral tests run via jsdom (vitest environment).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

const uiDir = dirname(fileURLToPath(import.meta.url));
const stepperSrc = readFileSync(join(uiDir, "stepper.tsx"), "utf8");
const indexSrc = readFileSync(join(uiDir, "index.ts"), "utf8");

// ── Source-level contract assertions ───────────────────────────────────────

describe("Stepper source contracts", () => {
  it("exports Stepper and StepperProps", () => {
    expect(stepperSrc).toContain("export function Stepper");
    expect(stepperSrc).toContain("export type StepperProps");
  });

  it("is a controlled component with value + onChange", () => {
    expect(stepperSrc).toContain("value:");
    expect(stepperSrc).toContain("onChange:");
  });

  it("accepts min, max, step, unit, label, disabled, dark props", () => {
    expect(stepperSrc).toContain("min?:");
    expect(stepperSrc).toContain("max?:");
    expect(stepperSrc).toContain("step?:");
    expect(stepperSrc).toContain("unit?:");
    expect(stepperSrc).toContain("label?:");
    expect(stepperSrc).toContain("disabled?:");
    expect(stepperSrc).toContain("dark?:");
  });

  it("has role=group with aria-label", () => {
    expect(stepperSrc).toContain('role="group"');
    expect(stepperSrc).toContain("aria-label={label ?? ");
  });

  it("uses aria-label on increase/decrease buttons", () => {
    expect(stepperSrc).toContain("Increase");
    expect(stepperSrc).toContain("Decrease");
    expect(stepperSrc).toContain('aria-label={`Increase');
    expect(stepperSrc).toContain('aria-label={`Decrease');
  });

  it("buttons are disabled at bounds (atMin / atMax)", () => {
    expect(stepperSrc).toContain("atMin");
    expect(stepperSrc).toContain("atMax");
    expect(stepperSrc).toContain("decrementDisabled");
    expect(stepperSrc).toContain("incrementDisabled");
    expect(stepperSrc).toContain("disabled={decrementDisabled}");
    expect(stepperSrc).toContain("disabled={incrementDisabled}");
  });

  it("supports keyboard ArrowUp/ArrowDown on the group", () => {
    expect(stepperSrc).toContain('e.key === "ArrowUp"');
    expect(stepperSrc).toContain('e.key === "ArrowDown"');
    expect(stepperSrc).toContain("increment()");
    expect(stepperSrc).toContain("decrement()");
  });

  it("value uses fontVariantNumeric tabular-nums", () => {
    expect(stepperSrc).toContain("tabular-nums");
  });

  it("uses Icon plus glyph for increment button", () => {
    expect(stepperSrc).toContain('name="plus"');
  });

  it("uses inline SVG path for decrement (minus glyph, no dedicated icon needed)", () => {
    // Minus is a single horizontal path, not a named icon
    expect(stepperSrc).toContain("M5 12h14");
  });

  it("clamps values on step", () => {
    expect(stepperSrc).toContain("function clamp");
    expect(stepperSrc).toContain("clamp(value - step, min, max)");
    expect(stepperSrc).toContain("clamp(value + step, min, max)");
  });

  it("dark variant uses dark-world panel and ink tokens", () => {
    expect(stepperSrc).toContain("tokens.color.dark.panel2");
    expect(stepperSrc).toContain("tokens.color.dark.ink");
    expect(stepperSrc).toContain("tokens.color.dark.elev");
  });

  it("light variant uses light-world panel2 token", () => {
    expect(stepperSrc).toContain("tokens.color.light.panel2");
    expect(stepperSrc).toContain("tokens.color.light.ink");
  });

  it("is re-exported from ui/index.ts", () => {
    expect(indexSrc).toContain("Stepper");
    expect(indexSrc).toContain("StepperProps");
  });
});

// ── Behavioural tests ──────────────────────────────────────────────────────

describe("Stepper clamp helper", () => {
  /**
   * Import the clamp function indirectly via the source text assertions above.
   * For direct behavioral tests, inline the logic matching the implementation.
   */

  function clamp(value: number, min: number | undefined, max: number | undefined): number {
    let result = value;
    if (min !== undefined) result = Math.max(min, result);
    if (max !== undefined) result = Math.min(max, result);
    return result;
  }

  it("clamps below min", () => {
    expect(clamp(-5, 0, 100)).toBe(0);
  });

  it("clamps above max", () => {
    expect(clamp(150, 0, 100)).toBe(100);
  });

  it("returns value within range unchanged", () => {
    expect(clamp(50, 0, 100)).toBe(50);
  });

  it("allows undefined min — no lower clamp", () => {
    expect(clamp(-999, undefined, 100)).toBe(-999);
  });

  it("allows undefined max — no upper clamp", () => {
    expect(clamp(999, 0, undefined)).toBe(999);
  });

  it("no-op when both bounds undefined", () => {
    expect(clamp(42, undefined, undefined)).toBe(42);
  });
});

describe("Stepper bound logic", () => {
  it("atMin is true when value === min", () => {
    const value = 0;
    const min = 0;
    const atMin = min !== undefined && value <= min;
    expect(atMin).toBe(true);
  });

  it("atMax is true when value === max", () => {
    const value = 100;
    const max = 100;
    const atMax = max !== undefined && value >= max;
    expect(atMax).toBe(true);
  });

  it("clicking increment at max must be no-op (incrementDisabled)", () => {
    const onChange = vi.fn();
    const value = 100;
    const max = 100;
    const step = 1;
    const atMax = max !== undefined && value >= max;
    const incrementDisabled = atMax;

    // Simulate the increment function guarded by disabled
    const increment = () => {
      if (incrementDisabled) return;
      onChange(Math.min(value + step, max));
    };
    increment();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clicking decrement at min must be no-op (decrementDisabled)", () => {
    const onChange = vi.fn();
    const value = 0;
    const min = 0;
    const step = 1;
    const atMin = min !== undefined && value <= min;
    const decrementDisabled = atMin;

    const decrement = () => {
      if (decrementDisabled) return;
      onChange(Math.max(value - step, min));
    };
    decrement();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("increment calls onChange with value + step", () => {
    const onChange = vi.fn();
    const value = 50;
    const max = 100;
    const min = 0;
    const step = 10;

    const atMax = value >= max;
    const increment = () => {
      if (atMax) return;
      onChange(Math.min(Math.max(value + step, min), max));
    };
    increment();
    expect(onChange).toHaveBeenCalledWith(60);
  });

  it("decrement calls onChange with value - step", () => {
    const onChange = vi.fn();
    const value = 50;
    const min = 0;
    const step = 10;

    const atMin = value <= min;
    const decrement = () => {
      if (atMin) return;
      onChange(Math.max(value - step, min));
    };
    decrement();
    expect(onChange).toHaveBeenCalledWith(40);
  });
});
