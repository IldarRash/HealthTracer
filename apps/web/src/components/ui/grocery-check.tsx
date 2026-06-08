/**
 * GroceryCheck — SQUARE checkbox row marker for the grocery list (C3).
 *
 * Deliberate square sibling of CheckCircle (borderRadius 6 vs 50%).
 * Designed for the light grocery surface — unchecked border uses the
 * light.line2 token (#e2e2df).
 *
 * When `onChange` is provided: accessible interactive checkbox
 * (button role="checkbox", keyboard-focusable, Space/Enter toggles).
 * When `onChange` is omitted: static aria-hidden marker.
 *
 * BOUNDARY: toggling "bought" state must NEVER write a plan revision.
 * That boundary is enforced in the C3 screen, not here.
 */

import { type ReactElement } from "react";
import { cn } from "../../lib/utils";
import { tokens } from "@health/ui";
import { Icon } from "./icon";

export type GroceryCheckProps = {
  checked: boolean;
  onChange?: (next: boolean) => void;
  size?: number;
  label?: string;
  className?: string;
};

export function GroceryCheck({
  checked,
  onChange,
  size = 20,
  label,
  className,
}: GroceryCheckProps): ReactElement {
  const boxStyle = {
    width: size,
    height: size,
    borderRadius: 6, // square — the load-bearing difference from CheckCircle's '50%'
    flexShrink: 0 as const,
    display: "flex" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    background: checked ? tokens.color.metric.green : "transparent",
    border: checked ? "none" : `2px solid ${tokens.color.light.line2}`,
    cursor: onChange != null ? "pointer" : "default",
    outline: "none" as const,
  } as const;

  if (onChange != null) {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={label}
        className={cn("grocery-check grocery-check--interactive", className)}
        style={boxStyle}
        onClick={() => onChange(!checked)}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            onChange(!checked);
          }
        }}
      >
        {checked ? (
          <Icon
            name="checkSm"
            size={Math.round(size * 0.6)}
            stroke="#04130c"
            sw={2.6}
            aria-hidden
          />
        ) : null}
      </button>
    );
  }

  // Static presentational marker — parent owns semantics
  return (
    <div
      className={cn("grocery-check", className)}
      style={boxStyle}
      aria-hidden="true"
    >
      {checked ? (
        <Icon
          name="checkSm"
          size={Math.round(size * 0.6)}
          stroke="#04130c"
          sw={2.6}
          aria-hidden
        />
      ) : null}
    </div>
  );
}
