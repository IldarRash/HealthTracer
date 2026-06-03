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
import { Button, EmptyState, ErrorState, LoadingState } from "../ui";

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

  return (
    <div className="billing-dashboard">
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

      <section className="billing-plan" aria-labelledby="billing-plan-heading">
        <h2 id="billing-plan-heading" className="billing-plan__heading">
          Current plan
        </h2>

        <dl className="billing-plan__details">
          <dt>Plan</dt>
          <dd>
            <span className="billing-plan__tier">
              {isPro ? "Pro" : "Free"}
            </span>
          </dd>

          {isPro && subscription.currentPeriodEnd ? (
            <>
              <dt>{subscription.cancelAtPeriodEnd ? "Cancels on" : "Renews on"}</dt>
              <dd>{formatPeriodEnd(subscription.currentPeriodEnd)}</dd>
            </>
          ) : null}

          {isPro && subscription.status ? (
            <>
              <dt>Status</dt>
              <dd className="billing-plan__status">{subscription.status.replace(/_/g, " ")}</dd>
            </>
          ) : null}
        </dl>

        {!isPro ? (
          <div className="billing-plan__usage" aria-label="AI message usage">
            <h3 className="billing-plan__usage-heading">Today&apos;s AI usage</h3>
            <dl>
              <dt>Messages used</dt>
              <dd>
                {entitlement.aiMessagesUsedToday}
                {entitlement.aiMessagesPerDay != null
                  ? ` of ${entitlement.aiMessagesPerDay}`
                  : ""}
              </dd>
              <dt>Remaining</dt>
              <dd>
                {entitlement.aiMessagesRemaining != null
                  ? entitlement.aiMessagesRemaining
                  : "Unlimited"}
              </dd>
            </dl>
          </div>
        ) : null}

        <div className="billing-plan__actions">
          {isPro ? (
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
          )}
        </div>

        {mutationError ? (
          <p className="form-error" role="alert">
            {mutationError}
          </p>
        ) : null}
      </section>

      {!isPro ? (
        <section className="billing-pro-benefits" aria-labelledby="billing-pro-heading">
          <h2 id="billing-pro-heading" className="billing-pro-benefits__heading">
            Pro benefits
          </h2>
          <ul className="billing-pro-benefits__list">
            <li>Unlimited AI coaching messages per day</li>
            <li>Priority coaching responses</li>
          </ul>
        </section>
      ) : null}
    </div>
  );
}
