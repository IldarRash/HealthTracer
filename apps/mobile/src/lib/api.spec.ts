import { describe, expect, it, vi, afterEach } from "vitest";
import {
  getActiveNutritionPlan,
  getTodayNutritionAdherence,
  upsertNutritionAdherence,
} from "./api.js";

const token = "test-token";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mobile api helpers", () => {
  it("parses active nutrition plan responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            plan: null,
            activeRevision: null,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await getActiveNutritionPlan(token);

    expect(result.error).toBeUndefined();
    expect(result.data).toEqual({
      plan: null,
      activeRevision: null,
    });
  });

  it("parses today nutrition adherence responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            adherence: {
              id: "880099c6-3b5f-4383-8246-97b72bf61818",
              userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
              date: "2026-05-22",
              hydrationLitersConsumed: 1.5,
              mealCompletion: [{ label: "Breakfast", completed: true }],
              targetCompletion: {
                caloriesOnTarget: true,
                proteinOnTarget: null,
                carbsOnTarget: null,
                fatOnTarget: null,
              },
              notes: [],
              createdAt: "2026-05-22T12:00:00.000Z",
              updatedAt: "2026-05-22T12:00:00.000Z",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await getTodayNutritionAdherence(token);

    expect(result.error).toBeUndefined();
    expect(result.data?.adherence?.hydrationLitersConsumed).toBe(1.5);
  });

  it("rejects invalid adherence payloads before calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      upsertNutritionAdherence(token, "2026-05-22", {
        hydrationLitersConsumed: -1,
      }),
    ).rejects.toThrow();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
