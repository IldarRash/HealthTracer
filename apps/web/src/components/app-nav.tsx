"use client";

import { UserButton, useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { apiQueryKeys, getCurrentUserState } from "../lib/api";
import { shouldHidePrimaryNavDuringOnboarding } from "../lib/onboarding-ui-state";
import { AppNavLinks } from "./app-nav-links";

export { AppNavLinks } from "./app-nav-links";

export function AppNav() {
  const pathname = usePathname();
  const { getToken, isLoaded, isSignedIn } = useAuth();

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

  const hidePrimaryNav = shouldHidePrimaryNavDuringOnboarding(
    userStateQuery.data?.onboardingCompleted,
  );

  return (
    <nav aria-label="Main navigation" className="app-nav app-nav--coach">
      {hidePrimaryNav ? (
        <p className="app-nav__onboarding-hint" aria-live="polite">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="app-nav__lock-icon"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
              clipRule="evenodd"
            />
          </svg>
          Complete onboarding to unlock navigation
        </p>
      ) : (
        <AppNavLinks pathname={pathname} />
      )}
      <div className="app-nav__account" aria-label="Account">
        <UserButton />
      </div>
    </nav>
  );
}
