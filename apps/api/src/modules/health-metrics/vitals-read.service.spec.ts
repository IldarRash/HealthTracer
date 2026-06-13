import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { VitalsReadService } from "./vitals-read.service.js";

const auth = {
  clerkUserId: "user_123",
  displayName: "Test User",
  email: "test@example.com",
};

const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
const consentId = "aabb1122-0000-0000-0000-000000000001";
const connectionId = "aabb1122-0000-0000-0000-000000000002";

function makeUser() {
  return {
    id: userId,
    email: "test@example.com",
    displayName: "Test User",
    timezone: "UTC",
    locale: "en",
    onboardingCompletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeSleepRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "snap-sleep-001",
    userId,
    consentId,
    deviceConnectionId: connectionId,
    metricType: "sleep",
    provider: "wearable",
    dedupeKey: "seed:sleep:2026-05-01",
    observedAt: new Date("2026-05-01T22:00:00.000Z"),
    observedEndAt: new Date("2026-05-02T06:00:00.000Z"),
    unit: "minutes",
    normalizedPayload: {
      durationMinutes: 450,
      intervalStart: "2026-05-01T22:00:00.000Z",
      intervalEnd: "2026-05-02T06:00:00.000Z",
      stageSummary: {
        awakeMinutes: 15,
        remMinutes: 90,
        lightMinutes: 200,
        deepMinutes: 145,
      },
    },
    sourceDeviceLabel: null,
    ingestedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

function makeRecoveryRow(inputType: string, value: number, unit: string, date: Date) {
  return {
    id: `snap-${inputType}-${date.toISOString()}`,
    userId,
    consentId,
    deviceConnectionId: connectionId,
    metricType: "recovery_input",
    provider: "wearable",
    dedupeKey: `seed:${inputType}:${date.toISOString()}`,
    observedAt: date,
    observedEndAt: null,
    unit,
    normalizedPayload: { inputType, value, unit },
    sourceDeviceLabel: null,
    ingestedAt: new Date(),
    createdAt: new Date(),
  };
}

function makeHeartRateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "snap-hr-001",
    userId,
    consentId,
    deviceConnectionId: connectionId,
    metricType: "heart_rate",
    provider: "wearable",
    dedupeKey: "seed:hr:2026-05-01:running",
    observedAt: new Date("2026-05-01T10:00:00.000Z"),
    observedEndAt: new Date("2026-05-01T10:45:00.000Z"),
    unit: "bpm",
    normalizedPayload: {
      context: "workout",
      avgBpm: 145,
      maxBpm: 172,
      minBpm: 118,
      activityType: "running",
      samples: [
        { offsetSec: 0, bpm: 120 },
        { offsetSec: 30, bpm: 140 },
        { offsetSec: 60, bpm: 155 },
        { offsetSec: 2700, bpm: 130 },
      ],
      zoneSummary: { z1Min: 5, z2Min: 10, z3Min: 15, z4Min: 10, z5Min: 5 },
    },
    sourceDeviceLabel: null,
    ingestedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

function makeRepo(overrides = {}) {
  return {
    listSleepSnapshotsForRange: vi.fn().mockResolvedValue([]),
    listRecoveryInputSnapshotsByType: vi.fn().mockResolvedValue([]),
    listHeartRateSnapshots: vi.fn().mockResolvedValue([]),
    findHeartRateSnapshotById: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function makeUsersService() {
  return {
    resolveFromAuth: vi.fn().mockResolvedValue(makeUser()),
  };
}

// ---------------------------------------------------------------------------
// Sleep overview tests
// ---------------------------------------------------------------------------

describe("VitalsReadService.getSleepOverview", () => {
  it("calls listSleepSnapshotsForRange with the resolved user.id", async () => {
    const repo = makeRepo();
    const usersService = makeUsersService();
    const service = new VitalsReadService(repo as never, usersService as never);
    await service.getSleepOverview(auth as never);

    expect(repo.listSleepSnapshotsForRange).toHaveBeenCalledWith(
      userId,
      expect.any(Date),
      expect.any(Date),
      expect.any(Number),
    );
  });

  it("returns null lastNight and empty trend when no data", async () => {
    const service = new VitalsReadService(makeRepo() as never, makeUsersService() as never);
    const result = await service.getSleepOverview(auth as never);

    expect(result.lastNight).toBeNull();
    expect(result.trend).toHaveLength(0);
    expect(result.sevenDayAverageMinutes).toBeNull();
    expect(result.recentNights).toHaveLength(0);
  });

  it("returns lastNight from the most recent sleep row", async () => {
    const repo = makeRepo({
      listSleepSnapshotsForRange: vi.fn().mockResolvedValue([makeSleepRow()]),
    });
    const service = new VitalsReadService(repo as never, makeUsersService() as never);
    const result = await service.getSleepOverview(auth as never);

    expect(result.lastNight).not.toBeNull();
    expect(result.lastNight?.durationMinutes).toBe(450);
    expect(result.lastNight?.stageSummary?.deepMinutes).toBe(145);
  });

  it("deduplicates multiple sessions per night — picks longest", async () => {
    const short = makeSleepRow({
      id: "snap-sleep-short",
      dedupeKey: "seed:sleep:short",
      normalizedPayload: {
        durationMinutes: 300,
        intervalStart: "2026-05-01T23:00:00.000Z",
        intervalEnd: "2026-05-02T04:00:00.000Z",
      },
    });
    const long = makeSleepRow({
      id: "snap-sleep-long",
      dedupeKey: "seed:sleep:long",
      normalizedPayload: {
        durationMinutes: 480,
        intervalStart: "2026-05-01T22:00:00.000Z",
        intervalEnd: "2026-05-02T06:00:00.000Z",
        stageSummary: { awakeMinutes: 10, remMinutes: 100, lightMinutes: 200, deepMinutes: 170 },
      },
    });
    const repo = makeRepo({
      listSleepSnapshotsForRange: vi.fn().mockResolvedValue([short, long]),
    });
    const service = new VitalsReadService(repo as never, makeUsersService() as never);
    const result = await service.getSleepOverview(auth as never);

    expect(result.lastNight?.durationMinutes).toBe(480);
    expect(result.recentNights).toHaveLength(1); // same date → deduplicated
  });

  it("builds a 7-day average from the most recent nights", async () => {
    const rows = [450, 420, 400, 500, 480, 390, 460].map((dur, idx) => {
      const d = new Date("2026-05-07T22:00:00.000Z");
      d.setUTCDate(d.getUTCDate() - idx);
      return makeSleepRow({
        id: `snap-sleep-${idx}`,
        dedupeKey: `seed:sleep:${idx}`,
        observedAt: d,
        normalizedPayload: {
          durationMinutes: dur,
          intervalStart: d.toISOString(),
          intervalEnd: new Date(d.getTime() + dur * 60000).toISOString(),
        },
      });
    });
    const repo = makeRepo({
      listSleepSnapshotsForRange: vi.fn().mockResolvedValue(rows),
    });
    const service = new VitalsReadService(repo as never, makeUsersService() as never);
    const result = await service.getSleepOverview(auth as never);

    const expected = Math.round([450, 420, 400, 500, 480, 390, 460].reduce((s, v) => s + v, 0) / 7);
    expect(result.sevenDayAverageMinutes).toBe(expected);
  });

  it("returns null stageSummary when not present in payload", async () => {
    const row = makeSleepRow({
      normalizedPayload: {
        durationMinutes: 400,
        intervalStart: "2026-05-01T23:00:00.000Z",
        intervalEnd: "2026-05-02T05:40:00.000Z",
      },
    });
    const repo = makeRepo({
      listSleepSnapshotsForRange: vi.fn().mockResolvedValue([row]),
    });
    const service = new VitalsReadService(repo as never, makeUsersService() as never);
    const result = await service.getSleepOverview(auth as never);

    expect(result.lastNight?.stageSummary).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Pulse overview tests
// ---------------------------------------------------------------------------

describe("VitalsReadService.getPulseOverview", () => {
  it("returns null latest values when no recovery data", async () => {
    const service = new VitalsReadService(makeRepo() as never, makeUsersService() as never);
    const result = await service.getPulseOverview(auth as never);

    expect(result.restingHeartRate.latest).toBeNull();
    expect(result.hrv.latest).toBeNull();
    expect(result.readiness).toBeNull();
    expect(result.recentWorkouts).toHaveLength(0);
  });

  it("maps RHR snapshot to latest + trend (trend is oldest-first)", async () => {
    // Repository returns newest-first: [58 on May-07, 62 on May-06]
    const rows = [
      makeRecoveryRow("resting_heart_rate", 58, "bpm", new Date("2026-05-07T08:00:00.000Z")),
      makeRecoveryRow("resting_heart_rate", 62, "bpm", new Date("2026-05-06T08:00:00.000Z")),
    ];
    const repo = makeRepo({
      listRecoveryInputSnapshotsByType: vi.fn().mockImplementation((_, inputType) => {
        if (inputType === "resting_heart_rate") return Promise.resolve(rows);
        return Promise.resolve([]);
      }),
    });
    const service = new VitalsReadService(repo as never, makeUsersService() as never);
    const result = await service.getPulseOverview(auth as never);

    // latest always comes from rows[0] (newest), regardless of trend ordering
    expect(result.restingHeartRate.latest?.value).toBe(58);
    expect(result.restingHeartRate.latest?.unit).toBe("bpm");
    expect(result.restingHeartRate.trend).toHaveLength(2);
    // trend is oldest-first: May-06 (62) before May-07 (58)
    expect(result.restingHeartRate.trend[0]?.value).toBe(62);
    expect(result.restingHeartRate.trend[1]?.value).toBe(58);
  });

  it("maps workout heart rate snapshot to recentWorkouts", async () => {
    const repo = makeRepo({
      listHeartRateSnapshots: vi.fn().mockResolvedValue([makeHeartRateRow()]),
    });
    const service = new VitalsReadService(repo as never, makeUsersService() as never);
    const result = await service.getPulseOverview(auth as never);

    expect(result.recentWorkouts).toHaveLength(1);
    expect(result.recentWorkouts[0]?.avgBpm).toBe(145);
    expect(result.recentWorkouts[0]?.maxBpm).toBe(172);
    expect(result.recentWorkouts[0]?.activityType).toBe("running");
    expect(result.recentWorkouts[0]?.zoneSummary).toEqual({
      z1Min: 5,
      z2Min: 10,
      z3Min: 15,
      z4Min: 10,
      z5Min: 5,
    });
  });

  it("sets ownership: resolveFromAuth is always called with the provided auth", async () => {
    const usersService = makeUsersService();
    const service = new VitalsReadService(makeRepo() as never, usersService as never);
    await service.getPulseOverview(auth as never);

    expect(usersService.resolveFromAuth).toHaveBeenCalledWith(auth);
  });

  it("calls listRecoveryInputSnapshotsByType with the resolved user.id for each input type", async () => {
    const repo = makeRepo();
    const service = new VitalsReadService(repo as never, makeUsersService() as never);
    await service.getPulseOverview(auth as never);

    // Should be called three times: resting_heart_rate, hrv_summary, readiness_score
    expect(repo.listRecoveryInputSnapshotsByType).toHaveBeenCalledWith(userId, "resting_heart_rate", expect.any(Number));
    expect(repo.listRecoveryInputSnapshotsByType).toHaveBeenCalledWith(userId, "hrv_summary", expect.any(Number));
    expect(repo.listRecoveryInputSnapshotsByType).toHaveBeenCalledWith(userId, "readiness_score", expect.any(Number));
    expect(repo.listHeartRateSnapshots).toHaveBeenCalledWith(userId, expect.any(Number));
  });

  it("returns trend oldest-first for RHR", async () => {
    const older = makeRecoveryRow("resting_heart_rate", 62, "bpm", new Date("2026-05-06T08:00:00.000Z"));
    const newer = makeRecoveryRow("resting_heart_rate", 58, "bpm", new Date("2026-05-07T08:00:00.000Z"));
    // repo returns newest-first
    const repo = makeRepo({
      listRecoveryInputSnapshotsByType: vi.fn().mockImplementation((_, inputType) => {
        if (inputType === "resting_heart_rate") return Promise.resolve([newer, older]);
        return Promise.resolve([]);
      }),
    });
    const service = new VitalsReadService(repo as never, makeUsersService() as never);
    const result = await service.getPulseOverview(auth as never);

    // trend must be oldest-first
    expect(result.restingHeartRate.trend[0]?.value).toBe(62);
    expect(result.restingHeartRate.trend[1]?.value).toBe(58);
  });

  it("omits trend points with non-numeric payload values (NaN guard)", async () => {
    const badRow = makeRecoveryRow("resting_heart_rate", NaN, "bpm", new Date("2026-05-07T08:00:00.000Z"));
    const goodRow = makeRecoveryRow("resting_heart_rate", 58, "bpm", new Date("2026-05-06T08:00:00.000Z"));
    const repo = makeRepo({
      listRecoveryInputSnapshotsByType: vi.fn().mockImplementation((_, inputType) => {
        if (inputType === "resting_heart_rate") return Promise.resolve([badRow, goodRow]);
        return Promise.resolve([]);
      }),
    });
    const service = new VitalsReadService(repo as never, makeUsersService() as never);
    const result = await service.getPulseOverview(auth as never);

    // NaN row should be filtered out; only the good row survives
    expect(result.restingHeartRate.trend).toHaveLength(1);
    expect(result.restingHeartRate.trend[0]?.value).toBe(58);
    // latest from the first row (NaN) → null, because isFinite guard rejects it
    expect(result.restingHeartRate.latest).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Workout HR detail tests
// ---------------------------------------------------------------------------

describe("VitalsReadService.getWorkoutHeartRateDetail", () => {
  it("calls findHeartRateSnapshotById with the resolved user.id", async () => {
    const repo = makeRepo({
      findHeartRateSnapshotById: vi.fn().mockResolvedValue(makeHeartRateRow()),
    });
    const service = new VitalsReadService(repo as never, makeUsersService() as never);
    await service.getWorkoutHeartRateDetail(auth as never, "snap-hr-001");

    expect(repo.findHeartRateSnapshotById).toHaveBeenCalledWith(userId, "snap-hr-001");
  });

  it("returns NotFoundException when snapshot belongs to a different user (ownership isolation)", async () => {
    // The repository scopes by userId — when another user's id is passed,
    // findHeartRateSnapshotById returns null (as if not found).
    // This tests the service correctly surfaces a 404 for the cross-user case.
    const otherUserSnapshotId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const repo = makeRepo({
      // Simulates the repo returning null because user_id didn't match
      findHeartRateSnapshotById: vi.fn().mockResolvedValue(null),
    });
    const service = new VitalsReadService(repo as never, makeUsersService() as never);

    await expect(
      service.getWorkoutHeartRateDetail(auth as never, otherUserSnapshotId),
    ).rejects.toThrow(NotFoundException);

    // Verify it was called with the caller's userId, not the snapshot owner's id
    expect(repo.findHeartRateSnapshotById).toHaveBeenCalledWith(userId, otherUserSnapshotId);
  });

  it("throws NotFoundException when snapshot not found", async () => {
    const service = new VitalsReadService(makeRepo() as never, makeUsersService() as never);
    await expect(
      service.getWorkoutHeartRateDetail(auth as never, "nonexistent-id"),
    ).rejects.toThrow(NotFoundException);
  });

  it("returns samples from the snapshot", async () => {
    const row = makeHeartRateRow();
    const repo = makeRepo({
      findHeartRateSnapshotById: vi.fn().mockResolvedValue(row),
    });
    const service = new VitalsReadService(repo as never, makeUsersService() as never);
    const result = await service.getWorkoutHeartRateDetail(auth as never, "snap-hr-001");

    expect(result.samples).toHaveLength(4);
    expect(result.samples[0]).toEqual({ offsetSec: 0, bpm: 120 });
    expect(result.snapshotId).toBe("snap-hr-001");
  });

  it("computes durationMinutes from last sample offsetSec", async () => {
    const row = makeHeartRateRow({
      normalizedPayload: {
        context: "workout",
        avgBpm: 145,
        maxBpm: 172,
        minBpm: 118,
        activityType: "running",
        samples: [
          { offsetSec: 0, bpm: 120 },
          { offsetSec: 2700, bpm: 130 }, // 45 min
        ],
        zoneSummary: { z1Min: 0, z2Min: 5, z3Min: 20, z4Min: 15, z5Min: 5 },
      },
    });
    const repo = makeRepo({
      findHeartRateSnapshotById: vi.fn().mockResolvedValue(row),
    });
    const service = new VitalsReadService(repo as never, makeUsersService() as never);
    const result = await service.getWorkoutHeartRateDetail(auth as never, "snap-hr-001");

    expect(result.durationMinutes).toBe(45);
  });
});
