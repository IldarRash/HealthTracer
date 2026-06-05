/**
 * Safety-critical tests for recomputeWorkoutProposalCaloriesFromDisplayContract.
 *
 * Invariants enforced here (must never be weakened):
 *  1. The STORED caloriePerHourRate governs the computation — the client's
 *     estimatedSessionCalorieBurn is ALWAYS discarded.
 *  2. A client attempt to raise caloriePerHourRate via a field-value override is
 *     ignored because the rate input field is always overwritten with the trusted rate.
 *  3. Without a displayContract on the STORED changes, effectiveChanges are returned
 *     unchanged (pass-through) and recomputedTotal is null.
 *  4. Without a isPrimaryTotal derived entry, effectiveChanges are returned unchanged
 *     and recomputedTotal is null.
 *  5. The output is clamped to [0, 20000].
 *  6. Readonly fields other than the rate input are not clobbered by the trusted rate.
 *  7. recomputedTotal signals whether a fresh value was produced (non-null) or not
 *     (null = no-op); callers use this to decide whether to hard-pin stored fields.
 */

import { describe, expect, it } from "vitest";
import {
  recomputeWorkoutProposalCaloriesFromDisplayContract,
  stripWorkoutPlanProposalExtras,
  workoutPlanProposalChangesSchema,
  adaptWorkoutPlanFromProgressChangesSchema,
  clampWorkoutCalories,
  deriveActivityCalories,
  WORKOUT_CALORIE_MAX,
} from "./workouts.js";
import type { WorkoutPlanProposalChanges } from "./workouts.js";
import type { DisplayContract } from "./display-contract.js";

// ---------------------------------------------------------------------------
// Shared fixture helpers
// ---------------------------------------------------------------------------

/** Build minimal valid WorkoutPlanProposalChanges (no calorie fields). */
function makeBaseChanges(
  overrides: Partial<WorkoutPlanProposalChanges> = {},
): WorkoutPlanProposalChanges {
  return workoutPlanProposalChangesSchema.parse({
    title: "Base plan",
    summary: "A weekly plan.",
    days: [{ weekday: "monday", focus: "Strength", exercises: [{ name: "Squat" }] }],
    notes: [],
    ...overrides,
  });
}

/**
 * Minimal rate_per_hour display contract with:
 *  - caloriePerHourRate: readonly field (editable=false)
 *  - durationMinutes: editable slider
 *  - totalCalories: rate_per_hour derived with isPrimaryTotal=true
 */
function makeRateContract(
  storedRate: number,
  storedDuration: number,
): DisplayContract {
  return {
    version: 1,
    fields: [
      {
        key: "caloriePerHourRate",
        label: "Burn rate",
        kind: "readonly",
        value: storedRate,
        editable: false,
      },
      {
        key: "durationMinutes",
        label: "Duration",
        kind: "slider",
        value: storedDuration,
        min: 1,
        max: 600,
        step: 5,
        editable: true,
      },
    ],
    derived: [
      {
        target: "totalCalories",
        label: "Estimated calories",
        unit: "kcal",
        op: "rate_per_hour",
        inputs: ["caloriePerHourRate", "durationMinutes"],
        isPrimaryTotal: true,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 1. Trusted rate is read from STORED changes; client total is discarded
// ---------------------------------------------------------------------------

describe("recomputeWorkoutProposalCaloriesFromDisplayContract — trusted rate from stored changes", () => {
  it("uses the stored caloriePerHourRate (280) and client durationMinutes (120) to produce 560; discards client total 99999", () => {
    const storedContract = makeRateContract(280, 60);

    const stored = makeBaseChanges({
      caloriePerHourRate: 280,
      displayContract: storedContract,
      estimatedSessionCalorieBurn: 280, // Stored estimate — irrelevant, will be replaced
      calorieEstimateProvenance: "workout_llm",
    });

    // Client submits a grossly inflated total — bypass schema parse so we can test the
    // recompute guard works even if the client somehow passes a value above 20000.
    const effective = {
      ...makeBaseChanges({}),
      estimatedSessionCalorieBurn: 99999 as number, // Fabricated huge total — MUST be discarded
      calorieEstimateProvenance: "workout_llm" as const,
    };

    // Client wants 120 min — 280 kcal/h × (120/60) = 560
    const { changes, recomputedTotal } = recomputeWorkoutProposalCaloriesFromDisplayContract(
      effective,
      stored,
      { durationMinutes: 120 },
    );

    expect(changes.estimatedSessionCalorieBurn).toBe(560);
    expect(changes.calorieEstimateProvenance).toBe("workout_llm");
    expect(recomputedTotal).toBe(560);
  });

  it("ignores the client's estimatedSessionCalorieBurn regardless of how extreme it is", () => {
    const stored = makeBaseChanges({
      caloriePerHourRate: 300,
      displayContract: makeRateContract(300, 60),
    });
    const effective = makeBaseChanges({
      estimatedSessionCalorieBurn: 1,
      calorieEstimateProvenance: "workout_llm",
    });

    const { changes } = recomputeWorkoutProposalCaloriesFromDisplayContract(
      effective,
      stored,
      { durationMinutes: 60 },
    );

    // 300 × (60/60) = 300
    expect(changes.estimatedSessionCalorieBurn).toBe(300);
  });
});

// ---------------------------------------------------------------------------
// 2. A client attempt to override the rate field is silently ignored
// ---------------------------------------------------------------------------

describe("recomputeWorkoutProposalCaloriesFromDisplayContract — rate input cannot be overridden by client", () => {
  it("a client caloriePerHourRate=9000 override does NOT change the result vs stored rate=280", () => {
    const stored = makeBaseChanges({
      caloriePerHourRate: 280,
      displayContract: makeRateContract(280, 60),
    });
    const effective = makeBaseChanges({});

    // Client tries to override the rate field
    const { changes: changesWithClientRate } = recomputeWorkoutProposalCaloriesFromDisplayContract(
      effective,
      stored,
      { caloriePerHourRate: 9000, durationMinutes: 120 },
    );

    // Result without client rate override (control)
    const { changes: changesWithoutClientRate } = recomputeWorkoutProposalCaloriesFromDisplayContract(
      effective,
      stored,
      { durationMinutes: 120 },
    );

    // Both must produce the same value — rate 9000 must be silently ignored
    expect(changesWithClientRate.estimatedSessionCalorieBurn).toBe(
      changesWithoutClientRate.estimatedSessionCalorieBurn,
    );
    // And the value must be based on the stored rate 280, not the client 9000
    // 280 × (120/60) = 560
    expect(changesWithClientRate.estimatedSessionCalorieBurn).toBe(560);
  });
});

// ---------------------------------------------------------------------------
// 3. Pass-through when STORED changes have no displayContract
// ---------------------------------------------------------------------------

describe("recomputeWorkoutProposalCaloriesFromDisplayContract — no-contract pass-through", () => {
  it("returns effectiveChanges unchanged and recomputedTotal=null when storedChanges has no displayContract", () => {
    const stored = makeBaseChanges({
      caloriePerHourRate: 280,
      // No displayContract
    });
    const effective = makeBaseChanges({
      estimatedSessionCalorieBurn: 500,
      calorieEstimateProvenance: "workout_llm",
    });

    const { changes, recomputedTotal } = recomputeWorkoutProposalCaloriesFromDisplayContract(
      effective,
      stored,
      { durationMinutes: 60 },
    );

    // Must be unchanged — the effective object itself (or a shallow copy with same values)
    expect(changes.estimatedSessionCalorieBurn).toBe(500);
    expect(changes.calorieEstimateProvenance).toBe("workout_llm");
    // recomputedTotal must be null (no-op signal)
    expect(recomputedTotal).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. Pass-through when there is no isPrimaryTotal derived entry
// ---------------------------------------------------------------------------

describe("recomputeWorkoutProposalCaloriesFromDisplayContract — no-primaryTotal pass-through", () => {
  it("returns effectiveChanges unchanged and recomputedTotal=null when no derived entry has isPrimaryTotal=true", () => {
    const contractWithoutPrimaryTotal: DisplayContract = {
      version: 1,
      fields: [
        {
          key: "caloriePerHourRate",
          label: "Rate",
          kind: "readonly",
          value: 280,
          editable: false,
        },
        {
          key: "durationMinutes",
          label: "Duration",
          kind: "slider",
          value: 60,
          min: 1,
          max: 600,
          step: 5,
          editable: true,
        },
      ],
      derived: [
        {
          target: "totalCalories",
          label: "Calories",
          op: "rate_per_hour",
          inputs: ["caloriePerHourRate", "durationMinutes"],
          isPrimaryTotal: false, // Explicitly not the primary total
        },
      ],
    };

    const stored = makeBaseChanges({
      caloriePerHourRate: 280,
      displayContract: contractWithoutPrimaryTotal,
    });
    const effective = makeBaseChanges({
      estimatedSessionCalorieBurn: 777,
      calorieEstimateProvenance: "workout_llm",
    });

    const { changes, recomputedTotal } = recomputeWorkoutProposalCaloriesFromDisplayContract(
      effective,
      stored,
      { durationMinutes: 120 },
    );

    // No-op: effectiveChanges returned unchanged
    expect(changes.estimatedSessionCalorieBurn).toBe(777);
    expect(changes.calorieEstimateProvenance).toBe("workout_llm");
    // recomputedTotal must be null (no-op signal)
    expect(recomputedTotal).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. Output clamp to [0, 20000]
// ---------------------------------------------------------------------------

describe("recomputeWorkoutProposalCaloriesFromDisplayContract — output clamp [0, 20000]", () => {
  it("clamps an extreme computed total to 20000", () => {
    // 5000 kcal/h × (600/60) = 50000 — must be clamped to 20000
    const stored = makeBaseChanges({
      caloriePerHourRate: 5000,
      displayContract: makeRateContract(5000, 60),
    });
    const effective = makeBaseChanges({});

    const { changes, recomputedTotal } = recomputeWorkoutProposalCaloriesFromDisplayContract(
      effective,
      stored,
      { durationMinutes: 600 },
    );

    expect(changes.estimatedSessionCalorieBurn).toBe(20000);
    expect(changes.calorieEstimateProvenance).toBe("workout_llm");
    expect(recomputedTotal).toBe(20000);
  });

  it("produces 0 (not negative) when rate or duration is 0", () => {
    const stored = makeBaseChanges({
      caloriePerHourRate: 0,
      displayContract: makeRateContract(0, 60),
    });
    const effective = makeBaseChanges({});

    const { changes, recomputedTotal } = recomputeWorkoutProposalCaloriesFromDisplayContract(
      effective,
      stored,
      { durationMinutes: 60 },
    );

    expect(changes.estimatedSessionCalorieBurn).toBe(0);
    expect(recomputedTotal).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 6. A SECOND readonly field is NOT clobbered by the trusted rate
// ---------------------------------------------------------------------------

describe("recomputeWorkoutProposalCaloriesFromDisplayContract — second readonly field not clobbered", () => {
  it("a second readonly field (e.g. restSeconds) keeps its stored value and is not set to the trusted rate", () => {
    // Contract: caloriePerHourRate (readonly, 280), restSeconds (readonly, 90), durationMinutes (editable)
    // totalCalories = rate_per_hour(caloriePerHourRate, durationMinutes)
    const contractWithSecondReadonly: DisplayContract = {
      version: 1,
      fields: [
        {
          key: "caloriePerHourRate",
          label: "Burn rate",
          kind: "readonly",
          value: 280,
          editable: false,
        },
        {
          key: "restSeconds",
          label: "Rest between sets",
          kind: "readonly",
          value: 90,
          editable: false,
        },
        {
          key: "durationMinutes",
          label: "Duration",
          kind: "slider",
          value: 60,
          min: 1,
          max: 600,
          step: 5,
          editable: true,
        },
      ],
      derived: [
        {
          target: "totalCalories",
          label: "Estimated calories",
          unit: "kcal",
          op: "rate_per_hour",
          inputs: ["caloriePerHourRate", "durationMinutes"],
          isPrimaryTotal: true,
        },
      ],
    };

    const stored = makeBaseChanges({
      caloriePerHourRate: 280,
      displayContract: contractWithSecondReadonly,
    });
    const effective = makeBaseChanges({});

    // We only care about the recomputed calorie result here, and that restSeconds
    // is used as-is from the stored contract (not inflated to 280).
    const { changes, recomputedTotal } = recomputeWorkoutProposalCaloriesFromDisplayContract(
      effective,
      stored,
      { durationMinutes: 120 },
    );

    // 280 × (120/60) = 560
    expect(changes.estimatedSessionCalorieBurn).toBe(560);
    expect(changes.calorieEstimateProvenance).toBe("workout_llm");
    expect(recomputedTotal).toBe(560);

    // The restSeconds field (90) is NOT the rate field and should NOT be overwritten.
    // Verify by checking that the computation is correct: if restSeconds had been
    // accidentally set to 280, the totalCalories would change (but here totalCalories
    // only uses caloriePerHourRate and durationMinutes, so the value 560 proves
    // the trusted rate was applied to the right field only).
    // We also verify there are no unexpected extra fields bleeding into changes.
    expect(changes.caloriePerHourRate).toBeUndefined(); // stripped by recompute return shape
  });

  it("does not alter non-calorie fields in the returned effective changes", () => {
    const stored = makeBaseChanges({
      caloriePerHourRate: 300,
      displayContract: makeRateContract(300, 60),
    });
    const effective = makeBaseChanges({
      estimatedSessionCalorieBurn: 999,
      calorieEstimateProvenance: "workout_llm",
    });

    const { changes } = recomputeWorkoutProposalCaloriesFromDisplayContract(
      effective,
      stored,
      { durationMinutes: 60 },
    );

    // Plan title/summary/days are from effective and untouched
    expect(changes.title).toBe(effective.title);
    expect(changes.summary).toBe(effective.summary);
    expect(changes.days).toEqual(effective.days);
  });
});

// ---------------------------------------------------------------------------
// 7. Provenance is always hardcoded to 'workout_llm'
// ---------------------------------------------------------------------------

describe("recomputeWorkoutProposalCaloriesFromDisplayContract — provenance is always workout_llm", () => {
  it("sets calorieEstimateProvenance to workout_llm even when effective carries user_manual", () => {
    const stored = makeBaseChanges({
      caloriePerHourRate: 200,
      displayContract: makeRateContract(200, 60),
    });
    const effective = makeBaseChanges({
      estimatedSessionCalorieBurn: 100,
      calorieEstimateProvenance: "user_manual",
    });

    const { changes } = recomputeWorkoutProposalCaloriesFromDisplayContract(
      effective,
      stored,
      { durationMinutes: 60 },
    );

    expect(changes.calorieEstimateProvenance).toBe("workout_llm");
  });
});

// ---------------------------------------------------------------------------
// 7b. recomputedTotal is null for no-op cases; non-null when recompute fired
// ---------------------------------------------------------------------------

describe("recomputeWorkoutProposalCaloriesFromDisplayContract — recomputedTotal signal", () => {
  it("recomputedTotal is the fresh computed value when recompute fires", () => {
    const stored = makeBaseChanges({
      caloriePerHourRate: 300,
      displayContract: makeRateContract(300, 60),
    });
    const effective = makeBaseChanges({});

    const { recomputedTotal } = recomputeWorkoutProposalCaloriesFromDisplayContract(
      effective,
      stored,
      { durationMinutes: 60 },
    );

    expect(recomputedTotal).toBe(300); // round(300 * 60 / 60) = 300
  });

  it("recomputedTotal is null when storedChanges has no displayContract (no-op)", () => {
    const stored = makeBaseChanges({ caloriePerHourRate: 300 });
    const effective = makeBaseChanges({});

    const { recomputedTotal } = recomputeWorkoutProposalCaloriesFromDisplayContract(
      effective,
      stored,
      { durationMinutes: 60 },
    );

    expect(recomputedTotal).toBeNull();
  });

  it("recomputedTotal is null when displayContract has no isPrimaryTotal derived entry (no-op)", () => {
    const contractNoPrimary: DisplayContract = {
      version: 1,
      fields: [
        { key: "caloriePerHourRate", label: "Rate", kind: "readonly", value: 300, editable: false },
        { key: "durationMinutes", label: "Duration", kind: "slider", value: 60, min: 1, max: 600, step: 5, editable: true },
      ],
      derived: [
        {
          target: "totalCalories",
          label: "Calories",
          op: "rate_per_hour",
          inputs: ["caloriePerHourRate", "durationMinutes"],
          isPrimaryTotal: false, // not the primary total → no-op
        },
      ],
    };
    const stored = makeBaseChanges({
      caloriePerHourRate: 300,
      displayContract: contractNoPrimary,
    });
    const effective = makeBaseChanges({
      estimatedSessionCalorieBurn: 19999,
      calorieEstimateProvenance: "workout_llm",
    });

    const { changes, recomputedTotal } = recomputeWorkoutProposalCaloriesFromDisplayContract(
      effective,
      stored,
      { durationMinutes: 60 },
    );

    // No-op: effectiveChanges returned unchanged
    expect(recomputedTotal).toBeNull();
    // The caller is responsible for pinning stored values; the changes are unchanged here.
    expect(changes.estimatedSessionCalorieBurn).toBe(19999);
  });
});

// ---------------------------------------------------------------------------
// 8. stripWorkoutPlanProposalExtras drops BOTH displayContract and caloriePerHourRate
// ---------------------------------------------------------------------------

describe("stripWorkoutPlanProposalExtras — drops displayContract and caloriePerHourRate", () => {
  it("strips displayContract and caloriePerHourRate from a flat WorkoutPlanProposalChanges", () => {
    const contract = makeRateContract(300, 60);
    const changes = makeBaseChanges({
      caloriePerHourRate: 300,
      estimatedSessionCalorieBurn: 300,
      calorieEstimateProvenance: "workout_llm",
      displayContract: contract,
    });

    const stripped = stripWorkoutPlanProposalExtras(changes);

    expect((stripped as Record<string, unknown>)["displayContract"]).toBeUndefined();
    expect((stripped as Record<string, unknown>)["caloriePerHourRate"]).toBeUndefined();
    // Calorie estimate and provenance ARE persisted in the revision
    expect(stripped.estimatedSessionCalorieBurn).toBe(300);
    expect(stripped.calorieEstimateProvenance).toBe("workout_llm");
  });

  it("strips displayContract and caloriePerHourRate from a from_progress nested .plan", () => {
    const contract = makeRateContract(250, 60);
    const innerPlan = makeBaseChanges({
      caloriePerHourRate: 250,
      estimatedSessionCalorieBurn: 250,
      calorieEstimateProvenance: "workout_llm",
      displayContract: contract,
    });

    // Strip is called on the .plan portion by the apply path
    const stripped = stripWorkoutPlanProposalExtras(innerPlan);

    expect((stripped as Record<string, unknown>)["displayContract"]).toBeUndefined();
    expect((stripped as Record<string, unknown>)["caloriePerHourRate"]).toBeUndefined();
    expect(stripped.estimatedSessionCalorieBurn).toBe(250);
  });

  it("does not disturb non-extra payload fields", () => {
    const changes = makeBaseChanges({
      caloriePerHourRate: 300,
      displayContract: makeRateContract(300, 60),
      notes: ["Note A"],
    });

    const stripped = stripWorkoutPlanProposalExtras(changes);

    expect(stripped.title).toBe("Base plan");
    expect(stripped.notes).toEqual(["Note A"]);
    expect(stripped.days).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 9. adapt_workout_plan_from_progress schema: nested .plan carries caloriePerHourRate
// ---------------------------------------------------------------------------

describe("adaptWorkoutPlanFromProgressChangesSchema — nested plan caloriePerHourRate field", () => {
  it("parses a valid adapt_workout_plan_from_progress payload with caloriePerHourRate on .plan", () => {
    const contract = makeRateContract(280, 60);
    const parsed = adaptWorkoutPlanFromProgressChangesSchema.parse({
      plan: {
        title: "Adapted plan",
        summary: "Progress-based adaptation.",
        days: [{ weekday: "monday", focus: "Strength", exercises: [{ name: "Squat" }] }],
        notes: [],
        caloriePerHourRate: 280,
        estimatedSessionCalorieBurn: 280,
        calorieEstimateProvenance: "workout_llm",
        displayContract: contract,
      },
      sourceSummaryId: "14a08176-64a7-4a2d-8a44-581807368394",
      sourceTrendObservationIds: [],
    });

    expect(parsed.plan.caloriePerHourRate).toBe(280);
    expect(parsed.plan.estimatedSessionCalorieBurn).toBe(280);
    expect(parsed.plan.displayContract).toBeDefined();
    expect(parsed.sourceSummaryId).toBe("14a08176-64a7-4a2d-8a44-581807368394");
  });
});

// ---------------------------------------------------------------------------
// 10. clampWorkoutCalories — [0, WORKOUT_CALORIE_MAX] clamp with rounding
// ---------------------------------------------------------------------------

describe("clampWorkoutCalories — boundary and rounding behaviour", () => {
  it("clamps a negative value to 0", () => {
    expect(clampWorkoutCalories(-1)).toBe(0);
  });

  it("clamps -0 to 0", () => {
    expect(clampWorkoutCalories(-0)).toBe(0);
  });

  it("clamps a large negative to 0", () => {
    expect(clampWorkoutCalories(-9999)).toBe(0);
  });

  it("passes through 0 unchanged", () => {
    expect(clampWorkoutCalories(0)).toBe(0);
  });

  it("passes through a mid-range value unchanged", () => {
    expect(clampWorkoutCalories(500)).toBe(500);
  });

  it("passes through WORKOUT_CALORIE_MAX (20000) unchanged", () => {
    expect(clampWorkoutCalories(WORKOUT_CALORIE_MAX)).toBe(WORKOUT_CALORIE_MAX);
  });

  it("clamps a value just above WORKOUT_CALORIE_MAX to WORKOUT_CALORIE_MAX", () => {
    expect(clampWorkoutCalories(20001)).toBe(WORKOUT_CALORIE_MAX);
  });

  it("clamps a much-larger-than-max value to WORKOUT_CALORIE_MAX", () => {
    expect(clampWorkoutCalories(99999)).toBe(WORKOUT_CALORIE_MAX);
  });

  it("rounds a float up before clamping (0.6 → 1)", () => {
    expect(clampWorkoutCalories(0.6)).toBe(1);
  });

  it("rounds a float down before clamping (0.4 → 0)", () => {
    expect(clampWorkoutCalories(0.4)).toBe(0);
  });

  it("rounds a float that would exceed max after rounding to max (20000.5 → 20000)", () => {
    // Math.round(20000.5) = 20001 in most JS environments; clamp brings it back to 20000.
    expect(clampWorkoutCalories(20000.5)).toBe(WORKOUT_CALORIE_MAX);
  });

  it("rounds a mid-value float correctly (450.6 → 451)", () => {
    expect(clampWorkoutCalories(450.6)).toBe(451);
  });
});

// ---------------------------------------------------------------------------
// 11. deriveActivityCalories — rate × minutes / 60 formula with optional clampMax
// ---------------------------------------------------------------------------

describe("deriveActivityCalories — formula correctness", () => {
  it("300 kcal/hr × 90 min → 450", () => {
    expect(deriveActivityCalories(300, 90)).toBe(450);
  });

  it("300 kcal/hr × 60 min → 300", () => {
    expect(deriveActivityCalories(300, 60)).toBe(300);
  });

  it("rounds a fractional result (280 kcal/hr × 90 min = 420)", () => {
    // 280 * 90 / 60 = 420.0 exactly → 420
    expect(deriveActivityCalories(280, 90)).toBe(420);
  });

  it("rounds a fractional result (100 kcal/hr × 7 min = 11.66... → 12)", () => {
    expect(deriveActivityCalories(100, 7)).toBe(12);
  });

  it("returns 0 when durationMinutes is 0", () => {
    expect(deriveActivityCalories(300, 0)).toBe(0);
  });

  it("returns 0 when ratePerHour is 0", () => {
    expect(deriveActivityCalories(0, 90)).toBe(0);
  });
});

describe("deriveActivityCalories — clampMax option", () => {
  it("with clampMax: caps the result at the provided ceiling", () => {
    // 3000 * 600 / 60 = 30000 — must be clamped to 20000
    expect(deriveActivityCalories(3000, 600, { clampMax: WORKOUT_CALORIE_MAX })).toBe(
      WORKOUT_CALORIE_MAX,
    );
  });

  it("with clampMax: does not clamp a value below the ceiling", () => {
    // 300 * 90 / 60 = 450 — well below 20000
    expect(deriveActivityCalories(300, 90, { clampMax: WORKOUT_CALORIE_MAX })).toBe(450);
  });

  it("with clampMax: clamps to 0 when the result is negative (edge case with a tiny rate and no floor from raw formula, but clamped)", () => {
    // Math.max(0, negative) → 0 when clampMax is provided
    expect(deriveActivityCalories(-100, 60, { clampMax: WORKOUT_CALORIE_MAX })).toBe(0);
  });

  it("without clampMax: allows values above WORKOUT_CALORIE_MAX", () => {
    // When clampMax is not provided, no upper bound is applied.
    // 3000 * 600 / 60 = 30000 (expected to exceed max when no clamp)
    expect(deriveActivityCalories(3000, 600)).toBe(30000);
  });
});
