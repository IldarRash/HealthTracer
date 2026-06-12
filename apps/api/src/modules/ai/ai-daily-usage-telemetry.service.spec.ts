import { afterEach, describe, expect, it, vi } from "vitest";
import { AiDailyUsageTelemetryService } from "./ai-daily-usage-telemetry.service.js";

const USER_ID = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";

const PRICED_USAGE = {
  promptTokens: 100,
  completionTokens: 20,
  totalTokens: 120,
  model: "gpt-4o-mini",
};

function createServiceWithSpy() {
  const service = new AiDailyUsageTelemetryService();
  const logSpy = vi.spyOn(
    (service as unknown as Record<string, unknown>)["logger"] as { log: (v: unknown) => void },
    "log",
  );

  return { service, logSpy };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AiDailyUsageTelemetryService", () => {
  it("emits one ai.daily_usage line per turn with the day's running totals", async () => {
    const { service, logSpy } = createServiceWithSpy();

    service.recordTurn({
      userId: USER_ID,
      usageDate: "2026-06-12",
      messageCount: 1,
      usages: [PRICED_USAGE],
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith({
      event: "ai.daily_usage",
      usageDate: "2026-06-12",
      userId: USER_ID,
      messageCount: 1,
      promptTokens: 100,
      completionTokens: 20,
      totalTokens: 120,
      estimatedCostUsd: 0.000027,
    });
  });

  it("accumulates running totals across turns on the same user-day", () => {
    const { service, logSpy } = createServiceWithSpy();

    service.recordTurn({
      userId: USER_ID,
      usageDate: "2026-06-12",
      messageCount: 1,
      usages: [PRICED_USAGE],
    });
    service.recordTurn({
      userId: USER_ID,
      usageDate: "2026-06-12",
      messageCount: 2,
      usages: [PRICED_USAGE, undefined],
    });

    expect(logSpy).toHaveBeenLastCalledWith({
      event: "ai.daily_usage",
      usageDate: "2026-06-12",
      userId: USER_ID,
      messageCount: 2,
      promptTokens: 200,
      completionTokens: 40,
      totalTokens: 240,
      estimatedCostUsd: 0.000054,
    });
  });

  it("keeps per-user totals separate and tolerates a null messageCount (failed increment)", () => {
    const { service, logSpy } = createServiceWithSpy();

    service.recordTurn({
      userId: USER_ID,
      usageDate: "2026-06-12",
      messageCount: 5,
      usages: [PRICED_USAGE],
    });
    service.recordTurn({
      userId: "another-user",
      usageDate: "2026-06-12",
      messageCount: null,
      usages: [PRICED_USAGE],
    });

    expect(logSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        userId: "another-user",
        messageCount: null,
        // Fresh totals for the other user — not the first user's running sum.
        totalTokens: 120,
      }),
    );
  });

  it("emits estimatedCostUsd null when no turn contributed a priced-model usage", () => {
    const { service, logSpy } = createServiceWithSpy();

    service.recordTurn({
      userId: USER_ID,
      usageDate: "2026-06-12",
      messageCount: 1,
      usages: [
        { promptTokens: 10, completionTokens: 5, totalTokens: 15, model: "unpriced-model" },
        undefined,
      ],
    });

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({ totalTokens: 15, estimatedCostUsd: null }),
    );
  });

  it("prunes user-day entries older than the 48h window so the in-process map stays bounded", () => {
    const { service, logSpy } = createServiceWithSpy();

    service.recordTurn({
      userId: USER_ID,
      usageDate: "2026-06-10",
      messageCount: 1,
      usages: [PRICED_USAGE],
    });
    // Three days later: the 2026-06-10 entry is strictly older than the 48h
    // window and is pruned. (48h, not 24h: timezone-local dates span two
    // calendar days at any instant, so a 24h window could reset a live day.)
    service.recordTurn({
      userId: USER_ID,
      usageDate: "2026-06-13",
      messageCount: 1,
      usages: [PRICED_USAGE],
    });

    expect(logSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ usageDate: "2026-06-13", totalTokens: 120 }),
    );
    expect(
      (service as unknown as { totalsByUserDay: Map<string, unknown> }).totalsByUserDay.has(
        `${USER_ID}:2026-06-10`,
      ),
    ).toBe(false);
  });
});
