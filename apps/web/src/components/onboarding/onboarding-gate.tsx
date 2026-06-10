"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import {
  apiQueryKeys,
  getCurrentUserState,
} from "../../lib/api";
import {
  isOnboardingPath,
  shouldRedirectFromOnboarding,
  shouldRedirectToOnboarding,
} from "../../lib/onboarding-ui-state";
import { ErrorState, LoadingState } from "../ui";

type OnboardingGateProps = {
  children: ReactNode;
};

export function OnboardingGate({ children }: OnboardingGateProps) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

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

  useEffect(() => {
    if (!isLoaded || !isSignedIn || userStateQuery.isLoading || !userStateQuery.data) {
      return;
    }

    const onboardingCompleted = userStateQuery.data.onboardingCompleted;

    if (shouldRedirectToOnboarding(pathname, onboardingCompleted)) {
      router.replace("/onboarding");
      return;
    }

    if (shouldRedirectFromOnboarding(pathname, onboardingCompleted)) {
      router.replace("/chat");
    }
  }, [
    isLoaded,
    isSignedIn,
    pathname,
    router,
    userStateQuery.data,
    userStateQuery.isLoading,
  ]);

  if (!isLoaded || !isSignedIn) {
    return <>{children}</>;
  }

  if (userStateQuery.isLoading) {
    return (
      <LoadingState
        title={isOnboardingPath(pathname) ? "Preparing onboarding…" : "Loading your coach…"}
      />
    );
  }

  if (userStateQuery.isError) {
    return (
      <ErrorState
        title="Unable to load your account"
        description={
          userStateQuery.error instanceof Error
            ? userStateQuery.error.message
            : "Your account state could not be loaded."
        }
        action={
          <button
            type="button"
            className="state-message__retry-btn"
            onClick={() => void userStateQuery.refetch()}
          >
            Try again
          </button>
        }
      />
    );
  }

  // Redirect dead-ends only fire when we have definitive data (isSuccess).
  // A failed fetch must never produce a "Redirecting…" limbo — the error state above handles it.
  if (userStateQuery.isSuccess) {
    const onboardingCompleted = userStateQuery.data.onboardingCompleted;

    if (shouldRedirectToOnboarding(pathname, onboardingCompleted)) {
      return <LoadingState title="Redirecting to onboarding…" />;
    }

    if (shouldRedirectFromOnboarding(pathname, onboardingCompleted)) {
      return <LoadingState title="Opening your coach…" />;
    }
  }

  return <>{children}</>;
}
