import type { Entitlement } from "@health/types";
import { Injectable } from "@nestjs/common";
import { BillingRepository } from "./billing.repository.js";

/** Free-tier daily AI message limit. Named constant — code-level safety floor. */
export const FREE_TIER_AI_MESSAGES_PER_DAY = 10;

export class AiMessageQuotaExceededError extends Error {
  readonly tier = "free" as const;
  readonly limitReached = true as const;

  constructor() {
    super("Daily AI message limit reached for free tier.");
    this.name = "AiMessageQuotaExceededError";
  }
}

@Injectable()
export class EntitlementsService {
  constructor(private readonly billingRepository: BillingRepository) {}

  async getEntitlement(userId: string, todayIsoDate: string): Promise<Entitlement> {
    const subscription = await this.billingRepository.findSubscriptionByUserId(userId);
    const tier = subscription?.tier ?? "free";

    if (tier === "pro") {
      return {
        tier: "pro",
        aiMessagesPerDay: null,
        aiMessagesUsedToday: 0,
        aiMessagesRemaining: null,
      };
    }

    const usage = await this.billingRepository.getAiUsageForDate(userId, todayIsoDate);
    const used = usage?.messageCount ?? 0;
    const remaining = Math.max(0, FREE_TIER_AI_MESSAGES_PER_DAY - used);

    return {
      tier: "free",
      aiMessagesPerDay: FREE_TIER_AI_MESSAGES_PER_DAY,
      aiMessagesUsedToday: used,
      aiMessagesRemaining: remaining,
    };
  }

  /**
   * Throws AiMessageQuotaExceededError when a free user is at the daily limit.
   * Pro users always pass.
   */
  async assertAiMessageAllowed(userId: string, todayIsoDate: string): Promise<void> {
    const subscription = await this.billingRepository.findSubscriptionByUserId(userId);
    const tier = subscription?.tier ?? "free";

    if (tier === "pro") {
      return;
    }

    const usage = await this.billingRepository.getAiUsageForDate(userId, todayIsoDate);
    const used = usage?.messageCount ?? 0;

    if (used >= FREE_TIER_AI_MESSAGES_PER_DAY) {
      throw new AiMessageQuotaExceededError();
    }
  }

  /**
   * Atomically increments today's usage counter.
   * Call after a successful LLM response — not before.
   */
  async recordAiMessageUsage(userId: string, todayIsoDate: string): Promise<void> {
    await this.billingRepository.incrementAiUsage(userId, todayIsoDate);
  }
}
