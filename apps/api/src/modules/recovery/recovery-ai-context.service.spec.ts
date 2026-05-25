import { getTodayIsoDateInTimezone, getWeekStartIsoDate } from "@health/types";
import { describe, expect, it, vi } from "vitest";
import { RecoveryAiContextService } from "./recovery-ai-context.service.js";

const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
const today = getTodayIsoDateInTimezone("UTC");
const weekStart = getWeekStartIsoDate(today);

function buildSnapshot(overrides: {
  date: string;
  band?: string;
  signalCount?: number;
}) {
  return {
    id: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b84",
    userId,
    date: overrides.date,
    band: overrides.band ?? "moderate_load",
    payload: {
      band: overrides.band ?? "moderate_load",
      dataSufficiency: "partial" as const,
      signals: Array.from({ length: overrides.signalCount ?? 1 }, (_, index) => ({
        source: "manual_check_in" as const,
        label: `Recovery signal ${index + 1}`,
        detail: "Moderate fatigue",
      })),
      focusMessage:
        "Based on what you logged, today may carry a moderate load. A balanced pace could help you stay consistent.",
    },
    calculatedAt: new Date("2026-05-25T12:00:00.000Z").toISOString(),
    createdAt: new Date("2026-05-25T12:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-05-25T12:00:00.000Z").toISOString(),
  };
}

describe("RecoveryAiContextService", () => {
  it("returns daily recovery context with refreshed weekly summary and no numeric score framing", async () => {
    const computeAndPersistSnapshot = vi.fn(async (_userId: string, date: string) =>
      buildSnapshot({
        date,
        band: date === weekStart ? "prioritize_recovery" : "moderate_load",
      }),
    );
    const buildWeeklyRecoveryAggregate = vi.fn(async () => ({
      daysWithContext: 7,
      checkInCount: 2,
      bandCounts: {
        well_supported: 0,
        moderate_load: 6,
        prioritize_recovery: 1,
        insufficient_data: 0,
      },
      dominantBand: "moderate_load" as const,
      dataSufficiency: "sufficient" as const,
      message: "This week shows a mixed recovery pattern based on the entries available.",
    }));
    const service = new RecoveryAiContextService({
      computeAndPersistSnapshot,
      buildWeeklyRecoveryAggregate,
    } as never);

    const summary = await service.buildSummaryForUser(userId, "UTC");

    expect(computeAndPersistSnapshot).toHaveBeenCalledWith(userId, today);
    expect(buildWeeklyRecoveryAggregate).toHaveBeenCalledWith(
      userId,
      weekStart,
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
    expect(summary.date).toBe(today);
    expect(summary.weeklySummary).toMatchObject({
      checkInCount: 2,
      daysWithContext: 7,
    });
    expect(summary.signals).toHaveLength(1);
    expect(JSON.stringify(summary)).not.toMatch(/readiness score|recovery score/i);
  });

  it("omits weekly summary when refreshed aggregate has no context", async () => {
    const service = new RecoveryAiContextService({
      computeAndPersistSnapshot: async (_userId: string, date: string) =>
        buildSnapshot({ date, band: "prioritize_recovery" }),
      buildWeeklyRecoveryAggregate: async () => ({
        daysWithContext: 0,
        checkInCount: 0,
        bandCounts: {
          well_supported: 0,
          moderate_load: 0,
          prioritize_recovery: 0,
          insufficient_data: 7,
        },
        dominantBand: null,
        dataSufficiency: "insufficient" as const,
        message: "Recovery patterns are not available for this week yet. Daily check-ins can help build a clearer picture.",
      }),
    } as never);

    const summary = await service.buildSummaryForUser(userId, "UTC");

    expect(summary.band).toBe("prioritize_recovery");
    expect(summary.weeklySummary).toBeUndefined();
    expect(summary.focusMessage).not.toMatch(/score|clinical|diagnos|treat/i);
  });
});
