"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiQueryKeys, getCurrentProfile, getCurrentUser } from "../../lib/api";
import { PROFILE_HUB_SECTIONS } from "../../lib/context-hub-ui-state";
import { useProfileHubHashScroll } from "../../lib/use-profile-hub-hash-scroll";
import { DocumentsWorkspace } from "../documents/documents-workspace";
import { GoalsWorkspace } from "../goals/goals-workspace";
import { MetricsWorkspace } from "../metrics/metrics-workspace";
import { CoachingHierarchySummaryPanel } from "./coaching-hierarchy-summary";
import {
  CompactDomainCard,
  ContextHubLayout,
  ContextSectionCard,
  EmptyState,
  ErrorState,
  LoadingState,
  ProfileSummaryCard,
  SectionNav,
} from "../ui";

export function ProfileDashboard() {
  const { getToken } = useAuth();

  const dashboardQuery = useQuery({
    queryKey: apiQueryKeys.dashboardState,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const [user, profile] = await Promise.all([
        getCurrentUser(token),
        getCurrentProfile(token),
      ]);

      if (user.error) {
        throw new Error(user.error);
      }

      return {
        user: user.data ?? null,
        profile: profile.data ?? null,
        errors: [profile.error].filter((error): error is string => Boolean(error)),
      };
    },
  });

  const profileContentReady = dashboardQuery.isSuccess && dashboardQuery.data != null;
  useProfileHubHashScroll(profileContentReady);

  if (dashboardQuery.isLoading) {
    return <LoadingState title="Loading your profile…" />;
  }

  if (dashboardQuery.isError) {
    return (
      <ErrorState
        title="Profile unavailable"
        description={
          dashboardQuery.error instanceof Error
            ? dashboardQuery.error.message
            : "Your profile could not be loaded."
        }
      />
    );
  }

  const data = dashboardQuery.data;
  if (!data) {
    return null;
  }

  const displayName = data.user?.displayName ?? data.user?.email ?? "there";

  return (
    <ContextHubLayout>
      <SectionNav sections={PROFILE_HUB_SECTIONS} ariaLabel="Profile sections" />

      <ProfileSummaryCard
        title={`Signed in as ${displayName}`}
        hint="Use the account control beside Profile in the header to manage sign-in and security settings."
        details={
          <dl>
            <dt>Email</dt>
            <dd>{data.user?.email ?? "Not available"}</dd>
            {data.user?.displayName ? (
              <>
                <dt>Display name</dt>
                <dd>{data.user.displayName}</dd>
              </>
            ) : null}
          </dl>
        }
      />

      <ContextSectionCard
        sectionId="coaching-hierarchy"
        label="Direction"
        title="Goal hierarchy"
        hint="Your longevity direction, quarterly objective, and weekly focus guide coaching across Chat, Today, and Longevity."
      >
        <CoachingHierarchySummaryPanel />
      </ContextSectionCard>

      <CompactDomainCard
        className="profile-longevity-bridge"
        label="Longevity"
        title="Weekly trends and coaching signals"
        titleId="profile-longevity-bridge-heading"
        summary="View consistency, wellness trends, and document signals on the Longevity overview instead of analytics here."
        actions={
          <Link href="/longevity" className="confirmation-card__link">
            Open Longevity →
          </Link>
        }
      />

      <CompactDomainCard
        className="profile-billing-bridge"
        label="Billing"
        title="Subscription and AI usage"
        titleId="profile-billing-bridge-heading"
        summary="View your current plan, today's AI message usage, and manage or upgrade your subscription."
        actions={
          <Link href="/billing" className="confirmation-card__link">
            Open Billing →
          </Link>
        }
      />

      {data.errors.length > 0 ? (
        <section className="notice notice-inline" role="status">
          <p>
            Some profile sections could not refresh just now. The available coaching context is
            shown below.
          </p>
        </section>
      ) : null}

      <ContextSectionCard
        sectionId="goals"
        label="Goals"
        title="Your wellness goals"
        hint="Goals are created and updated through coach proposals. Ask in Chat to add or refine a goal."
        actions={
          <Link href="/chat" className="button button-secondary button-sm">
            Edit in Chat
          </Link>
        }
      >
        <GoalsWorkspace />
      </ContextSectionCard>

      <ContextSectionCard
        sectionId="personal-preferences"
        label="Personal"
        title="Preferences and constraints"
        hint="Profile details guide coaching suggestions. Direct edits happen through Chat proposals."
        actions={
          <Link href="/chat" className="button button-secondary button-sm">
            Update in Chat
          </Link>
        }
      >
        {data.profile ? (
          <dl>
            <dt>Activity level</dt>
            <dd>{data.profile.activityLevel ?? "Not set"}</dd>
            <dt>Training experience</dt>
            <dd>{data.profile.trainingExperience ?? "Not set"}</dd>
            <dt>Preferences</dt>
            <dd>{data.profile.preferences.join(", ") || "None listed"}</dd>
            <dt>Constraints</dt>
            <dd>{data.profile.constraints.join(", ") || "None listed"}</dd>
            {data.profile.coachingNotes.length > 0 ? (
              <>
                <dt>Coach notes</dt>
                <dd>{data.profile.coachingNotes.map((note) => note.text).join(" · ")}</dd>
              </>
            ) : null}
          </dl>
        ) : (
          <EmptyState
            title="Profile not set up yet"
            description="Complete onboarding or update preferences through coach proposals in Chat."
            action={
              <Link href="/onboarding" className="confirmation-card__link">
                Continue onboarding →
              </Link>
            }
          />
        )}
      </ContextSectionCard>

      <ContextSectionCard
        sectionId="data-consent"
        label="Data & consent"
        title="Device and wellness data"
        hint="Grant scopes, connect devices, and control how wellness metrics are shared with coaching."
      >
        <MetricsWorkspace embedded />
      </ContextSectionCard>

      <ContextSectionCard
        sectionId="documents"
        label="Documents"
        title="Health documents"
        hint="Upload with explicit consent, review structured summaries, and control how document context is used for wellness coaching."
        className="profile-documents"
      >
        <DocumentsWorkspace embedded />
      </ContextSectionCard>
    </ContextHubLayout>
  );
}
