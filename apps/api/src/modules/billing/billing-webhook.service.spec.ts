import { describe, expect, it, vi } from "vitest";
import { BillingWebhookService } from "./billing-webhook.service.js";

// We need to mock the env module so STRIPE_WEBHOOK_SECRET is controlled per-test
vi.mock("../../env.js", () => ({
  env: {
    STRIPE_WEBHOOK_SECRET: "whsec_test_secret",
    STRIPE_SECRET_KEY: "sk_test_key",
    STRIPE_PRICE_PRO: "price_pro_test",
    WEB_APP_BASE_URL: "http://localhost:3001",
  },
}));

const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
const stripeCustomerId = "cus_test_abc123";
const stripeSubscriptionId = "sub_test_xyz789";

// A timestamp representing "now" for tests — Unix seconds
const baseEventCreated = 1750000000;

function makeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: stripeSubscriptionId,
    customer: stripeCustomerId,
    status: "active",
    cancel_at_period_end: false,
    items: {
      data: [
        {
          price: { id: "price_pro_test" },
          current_period_end: 1751000000,
        },
      ],
    },
    ...overrides,
  };
}

function makeCheckoutSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_test_abc",
    client_reference_id: userId,
    customer: stripeCustomerId,
    ...overrides,
  };
}

function makeEvent(type: string, object: unknown, created = baseEventCreated) {
  return {
    type,
    data: { object },
    id: `evt_${type.replace(/\./g, "_")}`,
    created,
  } as unknown as import("stripe").default.Event;
}

function makeExistingSubscription(overrides: Record<string, unknown> = {}) {
  return {
    userId,
    stripeCustomerId,
    stripeSubscriptionId,
    lastStripeEventAt: null,
    ...overrides,
  };
}

function createService(deps: {
  billingRepository?: Record<string, unknown>;
  stripeWebhooksConstructEvent?: (...args: unknown[]) => unknown;
} = {}) {
  const billingRepository = {
    findSubscriptionByUserId: vi.fn(async () => null),
    findSubscriptionByStripeCustomerId: vi.fn(async () => makeExistingSubscription()),
    upsertStripeCustomerId: vi.fn(async () => ({ userId, stripeCustomerId })),
    upsertSubscriptionFromStripe: vi.fn(async () => ({ userId })),
    recordWebhookEventIfNew: vi.fn(async () => true), // default: new event
    ...deps.billingRepository,
  };

  const mockStripeConstructEvent = deps.stripeWebhooksConstructEvent ?? vi.fn(() => {
    // default: just return something truthy to indicate valid
    return { type: "checkout.session.completed", data: { object: {} } };
  });

  const stripeClient = {
    get: vi.fn(() => ({
      webhooks: {
        constructEvent: mockStripeConstructEvent,
      },
    })),
  };

  return {
    service: new BillingWebhookService(billingRepository as never, stripeClient as never),
    billingRepository,
    mockStripeConstructEvent,
  };
}

describe("BillingWebhookService", () => {
  describe("constructEvent", () => {
    it("delegates to stripe.webhooks.constructEvent and returns the result", () => {
      const fakeEvent = { type: "checkout.session.completed", data: { object: {} } };
      const mockConstructEvent = vi.fn(() => fakeEvent);
      const { service } = createService({
        stripeWebhooksConstructEvent: mockConstructEvent,
      });

      const rawBody = Buffer.from('{"type":"checkout.session.completed"}');
      const result = service.constructEvent(rawBody, "t=123,v1=abc");

      expect(mockConstructEvent).toHaveBeenCalledWith(rawBody, "t=123,v1=abc", "whsec_test_secret");
      expect(result).toBe(fakeEvent);
    });

    it("surfaces signature verification failures as errors", () => {
      const mockConstructEvent = vi.fn(() => {
        throw new Error("No signatures found matching the expected signature for payload.");
      });
      const { service } = createService({
        stripeWebhooksConstructEvent: mockConstructEvent,
      });

      expect(() =>
        service.constructEvent(Buffer.from("{}"), "bad-signature"),
      ).toThrowError("No signatures found matching the expected signature");
    });
  });

  describe("handleEvent — event-ID deduplication", () => {
    it("skips all handlers when recordWebhookEventIfNew returns false (duplicate event)", async () => {
      const { service, billingRepository } = createService({
        billingRepository: {
          recordWebhookEventIfNew: vi.fn(async () => false),
          upsertSubscriptionFromStripe: vi.fn(),
          upsertStripeCustomerId: vi.fn(),
          findSubscriptionByStripeCustomerId: vi.fn(async () => makeExistingSubscription()),
          findSubscriptionByUserId: vi.fn(async () => null),
        },
      });

      await service.handleEvent(
        makeEvent("customer.subscription.updated", makeSubscription()),
      );

      expect(billingRepository.upsertSubscriptionFromStripe).not.toHaveBeenCalled();
      expect(billingRepository.upsertStripeCustomerId).not.toHaveBeenCalled();
    });

    it("calls recordWebhookEventIfNew with the event id and type", async () => {
      const { service, billingRepository } = createService();

      const event = makeEvent("customer.subscription.updated", makeSubscription());
      await service.handleEvent(event);

      expect(billingRepository.recordWebhookEventIfNew).toHaveBeenCalledWith(
        event.id,
        "customer.subscription.updated",
      );
    });
  });

  describe("handleEvent — checkout.session.completed", () => {
    it("upserts stripeCustomerId when no existing customer for the user", async () => {
      const { service, billingRepository } = createService({
        billingRepository: {
          findSubscriptionByUserId: vi.fn(async () => null),
          upsertStripeCustomerId: vi.fn(async () => ({ userId, stripeCustomerId })),
        },
      });

      await service.handleEvent(
        makeEvent("checkout.session.completed", makeCheckoutSession()),
      );

      expect(billingRepository.findSubscriptionByUserId).toHaveBeenCalledWith(userId);
      expect(billingRepository.upsertStripeCustomerId).toHaveBeenCalledWith(
        userId,
        stripeCustomerId,
      );
    });

    it("does not upsert stripeCustomerId when one already exists", async () => {
      const upsertStripeCustomerId = vi.fn(async () => ({ userId, stripeCustomerId }));
      const { service } = createService({
        billingRepository: {
          findSubscriptionByUserId: vi.fn(async () => ({
            userId,
            stripeCustomerId,
          })),
          upsertStripeCustomerId,
        },
      });

      await service.handleEvent(
        makeEvent("checkout.session.completed", makeCheckoutSession()),
      );

      expect(upsertStripeCustomerId).not.toHaveBeenCalled();
    });

    it("ignores sessions without client_reference_id", async () => {
      const { service, billingRepository } = createService();

      await service.handleEvent(
        makeEvent("checkout.session.completed", makeCheckoutSession({ client_reference_id: null })),
      );

      expect(billingRepository.upsertStripeCustomerId).not.toHaveBeenCalled();
    });
  });

  describe("handleEvent — customer.subscription.created / updated", () => {
    it("maps active subscription to tier=pro and persists via upsertSubscriptionFromStripe", async () => {
      const { service, billingRepository } = createService();

      await service.handleEvent(
        makeEvent("customer.subscription.created", makeSubscription({ status: "active" })),
      );

      expect(billingRepository.upsertSubscriptionFromStripe).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          stripeSubscriptionId,
          stripeCustomerId,
          status: "active",
          tier: "pro",
          priceId: "price_pro_test",
          cancelAtPeriodEnd: false,
        }),
      );
      const callArgs = (billingRepository.upsertSubscriptionFromStripe as ReturnType<typeof vi.fn>)
        .mock.calls[0]?.[1];
      expect(callArgs?.currentPeriodEnd).toBeInstanceOf(Date);
    });

    it("persists lastStripeEventAt from event.created on upsert", async () => {
      const { service, billingRepository } = createService();
      const eventCreated = 1750500000;

      await service.handleEvent(
        makeEvent("customer.subscription.updated", makeSubscription(), eventCreated),
      );

      const callArgs = (billingRepository.upsertSubscriptionFromStripe as ReturnType<typeof vi.fn>)
        .mock.calls[0]?.[1];
      expect(callArgs?.lastStripeEventAt).toEqual(new Date(eventCreated * 1000));
    });

    it("maps trialing subscription to tier=pro", async () => {
      const { service, billingRepository } = createService();

      await service.handleEvent(
        makeEvent("customer.subscription.updated", makeSubscription({ status: "trialing" })),
      );

      expect(billingRepository.upsertSubscriptionFromStripe).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ tier: "pro", status: "trialing" }),
      );
    });

    it("maps past_due subscription to tier=pro", async () => {
      const { service, billingRepository } = createService();

      await service.handleEvent(
        makeEvent("customer.subscription.updated", makeSubscription({ status: "past_due" })),
      );

      expect(billingRepository.upsertSubscriptionFromStripe).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ tier: "pro", status: "past_due" }),
      );
    });

    it("maps canceled subscription to tier=free", async () => {
      const { service, billingRepository } = createService();

      await service.handleEvent(
        makeEvent("customer.subscription.updated", makeSubscription({ status: "canceled" })),
      );

      expect(billingRepository.upsertSubscriptionFromStripe).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ tier: "free", status: "canceled" }),
      );
    });

    it("maps unpaid subscription to tier=free", async () => {
      const { service, billingRepository } = createService();

      await service.handleEvent(
        makeEvent("customer.subscription.updated", makeSubscription({ status: "unpaid" })),
      );

      expect(billingRepository.upsertSubscriptionFromStripe).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ tier: "free", status: "unpaid" }),
      );
    });

    it("skips upsert when customer has no matching user row", async () => {
      const { service, billingRepository } = createService({
        billingRepository: {
          findSubscriptionByStripeCustomerId: vi.fn(async () => null),
          upsertSubscriptionFromStripe: vi.fn(),
        },
      });

      await service.handleEvent(
        makeEvent("customer.subscription.created", makeSubscription()),
      );

      expect(billingRepository.upsertSubscriptionFromStripe).not.toHaveBeenCalled();
    });

    it("converts current_period_end Unix timestamp to a Date", async () => {
      const unixSeconds = 1751000000;
      const { service, billingRepository } = createService();

      await service.handleEvent(
        makeEvent(
          "customer.subscription.updated",
          makeSubscription({ items: { data: [{ price: { id: "price_pro" }, current_period_end: unixSeconds }] } }),
        ),
      );

      const callArgs = (billingRepository.upsertSubscriptionFromStripe as ReturnType<typeof vi.fn>)
        .mock.calls[0]?.[1];
      expect(callArgs?.currentPeriodEnd).toEqual(new Date(unixSeconds * 1000));
    });

    it("skips upsert when incoming event.created is older than stored lastStripeEventAt", async () => {
      const storedEventAt = new Date(1750000000 * 1000); // stored: time T
      const staleEventCreated = 1749000000; // incoming: T - 1000s (older)

      const { service, billingRepository } = createService({
        billingRepository: {
          findSubscriptionByStripeCustomerId: vi.fn(async () =>
            makeExistingSubscription({ lastStripeEventAt: storedEventAt }),
          ),
          upsertSubscriptionFromStripe: vi.fn(),
        },
      });

      await service.handleEvent(
        makeEvent("customer.subscription.updated", makeSubscription(), staleEventCreated),
      );

      expect(billingRepository.upsertSubscriptionFromStripe).not.toHaveBeenCalled();
    });

    it("skips upsert when incoming event.created equals stored lastStripeEventAt (same-timestamp replay)", async () => {
      const storedEventAt = new Date(baseEventCreated * 1000);

      const { service, billingRepository } = createService({
        billingRepository: {
          findSubscriptionByStripeCustomerId: vi.fn(async () =>
            makeExistingSubscription({ lastStripeEventAt: storedEventAt }),
          ),
          upsertSubscriptionFromStripe: vi.fn(),
        },
      });

      await service.handleEvent(
        makeEvent("customer.subscription.updated", makeSubscription(), baseEventCreated),
      );

      expect(billingRepository.upsertSubscriptionFromStripe).not.toHaveBeenCalled();
    });

    it("applies and persists lastStripeEventAt when incoming event is newer than stored", async () => {
      const storedEventAt = new Date(1749000000 * 1000); // stored: old time
      const newerEventCreated = 1750000000; // incoming: newer

      const upsertSubscriptionFromStripe = vi.fn(async () => ({ userId }));
      const { service } = createService({
        billingRepository: {
          findSubscriptionByStripeCustomerId: vi.fn(async () =>
            makeExistingSubscription({ lastStripeEventAt: storedEventAt }),
          ),
          upsertSubscriptionFromStripe,
        },
      });

      await service.handleEvent(
        makeEvent("customer.subscription.updated", makeSubscription(), newerEventCreated),
      );

      expect(upsertSubscriptionFromStripe).toHaveBeenCalledTimes(1);
      const callArgs = (upsertSubscriptionFromStripe.mock.calls[0] as unknown[])?.[1] as Record<string, unknown> | undefined;
      expect(callArgs?.lastStripeEventAt).toEqual(new Date(newerEventCreated * 1000));
    });

    it("applies update when lastStripeEventAt is null (first event for subscription)", async () => {
      const upsertSubscriptionFromStripe = vi.fn(async () => ({ userId }));
      const { service } = createService({
        billingRepository: {
          findSubscriptionByStripeCustomerId: vi.fn(async () =>
            makeExistingSubscription({ lastStripeEventAt: null }),
          ),
          upsertSubscriptionFromStripe,
        },
      });

      await service.handleEvent(
        makeEvent("customer.subscription.updated", makeSubscription(), baseEventCreated),
      );

      expect(upsertSubscriptionFromStripe).toHaveBeenCalledTimes(1);
    });
  });

  describe("handleEvent — customer.subscription.deleted", () => {
    it("sets tier=free and status=canceled on deletion", async () => {
      const { service, billingRepository } = createService();

      await service.handleEvent(
        makeEvent("customer.subscription.deleted", makeSubscription({ status: "canceled" })),
      );

      expect(billingRepository.upsertSubscriptionFromStripe).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          tier: "free",
          status: "canceled",
          cancelAtPeriodEnd: false,
          currentPeriodEnd: null,
        }),
      );
    });

    it("persists lastStripeEventAt on deletion", async () => {
      const { service, billingRepository } = createService();
      const eventCreated = 1750500000;

      await service.handleEvent(
        makeEvent("customer.subscription.deleted", makeSubscription(), eventCreated),
      );

      const callArgs = (billingRepository.upsertSubscriptionFromStripe as ReturnType<typeof vi.fn>)
        .mock.calls[0]?.[1];
      expect(callArgs?.lastStripeEventAt).toEqual(new Date(eventCreated * 1000));
    });

    it("skips upsert on deletion when customer has no matching user row", async () => {
      const { service, billingRepository } = createService({
        billingRepository: {
          findSubscriptionByStripeCustomerId: vi.fn(async () => null),
          upsertSubscriptionFromStripe: vi.fn(),
        },
      });

      await service.handleEvent(
        makeEvent("customer.subscription.deleted", makeSubscription()),
      );

      expect(billingRepository.upsertSubscriptionFromStripe).not.toHaveBeenCalled();
    });

    it("skips deletion when incoming event.created is older than stored lastStripeEventAt", async () => {
      const storedEventAt = new Date(1750000000 * 1000);
      const staleEventCreated = 1749000000;

      const { service, billingRepository } = createService({
        billingRepository: {
          findSubscriptionByStripeCustomerId: vi.fn(async () =>
            makeExistingSubscription({ lastStripeEventAt: storedEventAt }),
          ),
          upsertSubscriptionFromStripe: vi.fn(),
        },
      });

      await service.handleEvent(
        makeEvent("customer.subscription.deleted", makeSubscription(), staleEventCreated),
      );

      expect(billingRepository.upsertSubscriptionFromStripe).not.toHaveBeenCalled();
    });

    it("applies deletion when incoming event.created is newer than stored lastStripeEventAt", async () => {
      const storedEventAt = new Date(1749000000 * 1000);
      const newerEventCreated = 1750000000;

      const upsertSubscriptionFromStripe = vi.fn(async () => ({ userId }));
      const { service } = createService({
        billingRepository: {
          findSubscriptionByStripeCustomerId: vi.fn(async () =>
            makeExistingSubscription({ lastStripeEventAt: storedEventAt }),
          ),
          upsertSubscriptionFromStripe,
        },
      });

      await service.handleEvent(
        makeEvent("customer.subscription.deleted", makeSubscription(), newerEventCreated),
      );

      expect(upsertSubscriptionFromStripe).toHaveBeenCalledTimes(1);
      const callArgs = (upsertSubscriptionFromStripe.mock.calls[0] as unknown[])?.[1] as Record<string, unknown> | undefined;
      expect(callArgs?.tier).toBe("free");
      expect(callArgs?.status).toBe("canceled");
      expect(callArgs?.lastStripeEventAt).toEqual(new Date(newerEventCreated * 1000));
    });
  });

  describe("idempotency", () => {
    it("duplicate event (same event.id) is skipped — no subscription upsert called", async () => {
      // First call returns true (new), second returns false (duplicate)
      let callCount = 0;
      const recordWebhookEventIfNew = vi.fn(async () => {
        callCount++;
        return callCount === 1;
      });
      const upsertSubscriptionFromStripe = vi.fn(async () => ({ userId }));

      const { service } = createService({
        billingRepository: {
          findSubscriptionByStripeCustomerId: vi.fn(async () => makeExistingSubscription()),
          upsertSubscriptionFromStripe,
          recordWebhookEventIfNew,
        },
      });

      const event = makeEvent("customer.subscription.updated", makeSubscription());

      await service.handleEvent(event);
      await service.handleEvent(event);

      // First delivery processed; second delivery skipped by dedupe
      expect(upsertSubscriptionFromStripe).toHaveBeenCalledTimes(1);
    });

    it("calling handleEvent twice for the same checkout.session.completed is safe", async () => {
      const upsertStripeCustomerId = vi.fn(async () => ({ userId, stripeCustomerId }));

      // First call: no existing customer
      // Second call: existing customer (simulating idempotent re-delivery)
      let callCount = 0;
      const findSubscriptionByUserId = vi.fn(async () => {
        callCount++;
        return callCount === 1 ? null : { userId, stripeCustomerId };
      });

      // recordWebhookEventIfNew returns true (new) each time, simulating
      // two distinct event ids (different delivery IDs) for the same checkout session.
      // This tests that the customer-id check itself is also idempotent.
      const { service } = createService({
        billingRepository: {
          findSubscriptionByUserId,
          upsertStripeCustomerId,
        },
      });

      const event = makeEvent("checkout.session.completed", makeCheckoutSession());

      await service.handleEvent(event);
      await service.handleEvent(event);

      // First delivery upserts, second delivery finds existing and skips
      expect(upsertStripeCustomerId).toHaveBeenCalledTimes(1);
    });
  });

  describe("unhandled event types", () => {
    it("ignores unknown event types without throwing", async () => {
      const { service, billingRepository } = createService();

      await expect(
        service.handleEvent(makeEvent("payment_intent.created", {})),
      ).resolves.toBeUndefined();

      expect(billingRepository.upsertSubscriptionFromStripe).not.toHaveBeenCalled();
      expect(billingRepository.upsertStripeCustomerId).not.toHaveBeenCalled();
    });
  });
});
