import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const cardVariants = cva("card", {
  variants: {
    variant: {
      default: "",
      wide: "card-wide",
      flat: "card-flat",
      dashboard: "dashboard-card",
      confirmation: "confirmation-card",
      nested: "nested-card",
    },
    padding: {
      default: "",
      none: "card-padding-none",
      sm: "card-padding-sm",
    },
  },
  defaultVariants: {
    variant: "default",
    padding: "default",
  },
});

export type CardProps = HTMLAttributes<HTMLElement> & VariantProps<typeof cardVariants>;

export const Card = forwardRef<HTMLElement, CardProps>(
  ({ className, variant, padding, ...props }, ref) => (
    <article ref={ref} className={cn(cardVariants({ variant, padding }), className)} {...props} />
  ),
);

Card.displayName = "Card";

export { cardVariants };
