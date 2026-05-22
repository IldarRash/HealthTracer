"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "../lib/utils";

const links = [
  { href: "/chat", label: "Chat", featured: true },
  { href: "/training", label: "Workouts" },
  { href: "/goals", label: "Goals" },
  { href: "/nutrition", label: "Nutrition" },
  { href: "/profile", label: "Profile" },
] as const;

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main navigation" className="app-nav app-nav--coach">
      {links.map((link) => {
        const active = isActivePath(pathname, link.href);
        const isFeatured = "featured" in link && link.featured;

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "app-nav__link",
              isFeatured && "app-nav__link--featured",
              active && !isFeatured && "app-nav__link--active",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
