"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { resolveSecondaryRouteWayfinding } from "../../lib/nav-ui-state";
import { RouteWayfindingTrail } from "./route-wayfinding-trail";

export { RouteWayfindingTrail } from "./route-wayfinding-trail";

export function RouteWayfinding() {
  const pathname = usePathname();
  const t = useTranslations();
  const trail = resolveSecondaryRouteWayfinding(pathname);

  if (!trail) {
    return null;
  }

  return (
    <RouteWayfindingTrail
      trail={{
        parent: { href: trail.parent.href, label: t(trail.parent.labelKey as Parameters<typeof t>[0]) },
        current: { label: t(trail.current.labelKey as Parameters<typeof t>[0]) },
      }}
    />
  );
}
