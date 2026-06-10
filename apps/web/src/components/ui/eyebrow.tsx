/**
 * Eyebrow — shared uppercase label atom.
 *
 * Used for section labeling in cards and page headers. Replaces three
 * inline local Eyebrow functions: today-workspace.tsx, profile-workspace.tsx,
 * and the StepEyebrow/onboarding-step__eyebrow pattern in onboarding-workspace.tsx.
 *
 * Default color: tokens.color.light.mut2 (light world). Pass dark=true for
 * the dark-world muted tone (tokens.color.dark.mut).
 */

import type { CSSProperties, ReactNode } from "react";
import { tokens } from "@health/ui";

export type EyebrowProps = {
  children: ReactNode;
  /** Override color. If unset, applies theme-appropriate muted token. */
  color?: string;
  /** Dark-world variant — uses tokens.color.dark.mut. Default false (light world). */
  dark?: boolean;
  style?: CSSProperties;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
};

export function Eyebrow({ children, color, dark = false, style, className, "aria-hidden": ariaHidden }: EyebrowProps) {
  const resolvedColor = color ?? (dark ? tokens.color.dark.mut : tokens.color.light.mut2);
  return (
    <div
      className={className}
      aria-hidden={ariaHidden}
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        color: resolvedColor,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
