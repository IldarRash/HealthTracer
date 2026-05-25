"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { AppLayoutVariant } from "../lib/shell-ui-state";
import {
  resolveAppShellMainVariant,
  resolveAppShellVariant,
  shouldShowRouteWayfinding,
} from "../lib/shell-ui-state";
import { AppNav } from "./app-nav";
import { AppShell, AppShellHeader, AppShellMain, RouteWayfinding } from "./ui";

type AppLayoutClientProps = {
  children: ReactNode;
  variant?: AppLayoutVariant;
};

export function AppLayoutClient({ children, variant = "default" }: AppLayoutClientProps) {
  const pathname = usePathname();
  const shellVariant = resolveAppShellVariant(variant);
  const mainVariant = resolveAppShellMainVariant(variant);
  const showWayfinding = shouldShowRouteWayfinding(pathname);

  return (
    <AppShell variant={shellVariant}>
      <AppShellHeader brand="AI Health Coach" nav={<AppNav />} />
      <AppShellMain variant={mainVariant}>
        {showWayfinding ? <RouteWayfinding /> : null}
        {children}
      </AppShellMain>
    </AppShell>
  );
}
