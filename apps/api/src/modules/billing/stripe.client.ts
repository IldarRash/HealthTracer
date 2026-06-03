import Stripe from "stripe";
import { Injectable } from "@nestjs/common";
import { env } from "../../env.js";

/**
 * Injectable Stripe client provider.
 * Constructed eagerly; calls fail closed if STRIPE_SECRET_KEY is unset.
 */
@Injectable()
export class StripeClient {
  private readonly client: Stripe | null;

  constructor() {
    this.client = env.STRIPE_SECRET_KEY
      ? new Stripe(env.STRIPE_SECRET_KEY)
      : null;
  }

  /** Returns the Stripe SDK client; throws if STRIPE_SECRET_KEY is not configured. */
  get(): Stripe {
    if (!this.client) {
      throw new Error(
        "Stripe is not configured: STRIPE_SECRET_KEY environment variable is required.",
      );
    }

    return this.client;
  }
}
