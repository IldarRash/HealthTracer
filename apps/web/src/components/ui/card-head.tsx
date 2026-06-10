/**
 * CardHead — shared card section header atom.
 *
 * Layout: [26×26 radius-8 icon tile (optional)] [13.5/700 title flex:1] [right slot]
 *
 * Replaces the inline CardHead function in today-workspace.tsx (dark world)
 * and profile-workspace.tsx (light world). Dark variant uses dark ink/muted
 * tokens; light variant uses light world tokens.
 *
 * Spec: 26×26 icon tile with radius 8, background icon-color at 13% opacity,
 * 15px Icon, title fontSize 13.5 fontWeight 700 letterSpacing 0.2.
 */

import type { ReactNode } from "react";
import { tokens } from "@health/ui";
import { Icon, type IconName } from "./icon";

export type CardHeadProps = {
  title: string;
  icon?: IconName;
  /** Accent color for the icon tile. Defaults to theme-muted. */
  color?: string;
  /** Right-aligned slot (badge, button, etc.) */
  right?: ReactNode;
  /** Dark-world variant. Default false (light world). */
  dark?: boolean;
};

export function CardHead({ title, icon, color, right, dark = false }: CardHeadProps) {
  const mutColor = dark ? tokens.color.dark.mut : tokens.color.light.mut;
  const inkColor = dark ? tokens.color.dark.ink : tokens.color.light.ink;
  const iconColor = color ?? mutColor;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        marginBottom: 14,
      }}
    >
      {icon ? (
        <div
          aria-hidden="true"
          style={{
            width: 26,
            height: 26,
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            background: `${iconColor}22`,
          }}
        >
          <Icon name={icon} size={15} stroke={iconColor} />
        </div>
      ) : null}
      <span
        style={{
          fontSize: 13.5,
          fontWeight: 700,
          letterSpacing: 0.2,
          color: inkColor,
          flex: 1,
        }}
      >
        {title}
      </span>
      {right}
    </div>
  );
}
