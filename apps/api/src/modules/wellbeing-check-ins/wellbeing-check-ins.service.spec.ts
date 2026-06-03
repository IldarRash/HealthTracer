import { BadRequestException } from "@nestjs/common";
import { WELLBEING_CHECKIN_STALE_PROPOSAL_DATE_ERROR } from "@health/types";
import { describe, expect, it } from "vitest";
import { WellbeingCheckInsService } from "./wellbeing-check-ins.service.js";

const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
const checkInId = "a1000001-0000-4000-8000-000000000001";
const auth = { clerkUserId: "clerk-user-1", email: "user@example.com" };

function createCheckInRow(overrides: Record<string, unknown> = {}) {
  return {
    id: checkInId,
    userId,
    date: "2026-05-25",
    moodScore: 4,
    stressScore: 2,
    tags: ["steady"],
    note: "Feeling okay.",
    source: "user_entry",
    crisisFlagReasons: [],
    createdAt: new Date("2026-05-25T12:00:00.000Z"),
    updatedAt: new Date("2026-05-25T12:00:00.000Z"),
    ...overrides,
  };
}

const usersService = {
  resolveFromAuth: async () => ({
    id: userId,
    email: "user@example.com",
    displayName: null,
    timezone: "UTC",
    createdAt: "2026-05-25T12:00:00.000Z",
    updatedAt: "2026-05-25T12:00:00.000Z",
  }),
};

function createRepositoryMock(overrides: Record<string, unknown> = {}) {
  return {
    findByUserAndDate: async () => null,
    insertByUserAndDateIfAbsent: async () => ({
      row: createCheckInRow(),
      created: true,
    }),
    upsertByUserAndDate: async () => createCheckInRow(),
    listRecentByUserId: async () => [],
    listByUserAndDateRange: async () => [],
    ...overrides,
  };
}

function createService(repository = createRepositoryMock()) {
  return new WellbeingCheckInsService(
    repository as never,
    {
      buildSummaryForUser: async () => ({
        latestDate: null,
        latestMoodScore: null,
        latestStressScore: null,
        windowDays: 7,
        windowStart: null,
        windowEnd: null,
        checkInCount: 0,
        moodAverage: null,
        stressAverage: null,
        moodTrendDirection: "unknown",
        stressTrendDirection: "unknown",
        currentStreak: 0,
        dataSufficiency: "insufficient",
        generatedAt: "2026-05-25T12:00:00.000Z",
      }),
    } as never,
    usersService as never,
  );
}

describe("WellbeingCheckInsService", () => {
  it("returns null when no check-in exists for a date", async () => {
    const service = createService();

    await expect(service.getCheckInForDate(auth as never, "2026-05-25")).resolves.toEqual({
      checkIn: null,
    });
  });

  it("rejects invalid date params", async () => {
    const service = createService();

    await expect(service.getCheckInForDate(auth as never, "2026-13-40")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("upserts check-ins and returns crisis metadata for lowest mood", async () => {
    const service = createService(
      createRepositoryMock({
        upsertByUserAndDate: async () =>
          createCheckInRow({
            moodScore: 1,
            stressScore: 5,
            tags: [],
            note: null,
            crisisFlagReasons: ["lowest_mood"],
          }),
      }),
    );

    const response = await service.upsertCheckInForDate(auth as never, "2026-05-25", {
      moodScore: 1,
      stressScore: 5,
    });

    expect(response.checkIn.moodScore).toBe(1);
    expect(response.crisisSupport.shouldShowCrisisSupport).toBe(true);
    expect(response.crisisSupport.reasons).toEqual(["lowest_mood"]);
    expect(response.crisisSupport.copy?.title).toBe("Support is available");
  });

  it("creates check-ins only when absent for proposal apply", async () => {
    const service = createService(
      createRepositoryMock({
        insertByUserAndDateIfAbsent: async () => ({
          row: createCheckInRow({ moodScore: 2, stressScore: 3 }),
          created: true,
        }),
      }),
    );

    const response = await service.createCheckInForDateIfAbsent(auth as never, "2026-05-25", {
      moodScore: 2,
      stressScore: 3,
    });

    expect(response.checkIn.moodScore).toBe(2);
  });

  it("rejects create-if-absent when a different check-in already exists", async () => {
    const service = createService(
      createRepositoryMock({
        insertByUserAndDateIfAbsent: async () => ({
          row: createCheckInRow({
            id: "a1000002-0000-4000-8000-000000000002",
            moodScore: 5,
            stressScore: 1,
          }),
          created: false,
        }),
      }),
    );

    await expect(
      service.createCheckInForDateIfAbsent(auth as never, "2026-05-25", {
        moodScore: 2,
        stressScore: 3,
      }),
    ).rejects.toMatchObject({
      response: { message: WELLBEING_CHECKIN_STALE_PROPOSAL_DATE_ERROR },
    });
  });

  it("returns the existing check-in idempotently when expectedExistingCheckInId matches", async () => {
    const existingId = "a1000002-0000-4000-8000-000000000002";
    const service = createService(
      createRepositoryMock({
        insertByUserAndDateIfAbsent: async () => ({
          row: createCheckInRow({ id: existingId, moodScore: 5, stressScore: 1 }),
          created: false,
        }),
      }),
    );

    const response = await service.createCheckInForDateIfAbsent(
      auth as never,
      "2026-05-25",
      { moodScore: 2, stressScore: 3 },
      { expectedExistingCheckInId: existingId },
    );

    expect(response.checkIn.id).toBe(existingId);
    expect(response.checkIn.moodScore).toBe(5);
  });

  it("uses the same user/date upsert path when a check-in is resubmitted", async () => {
    const calls: unknown[][] = [];
    const service = createService(
      createRepositoryMock({
        upsertByUserAndDate: async (...args: unknown[]) => {
          calls.push(args);
          return createCheckInRow({
            moodScore: args[2] && typeof args[2] === "object" && "moodScore" in args[2]
              ? (args[2] as { moodScore: number }).moodScore
              : 4,
            stressScore: args[2] && typeof args[2] === "object" && "stressScore" in args[2]
              ? (args[2] as { stressScore: number }).stressScore
              : 2,
          });
        },
      }),
    );

    await service.upsertCheckInForDate(auth as never, "2026-05-25", {
      moodScore: 4,
      stressScore: 2,
    });
    await service.upsertCheckInForDate(auth as never, "2026-05-25", {
      moodScore: 2,
      stressScore: 5,
      note: "Updated same-day check-in",
    });

    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call.slice(0, 2))).toEqual([
      [userId, "2026-05-25"],
      [userId, "2026-05-25"],
    ]);
    expect(calls[1]?.[2]).toMatchObject({
      moodScore: 2,
      stressScore: 5,
      note: "Updated same-day check-in",
    });
  });

  it("returns note-free history entries", async () => {
    const service = createService(
      createRepositoryMock({
        listRecentByUserId: async () => [
          {
            id: checkInId,
            userId,
            date: "2026-05-25",
            moodScore: 4,
            stressScore: 2,
            tags: [],
            note: "Private note",
            source: "user_entry",
            crisisFlagReasons: [],
            createdAt: new Date("2026-05-25T12:00:00.000Z"),
            updatedAt: new Date("2026-05-25T12:00:00.000Z"),
          },
        ],
      }),
    );

    const history = await service.getHistory(auth as never, { limit: 14 });

    expect(history.entries).toHaveLength(1);
    expect(history.entries[0]).toMatchObject({
      date: "2026-05-25",
      moodScore: 4,
      stressScore: 2,
    });
    expect(history.entries[0]).not.toHaveProperty("note");
  });
});
