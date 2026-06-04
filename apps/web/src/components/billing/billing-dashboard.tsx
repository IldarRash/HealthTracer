"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import {
  apiQueryKeys,
  createBillingCheckoutSession,
  createBillingPortalSession,
  getEntitlement,
  getSubscription,
} from "../../lib/api";
import {
  Badge,
  Button,
  DashboardCard,
  DashboardGrid,
  DetailLineList,
  EmptyState,
  ErrorState,
  LoadingState,
} from "../ui";

function formatPeriodEnd(isoDateTime: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(isoDateTime),
  );
}

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

  const planFacts: string[] = [];
  if (isPro && subscription.currentPeriodEnd) {
    planFacts.push(
      `${subscription.cancelAtPeriodEnd ? "Cancels on" : "Renews on"} ${formatPeriodEnd(
        subscription.currentPeriodEnd,
      )}`,
    );
  }
  if (isPro && subscription.status) {
    planFacts.push(`Status: ${subscription.status.replace(/_/g, " ")}`);
  }

  const planAction = isPro ? (
    <Button
      type="button"
      variant="secondary"
      disabled={portalMutation.isPending}
      onClick={() => portalMutation.mutate()}
    >
      {portalMutation.isPending ? "Opening portal…" : "Manage subscription"}
    </Button>
  ) : (
    <Button
      type="button"
      disabled={checkoutMutation.isPending}
      onClick={() => checkoutMutation.mutate()}
    >
      {checkoutMutation.isPending ? "Redirecting…" : "Subscribe to Pro"}
    </Button>
  );

  return (
    <div className="page-content">
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

      <DashboardGrid>
        <DashboardCard
          label="Subscription"
          title="Current plan"
          value={<Badge tone={isPro ? "success" : "neutral"}>{isPro ? "Pro" : "Free"}</Badge>}
          footer={
            <>
              {planAction}
              {mutationError ? (
                <p className="form-error" role="alert">
                  {mutationError}
                </p>
              ) : null}
            </>
          }
        >
          {isPro ? (
            <DetailLineList lines={planFacts} />
          ) : (
            <p className="dashboard-card__hint">
              Upgrade to Pro for unlimited AI coaching messages every day.
            </p>
          )}
        </DashboardCard>

        {!isPro ? (
          <DashboardCard
            label="Today's AI usage"
            title="AI coaching messages"
            value={
              <>
                {entitlement.aiMessagesUsedToday}
                {entitlement.aiMessagesPerDay != null
                  ? ` / ${entitlement.aiMessagesPerDay}`
                  : ""}
              </>
            }
            hint={
              entitlement.aiMessagesRemaining != null
                ? `${entitlement.aiMessagesRemaining} remaining today`
                : "Unlimited messages"
            }
          />
        ) : null}
      </DashboardGrid>

      {!isPro ? (
        <DashboardCard label="Pro" title="Pro benefits">
          <DetailLineList
            lines={[
              "Unlimited AI coaching messages per day",
              "Priority coaching responses",
            ]}
          />
        </DashboardCard>
      ) : null}
    </div>
  );
}
