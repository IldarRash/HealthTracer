"use client";

import {
  type HTMLAttributes,
  type ReactElement,
} from "react";
import {
  type PlanFactItem,
  formatPlanRevisionTimestamp,
} from "../../lib/plan-view-ui-state";
import { cn } from "../../lib/utils";

type PlanFactsProps = HTMLAttributes<HTMLDListElement> & {
  items: readonly PlanFactItem[];
};

export function PlanFacts({ items, className, ...props }: PlanFactsProps): ReactElement {
  return (
    <dl className={cn("plan-view__facts training-meta", className)} {...props}>
      {items.map((item) => (
        <div key={item.term} className="plan-view__fact">
          <dt>{item.term}</dt>
          <dd>{item.description}</dd>
        </div>
      ))}
    </dl>
  );
}

export { formatPlanRevisionTimestamp };
