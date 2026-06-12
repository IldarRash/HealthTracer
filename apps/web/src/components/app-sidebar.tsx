"use client";

import { UserButton, useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { apiQueryKeys, getCurrentUserState, getSubscription } from "../lib/api";
import { isNavLinkActive, PRIMARY_NAV_LINKS, SECONDARY_ROUTE_LINKS } from "../lib/nav-ui-state";
import { resolvePrimaryNavState } from "../lib/onboarding-ui-state";
import { Icon, Mark, type IconName } from "./ui/icon";
import { Skeleton } from "./ui/skeleton";

/** Map each nav href to its icon name */
const NAV_ICON_MAP: Record<string, IconName> = {
  "/chat": "chat",
  "/today": "today",
  "/longevity": "longevity",
  "/profile": "profile",
  "/training": "dumbbell",
  "/nutrition": "fork",
};

type NavItemProps = {
  href: string;
  label: string;
  iconName: IconName;
  active: boolean;
};

function SidebarNavItem({ href, label, iconName, active }: NavItemProps) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`app-sidebar__nav-item${active ? " app-sidebar__nav-item--active" : ""}`}
    >
      <Icon name={iconName} size={19} sw={active ? 2 : 1.7} />
      <span>{label}</span>
    </Link>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const t = useTranslations();

  const userStateQuery = useQuery({
    queryKey: apiQueryKeys.currentUserState,
    enabled: isLoaded && isSignedIn,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }
      const result = await getCurrentUserState(token);
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Your account state could not be loaded.");
      }
      return result.data;
    },
  });

  const subscriptionQuery = useQuery({
    queryKey: apiQueryKeys.billingSubscription,
    enabled: isLoaded && isSignedIn,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }
      const result = await getSubscription(token);
      if (result.error || !result.data) {
        return null;
      }
      return result.data;
    },
  });

  const navState = resolvePrimaryNavState({
    isLoading: userStateQuery.isLoading,
    isError: userStateQuery.isError,
    onboardingCompleted: userStateQuery.data?.onboardingCompleted,
  });

  const displayName = userStateQuery.data?.user.displayName ?? null;
  const longevityStatement =
    userStateQuery.data?.profile?.longevityDirection?.statement ?? null;
  const subscriptionTier = subscriptionQuery.data?.tier ?? null;
  const isPro = subscriptionTier === "pro";

  return (
    <aside className="app-sidebar" aria-label={t("Nav.mainNavLabel")}>
      {/* Brand row */}
      <div className="app-sidebar__brand">
        <Mark size={26} />
        <span className="app-sidebar__brand-name">{t("Nav.brandName")}</span>
      </div>

      {navState === "loading" && (
        <div className="app-sidebar__nav-skeleton" aria-hidden="true" aria-busy="true">
          <Skeleton h={32} r={8} />
          <Skeleton h={32} r={8} />
          <Skeleton h={32} r={8} />
          <Skeleton h={32} r={8} />
        </div>
      )}

      {navState === "locked" && (
        <p className="app-sidebar__onboarding-hint" aria-live="polite">
          <Icon name="lock" size={16} aria-hidden />
          {t("Nav.completeOnboarding")}
        </p>
      )}

      {navState === "ready" && (
        <>
          {/* Primary nav */}
          <nav aria-label={t("Nav.primaryNavLabel")} className="app-sidebar__nav-group">
            {PRIMARY_NAV_LINKS.map((link) => {
              const iconName = NAV_ICON_MAP[link.href] ?? "today";
              return (
                <SidebarNavItem
                  key={link.href}
                  href={link.href}
                  label={t(link.labelKey)}
                  iconName={iconName}
                  active={isNavLinkActive(pathname, link)}
                />
              );
            })}
          </nav>

          {/* Plans divider + secondary nav */}
          <div className="app-sidebar__divider" aria-hidden />
          <p className="app-sidebar__eyebrow">{t("Nav.plansView")}</p>
          <nav aria-label={t("Nav.plansNavLabel")} className="app-sidebar__nav-group">
            {SECONDARY_ROUTE_LINKS.map((link) => {
              const iconName = NAV_ICON_MAP[link.href] ?? "today";
              return (
                <SidebarNavItem
                  key={link.href}
                  href={link.href}
                  label={t(link.labelKey)}
                  iconName={iconName}
                  active={isNavLinkActive(pathname, link)}
                />
              );
            })}
          </nav>
        </>
      )}

      {/* Spacer */}
      <div className="app-sidebar__spacer" aria-hidden />

      {/* Plan badge */}
      {subscriptionTier !== null && (
        <div className="app-sidebar__plan-badge" aria-label="Current plan">
          <div className="app-sidebar__plan-badge-row">
            <span className="app-sidebar__plan-name">
              {isPro ? "AI Health Coach Pro" : "Free Plan"}
            </span>
            <span
              className={`app-sidebar__plan-chip app-sidebar__plan-chip--${isPro ? "pro" : "free"}`}
            >
              {isPro ? "PRO" : "FREE"}
            </span>
          </div>
        </div>
      )}

      {/* User block */}
      <div className="app-sidebar__user">
        <div className="app-sidebar__user-avatar">
          <UserButton />
        </div>
        {displayName ? (
          <div className="app-sidebar__user-info">
            <span className="app-sidebar__user-name">{displayName}</span>
            {longevityStatement ? (
              <span className="app-sidebar__user-goal" title={longevityStatement}>
                {longevityStatement}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
