import type {
  CreateCheckoutSessionResponse,
  CreatePortalSessionResponse,
  SubscriptionSummary,
} from "@health/types";
import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { env } from "../../env.js";
import { UsersService } from "../users/users.service.js";
import { BillingRepository } from "./billing.repository.js";
import { StripeClient } from "./stripe.client.js";

@Injectable()
export class BillingService {
  constructor(
    private readonly billingRepository: BillingRepository,
    private readonly stripeClient: StripeClient,
    private readonly usersService: UsersService,
  ) {}

  async getSubscription(auth: ClerkAuthContext): Promise<SubscriptionSummary> {
    const user = await this.usersService.resolveFromAuth(auth);
    const subscription = await this.billingRepository.findSubscriptionByUserId(user.id);

    if (!subscription) {
      return {
        tier: "free",
        status: null,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
        hasStripeCustomer: false,
      };
    }

    return {
      tier: subscription.tier,
      status: subscription.status ?? null,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
      hasStripeCustomer: subscription.stripeCustomerId != null,
    };
  }

  async createCheckoutSession(
    auth: ClerkAuthContext,
  ): Promise<CreateCheckoutSessionResponse> {
    const user = await this.usersService.resolveFromAuth(auth);

    if (!env.STRIPE_PRICE_PRO) {
      throw new ServiceUnavailableException(
        "Billing is not configured: STRIPE_PRICE_PRO is required.",
      );
    }

    const stripe = this.stripeClient.get();

    let stripeCustomerId: string;
    const existing = await this.billingRepository.findSubscriptionByUserId(user.id);

    if (existing?.stripeCustomerId) {
      stripeCustomerId = existing.stripeCustomerId;
    } else {
      // Clerk substitutes a synthetic `<clerkUserId>@clerk.local` address when the
      // token lacks a real email claim. Don't persist that non-deliverable value on
      // the Stripe customer (it breaks receipts/dunning and leaks the Clerk id as an
      // email) — rely on metadata.userId for correlation instead.
      const hasRealEmail = auth.email.length > 0 && !auth.email.endsWith("@clerk.local");
      const customer = await stripe.customers.create({
        ...(hasRealEmail ? { email: auth.email } : {}),
        metadata: { userId: user.id },
      });

      stripeCustomerId = customer.id;
      await this.billingRepository.upsertStripeCustomerId(user.id, stripeCustomerId);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      client_reference_id: user.id,
      line_items: [
        {
          price: env.STRIPE_PRICE_PRO,
          quantity: 1,
        },
      ],
      success_url: `${env.WEB_APP_BASE_URL}/billing?checkout=success`,
      cancel_url: `${env.WEB_APP_BASE_URL}/billing?checkout=cancel`,
    });

    if (!session.url) {
      throw new ServiceUnavailableException("Stripe Checkout session URL is unavailable.");
    }

    return { url: session.url };
  }

  async createPortalSession(
    auth: ClerkAuthContext,
  ): Promise<CreatePortalSessionResponse> {
    const user = await this.usersService.resolveFromAuth(auth);
    const subscription = await this.billingRepository.findSubscriptionByUserId(user.id);

    if (!subscription?.stripeCustomerId) {
      throw new ServiceUnavailableException(
        "No Stripe customer found. Please complete a checkout session first.",
      );
    }

    const stripe = this.stripeClient.get();

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${env.WEB_APP_BASE_URL}/billing`,
    });

    return { url: session.url };
  }
}
