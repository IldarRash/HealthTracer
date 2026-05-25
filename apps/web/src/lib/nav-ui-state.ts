export type NavLink = {
  href: string;
  label: string;
  featured?: true;
  /** Legacy routes that should highlight this nav item. */
  aliases?: readonly string[];
};

/** Primary web tabs: Chat, Today, Longevity, Profile. */
export const PRIMARY_NAV_LINKS: readonly NavLink[] = [
  { href: "/chat", label: "Chat", featured: true },
  { href: "/today", label: "Today" },
  { href: "/longevity", label: "Longevity" },
  { href: "/profile", label: "Profile", aliases: ["/goals", "/documents", "/metrics"] },
] as const;

/** Secondary read-only plan views — routeable but not primary nav tabs. */
export const SECONDARY_ROUTE_LINKS: readonly NavLink[] = [
  { href: "/training", label: "Workouts", aliases: ["/progress"] },
  { href: "/nutrition", label: "Nutrition", aliases: ["/recipes"] },
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

export function isSecondaryRoute(pathname: string): boolean {
  return SECONDARY_ROUTE_LINKS.some((link) => isNavLinkActive(pathname, link));
}

export function findSecondaryRoute(pathname: string): NavLink | undefined {
  return SECONDARY_ROUTE_LINKS.find((link) => isNavLinkActive(pathname, link));
}
