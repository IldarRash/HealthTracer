"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import {
  apiQueryKeys,
  createBillingCheckoutSession,
  createBillingPortalSession,
  getEntitlement,
  getSubscription,
} from "../../lib/api";
import { Button, EmptyState, ErrorState, Icon, LoadingState, Mark } from "../ui";

function formatPeriodEnd(isoDateTime: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(isoDateTime),
  );
}

// ── Shared feature row for both Free and Pro columns ──────────────────────

type FeatureRowProps = {
  children: ReactNode;
  on?: boolean;
  pro?: boolean;
};

function FeatureRow({ children, on = true, pro = false }: FeatureRowProps) {
  return (
    <div className="pricing-feature-row">
      <span
        className={[
          "pricing-feature-row__icon",
          on ? (pro ? "pricing-feature-row__icon--pro" : "pricing-feature-row__icon--free") : "pricing-feature-row__icon--off",
        ].join(" ")}
        aria-hidden="true"
      >
        <Icon
          name={on ? "checkSm" : "x"}
          size={12}
          stroke={on ? (pro ? "#04130c" : "var(--color-text-secondary)") : "var(--color-text-muted)"}
          sw={on ? 2.4 : 2}
        />
      </span>
      <span
        className={`pricing-feature-row__label${on ? "" : " pricing-feature-row__label--off"}`}
      >
        {children}
      </span>
    </div>
  );
}

// ── Limit-reached banner (shown inline when chat quota is exhausted) ───────

type LimitReachedBannerProps = {
  onUpgrade: () => void;
  onDismiss?: () => void;
  isPending?: boolean;
};

export function LimitReachedBanner({
  onUpgrade,
  onDismiss,
  isPending,
}: LimitReachedBannerProps) {
  return (
    <div className="limit-reached-banner">
      <div className="limit-reached-banner__body">
        <div className="limit-reached-banner__header">
          <span className="limit-reached-banner__icon-wrap" aria-hidden="true">
            <Icon name="bolt" size={17} stroke="var(--color-metric-amber)" fill="var(--color-metric-amber)" />
          </span>
          <span className="limit-reached-banner__title">
            Daily messages used up
          </span>
        </div>
        <p className="limit-reached-banner__desc">
          You&apos;ve used all 10 messages on the free plan. They reset tomorrow morning — or open
          Pro for unlimited messages right now.
        </p>
        <div className="limit-reached-banner__chips" aria-hidden="true">
          {["Unlimited messages", "Photo analysis", "Deep trends"].map((label) => (
            <span key={label} className="limit-reached-banner__chip">
              <Icon name="checkSm" size={14} stroke="var(--color-metric-green)" sw={2.4} />
              {label}
            </span>
          ))}
        </div>
      </div>
      <div className="limit-reached-banner__actions">
        <Button
          variant="primary"
          onClick={onUpgrade}
          disabled={isPending}
          className="limit-reached-banner__cta"
        >
          {isPending ? "Redirecting…" : "Open Pro · 7 days free"}
        </Button>
        {onDismiss ? (
          <Button variant="ghost" onClick={onDismiss}>
            Wait until tomorrow
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// ── Main billing dashboard ─────────────────────────────────────────────────

export function BillingDashboard() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const checkoutResult = searchParams.get("checkout");

  const subscriptionQuery = useQuery({
    queryKey: apiQueryKeys.billingSubscription,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await getSubscription(token);
      if (result.error) {
        throw new Error(result.error);
      }

      return result.data ?? null;
    },
  });

  const entitlementQuery = useQuery({
    queryKey: apiQueryKeys.billingEntitlement,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await getEntitlement(token);
      if (result.error) {
        throw new Error(result.error);
      }

      return result.data ?? null;
    },
  });

  useEffect(() => {
    if (checkoutResult === "success") {
      void queryClient.invalidateQueries({ queryKey: apiQueryKeys.billingSubscription });
      void queryClient.invalidateQueries({ queryKey: apiQueryKeys.billingEntitlement });
    }
  }, [checkoutResult, queryClient]);

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await createBillingCheckoutSession(token);
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Checkout session could not be created.");
      }

      return result.data;
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await createBillingPortalSession(token);
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Portal session could not be created.");
      }

      return result.data;
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    },
  });

  const isLoading = subscriptionQuery.isLoading || entitlementQuery.isLoading;
  const isError = subscriptionQuery.isError || entitlementQuery.isError;

  if (isLoading) {
    return <LoadingState title="Loading billing information…" />;
  }

  if (isError) {
    const message =
      (subscriptionQuery.error instanceof Error
        ? subscriptionQuery.error.message
        : null) ??
      (entitlementQuery.error instanceof Error
        ? entitlementQuery.error.message
        : null) ??
      "Billing information could not be loaded.";

    return (
      <ErrorState
        title="Billing unavailable"
        description={message}
      />
    );
  }

  const subscription = subscriptionQuery.data;
  const entitlement = entitlementQuery.data;

  if (!subscription || !entitlement) {
    return (
      <EmptyState
        title="No billing information"
        description="Your billing details are not available yet."
      />
    );
  }

  const isPro = subscription.tier === "pro";
  const mutationError =
    checkoutMutation.error instanceof Error
      ? checkoutMutation.error.message
      : portalMutation.error instanceof Error
        ? portalMutation.error.message
        : null;

  return (
    <div className="pricing-screen">
      {checkoutResult === "success" ? (
        <div className="notice notice-inline" role="status" aria-live="polite">
          <p>You are now subscribed to Pro. Your plan has been upgraded.</p>
        </div>
      ) : null}

      {checkoutResult === "cancel" ? (
        <div className="notice notice-inline" role="status" aria-live="polite">
          <p>Checkout was cancelled. Your plan has not changed.</p>
        </div>
      ) : null}

      <div className="pricing-screen__header">
        <p className="pricing-screen__eyebrow">Subscription</p>
        <h2 className="pricing-screen__title">Your pace — free or deeper with Pro</h2>
        <p className="pricing-screen__sub">Cancel any time. No pressure, no obligations.</p>
      </div>

      <div className="pricing-cards">
        {/* Free card */}
        <article className={`pricing-card pricing-card--free${!isPro ? " pricing-card--current" : ""}`}>
          <div className="pricing-card__head">
            <span className="pricing-card__plan-name">Free</span>
            {!isPro ? (
              <span className="pricing-card__current-badge">Current plan</span>
            ) : null}
          </div>
          <div className="pricing-card__price-row">
            <span className="pricing-card__price">$0</span>
            <span className="pricing-card__price-period">forever</span>
          </div>
          <p className="pricing-card__tagline">To get started and explore</p>

          <div className="pricing-card__features">
            <FeatureRow>10 coach messages per day</FeatureRow>
            <FeatureRow>Today plan and habits</FeatureRow>
            <FeatureRow>Weekly plans (view)</FeatureRow>
            <FeatureRow>Basic weekly trends</FeatureRow>
            <FeatureRow on={false}>Photo analysis of meals and workouts</FeatureRow>
            <FeatureRow on={false}>Deep trends and documents</FeatureRow>
          </div>

          {!isPro ? (
            <div className="pricing-card__footer">
              {entitlement.aiMessagesRemaining != null ? (
                <p className="pricing-card__usage-hint">
                  {entitlement.aiMessagesRemaining} of{" "}
                  {entitlement.aiMessagesPerDay ?? "?"} messages remaining today
                </p>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                disabled
                className="pricing-card__action"
              >
                Current plan
              </Button>
            </div>
          ) : (
            <div className="pricing-card__footer">
              <Button
                type="button"
                variant="ghost"
                disabled={checkoutMutation.isPending || portalMutation.isPending}
                onClick={() => portalMutation.mutate()}
                className="pricing-card__action"
              >
                {portalMutation.isPending ? "Opening portal…" : "Switch to Free"}
              </Button>
            </div>
          )}
        </article>

        {/* Pro card */}
        <article className={`pricing-card pricing-card--pro${isPro ? " pricing-card--current" : ""}`}>
          <div className="pricing-card__head">
            <span className="pricing-card__brand">
              <Mark size={20} />
              <span className="pricing-card__plan-name">Tracer Pro</span>
            </span>
            <span className="pricing-card__popular-badge">Popular</span>
          </div>
          <div className="pricing-card__price-row">
            <span className="pricing-card__price">$6.99</span>
            <span className="pricing-card__price-period">/ month</span>
          </div>
          <p className="pricing-card__tagline">When you want to go deeper</p>

          <div className="pricing-card__features">
            <FeatureRow pro>Unlimited coach messages</FeatureRow>
            <FeatureRow pro>Photo analysis of meals and workouts</FeatureRow>
            <FeatureRow pro>Deep trends and analytics</FeatureRow>
            <FeatureRow pro>Priority coaching suggestions</FeatureRow>
            <FeatureRow pro>Documents and consent</FeatureRow>
            <FeatureRow pro>Plan export</FeatureRow>
          </div>

          <div className="pricing-card__footer">
            {isPro && subscription.currentPeriodEnd ? (
              <p className="pricing-card__usage-hint">
                {subscription.cancelAtPeriodEnd ? "Cancels on" : "Renews on"}{" "}
                {formatPeriodEnd(subscription.currentPeriodEnd)}
              </p>
            ) : null}

            {isPro ? (
              <Button
                type="button"
                variant="secondary"
                disabled={portalMutation.isPending}
                onClick={() => portalMutation.mutate()}
                className="pricing-card__action"
              >
                {portalMutation.isPending ? "Opening portal…" : "Manage subscription"}
              </Button>
            ) : (
              <Button
                type="button"
                variant="primary"
                disabled={checkoutMutation.isPending}
                onClick={() => checkoutMutation.mutate()}
                className="pricing-card__action pricing-card__action--accept"
              >
                {checkoutMutation.isPending ? "Redirecting…" : "Open Pro · 7 days free"}
              </Button>
            )}
          </div>
        </article>
      </div>

      {mutationError ? (
        <p className="form-error pricing-screen__error" role="alert">
          {mutationError}
        </p>
      ) : null}
    </div>
  );
}
