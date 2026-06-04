import { chatAiUsageDaily, stripeWebhookEvents, subscriptions } from "@health/db";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { DATABASE } from "../../database/database.tokens.js";
import type { HealthDatabase } from "../../database/database.types.js";

@Injectable()
export class BillingRepository {
  constructor(@Inject(DATABASE) private readonly db: HealthDatabase) {}

  async findSubscriptionByUserId(userId: string) {
    const [row] = await this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    return row ?? null;
  }

  async findSubscriptionByStripeCustomerId(stripeCustomerId: string) {
    const [row] = await this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeCustomerId, stripeCustomerId))
      .limit(1);

    return row ?? null;
  }

  async findSubscriptionByStripeSubscriptionId(stripeSubscriptionId: string) {
    const [row] = await this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
      .limit(1);

    return row ?? null;
  }

  async upsertStripeCustomerId(userId: string, stripeCustomerId: string) {
    const [row] = await this.db
      .insert(subscriptions)
      .values({
        userId,
        stripeCustomerId,
        tier: "free",
        cancelAtPeriodEnd: false,
      })
      .onConflictDoUpdate({
        target: subscriptions.userId,
        set: {
          stripeCustomerId,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!row) {
      throw new Error("Failed to upsert subscription row.");
    }

    return row;
  }

  async upsertSubscriptionFromStripe(
    userId: string,
    data: {
      stripeSubscriptionId: string;
      stripeCustomerId: string;
      status: (typeof subscriptions.$inferInsert)["status"];
      tier: (typeof subscriptions.$inferInsert)["tier"];
      priceId: string | null;
      currentPeriodEnd: Date | null;
      cancelAtPeriodEnd: boolean;
      lastStripeEventAt: Date;
    },
  ) {
    const [row] = await this.db
      .insert(subscriptions)
      .values({
        userId,
        stripeSubscriptionId: data.stripeSubscriptionId,
        stripeCustomerId: data.stripeCustomerId,
        status: data.status,
        tier: data.tier,
        priceId: data.priceId,
        currentPeriodEnd: data.currentPeriodEnd,
        cancelAtPeriodEnd: data.cancelAtPeriodEnd,
        lastStripeEventAt: data.lastStripeEventAt,
      })
      .onConflictDoUpdate({
        target: subscriptions.userId,
        set: {
          stripeSubscriptionId: data.stripeSubscriptionId,
          stripeCustomerId: data.stripeCustomerId,
          status: data.status,
          tier: data.tier,
          priceId: data.priceId,
          currentPeriodEnd: data.currentPeriodEnd,
          cancelAtPeriodEnd: data.cancelAtPeriodEnd,
          lastStripeEventAt: data.lastStripeEventAt,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!row) {
      throw new Error("Failed to upsert subscription.");
    }

    return row;
  }

  /**
   * Attempts to insert a new webhook event deduplication record.
   * Returns true if the record was newly inserted (event not seen before),
   * false if the event was already processed (duplicate).
   */
  async recordWebhookEventIfNew(eventId: string, eventType: string): Promise<boolean> {
    const rows = await this.db
      .insert(stripeWebhookEvents)
      .values({ eventId, eventType })
      .onConflictDoNothing()
      .returning();

    return rows.length > 0;
  }

  async getAiUsageForDate(userId: string, usageDate: string) {
    const [row] = await this.db
      .select()
      .from(chatAiUsageDaily)
      .where(
        and(
          eq(chatAiUsageDaily.userId, userId),
          eq(chatAiUsageDaily.usageDate, usageDate),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  async incrementAiUsage(userId: string, usageDate: string): Promise<number> {
    const [row] = await this.db
      .insert(chatAiUsageDaily)
      .values({
        userId,
        usageDate,
        messageCount: 1,
      })
      .onConflictDoUpdate({
        target: [chatAiUsageDaily.userId, chatAiUsageDaily.usageDate],
        set: {
          messageCount: sql`${chatAiUsageDaily.messageCount} + 1`,
          updatedAt: new Date(),
        },
      })
      .returning();

    return row?.messageCount ?? 1;
  }
}
