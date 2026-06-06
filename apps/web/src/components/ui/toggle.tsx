"use client";

import { useId } from "react";
import { cn } from "../../lib/utils";

export type ToggleProps = {
  /** Controlled on/off state */
  checked: boolean;
  /** Change handler — receives the new checked value */
  onChange: (checked: boolean) => void;
  /** Accessible label (sr-only when labelHidden is true) */
  label: string;
  /** Hide the label text visually (it remains for screen readers) */
  labelHidden?: boolean;
  disabled?: boolean;
  className?: string;
  /** Optional explicit id; auto-generated if omitted */
  id?: string;
};

/**
 * Toggle — pill switch with sliding knob.
 * On-color: semantic green (--color-coach-500).
 * Dimensions: ~40×23px track, 17px knob.
 * Conforms to the design kit Toggle(on, color) atom.
 */
export function Toggle({
  checked,
  onChange,
  label,
  labelHidden = false,
  disabled = false,
  className,
  id: explicitId,
}: ToggleProps) {
  const generatedId = useId();
  const inputId = explicitId ?? generatedId;

  return (
    <label
      htmlFor={inputId}
      className={cn("toggle", checked && "toggle--on", disabled && "toggle--disabled", className)}
    >
      <input
        id={inputId}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        className="sr-only"
        aria-checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="toggle__track" aria-hidden>
        <span className="toggle__knob" />
      </span>
      <span className={labelHidden ? "sr-only" : "toggle__label"}>{label}</span>
    </label>
  );
}
