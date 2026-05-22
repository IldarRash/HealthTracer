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
    },
  },
  defaultVariants: {
    tone: "neutral",
  },
});

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { badgeVariants };
