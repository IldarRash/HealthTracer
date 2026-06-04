import { describe, expect, it, vi } from "vitest";
import {
  AiMessageQuotaExceededError,
  EntitlementsService,
  FREE_TIER_AI_MESSAGES_PER_DAY,
} from "./entitlements.service.js";

const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
const todayIsoDate = "2026-06-03";

function createService(billingRepository: Record<string, unknown> = {}) {
  return new EntitlementsService(
    {
      findSubscriptionByUserId: async () => null,
      getAiUsageForDate: async () => null,
      incrementAiUsage: async () => 1,
      ...billingRepository,
    } as never,
  );
}

describe("EntitlementsService", () => {
  describe("assertAiMessageAllowed", () => {
    it("allows a free user who is under the daily limit", async () => {
      const service = createService({
        findSubscriptionByUserId: async () => null,
        getAiUsageForDate: async () => ({ messageCount: 5 }),
      });

      await expect(service.assertAiMessageAllowed(userId, todayIsoDate)).resolves.toBeUndefined();
    });

    it("allows a free user with 0 messages used today", async () => {
      const service = createService({
        findSubscriptionByUserId: async () => null,
        getAiUsageForDate: async () => null,
      });

      await expect(service.assertAiMessageAllowed(userId, todayIsoDate)).resolves.toBeUndefined();
    });

    it("throws AiMessageQuotaExceededError when a free user is AT the daily limit", async () => {
      const service = createService({
        findSubscriptionByUserId: async () => null,
        getAiUsageForDate: async () => ({ messageCount: FREE_TIER_AI_MESSAGES_PER_DAY }),
      });

      await expect(service.assertAiMessageAllowed(userId, todayIsoDate)).rejects.toBeInstanceOf(
        AiMessageQuotaExceededError,
      );
    });

    it("throws AiMessageQuotaExceededError when a free user has exceeded the limit", async () => {
      const service = createService({
        findSubscriptionByUserId: async () => null,
        getAiUsageForDate: async () => ({ messageCount: FREE_TIER_AI_MESSAGES_PER_DAY + 5 }),
      });

      await expect(service.assertAiMessageAllowed(userId, todayIsoDate)).rejects.toBeInstanceOf(
        AiMessageQuotaExceededError,
      );
    });

    it("AiMessageQuotaExceededError has the expected properties", async () => {
      const service = createService({
        findSubscriptionByUserId: async () => null,
        getAiUsageForDate: async () => ({ messageCount: FREE_TIER_AI_MESSAGES_PER_DAY }),
      });

      const error = await service.assertAiMessageAllowed(userId, todayIsoDate).catch((e) => e);
      expect(error).toBeInstanceOf(AiMessageQuotaExceededError);
      expect(error.tier).toBe("free");
      expect(error.limitReached).toBe(true);
      expect(error.name).toBe("AiMessageQuotaExceededError");
    });

    it("always allows a pro user regardless of message count", async () => {
      const service = createService({
        findSubscriptionByUserId: async () => ({
          tier: "pro",
          status: "active",
          stripeSubscriptionId: "sub_pro",
          stripeCustomerId: "cus_abc",
        }),
        // getAiUsageForDate should never be called for pro users
        getAiUsageForDate: vi.fn(async () => {
          throw new Error("getAiUsageForDate should not be called for pro users");
        }),
      });

      await expect(service.assertAiMessageAllowed(userId, todayIsoDate)).resolves.toBeUndefined();
    });

    it("allows a pro user even when the count would exceed the free limit", async () => {
      const getAiUsageForDate = vi.fn();
      const service = createService({
        findSubscriptionByUserId: async () => ({ tier: "pro" }),
        getAiUsageForDate,
      });

      await expect(service.assertAiMessageAllowed(userId, todayIsoDate)).resolves.toBeUndefined();
      expect(getAiUsageForDate).not.toHaveBeenCalled();
    });
  });

  describe("recordAiMessageUsage", () => {
    it("calls billingRepository.incrementAiUsage with the correct arguments", async () => {
      const incrementAiUsage = vi.fn(async () => 1);
      const service = createService({ incrementAiUsage });

      await service.recordAiMessageUsage(userId, todayIsoDate);

      expect(incrementAiUsage).toHaveBeenCalledOnce();
      expect(incrementAiUsage).toHaveBeenCalledWith(userId, todayIsoDate);
    });
  });

  describe("getEntitlement", () => {
    it("returns free entitlement with correct remaining count for a user under the limit", async () => {
      const usedToday = 3;
      const service = createService({
        findSubscriptionByUserId: async () => null,
        getAiUsageForDate: async () => ({ messageCount: usedToday }),
      });

      const entitlement = await service.getEntitlement(userId, todayIsoDate);

      expect(entitlement.tier).toBe("free");
      expect(entitlement.aiMessagesPerDay).toBe(FREE_TIER_AI_MESSAGES_PER_DAY);
      expect(entitlement.aiMessagesUsedToday).toBe(usedToday);
      expect(entitlement.aiMessagesRemaining).toBe(FREE_TIER_AI_MESSAGES_PER_DAY - usedToday);
    });

    it("returns remaining = 0 (not negative) when free user has exceeded the limit", async () => {
      const service = createService({
        findSubscriptionByUserId: async () => null,
        getAiUsageForDate: async () => ({ messageCount: FREE_TIER_AI_MESSAGES_PER_DAY + 2 }),
      });

      const entitlement = await service.getEntitlement(userId, todayIsoDate);

      expect(entitlement.aiMessagesRemaining).toBe(0);
    });

    it("returns 0 used and full remaining when free user has no usage today", async () => {
      const service = createService({
        findSubscriptionByUserId: async () => null,
        getAiUsageForDate: async () => null,
      });

      const entitlement = await service.getEntitlement(userId, todayIsoDate);

      expect(entitlement.aiMessagesUsedToday).toBe(0);
      expect(entitlement.aiMessagesRemaining).toBe(FREE_TIER_AI_MESSAGES_PER_DAY);
    });

    it("returns pro entitlement with null aiMessagesPerDay and null aiMessagesRemaining (unlimited)", async () => {
      const service = createService({
        findSubscriptionByUserId: async () => ({ tier: "pro" }),
        getAiUsageForDate: vi.fn(async () => {
          throw new Error("should not be called for pro");
        }),
      });

      const entitlement = await service.getEntitlement(userId, todayIsoDate);

      expect(entitlement.tier).toBe("pro");
      expect(entitlement.aiMessagesPerDay).toBeNull();
      expect(entitlement.aiMessagesRemaining).toBeNull();
      expect(entitlement.aiMessagesUsedToday).toBe(0);
    });
  });

  describe("FREE_TIER_AI_MESSAGES_PER_DAY constant", () => {
    it("is 10", () => {
      expect(FREE_TIER_AI_MESSAGES_PER_DAY).toBe(10);
    });
  });
});
