"use client";

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

  return (
    <AppShell variant={shellVariant} data-theme={routeTheme}>
      <AppSidebar />
      <AppShellMain variant={mainVariant}>
        {showWayfinding ? <RouteWayfinding /> : null}
        {children}
      </AppShellMain>
    </AppShell>
  );
}
