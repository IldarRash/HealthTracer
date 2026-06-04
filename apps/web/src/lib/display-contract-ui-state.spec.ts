import { describe, expect, it } from "vitest";
import {
  buildContractAcceptOverride,
  parseDisplayContract,
} from "./display-contract-ui-state";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const validContractPayload = {
  version: 1 as const,
  title: "Volleyball activity",
  fields: [
    {
      key: "caloriePerHourRate",
      label: "Burn rate",
      kind: "readonly" as const,
      value: 400,
      editable: false,
    },
    {
      key: "durationMinutes",
      label: "Duration",
      kind: "slider" as const,
      value: 90,
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
      op: "rate_per_hour" as const,
      inputs: ["caloriePerHourRate", "durationMinutes"],
      isPrimaryTotal: true,
    },
  ],
};

const validProposedChanges = {
  intent: "log_workout_activity",
  displayContract: validContractPayload,
};

// ---------------------------------------------------------------------------
// parseDisplayContract
// ---------------------------------------------------------------------------

describe("parseDisplayContract", () => {
  it("parses a valid displayContract from proposedChanges", () => {
    const result = parseDisplayContract(validProposedChanges);
    expect(result).not.toBeNull();
    expect(result?.version).toBe(1);
    expect(result?.fields).toHaveLength(2);
  });

  it("returns null when proposedChanges is null", () => {
    expect(parseDisplayContract(null)).toBeNull();
  });

  it("returns null when proposedChanges has no displayContract key", () => {
    expect(parseDisplayContract({ intent: "something_else" })).toBeNull();
  });

  it("returns null when displayContract is invalid (wrong version)", () => {
    expect(
      parseDisplayContract({
        displayContract: { version: 2, fields: [], derived: [] },
      }),
    ).toBeNull();
  });

  it("returns null when displayContract is a non-object primitive", () => {
    expect(parseDisplayContract({ displayContract: "bad" })).toBeNull();
  });

  it("round-trips a valid contract through parse", () => {
    const result = parseDisplayContract(validProposedChanges);
    expect(result?.fields[0]?.key).toBe("caloriePerHourRate");
    expect(result?.fields[1]?.key).toBe("durationMinutes");
    expect(result?.derived[0]?.isPrimaryTotal).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildContractAcceptOverride
// ---------------------------------------------------------------------------

describe("buildContractAcceptOverride", () => {
  it("returns null when proposedChanges has no displayContract", () => {
    expect(
      buildContractAcceptOverride({ intent: "something_else" }, { durationMinutes: 60 }),
    ).toBeNull();
  });

  it("returns null when proposedChanges is null", () => {
    expect(buildContractAcceptOverride(null, {})).toBeNull();
  });

  it("writes editable field values into the override", () => {
    const result = buildContractAcceptOverride(validProposedChanges, {
      durationMinutes: 120,
    }) as Record<string, unknown>;

    expect(result).not.toBeNull();
    const dc = result.displayContract as {
      fields: Array<{ key: string; value?: number; editable: boolean }>;
    };
    const durationField = dc.fields.find((f) => f.key === "durationMinutes");
    expect(durationField?.value).toBe(120);
  });

  it("does NOT overwrite non-editable (readonly) field values", () => {
    // Even if caller passes a value for caloriePerHourRate, it must be unchanged
    const result = buildContractAcceptOverride(validProposedChanges, {
      caloriePerHourRate: 9999,
      durationMinutes: 60,
    }) as Record<string, unknown>;

    const dc = result?.displayContract as {
      fields: Array<{ key: string; value?: number; editable: boolean }>;
    };
    const rateField = dc.fields.find((f) => f.key === "caloriePerHourRate");
    // Must stay at stored value 400, not 9999
    expect(rateField?.value).toBe(400);
  });

  it("does NOT include or set any derived total field", () => {
    const result = buildContractAcceptOverride(validProposedChanges, {
      durationMinutes: 90,
    }) as Record<string, unknown>;

    const dc = result?.displayContract as {
      fields: Array<{ key: string }>;
    };
    // derived target totalCalories must not appear in fields
    const hasTotal = dc.fields.some((f) => f.key === "totalCalories");
    expect(hasTotal).toBe(false);
  });

  it("preserves other top-level keys from proposedChanges", () => {
    const result = buildContractAcceptOverride(validProposedChanges, {
      durationMinutes: 60,
    }) as Record<string, unknown>;

    expect(result?.intent).toBe("log_workout_activity");
  });

  it("leaves editable field unchanged when no fieldValues entry provided for it", () => {
    const result = buildContractAcceptOverride(validProposedChanges, {}) as Record<
      string,
      unknown
    >;
    const dc = result?.displayContract as {
      fields: Array<{ key: string; value?: number }>;
    };
    const durationField = dc.fields.find((f) => f.key === "durationMinutes");
    // Falls back to stored value of 90 (original)
    expect(durationField?.value).toBe(90);
  });
});
