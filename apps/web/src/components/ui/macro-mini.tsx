/**
 * MacroMini — Б/У/Ж colored square indicators + values.
 *
 * Used for per-meal macro rows (C1) and macro totals. Colors are fixed
 * semantic: protein→green, carbs→blue, fat→indigo (M-scale).
 *
 * Accessibility: a wrapping aria-label conveys the full macro text so
 * the colored squares are decorative (aria-hidden). Color-independence
 * is satisfied: each item also carries a text label (Б/У/Ж).
 */

import { type HTMLAttributes, type ReactElement } from "react";
import { cn } from "../../lib/utils";
import { tokens } from "@health/ui";

export type MacroMiniProps = HTMLAttributes<HTMLDivElement> & {
  protein: number;
  carbs: number;
  fat: number;
  /** Render "г" micro-label per item. Default: true. */
  showUnit?: boolean;
  /** Colored square side in px. Default: 9. */
  size?: number;
};

// Fixed semantic mapping: protein→green, carbs→blue, fat→indigo
const MACRO_DEFS = [
  { key: "protein" as const, letter: "Б", colorKey: "green" as const },
  { key: "carbs" as const, letter: "У", colorKey: "blue" as const },
  { key: "fat" as const, letter: "Ж", colorKey: "indigo" as const },
] as const;

export function MacroMini({
  protein,
  carbs,
  fat,
  showUnit = true,
  size = 9,
  className,
  ...props
}: MacroMiniProps): ReactElement {
  const values = { protein, carbs, fat };

  const ariaLabel = `Белок ${protein} г, углеводы ${carbs} г, жиры ${fat} г`;

  return (
    <div
      className={cn("macro-mini", className)}
      aria-label={ariaLabel}
      {...props}
    >
      {MACRO_DEFS.map(({ key, letter, colorKey }) => {
        const color = tokens.color.metric[colorKey];
        return (
          <div key={key} className="macro-mini__item" aria-hidden="true">
            {/* Colored square — radius ~2 */}
            <span
              className="macro-mini__square"
              style={{
                width: size,
                height: size,
                borderRadius: 2,
                background: color,
                flexShrink: 0,
                display: "inline-block",
              }}
            />
            <span
              className="macro-mini__value"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {values[key]}
            </span>
            {showUnit ? (
              <span className="macro-mini__unit">
                {letter} · г
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
