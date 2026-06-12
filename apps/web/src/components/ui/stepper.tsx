/**
 * Stepper — controlled ± numeric control atom.
 *
 * Synthesized from the edit-field row pattern in proposal.jsx and the kit
 * Btn soft tone (no literal prototype Stepper exists in the design files).
 *
 * Row layout: [label?] [− value+unit +]
 * - Buttons: 32×32, borderRadius 10, soft panel background (panel2 token).
 * - Value: fontSize 15, fontWeight 700, fontVariantNumeric tabular-nums.
 * - Clamped to min/max; buttons disabled at bounds.
 * - A11y: role="group" + aria-label; buttons aria-label "Increase/Decrease {label}";
 *   keyboard ArrowUp/ArrowDown adjusts value on focused group.
 */

import type { KeyboardEvent } from "react";
import { tokens } from "@health/ui";
import { Icon } from "./icon";

export type StepperProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Inline unit shown next to the value, e.g. "kcal", "g" */
  unit?: string;
  /** Label text shown to the left of the control row */
  label?: string;
  disabled?: boolean;
  /** Dark-world variant. Default false (light world). */
  dark?: boolean;
};

function clamp(value: number, min: number | undefined, max: number | undefined): number {
  let result = value;
  if (min !== undefined) result = Math.max(min, result);
  if (max !== undefined) result = Math.min(max, result);
  return result;
}

export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  label,
  disabled = false,
  dark = false,
}: StepperProps) {
  const atMin = min !== undefined && value <= min;
  const atMax = max !== undefined && value >= max;

  const bg = dark ? tokens.color.dark.panel2 : tokens.color.light.panel2;
  const inkColor = dark ? tokens.color.dark.ink : tokens.color.light.ink;
  const mutColor = dark ? tokens.color.dark.mut : tokens.color.light.mut;
  const btnBg = dark ? tokens.color.dark.elev : tokens.color.light.panel2;

  const decrement = () => {
    if (disabled || atMin) return;
    onChange(clamp(value - step, min, max));
  };

  const increment = () => {
    if (disabled || atMax) return;
    onChange(clamp(value + step, min, max));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      increment();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      decrement();
    }
  };

  const decrementDisabled = disabled || atMin;
  const incrementDisabled = disabled || atMax;

  const btnStyle = (isDisabled: boolean): React.CSSProperties => ({
    width: 32,
    height: 32,
    borderRadius: 10,
    background: btnBg,
    border: "none",
    cursor: isDisabled ? "not-allowed" : "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    opacity: isDisabled ? 0.4 : 1,
    color: inkColor,
  });

  return (
    <div
      role="group"
      aria-label={label ?? "Stepper"}
      aria-disabled={disabled || undefined}
      onKeyDown={handleKeyDown}
      tabIndex={disabled ? -1 : 0}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        outline: "none",
      }}
    >
      {label ? (
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: mutColor,
            flexShrink: 0,
          }}
        >
          {label}
        </span>
      ) : null}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: bg,
          borderRadius: 12,
          padding: "4px 8px",
        }}
      >
        <button
          type="button"
          aria-label={`Decrease${label ? ` ${label}` : ""}`}
          aria-disabled={decrementDisabled}
          disabled={decrementDisabled}
          onClick={decrement}
          style={btnStyle(decrementDisabled)}
        >
          {/* Minus glyph: horizontal stroke, consistent with Icon stroke conventions */}
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={inkColor} strokeWidth={1.7} strokeLinecap="round" aria-hidden>
            <path d="M5 12h14" />
          </svg>
        </button>

        <span
          style={{
            fontSize: 15,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            color: inkColor,
            minWidth: 32,
            textAlign: "center",
          }}
        >
          {value}
          {unit ? <span style={{ fontSize: 12, fontWeight: 500, color: mutColor, marginLeft: 2 }}>{unit}</span> : null}
        </span>

        <button
          type="button"
          aria-label={`Increase${label ? ` ${label}` : ""}`}
          aria-disabled={incrementDisabled}
          disabled={incrementDisabled}
          onClick={increment}
          style={btnStyle(incrementDisabled)}
        >
          <Icon name="plus" size={14} stroke={inkColor} />
        </button>
      </div>
    </div>
  );
}
