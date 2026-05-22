"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  apiQueryKeys,
  getActiveNutritionPlan,
  getActiveWorkoutPlan,
  getCurrentProfile,
  getCurrentUser,
  listGoals,
  listProposals,
} from "../../lib/api";
import {
  computeWeeklyConsistency,
  getTimeOfDayGreeting,
  goalStatusLabel,
  goalTypeLabel,
  summarizeRecentProposals,
  summarizeWorkoutAdherence,
} from "../../lib/dashboard-ui-state";
import {
  getProposalDomainLabel,
  getProposalStatusLabel,
} from "../../lib/proposal-ui-state";
import { DashboardCard, DashboardGrid, EmptyState, ErrorState, LoadingState } from "../ui";

export function ProfileDashboard() {
  const { getToken } = useAuth();

  const dashboardQuery = useQuery({
    queryKey: apiQueryKeys.dashboardState,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const [user, profile, goals, workout, nutrition, proposals] = await Promise.all([
        getCurrentUser(token),
        getCurrentProfile(token),
        listGoals(token),
        getActiveWorkoutPlan(token),
        getActiveNutritionPlan(token),
        listProposals(token),
      ]);

      const errors = [
        user.error,
        profile.error,
        goals.error,
        workout.error,
        nutrition.error,
        proposals.error,
      ].filter((error): error is string => Boolean(error));

      if (errors.length > 0) {
        throw new Error(errors[0]);
      }

      return {
        user: user.data ?? null,
        profile: profile.data ?? null,
        goals: goals.data ?? [],
        workout: workout.data ?? { plan: null, activeRevision: null, sessions: [] },
        nutrition: nutrition.data ?? { plan: null, activeRevision: null },
        proposals: proposals.data ?? [],
      };
    },
  });

  if (dashboardQuery.isLoading) {
    return <LoadingState title="Loading your coaching snapshot…" />;
  }

  if (dashboardQuery.isError) {
    return (
      <ErrorState
        title="Dashboard unavailable"
        description={
          dashboardQuery.error instanceof Error
            ? dashboardQuery.error.message
            : "Your profile dashboard could not be loaded."
        }
      />
    );
  }

  const data = dashboardQuery.data;
  if (!data) {
    return null;
  }

  const activeGoals = data.goals.filter((goal) => goal.status === "active");
  const consistency = computeWeeklyConsistency(data.workout.sessions, data.goals);
  const workoutAdherence = summarizeWorkoutAdherence(data.workout.sessions);
  const recentProposals = summarizeRecentProposals(data.proposals);
  const displayName = data.user?.displayName ?? data.user?.email ?? "there";
  const nutritionRevision = data.nutrition.activeRevision;

  return (
    <div className="page-content">
      <p className="dashboard-greeting">
        {getTimeOfDayGreeting()}, {displayName} — here&apos;s your coaching snapshot
      </p>

      <DashboardGrid className="dashboard-grid--profile">
        <section className="dashboard-hero">
          <div>
            <p className="dashboard-hero__label">Weekly consistency</p>
            <p className="dashboard-hero__value">{consistency.percent}%</p>
            <p className="dashboard-hero__subtitle">{consistency.subtitle}</p>
            <p className="dashboard-hero__subtitle">{consistency.activeDaysLabel}</p>
          </div>
          <div className="metric-ring" style={{ ["--ring-progress" as string]: consistency.percent }}>
            <span className="sr-only">{consistency.percent}% weekly consistency</span>
          </div>
          <div className="trend-strip" aria-label="Seven day activity trend">
            {consistency.trend.map((value, index) => (
              <div key={index} className="trend-strip__bar">
                <span className="trend-strip__fill" style={{ width: `${value}%` }} />
              </div>
            ))}
          </div>
        </section>

        <DashboardCard
          className="dashboard-card--span-5"
          label="Goals"
          title="Active goals"
          value={activeGoals.length > 0 ? `${activeGoals.length} in progress` : "None yet"}
          hint="Track progress on goals your coach helps you refine."
        >
          {activeGoals.length > 0 ? (
            <ul className="goals">
              {activeGoals.slice(0, 3).map((goal) => (
                <li key={goal.id}>
                  <strong>{goal.title}</strong>
                  <span>
                    {goalTypeLabel(goal.type)} · {goalStatusLabel(goal.status)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No active goals yet"
              description="Ask your coach in Chat to help you set a wellness goal."
              action={
                <Link href="/chat" className="confirmation-card__link">
                  Open Chat →
                </Link>
              }
            />
          )}
        </DashboardCard>

        <DashboardCard
          className="dashboard-card--span-4"
          label="Workouts"
          title="Workout adherence"
          value={workoutAdherence.label}
          hint="Sessions completed against what is planned this week."
          footer={
            <Link href="/training" className="confirmation-card__link">
              View workouts →
            </Link>
          }
        />

        <DashboardCard
          className="dashboard-card--span-4"
          label="Nutrition"
          title="Nutrition consistency"
          value={
            nutritionRevision
              ? nutritionRevision.payload.title
              : "No active nutrition plan yet"
          }
          hint={
            nutritionRevision
              ? nutritionRevision.payload.summary
              : "Accept a nutrition proposal in Chat to start tracking your plan."
          }
          footer={
            <Link href="/nutrition" className="confirmation-card__link">
              View nutrition →
            </Link>
          }
        />

        <DashboardCard
          className="dashboard-card--span-4"
          label="Coach"
          title="Recent coach activity"
          hint="Latest proposal decisions from your coaching conversation."
        >
          {recentProposals.length > 0 ? (
            <ul className="goals">
              {recentProposals.map((proposal) => (
                <li key={proposal.id}>
                  <strong>{proposal.title}</strong>
                  <span>
                    {getProposalDomainLabel(proposal.targetDomain)} ·{" "}
                    {getProposalStatusLabel(proposal.status)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No recent updates"
              description="When your coach proposes a change, you will review it inline in Chat."
            />
          )}
        </DashboardCard>

        <section className="dashboard-section">
          <h2>Profile details</h2>
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
            </dl>
          ) : (
            <EmptyState
              title="Profile not set up yet"
              description="Your coach can help you fill in preferences and constraints through Chat."
              action={
                <Link href="/chat" className="confirmation-card__link">
                  Edit in Chat →
                </Link>
              }
            />
          )}
        </section>
      </DashboardGrid>
    </div>
  );
}
