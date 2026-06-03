import { Injectable } from "@nestjs/common";
import type Stripe from "stripe";
import { env } from "../../env.js";
import { BillingRepository } from "./billing.repository.js";
import { StripeClient } from "./stripe.client.js";

type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "paused";

type SubscriptionTier = "free" | "pro";

function mapStripeStatusToTier(status: string): SubscriptionTier {
  switch (status) {
    case "active":
    case "trialing":
    case "past_due":
      return "pro";
    default:
      return "free";
  }
}

function toKnownStatus(status: string): SubscriptionStatus | null {
  const known: SubscriptionStatus[] = [
    "active",
    "trialing",
    "past_due",
    "canceled",
    "incomplete",
    "incomplete_expired",
    "unpaid",
    "paused",
  ];

  return (known.find((s) => s === status) as SubscriptionStatus | undefined) ?? null;
}

@Injectable()
export class BillingWebhookService {
  constructor(
    private readonly billingRepository: BillingRepository,
    private readonly stripeClient: StripeClient,
  ) {}

  /**
   * Verifies the Stripe signature and constructs a typed event.
   * Throws if the signature is invalid or STRIPE_WEBHOOK_SECRET is unset.
   */
  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    if (!env.STRIPE_WEBHOOK_SECRET) {
      throw new Error(
        "Stripe webhook secret is not configured: STRIPE_WEBHOOK_SECRET is required.",
      );
    }

    const stripe = this.stripeClient.get();

    return stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  }

  /**
   * Handles a verified Stripe event. Exact replay protection via event-ID deduplication
   * (stripe_webhook_events table) and stale-ordering guard on subscription upserts
   * (lastStripeEventAt). Safe to call multiple times for the same event.
   */
  async handleEvent(event: Stripe.Event): Promise<void> {
    // Layer 1: event-ID dedupe — skip if this event.id was already processed.
    const isNew = await this.billingRepository.recordWebhookEventIfNew(event.id, event.type);
    if (!isNew) {
      return;
    }

    switch (event.type) {
      case "checkout.session.completed":
        await this.handleCheckoutSessionCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await this.handleSubscriptionUpserted(
          event.data.object as Stripe.Subscription,
          event.created,
        );
        break;
      case "customer.subscription.deleted":
        await this.handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription,
          event.created,
        );
        break;
      default:
        // Unhandled event types — ignore silently
        break;
    }
  }

  private async handleCheckoutSessionCompleted(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    // The subscription object may not be populated on the session yet.
    // We handle subscription state via customer.subscription.* events.
    // Here we only need to ensure a stripeCustomerId row exists for the user.
    const userId = session.client_reference_id;
    const customerId =
      typeof session.customer === "string"
        ? session.customer
        : (session.customer?.id ?? null);

    if (!userId || !customerId) {
      return;
    }

    const existing = await this.billingRepository.findSubscriptionByUserId(userId);

    if (!existing?.stripeCustomerId) {
      await this.billingRepository.upsertStripeCustomerId(userId, customerId);
    }
  }

  private async handleSubscriptionUpserted(
    subscription: Stripe.Subscription,
    eventCreatedUnixSeconds: number,
  ): Promise<void> {
    const customerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id;

    const existingByCustomer =
      await this.billingRepository.findSubscriptionByStripeCustomerId(customerId);

    const userId = existingByCustomer?.userId;

    if (!userId) {
      // No matching user — cannot link the subscription
      return;
    }

    // Layer 2: stale-ordering guard — skip if this event is older than what we last applied.
    const incomingEventAt = new Date(eventCreatedUnixSeconds * 1000);
    if (
      existingByCustomer.lastStripeEventAt !== null &&
      existingByCustomer.lastStripeEventAt !== undefined &&
      incomingEventAt <= existingByCustomer.lastStripeEventAt
    ) {
      return;
    }

    const status = toKnownStatus(subscription.status);
    const tier = mapStripeStatusToTier(subscription.status);

    const firstItem = subscription.items.data[0];
    const priceId = (firstItem?.price?.id as string | undefined) ?? null;

    // In Stripe Node SDK v18+ (API 2025-03-31.basil), current_period_end
    // moved from Subscription to SubscriptionItem.
    const currentPeriodEnd =
      typeof firstItem?.current_period_end === "number"
        ? new Date(firstItem.current_period_end * 1000)
        : null;

    await this.billingRepository.upsertSubscriptionFromStripe(userId, {
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: customerId,
      status,
      tier,
      priceId,
      currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      lastStripeEventAt: incomingEventAt,
    });
  }

  private async handleSubscriptionDeleted(
    subscription: Stripe.Subscription,
    eventCreatedUnixSeconds: number,
  ): Promise<void> {
    const customerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id;

    const existingByCustomer =
      await this.billingRepository.findSubscriptionByStripeCustomerId(customerId);

    const userId = existingByCustomer?.userId;

    if (!userId) {
      return;
    }

    // Layer 2: stale-ordering guard — skip if this deletion event is older than stored.
    const incomingEventAt = new Date(eventCreatedUnixSeconds * 1000);
    if (
      existingByCustomer.lastStripeEventAt !== null &&
      existingByCustomer.lastStripeEventAt !== undefined &&
      incomingEventAt <= existingByCustomer.lastStripeEventAt
    ) {
      return;
    }

    const priceId =
      (subscription.items.data[0]?.price?.id as string | undefined) ?? null;

    await this.billingRepository.upsertSubscriptionFromStripe(userId, {
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: customerId,
      status: "canceled" as const,
      tier: "free" as const,
      priceId,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      lastStripeEventAt: incomingEventAt,
    });
  }
}
