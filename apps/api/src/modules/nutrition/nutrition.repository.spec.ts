import { SQL } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { buildAdherenceConflictSet, NutritionRepository } from "./nutrition.repository.js";

function isSqlValue(value: unknown): value is SQL {
  return value instanceof SQL;
}

describe("buildAdherenceConflictSet", () => {
  it("assigns provided scalar and array fields directly on conflict", () => {
    const set = buildAdherenceConflictSet({
      hydrationLitersConsumed: 2.5,
      mealCompletion: [{ label: "Breakfast", completed: true }],
      notes: ["Felt good"],
    });

    expect(set.hydrationLitersConsumed).toBe(2.5);
    expect(set.mealCompletion).toEqual([{ label: "Breakfast", completed: true }]);
    expect(set.notes).toEqual(["Felt good"]);
    expect(isSqlValue(set.targetCompletion)).toBe(true);
    expect(set.updatedAt).toBeInstanceOf(Date);
  });

  it("preserves existing columns when input omits fields", () => {
    const set = buildAdherenceConflictSet({
      hydrationLitersConsumed: 1,
    });

    expect(set.hydrationLitersConsumed).toBe(1);
    expect(isSqlValue(set.mealCompletion)).toBe(true);
    expect(isSqlValue(set.targetCompletion)).toBe(true);
    expect(isSqlValue(set.notes)).toBe(true);
  });

  it("merges target completion with jsonb concatenation on conflict", () => {
    const set = buildAdherenceConflictSet({
      targetCompletion: { proteinOnTarget: true },
    });

    expect(isSqlValue(set.targetCompletion)).toBe(true);
    expect(isSqlValue(set.hydrationLitersConsumed)).toBe(true);
    expect(isSqlValue(set.mealCompletion)).toBe(true);
    expect(isSqlValue(set.notes)).toBe(true);
  });
});

describe("NutritionRepository.createIncident", () => {
  const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
  const sourceProposalId = "14a08176-64a7-4a2d-8a44-581807368394";
  const payload = {
    incidentDateTime: "2026-05-26T18:00:00.000Z",
    items: [{ name: "Pizza slice", calories: 280 }],
    estimatedCalories: 280,
    estimatedMacros: { proteinGrams: 12, carbsGrams: 30, fatGrams: 10 },
    confidence: "medium" as const,
    provenance: { source: "text_estimate" as const, providerId: "chat_trigger" },
    imageRefs: [],
  };

  function makeInsertMock(capturedValues: { date?: string }) {
    return vi.fn(() => ({
      values: vi.fn((values: Record<string, unknown>) => {
        capturedValues.date = values["date"] as string;
        return {
          returning: vi.fn(async () => [{ id: "incident-1", userId, sourceProposalId }]),
        };
      }),
    }));
  }

  it("inserts through the passed transaction client instead of the root db pool", async () => {
    const rootInsert = vi.fn();
    const capturedValues = {};
    const txInsert = makeInsertMock(capturedValues);

    const tx = { insert: txInsert, marker: "acceptance-tx" };
    const db = { insert: rootInsert };

    const repository = new NutritionRepository(db as never);

    const row = await repository.createIncident(userId, sourceProposalId, payload, tx as never);

    expect(row.id).toBe("incident-1");
    expect(txInsert).toHaveBeenCalledOnce();
    expect(rootInsert).not.toHaveBeenCalled();
  });

  it("derives incidentDate in UTC when no timezone is provided", async () => {
    // 2026-05-26T23:30:00Z is May 26 in UTC
    const nearMidnightUtcPayload = {
      ...payload,
      incidentDateTime: "2026-05-26T23:30:00.000Z",
    };
    const capturedValues: { date?: string } = {};
    const db = { insert: makeInsertMock(capturedValues) };
    const repository = new NutritionRepository(db as never);

    await repository.createIncident(userId, sourceProposalId, nearMidnightUtcPayload);

    expect(capturedValues.date).toBe("2026-05-26");
  });

  it("derives incidentDate in the user's local day when timezone is provided", async () => {
    // 2026-05-26T23:30:00Z is already May 27 in Asia/Tokyo (UTC+9)
    const nearMidnightUtcPayload = {
      ...payload,
      incidentDateTime: "2026-05-26T23:30:00.000Z",
    };
    const capturedValues: { date?: string } = {};
    const db = { insert: makeInsertMock(capturedValues) };
    const repository = new NutritionRepository(db as never);

    await repository.createIncident(
      userId,
      sourceProposalId,
      nearMidnightUtcPayload,
      db as never,
      "Asia/Tokyo",
    );

    expect(capturedValues.date).toBe("2026-05-27");
  });

  it("falls back to the UTC date when the provided timezone is invalid", async () => {
    const nearMidnightUtcPayload = {
      ...payload,
      incidentDateTime: "2026-05-26T23:30:00.000Z",
    };
    const capturedValues: { date?: string } = {};
    const db = { insert: makeInsertMock(capturedValues) };
    const repository = new NutritionRepository(db as never);

    // formatIsoDateInTimezone falls back to UTC on invalid timezone
    await repository.createIncident(
      userId,
      sourceProposalId,
      nearMidnightUtcPayload,
      db as never,
      "Bad/Timezone",
    );

    expect(capturedValues.date).toBe("2026-05-26");
  });
});

// ─── findActivePlanByUserId — no ambiguous ORDER BY ─────────────────────────

describe("NutritionRepository.findActivePlanByUserId", () => {
  const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";

  it("returns null when no active plan exists for the user", async () => {
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => []),
          })),
        })),
      })),
    };

    const repository = new NutritionRepository(db as never);
    const result = await repository.findActivePlanByUserId(userId);
    expect(result).toBeNull();
  });

  it("returns the plan row when exactly one active plan exists", async () => {
    const planRow = {
      id: "plan-1",
      userId,
      activeRevisionId: "rev-1",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [planRow]),
          })),
        })),
      })),
    };

    const repository = new NutritionRepository(db as never);
    const result = await repository.findActivePlanByUserId(userId);
    expect(result).toEqual(planRow);
  });
});
