/**
 * Stat — big number + unit + label + sub.
 *
 * Used for weight/BMI in BodyComposition (dark instrument) and for nutrition
 * macro totals. Supports both dark-instrument and light surfaces via the
 * `dark` prop (default: true — designed for dark cards).
 */

import { type HTMLAttributes, type ReactElement } from "react";
import { cn } from "../../lib/utils";
import { tokens } from "@health/ui";

export type StatTone = "good" | "muted" | "default";

export type StatProps = HTMLAttributes<HTMLDivElement> & {
  /** Big number value. */
  value: string | number;
  /** Small inline unit, e.g. "кг", "%" */
  unit?: string;
  /** Uppercase small label below the value, e.g. "Вес", "ИМТ" */
  label: string;
  /** Delta/sub line, e.g. "−1.2 кг за 30 дней", "норма" */
  sub?: string;
  /** 'good' → metric.green; otherwise muted. */
  subTone?: StatTone;
  /** Dark-instrument vs. light variant. Default true. */
  dark?: boolean;
};

function subColor(tone: StatTone, dark: boolean): string {
  if (tone === "good") return tokens.color.metric.green;
  return dark ? tokens.color.dark.mut : tokens.color.light.mut;
}

export function Stat({
  value,
  unit,
  label,
  sub,
  subTone = "muted",
  dark = true,
  className,
  ...props
}: StatProps): ReactElement {
  const inkColor = dark ? tokens.color.dark.ink : tokens.color.light.ink;
  const mutColor = dark ? tokens.color.dark.mut : tokens.color.light.mut;

  return (
    <div className={cn("stat", dark ? "stat--dark" : "stat--light", className)} {...props}>
      <div className="stat__value-row">
        <span
          className="stat__value"
          style={{ color: inkColor, fontVariantNumeric: "tabular-nums" }}
        >
          {value}
        </span>
        {unit != null ? (
          <span className="stat__unit" style={{ color: mutColor }}>
            {unit}
          </span>
        ) : null}
      </div>
      <span
        className="stat__label"
        style={{
          color: mutColor,
          fontSize: tokens.typography.sectionLabel.size,
          fontWeight: tokens.typography.sectionLabel.weight,
          letterSpacing: tokens.typography.sectionLabel.letterSpacing,
          textTransform: tokens.typography.sectionLabel.transform,
        }}
      >
        {label}
      </span>
      {sub != null ? (
        <span
          className="stat__sub"
          style={{ color: subColor(subTone, dark) }}
        >
          {sub}
        </span>
      ) : null}
    </div>
  );
}
