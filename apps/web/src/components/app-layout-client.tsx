"use client";

import { useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { AppLayoutVariant } from "../lib/shell-ui-state";
import {
  resolveAppShellMainVariant,
  resolveAppShellVariant,
  resolveRouteTheme,
  shouldShowRouteWayfinding,
} from "../lib/shell-ui-state";
import { AppSidebar } from "./app-sidebar";
import { AppMobileBar, AppNavDrawer } from "./app-mobile-nav";
import { AppShell, AppShellMain, RouteWayfinding } from "./ui";

type AppLayoutClientProps = {
  children: ReactNode;
  variant?: AppLayoutVariant;
};

export function AppLayoutClient({ children, variant = "default" }: AppLayoutClientProps) {
  const pathname = usePathname();
  const shellVariant = resolveAppShellVariant(variant);
  const mainVariant = resolveAppShellMainVariant(variant);
  const showWayfinding = shouldShowRouteWayfinding(pathname);
  const routeTheme = resolveRouteTheme(pathname);

  const [navOpen, setNavOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close the drawer on route change (e.g. user tapped a nav link)
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  return (
    <AppShell variant={shellVariant} data-theme={routeTheme}>
      <AppSidebar />
      <AppMobileBar
        navOpen={navOpen}
        onOpen={() => setNavOpen(true)}
        triggerRef={triggerRef}
      />
      <AppShellMain variant={mainVariant}>
        {showWayfinding ? <RouteWayfinding /> : null}
        {children}
      </AppShellMain>
      {navOpen && (
        <AppNavDrawer onClose={() => setNavOpen(false)} triggerRef={triggerRef}>
          <AppSidebar />
        </AppNavDrawer>
      )}
    </AppShell>
  );
}
