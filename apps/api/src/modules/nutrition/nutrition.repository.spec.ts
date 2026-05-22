import { SQL } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { buildAdherenceConflictSet } from "./nutrition.repository.js";

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
