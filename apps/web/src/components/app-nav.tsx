"use client";

import { UserButton } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { AppNavLinks } from "./app-nav-links";

export { AppNavLinks } from "./app-nav-links";

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main navigation" className="app-nav app-nav--coach">
      <AppNavLinks pathname={pathname} />
      <div className="app-nav__account" aria-label="Account">
        <UserButton />
      </div>
    </nav>
  );
}
