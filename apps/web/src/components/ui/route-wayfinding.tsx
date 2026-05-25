"use client";

import { usePathname } from "next/navigation";
import { resolveSecondaryRouteWayfinding } from "../../lib/nav-ui-state";
import { RouteWayfindingTrail } from "./route-wayfinding-trail";

export { RouteWayfindingTrail } from "./route-wayfinding-trail";

export function RouteWayfinding() {
  const pathname = usePathname();
  const trail = resolveSecondaryRouteWayfinding(pathname);

  if (!trail) {
    return null;
  }

  return <RouteWayfindingTrail trail={trail} />;
}
