import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { BillingService } from "./billing.service.js";

// Mock the env module so we can control STRIPE_PRICE_PRO and WEB_APP_BASE_URL
vi.mock("../../env.js", () => ({
  env: {
    STRIPE_SECRET_KEY: "sk_test_key",
    STRIPE_WEBHOOK_SECRET: "whsec_test_secret",
    STRIPE_PRICE_PRO: "price_pro_test",
    WEB_APP_BASE_URL: "http://localhost:3001",
  },
}));

const auth = {
  clerkUserId: "user_clerk_123",
  displayName: "Test User",
  email: "test@example.com",
};

const user = {
  id: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
  displayName: "Test User",
  email: "test@example.com",
  timezone: "UTC",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const stripeCustomerId = "cus_test_abc123";
const newCheckoutUrl = "https://checkout.stripe.com/pay/cs_test_abc";
const portalUrl = "https://billing.stripe.com/session/bps_test_xyz";

function makeStripe(overrides: Record<string, unknown> = {}) {
  return {
    customers: {
      create: vi.fn(async () => ({ id: stripeCustomerId })),
    },
    checkout: {
      sessions: {
        create: vi.fn(async () => ({ url: newCheckoutUrl })),
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn(async () => ({ url: portalUrl })),
      },
    },
    ...overrides,
  };
}

function createService(deps: {
  billingRepository?: Record<string, unknown>;
  stripeClientGet?: () => unknown;
} = {}) {
  const stripe = makeStripe();

  const billingRepository = {
    findSubscriptionByUserId: vi.fn(async () => null),
    upsertStripeCustomerId: vi.fn(async () => ({ userId: user.id, stripeCustomerId })),
    upsertSubscriptionFromStripe: vi.fn(async () => ({})),
    ...deps.billingRepository,
  };

  const stripeClientGet = deps.stripeClientGet ?? (() => stripe);

  const stripeClient = {
    get: vi.fn(stripeClientGet),
  };

  const usersService = {
    resolveFromAuth: vi.fn(async () => user),
  };

  return {
    service: new BillingService(
      billingRepository as never,
      stripeClient as never,
      usersService as never,
    ),
    billingRepository,
    stripe,
    stripeClient,
  };
}

describe("BillingService", () => {
  describe("getSubscription", () => {
    it("returns a free default subscription when no row exists", async () => {
      const { service } = createService({
        billingRepository: {
          findSubscriptionByUserId: vi.fn(async () => null),
        },
      });

      const result = await service.getSubscription(auth);

      expect(result.tier).toBe("free");
      expect(result.status).toBeNull();
      expect(result.cancelAtPeriodEnd).toBe(false);
      expect(result.currentPeriodEnd).toBeNull();
      expect(result.hasStripeCustomer).toBe(false);
    });

    it("returns the stored subscription summary when a row exists", async () => {
      const periodEnd = new Date("2026-12-31T00:00:00.000Z");
      const { service } = createService({
        billingRepository: {
          findSubscriptionByUserId: vi.fn(async () => ({
            tier: "pro",
            status: "active",
            cancelAtPeriodEnd: false,
            currentPeriodEnd: periodEnd,
            stripeCustomerId,
          })),
        },
      });

      const result = await service.getSubscription(auth);

      expect(result.tier).toBe("pro");
      expect(result.status).toBe("active");
      expect(result.hasStripeCustomer).toBe(true);
      expect(result.currentPeriodEnd).toBe(periodEnd.toISOString());
    });
  });

  describe("createCheckoutSession", () => {
    it("creates a new Stripe customer when none exists and persists the customerId", async () => {
      const { service, stripe, billingRepository } = createService({
        billingRepository: {
          findSubscriptionByUserId: vi.fn(async () => null),
          upsertStripeCustomerId: vi.fn(async () => ({ userId: user.id, stripeCustomerId })),
        },
      });

      const result = await service.createCheckoutSession(auth);

      expect(stripe.customers.create).toHaveBeenCalledOnce();
      expect(stripe.customers.create).toHaveBeenCalledWith({
        email: auth.email,
        metadata: { userId: user.id },
      });
      expect(billingRepository.upsertStripeCustomerId).toHaveBeenCalledWith(
        user.id,
        stripeCustomerId,
      );
      expect(result.url).toBe(newCheckoutUrl);
    });

    it("reuses an existing stripeCustomerId without creating a new Stripe customer", async () => {
      const existingCustomerId = "cus_existing_456";
      const { service, stripe, billingRepository } = createService({
        billingRepository: {
          findSubscriptionByUserId: vi.fn(async () => ({
            stripeCustomerId: existingCustomerId,
          })),
          upsertStripeCustomerId: vi.fn(),
        },
      });

      const result = await service.createCheckoutSession(auth);

      // Should NOT create a new customer
      expect(stripe.customers.create).not.toHaveBeenCalled();
      // Should NOT call upsertStripeCustomerId (already have one)
      expect(billingRepository.upsertStripeCustomerId).not.toHaveBeenCalled();

      // Checkout session should use the existing customer id
      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({ customer: existingCustomerId }),
      );
      expect(result.url).toBe(newCheckoutUrl);
    });

    it("creates a checkout session with the correct parameters", async () => {
      const { service, stripe } = createService({
        billingRepository: {
          findSubscriptionByUserId: vi.fn(async () => null),
          upsertStripeCustomerId: vi.fn(async () => ({ userId: user.id, stripeCustomerId })),
        },
      });

      await service.createCheckoutSession(auth);

      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith({
        mode: "subscription",
        customer: stripeCustomerId,
        client_reference_id: user.id,
        line_items: [{ price: "price_pro_test", quantity: 1 }],
        success_url: "http://localhost:3001/billing?checkout=success",
        cancel_url: "http://localhost:3001/billing?checkout=cancel",
      });
    });

    it("throws ServiceUnavailableException when Stripe client get() throws (key unset)", async () => {
      const { service } = createService({
        stripeClientGet: () => {
          throw new Error(
            "Stripe is not configured: STRIPE_SECRET_KEY environment variable is required.",
          );
        },
        billingRepository: {
          findSubscriptionByUserId: vi.fn(async () => null),
        },
      });

      await expect(service.createCheckoutSession(auth)).rejects.toThrow();
    });
  });

  describe("createPortalSession", () => {
    it("returns the Stripe portal URL for a user with a stripeCustomerId", async () => {
      const { service, stripe } = createService({
        billingRepository: {
          findSubscriptionByUserId: vi.fn(async () => ({
            stripeCustomerId,
          })),
        },
      });

      const result = await service.createPortalSession(auth);

      expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
        customer: stripeCustomerId,
        return_url: "http://localhost:3001/billing",
      });
      expect(result.url).toBe(portalUrl);
    });

    it("throws ServiceUnavailableException when user has no stripeCustomerId", async () => {
      const { service } = createService({
        billingRepository: {
          findSubscriptionByUserId: vi.fn(async () => null),
        },
      });

      await expect(service.createPortalSession(auth)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it("throws ServiceUnavailableException when Stripe client get() throws (key unset)", async () => {
      const { service } = createService({
        stripeClientGet: () => {
          throw new Error(
            "Stripe is not configured: STRIPE_SECRET_KEY environment variable is required.",
          );
        },
        billingRepository: {
          findSubscriptionByUserId: vi.fn(async () => ({ stripeCustomerId })),
        },
      });

      await expect(service.createPortalSession(auth)).rejects.toThrow();
    });
  });
});
