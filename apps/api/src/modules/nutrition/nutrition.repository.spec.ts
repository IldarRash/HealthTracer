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

  it("inserts through the passed transaction client instead of the root db pool", async () => {
    const rootInsert = vi.fn();
    const txInsert = vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => [
          {
            id: "incident-1",
            userId,
            sourceProposalId,
          },
        ]),
      })),
    }));

    const tx = { insert: txInsert, marker: "acceptance-tx" };
    const db = { insert: rootInsert };

    const repository = new NutritionRepository(db as never);

    const row = await repository.createIncident(userId, sourceProposalId, payload, tx as never);

    expect(row.id).toBe("incident-1");
    expect(txInsert).toHaveBeenCalledOnce();
    expect(rootInsert).not.toHaveBeenCalled();
  });
});
