/**
 * IconBadge — rounded square with a color-mix tinted background and a centered Icon.
 * Used across Longevity, Training, and Nutrition dark-world screens.
 */

import { type HTMLAttributes, type ReactElement } from "react";
import { cn } from "../../lib/utils";
import { Icon, type IconName } from "./icon";

export type IconBadgeProps = HTMLAttributes<HTMLDivElement> & {
  icon: IconName;
  color: string;
  /** Badge size in px (defaults to 28; icon will be size - 12). */
  size?: number;
  /** Border radius in px (defaults to 8). */
  radius?: number;
};

export function IconBadge({
  icon,
  color,
  size = 28,
  radius = 8,
  className,
  ...props
}: IconBadgeProps): ReactElement {
  return (
    <div
      aria-hidden="true"
      className={cn("icon-badge", className)}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        flexShrink: 0,
      }}
      {...props}
    >
      <Icon name={icon} size={size - 12} stroke={color} />
    </div>
  );
}
