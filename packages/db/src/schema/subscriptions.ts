import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "unpaid",
  "paused",
]);

export const subscriptionTierEnum = pgEnum("subscription_tier", ["free", "pro"]);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    stripeCustomerId: text("stripe_customer_id").unique(),
    stripeSubscriptionId: text("stripe_subscription_id").unique(),
    status: subscriptionStatusEnum("status"),
    tier: subscriptionTierEnum("tier").notNull().default("free"),
    priceId: text("price_id"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    lastStripeEventAt: timestamp("last_stripe_event_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("subscriptions_user_id_idx").on(table.userId),
  }),
);

export const stripeWebhookEvents = pgTable(
  "stripe_webhook_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    eventIdIdx: uniqueIndex("stripe_webhook_events_event_id_idx").on(table.eventId),
  }),
);

export const chatAiUsageDaily = pgTable(
  "chat_ai_usage_daily",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    usageDate: date("usage_date").notNull(),
    messageCount: integer("message_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userDateIdx: uniqueIndex("chat_ai_usage_daily_user_date_idx").on(
      table.userId,
      table.usageDate,
    ),
  }),
);
