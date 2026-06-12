export type NavLink = {
  href: string;
  /** i18n message key in the Nav namespace, e.g. 'Nav.chat' */
  labelKey: string;
  featured?: true;
  /** Legacy routes that should highlight this nav item. */
  aliases?: readonly string[];
};

/** Primary web tabs: Chat, Today, Longevity, Profile. */
export const PRIMARY_NAV_LINKS: readonly NavLink[] = [
  { href: "/chat", labelKey: "Nav.chat", featured: true },
  { href: "/today", labelKey: "Nav.today" },
  { href: "/longevity", labelKey: "Nav.longevity" },
  {
    href: "/profile",
    labelKey: "Nav.profile",
    aliases: ["/billing"],
  },
] as const;

/** Secondary read-only plan views — routeable but not primary nav tabs. */
export const SECONDARY_ROUTE_LINKS: readonly NavLink[] = [
  { href: "/training", labelKey: "Nav.workouts" },
  { href: "/nutrition", labelKey: "Nav.nutrition", aliases: ["/recipes"] },
] as const;

export function isActivePath(
  pathname: string,
  href: string,
  aliases: readonly string[] = [],
): boolean {
  if (pathname === href || pathname.startsWith(`${href}/`)) {
    return true;
  }

  return aliases.some(
    (alias) => pathname === alias || pathname.startsWith(`${alias}/`),
  );
}

export function isNavLinkActive(pathname: string, link: NavLink): boolean {
  return isActivePath(pathname, link.href, link.aliases);
}

export function getNavLinkAriaCurrent(
  pathname: string,
  link: NavLink,
): "page" | undefined {
  return isNavLinkActive(pathname, link) ? "page" : undefined;
}

export function isSecondaryRoute(pathname: string): boolean {
  return SECONDARY_ROUTE_LINKS.some((link) => isNavLinkActive(pathname, link));
}

export function findSecondaryRoute(pathname: string): NavLink | undefined {
  return SECONDARY_ROUTE_LINKS.find((link) => isNavLinkActive(pathname, link));
}

export type RouteWayfindingTrail = {
  parent: { href: string; labelKey: string };
  current: { labelKey: string };
};

/** Breadcrumb trail for secondary plan views — parent defaults to Today per IA. */
export function resolveSecondaryRouteWayfinding(
  pathname: string,
): RouteWayfindingTrail | undefined {
  const route = findSecondaryRoute(pathname);
  if (!route) {
    return undefined;
  }

  return {
    parent: { href: "/today", labelKey: "Nav.today" },
    current: { labelKey: route.labelKey },
  };
}
