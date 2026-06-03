import { describe, expect, it } from "vitest";
import { getTodayIsoDateInTimezone, shiftIsoDate } from "@health/types";
import { WellbeingAiContextService } from "./wellbeing-ai-context.service.js";

const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
const checkInOneId = "a1000001-0000-4000-8000-000000000001";
const checkInTwoId = "a1000002-0000-4000-8000-000000000002";

describe("WellbeingAiContextService", () => {
  it("excludes raw notes and crisis text while preserving sufficiency and trends", async () => {
    const today = getTodayIsoDateInTimezone("UTC");
    const service = new WellbeingAiContextService({
      listRecentByUserId: async () => [
        {
          id: checkInOneId,
          userId,
          date: shiftIsoDate(today, -3),
          moodScore: 2,
          stressScore: 5,
          tags: [],
          note: "Private crisis keyword text should not enter coaching context",
          source: "user_entry",
          crisisFlagReasons: ["keyword_match"],
          createdAt: new Date("2026-05-22T12:00:00.000Z"),
          updatedAt: new Date("2026-05-22T12:00:00.000Z"),
        },
        {
          id: checkInTwoId,
          userId,
          date: shiftIsoDate(today, -2),
          moodScore: 3,
          stressScore: 4,
          tags: [],
          note: "Private note",
          source: "user_entry",
          crisisFlagReasons: [],
          createdAt: new Date("2026-05-23T12:00:00.000Z"),
          updatedAt: new Date("2026-05-23T12:00:00.000Z"),
        },
        {
          id: "a1000003-0000-4000-8000-000000000003",
          userId,
          date: shiftIsoDate(today, -1),
          moodScore: 4,
          stressScore: 3,
          tags: [],
          note: null,
          source: "user_entry",
          crisisFlagReasons: [],
          createdAt: new Date("2026-05-24T12:00:00.000Z"),
          updatedAt: new Date("2026-05-24T12:00:00.000Z"),
        },
        {
          id: "a1000004-0000-4000-8000-000000000004",
          userId,
          date: today,
          moodScore: 5,
          stressScore: 2,
          tags: [],
          note: "Private newest note",
          source: "user_entry",
          crisisFlagReasons: [],
          createdAt: new Date("2026-05-25T12:00:00.000Z"),
          updatedAt: new Date("2026-05-25T12:00:00.000Z"),
        },
      ],
    } as never);

    const summary = await service.buildSummaryForUser(userId, "UTC");

    expect(summary).toMatchObject({
      latestDate: today,
      latestMoodScore: 5,
      latestStressScore: 2,
      checkInCount: 4,
      dataSufficiency: "sufficient",
      moodTrendDirection: "up",
      stressTrendDirection: "down",
      currentStreak: 4,
    });
    expect(JSON.stringify(summary)).not.toContain("Private");
    expect(JSON.stringify(summary)).not.toContain("crisis");
  });
});
