import { cva, type VariantProps } from "class-variance-authority";
import { type HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const badgeVariants = cva("badge", {
  variants: {
    tone: {
      pending: "badge-pending",
      success: "badge-valid",
      error: "badge-invalid",
      info: "badge-info",
      neutral: "badge-neutral",
      // Metric-dim tones — work in both light and dark worlds via shared tokens
      green: "badge-green",
      amber: "badge-amber",
      red: "badge-red",
      blue: "badge-blue",
      indigo: "badge-indigo",
    },
    // Dark-world surface: rounds the pill shape up to match dark card chip style
    dark: {
      true: "badge--dark",
      false: "",
    },
  },
  defaultVariants: {
    tone: "neutral",
    dark: false,
  },
});

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, dark, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, dark }), className)} {...props} />;
}

export { badgeVariants };
