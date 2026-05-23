"use client";

import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavLinkActive, PRIMARY_NAV_LINKS } from "../lib/nav-ui-state";
import { cn } from "../lib/utils";

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main navigation" className="app-nav app-nav--coach">
      <div className="app-nav__links">
        {PRIMARY_NAV_LINKS.map((link) => {
          const active = isNavLinkActive(pathname, link);
          const isFeatured = link.featured === true;

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
      </div>
      <div className="app-nav__account" aria-label="Account">
        <UserButton />
      </div>
    </nav>
  );
}
