import { describe, expect, it } from "vitest";
import {
  createCheckoutSessionResponseSchema,
  createPortalSessionResponseSchema,
  entitlementSchema,
  subscriptionStatusSchema,
  subscriptionSummarySchema,
  subscriptionTierSchema,
} from "./billing.js";

describe("subscriptionTierSchema", () => {
  it("accepts 'free'", () => {
    expect(subscriptionTierSchema.parse("free")).toBe("free");
  });

  it("accepts 'pro'", () => {
    expect(subscriptionTierSchema.parse("pro")).toBe("pro");
  });

  it("rejects unknown tiers", () => {
    expect(subscriptionTierSchema.safeParse("enterprise").success).toBe(false);
    expect(subscriptionTierSchema.safeParse("").success).toBe(false);
    expect(subscriptionTierSchema.safeParse(null).success).toBe(false);
  });
});

describe("subscriptionStatusSchema", () => {
  const validStatuses = [
    "active",
    "trialing",
    "past_due",
    "canceled",
    "incomplete",
    "incomplete_expired",
    "unpaid",
    "paused",
  ] as const;

  for (const status of validStatuses) {
    it(`accepts '${status}'`, () => {
      expect(subscriptionStatusSchema.parse(status)).toBe(status);
    });
  }

  it("rejects unknown statuses", () => {
    expect(subscriptionStatusSchema.safeParse("expired").success).toBe(false);
    expect(subscriptionStatusSchema.safeParse("deleted").success).toBe(false);
    expect(subscriptionStatusSchema.safeParse("").success).toBe(false);
  });
});

describe("subscriptionSummarySchema", () => {
  const validFreeSummary = {
    tier: "free",
    status: null,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    hasStripeCustomer: false,
  };

  const validProSummary = {
    tier: "pro",
    status: "active",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: "2026-12-31T00:00:00.000Z",
    hasStripeCustomer: true,
  };

  it("accepts a valid free subscription summary", () => {
    const result = subscriptionSummarySchema.parse(validFreeSummary);
    expect(result.tier).toBe("free");
    expect(result.status).toBeNull();
    expect(result.hasStripeCustomer).toBe(false);
  });

  it("accepts a valid pro subscription summary", () => {
    const result = subscriptionSummarySchema.parse(validProSummary);
    expect(result.tier).toBe("pro");
    expect(result.status).toBe("active");
    expect(result.hasStripeCustomer).toBe(true);
    expect(result.currentPeriodEnd).toBe("2026-12-31T00:00:00.000Z");
  });

  it("rejects invalid tier", () => {
    expect(
      subscriptionSummarySchema.safeParse({ ...validFreeSummary, tier: "enterprise" }).success,
    ).toBe(false);
  });

  it("rejects invalid status", () => {
    expect(
      subscriptionSummarySchema.safeParse({ ...validProSummary, status: "deleted" }).success,
    ).toBe(false);
  });

  it("rejects missing required fields", () => {
    expect(subscriptionSummarySchema.safeParse({}).success).toBe(false);
    expect(
      subscriptionSummarySchema.safeParse({ tier: "free", status: null }).success,
    ).toBe(false);
  });

  it("rejects non-boolean cancelAtPeriodEnd", () => {
    expect(
      subscriptionSummarySchema.safeParse({ ...validFreeSummary, cancelAtPeriodEnd: "false" }).success,
    ).toBe(false);
  });

  it("rejects non-ISO currentPeriodEnd string", () => {
    expect(
      subscriptionSummarySchema.safeParse({ ...validProSummary, currentPeriodEnd: "not-a-date" }).success,
    ).toBe(false);
  });
});

describe("entitlementSchema", () => {
  const validFreeEntitlement = {
    tier: "free",
    aiMessagesPerDay: 10,
    aiMessagesUsedToday: 3,
    aiMessagesRemaining: 7,
  };

  const validProEntitlement = {
    tier: "pro",
    aiMessagesPerDay: null,
    aiMessagesUsedToday: 0,
    aiMessagesRemaining: null,
  };

  it("accepts a valid free entitlement", () => {
    const result = entitlementSchema.parse(validFreeEntitlement);
    expect(result.tier).toBe("free");
    expect(result.aiMessagesPerDay).toBe(10);
    expect(result.aiMessagesUsedToday).toBe(3);
    expect(result.aiMessagesRemaining).toBe(7);
  });

  it("accepts a valid pro entitlement with null unlimited fields", () => {
    const result = entitlementSchema.parse(validProEntitlement);
    expect(result.tier).toBe("pro");
    expect(result.aiMessagesPerDay).toBeNull();
    expect(result.aiMessagesRemaining).toBeNull();
  });

  it("rejects negative aiMessagesUsedToday", () => {
    expect(
      entitlementSchema.safeParse({ ...validFreeEntitlement, aiMessagesUsedToday: -1 }).success,
    ).toBe(false);
  });

  it("rejects negative aiMessagesRemaining", () => {
    expect(
      entitlementSchema.safeParse({ ...validFreeEntitlement, aiMessagesRemaining: -1 }).success,
    ).toBe(false);
  });

  it("rejects non-positive aiMessagesPerDay", () => {
    expect(
      entitlementSchema.safeParse({ ...validFreeEntitlement, aiMessagesPerDay: 0 }).success,
    ).toBe(false);
    expect(
      entitlementSchema.safeParse({ ...validFreeEntitlement, aiMessagesPerDay: -5 }).success,
    ).toBe(false);
  });

  it("rejects fractional message counts", () => {
    expect(
      entitlementSchema.safeParse({ ...validFreeEntitlement, aiMessagesUsedToday: 1.5 }).success,
    ).toBe(false);
  });

  it("rejects missing fields", () => {
    expect(entitlementSchema.safeParse({}).success).toBe(false);
    expect(
      entitlementSchema.safeParse({ tier: "free" }).success,
    ).toBe(false);
  });
});

describe("createCheckoutSessionResponseSchema", () => {
  it("accepts a valid URL response", () => {
    const result = createCheckoutSessionResponseSchema.parse({
      url: "https://checkout.stripe.com/pay/cs_test_abc",
    });
    expect(result.url).toBe("https://checkout.stripe.com/pay/cs_test_abc");
  });

  it("rejects non-URL strings", () => {
    expect(
      createCheckoutSessionResponseSchema.safeParse({ url: "not-a-url" }).success,
    ).toBe(false);
    expect(
      createCheckoutSessionResponseSchema.safeParse({ url: "" }).success,
    ).toBe(false);
  });

  it("rejects missing url field", () => {
    expect(createCheckoutSessionResponseSchema.safeParse({}).success).toBe(false);
  });
});

describe("createPortalSessionResponseSchema", () => {
  it("accepts a valid URL response", () => {
    const result = createPortalSessionResponseSchema.parse({
      url: "https://billing.stripe.com/session/bps_test_xyz",
    });
    expect(result.url).toBe("https://billing.stripe.com/session/bps_test_xyz");
  });

  it("rejects non-URL strings", () => {
    expect(
      createPortalSessionResponseSchema.safeParse({ url: "not-a-url" }).success,
    ).toBe(false);
  });

  it("rejects missing url field", () => {
    expect(createPortalSessionResponseSchema.safeParse({}).success).toBe(false);
  });
});
