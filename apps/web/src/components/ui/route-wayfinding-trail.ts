import { createElement, type ReactElement } from "react";
import Link from "next/link";

/** Resolved (translated) trail passed to this pure display component. */
export type WayfindingTrailDisplay = {
  parent: { href: string; label: string };
  current: { label: string };
};

type RouteWayfindingTrailProps = {
  trail: WayfindingTrailDisplay;
};

export function RouteWayfindingTrail({ trail }: RouteWayfindingTrailProps): ReactElement {
  return createElement(
    "nav",
    { "aria-label": "Breadcrumb", className: "route-wayfinding" },
    createElement(
      "ol",
      { className: "route-wayfinding__list" },
      createElement(
        "li",
        null,
        createElement(
          Link,
          { className: "route-wayfinding__link", href: trail.parent.href },
          trail.parent.label,
        ),
      ),
      createElement(
        "li",
        { "aria-current": "page" },
        createElement("span", { className: "route-wayfinding__current" }, trail.current.label),
      ),
    ),
  );
}
