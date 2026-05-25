export type NavLink = {
  href: string;
  label: string;
  featured?: true;
  /** Legacy routes that should highlight this nav item. */
  aliases?: readonly string[];
};

export const PRIMARY_NAV_LINKS: readonly NavLink[] = [
  { href: "/chat", label: "Chat", featured: true },
  { href: "/today", label: "Today" },
  { href: "/longevity", label: "Longevity" },
  { href: "/training", label: "Workouts", aliases: ["/progress"] },
  { href: "/nutrition", label: "Nutrition", aliases: ["/recipes"] },
  { href: "/profile", label: "Profile", aliases: ["/goals", "/documents", "/metrics"] },
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
