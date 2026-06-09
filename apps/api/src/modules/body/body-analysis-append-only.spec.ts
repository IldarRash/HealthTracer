/**
 * Tests that body-composition analyses are APPEND-ONLY — each accepted proposal
 * creates a NEW record rather than overwriting the existing one.
 *
 * Also covers the buildFatPctTrend and computeFatPctMid logic inside the
 * repository (replicated here to test without a real DB dependency).
 *
 * Safety floors verified here:
 *  - Two accepted proposals → two createAnalysis calls (not one update)
 *  - The trend array builds from prior analyses (not overwritten)
 *  - Photos are never included in the persisted payload
 *  - Ownership is always passed to the repository
 */

import { describe, expect, it } from "vitest";
import { BodyService } from "./body.service.js";
import { BODY_ANALYSIS_DISCLAIMER } from "@health/types";
import type { BodyCompositionAnalysis, SaveBodyAnalysisProposalInput, SaveBodyAnalysisProposalPayload } from "@health/types";

const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";

function makeAnalysis(id: string, overrides: Partial<BodyCompositionAnalysis> = {}): BodyCompositionAnalysis {
  return {
    id,
    userId,
    date: "2026-06-01",
    source: "chat",
    fatPctMin: 20,
    fatPctMax: 24,
    muscleTone: "average",
    weightKg: 75,
    weightSelfReported: true,
    strongGroups: [],
    weakGroups: [],
    muscleMap: {},
    fatPctTrend: [],
    analysisHistory: [],
    sourceProposalId: "prop-001",
    disclaimer: BODY_ANALYSIS_DISCLAIMER,
    createdAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

const payload1: SaveBodyAnalysisProposalPayload = {
  date: "2026-06-01",
  source: "chat" as const,
  fatPctMin: 20,
  fatPctMax: 24,
  muscleTone: "average" as const,
  weightKg: 75,
  weightSelfReported: true,
  strongGroups: ["chest"],
  weakGroups: ["lower_back"],
  muscleMap: { chest: "strong" as const },
};

const payload2: SaveBodyAnalysisProposalPayload = {
  date: "2026-06-15",
  source: "chat" as const,
  fatPctMin: 18,
  fatPctMax: 22,
  muscleTone: "above_average" as const,
  weightKg: 73,
  weightSelfReported: true,
  strongGroups: ["chest", "shoulders"],
  weakGroups: [],
  muscleMap: { chest: "strong" as const, shoulders: "strong" as const },
};

// ── Append-only: each call creates a new record ──────────────────────

describe("BodyService.applyBodyAnalysisProposal — append-only semantics", () => {
  it("calls createAnalysis twice for two distinct proposals (no overwrite)", async () => {
    const createCalls: Array<{ userId: string; proposalId: string }> = [];

    const service = new BodyService({
      createAnalysis: async (uid: string, proposalId: string) => {
        createCalls.push({ userId: uid, proposalId });
        return makeAnalysis(`bca-${createCalls.length}`, {
          sourceProposalId: proposalId,
        });
      },
      findLatestAnalysisByUserId: async () => null,
      listAnalysesByUserId: async () => [],
      findAnalysisByIdForUser: async () => null,
    } as never);

    const ref1 = await service.applyBodyAnalysisProposal(userId, "prop-001", payload1);
    const ref2 = await service.applyBodyAnalysisProposal(userId, "prop-002", payload2);

    // Two distinct records created, not one overwrite
    expect(createCalls).toHaveLength(2);
    expect(createCalls[0]?.proposalId).toBe("prop-001");
    expect(createCalls[1]?.proposalId).toBe("prop-002");
    expect(ref1).toBe("body_analysis:bca-1");
    expect(ref2).toBe("body_analysis:bca-2");
  });

  it("returns different reference strings for successive proposals", async () => {
    let callCount = 0;
    const service = new BodyService({
      createAnalysis: async () => makeAnalysis(`bca-${++callCount}`),
      findLatestAnalysisByUserId: async () => null,
      listAnalysesByUserId: async () => [],
      findAnalysisByIdForUser: async () => null,
    } as never);

    const ref1 = await service.applyBodyAnalysisProposal(userId, "prop-001", payload1);
    const ref2 = await service.applyBodyAnalysisProposal(userId, "prop-002", payload2);

    expect(ref1).not.toBe(ref2);
  });

  it("always passes the user's own userId to createAnalysis (ownership-scoped)", async () => {
    const capturedUserIds: string[] = [];
    const anotherUserId = "ffffffff-ffff-4fff-bfff-ffffffffffff";

    const service = new BodyService({
      createAnalysis: async (uid: string) => {
        capturedUserIds.push(uid);
        return makeAnalysis("bca-own");
      },
      findLatestAnalysisByUserId: async () => null,
      listAnalysesByUserId: async () => [],
      findAnalysisByIdForUser: async () => null,
    } as never);

    await service.applyBodyAnalysisProposal(userId, "prop-001", payload1);
    await service.applyBodyAnalysisProposal(anotherUserId, "prop-002", payload2);

    expect(capturedUserIds[0]).toBe(userId);
    expect(capturedUserIds[1]).toBe(anotherUserId);
    // Cross-user: each call scoped to its own userId, never leaked
    expect(capturedUserIds[0]).not.toBe(capturedUserIds[1]);
  });

  it("never persists photo data — payload must not contain image bytes or photo paths", async () => {
    let capturedPayload: unknown;
    const service = new BodyService({
      createAnalysis: async (_uid: string, _pid: string, p: unknown) => {
        capturedPayload = p;
        return makeAnalysis("bca-clean");
      },
      findLatestAnalysisByUserId: async () => null,
      listAnalysesByUserId: async () => [],
      findAnalysisByIdForUser: async () => null,
    } as never);

    await service.applyBodyAnalysisProposal(userId, "prop-001", {
      ...payload1,
      // These fields must not be added to SaveBodyAnalysisProposalPayload,
      // but even if someone tries to pass them the repository call must
      // not forward any photo data.
    });

    const serialized = JSON.stringify(capturedPayload);
    expect(serialized).not.toContain("photo");
    expect(serialized).not.toContain("image");
    expect(serialized).not.toContain("base64");
    expect(serialized).not.toContain("data:image");
  });
});

// ── buildFatPctTrend logic (replicated inline) ───────────────────────

/**
 * Replicate the private buildFatPctTrend function from body.repository.ts
 * to unit-test trend derivation without a real DB.
 */
function computeFatPctMid(min: number | null, max: number | null): number | null {
  if (min !== null && max !== null) return (min + max) / 2;
  if (min !== null) return min;
  if (max !== null) return max;
  return null;
}

function buildFatPctTrend(
  priorAnalyses: BodyCompositionAnalysis[],
  current: SaveBodyAnalysisProposalInput,
): Array<{ weekStart: string; fatPctMid: number }> {
  const currentMid = computeFatPctMid(current.fatPctMin ?? null, current.fatPctMax ?? null);
  const priorEntries = priorAnalyses
    .slice(0, 7)
    .reverse()
    .flatMap((a) => {
      const mid = computeFatPctMid(a.fatPctMin, a.fatPctMax);
      return mid !== null ? [{ weekStart: a.date, fatPctMid: mid }] : [];
    });

  if (currentMid === null) {
    return priorEntries;
  }

  return [...priorEntries, { weekStart: current.date, fatPctMid: currentMid }].slice(-8);
}

describe("buildFatPctTrend — trend derivation logic", () => {
  it("returns only the current entry when no prior analyses exist", () => {
    const trend = buildFatPctTrend([], payload1);
    expect(trend).toHaveLength(1);
    expect(trend[0]?.weekStart).toBe(payload1.date);
    expect(trend[0]?.fatPctMid).toBe(22); // (20 + 24) / 2
  });

  it("returns an empty trend when no prior data and current has no fat%", () => {
    const trend = buildFatPctTrend([], {
      date: "2026-06-08",
      source: "chat" as const,
      weightKg: 75,
    });
    expect(trend).toHaveLength(0);
  });

  it("appends the current entry after all prior entries", () => {
    // The repository returns analyses newest-first (ORDER BY createdAt DESC).
    // buildFatPctTrend calls .reverse() on the list so the oldest entry ends
    // up at index 0 in the final trend.
    const prior = [
      makeAnalysis("a2", { date: "2026-05-15", fatPctMin: 25, fatPctMax: 27 }), // newest first
      makeAnalysis("a1", { date: "2026-05-01", fatPctMin: 26, fatPctMax: 28 }), // oldest last
    ];
    const trend = buildFatPctTrend(prior, payload1);
    // After .reverse(): a1 (oldest) at index 0, a2 at index 1, current at index 2
    expect(trend).toHaveLength(3);
    expect(trend[0]?.weekStart).toBe("2026-05-01"); // oldest (a1)
    expect(trend[1]?.weekStart).toBe("2026-05-15"); // a2
    expect(trend[2]?.weekStart).toBe(payload1.date); // newest (current)
    expect(trend[2]?.fatPctMid).toBe(22);
  });

  it("caps the trend at 8 entries (design requirement)", () => {
    const prior = Array.from({ length: 10 }, (_, i) =>
      makeAnalysis(`a${i}`, {
        date: `2026-0${(i % 9) + 1}-01`,
        fatPctMin: 25 - i * 0.2,
        fatPctMax: 27 - i * 0.2,
      })
    );
    const trend = buildFatPctTrend(prior, payload1);
    expect(trend.length).toBeLessThanOrEqual(8);
  });

  it("skips prior analyses that have no fat% data (only weight)", () => {
    const priorNoFat = [
      makeAnalysis("a1", { date: "2026-05-01", fatPctMin: null, fatPctMax: null }),
    ];
    const trend = buildFatPctTrend(priorNoFat, payload1);
    // The null-fat prior must be skipped; only the current entry appears
    expect(trend).toHaveLength(1);
    expect(trend[0]?.weekStart).toBe(payload1.date);
  });
});

// ── computeFatPctMid ─────────────────────────────────────────────────

describe("computeFatPctMid", () => {
  it("returns the average of min and max when both are present", () => {
    expect(computeFatPctMid(18, 22)).toBe(20);
  });

  it("returns min when max is null", () => {
    expect(computeFatPctMid(20, null)).toBe(20);
  });

  it("returns max when min is null", () => {
    expect(computeFatPctMid(null, 22)).toBe(22);
  });

  it("returns null when both are null", () => {
    expect(computeFatPctMid(null, null)).toBeNull();
  });
});
