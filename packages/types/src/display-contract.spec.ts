import { describe, expect, it } from "vitest";
import {
  clampFieldValue,
  computeDerivedValues,
  displayContractSchema,
  type DisplayContract,
  type DisplayField,
} from "./display-contract.js";

// ---------------------------------------------------------------------------
// displayContractSchema validation
// ---------------------------------------------------------------------------

describe("displayContractSchema", () => {
  const minimalField = {
    key: "durationMinutes",
    label: "Duration",
    kind: "slider" as const,
    value: 60,
    min: 1,
    max: 600,
    step: 5,
    editable: true,
  };

  it("accepts a valid minimal contract", () => {
    const result = displayContractSchema.safeParse({
      version: 1,
      fields: [minimalField],
      derived: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects duplicate field keys", () => {
    const result = displayContractSchema.safeParse({
      version: 1,
      fields: [minimalField, { ...minimalField }],
      derived: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a derived entry referencing a non-existent input key", () => {
    const result = displayContractSchema.safeParse({
      version: 1,
      fields: [minimalField],
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
    });
    // caloriePerHourRate is not in fields
    expect(result.success).toBe(false);
  });

  it("rejects more than one isPrimaryTotal", () => {
    const rateField = {
      key: "caloriePerHourRate",
      label: "Burn rate",
      kind: "readonly" as const,
      value: 400,
      editable: false,
    };
    const result = displayContractSchema.safeParse({
      version: 1,
      fields: [rateField, minimalField],
      derived: [
        {
          target: "totalCalories",
          label: "Calories",
          op: "rate_per_hour",
          inputs: ["caloriePerHourRate", "durationMinutes"],
          isPrimaryTotal: true,
        },
        {
          target: "alsoTotal",
          label: "Also total",
          op: "multiply",
          inputs: ["caloriePerHourRate"],
          isPrimaryTotal: true,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("requires value for slider kind", () => {
    const result = displayContractSchema.safeParse({
      version: 1,
      fields: [{ key: "x", label: "X", kind: "slider", editable: true }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects min > max", () => {
    const result = displayContractSchema.safeParse({
      version: 1,
      fields: [{ key: "x", label: "X", kind: "slider", value: 10, min: 100, max: 1, editable: true }],
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeDerivedValues
// ---------------------------------------------------------------------------

describe("computeDerivedValues", () => {
  const contract: DisplayContract = {
    version: 1,
    fields: [
      { key: "caloriePerHourRate", label: "Rate", kind: "readonly", value: 400, editable: false },
      { key: "durationMinutes", label: "Duration", kind: "slider", value: 60, min: 1, max: 600, step: 5, editable: true },
    ],
    derived: [
      {
        target: "totalCalories",
        label: "Calories",
        unit: "kcal",
        op: "rate_per_hour",
        inputs: ["caloriePerHourRate", "durationMinutes"],
        isPrimaryTotal: true,
      },
    ],
  };

  it("computes rate_per_hour: 400 kcal/h × 60 min = 400", () => {
    const result = computeDerivedValues(contract, {
      caloriePerHourRate: 400,
      durationMinutes: 60,
    });
    expect(result.totalCalories).toBe(400);
  });

  it("computes rate_per_hour: 400 kcal/h × 30 min = 200", () => {
    const result = computeDerivedValues(contract, {
      caloriePerHourRate: 400,
      durationMinutes: 30,
    });
    expect(result.totalCalories).toBe(200);
  });

  it("defaults missing field values to 0", () => {
    const result = computeDerivedValues(contract, {});
    expect(result.totalCalories).toBe(0);
  });

  it("computes multiply op", () => {
    const c: DisplayContract = {
      version: 1,
      fields: [
        { key: "a", label: "A", kind: "number", value: 3, editable: true },
        { key: "b", label: "B", kind: "number", value: 4, editable: true },
      ],
      derived: [
        { target: "product", label: "Product", op: "multiply", inputs: ["a", "b"], isPrimaryTotal: false },
      ],
    };
    expect(computeDerivedValues(c, { a: 3, b: 4 }).product).toBe(12);
  });

  it("computes sum op", () => {
    const c: DisplayContract = {
      version: 1,
      fields: [
        { key: "a", label: "A", kind: "number", value: 5, editable: true },
        { key: "b", label: "B", kind: "number", value: 3, editable: true },
      ],
      derived: [
        { target: "total", label: "Total", op: "sum", inputs: ["a", "b"], isPrimaryTotal: true },
      ],
    };
    expect(computeDerivedValues(c, { a: 5, b: 3 }).total).toBe(8);
  });

  it("computes subtract op", () => {
    const c: DisplayContract = {
      version: 1,
      fields: [
        { key: "a", label: "A", kind: "number", value: 10, editable: true },
        { key: "b", label: "B", kind: "number", value: 3, editable: true },
      ],
      derived: [
        { target: "diff", label: "Diff", op: "subtract", inputs: ["a", "b"], isPrimaryTotal: false },
      ],
    };
    expect(computeDerivedValues(c, { a: 10, b: 3 }).diff).toBe(7);
  });

  it("chains derived outputs as inputs to subsequent derived entries", () => {
    const c: DisplayContract = {
      version: 1,
      fields: [
        { key: "rate", label: "Rate", kind: "readonly", value: 300, editable: false },
        { key: "minutes", label: "Minutes", kind: "slider", value: 90, min: 1, max: 600, step: 5, editable: true },
      ],
      derived: [
        {
          target: "rawCalories",
          label: "Raw calories",
          op: "rate_per_hour",
          inputs: ["rate", "minutes"],
          isPrimaryTotal: false,
        },
        {
          target: "roundedCalories",
          label: "Rounded",
          op: "multiply",
          inputs: ["rawCalories"],
          isPrimaryTotal: true,
        },
      ],
    };
    const result = computeDerivedValues(c, { rate: 300, minutes: 90 });
    // 300 * (90/60) = 450; multiply of [450] = 450
    expect(result.rawCalories).toBe(450);
    expect(result.roundedCalories).toBe(450);
  });
});

// ---------------------------------------------------------------------------
// clampFieldValue
// ---------------------------------------------------------------------------

describe("clampFieldValue", () => {
  const editableField: DisplayField = {
    key: "durationMinutes",
    label: "Duration",
    kind: "slider",
    value: 60,
    min: 1,
    max: 600,
    step: 5,
    editable: true,
  };

  const readonlyField: DisplayField = {
    key: "caloriePerHourRate",
    label: "Rate",
    kind: "readonly",
    value: 400,
    editable: false,
  };

  it("returns submitted value when within bounds", () => {
    expect(clampFieldValue(editableField, 120)).toBe(120);
  });

  it("clamps below min to min", () => {
    expect(clampFieldValue(editableField, 0)).toBe(1);
  });

  it("clamps above max to max", () => {
    expect(clampFieldValue(editableField, 999)).toBe(600);
  });

  it("returns stored value when editable=false (ignores submitted)", () => {
    expect(clampFieldValue(readonlyField, 9999)).toBe(400);
  });

  it("returns 0 when editable=false and no stored value (never echoes client input)", () => {
    const f: DisplayField = { key: "x", label: "X", kind: "readonly", editable: false };
    expect(clampFieldValue(f, 123)).toBe(0);
  });
});
