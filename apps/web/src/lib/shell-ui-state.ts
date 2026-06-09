import { isSecondaryRoute } from "./nav-ui-state";

/** Per-route theme: DARK for data/metric screens, LIGHT for everything else. */
export type RouteTheme = "light" | "dark";

const DARK_ROUTE_PREFIXES = [
  "/today",
  "/longevity",
  "/training",
  "/nutrition",
  "/progress",
  "/metrics",
] as const;

/**
 * Routes that are nested under a dark prefix but intentionally use a light
 * content canvas (design spec: `contentBg=L.paper`).
 */
const LIGHT_ROUTE_OVERRIDES = [
  "/nutrition/grocery-list",
] as const;

export function resolveRouteTheme(pathname: string): RouteTheme {
  // Light overrides take priority — check exact match or sub-path first.
  for (const override of LIGHT_ROUTE_OVERRIDES) {
    if (pathname === override || pathname.startsWith(`${override}/`)) {
      return "light";
    }
  }
  for (const prefix of DARK_ROUTE_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return "dark";
    }
  }
  return "light";
}

/** Page-level layout intent. `dashboard` resolves to the same structured canvas as `default`. */
export type AppLayoutVariant = "default" | "chat" | "dashboard";

export type AppShellVariant = "default" | "chat";

export type AppShellMainVariant = "chat" | "structured";

/** Dark immersive shell — Chat only. */
export function resolveAppShellVariant(layoutVariant: AppLayoutVariant): AppShellVariant {
  return layoutVariant === "chat" ? "chat" : "default";
}

/** Light structured canvas for every non-chat product route. */
export function resolveAppShellMainVariant(layoutVariant: AppLayoutVariant): AppShellMainVariant {
  return layoutVariant === "chat" ? "chat" : "structured";
}

/** Secondary Training/Nutrition plan views and legacy aliases only. */
export function shouldShowRouteWayfinding(pathname: string): boolean {
  return isSecondaryRoute(pathname);
}

export function getAppShellMainClassNames(variant: AppShellMainVariant): readonly string[] {
  const classes = ["app-shell__main"];

  if (variant === "chat") {
    classes.push("app-shell__main--chat");
  }

  if (variant === "structured") {
    classes.push("app-shell__main--structured");
  }

  return classes;
}

export function getAppShellClassNames(variant: AppShellVariant): readonly string[] {
  const classes = ["app-shell"];

  if (variant === "chat") {
    classes.push("app-shell--chat");
  }

  return classes;
}
