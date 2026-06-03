import { z } from "zod";
import { isoDateTimeSchema } from "./dates.js";

export const subscriptionTierSchema = z.enum(["free", "pro"]);

export type SubscriptionTier = z.infer<typeof subscriptionTierSchema>;

export const subscriptionStatusSchema = z.enum([
  "active",
  "trialing",
  "past_due",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "unpaid",
  "paused",
]);

export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export const subscriptionSummarySchema = z.object({
  tier: subscriptionTierSchema,
  status: subscriptionStatusSchema.nullable(),
  cancelAtPeriodEnd: z.boolean(),
  currentPeriodEnd: isoDateTimeSchema.nullable(),
  hasStripeCustomer: z.boolean(),
});

export type SubscriptionSummary = z.infer<typeof subscriptionSummarySchema>;

export const entitlementSchema = z.object({
  tier: subscriptionTierSchema,
  aiMessagesPerDay: z.number().int().positive().nullable(),
  aiMessagesUsedToday: z.number().int().nonnegative(),
  aiMessagesRemaining: z.number().int().nonnegative().nullable(),
});

export type Entitlement = z.infer<typeof entitlementSchema>;

export const createCheckoutSessionResponseSchema = z.object({
  url: z.string().url(),
});

export type CreateCheckoutSessionResponse = z.infer<
  typeof createCheckoutSessionResponseSchema
>;

export const createPortalSessionResponseSchema = z.object({
  url: z.string().url(),
});

export type CreatePortalSessionResponse = z.infer<
  typeof createPortalSessionResponseSchema
>;
